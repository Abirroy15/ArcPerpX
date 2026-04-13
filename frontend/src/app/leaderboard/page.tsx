"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { fetchLeaderboard } from "@/lib/api";

type LeaderType = "traders" | "agents" | "strategies";

const TIER_CONFIG = [
  { name: "LEGEND", min: 100000, color: "#ffd60a", glow: "#ffd60a55", icon: "👑" },
  { name: "SENTINEL", min: 25000, color: "#7c3aed", glow: "#7c3aed44", icon: "🛡️" },
  { name: "EXPERT", min: 5000, color: "#00d4ff", glow: "#00d4ff44", icon: "⚡" },
  { name: "TRADER", min: 1000, color: "#00e5a0", glow: "#00e5a044", icon: "📈" },
  { name: "APPRENTICE", min: 0, color: "#5c7a9e", glow: "transparent", icon: "🌱" },
];

function getTier(xp: number) {
  return TIER_CONFIG.find((t) => xp >= t.min) || TIER_CONFIG[4];
}

export default function LeaderboardPage() {
  const [type, setType] = useState<LeaderType>("traders");
  const [season, setSeason] = useState("current");

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", type, season],
    queryFn: () => fetchLeaderboard(type, season),
  });

  const entries = data?.entries || MOCK_LEADERBOARD;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-arc-text flex items-center gap-3">
            🏆 Leaderboard
          </h1>
          <p className="text-sm text-arc-muted mt-1">Season rankings, XP, and achievements</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="arc-panel px-3 py-1.5 text-xs text-arc-accent font-medium">
            Season 1 · Ends in 12d 4h
          </div>
        </div>
      </div>

      {/* Tier legend */}
      <div className="flex flex-wrap gap-2">
        {TIER_CONFIG.map((tier) => (
          <div
            key={tier.name}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 border text-xs font-medium"
            style={{
              borderColor: tier.color + "44",
              backgroundColor: tier.glow,
              color: tier.color,
            }}
          >
            <span>{tier.icon}</span>
            {tier.name}
            <span className="text-arc-subtle">
              {tier.min >= 1000 ? `${tier.min / 1000}K` : tier.min}+ XP
            </span>
          </div>
        ))}
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 bg-arc-surface rounded-xl p-1 w-fit border border-arc-border">
        {(["traders", "agents", "strategies"] as LeaderType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              type === t
                ? "bg-arc-surface-2 text-arc-accent border border-arc-border"
                : "text-arc-muted hover:text-arc-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Top 3 podium */}
      {entries.length >= 3 && (
        <div className="flex items-end justify-center gap-4 py-6">
          {/* 2nd place */}
          <PodiumEntry entry={entries[1]} rank={2} />
          {/* 1st place */}
          <PodiumEntry entry={entries[0]} rank={1} tall />
          {/* 3rd place */}
          <PodiumEntry entry={entries[2]} rank={3} />
        </div>
      )}

      {/* Full table */}
      <div className="arc-panel overflow-hidden">
        <div className="grid grid-cols-[40px_1fr_80px_100px_100px_100px_100px] gap-4 px-6 py-3 text-[10px] text-arc-subtle font-medium uppercase tracking-wider border-b border-arc-border">
          <span>#</span>
          <span>Trader</span>
          <span>Tier</span>
          <span className="text-right">XP</span>
          <span className="text-right">Win Rate</span>
          <span className="text-right">Total PnL</span>
          <span className="text-right">Sharpe</span>
        </div>

        {entries.map((entry: LeaderEntry, i: number) => (
          <motion.div
            key={entry.address}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <LeaderRow entry={entry} rank={i + 1} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────

interface LeaderEntry {
  address: string;
  username?: string;
  xp: number;
  winRate: number;
  totalPnl: number;
  sharpe: number;
  trades: number;
  badges: string[];
}

function PodiumEntry({
  entry,
  rank,
  tall,
}: {
  entry: LeaderEntry;
  rank: number;
  tall?: boolean;
}) {
  const tier = getTier(entry.xp);
  const medals = ["", "🥇", "🥈", "🥉"];

  return (
    <div className={`flex flex-col items-center gap-2 ${tall ? "mb-0" : "mb-4"}`}>
      <div className="text-2xl">{medals[rank]}</div>
      <div
        className="w-16 h-16 rounded-full border-2 flex items-center justify-center text-lg font-bold"
        style={{ borderColor: tier.color, boxShadow: `0 0 20px ${tier.glow}`, color: tier.color }}
      >
        {(entry.username || entry.address.slice(0, 2)).toUpperCase().slice(0, 2)}
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-arc-text">
          {entry.username || `${entry.address.slice(0, 6)}...`}
        </div>
        <div className="text-xs font-mono-data" style={{ color: tier.color }}>
          {entry.xp.toLocaleString()} XP
        </div>
      </div>
      <div
        className={`w-24 flex items-end justify-center rounded-t-lg border-t border-x`}
        style={{
          height: tall ? 80 : 56,
          borderColor: tier.color + "44",
          backgroundColor: tier.glow,
        }}
      >
        <span className="text-4xl font-black mb-1" style={{ color: tier.color + "66" }}>
          {rank}
        </span>
      </div>
    </div>
  );
}

function LeaderRow({ entry, rank }: { entry: LeaderEntry; rank: number }) {
  const tier = getTier(entry.xp);
  const isTop3 = rank <= 3;

  return (
    <div
      className={`grid grid-cols-[40px_1fr_80px_100px_100px_100px_100px] gap-4 px-6 py-3 items-center border-b border-arc-border/50 hover:bg-arc-surface-2 transition-colors ${
        isTop3 ? "bg-arc-surface-2/50" : ""
      }`}
    >
      <span
        className={`text-sm font-bold font-mono-data ${
          rank === 1 ? "text-arc-yellow" : rank === 2 ? "text-arc-muted" : rank === 3 ? "text-[#cd7f32]" : "text-arc-subtle"
        }`}
      >
        {rank}
      </span>

      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0"
          style={{ borderColor: tier.color + "66", color: tier.color }}
        >
          {(entry.username || entry.address.slice(2, 4)).toUpperCase().slice(0, 2)}
        </div>
        <div>
          <div className="text-sm font-semibold text-arc-text">
            {entry.username || `${entry.address.slice(0, 8)}...${entry.address.slice(-4)}`}
          </div>
          <div className="flex gap-1 mt-0.5">
            {entry.badges.slice(0, 3).map((b) => (
              <span key={b} className="text-xs">{b}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1" style={{ color: tier.color }}>
        <span className="text-xs">{tier.icon}</span>
        <span className="text-xs font-medium">{tier.name}</span>
      </div>

      <span className="text-right font-mono-data text-xs text-arc-text">
        {entry.xp.toLocaleString()}
      </span>
      <span className={`text-right font-mono-data text-xs font-semibold ${entry.winRate > 50 ? "text-profit" : "text-loss"}`}>
        {entry.winRate.toFixed(1)}%
      </span>
      <span className={`text-right font-mono-data text-xs font-semibold ${entry.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
        {entry.totalPnl >= 0 ? "+" : ""}${Math.abs(entry.totalPnl).toLocaleString()}
      </span>
      <span className="text-right font-mono-data text-xs text-arc-text">
        {entry.sharpe.toFixed(2)}
      </span>
    </div>
  );
}

// ── Mock Data ─────────────────────────────────────────────────────────────

const MOCK_LEADERBOARD: LeaderEntry[] = [
  { address: "0xAB12", username: "ArcAlpha", xp: 142000, winRate: 73.2, totalPnl: 48200, sharpe: 3.12, trades: 892, badges: ["👑", "⚡", "🔥"] },
  { address: "0xCD34", username: "DeepMind", xp: 87500, winRate: 68.1, totalPnl: 31500, sharpe: 2.78, trades: 654, badges: ["🛡️", "💎"] },
  { address: "0xEF56", username: "Sigma7", xp: 52000, winRate: 61.4, totalPnl: 18900, sharpe: 2.31, trades: 421, badges: ["⚡", "🎯"] },
  { address: "0x7891", xp: 28000, winRate: 58.3, totalPnl: 12400, sharpe: 1.94, trades: 287, badges: ["📈"] },
  { address: "0xABCD", username: "FluxTrader", xp: 18500, winRate: 55.7, totalPnl: 8700, sharpe: 1.65, trades: 198, badges: ["🌊"] },
  { address: "0x1234", xp: 9200, winRate: 52.1, totalPnl: 4200, sharpe: 1.21, trades: 134, badges: [] },
  { address: "0x5678", username: "NovaCap", xp: 4800, winRate: 49.8, totalPnl: 1800, sharpe: 0.98, trades: 87, badges: [] },
  { address: "0x9ABC", xp: 2100, winRate: 47.3, totalPnl: -400, sharpe: 0.71, trades: 52, badges: [] },
];
