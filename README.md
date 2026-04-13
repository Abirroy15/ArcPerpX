# ⚡ ArcPerpX — Agentic Perpetual DEX on Arc Testnet

> The most advanced agentic perpetual DEX ever built. CEX-speed execution, on-chain settlement, self-evolving AI trading agents.

---

## 🏗 Architecture Overview

```
arcperpx/
├── frontend/          # Next.js 14 trading interface
├── backend/           # Node.js (Hono) + WebSocket server
├── contracts/         # Solidity smart contracts (Arc Testnet)
├── ai-engine/         # Python AI agent + strategy engine
└── indexer/           # On-chain event indexer
```

---

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Root
cp .env.example .env

# Fill in:
# PRIVATE_KEY=<your_deployer_key>        ← NEVER COMMIT
# RPC_URL=https://rpc.testnet.arc.network
# DATABASE_URL=postgresql://...
# REDIS_URL=redis://localhost:6379
# OPENAI_API_KEY=...
```

### 2. Deploy Contracts

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network arc-testnet
```

### 3. Start Backend

```bash
cd backend
npm install
npx prisma migrate dev
npm run dev   # port 3001
```

### 4. Start AI Engine

```bash
cd ai-engine
pip install -r requirements.txt
python main.py   # port 8000
```

### 5. Start Frontend

```bash
cd frontend
npm install
npm run dev   # port 3000
```

---

## 🧩 Smart Contracts

| Contract | Purpose |
|---|---|
| `Vault` | Collateral custody, multi-asset |
| `PerpEngine` | Core trade execution, settlement |
| `MarginManager` | Cross/isolated margin logic |
| `LiquidationEngine` | Real-time liquidation + cascade protection |
| `FundingRateModule` | Dynamic funding, TWAP-based |
| `AgentRegistry` | On-chain agent NFTs, strategy DNA |
| `RewardSystem` | XP, fees, revenue sharing |

---

## 🤖 AI Agent System

Each agent has **Strategy DNA** — a vector-encoded strategy that evolves via reinforcement learning:

1. Agent observes market state
2. Predicts next action (Long/Short/Hold)
3. Executes via MetaMask or relayer
4. Receives reward signal
5. DNA mutates toward higher-performing variants

**Breeding**: Combine two agents' DNA → new child strategy

---

## 📡 API Reference

### REST (port 3001)
```
POST /api/order             # Place order
GET  /api/orderbook/:market # Live orderbook
GET  /api/positions/:addr   # User positions
POST /api/agent/create      # Deploy new agent
GET  /api/agent/performance # Agent stats
POST /api/agent/train       # Trigger RL cycle
GET  /api/leaderboard       # Trader rankings
GET  /api/analytics/:addr   # Sharpe, Sortino, etc.
```

### WebSocket (port 3002)
```
price_update      → { market, price, timestamp }
orderbook_update  → { bids, asks, market }
trade_execution   → { txHash, size, price, side }
liquidation_event → { position, liqPrice, trader }
agent_update      → { agentId, signal, confidence }
funding_update    → { market, rate, nextFunding }
```

---

## 🔐 Security

- No private keys in source code
- MetaMask for all user signing
- Admin functions behind multi-sig
- Circuit breakers on liquidation engine
- Oracle manipulation protection (TWAP + deviation checks)
- Reentrancy guards on all Vault interactions

---

## 🌐 Arc Testnet Config

```json
{
  "chainId": 2001,
  "name": "Arc Testnet",
  "rpc": "https://rpc.testnet.arc.network",
  "explorer": "https://explorer.testnet.arc.network"
}
```

---

## 🎮 Gamification

- **XP System**: Earn XP per trade volume, win rate, consistency
- **Tiers**: Apprentice → Trader → Expert → Sentinel → Legend
- **Seasons**: 30-day competitive windows with prize pools
- **Achievements**: On-chain NFT badges for milestones

---

## 📊 Analytics Engine

Every position tracked for:
- Sharpe Ratio
- Sortino Ratio  
- Max Drawdown
- Win Rate
- Risk-adjusted returns
- Behavioral clustering (are you a momentum trader? Mean reverter?)

---

Built with ❤️ for the Arc ecosystem.
