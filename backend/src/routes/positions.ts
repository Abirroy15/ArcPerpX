import { Hono } from "hono";
import { db } from "../db";

export const positionRoutes = new Hono();

positionRoutes.get("/:address", async (c) => {
  const address = c.req.param("address");
  try {
    const positions = await db.position.findMany({
      where: { trader: address.toLowerCase(), isOpen: true },
      orderBy: { openedAt: "desc" },
    });
    return c.json({ positions });
  } catch {
    return c.json({ positions: [] });
  }
});

positionRoutes.post("/:id/close", async (c) => {
  const id = c.req.param("id");
  try {
    await db.position.update({
      where: { id },
      data: { isOpen: false, closedAt: new Date() },
    });
    return c.json({ success: true, txHash: "0x" + Math.random().toString(16).slice(2, 66) });
  } catch {
    return c.json({ success: false, error: "Position not found" }, 404);
  }
});
