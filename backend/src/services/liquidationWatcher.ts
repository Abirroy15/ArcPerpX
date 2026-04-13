import { db } from "../db";

export async function startLiquidationWatcher(): Promise<void> {
  console.log("Liquidation watcher initialized");

  // Check for underwater positions every 10 seconds
  setInterval(async () => {
    try {
      const openPositions = await db.position.findMany({
        where: { isOpen: true },
      });

      const PRICES: Record<string, number> = {
        "ETH-USD": 3241.5,
        "BTC-USD": 67420.0,
        "SOL-USD": 182.4,
        "ARB-USD": 1.17,
      };

      for (const pos of openPositions) {
        const currentPrice = PRICES[pos.market] || pos.entryPrice;

        // Check if liquidation price is breached
        if (
          (pos.side === "LONG" && currentPrice <= pos.liquidationPrice) ||
          (pos.side === "SHORT" && currentPrice >= pos.liquidationPrice)
        ) {
          await db.position.update({
            where: { id: pos.id },
            data: { isOpen: false, closedAt: new Date() },
          });
          console.log(`[Liquidation] Position ${pos.id} liquidated at $${currentPrice}`);
        }
      }
    } catch {
      // DB may not be connected in dev
    }
  }, 10_000);
}
