"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTradingStore } from "@/store/tradingStore";
import { useWallet } from "@/hooks/useWallet";
import { placeOrder } from "@/lib/api";

const LEVERAGE_PRESETS = [2, 5, 10, 20, 50];

export function TradeForm() {
  const wallet = useWallet();
  const {
    selectedMarket, prices, tradeForm, isSubmitting,
    updateTradeForm, setSubmitting, setError, error,
    computeLiquidationPrice, computeRequiredMargin, balance, availableMargin,
  } = useTradingStore();

  const price = prices[selectedMarket];
  const liqPrice = computeLiquidationPrice();
  const requiredMargin = computeRequiredMargin();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sizePercent, setSizePercent] = useState(0);

  const setSideAndClear = (side: "LONG" | "SHORT") => {
    updateTradeForm({ side });
    setError(null);
  };

  const setPercent = (pct: number) => {
    setSizePercent(pct);
    const maxSize = (availableMargin * tradeForm.leverage * pct) / 100;
    if (price) {
      const contracts = maxSize / price.price;
      updateTradeForm({ size: contracts.toFixed(4) });
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!wallet.isConnected) { wallet.connect(); return; }
    if (!wallet.isCorrectChain) { wallet.switchToArc(); return; }
    if (!tradeForm.size || parseFloat(tradeForm.size) <= 0) {
      setError("Enter a valid size"); return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min

      // EIP-712 sign
      const domain = {
        name: "ArcPerpX",
        version: "1",
        chainId: 2001,
        verifyingContract: process.env.NEXT_PUBLIC_PERP_ENGINE_ADDRESS,
      };
      const orderType = {
        Order: [
          { name: "market", type: "string" },
          { name: "side", type: "string" },
          { name: "size", type: "uint256" },
          { name: "price", type: "uint256" },
          { name: "leverage", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const { ethers } = await import("ethers");
      const orderValue = {
        market: selectedMarket,
        side: tradeForm.side,
        size: ethers.parseEther(tradeForm.size),
        price: ethers.parseEther(tradeForm.orderType === "MARKET" ? "0" : (tradeForm.price || "0")),
        leverage: BigInt(tradeForm.leverage * 100),
        nonce: BigInt(nonce),
        deadline: BigInt(deadline),
      };

      const signature = await wallet.signTypedData(domain, orderType, orderValue);

      await placeOrder({
        market: selectedMarket,
        side: tradeForm.side,
        type: tradeForm.orderType,
        size: parseFloat(tradeForm.size),
        price: tradeForm.orderType === "LIMIT" ? parseFloat(tradeForm.price) : undefined,
        leverage: tradeForm.leverage * 100,
        marginMode: tradeForm.marginMode,
        collateralToken: process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x0",
        slippageBps: tradeForm.slippage * 10,
        signature,
        nonce,
        deadline,
      });

      updateTradeForm({ size: "", price: "" });
      setSizePercent(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  }, [wallet, tradeForm, selectedMarket, setSubmitting, setError, updateTradeForm]);

  const isLong = tradeForm.side === "LONG";
  const notionalValue = price ? parseFloat(tradeForm.size || "0") * price.price : 0;

  return (
    <div className="p-4 flex flex-col gap-4 h-full">

      {/* Long / Short toggle */}
      <div className="flex rounded-lg overflow-hidden border border-arc-border">
        <button
          onClick={() => setSideAndClear("LONG")}
          className={`flex-1 py-2.5 text-sm font-bold transition-all duration-200 ${
            isLong
              ? "bg-arc-green text-[#001a0e] shadow-green"
              : "bg-arc-surface text-arc-muted hover:text-arc-green"
          }`}
        >
          ▲ LONG
        </button>
        <button
          onClick={() => setSideAndClear("SHORT")}
          className={`flex-1 py-2.5 text-sm font-bold transition-all duration-200 ${
            !isLong
              ? "bg-arc-red text-white shadow-red"
              : "bg-arc-surface text-arc-muted hover:text-arc-red"
          }`}
        >
          ▼ SHORT
        </button>
      </div>

      {/* Order type tabs */}
      <div className="flex gap-1 bg-arc-surface-2 rounded-lg p-1">
        {(["MARKET", "LIMIT", "STOP"] as const).map((t) => (
          <button
            key={t}
            onClick={() => updateTradeForm({ orderType: t })}
            className={`flex-1 py-1 text-xs font-semibold rounded-md transition-colors ${
              tradeForm.orderType === t
                ? "bg-arc-surface text-arc-accent border border-arc-border"
                : "text-arc-muted hover:text-arc-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Margin Mode */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-arc-muted">Margin Mode</span>
        <div className="flex gap-1 bg-arc-surface-2 rounded-lg p-0.5">
          {(["CROSS", "ISOLATED"] as const).map((m) => (
            <button
              key={m}
              onClick={() => updateTradeForm({ marginMode: m })}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                tradeForm.marginMode === m
                  ? "bg-arc-surface text-arc-accent border border-arc-border"
                  : "text-arc-muted hover:text-arc-text"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Limit / Stop price inputs */}
      <AnimatePresence>
        {tradeForm.orderType !== "MARKET" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <label className="block mb-1 text-xs text-arc-muted">
              {tradeForm.orderType === "LIMIT" ? "Limit Price" : "Stop Price"} (USDC)
            </label>
            <input
              type="number"
              className="arc-input font-mono-data"
              placeholder={price?.price.toFixed(2) || "0.00"}
              value={tradeForm.orderType === "LIMIT" ? tradeForm.price : tradeForm.stopPrice}
              onChange={(e) =>
                updateTradeForm(
                  tradeForm.orderType === "LIMIT"
                    ? { price: e.target.value }
                    : { stopPrice: e.target.value }
                )
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Size input */}
      <div>
        <div className="flex justify-between mb-1">
          <label className="text-xs text-arc-muted">Size (Contracts)</label>
          <span className="text-xs text-arc-muted font-mono-data">
            ≈ ${notionalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
        </div>
        <input
          type="number"
          className="arc-input font-mono-data"
          placeholder="0.00"
          value={tradeForm.size}
          onChange={(e) => { updateTradeForm({ size: e.target.value }); setSizePercent(0); }}
        />
        {/* Percent shortcuts */}
        <div className="flex gap-1.5 mt-2">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => setPercent(pct)}
              className={`flex-1 py-1 text-xs rounded-md border transition-colors ${
                sizePercent === pct
                  ? "border-arc-accent text-arc-accent bg-arc-accent-dim"
                  : "border-arc-border text-arc-muted hover:border-arc-border-2 hover:text-arc-text"
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Leverage slider */}
      <div>
        <div className="flex justify-between mb-2">
          <span className="text-xs text-arc-muted">Leverage</span>
          <span className="text-xs font-bold text-arc-accent font-mono-data">{tradeForm.leverage}×</span>
        </div>
        <input
          type="range"
          min={1} max={50} step={1}
          value={tradeForm.leverage}
          onChange={(e) => updateTradeForm({ leverage: Number(e.target.value) })}
          className="w-full accent-arc-accent h-1"
          style={{ accentColor: "var(--arc-accent)" }}
        />
        <div className="flex justify-between mt-1.5">
          {LEVERAGE_PRESETS.map((l) => (
            <button
              key={l}
              onClick={() => updateTradeForm({ leverage: l })}
              className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
                tradeForm.leverage === l
                  ? "text-arc-accent bg-arc-accent-dim border border-arc-accent/30"
                  : "text-arc-muted hover:text-arc-text"
              }`}
            >
              {l}×
            </button>
          ))}
        </div>
      </div>

      {/* Order summary */}
      <div className="arc-panel-2 p-3 space-y-2 text-xs">
        <SummaryRow label="Entry Price">
          <span className="font-mono-data text-arc-text">
            {tradeForm.orderType === "MARKET"
              ? `~$${price?.price.toFixed(2) || "—"}`
              : `$${tradeForm.price || "—"}`}
          </span>
        </SummaryRow>
        <SummaryRow label="Liq. Price">
          <span className={`font-mono-data font-semibold ${isLong ? "text-loss" : "text-profit"}`}>
            ${liqPrice > 0 ? liqPrice.toFixed(2) : "—"}
          </span>
        </SummaryRow>
        <SummaryRow label="Required Margin">
          <span className="font-mono-data text-arc-text">
            ${requiredMargin > 0 ? requiredMargin.toFixed(2) : "—"} USDC
          </span>
        </SummaryRow>
        <SummaryRow label="Available">
          <span className="font-mono-data text-arc-green">
            ${availableMargin.toFixed(2)} USDC
          </span>
        </SummaryRow>
        <div className="border-t border-arc-border pt-2">
          <SummaryRow label="Taker Fee (0.10%)">
            <span className="font-mono-data text-arc-muted">
              ${(notionalValue * 0.001).toFixed(4)}
            </span>
          </SummaryRow>
        </div>
      </div>

      {/* Advanced Settings */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-xs text-arc-muted hover:text-arc-text transition-colors text-left flex items-center gap-1"
      >
        <span>{showAdvanced ? "▲" : "▼"}</span> Advanced Settings
      </button>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-3"
          >
            <div>
              <label className="text-xs text-arc-muted block mb-1">
                Slippage Tolerance: {tradeForm.slippage}%
              </label>
              <div className="flex gap-2">
                {[0.1, 0.3, 0.5, 1.0].map((v) => (
                  <button
                    key={v}
                    onClick={() => updateTradeForm({ slippage: v })}
                    className={`flex-1 py-1 text-xs rounded-md border transition-colors ${
                      tradeForm.slippage === v
                        ? "border-arc-accent text-arc-accent bg-arc-accent-dim"
                        : "border-arc-border text-arc-muted"
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg px-3 py-2 text-xs text-arc-red bg-arc-red/10 border border-arc-red/20"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className={`w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
          !wallet.isConnected
            ? "btn-primary"
            : !wallet.isCorrectChain
            ? "border border-arc-yellow text-arc-yellow hover:bg-arc-yellow/10"
            : isLong
            ? "btn-long"
            : "btn-short"
        }`}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            Signing...
          </span>
        ) : !wallet.isConnected ? (
          "Connect MetaMask"
        ) : !wallet.isCorrectChain ? (
          "Switch to Arc Testnet"
        ) : isLong ? (
          `▲ Long ${selectedMarket}`
        ) : (
          `▼ Short ${selectedMarket}`
        )}
      </button>
    </div>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-arc-muted">{label}</span>
      {children}
    </div>
  );
}
