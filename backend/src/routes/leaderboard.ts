import { Hono } from "hono";
import { db } from "../db";

export const leaderboardRoutes = new Hono();

leaderboardRoutes.get("/", async (c) => {
  const type = c.req.query("type") || "traders";
  const limit = Math.min(Number(c.req.query("limit") || 50), 100);

  try {
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
  } catch {
    // Return mock data if DB not connected
  }

  // Mock fallback
  return c.json({
    entries: [
      { address: "0xAB12", username: "ArcAlpha",   xp: 142000, winRate: 73.2, totalPnl: 48200, sharpe: 3.12, trades: 892, badges: ["👑","⚡","🔥"] },
      { address: "0xCD34", username: "DeepMind",   xp: 87500,  winRate: 68.1, totalPnl: 31500, sharpe: 2.78, trades: 654, badges: ["🛡️","💎"] },
      { address: "0xEF56", username: "Sigma7",     xp: 52000,  winRate: 61.4, totalPnl: 18900, sharpe: 2.31, trades: 421, badges: ["⚡","🎯"] },
      { address: "0x7891", username: "FluxTrader", xp: 28000,  winRate: 58.3, totalPnl: 12400, sharpe: 1.94, trades: 287, badges: ["📈"] },
      { address: "0xABCD", username: "NovaCap",    xp: 18500,  winRate: 55.7, totalPnl: 8700,  sharpe: 1.65, trades: 198, badges: ["🌊"] },
    ],
  });
});
