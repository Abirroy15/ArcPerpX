"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { fetchPositions, fetchOrders, fetchAnalytics } from "@/lib/api";
import { useTradingStore } from "@/store/tradingStore";
import { useWallet } from "@/hooks/useWallet";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";

export default function PortfolioPage() {
  const wallet = useWallet();
  const { walletAddress, positions, balance, availableMargin } = useTradingStore();

  const { data: analyticsData } = useQuery({
    queryKey: ["analytics", walletAddress],
    queryFn: () => (walletAddress ? fetchAnalytics(walletAddress) : null),
    enabled: !!walletAddress,
    placeholderData: { sharpe: 0, sortino: 0, winRate: 0, totalTrades: 0 },
  });

  const totalPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalMarginUsed = positions.reduce((s, p) => s + p.margin, 0);
  const utilizationPct = balance > 0 ? (totalMarginUsed / balance) * 100 : 0;

  // Mock equity curve
  const equityCurve = Array.from({ length: 30 }, (_, i) => ({
    day: i,
    equity: 10000 + i * 80 + (Math.random() - 0.3) * 200,
  }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-arc-text">💼 Portfolio</h1>

      {!wallet.isConnected ? (
        <div className="arc-panel p-12 text-center space-y-4">
          <div className="text-5xl">🔌</div>
          <h3 className="text-lg font-semibold text-arc-text">Connect your wallet</h3>
          <p className="text-sm text-arc-muted">View your positions, PnL, and portfolio analytics</p>
          <button onClick={wallet.connect} className="btn-primary px-6 py-2">Connect MetaMask</button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              label="Total Balance"
              value={`$${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              sub="USDC"
            />
            <SummaryCard
              label="Available Margin"
              value={`$${availableMargin.toFixed(2)}`}
              sub={`${(100 - utilizationPct).toFixed(0)}% free`}
            />
            <SummaryCard
              label="Unrealized PnL"
              value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`}
              valueClass={totalPnl >= 0 ? "text-profit" : "text-loss"}
              sub={`${positions.length} open position${positions.length !== 1 ? "s" : ""}`}
            />
            <SummaryCard
              label="Margin Used"
              value={`$${totalMarginUsed.toFixed(2)}`}
              sub={`${utilizationPct.toFixed(1)}% utilized`}
            />
          </div>

          {/* Equity curve */}
          <div className="arc-panel p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-arc-text">Equity Curve (30d)</h2>
              <div className="flex items-center gap-2 text-xs text-arc-muted">
                <span className="text-profit font-medium">+{((equityCurve[29].equity - equityCurve[0].equity) / equityCurve[0].equity * 100).toFixed(1)}%</span>
                <span>this month</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={equityCurve}>
                <Tooltip
                  contentStyle={{ background: "#0e1420", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [`$${v.toFixed(2)}`, "Equity"]}
                />
                <Line type="monotone" dataKey="equity" stroke="#00d4ff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Open Positions */}
          <div className="arc-panel overflow-hidden">
            <div className="px-4 py-3 border-b border-arc-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-arc-text">Open Positions</h2>
              <span className="text-xs text-arc-muted">{positions.length} positions</span>
            </div>

            {positions.length === 0 ? (
              <div className="py-12 text-center text-sm text-arc-subtle">No open positions</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-arc-subtle uppercase tracking-wider border-b border-arc-border">
                      {["Market", "Side", "Size", "Entry", "Mark", "Liq Price", "Margin", "PnL", "Funding"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos, i) => (
                      <motion.tr
                        key={pos.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="border-b border-arc-border/50 hover:bg-arc-surface-2 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-semibold text-arc-text">{pos.market}</td>
                        <td className={`px-4 py-2.5 font-bold ${pos.side === "LONG" ? "text-profit" : "text-loss"}`}>
                          {pos.side}
                        </td>
                        <td className="px-4 py-2.5 font-mono-data">{pos.size.toFixed(4)}</td>
                        <td className="px-4 py-2.5 font-mono-data">${pos.entryPrice.toFixed(2)}</td>
                        <td className="px-4 py-2.5 font-mono-data">${pos.currentPrice.toFixed(2)}</td>
                        <td className={`px-4 py-2.5 font-mono-data font-semibold ${pos.side === "LONG" ? "text-loss" : "text-profit"}`}>
                          ${pos.liquidationPrice.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 font-mono-data">${pos.margin.toFixed(2)}</td>
                        <td className={`px-4 py-2.5 font-mono-data font-bold ${pos.unrealizedPnl >= 0 ? "text-profit" : "text-loss"}`}>
                          {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                          <div className="text-[10px] font-medium">
                            ({pos.unrealizedPnlPct >= 0 ? "+" : ""}{pos.unrealizedPnlPct.toFixed(2)}%)
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono-data text-arc-muted text-[10px]">
                          {pos.fundingAccrued >= 0 ? "+" : ""}${pos.fundingAccrued?.toFixed(4) || "0"}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Performance Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Win Rate" value={`${(analyticsData as { winRate: number })?.winRate?.toFixed(1) || "0"}%`} />
            <SummaryCard label="Sharpe Ratio" value={(analyticsData as { sharpe: number })?.sharpe?.toFixed(2) || "0"} />
            <SummaryCard label="Sortino Ratio" value={(analyticsData as { sortino: number })?.sortino?.toFixed(2) || "0"} />
            <SummaryCard label="Total Trades" value={String((analyticsData as { totalTrades: number })?.totalTrades || 0)} />
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${valueClass || "text-arc-text"}`}>{value}</span>
      {sub && <span className="text-[11px] text-arc-muted">{sub}</span>}
    </div>
  );
}
