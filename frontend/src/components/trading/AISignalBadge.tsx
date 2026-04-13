"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AISignal {
  agentId: string;
  action: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  market: string;
  timestamp: number;
}

export function AISignalBadge() {
  const [signals, setSignals] = useState<AISignal[]>([]);
  const [topSignal, setTopSignal] = useState<AISignal | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const signal = (e as CustomEvent<AISignal>).detail;
      setSignals((prev) => [signal, ...prev].slice(0, 10));
      if (!topSignal || signal.confidence > topSignal.confidence) {
        setTopSignal(signal);
      }
    };

    window.addEventListener("ai_signal", handler);
    return () => window.removeEventListener("ai_signal", handler);
  }, [topSignal]);

  if (!topSignal) return null;

  const isLong = topSignal.action === "LONG";
  const isShort = topSignal.action === "SHORT";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
          isLong
            ? "border-arc-green/40 bg-arc-green/10 text-arc-green"
            : isShort
            ? "border-arc-red/40 bg-arc-red/10 text-arc-red"
            : "border-arc-border bg-arc-surface-2 text-arc-muted"
        }`}
      >
        <span className="text-base">🤖</span>
        <div>
          <span className="font-bold">
            {topSignal.action === "HOLD" ? "HOLD" : topSignal.action === "LONG" ? "▲ LONG" : "▼ SHORT"}
          </span>
          <span className="ml-1.5 opacity-75">
            {(topSignal.confidence * 100).toFixed(0)}% confident
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
