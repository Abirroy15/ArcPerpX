"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const NAV_ITEMS = [
  { href: "/trade", icon: "⚡", label: "Trade", badge: null },
  { href: "/portfolio", icon: "💼", label: "Portfolio", badge: null },
  { href: "/agents", icon: "🤖", label: "Agents", badge: "NEW" },
  { href: "/leaderboard", icon: "🏆", label: "Leaderboard", badge: null },
  { href: "/analytics", icon: "📊", label: "Analytics", badge: null },
  { href: "/marketplace", icon: "🛒", label: "Marketplace", badge: null },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[60px] bg-arc-surface border-r border-arc-border flex flex-col items-center py-3 gap-1 shrink-0">
      {/* Logo */}
      <div className="mb-4 flex flex-col items-center">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-arc-accent to-arc-purple flex items-center justify-center text-arc-bg font-black text-lg animate-pulse-glow">
          Δ
        </div>
      </div>

      {/* Nav */}
      {NAV_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="relative group w-full flex justify-center"
          >
            <div
              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all duration-200 relative ${
                isActive
                  ? "bg-arc-accent/15 border border-arc-accent/30"
                  : "hover:bg-arc-surface-2 border border-transparent"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.badge && (
                <span className="absolute -top-1 -right-1 text-[8px] bg-arc-accent text-arc-bg font-bold px-1 rounded-full">
                  {item.badge}
                </span>
              )}
            </div>

            {/* Tooltip */}
            <div className="pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <div className="bg-arc-surface border border-arc-border rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-panel">
                <span className="text-xs font-medium text-arc-text">{item.label}</span>
              </div>
            </div>
          </Link>
        );
      })}

      {/* Bottom */}
      <div className="mt-auto flex flex-col items-center gap-2">
        <Link href="/settings" className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-arc-surface-2 transition-colors border border-transparent hover:border-arc-border">
          <span className="text-lg">⚙️</span>
        </Link>
      </div>
    </aside>
  );
}
