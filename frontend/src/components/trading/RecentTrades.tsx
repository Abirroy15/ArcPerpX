"use client";

import { useMemo } from "react";
import { useTradingStore } from "@/store/tradingStore";

export function RecentTrades() {
  const { selectedMarket, recentTrades } = useTradingStore();
  const trades = useMemo(
    () => (recentTrades[selectedMarket] || []).slice(0, 20),
    [recentTrades, selectedMarket]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-arc-border shrink-0">
        <span className="text-xs font-semibold text-arc-text">Recent Trades</span>
      </div>

      <div className="grid grid-cols-3 px-3 py-1 text-[10px] text-arc-subtle font-medium shrink-0">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-arc-subtle">
            No trades yet
          </div>
        ) : (
          trades.map((trade, i) => {
            const isLong = trade.side === "LONG";
            const time = new Date(trade.timestamp);
            const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}:${String(time.getSeconds()).padStart(2, "0")}`;

            return (
              <div
                key={trade.id || i}
                className="grid grid-cols-3 px-3 py-[3px] hover:bg-arc-surface-2 transition-colors"
              >
                <span className={`text-xs font-mono-data font-medium ${isLong ? "ob-bid-price" : "ob-ask-price"}`}>
                  {trade.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs font-mono-data text-arc-text text-right">
                  {trade.size.toFixed(3)}
                </span>
                <span className="text-[10px] font-mono-data text-arc-subtle text-right">
                  {timeStr}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
