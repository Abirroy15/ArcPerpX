"""
Breeding API — DNA crossover and mutation
"""

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from agents.trading_agent import StrategyDNA

router = APIRouter()


class BreedRequest(BaseModel):
    parent1_dna: list[float]
    parent2_dna: list[float]
    parent1_stats: Optional[dict] = None
    parent2_stats: Optional[dict] = None
    mutation_boost: float = 0.1


class DNARequest(BaseModel):
    strategy_type: str
    risk_tolerance: float
    time_horizon: str
    market: str


@router.post("")
async def breed_agents(req: BreedRequest):
    """Perform DNA crossover between two parent agents"""

    v1 = np.array(req.parent1_dna, dtype=np.float32)
    v2 = np.array(req.parent2_dna, dtype=np.float32)

    # Compute performance-weighted crossover ratio
    p1_sharpe = (req.parent1_stats or {}).get("sharpeRatio", 1.0) + 1e-6
    p2_sharpe = (req.parent2_stats or {}).get("sharpeRatio", 1.0) + 1e-6
    p1_weight = p1_sharpe / (p1_sharpe + p2_sharpe)

    parent1_dna = StrategyDNA.from_vector(v1)
    parent2_dna = StrategyDNA.from_vector(v2)

    child_dna = StrategyDNA.crossover(
        parent1_dna,
        parent2_dna,
        p1_weight=float(p1_weight),
        mutation_boost=req.mutation_boost,
    )

    return {
        "strategy_hash": child_dna.hash(),
        "vector": child_dna.to_vector().tolist(),
        "generation": child_dna.generation,
        "parent_weights": {"parent1": float(p1_weight), "parent2": float(1 - p1_weight)},
        "dna_summary": {
            "risk_tolerance": child_dna.risk_tolerance,
            "mutation_rate": child_dna.mutation_rate,
            "ema_weight": child_dna.ema_weight,
            "rsi_weight": child_dna.rsi_weight,
        },
    }


@router.post("/generate-dna")
async def generate_dna(req: DNARequest):
    """Generate initial Strategy DNA for a genesis agent"""
    from agents.trading_agent import StrategyType

    try:
        strategy = StrategyType(req.strategy_type)
    except ValueError:
        strategy = StrategyType.MOMENTUM

    dna = StrategyDNA.genesis(strategy, req.risk_tolerance)

    if req.time_horizon == "SCALP":
        dna.hold_target_seconds = 300
    elif req.time_horizon == "SWING":
        dna.hold_target_seconds = 86400 * 3

    return {
        "strategy_hash": dna.hash(),
        "vector": dna.to_vector().tolist(),
        "generation": 0,
        "dna_summary": {
            "strategy_type": req.strategy_type,
            "risk_tolerance": dna.risk_tolerance,
            "mutation_rate": dna.mutation_rate,
            "hold_target_hours": dna.hold_target_seconds / 3600,
        },
    }
