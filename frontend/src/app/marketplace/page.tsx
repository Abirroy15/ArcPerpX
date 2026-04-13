"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { fetchMarketplace } from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";

export default function MarketplacePage() {
  const wallet = useWallet();
  const [filter, setFilter] = useState<"all" | "for-sale" | "copy-trade">("all");
  const [sort, setSort] = useState("sharpe");

  const { data, isLoading } = useQuery({
    queryKey: ["marketplace", sort],
    queryFn: () => fetchMarketplace(sort),
    placeholderData: { agents: MOCK_AGENTS },
  });

  const agents = ((data?.agents || MOCK_AGENTS) as typeof MOCK_AGENTS).filter((a) => {
    if (filter === "for-sale") return a.listPrice > 0;
    if (filter === "copy-trade") return a.copyFee > 0;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-arc-text flex items-center gap-3">
          🛒 Strategy Marketplace
        </h1>
        <p className="text-sm text-arc-muted mt-1">
          Buy proven strategies, copy top agents, or list your own for passive income
        </p>
      </div>

      {/* Stats banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Listed Agents", value: "2,841" },
          { label: "Copy Traders", value: "14,209" },
          { label: "Volume (7d)", value: "$1.2M" },
          { label: "Creator Earnings", value: "$84K" },
        ].map((s) => (
          <div key={s.label} className="arc-panel p-3 text-center">
            <div className="text-lg font-bold font-mono-data text-arc-accent">{s.value}</div>
            <div className="text-xs text-arc-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-arc-surface rounded-xl p-1 border border-arc-border">
          {(["all", "for-sale", "copy-trade"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                filter === f
                  ? "bg-arc-surface-2 text-arc-accent border border-arc-border"
                  : "text-arc-muted hover:text-arc-text"
              }`}
            >
              {f.replace("-", " ")}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-arc-muted">Sort:</span>
          {[
            { value: "sharpe", label: "Sharpe" },
            { value: "pnl", label: "PnL" },
            { value: "winRate", label: "Win Rate" },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setSort(s.value)}
              className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                sort === s.value
                  ? "border-arc-accent text-arc-accent bg-arc-accent/10"
                  : "border-arc-border text-arc-muted hover:text-arc-text"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Agent grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="arc-panel p-6 h-64 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <MarketplaceAgentCard agent={agent} wallet={wallet} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Marketplace Agent Card ─────────────────────────────────────────────────

interface MarketAgent {
  id: string;
  name: string;
  owner: string;
  strategyType: string;
  market: string;
  generation: number;
  winRate: number;
  totalPnl: number;
  sharpe: number;
  listPrice: number;
  copyFee: number;
  followers: number;
  badges: string[];
  tier: string;
}

function MarketplaceAgentCard({ agent, wallet }: { agent: MarketAgent; wallet: ReturnType<typeof useWallet> }) {
  const tierColor: Record<string, string> = {
    LEGEND: "#ffd60a",
    SENTINEL: "#7c3aed",
    EXPERT: "#00d4ff",
    TRADER: "#00e5a0",
    APPRENTICE: "#5c7a9e",
  };
  const color = tierColor[agent.tier] || "#5c7a9e";

  return (
    <div className="arc-panel p-5 space-y-4 hover:border-arc-border-2 transition-all duration-200 group">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold" style={{ color }}>{agent.tier}</span>
            <span className="text-xs text-arc-muted">Gen {agent.generation}</span>
          </div>
          <h3 className="font-bold text-arc-text">{agent.name}</h3>
          <p className="text-xs text-arc-muted">
            {agent.strategyType} · {agent.market} ·{" "}
            <span className="font-mono-data text-arc-subtle">
              {agent.owner.slice(0, 6)}...{agent.owner.slice(-4)}
            </span>
          </p>
        </div>
        <div className="flex gap-1">
          {agent.badges.map((b) => (
            <span key={b} title={b}>{b}</span>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="arc-panel-2 p-2">
          <div className={`text-sm font-bold font-mono-data ${agent.winRate > 50 ? "text-profit" : "text-loss"}`}>
            {agent.winRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-arc-subtle">Win Rate</div>
        </div>
        <div className="arc-panel-2 p-2">
          <div className={`text-sm font-bold font-mono-data ${agent.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
            {agent.totalPnl >= 0 ? "+" : ""}${Math.abs(agent.totalPnl / 1000).toFixed(1)}K
          </div>
          <div className="text-[10px] text-arc-subtle">Total PnL</div>
        </div>
        <div className="arc-panel-2 p-2">
          <div className="text-sm font-bold font-mono-data text-arc-text">{agent.sharpe.toFixed(2)}</div>
          <div className="text-[10px] text-arc-subtle">Sharpe</div>
        </div>
      </div>

      {/* Followers bar */}
      <div className="flex items-center gap-2 text-xs text-arc-muted">
        <span>👥</span>
        <span>{agent.followers.toLocaleString()} copy traders</span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {agent.copyFee > 0 && (
          <button
            onClick={() => alert(`Copy trading: $${agent.copyFee}/month`)}
            className="flex-1 py-2 text-xs font-bold rounded-lg border border-arc-accent/40 text-arc-accent bg-arc-accent/10 hover:bg-arc-accent/20 transition-colors"
          >
            📋 Copy · ${agent.copyFee}/mo
          </button>
        )}
        {agent.listPrice > 0 && (
          <button
            onClick={() => alert(`Purchase for $${agent.listPrice}`)}
            className="flex-1 py-2 text-xs font-bold rounded-lg border border-arc-green/40 text-arc-green bg-arc-green/10 hover:bg-arc-green/20 transition-colors"
          >
            🛒 Buy · ${agent.listPrice}
          </button>
        )}
        {agent.copyFee === 0 && agent.listPrice === 0 && (
          <button className="flex-1 py-2 text-xs font-medium rounded-lg btn-ghost">
            👁 View Strategy
          </button>
        )}
      </div>
    </div>
  );
}

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_AGENTS: MarketAgent[] = [
  { id: "1", name: "Alpha Momentum v3", owner: "0xABCD1234", strategyType: "MOMENTUM", market: "ETH-USD", generation: 4, winRate: 71.2, totalPnl: 48200, sharpe: 3.12, listPrice: 500, copyFee: 29, followers: 1240, badges: ["👑", "🔥"], tier: "LEGEND" },
  { id: "2", name: "MeanRev Master", owner: "0xEF567890", strategyType: "MEAN_REVERSION", market: "BTC-USD", generation: 2, winRate: 65.8, totalPnl: 29100, sharpe: 2.41, listPrice: 0, copyFee: 19, followers: 892, badges: ["⚡"], tier: "SENTINEL" },
  { id: "3", name: "TrendBot Supreme", owner: "0x1234ABCD", strategyType: "TREND_FOLLOWING", market: "ETH-USD", generation: 6, winRate: 59.3, totalPnl: 18700, sharpe: 1.89, listPrice: 250, copyFee: 0, followers: 421, badges: ["📈"], tier: "EXPERT" },
  { id: "4", name: "Scalp King", owner: "0x5678EFAB", strategyType: "MOMENTUM", market: "SOL-USD", generation: 1, winRate: 55.1, totalPnl: 9400, sharpe: 1.42, listPrice: 0, copyFee: 9, followers: 234, badges: [], tier: "TRADER" },
  { id: "5", name: "DeltaNeutral v2", owner: "0xFEDCBA09", strategyType: "MARKET_MAKING", market: "ARB-USD", generation: 3, winRate: 68.4, totalPnl: 22000, sharpe: 2.18, listPrice: 350, copyFee: 25, followers: 671, badges: ["💎", "🤖"], tier: "SENTINEL" },
  { id: "6", name: "Genesis Alpha", owner: "0x98765432", strategyType: "TREND_FOLLOWING", market: "BTC-USD", generation: 8, winRate: 74.1, totalPnl: 61000, sharpe: 3.54, listPrice: 1000, copyFee: 49, followers: 2140, badges: ["👑", "⚡", "💎", "🔥"], tier: "LEGEND" },
];
