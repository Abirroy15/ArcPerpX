import { WebSocketServer, WebSocket } from "ws";
import { Redis } from "ioredis";
import { EventEmitter } from "events";

export const eventBus = new EventEmitter();

interface Client {
  ws: WebSocket;
  subscriptions: Set<string>;
  address?: string;
  lastPing: number;
}

const clients = new Map<string, Client>();
let wss: WebSocketServer;

// ── Message Types ─────────────────────────────────────────────────────────

export type WSEventType =
  | "price_update"
  | "orderbook_update"
  | "trade_execution"
  | "liquidation_event"
  | "agent_update"
  | "funding_update"
  | "position_update"
  | "pnl_update"
  | "xp_update"
  | "ai_signal";

export interface WSMessage {
  type: WSEventType;
  data: Record<string, unknown>;
  timestamp: number;
  market?: string;
}

// ── Server ────────────────────────────────────────────────────────────────

export function startWebSocketServer(port: number): WebSocketServer {
  wss = new WebSocketServer({ port });

  wss.on("connection", (ws, req) => {
    const clientId = generateId();
    const client: Client = {
      ws,
      subscriptions: new Set(["price_update"]), // default sub
      lastPing: Date.now(),
    };
    clients.set(clientId, client);

    console.log(`[WS] Client connected: ${clientId} (total: ${clients.size})`);

    // Send welcome
    send(ws, {
      type: "price_update",
      data: { message: "Connected to ArcPerpX WebSocket", clientId },
      timestamp: Date.now(),
    });

    ws.on("message", (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());
        handleClientMessage(clientId, client, msg);
      } catch (e) {
        console.error("[WS] Invalid message:", e);
      }
    });

    ws.on("pong", () => {
      const c = clients.get(clientId);
      if (c) c.lastPing = Date.now();
    });

    ws.on("close", () => {
      clients.delete(clientId);
      console.log(`[WS] Client disconnected: ${clientId} (total: ${clients.size})`);
    });

    ws.on("error", (err) => {
      console.error(`[WS] Client error ${clientId}:`, err.message);
      clients.delete(clientId);
    });
  });

  // Heartbeat — drop stale connections
  setInterval(() => {
    const now = Date.now();
    clients.forEach((client, id) => {
      if (now - client.lastPing > 60_000) {
        client.ws.terminate();
        clients.delete(id);
        return;
      }
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    });
  }, 30_000);

  return wss;
}

// ── Client Message Handler ────────────────────────────────────────────────

function handleClientMessage(id: string, client: Client, msg: Record<string, unknown>) {
  switch (msg.action) {
    case "subscribe":
      if (Array.isArray(msg.channels)) {
        (msg.channels as string[]).forEach((ch) => client.subscriptions.add(ch));
      }
      break;

    case "unsubscribe":
      if (Array.isArray(msg.channels)) {
        (msg.channels as string[]).forEach((ch) => client.subscriptions.delete(ch));
      }
      break;

    case "auth":
      // Verify signature (simplified)
      if (typeof msg.address === "string") {
        client.address = msg.address;
      }
      break;

    case "ping":
      send(client.ws, { type: "price_update", data: { pong: true }, timestamp: Date.now() });
      break;
  }
}

// ── Broadcast Helpers ─────────────────────────────────────────────────────

/**
 * Broadcast to all clients subscribed to event type
 */
export function broadcast(event: WSMessage) {
  const payload = JSON.stringify(event);
  let sent = 0;

  clients.forEach((client) => {
    if (
      client.ws.readyState === WebSocket.OPEN &&
      client.subscriptions.has(event.type)
    ) {
      client.ws.send(payload);
      sent++;
    }
  });

  return sent;
}

/**
 * Send to specific address
 */
export function sendToAddress(address: string, event: WSMessage) {
  clients.forEach((client) => {
    if (
      client.address === address &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      client.ws.send(JSON.stringify(event));
    }
  });
}

function send(ws: WebSocket, data: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ── Event Bus Integration ─────────────────────────────────────────────────

eventBus.on("price", (data) => {
  broadcast({ type: "price_update", data, timestamp: Date.now(), market: data.market });
});

eventBus.on("orderbook", (data) => {
  broadcast({ type: "orderbook_update", data, timestamp: Date.now(), market: data.market });
});

eventBus.on("trade", (data) => {
  broadcast({ type: "trade_execution", data, timestamp: Date.now(), market: data.market });
});

eventBus.on("liquidation", (data) => {
  broadcast({ type: "liquidation_event", data, timestamp: Date.now() });
  // Also send privately to liquidated trader
  if (data.trader) {
    sendToAddress(data.trader, { type: "liquidation_event", data, timestamp: Date.now() });
  }
});

eventBus.on("agent", (data) => {
  broadcast({ type: "agent_update", data, timestamp: Date.now() });
});

eventBus.on("funding", (data) => {
  broadcast({ type: "funding_update", data, timestamp: Date.now(), market: data.market });
});

eventBus.on("ai_signal", (data) => {
  broadcast({ type: "ai_signal", data, timestamp: Date.now() });
});

// ── Price Feed Simulation (replace with real oracle in prod) ───────────────

const MARKETS = ["ETH-USD", "BTC-USD", "SOL-USD", "ARB-USD"];
const prices: Record<string, number> = {
  "ETH-USD": 3200,
  "BTC-USD": 67000,
  "SOL-USD": 180,
  "ARB-USD": 1.15,
};

setInterval(() => {
  MARKETS.forEach((market) => {
    const prev = prices[market];
    const change = (Math.random() - 0.5) * 0.002 * prev;
    prices[market] = Math.max(prev + change, 0.01);

    eventBus.emit("price", {
      market,
      price: prices[market],
      change24h: ((Math.random() - 0.5) * 10).toFixed(2),
      volume24h: (Math.random() * 1_000_000).toFixed(0),
      timestamp: Date.now(),
    });
  });
}, 500); // 500ms price updates

export { wss, clients, prices };
