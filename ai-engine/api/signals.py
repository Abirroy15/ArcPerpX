"""
Signals API — live trading signal generation from active agents
"""

import asyncio
import random
import math
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from agents.trading_agent import agent_pool, TradingAgent, StrategyDNA, StrategyType, MarketState

router = APIRouter()


@router.get("/top")
async def get_top_signals(limit: int = 10):
    """Get highest-confidence signals across all active agents"""
    signals = agent_pool.get_top_signals(limit)

    # If no real agents running, generate mock signals for demo
    if not signals:
        signals = _generate_demo_signals(limit)

    return {"signals": signals, "count": len(signals)}


@router.get("/agent/{agent_id}")
async def get_agent_signal(agent_id: str):
    """Get current signal for a specific agent"""
    signal = agent_pool.get_signal(agent_id)
    if not signal:
        # Generate demo signal
        actions = ["LONG", "SHORT", "HOLD"]
        weights = [0.35, 0.3, 0.35]
        action = random.choices(actions, weights=weights)[0]
        return {
            "agent_id": agent_id,
            "action": action,
            "confidence": round(random.uniform(0.5, 0.95), 3),
            "timestamp": asyncio.get_event_loop().time(),
            "dna_generation": 0,
        }
    return signal


@router.post("/activate/{agent_id}")
async def activate_agent(agent_id: str, dna_vector: list[float]):
    """Start an agent's signal generation loop"""
    if agent_id in agent_pool.agents:
        return {"success": True, "message": "Agent already active"}

    dna = StrategyDNA.from_vector(__import__("numpy").array(dna_vector))
    agent = TradingAgent(agent_id, dna)
    agent_pool.register(agent)

    return {"success": True, "agent_id": agent_id, "dna_generation": dna.generation}


@router.delete("/deactivate/{agent_id}")
async def deactivate_agent(agent_id: str):
    """Stop an agent's signal generation"""
    agent_pool.deregister(agent_id)
    return {"success": True, "agent_id": agent_id}


@router.get("/market/{market}")
async def get_market_signals(market: str, limit: int = 5):
    """Get signals from agents specializing in a specific market"""
    all_signals = agent_pool.get_top_signals(50)
    market_signals = [s for s in all_signals if s.get("market") == market][:limit]

    if not market_signals:
        market_signals = _generate_demo_signals(limit, market)

    # Aggregate consensus
    if market_signals:
        long_count = sum(1 for s in market_signals if s["action"] == "LONG")
        short_count = sum(1 for s in market_signals if s["action"] == "SHORT")
        total = len(market_signals)

        consensus_action = "HOLD"
        if long_count / total > 0.6:
            consensus_action = "LONG"
        elif short_count / total > 0.6:
            consensus_action = "SHORT"

        consensus_confidence = max(long_count, short_count) / total
    else:
        consensus_action, consensus_confidence = "HOLD", 0.5

    return {
        "market": market,
        "signals": market_signals,
        "consensus": {
            "action": consensus_action,
            "confidence": round(consensus_confidence, 3),
            "long_pct": round((long_count / total * 100) if market_signals else 50, 1),
            "short_pct": round((short_count / total * 100) if market_signals else 50, 1),
        },
    }


# ── Demo signal generation ────────────────────────────────────────────────

def _generate_demo_signals(limit: int, market: str = "ETH-USD") -> list[dict]:
    """Generate plausible-looking demo signals for UI showcase"""
    t = asyncio.get_event_loop().time() if asyncio.get_event_loop().is_running() else 0
    signals = []

    agent_names = [
        "Alpha-Momentum-v3", "MeanRev-Master", "TrendBot-Supreme",
        "Scalp-King", "DeltaNeutral-v2", "Genesis-Alpha",
        "Sigma-7", "ArcBot-Prime", "QuantumLeap-v1", "FluxTrader",
    ]

    for i in range(min(limit, len(agent_names))):
        phase = t + i * 1.3
        confidence = 0.5 + 0.45 * abs(math.sin(phase / 10))
        action_roll = math.sin(phase / 7)
        action = "LONG" if action_roll > 0.2 else "SHORT" if action_roll < -0.2 else "HOLD"

        signals.append({
            "agent_id": f"demo-{i+1}",
            "agent_name": agent_names[i],
            "action": action,
            "confidence": round(confidence, 3),
            "market": market,
            "timestamp": t,
            "dna_generation": random.randint(0, 8),
        })

    signals.sort(key=lambda s: s["confidence"], reverse=True)
    return signals
