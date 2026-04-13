import axios from "axios";

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : "http://localhost:3001/api",
  headers: { "Content-Type": "application/json" },
});

// Attach wallet address header on every request
API.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("walletAddress");
      if (stored) config.headers["X-Wallet-Address"] = stored;
    } catch { /* ignore */ }
  }
  return config;
});

// ── Orders ────────────────────────────────────────────────────────────────

export async function placeOrder(order: {
  market: string;
  side: "LONG" | "SHORT";
  type: "MARKET" | "LIMIT" | "STOP";
  size: number;
  price?: number;
  leverage: number;
  marginMode: "CROSS" | "ISOLATED";
  collateralToken: string;
  slippageBps: number;
  signature: string;
  nonce: number;
  deadline: number;
}) {
  const res = await API.post("/orders", order);
  return res.data;
}

export async function cancelOrder(orderId: string, signature: string) {
  const res = await API.delete(`/orders/${orderId}`, { data: { orderId, signature } });
  return res.data;
}

export async function fetchOrders(address: string, status?: string) {
  const res = await API.get(`/orders/${address}`, { params: { status } });
  return res.data;
}

// ── Positions ─────────────────────────────────────────────────────────────

export async function fetchPositions(address: string) {
  const res = await API.get(`/positions/${address}`);
  return res.data;
}

export async function closePosition(
  positionId: string,
  signTypedData: (domain: object, types: object, value: object) => Promise<string>
) {
  const domain = { name: "ArcPerpX", version: "1", chainId: 2001 };
  const closeType = {
    ClosePosition: [
      { name: "positionId", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const nonce = Date.now();
  const deadline = Math.floor(Date.now() / 1000) + 300;
  const signature = await signTypedData(domain, closeType, { positionId, nonce, deadline });
  const res = await API.post(`/positions/${positionId}/close`, { signature, nonce, deadline });
  return res.data;
}

// ── Agents ────────────────────────────────────────────────────────────────

export async function fetchAgents(address: string) {
  const res = await API.get(`/agents/${address}`);
  return res.data;
}

export async function fetchMarketplace(sort = "sharpe") {
  const res = await API.get("/agents/marketplace", { params: { sort } });
  return res.data;
}

export async function createAgent(params: {
  name: string;
  strategyType: string;
  riskTolerance: number;
  mutationRate: number;
  timeHorizon: string;
  market: string;
  maxPositionSize: number;
  maxLeverage: number;
  isPublic: boolean;
  copyFee: number;
}) {
  const res = await API.post("/agents", params);
  return res.data;
}

export async function trainAgent(params: {
  agentId: string;
  epochs: number;
  rewardFunction: string;
  marketData: string;
}) {
  const res = await API.post("/agents/train", params);
  return res.data;
}

export async function breedAgents(params: {
  parent1Id: string;
  parent2Id: string;
  childName: string;
  mutationBoost: number;
}) {
  const res = await API.post("/agents/breed", params);
  return res.data;
}

export async function fetchAgentPerformance(agentId: string) {
  const res = await API.get(`/agents/performance/${agentId}`);
  return res.data;
}

// ── Leaderboard ───────────────────────────────────────────────────────────

export async function fetchLeaderboard(type = "traders", season = "current") {
  const res = await API.get("/leaderboard", { params: { type, season } });
  return res.data;
}

// ── Analytics ─────────────────────────────────────────────────────────────

export async function fetchAnalytics(address: string) {
  const res = await API.get(`/analytics/${address}`);
  return res.data;
}

// ── Markets ───────────────────────────────────────────────────────────────

export async function fetchOrderbook(market: string) {
  const res = await API.get(`/orderbook/${market}`);
  return res.data;
}

export async function fetchMarkets() {
  const res = await API.get("/markets");
  return res.data;
}

export async function fetchFundingRates() {
  const res = await API.get("/markets/funding");
  return res.data;
}

export default API;
