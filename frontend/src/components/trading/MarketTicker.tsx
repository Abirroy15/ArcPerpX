"use client";

import { useTradingStore, type Market } from "@/store/tradingStore";
import { motion } from "framer-motion";

const MARKETS: Market[] = ["ETH-USD", "BTC-USD", "SOL-USD", "ARB-USD"];

const MARKET_ICONS: Record<Market, string> = {
  "ETH-USD": "Ξ",
  "BTC-USD": "₿",
  "SOL-USD": "◎",
  "ARB-USD": "◈",
};

export function MarketTicker() {
  const { prices, selectedMarket, setMarket } = useTradingStore();

  return (
    <div className="flex items-center gap-0 border-b border-arc-border bg-arc-surface shrink-0 overflow-x-auto scrollbar-none">
      {MARKETS.map((market) => {
        const price = prices[market];
        const isSelected = selectedMarket === market;
        const isPositive = (price?.change24h ?? 0) >= 0;

        return (
          <button
            key={market}
            onClick={() => setMarket(market)}
            className={`flex items-center gap-2.5 px-4 py-2.5 border-r border-arc-border whitespace-nowrap transition-colors shrink-0 ${
              isSelected
                ? "bg-arc-surface-2 border-b-2 border-b-arc-accent"
                : "hover:bg-arc-surface-2"
            }`}
          >
            <span className={`text-base ${isSelected ? "text-arc-accent" : "text-arc-muted"}`}>
              {MARKET_ICONS[market]}
            </span>
            <div className="flex flex-col items-start">
              <span className={`text-xs font-semibold ${isSelected ? "text-arc-text" : "text-arc-muted"}`}>
                {market}
              </span>
              {price ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono-data text-arc-text">
                    ${price.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[10px] font-semibold ${isPositive ? "text-profit" : "text-loss"}`}>
                    {isPositive ? "+" : ""}{price.change24h?.toFixed(2)}%
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-arc-subtle">Loading...</span>
              )}
            </div>
          </button>
        );
      })}

      {/* Live indicator */}
      <div className="ml-auto flex items-center gap-1.5 px-4 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-arc-green animate-pulse" />
        <span className="text-[10px] text-arc-muted font-medium uppercase tracking-wider">Live</span>
      </div>
    </div>
  );
}
