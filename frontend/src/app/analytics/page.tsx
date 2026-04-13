"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from "recharts";
import { fetchAnalytics } from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";
import { useTradingStore } from "@/store/tradingStore";

export default function AnalyticsPage() {
  const wallet = useWallet();
  const { walletAddress } = useTradingStore();

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", walletAddress],
    queryFn: () => walletAddress ? fetchAnalytics(walletAddress) : Promise.resolve(MOCK_ANALYTICS),
    placeholderData: MOCK_ANALYTICS,
  });

  const analytics = data || MOCK_ANALYTICS;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-arc-text flex items-center gap-3">
          📊 Analytics
        </h1>
        <p className="text-sm text-arc-muted mt-1">Hyper-advanced performance metrics and behavioral analysis</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {[
          { label: "Sharpe Ratio", value: analytics.sharpe.toFixed(2), color: analytics.sharpe > 1 ? "text-profit" : "text-loss" },
          { label: "Sortino Ratio", value: analytics.sortino.toFixed(2), color: analytics.sortino > 1 ? "text-profit" : "text-loss" },
          { label: "Win Rate", value: `${analytics.winRate.toFixed(1)}%`, color: analytics.winRate > 50 ? "text-profit" : "text-loss" },
          { label: "Max Drawdown", value: `-${analytics.maxDrawdown.toFixed(1)}%`, color: "text-loss" },
          { label: "Profit Factor", value: analytics.profitFactor.toFixed(2), color: analytics.profitFactor > 1 ? "text-profit" : "text-loss" },
          { label: "Avg Trade", value: `$${analytics.avgTrade.toFixed(0)}`, color: analytics.avgTrade > 0 ? "text-profit" : "text-loss" },
        ].map((m) => (
          <div key={m.label} className="stat-card">
            <span className="stat-label">{m.label}</span>
            <span className={`stat-value ${m.color}`}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* PnL Curve */}
      <div className="arc-panel p-4">
        <h2 className="text-sm font-semibold text-arc-text mb-4">Cumulative PnL</h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={analytics.pnlCurve}>
            <defs>
              <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00e5a0" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00e5a0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4533" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#5c7a9e" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#5c7a9e" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#0e1420", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#e2eaf5" }}
            />
            <Area type="monotone" dataKey="pnl" stroke="#00e5a0" strokeWidth={2} fill="url(#pnlGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Win/Loss distribution */}
        <div className="arc-panel p-4">
          <h2 className="text-sm font-semibold text-arc-text mb-4">Win/Loss Distribution</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={analytics.pnlDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4533" />
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#5c7a9e" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#5c7a9e" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#0e1420", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {analytics.pnlDistribution.map((entry: { bucket: string; count: number }, i: number) => (
                  <Cell key={i} fill={entry.bucket.startsWith("-") ? "#ff3b5c" : "#00e5a0"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Trader profile radar */}
        <div className="arc-panel p-4">
          <h2 className="text-sm font-semibold text-arc-text mb-4">Trader Profile</h2>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={analytics.profile}>
              <PolarGrid stroke="#1e2d45" />
              <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10, fill: "#5c7a9e" }} />
              <Radar name="You" dataKey="score" stroke="#00d4ff" fill="#00d4ff" fillOpacity={0.15} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly performance heatmap */}
        <div className="arc-panel p-4 md:col-span-2">
          <h2 className="text-sm font-semibold text-arc-text mb-4">Monthly Performance Heatmap</h2>
          <div className="grid grid-cols-12 gap-1">
            {analytics.heatmap.map((cell: { month: string; pnl: number }, i: number) => {
              const intensity = Math.min(Math.abs(cell.pnl) / 5000, 1);
              const color = cell.pnl >= 0
                ? `rgba(0, 229, 160, ${0.1 + intensity * 0.7})`
                : `rgba(255, 59, 92, ${0.1 + intensity * 0.7})`;
              return (
                <div
                  key={i}
                  className="aspect-square rounded-sm flex items-center justify-center text-[9px] font-medium cursor-default transition-transform hover:scale-110"
                  style={{ backgroundColor: color }}
                  title={`${cell.month}: ${cell.pnl >= 0 ? "+" : ""}$${cell.pnl}`}
                >
                  <span className="text-arc-text opacity-70">{cell.month.slice(0, 1)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs text-arc-muted">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-arc-red/50" /> Loss
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-arc-green/50" /> Profit
            </div>
            <span className="ml-auto">Darker = higher magnitude</span>
          </div>
        </div>

        {/* Behavioral classification */}
        <div className="arc-panel p-4 md:col-span-2">
          <h2 className="text-sm font-semibold text-arc-text mb-3">Behavioral Analysis</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {analytics.behaviorTags.map((tag: { label: string; score: number; description: string }) => (
              <div key={tag.label} className="arc-panel-2 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-arc-text">{tag.label}</span>
                  <span className="text-xs font-mono-data text-arc-accent">{tag.score}%</span>
                </div>
                <div className="h-1 bg-arc-surface rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-arc-accent to-arc-purple"
                    style={{ width: `${tag.score}%` }}
                  />
                </div>
                <p className="text-[10px] text-arc-subtle mt-1.5">{tag.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_ANALYTICS = {
  sharpe: 2.14,
  sortino: 3.07,
  winRate: 62.3,
  maxDrawdown: 8.4,
  profitFactor: 2.31,
  avgTrade: 142,
  totalTrades: 284,

  pnlCurve: Array.from({ length: 30 }, (_, i) => ({
    date: `Day ${i + 1}`,
    pnl: Math.round(500 + i * 120 + (Math.random() - 0.3) * 500),
  })),

  pnlDistribution: [
    { bucket: "-$500+", count: 12 },
    { bucket: "-$200", count: 28 },
    { bucket: "-$100", count: 41 },
    { bucket: "-$50", count: 35 },
    { bucket: "$0", count: 0 },
    { bucket: "+$50", count: 52 },
    { bucket: "+$100", count: 48 },
    { bucket: "+$200", count: 38 },
    { bucket: "+$500+", count: 30 },
  ],

  profile: [
    { skill: "Risk Mgmt", score: 78 },
    { skill: "Timing", score: 65 },
    { skill: "Discipline", score: 82 },
    { skill: "Leverage", score: 55 },
    { skill: "Consistency", score: 71 },
    { skill: "Adaptability", score: 68 },
  ],

  heatmap: Array.from({ length: 24 }, (_, i) => ({
    month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i % 12],
    pnl: (Math.random() - 0.35) * 8000,
  })),

  behaviorTags: [
    { label: "Momentum Trader", score: 74, description: "Tends to follow strong price trends" },
    { label: "Risk-Aware", score: 82, description: "Good position sizing discipline" },
    { label: "Over-Leverager", score: 31, description: "Occasionally uses excessive leverage" },
    { label: "Consistent", score: 69, description: "Steady trading across market conditions" },
  ],
};
