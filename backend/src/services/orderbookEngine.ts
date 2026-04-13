// Orderbook Engine — in-memory order matching

interface Order {
  id: string;
  trader: string;
  market: string;
  side: "LONG" | "SHORT";
  type: "MARKET" | "LIMIT" | "STOP";
  size: number;
  price?: number;
  status: "OPEN" | "FILLED" | "CANCELLED";
  createdAt: number;
}

interface OrderbookLevel {
  price: number;
  size: number;
  total: number;
}

interface OrderbookSnapshot {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spread: number;
  spreadPct: number;
}

const BASE_PRICES: Record<string, number> = {
  "ETH-USD": 3241.5,
  "BTC-USD": 67420.0,
  "SOL-USD": 182.4,
  "ARB-USD": 1.17,
};

class OrderbookEngine {
  private limitOrders: Map<string, Order> = new Map();

  getSnapshot(market: string): OrderbookSnapshot {
    const base = BASE_PRICES[market] || 3000;
    const asks: OrderbookLevel[] = [];
    const bids: OrderbookLevel[] = [];

    let askTotal = 0;
    let bidTotal = 0;

    for (let i = 1; i <= 15; i++) {
      const askPrice = base * (1 + i * 0.0003);
      const askSize = Math.random() * 8 + 0.3;
      askTotal += askSize;
      asks.push({ price: askPrice, size: askSize, total: askTotal });

      const bidPrice = base * (1 - i * 0.0003);
      const bidSize = Math.random() * 8 + 0.3;
      bidTotal += bidSize;
      bids.push({ price: bidPrice, size: bidSize, total: bidTotal });
    }

    const spread = asks[0].price - bids[0].price;
    const spreadPct = (spread / base) * 100;

    return { bids, asks: asks.reverse(), spread, spreadPct };
  }

  addLimitOrder(order: Order): void {
    this.limitOrders.set(order.id, order);
  }

  cancelOrder(orderId: string): boolean {
    return this.limitOrders.delete(orderId);
  }

  matchMarketOrder(order: Order): { executionPrice: number } | null {
    const base = BASE_PRICES[order.market] || 3000;
    const slippage = (Math.random() * 0.001);
    const executionPrice = order.side === "LONG"
      ? base * (1 + slippage)
      : base * (1 - slippage);
    return { executionPrice };
  }
}

class RecentTradesStore {
  private trades: Map<string, unknown[]> = new Map();

  add(market: string, trade: unknown): void {
    const existing = this.trades.get(market) || [];
    this.trades.set(market, [trade, ...existing].slice(0, 100));
  }

  get(market: string, limit = 50): unknown[] {
    return (this.trades.get(market) || []).slice(0, limit);
  }
}

export const orderbook = new OrderbookEngine();
export const recentTrades = new RecentTradesStore();

export async function startOrderbookEngine(): Promise<void> {
  console.log("Orderbook engine initialized");
}
