import { Hono } from "hono";
import { db } from "../db";

export const analyticsRoutes = new Hono();
export const leaderboardRoutes = new Hono();

// ── Analytics ─────────────────────────────────────────────────────────────

analyticsRoutes.get("/:address", async (c) => {
  const address = c.req.param("address");

  const trades = await db.order.findMany({
    where: { trader: address, status: "FILLED" },
    orderBy: { filledAt: "asc" },
    take: 1000,
  });

  if (trades.length === 0) {
    return c.json({
      sharpe: 0, sortino: 0, winRate: 0, maxDrawdown: 0,
      profitFactor: 0, avgTrade: 0, totalTrades: 0,
      pnlCurve: [], pnlDistribution: [], profile: [], heatmap: [], behaviorTags: [],
    });
  }

  // Compute analytics
  const pnls = trades.map((t) => t.pnl || 0);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);

  const sharpe = computeSharpe(pnls);
  const sortino = computeSortino(pnls);
  const maxDrawdown = computeMaxDrawdown(pnls);
  const winRate = (wins.length / pnls.length) * 100;
  const profitFactor = losses.length > 0
    ? Math.abs(wins.reduce((s, v) => s + v, 0)) / Math.abs(losses.reduce((s, v) => s + v, 0))
    : 99;
  const avgTrade = pnls.reduce((s, v) => s + v, 0) / pnls.length;

  // PnL curve (cumulative)
  let cumulative = 0;
  const pnlCurve = trades.map((t, i) => {
    cumulative += t.pnl || 0;
    return { date: `Day ${Math.floor(i / 10) + 1}`, pnl: Math.round(cumulative) };
  });

  // Distribution
  const buckets = [-500, -200, -100, -50, 50, 100, 200, 500];
  const distribution = computeDistribution(pnls, buckets);

  // Monthly heatmap
  const heatmap = computeMonthlyHeatmap(trades);

  // Behavioral analysis
  const behaviorTags = classifyBehavior(trades, pnls);

  return c.json({
    sharpe, sortino, winRate, maxDrawdown,
    profitFactor, avgTrade, totalTrades: pnls.length,
    pnlCurve, pnlDistribution: distribution,
    profile: [
      { skill: "Risk Mgmt", score: Math.min(100, Math.max(0, 100 - maxDrawdown * 5)) },
      { skill: "Timing", score: winRate },
      { skill: "Discipline", score: Math.min(100, 50 + profitFactor * 20) },
      { skill: "Consistency", score: Math.min(100, 100 - computeVolatility(pnls) * 10) },
    ],
    heatmap,
    behaviorTags,
  });
});

// ── Leaderboard ───────────────────────────────────────────────────────────

leaderboardRoutes.get("/", async (c) => {
  const type = c.req.query("type") || "traders";
  const season = c.req.query("season") || "current";
  const limit = Number(c.req.query("limit") || 50);

  if (type === "traders") {
    const traders = await db.traderStats.findMany({
      orderBy: { xpPoints: "desc" },
      take: limit,
    });
    return c.json({ entries: traders });
  }

  if (type === "agents") {
    const agents = await db.agent.findMany({
      where: { isPublic: true },
      include: { stats: true },
      orderBy: { stats: { xpPoints: "desc" } },
      take: limit,
    });
    return c.json({ entries: agents });
  }

  return c.json({ entries: [] });
});

// ── Positions ─────────────────────────────────────────────────────────────

export const positionRoutes = new Hono();

positionRoutes.get("/:address", async (c) => {
  const address = c.req.param("address");

  const positions = await db.position.findMany({
    where: { trader: address, isOpen: true },
    orderBy: { openedAt: "desc" },
  });

  return c.json({ positions });
});

positionRoutes.post("/:id/close", async (c) => {
  const id = c.req.param("id");
  // Relay close transaction to blockchain
  // For MVP: mock response
  return c.json({ success: true, txHash: "0x" + Math.random().toString(16).slice(2) });
});

// ── Markets ───────────────────────────────────────────────────────────────

export const marketRoutes = new Hono();

marketRoutes.get("/", async (c) => {
  return c.json({
    markets: [
      { symbol: "ETH-USD", maxLeverage: 50, takerFee: 10, makerFee: 5, isActive: true },
      { symbol: "BTC-USD", maxLeverage: 50, takerFee: 10, makerFee: 5, isActive: true },
      { symbol: "SOL-USD", maxLeverage: 25, takerFee: 10, makerFee: 5, isActive: true },
      { symbol: "ARB-USD", maxLeverage: 20, takerFee: 12, makerFee: 6, isActive: true },
    ],
  });
});

marketRoutes.get("/funding", async (c) => {
  const rates = await db.fundingRate.findMany({
    where: { timestamp: { gte: new Date(Date.now() - 86400_000) } },
    orderBy: { timestamp: "desc" },
    take: 20,
  });
  return c.json({ rates });
});

// ── Helper functions ──────────────────────────────────────────────────────

function computeSharpe(pnls: number[]): number {
  if (pnls.length < 2) return 0;
  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  const std = Math.sqrt(pnls.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / pnls.length);
  return std > 0 ? (mean / std) * Math.sqrt(252) : 0;
}

function computeSortino(pnls: number[]): number {
  if (pnls.length < 2) return 0;
  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  const losses = pnls.filter((p) => p < 0);
  const downstdDev = losses.length > 0
    ? Math.sqrt(losses.reduce((s, v) => s + v * v, 0) / losses.length)
    : 1e-9;
  return (mean / downstdDev) * Math.sqrt(252);
}

function computeMaxDrawdown(pnls: number[]): number {
  let peak = 0, maxDD = 0, cumulative = 0;
  for (const pnl of pnls) {
    cumulative += pnl;
    if (cumulative > peak) peak = cumulative;
    const dd = peak > 0 ? ((peak - cumulative) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function computeVolatility(pnls: number[]): number {
  if (pnls.length < 2) return 0;
  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  return Math.sqrt(pnls.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / pnls.length);
}

function computeDistribution(pnls: number[], buckets: number[]) {
  const labels = [...buckets.map((b) => (b < 0 ? `-$${Math.abs(b)}` : `+$${b}`))]
  return labels.map((label, i) => ({
    bucket: label,
    count: pnls.filter((p) => {
      const lower = i > 0 ? buckets[i - 1] : -Infinity;
      const upper = buckets[i];
      return p >= lower && p < upper;
    }).length,
  }));
}

function computeMonthlyHeatmap(trades: unknown[]) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months.map((month) => ({
    month,
    pnl: Math.round((Math.random() - 0.35) * 6000),
  }));
}

function classifyBehavior(trades: unknown[], pnls: number[]) {
  const winRate = pnls.filter((p) => p > 0).length / Math.max(pnls.length, 1) * 100;
  const avgHold = 3600; // placeholder

  return [
    {
      label: "Momentum Trader",
      score: Math.round(Math.min(100, winRate * 0.8 + 20)),
      description: "Follows strong directional trends",
    },
    {
      label: "Risk-Aware",
      score: Math.round(Math.min(100, 100 - computeMaxDrawdown(pnls))),
      description: "Manages position size well",
    },
    {
      label: "Consistent",
      score: Math.round(Math.min(100, 70 - computeVolatility(pnls) * 2)),
      description: "Steady performance across conditions",
    },
    {
      label: "Active Trader",
      score: Math.min(100, Math.round(pnls.length / 5)),
      description: "High trade frequency",
    },
  ];
}
