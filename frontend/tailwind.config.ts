import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        arc: {
          bg:       "var(--arc-bg)",
          surface:  "var(--arc-surface)",
          "surface-2": "var(--arc-surface-2)",
          border:   "var(--arc-border)",
          "border-2":"var(--arc-border-2)",
          text:     "var(--arc-text)",
          muted:    "var(--arc-muted)",
          subtle:   "var(--arc-subtle)",
          accent:   "var(--arc-accent)",
          "accent-2":"var(--arc-accent-2)",
          green:    "var(--arc-green)",
          red:      "var(--arc-red)",
          yellow:   "var(--arc-yellow)",
          purple:   "var(--arc-purple)",
          orange:   "var(--arc-orange)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
      },
      backgroundImage: {
        "grid-pattern": "radial-gradient(circle at 1px 1px, rgba(0,212,255,0.08) 1px, transparent 0)",
        "glow-green": "radial-gradient(ellipse at center, rgba(0,229,160,0.15) 0%, transparent 70%)",
        "glow-red":   "radial-gradient(ellipse at center, rgba(255,59,92,0.15) 0%, transparent 70%)",
      },
      backgroundSize: {
        "grid": "32px 32px",
      },
      animation: {
        "slide-up": "slide-in-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "ticker": "ticker-scroll 40s linear infinite",
      },
      keyframes: {
        "slide-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 10px rgba(0,212,255,0.1)" },
          "50%":      { boxShadow: "0 0 25px rgba(0,212,255,0.26)" },
        },
        "ticker-scroll": {
          from: { transform: "translateX(0)" },
          to:   { transform: "translateX(-50%)" },
        },
      },
      boxShadow: {
        "accent": "0 0 20px rgba(0,212,255,0.2), 0 0 60px rgba(0,212,255,0.07)",
        "green":  "0 0 20px rgba(0,229,160,0.2)",
        "red":    "0 0 20px rgba(255,59,92,0.2)",
        "panel":  "0 4px 24px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
