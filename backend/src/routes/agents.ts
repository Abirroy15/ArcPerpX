import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { redis } from "../cache";
import { eventBus } from "../websocket/server";
import axios from "axios";

export const agentRoutes = new Hono();

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://localhost:8000";

// ── Schemas ───────────────────────────────────────────────────────────────

const CreateAgentSchema = z.object({
  name: z.string().min(1).max(50),
  strategyType: z.enum(["MOMENTUM", "MEAN_REVERSION", "TREND_FOLLOWING", "MARKET_MAKING", "CUSTOM"]),
  riskTolerance: z.number().min(0).max(1),     // 0 = ultra safe, 1 = degen
  mutationRate: z.number().min(0).max(1),       // how fast it evolves
  timeHorizon: z.enum(["SCALP", "INTRADAY", "SWING"]),
  market: z.string().default("ETH-USD"),
  maxPositionSize: z.number().positive(),
  maxLeverage: z.number().min(1).max(50).default(10),
  isPublic: z.boolean().default(false),
  copyFee: z.number().min(0).default(0),        // USDC per 30 days
});

const TrainAgentSchema = z.object({
  agentId: z.string(),
  epochs: z.number().min(1).max(100).default(10),
  rewardFunction: z.enum(["SHARPE", "SORTINO", "RAW_PNL", "WIN_RATE"]).default("SHARPE"),
  marketData: z.enum(["LIVE", "BACKTEST_30D", "BACKTEST_90D"]).default("BACKTEST_30D"),
});

const BreedAgentsSchema = z.object({
  parent1Id: z.string(),
  parent2Id: z.string(),
  childName: z.string().min(1).max(50),
  mutationBoost: z.number().min(0).max(0.5).default(0.1),
});

// ── POST /api/agents ──────────────────────────────────────────────────────

agentRoutes.post("/", zValidator("json", CreateAgentSchema), async (c) => {
  const body = c.req.valid("json");
  const ownerAddress = c.req.header("X-Wallet-Address");
  if (!ownerAddress) return c.json({ error: "Wallet address required" }, 401);

  // Generate initial strategy DNA via AI engine
  const dnaResponse = await axios.post(`${AI_ENGINE_URL}/generate-dna`, {
    strategy_type: body.strategyType,
    risk_tolerance: body.riskTolerance,
    time_horizon: body.timeHorizon,
    market: body.market,
  });

  const dna = dnaResponse.data;

  const agent = await db.agent.create({
    data: {
      owner: ownerAddress,
      name: body.name,
      strategyType: body.strategyType,
      riskTolerance: body.riskTolerance,
      mutationRate: body.mutationRate,
      timeHorizon: body.timeHorizon,
      market: body.market,
      maxPositionSize: body.maxPositionSize,
      maxLeverage: body.maxLeverage,
      isPublic: body.isPublic,
      copyFee: body.copyFee,
      strategyHash: dna.strategy_hash,
      dnaVector: JSON.stringify(dna.vector),
      generation: 0,
      status: "ACTIVE",
      stats: {
        create: {
          totalTrades: 0,
          winningTrades: 0,
          totalPnl: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          xpPoints: 0,
        },
      },
    },
    include: { stats: true },
  });

  eventBus.emit("agent", {
    event: "created",
    agentId: agent.id,
    owner: ownerAddress,
    name: agent.name,
  });

  return c.json({ success: true, agent }, 201);
});

// ── POST /api/agents/train ────────────────────────────────────────────────

agentRoutes.post("/train", zValidator("json", TrainAgentSchema), async (c) => {
  const body = c.req.valid("json");
  const ownerAddress = c.req.header("X-Wallet-Address");

  const agent = await db.agent.findUnique({
    where: { id: body.agentId },
    include: { stats: true },
  });

  if (!agent) return c.json({ error: "Agent not found" }, 404);
  if (agent.owner !== ownerAddress) return c.json({ error: "Not owner" }, 403);
  if (agent.status !== "ACTIVE") return c.json({ error: "Agent not active" }, 400);

  // Check rate limit (max 3 training sessions per 24h)
  const trainKey = `train_limit:${body.agentId}`;
  const trainCount = await redis.incr(trainKey);
  if (trainCount === 1) await redis.expire(trainKey, 86400);
  if (trainCount > 3) {
    const ttl = await redis.ttl(trainKey);
    return c.json({ error: `Rate limit: 3 sessions per day. Try again in ${ttl}s` }, 429);
  }

  // Kick off async training in AI engine
  const trainingJob = await axios.post(`${AI_ENGINE_URL}/train`, {
    agent_id: body.agentId,
    dna_vector: JSON.parse(agent.dnaVector as string),
    epochs: body.epochs,
    reward_function: body.rewardFunction,
    market_data: body.marketData,
    strategy_type: agent.strategyType,
    risk_tolerance: agent.riskTolerance,
    current_stats: agent.stats,
  });

  await db.agent.update({
    where: { id: body.agentId },
    data: { status: "TRAINING", lastTrainingAt: new Date() },
  });

  return c.json({
    success: true,
    jobId: trainingJob.data.job_id,
    estimatedDuration: trainingJob.data.estimated_seconds,
    message: "Training started. Agent will evolve when complete.",
  });
});

// ── POST /api/agents/breed ────────────────────────────────────────────────

agentRoutes.post("/breed", zValidator("json", BreedAgentsSchema), async (c) => {
  const body = c.req.valid("json");
  const ownerAddress = c.req.header("X-Wallet-Address");

  const [p1, p2] = await Promise.all([
    db.agent.findUnique({ where: { id: body.parent1Id }, include: { stats: true } }),
    db.agent.findUnique({ where: { id: body.parent2Id }, include: { stats: true } }),
  ]);

  if (!p1 || !p2) return c.json({ error: "Parent agent not found" }, 404);
  if (p1.owner !== ownerAddress) return c.json({ error: "Must own parent1" }, 403);
  if (p1.status !== "ACTIVE" || p2.status !== "ACTIVE") {
    return c.json({ error: "Both parents must be active" }, 400);
  }

  // AI engine performs DNA crossover + mutation
  const breedResult = await axios.post(`${AI_ENGINE_URL}/breed`, {
    parent1_dna: JSON.parse(p1.dnaVector as string),
    parent2_dna: JSON.parse(p2.dnaVector as string),
    parent1_stats: p1.stats,
    parent2_stats: p2.stats,
    mutation_boost: body.mutationBoost,
  });

  const childDna = breedResult.data;
  const childGeneration = Math.max(p1.generation, p2.generation) + 1;

  const childAgent = await db.agent.create({
    data: {
      owner: ownerAddress,
      name: body.childName,
      strategyType: p1.stats!.totalPnl > p2.stats!.totalPnl ? p1.strategyType : p2.strategyType,
      riskTolerance: (p1.riskTolerance + p2.riskTolerance) / 2,
      mutationRate: (p1.mutationRate + p2.mutationRate) / 2 + body.mutationBoost,
      timeHorizon: p1.timeHorizon,
      market: p1.market,
      maxPositionSize: Math.min(p1.maxPositionSize, p2.maxPositionSize),
      maxLeverage: Math.min(p1.maxLeverage, p2.maxLeverage),
      isPublic: false,
      copyFee: 0,
      strategyHash: childDna.strategy_hash,
      dnaVector: JSON.stringify(childDna.vector),
      generation: childGeneration,
      parent1Id: p1.id,
      parent2Id: p2.id,
      status: "ACTIVE",
      stats: { create: { totalTrades: 0, winningTrades: 0, totalPnl: 0, sharpeRatio: 0, maxDrawdown: 0, xpPoints: 0 } },
    },
    include: { stats: true },
  });

  eventBus.emit("agent", {
    event: "bred",
    childId: childAgent.id,
    parent1Id: p1.id,
    parent2Id: p2.id,
    generation: childGeneration,
  });

  return c.json({ success: true, child: childAgent }, 201);
});

// ── GET /api/agents/performance/:agentId ─────────────────────────────────

agentRoutes.get("/performance/:agentId", async (c) => {
  const agentId = c.req.param("agentId");

  const [agent, trades] = await Promise.all([
    db.agent.findUnique({ where: { id: agentId }, include: { stats: true } }),
    db.agentTrade.findMany({ where: { agentId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  if (!agent) return c.json({ error: "Not found" }, 404);

  // Compute analytics
  const pnlSeries = trades.map((t) => t.pnl);
  const winRate = agent.stats!.totalTrades > 0
    ? (agent.stats!.winningTrades / agent.stats!.totalTrades) * 100
    : 0;

  return c.json({
    agent,
    performance: {
      totalTrades: agent.stats!.totalTrades,
      winRate: winRate.toFixed(2),
      totalPnl: agent.stats!.totalPnl,
      sharpeRatio: agent.stats!.sharpeRatio,
      maxDrawdown: agent.stats!.maxDrawdown,
      xpPoints: agent.stats!.xpPoints,
      tier: getTier(agent.stats!.xpPoints),
    },
    recentTrades: trades.slice(0, 20),
    pnlCurve: pnlSeries,
  });
});

// ── GET /api/agents/marketplace ───────────────────────────────────────────

agentRoutes.get("/marketplace", async (c) => {
  const sort = c.req.query("sort") || "sharpe";
  const limit = Number(c.req.query("limit") || 20);

  const agents = await db.agent.findMany({
    where: { isPublic: true, status: "ACTIVE" },
    include: { stats: true },
    orderBy: sort === "sharpe"
      ? { stats: { sharpeRatio: "desc" } }
      : sort === "pnl"
      ? { stats: { totalPnl: "desc" } }
      : { stats: { xpPoints: "desc" } },
    take: limit,
  });

  return c.json({ agents });
});

// ── GET /api/agents/:address ──────────────────────────────────────────────

agentRoutes.get("/:address", async (c) => {
  const address = c.req.param("address");

  const agents = await db.agent.findMany({
    where: { owner: address },
    include: { stats: true },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ agents });
});

// ── Helpers ───────────────────────────────────────────────────────────────

function getTier(xp: number): string {
  if (xp >= 100_000) return "LEGEND";
  if (xp >= 25_000) return "SENTINEL";
  if (xp >= 5_000) return "EXPERT";
  if (xp >= 1_000) return "TRADER";
  return "APPRENTICE";
}
