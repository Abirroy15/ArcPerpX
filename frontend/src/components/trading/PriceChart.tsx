"use client";

import { useEffect, useRef, useState } from "react";
import { useTradingStore } from "@/store/tradingStore";

type ChartType = "candles" | "line" | "area";
type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export function PriceChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const seriesRef = useRef<unknown>(null);

  const { selectedMarket, prices } = useTradingStore();
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [isLoading, setIsLoading] = useState(true);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    let chart: unknown;

    import("lightweight-charts").then(({ createChart, CandlestickSeries, LineSeries, AreaSeries }) => {
      if (!containerRef.current) return;

      chart = createChart(containerRef.current, {
        layout: {
          background: { color: "transparent" },
          textColor: "#5c7a9e",
        },
        grid: {
          vertLines: { color: "#1e2d4522" },
          horzLines: { color: "#1e2d4522" },
        },
        crosshair: {
          mode: 1,
          vertLine: { color: "#00d4ff44", labelBackgroundColor: "#0e1420" },
          horzLine: { color: "#00d4ff44", labelBackgroundColor: "#0e1420" },
        },
        timeScale: {
          borderColor: "#1e2d45",
          timeVisible: true,
          secondsVisible: timeframe === "1m",
        },
        rightPriceScale: {
          borderColor: "#1e2d45",
        },
        handleScroll: true,
        handleScale: true,
      });

      chartRef.current = chart;

      // Add series based on type
      let series: unknown;
      if (chartType === "candles") {
        series = (chart as ReturnType<typeof createChart>).addSeries(CandlestickSeries, {
          upColor: "#00e5a0",
          downColor: "#ff3b5c",
          borderUpColor: "#00e5a0",
          borderDownColor: "#ff3b5c",
          wickUpColor: "#00e5a066",
          wickDownColor: "#ff3b5c66",
        });
      } else if (chartType === "line") {
        series = (chart as ReturnType<typeof createChart>).addSeries(LineSeries, {
          color: "#00d4ff",
          lineWidth: 2,
        });
      } else {
        series = (chart as ReturnType<typeof createChart>).addSeries(AreaSeries, {
          lineColor: "#00d4ff",
          topColor: "#00d4ff33",
          bottomColor: "#00d4ff00",
          lineWidth: 2,
        });
      }

      seriesRef.current = series;

      // Load historical data
      loadHistoricalData(series, selectedMarket, timeframe, chartType);

      setIsLoading(false);

      // Responsive resize
      const ro = new ResizeObserver(() => {
        if (containerRef.current && chart) {
          (chart as ReturnType<typeof createChart>).applyOptions({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
        }
      });
      ro.observe(containerRef.current);

      return () => {
        ro.disconnect();
        (chart as ReturnType<typeof createChart>).remove();
      };
    });

    return () => {
      if (chart) (chart as { remove(): void }).remove();
    };
  }, [selectedMarket, timeframe, chartType]);

  // Live price update
  useEffect(() => {
    const price = prices[selectedMarket];
    if (!price || !seriesRef.current) return;

    const series = seriesRef.current as {
      update: (bar: { time: number; value?: number; close?: number; open?: number; high?: number; low?: number }) => void;
    };

    const now = Math.floor(Date.now() / 1000);

    if (chartType === "candles") {
      series.update({
        time: now,
        open: price.price * 0.9998,
        high: price.price * 1.001,
        low: price.price * 0.999,
        close: price.price,
      });
    } else {
      series.update({ time: now, value: price.price });
    }
  }, [prices, selectedMarket, chartType]);

  return (
    <div className="flex flex-col h-full">
      {/* Chart controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-arc-border shrink-0">
        {/* Timeframe selector */}
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                timeframe === tf
                  ? "bg-arc-surface-2 text-arc-accent"
                  : "text-arc-subtle hover:text-arc-text"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Chart type */}
        <div className="flex items-center gap-1 bg-arc-surface-2 rounded-lg p-0.5">
          {([
            { type: "candles" as ChartType, icon: "📊" },
            { type: "line" as ChartType, icon: "📈" },
            { type: "area" as ChartType, icon: "🏔" },
          ]).map(({ type, icon }) => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                chartType === type
                  ? "bg-arc-surface text-arc-accent border border-arc-border"
                  : "text-arc-subtle hover:text-arc-text"
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-arc-surface/50 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-arc-accent border-t-transparent animate-spin" />
              <span className="text-xs text-arc-muted">Loading chart...</span>
            </div>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}

// ── Mock historical data loader ───────────────────────────────────────────

function loadHistoricalData(
  series: unknown,
  market: string,
  timeframe: Timeframe,
  chartType: ChartType
) {
  const BASE_PRICES: Record<string, number> = {
    "ETH-USD": 3200,
    "BTC-USD": 67000,
    "SOL-USD": 180,
    "ARB-USD": 1.15,
  };

  const base = BASE_PRICES[market] || 1000;
  const now = Math.floor(Date.now() / 1000);

  const TF_SECONDS: Record<Timeframe, number> = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400,
  };

  const tfSecs = TF_SECONDS[timeframe];
  const bars = 200;
  const data: unknown[] = [];

  let price = base * 0.85;
  const volatility = 0.015;

  for (let i = bars; i >= 0; i--) {
    const time = now - i * tfSecs;
    const open = price;
    const change = (Math.random() - 0.48) * volatility * price;
    const close = Math.max(price + change, 0.01);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);

    if (chartType === "candles") {
      data.push({ time, open, high, low, close });
    } else {
      data.push({ time, value: close });
    }

    price = close;
  }

  (series as { setData: (d: unknown[]) => void }).setData(data);
}
