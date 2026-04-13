import { Hono } from "hono";

export const marketRoutes = new Hono();

const MARKETS = [
  { symbol: "ETH-USD", maxLeverage: 50, takerFee: 10, makerFee: 5, isActive: true, minSize: 0.001 },
  { symbol: "BTC-USD", maxLeverage: 50, takerFee: 10, makerFee: 5, isActive: true, minSize: 0.0001 },
  { symbol: "SOL-USD", maxLeverage: 25, takerFee: 10, makerFee: 5, isActive: true, minSize: 0.01 },
  { symbol: "ARB-USD", maxLeverage: 20, takerFee: 12, makerFee: 6, isActive: true, minSize: 1.0 },
];

// Mock prices for demo — replace with oracle feed in production
const PRICES: Record<string, number> = {
  "ETH-USD": 3241.5,
  "BTC-USD": 67420.0,
  "SOL-USD": 182.4,
  "ARB-USD": 1.17,
};

marketRoutes.get("/", (c) => c.json({ markets: MARKETS }));

marketRoutes.get("/prices", (c) => {
  // Add small random movement to prices
  Object.keys(PRICES).forEach((m) => {
    PRICES[m] *= 1 + (Math.random() - 0.5) * 0.002;
  });
  return c.json({ prices: PRICES });
});

marketRoutes.get("/funding", (c) => {
  const rates = MARKETS.map((m) => ({
    market: m.symbol,
    rate: (Math.random() - 0.4) * 0.008,
    predicted: (Math.random() - 0.4) * 0.006,
    longOI: Math.random() * 10_000_000,
    shortOI: Math.random() * 10_000_000,
    nextFundingIn: Math.floor(Math.random() * 28800),
  }));
  return c.json({ rates });
});

marketRoutes.get("/:symbol", (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const market = MARKETS.find((m) => m.symbol === symbol);
  if (!market) return c.json({ error: "Market not found" }, 404);
  return c.json({ market, price: PRICES[symbol] });
});
