"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAgents, fetchMarketplace, createAgent, trainAgent, breedAgents } from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";

type AgentTab = "my-agents" | "marketplace" | "create" | "breed";

export default function AgentsPage() {
  const [tab, setTab] = useState<AgentTab>("my-agents");
  const wallet = useWallet();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-arc-text flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            AI Trading Agents
          </h1>
          <p className="text-sm text-arc-muted mt-1">
            Self-evolving agents with Strategy DNA. Deploy, breed, and earn from your strategies.
          </p>
        </div>
        {wallet.isConnected && (
          <div className="flex items-center gap-2 arc-panel px-4 py-2">
            <div className="w-2 h-2 rounded-full bg-arc-green animate-pulse" />
            <span className="text-xs text-arc-muted font-mono-data truncate max-w-[120px]">
              {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-arc-surface rounded-xl p-1 w-fit border border-arc-border">
        {([
          { id: "my-agents", label: "My Agents", icon: "🧬" },
          { id: "marketplace", label: "Marketplace", icon: "🛒" },
          { id: "create", label: "Create Agent", icon: "✨" },
          { id: "breed", label: "Breed", icon: "⚗️" },
        ] as const).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              tab === id
                ? "bg-arc-surface-2 text-arc-accent border border-arc-border shadow-panel"
                : "text-arc-muted hover:text-arc-text"
            }`}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {tab === "my-agents" && <MyAgents wallet={wallet} />}
          {tab === "marketplace" && <Marketplace />}
          {tab === "create" && <CreateAgentForm wallet={wallet} onSuccess={() => setTab("my-agents")} />}
          {tab === "breed" && <BreedAgentsForm wallet={wallet} onSuccess={() => setTab("my-agents")} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── My Agents ─────────────────────────────────────────────────────────────

function MyAgents({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["agents", wallet.address],
    queryFn: () => wallet.address ? fetchAgents(wallet.address) : Promise.resolve({ agents: [] }),
    enabled: !!wallet.address,
  });

  const agents = data?.agents || [];

  if (!wallet.isConnected) {
    return (
      <div className="arc-panel p-12 text-center">
        <div className="text-4xl mb-4">🔌</div>
        <h3 className="text-lg font-semibold text-arc-text mb-2">Connect your wallet</h3>
        <p className="text-sm text-arc-muted mb-4">Connect MetaMask to view your agents</p>
        <button onClick={wallet.connect} className="btn-primary px-6 py-2">Connect MetaMask</button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="arc-panel p-6 animate-pulse space-y-3">
            <div className="h-4 bg-arc-surface-2 rounded w-2/3" />
            <div className="h-3 bg-arc-surface-2 rounded w-1/2" />
            <div className="h-8 bg-arc-surface-2 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="arc-panel p-12 text-center">
        <div className="text-5xl mb-4">🤖</div>
        <h3 className="text-lg font-semibold text-arc-text mb-2">No agents yet</h3>
        <p className="text-sm text-arc-muted">Create your first AI trading agent to get started</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {agents.map((agent: Record<string, unknown>) => (
        <AgentCard key={agent.id as string} agent={agent} />
      ))}
    </div>
  );
}

// ── Agent Card ────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: Record<string, unknown> }) {
  const qc = useQueryClient();
  const wallet = useWallet();

  const trainMutation = useMutation({
    mutationFn: () =>
      trainAgent({
        agentId: agent.id as string,
        epochs: 20,
        rewardFunction: "SHARPE",
        marketData: "BACKTEST_30D",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });

  const stats = (agent.stats || {}) as Record<string, unknown>;
  const winRate = stats.totalTrades
    ? (((stats.winningTrades as number) / (stats.totalTrades as number)) * 100).toFixed(1)
    : "0.0";
  const pnl = (stats.totalPnl as number) || 0;
  const tier = getTier((stats.xpPoints as number) || 0);

  return (
    <div className="arc-panel p-5 space-y-4 hover:border-arc-border-2 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-bold ${tierColor(tier)}`}>
              ★ {tier}
            </span>
            <span className="text-xs text-arc-muted bg-arc-surface-2 px-2 py-0.5 rounded-full border border-arc-border">
              Gen {(agent.generation as number) || 0}
            </span>
          </div>
          <h3 className="font-bold text-arc-text">{agent.name as string}</h3>
          <p className="text-xs text-arc-muted">{agent.strategyType as string} · {agent.market as string}</p>
        </div>

        {/* Status dot */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${
            agent.status === "ACTIVE" ? "bg-arc-green animate-pulse" :
            agent.status === "TRAINING" ? "bg-arc-yellow animate-pulse" :
            "bg-arc-muted"
          }`} />
          <span className="text-[10px] text-arc-muted">{agent.status as string}</span>
        </div>
      </div>

      {/* DNA Visualization */}
      <DNAStrand dnaVector={agent.dnaVector as string} />

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatMini label="Win Rate" value={`${winRate}%`} positive={Number(winRate) > 50} />
        <StatMini
          label="PnL"
          value={`${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(0)}`}
          positive={pnl >= 0}
        />
        <StatMini label="Sharpe" value={((stats.sharpeRatio as number) || 0).toFixed(2)} neutral />
      </div>

      {/* XP bar */}
      <div>
        <div className="flex justify-between text-[10px] text-arc-muted mb-1">
          <span>XP</span>
          <span className="font-mono-data">{(stats.xpPoints as number) || 0} XP</span>
        </div>
        <div className="h-1.5 bg-arc-surface-2 rounded-full overflow-hidden border border-arc-border">
          <div
            className="h-full rounded-full bg-gradient-to-r from-arc-accent to-arc-purple transition-all duration-500"
            style={{ width: `${Math.min(((stats.xpPoints as number) || 0) / 100000 * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => trainMutation.mutate()}
          disabled={trainMutation.isPending || agent.status === "TRAINING"}
          className="flex-1 btn-ghost text-xs py-1.5 disabled:opacity-50"
        >
          {trainMutation.isPending ? "⏳ Training..." : "🧠 Train"}
        </button>
        <button className="flex-1 btn-ghost text-xs py-1.5">
          📊 Signals
        </button>
        <button className="btn-ghost text-xs py-1.5 px-3">
          ···
        </button>
      </div>
    </div>
  );
}

// ── Create Agent Form ─────────────────────────────────────────────────────

function CreateAgentForm({ wallet, onSuccess }: { wallet: ReturnType<typeof useWallet>; onSuccess: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    strategyType: "MOMENTUM",
    riskTolerance: 0.5,
    mutationRate: 0.1,
    timeHorizon: "INTRADAY",
    market: "ETH-USD",
    maxPositionSize: 1000,
    maxLeverage: 10,
    isPublic: false,
    copyFee: 0,
  });

  const createMutation = useMutation({
    mutationFn: () => createAgent(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      onSuccess();
    },
  });

  return (
    <div className="max-w-2xl arc-panel p-6 space-y-6">
      <h2 className="text-lg font-bold text-arc-text">Create New Agent</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="text-xs text-arc-muted block mb-1.5">Agent Name</label>
          <input
            className="arc-input"
            placeholder="e.g. Momentum Master v1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div>
          <label className="text-xs text-arc-muted block mb-1.5">Strategy Type</label>
          <select
            className="arc-input"
            value={form.strategyType}
            onChange={(e) => setForm({ ...form, strategyType: e.target.value })}
          >
            {["MOMENTUM", "MEAN_REVERSION", "TREND_FOLLOWING", "MARKET_MAKING"].map((t) => (
              <option key={t} value={t}>{t.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-arc-muted block mb-1.5">Target Market</label>
          <select
            className="arc-input"
            value={form.market}
            onChange={(e) => setForm({ ...form, market: e.target.value })}
          >
            {["ETH-USD", "BTC-USD", "SOL-USD", "ARB-USD"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label className="text-xs text-arc-muted block mb-1.5">
            Risk Tolerance: {(form.riskTolerance * 100).toFixed(0)}%
            <span className="ml-2 text-arc-subtle">(0 = Conservative, 100 = Degen)</span>
          </label>
          <input
            type="range" min={0} max={1} step={0.01}
            value={form.riskTolerance}
            onChange={(e) => setForm({ ...form, riskTolerance: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: "var(--arc-accent)" }}
          />
          <div className="flex justify-between text-[10px] text-arc-subtle mt-1">
            <span>Conservative</span><span>Balanced</span><span>Degen</span>
          </div>
        </div>

        <div>
          <label className="text-xs text-arc-muted block mb-1.5">Time Horizon</label>
          <select
            className="arc-input"
            value={form.timeHorizon}
            onChange={(e) => setForm({ ...form, timeHorizon: e.target.value })}
          >
            <option value="SCALP">Scalp (seconds-minutes)</option>
            <option value="INTRADAY">Intraday (hours)</option>
            <option value="SWING">Swing (days)</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-arc-muted block mb-1.5">Max Leverage</label>
          <select
            className="arc-input"
            value={form.maxLeverage}
            onChange={(e) => setForm({ ...form, maxLeverage: Number(e.target.value) })}
          >
            {[1, 2, 5, 10, 20, 50].map((l) => (
              <option key={l} value={l}>{l}×</option>
            ))}
          </select>
        </div>

        <div className="col-span-2 flex items-center gap-3">
          <input
            type="checkbox"
            id="public"
            checked={form.isPublic}
            onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
            className="w-4 h-4 accent-arc-accent"
          />
          <label htmlFor="public" className="text-sm text-arc-text">
            Make agent public (visible in marketplace)
          </label>
        </div>
      </div>

      <div className="arc-panel-2 p-4 text-xs text-arc-muted space-y-1">
        <p>🧬 Strategy DNA will be generated by the AI engine based on your configuration</p>
        <p>🔄 Agent will begin self-evolving after the first training session</p>
        <p>💰 Creation fee: 0.005 ARC (testnet)</p>
      </div>

      <button
        onClick={() => createMutation.mutate()}
        disabled={!form.name || createMutation.isPending || !wallet.isConnected}
        className="btn-primary w-full py-3 disabled:opacity-50"
      >
        {createMutation.isPending ? "Deploying Agent..." : "✨ Create Agent"}
      </button>
    </div>
  );
}

// ── Marketplace ───────────────────────────────────────────────────────────

function Marketplace() {
  const [sort, setSort] = useState("sharpe");
  const { data, isLoading } = useQuery({
    queryKey: ["marketplace", sort],
    queryFn: () => fetchMarketplace(sort),
  });

  const agents = data?.agents || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-arc-muted">Sort by:</span>
        {["sharpe", "pnl", "xp"].map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
              sort === s
                ? "border-arc-accent text-arc-accent bg-arc-accent-dim"
                : "border-arc-border text-arc-muted hover:text-arc-text"
            }`}
          >
            {s === "sharpe" ? "Sharpe Ratio" : s === "pnl" ? "Total PnL" : "XP Level"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="arc-panel p-6 animate-pulse h-48" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="arc-panel p-12 text-center text-arc-muted">
          No agents in marketplace yet
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent: Record<string, unknown>) => (
            <AgentCard key={agent.id as string} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Breed Form ────────────────────────────────────────────────────────────

function BreedAgentsForm({ wallet, onSuccess }: { wallet: ReturnType<typeof useWallet>; onSuccess: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["agents", wallet.address],
    queryFn: () => (wallet.address ? fetchAgents(wallet.address) : Promise.resolve({ agents: [] })),
    enabled: !!wallet.address,
  });
  const myAgents = data?.agents || [];

  const [form, setForm] = useState({
    parent1Id: "",
    parent2Id: "",
    childName: "",
    mutationBoost: 0.1,
  });

  const breedMutation = useMutation({
    mutationFn: () => breedAgents(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      onSuccess();
    },
  });

  const p1 = myAgents.find((a: Record<string, unknown>) => a.id === form.parent1Id);
  const p2 = myAgents.find((a: Record<string, unknown>) => a.id === form.parent2Id);

  return (
    <div className="max-w-2xl arc-panel p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-arc-text mb-1">⚗️ Breed Agents</h2>
        <p className="text-sm text-arc-muted">
          Combine two agents' DNA to create a child with inherited traits. The better-performing parent contributes more.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="text-xs text-arc-muted block mb-2">Parent 1 (You must own)</label>
          <select
            className="arc-input"
            value={form.parent1Id}
            onChange={(e) => setForm({ ...form, parent1Id: e.target.value })}
          >
            <option value="">Select agent...</option>
            {myAgents.map((a: Record<string, unknown>) => (
              <option key={a.id as string} value={a.id as string}>{a.name as string}</option>
            ))}
          </select>
          {p1 && <AgentMiniPreview agent={p1} />}
        </div>

        <div>
          <label className="text-xs text-arc-muted block mb-2">Parent 2</label>
          <select
            className="arc-input"
            value={form.parent2Id}
            onChange={(e) => setForm({ ...form, parent2Id: e.target.value })}
          >
            <option value="">Select agent...</option>
            {myAgents
              .filter((a: Record<string, unknown>) => a.id !== form.parent1Id)
              .map((a: Record<string, unknown>) => (
                <option key={a.id as string} value={a.id as string}>{a.name as string}</option>
              ))}
          </select>
          {p2 && <AgentMiniPreview agent={p2} />}
        </div>
      </div>

      <div>
        <label className="text-xs text-arc-muted block mb-1.5">Child Name</label>
        <input
          className="arc-input"
          placeholder="e.g. Alpha Gen-2"
          value={form.childName}
          onChange={(e) => setForm({ ...form, childName: e.target.value })}
        />
      </div>

      <div>
        <label className="text-xs text-arc-muted block mb-1.5">
          Mutation Boost: {(form.mutationBoost * 100).toFixed(0)}%
        </label>
        <input
          type="range" min={0} max={0.5} step={0.01}
          value={form.mutationBoost}
          onChange={(e) => setForm({ ...form, mutationBoost: Number(e.target.value) })}
          style={{ accentColor: "var(--arc-accent)" }}
          className="w-full"
        />
      </div>

      <button
        onClick={() => breedMutation.mutate()}
        disabled={!form.parent1Id || !form.parent2Id || !form.childName || breedMutation.isPending}
        className="btn-primary w-full py-3 disabled:opacity-50"
      >
        {breedMutation.isPending ? "⚗️ Breeding..." : "⚗️ Breed Agents"}
      </button>
    </div>
  );
}

// ── Mini Components ───────────────────────────────────────────────────────

function DNAStrand({ dnaVector }: { dnaVector: string }) {
  const colors = ["#00d4ff", "#00e5a0", "#ff3b5c", "#7c3aed", "#ffd60a", "#ff6b35"];
  const nodes = 12;

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: nodes }).map((_, i) => {
        const intensity = dnaVector ? (dnaVector.charCodeAt(i * 2) % 100) / 100 : Math.random();
        const color = colors[i % colors.length];
        return (
          <div
            key={i}
            className="rounded-full flex-shrink-0 transition-all duration-500"
            style={{
              width: 6,
              height: 6 + intensity * 8,
              backgroundColor: color,
              opacity: 0.4 + intensity * 0.6,
            }}
          />
        );
      })}
    </div>
  );
}

function AgentMiniPreview({ agent }: { agent: Record<string, unknown> }) {
  const stats = (agent.stats || {}) as Record<string, unknown>;
  return (
    <div className="mt-2 arc-panel-2 p-2 text-xs space-y-1">
      <div className="flex justify-between text-arc-muted">
        <span>Sharpe</span>
        <span className="font-mono-data text-arc-text">{((stats.sharpeRatio as number) || 0).toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-arc-muted">
        <span>Gen</span>
        <span className="font-mono-data text-arc-accent">{(agent.generation as number) || 0}</span>
      </div>
    </div>
  );
}

function StatMini({ label, value, positive, neutral }: { label: string; value: string; positive?: boolean; neutral?: boolean }) {
  return (
    <div className="arc-panel-2 p-2 text-center">
      <div className={`text-sm font-bold font-mono-data ${neutral ? "text-arc-text" : positive ? "text-profit" : "text-loss"}`}>
        {value}
      </div>
      <div className="text-[10px] text-arc-muted mt-0.5">{label}</div>
    </div>
  );
}

function getTier(xp: number): string {
  if (xp >= 100000) return "LEGEND";
  if (xp >= 25000) return "SENTINEL";
  if (xp >= 5000) return "EXPERT";
  if (xp >= 1000) return "TRADER";
  return "APPRENTICE";
}

function tierColor(tier: string): string {
  const map: Record<string, string> = {
    LEGEND: "tier-legend",
    SENTINEL: "tier-sentinel",
    EXPERT: "tier-expert",
    TRADER: "tier-trader",
    APPRENTICE: "tier-apprentice",
  };
  return map[tier] || "text-arc-muted";
}
