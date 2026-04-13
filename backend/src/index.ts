import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { orderRoutes } from "./routes/orders";
import { positionRoutes } from "./routes/positions";
import { agentRoutes } from "./routes/agents";
import { marketRoutes } from "./routes/markets";
import { leaderboardRoutes } from "./routes/leaderboard";
import { analyticsRoutes } from "./routes/analytics";
import { orderbook, recentTrades, startOrderbookEngine } from "./services/orderbookEngine";
import { connectDB } from "./db";
import { connectRedis } from "./cache";

const app = new Hono();

// ── Middleware ─────────────────────────────────────────────────────────────

app.use("*", cors({
  origin: ["http://localhost:3000", process.env.FRONTEND_URL || "", "https://*.vercel.app"],
  credentials: true,
}));
app.use("*", logger());

// ── Health ─────────────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: Date.now(), version: "1.0.0" })
);

// ── Routes ─────────────────────────────────────────────────────────────────

app.route("/api/orders", orderRoutes);
app.route("/api/positions", positionRoutes);
app.route("/api/agents", agentRoutes);
app.route("/api/markets", marketRoutes);
app.route("/api/leaderboard", leaderboardRoutes);
app.route("/api/analytics", analyticsRoutes);

// ── Orderbook & Trades ─────────────────────────────────────────────────────

app.get("/api/orderbook/:market", (c) => {
  const market = c.req.param("market");
  return c.json(orderbook.getSnapshot(market));
});

app.get("/api/trades/:market", (c) => {
  const market = c.req.param("market");
  const limit = Number(c.req.query("limit") || 50);
  return c.json({ trades: recentTrades.get(market, limit) });
});

// ── Internal (AI engine callbacks) ────────────────────────────────────────

app.post("/api/internal/risk-update", async (c) => {
  const body = await c.req.json();
  console.log("[Risk Oracle]", body);
  return c.json({ received: true });
});

// ── Error handlers ─────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("[Error]", err);
  return c.json({ error: err.message }, 500);
});

// ── Bootstrap — local dev only (Vercel uses export default) ───────────────

const IS_VERCEL = !!process.env.VERCEL;

if (!IS_VERCEL) {
  (async () => {
    console.log("🚀 Starting ArcPerpX Backend...");
    await connectDB();
    await connectRedis();
    await startOrderbookEngine();

    // WebSocket server (local only — not supported on Vercel)
    const { startWebSocketServer } = await import("./websocket/server");
    startWebSocketServer(Number(process.env.WS_PORT || 3002));

    const { startLiquidationWatcher } = await import("./services/liquidationWatcher");
    const { startFundingKeeper } = await import("./services/fundingKeeper");
    await startLiquidationWatcher();
    await startFundingKeeper();

    serve({ fetch: app.fetch, port: Number(process.env.PORT || 3001) });
    console.log(`✅ REST API:    http://localhost:${process.env.PORT || 3001}`);
    console.log(`✅ WebSocket:   ws://localhost:${process.env.WS_PORT || 3002}`);
    console.log("🎯 ArcPerpX Backend ready!\n");
  })().catch(console.error);
}

// Vercel serverless export
export default app;
