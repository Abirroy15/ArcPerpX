"use client";

import { useTradingStore } from "@/store/tradingStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { MarketTicker } from "@/components/trading/MarketTicker";
import { PriceChart } from "@/components/trading/PriceChart";
import { Orderbook } from "@/components/trading/Orderbook";
import { TradeForm } from "@/components/trading/TradeForm";
import { PositionPanel } from "@/components/trading/PositionPanel";
import { RecentTrades } from "@/components/trading/RecentTrades";
import { AISignalBadge } from "@/components/trading/AISignalBadge";
import { RiskOracleAlert } from "@/components/trading/RiskOracleAlert";

export default function TradePage() {
  const { isConnected } = useWebSocket();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-arc-bg">
      <MarketTicker />
      <RiskOracleAlert />
      <div className="flex flex-1 gap-[5px] p-[5px] overflow-hidden min-h-0">
        <div className="flex flex-col flex-1 gap-[5px] min-w-0">
          <div className="arc-panel flex items-center justify-between px-4 py-2 shrink-0">
            <ChartHeader />
            <div className="flex items-center gap-3">
              <AISignalBadge />
              <FundingBadge />
              {!isConnected && (
                <span className="text-xs text-arc-yellow flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-arc-yellow animate-pulse" />
                  Reconnecting...
                </span>
              )}
            </div>
          </div>
          <div className="arc-panel flex-1 min-h-0 overflow-hidden relative">
            <PriceChart />
          </div>
          <div className="arc-panel" style={{ height: 220 }}>
            <PositionPanel />
          </div>
        </div>
        <div className="flex flex-col gap-[5px] w-[260px] shrink-0">
          <div className="arc-panel flex-1 min-h-0 overflow-hidden">
            <Orderbook />
          </div>
          <div className="arc-panel" style={{ height: 180 }}>
            <RecentTrades />
          </div>
        </div>
        <div className="arc-panel w-[300px] shrink-0 overflow-y-auto">
          <TradeForm />
        </div>
      </div>
    </div>
  );
}

function ChartHeader() {
  const { selectedMarket, prices } = useTradingStore();
  const price = prices[selectedMarket];
  const isPositive = (price?.change24h ?? 0) >= 0;
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-arc-surface-2 border border-arc-border flex items-center justify-center text-xs font-bold text-arc-accent">
          {selectedMarket.slice(0, 1)}
        </div>
        <span className="font-semibold text-arc-text">{selectedMarket}</span>
        <span className="text-xs text-arc-muted bg-arc-surface-2 px-2 py-0.5 rounded-full border border-arc-border">Perp</span>
      </div>
      {price && (
        <>
          <span className="font-mono font-bold text-lg text-arc-text">
            ${price.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={`text-sm font-medium ${isPositive ? "text-arc-green" : "text-arc-red"}`}>
            {isPositive ? "+" : ""}{price.change24h?.toFixed(2)}%
          </span>
          <span className="text-xs text-arc-muted">Vol ${((price.volume24h ?? 0) / 1e6).toFixed(1)}M</span>
        </>
      )}
    </div>
  );
}

function FundingBadge() {
  const { selectedMarket, fundingRates } = useTradingStore();
  const funding = fundingRates[selectedMarket];
  if (!funding) return null;
  const rate = funding.rate * 100;
  const isPositive = rate >= 0;
  const hours = Math.floor(funding.nextFundingIn / 3600);
  const mins = Math.floor((funding.nextFundingIn % 3600) / 60);
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-arc-muted">Funding</span>
      <span className={`font-mono font-medium ${isPositive ? "text-arc-green" : "text-arc-red"}`}>
        {isPositive ? "+" : ""}{rate.toFixed(4)}%
      </span>
      <span className="text-arc-muted">{String(hours).padStart(2,"0")}:{String(mins).padStart(2,"0")}</span>
    </div>
  );
}
