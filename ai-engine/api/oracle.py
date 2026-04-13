"""
Risk Oracle API — exposes AI risk signals to backend and frontend
"""

import asyncio
import math
import random
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# In production: import from shared risk_oracle instance
# from agents.risk_oracle import risk_oracle

# Simulated risk state (replace with real risk_oracle.current_risks)
_RISK_STATE: dict[str, dict] = {}


@router.get("/{market}")
async def get_market_risk(market: str):
    """Get current AI risk assessment for a market"""
    # Simulate risk calculation
    t = asyncio.get_event_loop().time()
    base_risk = 0.2 + 0.15 * math.sin(t / 60)  # oscillate slowly
    noise = random.gauss(0, 0.05)
    risk_level = max(0, min(1, base_risk + noise))

    anomaly_type = None
    if risk_level > 0.8:
        anomaly_type = random.choice(["volatility_spike", "flash_crash", "price_anomaly"])
    elif risk_level > 0.6:
        anomaly_type = "elevated_volatility"

    cascade_prob = 1 / (1 + math.exp(-5 * (risk_level - 0.7)))
    margin_multiplier = 1.0 + risk_level * 1.5

    return {
        "market": market,
        "risk_level": round(risk_level, 3),
        "anomaly_type": anomaly_type,
        "margin_multiplier": round(margin_multiplier, 2),
        "cascade_probability": round(cascade_prob, 3),
        "description": f"Risk: {risk_level:.2f} | {'⚠️ Anomaly: ' + anomaly_type if anomaly_type else 'Normal conditions'}",
        "recommended_action": (
            "REDUCE_LEVERAGE" if risk_level > 0.8
            else "CAUTION" if risk_level > 0.5
            else "NORMAL"
        ),
    }


@router.get("/summary/all")
async def get_all_risks():
    """Get risk summary for all markets"""
    markets = ["ETH-USD", "BTC-USD", "SOL-USD", "ARB-USD"]
    results = {}
    for market in markets:
        risk_level = max(0, min(1, 0.2 + random.gauss(0, 0.1)))
        results[market] = {
            "risk_level": round(risk_level, 3),
            "status": "HIGH" if risk_level > 0.7 else "MEDIUM" if risk_level > 0.4 else "LOW",
        }
    return {"risks": results}


class MarginUpdateRequest(BaseModel):
    market: str
    multiplier: float
    reason: str


@router.post("/margin-update")
async def trigger_margin_update(req: MarginUpdateRequest):
    """Called by risk oracle to update margin requirements (relayed to smart contract)"""
    # In production: call backend /api/internal/risk-update
    return {
        "success": True,
        "market": req.market,
        "new_multiplier": req.multiplier,
        "reason": req.reason,
    }
