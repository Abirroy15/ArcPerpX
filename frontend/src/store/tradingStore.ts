import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// ── Types ─────────────────────────────────────────────────────────────────

export type Market = "ETH-USD" | "BTC-USD" | "SOL-USD" | "ARB-USD";
export type Side = "LONG" | "SHORT";
export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type MarginMode = "CROSS" | "ISOLATED";

export interface Price {
  market: Market;
  price: number;
  change24h: number;
  volume24h: number;
  timestamp: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;
  total: number;
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spread: number;
  spreadPct: number;
}

export interface Position {
  id: string;
  market: Market;
  side: Side;
  size: number;
  entryPrice: number;
  currentPrice: number;
  margin: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  liquidationPrice: number;
  marginMode: MarginMode;
  openTime: number;
  fundingAccrued: number;
}

export interface Order {
  id: string;
  market: Market;
  side: Side;
  type: OrderType;
  size: number;
  price?: number;
  status: "OPEN" | "FILLED" | "CANCELLED" | "PARTIAL";
  createdAt: number;
}

export interface Trade {
  id: string;
  market: Market;
  side: Side;
  price: number;
  size: number;
  timestamp: number;
}

export interface FundingRate {
  market: Market;
  rate: number;
  predictedRate: number;
  nextFundingIn: number; // seconds
}

// ── Form State ────────────────────────────────────────────────────────────

export interface TradeFormState {
  side: Side;
  orderType: OrderType;
  marginMode: MarginMode;
  size: string;
  price: string;
  stopPrice: string;
  leverage: number;
  slippage: number;
}

// ── Store ─────────────────────────────────────────────────────────────────

interface TradingStore {
  // Market
  selectedMarket: Market;
  prices: Record<string, Price>;
  orderbooks: Record<string, Orderbook>;
  recentTrades: Record<string, Trade[]>;
  fundingRates: Record<string, FundingRate>;

  // User
  walletAddress: string | null;
  positions: Position[];
  openOrders: Order[];
  tradeHistory: Order[];
  balance: number;
  availableMargin: number;

  // UI
  tradeForm: TradeFormState;
  isSubmitting: boolean;
  error: string | null;

  // Actions
  setMarket: (market: Market) => void;
  updatePrice: (price: Price) => void;
  updateOrderbook: (market: string, ob: Orderbook) => void;
  addTrade: (market: string, trade: Trade) => void;
  updateFunding: (funding: FundingRate) => void;
  setWallet: (address: string | null) => void;
  setPositions: (positions: Position[]) => void;
  updatePosition: (id: string, update: Partial<Position>) => void;
  setOpenOrders: (orders: Order[]) => void;
  setBalance: (balance: number, available: number) => void;
  updateTradeForm: (update: Partial<TradeFormState>) => void;
  setSubmitting: (v: boolean) => void;
  setError: (err: string | null) => void;
  computeLiquidationPrice: () => number;
  computeRequiredMargin: () => number;
}

const DEFAULT_FORM: TradeFormState = {
  side: "LONG",
  orderType: "MARKET",
  marginMode: "CROSS",
  size: "",
  price: "",
  stopPrice: "",
  leverage: 10,
  slippage: 0.3,
};

export const useTradingStore = create<TradingStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    selectedMarket: "ETH-USD",
    prices: {},
    orderbooks: {},
    recentTrades: {},
    fundingRates: {},
    walletAddress: null,
    positions: [],
    openOrders: [],
    tradeHistory: [],
    balance: 0,
    availableMargin: 0,
    tradeForm: DEFAULT_FORM,
    isSubmitting: false,
    error: null,

    // Actions
    setMarket: (market) => set({ selectedMarket: market }),

    updatePrice: (price) =>
      set((s) => ({ prices: { ...s.prices, [price.market]: price } })),

    updateOrderbook: (market, ob) =>
      set((s) => ({ orderbooks: { ...s.orderbooks, [market]: ob } })),

    addTrade: (market, trade) =>
      set((s) => ({
        recentTrades: {
          ...s.recentTrades,
          [market]: [trade, ...(s.recentTrades[market] || [])].slice(0, 100),
        },
      })),

    updateFunding: (funding) =>
      set((s) => ({ fundingRates: { ...s.fundingRates, [funding.market]: funding } })),

    setWallet: (address) => set({ walletAddress: address }),

    setPositions: (positions) => set({ positions }),

    updatePosition: (id, update) =>
      set((s) => ({
        positions: s.positions.map((p) => (p.id === id ? { ...p, ...update } : p)),
      })),

    setOpenOrders: (orders) => set({ openOrders: orders }),

    setBalance: (balance, available) => set({ balance, availableMargin: available }),

    updateTradeForm: (update) =>
      set((s) => ({ tradeForm: { ...s.tradeForm, ...update } })),

    setSubmitting: (v) => set({ isSubmitting: v }),

    setError: (err) => set({ error: err }),

    computeLiquidationPrice: () => {
      const { selectedMarket, prices, tradeForm } = get();
      const price = prices[selectedMarket]?.price || 0;
      const leverage = tradeForm.leverage;
      const side = tradeForm.side;
      const maintenanceMargin = 0.05; // 5%

      if (!price || !leverage) return 0;

      if (side === "LONG") {
        return price * (1 - 1 / leverage + maintenanceMargin);
      } else {
        return price * (1 + 1 / leverage - maintenanceMargin);
      }
    },

    computeRequiredMargin: () => {
      const { selectedMarket, prices, tradeForm } = get();
      const price = prices[selectedMarket]?.price || 0;
      const size = parseFloat(tradeForm.size) || 0;
      const leverage = tradeForm.leverage;

      if (!price || !size || !leverage) return 0;
      return (size * price) / leverage;
    },
  }))
);

// ── Selectors ─────────────────────────────────────────────────────────────

export const selectCurrentPrice = (market: string) => (s: TradingStore) =>
  s.prices[market];

export const selectOrderbook = (market: string) => (s: TradingStore) =>
  s.orderbooks[market];

export const selectPositionsByMarket = (market: string) => (s: TradingStore) =>
  s.positions.filter((p) => p.market === market);

export const selectTotalPnl = (s: TradingStore) =>
  s.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
