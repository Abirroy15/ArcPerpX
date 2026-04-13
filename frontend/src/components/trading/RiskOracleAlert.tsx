"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useTradingStore } from "@/store/tradingStore";
import axios from "axios";

interface RiskAlert {
  market: string;
  risk_level: number;
  anomaly_type: string | null;
  margin_multiplier: number;
  cascade_probability: number;
  description: string;
}

export function RiskOracleAlert() {
  const { selectedMarket } = useTradingStore();
  const [dismissed, setDismissed] = useState(false);

  const { data: riskData } = useQuery<RiskAlert>({
    queryKey: ["risk", selectedMarket],
    queryFn: async () => {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_AI_ENGINE_URL || "http://localhost:8000"}/oracle/${selectedMarket}`
      );
      return res.data;
    },
    refetchInterval: 10_000,
  });

  // Reset dismissed state when market changes or risk drops
  useEffect(() => {
    setDismissed(false);
  }, [selectedMarket]);

  const risk = riskData;
  const showAlert = risk && risk.risk_level > 0.5 && !dismissed;

  const severity =
    risk?.risk_level! > 0.8
      ? { color: "text-arc-red", bg: "bg-arc-red/10", border: "border-arc-red/40", icon: "🚨" }
      : { color: "text-arc-yellow", bg: "bg-arc-yellow/10", border: "border-arc-yellow/40", icon: "⚠️" };

  return (
    <AnimatePresence>
      {showAlert && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className={`flex items-center justify-between px-4 py-2 border-b ${severity.bg} ${severity.border} border-b`}
        >
          <div className={`flex items-center gap-2 text-xs ${severity.color}`}>
            <span>{severity.icon}</span>
            <span className="font-bold uppercase tracking-wide">
              AI Risk Oracle
            </span>
            <span className="text-arc-text/80 font-normal">
              {risk?.anomaly_type
                ? `${risk.anomaly_type.replace("_", " ").toUpperCase()} detected`
                : "Elevated risk detected"}
            </span>
            <span>·</span>
            <span>Risk Level: {(risk?.risk_level! * 100).toFixed(0)}%</span>
            {risk?.margin_multiplier && risk.margin_multiplier > 1.2 && (
              <>
                <span>·</span>
                <span>Margin requirements increased {((risk.margin_multiplier - 1) * 100).toFixed(0)}%</span>
              </>
            )}
            {risk?.cascade_probability && risk.cascade_probability > 0.5 && (
              <>
                <span>·</span>
                <span className="text-arc-red font-semibold">
                  Cascade probability: {(risk.cascade_probability * 100).toFixed(0)}%
                </span>
              </>
            )}
          </div>
          <button
            onClick={() => setDismissed(true)}
            className={`text-xs ${severity.color} hover:opacity-70 transition-opacity`}
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
