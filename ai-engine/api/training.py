"""
Training API — RL training endpoint for agent evolution
"""

import asyncio
import uuid
import logging
import numpy as np
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
from agents.trading_agent import TradingAgent, StrategyDNA, StrategyType, MarketState, agent_pool

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Job Registry ──────────────────────────────────────────────────────────

training_jobs: dict[str, dict] = {}


class TrainRequest(BaseModel):
    agent_id: str
    dna_vector: list[float]
    epochs: int = 10
    reward_function: str = "SHARPE"
    market_data: str = "BACKTEST_30D"
    strategy_type: str = "MOMENTUM"
    risk_tolerance: float = 0.5
    current_stats: Optional[dict] = None


class GenerateDNARequest(BaseModel):
    strategy_type: str
    risk_tolerance: float
    time_horizon: str
    market: str


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/generate-dna")
async def generate_dna(req: GenerateDNARequest):
    """Generate initial Strategy DNA for a new agent"""
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
        "dna": {
            "ema_weight": dna.ema_weight,
            "macd_weight": dna.macd_weight,
            "rsi_weight": dna.rsi_weight,
            "risk_tolerance": dna.risk_tolerance,
            "generation": 0,
        }
    }


@router.post("")
async def train_agent(req: TrainRequest, background_tasks: BackgroundTasks):
    """Start an RL training job for an agent"""
    job_id = str(uuid.uuid4())
    training_jobs[job_id] = {
        "job_id": job_id,
        "agent_id": req.agent_id,
        "status": "QUEUED",
        "progress": 0,
        "result": None,
    }
    
    epochs_time = req.epochs * 2  # ~2s per epoch estimate
    background_tasks.add_task(_run_training, job_id, req)
    
    return {
        "job_id": job_id,
        "status": "QUEUED",
        "estimated_seconds": epochs_time,
    }


@router.get("/status/{job_id}")
async def get_training_status(job_id: str):
    job = training_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


# ── Training Logic ────────────────────────────────────────────────────────

async def _run_training(job_id: str, req: TrainRequest):
    """Background training task"""
    try:
        training_jobs[job_id]["status"] = "RUNNING"
        
        # Reconstruct agent from DNA
        vector = np.array(req.dna_vector, dtype=np.float32)
        dna = StrategyDNA.from_vector(vector)
        agent = TradingAgent(req.agent_id, dna)
        
        # Generate synthetic or backtest market data
        market_states = _generate_market_data(req.market_data)
        
        total_pnl = 0.0
        all_rewards = []
        
        for epoch in range(req.epochs):
            experiences = []
            position = None  # current simulated position
            
            for i, state in enumerate(market_states):
                action, confidence = agent.get_action(state)
                
                # Simulate trade
                pnl = 0.0
                if action != "HOLD":
                    price = state.price
                    # Simple simulation: next period return
                    if i < len(market_states) - 1:
                        next_price = market_states[i + 1].price
                        raw_return = (next_price - price) / price
                        if action == "LONG":
                            pnl = raw_return * 10  # 10x leverage simulation
                        else:
                            pnl = -raw_return * 10
                
                reward = agent.compute_reward(pnl, 3600, abs(min(pnl, 0)))
                all_rewards.append(reward)
                total_pnl += pnl
                
                experiences.append({
                    "observation": state.to_observation().tolist(),
                    "action": action,
                    "reward": reward,
                    "pnl": pnl,
                })
            
            # Train on experiences
            metrics = agent.train_epoch(experiences)
            
            # Update progress
            training_jobs[job_id]["progress"] = int((epoch + 1) / req.epochs * 100)
            await asyncio.sleep(0.1)  # yield control
        
        # Compute final metrics
        rewards_arr = np.array(all_rewards)
        sharpe = float(rewards_arr.mean() / (rewards_arr.std() + 1e-8) * np.sqrt(252))
        drawdown = _compute_max_drawdown(all_rewards)
        
        result = {
            "strategy_hash": agent.dna.hash(),
            "vector": agent.dna.to_vector().tolist(),
            "metrics": {
                "sharpe_ratio": max(0, sharpe * 100),  # scaled for contract
                "max_drawdown": int(drawdown * 10000),  # bps
                "total_pnl": total_pnl,
                "win_rate": len([r for r in all_rewards if r > 0]) / max(len(all_rewards), 1),
                "generation": agent.dna.generation,
            }
        }
        
        training_jobs[job_id]["status"] = "COMPLETE"
        training_jobs[job_id]["result"] = result
        logger.info(f"Training complete: {req.agent_id} | Sharpe: {sharpe:.2f}")
        
    except Exception as e:
        logger.error(f"Training failed: {e}")
        training_jobs[job_id]["status"] = "FAILED"
        training_jobs[job_id]["error"] = str(e)


def _generate_market_data(data_type: str) -> list[MarketState]:
    """Generate synthetic market data for training"""
    n = 200 if "30D" in data_type else 500
    
    # Geometric Brownian Motion price simulation
    np.random.seed(42)
    dt = 1 / 24  # hourly
    mu = 0.0001  # drift
    sigma = 0.02  # volatility
    
    price = 3200.0  # ETH starting price
    prices = [price]
    for _ in range(n):
        price *= np.exp((mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * np.random.randn())
        prices.append(price)
    
    states = []
    window = 20
    for i in range(window, len(prices)):
        p = prices[i]
        hist = prices[max(0, i-window):i]
        
        ema_20 = float(np.mean(hist[-20:]))
        ema_50 = float(np.mean(hist))
        
        returns = np.diff(hist) / np.array(hist[:-1])
        rsi = _compute_rsi(returns)
        
        states.append(MarketState(
            price=p,
            price_change_1h=(p - prices[i-1]) / prices[i-1],
            price_change_24h=(p - prices[max(0, i-24)]) / prices[max(0, i-24)],
            volume_24h=np.random.random() * 1e9,
            ema_20=ema_20,
            ema_50=ema_50,
            rsi_14=rsi,
            macd=ema_20 - ema_50,
            macd_signal=(ema_20 - ema_50) * 0.9,
            bb_upper=ema_20 + 2 * np.std(hist),
            bb_lower=ema_20 - 2 * np.std(hist),
            bb_width=4 * np.std(hist) / ema_20 if ema_20 > 0 else 0,
            long_oi=1e8 * np.random.random(),
            short_oi=1e8 * np.random.random(),
            funding_rate=0.001 * (np.random.random() - 0.5),
        ))
    
    return states


def _compute_rsi(returns: np.ndarray, period: int = 14) -> float:
    if len(returns) < period:
        return 50.0
    gains = np.maximum(returns[-period:], 0)
    losses = np.maximum(-returns[-period:], 0)
    avg_gain = gains.mean() + 1e-8
    avg_loss = losses.mean() + 1e-8
    rs = avg_gain / avg_loss
    return float(100 - 100 / (1 + rs))


def _compute_max_drawdown(rewards: list[float]) -> float:
    if not rewards:
        return 0
    cumulative = np.cumsum(rewards)
    peak = np.maximum.accumulate(cumulative)
    drawdown = (peak - cumulative) / (np.abs(peak) + 1e-8)
    return float(drawdown.max())
