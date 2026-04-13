"use client";

import { useWallet } from "@/hooks/useWallet";
import { useTradingStore } from "@/store/tradingStore";

export function Navbar() {
  const wallet = useWallet();
  const { balance } = useTradingStore();

  return (
    <header className="h-12 bg-arc-surface border-b border-arc-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-black text-arc-accent tracking-tighter text-lg">
          Arc<span className="text-arc-text">PerpX</span>
        </span>
        <span className="text-[10px] text-arc-muted bg-arc-surface-2 border border-arc-border px-2 py-0.5 rounded-full font-medium">
          Arc Testnet
        </span>
      </div>

      <div className="flex items-center gap-3">
        {wallet.isConnected && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-arc-muted">Balance:</span>
            <span className="font-mono font-semibold text-arc-text">
              ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
            </span>
          </div>
        )}

        {wallet.isConnected && (
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${
            wallet.isCorrectChain
              ? "text-arc-green border-arc-green/30 bg-arc-green/10"
              : "text-arc-red border-arc-red/30 bg-arc-red/10"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${wallet.isCorrectChain ? "bg-arc-green" : "bg-arc-red"} animate-pulse`} />
            {wallet.isCorrectChain ? "Arc Testnet" : "Wrong Network"}
          </div>
        )}

        {wallet.isConnected ? (
          <div className="flex items-center gap-2">
            {!wallet.isCorrectChain && (
              <button
                onClick={wallet.switchToArc}
                className="text-xs px-3 py-1.5 rounded-lg border border-arc-yellow/50 text-arc-yellow hover:bg-arc-yellow/10 transition-colors"
              >
                Switch Network
              </button>
            )}
            <button
              onClick={wallet.disconnect}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-arc-border hover:bg-arc-surface-2 transition-colors text-arc-text"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-arc-green" />
              <span className="font-mono">
                {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
              </span>
            </button>
          </div>
        ) : (
          <button
            onClick={wallet.connect}
            disabled={wallet.isConnecting}
            className="bg-arc-accent text-arc-bg rounded-lg px-4 py-1.5 text-xs font-bold hover:brightness-110 transition-all disabled:opacity-70"
          >
            {wallet.isConnecting ? "Connecting..." : "🦊 Connect MetaMask"}
          </button>
        )}
      </div>
    </header>
  );
}
