"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTradingStore } from "@/store/tradingStore";
import { closePosition } from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";

type Tab = "positions" | "orders" | "history";

export function PositionPanel() {
  const [tab, setTab] = useState<Tab>("positions");
  const { positions, openOrders, tradeHistory, prices } = useTradingStore();
  const wallet = useWallet();

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center border-b border-arc-border shrink-0">
        {(["positions", "orders", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`arc-tab capitalize ${tab === t ? "active" : ""}`}
          >
            {t}
            {t === "positions" && positions.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[9px] rounded-full bg-arc-accent/20 text-arc-accent font-bold">
                {positions.length}
              </span>
            )}
            {t === "orders" && openOrders.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[9px] rounded-full bg-arc-yellow/20 text-arc-yellow font-bold">
                {openOrders.length}
              </span>
            )}
          </button>
        ))}

        {/* Summary stats */}
        {tab === "positions" && positions.length > 0 && (
          <div className="ml-auto flex items-center gap-4 px-4 text-xs">
            <TotalPnlBadge />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          {tab === "positions" && (
            <motion.div
              key="positions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {positions.length === 0 ? (
                <EmptyState message="No open positions" />
              ) : (
                <div className="min-w-max">
                  <PositionTableHeader />
                  {positions.map((pos) => (
                    <PositionRow key={pos.id} position={pos} wallet={wallet} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === "orders" && (
            <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {openOrders.length === 0 ? (
                <EmptyState message="No open orders" />
              ) : (
                <div className="min-w-max">
                  <OrderTableHeader />
                  {openOrders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === "history" && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {tradeHistory.length === 0 ? (
                <EmptyState message="No trade history" />
              ) : (
                <div className="min-w-max">
                  <OrderTableHeader />
                  {tradeHistory.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Position Row ──────────────────────────────────────────────────────────

function PositionRow({ position: pos, wallet }: { position: ReturnType<typeof useTradingStore>["positions"][0]; wallet: ReturnType<typeof useWallet> }) {
  const [closing, setClosing] = useState(false);
  const { prices } = useTradingStore();

  const currentPrice = prices[pos.market]?.price || pos.entryPrice;
  const pnl = pos.unrealizedPnl || 0;
  const isProfit = pnl >= 0;

  // Live liq price display
  const liqDist = Math.abs(currentPrice - pos.liquidationPrice) / currentPrice * 100;

  const handleClose = async () => {
    if (!wallet.isConnected) return;
    setClosing(true);
    try {
      await closePosition(pos.id, wallet.signTypedData);
    } catch (e) {
      console.error(e);
    } finally {
      setClosing(false);
    }
  };

  const cols = "grid grid-cols-[100px_80px_80px_90px_90px_90px_90px_80px_100px]";

  return (
    <div
      className={`${cols} items-center gap-4 px-4 py-2 text-xs border-b border-arc-border/50 hover:bg-arc-surface-2 transition-colors`}
    >
      <div className="flex flex-col">
        <span className="font-semibold text-arc-text">{pos.market}</span>
        <span className={`text-[10px] font-bold ${pos.side === "LONG" ? "text-profit" : "text-loss"}`}>
          {pos.side} {pos.leverage}×
        </span>
      </div>
      <span className="font-mono-data text-arc-text">{pos.size.toFixed(3)}</span>
      <span className="font-mono-data text-arc-text">${pos.entryPrice.toFixed(2)}</span>
      <span className="font-mono-data text-arc-text">${currentPrice.toFixed(2)}</span>
      <span className={`font-mono-data font-semibold ${pos.side === "LONG" ? "text-loss" : "text-profit"}`}>
        ${pos.liquidationPrice.toFixed(2)}
        <span className="ml-1 text-arc-subtle text-[9px]">{liqDist.toFixed(1)}% away</span>
      </span>
      <span className="font-mono-data text-arc-text">${pos.margin.toFixed(2)}</span>
      <div className={`font-mono-data font-bold ${isProfit ? "text-profit" : "text-loss"}`}>
        {isProfit ? "+" : ""}${pnl.toFixed(2)}
        <div className={`text-[10px] font-medium ${isProfit ? "text-profit" : "text-loss"}`}>
          ({isProfit ? "+" : ""}{pos.unrealizedPnlPct.toFixed(2)}%)
        </div>
      </div>
      <span className="font-mono-data text-arc-muted text-[10px]">
        {pos.fundingAccrued >= 0 ? "+" : ""}${pos.fundingAccrued?.toFixed(4) || "0.0000"}
      </span>
      <button
        onClick={handleClose}
        disabled={closing}
        className="px-3 py-1 rounded-lg text-[10px] font-bold border border-arc-red/50 text-arc-red hover:bg-arc-red/10 transition-colors disabled:opacity-50"
      >
        {closing ? "..." : "Close"}
      </button>
    </div>
  );
}

function PositionTableHeader() {
  const cols = "grid grid-cols-[100px_80px_80px_90px_90px_90px_90px_80px_100px]";
  const headers = ["Market", "Size", "Entry", "Mark", "Liq Price", "Margin", "Unr. PnL", "Funding", "Actions"];

  return (
    <div className={`${cols} gap-4 px-4 py-2 text-[10px] text-arc-subtle font-medium uppercase tracking-wider border-b border-arc-border bg-arc-surface sticky top-0`}>
      {headers.map((h) => <span key={h}>{h}</span>)}
    </div>
  );
}

// ── Order Row ─────────────────────────────────────────────────────────────

function OrderRow({ order }: { order: ReturnType<typeof useTradingStore>["openOrders"][0] }) {
  return (
    <div className="grid grid-cols-[100px_80px_80px_80px_80px_80px] items-center gap-4 px-4 py-2 text-xs border-b border-arc-border/50 hover:bg-arc-surface-2 transition-colors">
      <span className="text-arc-text font-semibold">{order.market}</span>
      <span className={`font-bold ${order.side === "LONG" ? "text-profit" : "text-loss"}`}>{order.side}</span>
      <span className="text-arc-muted font-mono-data">{order.type}</span>
      <span className="font-mono-data text-arc-text">{order.size.toFixed(3)}</span>
      <span className="font-mono-data text-arc-text">${order.price?.toFixed(2) || "Market"}</span>
      <StatusBadge status={order.status} />
    </div>
  );
}

function OrderTableHeader() {
  return (
    <div className="grid grid-cols-[100px_80px_80px_80px_80px_80px] gap-4 px-4 py-2 text-[10px] text-arc-subtle font-medium uppercase tracking-wider border-b border-arc-border bg-arc-surface sticky top-0">
      {["Market", "Side", "Type", "Size", "Price", "Status"].map((h) => <span key={h}>{h}</span>)}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    OPEN: "text-arc-yellow bg-arc-yellow/10 border-arc-yellow/30",
    FILLED: "text-arc-green bg-arc-green/10 border-arc-green/30",
    CANCELLED: "text-arc-muted bg-arc-surface-2 border-arc-border",
    PARTIAL: "text-arc-accent bg-arc-accent/10 border-arc-accent/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${colors[status] || ""}`}>
      {status}
    </span>
  );
}

function TotalPnlBadge() {
  const { positions } = useTradingStore();
  const total = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);
  const isProfit = total >= 0;
  return (
    <div className={`flex items-center gap-1 font-mono-data font-semibold text-sm ${isProfit ? "text-profit" : "text-loss"}`}>
      <span>Total PnL:</span>
      <span>{isProfit ? "+" : ""}${total.toFixed(2)}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full py-8 text-sm text-arc-subtle">
      {message}
    </div>
  );
}
