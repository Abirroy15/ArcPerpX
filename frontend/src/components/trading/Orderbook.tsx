"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTradingStore } from "@/store/tradingStore";

const LEVELS = 16;

export function Orderbook() {
  const { selectedMarket, orderbooks, prices, updateTradeForm } = useTradingStore();
  const ob = orderbooks[selectedMarket];
  const price = prices[selectedMarket];

  const { asks, bids, maxSize, spread, spreadPct } = useMemo(() => {
    if (!ob) return { asks: [], bids: [], maxSize: 0, spread: 0, spreadPct: 0 };

    const asks = ob.asks.slice(0, LEVELS);
    const bids = ob.bids.slice(0, LEVELS);
    const maxSize = Math.max(
      ...asks.map((a) => a.total || a.size),
      ...bids.map((b) => b.total || b.size)
    );
    return { asks: asks.reverse(), bids, maxSize, spread: ob.spread, spreadPct: ob.spreadPct };
  }, [ob]);

  // Mock data when not connected
  const { mockAsks, mockBids } = useMemo(() => {
    const base = price?.price || 3200;
    const mockAsks = Array.from({ length: LEVELS }, (_, i) => ({
      price: base * (1 + (i + 1) * 0.0003),
      size: Math.random() * 10 + 0.5,
      total: 0,
    }));
    const mockBids = Array.from({ length: LEVELS }, (_, i) => ({
      price: base * (1 - (i + 1) * 0.0003),
      size: Math.random() * 10 + 0.5,
      total: 0,
    }));
    // Compute cumulative totals
    let runningAsk = 0;
    mockAsks.forEach((a) => { runningAsk += a.size; a.total = runningAsk; });
    let runningBid = 0;
    mockBids.forEach((b) => { runningBid += b.size; b.total = runningBid; });
    return { mockAsks: mockAsks.reverse(), mockBids };
  }, [price?.price]);

  const displayAsks = asks.length > 0 ? asks : mockAsks;
  const displayBids = bids.length > 0 ? bids : mockBids;
  const displayMax = maxSize || Math.max(...displayAsks.map((a) => a.total), ...displayBids.map((b) => b.total));

  const handlePriceClick = (p: number) => {
    updateTradeForm({ price: p.toFixed(2), orderType: "LIMIT" });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-arc-border shrink-0">
        <span className="text-xs font-semibold text-arc-text">Orderbook</span>
        <div className="flex items-center gap-2 text-xs text-arc-muted">
          <span className="w-2 h-2 rounded-sm bg-arc-red/40" /> Asks
          <span className="w-2 h-2 rounded-sm bg-arc-green/40" /> Bids
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-3 py-1 text-[10px] text-arc-subtle font-medium shrink-0">
        <span>Price (USD)</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (red, sells) */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto flex flex-col-reverse">
          {displayAsks.map((level, i) => (
            <OrderLevel
              key={`ask-${i}`}
              price={level.price}
              size={level.size}
              total={level.total}
              maxTotal={displayMax}
              side="ask"
              onClick={() => handlePriceClick(level.price)}
            />
          ))}
        </div>

        {/* Mid price */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-arc-surface-2 border-y border-arc-border shrink-0">
          <span className="font-mono-data font-bold text-base text-arc-text">
            ${price?.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "—"}
          </span>
          <div className="flex items-center gap-2 text-[10px] text-arc-muted">
            <span>Spread</span>
            <span className="text-arc-yellow font-mono-data">
              {spread > 0 ? `$${spread.toFixed(2)}` : "—"}
            </span>
            <span className="font-mono-data">
              {spreadPct > 0 ? `(${spreadPct.toFixed(3)}%)` : ""}
            </span>
          </div>
        </div>

        {/* Bids (green, buys) */}
        <div className="flex-1 overflow-y-auto">
          {displayBids.map((level, i) => (
            <OrderLevel
              key={`bid-${i}`}
              price={level.price}
              size={level.size}
              total={level.total}
              maxTotal={displayMax}
              side="bid"
              onClick={() => handlePriceClick(level.price)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface OrderLevelProps {
  price: number;
  size: number;
  total: number;
  maxTotal: number;
  side: "bid" | "ask";
  onClick: () => void;
}

function OrderLevel({ price, size, total, maxTotal, side, onClick }: OrderLevelProps) {
  const depthPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const isAsk = side === "ask";

  return (
    <button
      onClick={onClick}
      className="relative grid grid-cols-3 w-full px-3 py-[3px] hover:bg-arc-surface-2 transition-colors group"
    >
      {/* Depth bar */}
      <div
        className={`absolute inset-y-0 ${isAsk ? "right-0" : "right-0"} ${
          isAsk ? "ob-ask-bar" : "ob-bid-bar"
        } transition-all duration-300`}
        style={{ width: `${depthPct}%` }}
      />

      {/* Content */}
      <span className={`relative z-10 text-xs font-mono-data font-medium ${isAsk ? "ob-ask-price" : "ob-bid-price"}`}>
        {price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      </span>
      <span className="relative z-10 text-xs font-mono-data text-arc-text text-right">
        {size.toFixed(3)}
      </span>
      <span className="relative z-10 text-xs font-mono-data text-arc-muted text-right">
        {total.toFixed(2)}
      </span>
    </button>
  );
}
