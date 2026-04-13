"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTradingStore } from "@/store/tradingStore";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002";

type WSEventType =
  | "price_update"
  | "orderbook_update"
  | "trade_execution"
  | "liquidation_event"
  | "agent_update"
  | "funding_update"
  | "position_update"
  | "ai_signal";

interface WSMessage {
  type: WSEventType;
  data: Record<string, unknown>;
  timestamp: number;
  market?: string;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECTS = 10;

  const { updatePrice, updateOrderbook, addTrade, updateFunding, updatePosition } =
    useTradingStore();

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      const { type, data, market } = msg;

      switch (type) {
        case "price_update":
          if (data.market && data.price) {
            updatePrice({
              market: data.market as string,
              price: data.price as number,
              change24h: (data.change24h as number) || 0,
              volume24h: (data.volume24h as number) || 0,
              timestamp: msg.timestamp,
            } as Parameters<typeof updatePrice>[0]);
          }
          break;

        case "orderbook_update":
          if (market && data.bids && data.asks) {
            updateOrderbook(market, {
              bids: data.bids as [],
              asks: data.asks as [],
              spread: (data.spread as number) || 0,
              spreadPct: (data.spreadPct as number) || 0,
            });
          }
          break;

        case "trade_execution":
          if (market) {
            addTrade(market, {
              id: (data.id as string) || String(Date.now()),
              market: market as "ETH-USD",
              side: (data.side as "LONG" | "SHORT") || "LONG",
              price: (data.price as number) || 0,
              size: (data.size as number) || 0,
              timestamp: msg.timestamp,
            });
          }
          break;

        case "funding_update":
          if (market) {
            updateFunding({
              market: market as "ETH-USD",
              rate: (data.rate as number) || 0,
              predictedRate: (data.predictedRate as number) || 0,
              nextFundingIn: (data.nextFundingIn as number) || 28800,
            });
          }
          break;

        case "position_update":
          if (data.id) {
            updatePosition(data.id as string, data as Record<string, unknown> as Partial<Parameters<typeof updatePosition>[1]>);
          }
          break;

        case "liquidation_event":
          // Could show toast notification here
          console.warn("[WS] Liquidation:", data);
          break;

        case "ai_signal":
          // Forward to UI components via store or event
          window.dispatchEvent(new CustomEvent("ai_signal", { detail: data }));
          break;
      }
    },
    [updatePrice, updateOrderbook, addTrade, updateFunding, updatePosition]
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      console.log("[WS] Connected");

      // Subscribe to all channels
      ws.send(
        JSON.stringify({
          action: "subscribe",
          channels: [
            "price_update",
            "orderbook_update",
            "trade_execution",
            "liquidation_event",
            "agent_update",
            "funding_update",
            "position_update",
            "ai_signal",
          ],
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    ws.onclose = (event) => {
      console.log("[WS] Disconnected:", event.code, event.reason);
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      ws.close();
    };
  }, [handleMessage]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttempts.current >= MAX_RECONNECTS) {
      console.error("[WS] Max reconnect attempts reached");
      return;
    }
    const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
    reconnectAttempts.current++;
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
    reconnectTimer.current = setTimeout(connect, delay);
  }, [connect]);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback(
    (channels: WSEventType[]) => {
      send({ action: "subscribe", channels });
    },
    [send]
  );

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000, "Component unmounted");
    };
  }, [connect]);

  return { send, subscribe, isConnected: wsRef.current?.readyState === WebSocket.OPEN };
}
