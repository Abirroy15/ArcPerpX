import { db } from "../db";

export async function startFundingKeeper(): Promise<void> {
  console.log("Funding keeper initialized");

  // Update funding rates every 8 hours
  const FUNDING_INTERVAL = 8 * 60 * 60 * 1000;

  const updateFunding = async () => {
    const markets = ["ETH-USD", "BTC-USD", "SOL-USD", "ARB-USD"];
    for (const market of markets) {
      try {
        const rate = (Math.random() - 0.4) * 0.008;
        await db.fundingRate.create({
          data: {
            market,
            rate,
            predicted: rate * (0.8 + Math.random() * 0.4),
            timestamp: new Date(),
          },
        });
      } catch {
        // DB may not be connected
      }
    }
    console.log("[Funding] Rates updated");
  };

  // Run immediately then on interval
  await updateFunding();
  setInterval(updateFunding, FUNDING_INTERVAL);
}
