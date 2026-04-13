"""
Self-Evolving Trading Agent with Strategy DNA
Uses reinforcement learning (PPO) to continuously improve strategy.
"""

import numpy as np
import json
import hashlib
import asyncio
import logging
from dataclasses import dataclass, field, asdict
from typing import Optional, Tuple
from enum import Enum

logger = logging.getLogger(__name__)

# ── Strategy DNA ──────────────────────────────────────────────────────────

class StrategyType(str, Enum):
    MOMENTUM = "MOMENTUM"
    MEAN_REVERSION = "MEAN_REVERSION"
    TREND_FOLLOWING = "TREND_FOLLOWING"
    MARKET_MAKING = "MARKET_MAKING"
    CUSTOM = "CUSTOM"


@dataclass
class StrategyDNA:
    """
    Encoded strategy logic as a numerical vector.
    Each dimension represents a learnable parameter.
    """
    # Trend indicators (0=ignore, 1=use strongly)
    ema_weight: float = 0.5          # EMA signal strength
    macd_weight: float = 0.5
    rsi_weight: float = 0.5
    bb_weight: float = 0.3           # Bollinger Bands
    
    # Momentum features  
    momentum_lookback: float = 14    # periods (1-100)
    momentum_threshold: float = 0.02 # signal threshold
    
    # Risk parameters
    risk_tolerance: float = 0.5      # 0=conservative, 1=aggressive
    max_drawdown_exit: float = 0.15  # exit at 15% drawdown
    
    # Position sizing
    kelly_fraction: float = 0.25     # fraction of Kelly criterion
    position_scaling: float = 1.0    # size multiplier
    
    # Time horizon
    hold_target_seconds: float = 3600  # target hold time
    
    # Mutation params
    mutation_rate: float = 0.1       # probability of parameter mutation
    mutation_magnitude: float = 0.05 # max change per mutation
    
    # Market regime
    trend_bias: float = 0.0          # -1=bearish, 0=neutral, 1=bullish
    volatility_regime: float = 0.5   # 0=low vol, 1=high vol expected
    
    # Strategy type encoding (one-hot like)
    type_momentum: float = 0.0
    type_mean_reversion: float = 0.0
    type_trend: float = 0.0
    type_market_making: float = 0.0
    
    generation: int = 0
    
    def to_vector(self) -> np.ndarray:
        """Convert DNA to numpy vector for ML"""
        return np.array([
            self.ema_weight, self.macd_weight, self.rsi_weight, self.bb_weight,
            self.momentum_lookback / 100, self.momentum_threshold,
            self.risk_tolerance, self.max_drawdown_exit,
            self.kelly_fraction, self.position_scaling,
            self.hold_target_seconds / 86400,  # normalize to days
            self.trend_bias, self.volatility_regime,
            self.type_momentum, self.type_mean_reversion, self.type_trend, self.type_market_making,
        ], dtype=np.float32)
    
    @classmethod
    def from_vector(cls, vector: np.ndarray, generation: int = 0) -> "StrategyDNA":
        v = vector.tolist()
        return cls(
            ema_weight=float(np.clip(v[0], 0, 1)),
            macd_weight=float(np.clip(v[1], 0, 1)),
            rsi_weight=float(np.clip(v[2], 0, 1)),
            bb_weight=float(np.clip(v[3], 0, 1)),
            momentum_lookback=float(np.clip(v[4] * 100, 1, 100)),
            momentum_threshold=float(np.clip(v[5], 0.001, 0.1)),
            risk_tolerance=float(np.clip(v[6], 0, 1)),
            max_drawdown_exit=float(np.clip(v[7], 0.05, 0.5)),
            kelly_fraction=float(np.clip(v[8], 0.05, 0.5)),
            position_scaling=float(np.clip(v[9], 0.1, 3.0)),
            hold_target_seconds=float(np.clip(v[10] * 86400, 60, 86400 * 7)),
            trend_bias=float(np.clip(v[11], -1, 1)),
            volatility_regime=float(np.clip(v[12], 0, 1)),
            type_momentum=float(v[13]),
            type_mean_reversion=float(v[14]),
            type_trend=float(v[15]),
            type_market_making=float(v[16]) if len(v) > 16 else 0.0,
            generation=generation,
        )
    
    def hash(self) -> str:
        """Deterministic hash of DNA (for on-chain strategyHash)"""
        vector = self.to_vector().tobytes()
        return "0x" + hashlib.sha256(vector).hexdigest()
    
    def mutate(self) -> "StrategyDNA":
        """Return a mutated copy of this DNA"""
        vector = self.to_vector()
        mask = np.random.random(len(vector)) < self.mutation_rate
        noise = np.random.normal(0, self.mutation_magnitude, len(vector))
        mutated = vector + mask * noise
        return StrategyDNA.from_vector(mutated, self.generation + 1)
    
    @classmethod
    def crossover(
        cls,
        parent1: "StrategyDNA",
        parent2: "StrategyDNA",
        p1_weight: float = 0.5,
        mutation_boost: float = 0.0
    ) -> "StrategyDNA":
        """Combine two parent DNAs (weighted average + optional mutation)"""
        v1 = parent1.to_vector()
        v2 = parent2.to_vector()
        
        # Weighted crossover: better parent contributes more
        child_vector = v1 * p1_weight + v2 * (1 - p1_weight)
        
        # Random crossover points (uniform crossover)
        crossover_mask = np.random.random(len(v1)) > 0.5
        child_vector = np.where(crossover_mask, v1, v2)
        
        child = cls.from_vector(child_vector, max(parent1.generation, parent2.generation) + 1)
        
        if mutation_boost > 0:
            child.mutation_magnitude += mutation_boost
        
        return child.mutate()
    
    @classmethod
    def genesis(cls, strategy_type: StrategyType, risk_tolerance: float) -> "StrategyDNA":
        """Create a genesis (generation 0) agent with reasonable defaults"""
        dna = cls(risk_tolerance=risk_tolerance)
        
        if strategy_type == StrategyType.MOMENTUM:
            dna.momentum_lookback = 20
            dna.macd_weight = 0.8
            dna.type_momentum = 1.0
            dna.hold_target_seconds = 3600  # 1h
            
        elif strategy_type == StrategyType.MEAN_REVERSION:
            dna.bb_weight = 0.9
            dna.rsi_weight = 0.8
            dna.momentum_threshold = 0.03
            dna.type_mean_reversion = 1.0
            dna.hold_target_seconds = 7200  # 2h
            
        elif strategy_type == StrategyType.TREND_FOLLOWING:
            dna.ema_weight = 0.9
            dna.macd_weight = 0.7
            dna.type_trend = 1.0
            dna.hold_target_seconds = 86400  # 1d
            
        elif strategy_type == StrategyType.MARKET_MAKING:
            dna.type_market_making = 1.0
            dna.risk_tolerance = min(risk_tolerance, 0.3)
            dna.hold_target_seconds = 300  # 5min
        
        return dna


# ── Market Environment ────────────────────────────────────────────────────

@dataclass
class MarketState:
    """Current market observation (fed to agent as state)"""
    price: float
    price_change_1h: float
    price_change_24h: float
    volume_24h: float
    
    # Technical indicators (pre-computed)
    ema_20: float
    ema_50: float
    rsi_14: float          # 0-100
    macd: float            # MACD line
    macd_signal: float
    bb_upper: float
    bb_lower: float
    bb_width: float        # (upper - lower) / middle
    
    # Market structure
    long_oi: float         # long open interest
    short_oi: float        # short open interest
    funding_rate: float    # current funding rate
    
    # Derived features
    @property
    def oi_imbalance(self) -> float:
        total = self.long_oi + self.short_oi
        if total == 0:
            return 0
        return (self.long_oi - self.short_oi) / total
    
    @property
    def is_overbought(self) -> bool:
        return self.rsi_14 > 70
    
    @property
    def is_oversold(self) -> bool:
        return self.rsi_14 < 30
    
    def to_observation(self) -> np.ndarray:
        """Normalized observation vector for RL"""
        return np.array([
            self.price_change_1h,
            self.price_change_24h,
            self.rsi_14 / 100,
            self.macd / self.price if self.price > 0 else 0,
            self.bb_width,
            self.oi_imbalance,
            self.funding_rate,
            (self.ema_20 - self.ema_50) / self.price if self.price > 0 else 0,
        ], dtype=np.float32)


# ── Trading Agent ─────────────────────────────────────────────────────────

class TradingAgent:
    """
    Self-evolving trading agent with strategy DNA.
    Uses a simple policy network (can be upgraded to PPO).
    """
    
    def __init__(self, agent_id: str, dna: StrategyDNA):
        self.agent_id = agent_id
        self.dna = dna
        self.episode_pnl: list[float] = []
        self.episode_rewards: list[float] = []
        self._build_policy()
    
    def _build_policy(self):
        """Build a simple neural policy (numpy only, no torch required for MVP)"""
        # Simple 2-layer network: obs(8) → hidden(16) → action(3)
        np.random.seed(abs(hash(self.agent_id)) % (2**31))
        
        # Initialize weights influenced by DNA
        scale = 0.1 + self.dna.risk_tolerance * 0.1
        self.W1 = np.random.randn(8, 16) * scale
        self.b1 = np.zeros(16)
        self.W2 = np.random.randn(16, 3) * scale
        self.b2 = np.zeros(3)
    
    def _forward(self, obs: np.ndarray) -> np.ndarray:
        """Forward pass → [long_prob, short_prob, hold_prob]"""
        h = np.tanh(obs @ self.W1 + self.b1)
        logits = h @ self.W2 + self.b2
        # Softmax
        logits = logits - logits.max()
        probs = np.exp(logits)
        return probs / probs.sum()
    
    def get_action(self, state: MarketState) -> Tuple[str, float]:
        """
        Decide trading action based on market state + DNA.
        Returns: (action, confidence)
        """
        obs = state.to_observation()
        
        # DNA-based feature weighting
        dna_weights = self.dna.to_vector()[:8]
        weighted_obs = obs * np.clip(dna_weights, 0, 1)
        
        probs = self._forward(weighted_obs)
        
        # Apply risk tolerance: risk-averse agents prefer HOLD
        hold_boost = 1 - self.dna.risk_tolerance
        probs[2] *= (1 + hold_boost)
        probs = probs / probs.sum()  # renormalize
        
        # Additional rule-based overlays from DNA
        # RSI override
        if state.is_overbought and self.dna.rsi_weight > 0.7:
            probs[0] *= 0.5  # reduce long probability
        if state.is_oversold and self.dna.rsi_weight > 0.7:
            probs[1] *= 0.5  # reduce short probability
        
        # OI imbalance signal
        if abs(state.oi_imbalance) > 0.3 and self.dna.momentum_weight > 0.5:
            if state.oi_imbalance > 0:  # longs dominating → possible reversal
                probs[1] *= 1.3
            else:
                probs[0] *= 1.3
        
        probs = probs / probs.sum()
        
        action_idx = int(np.argmax(probs))
        actions = ["LONG", "SHORT", "HOLD"]
        confidence = float(probs[action_idx])
        
        return actions[action_idx], confidence
    
    def calculate_position_size(self, capital: float, confidence: float, price: float) -> float:
        """Kelly-adjusted position sizing"""
        kelly_size = capital * self.dna.kelly_fraction * confidence
        return min(kelly_size * self.dna.position_scaling, capital * 0.5)  # max 50% of capital
    
    def compute_reward(self, pnl: float, hold_time: float, drawdown: float) -> float:
        """
        Compute RL reward signal.
        Reward = Sharpe-like: reward good risk-adjusted returns, penalize drawdown.
        """
        # Base reward: PnL
        reward = pnl
        
        # Sharpe adjustment: reward consistency
        if len(self.episode_pnl) > 5:
            pnl_std = np.std(self.episode_pnl[-20:]) + 1e-6
            reward = pnl / pnl_std  # Sharpe-like normalization
        
        # Penalize excessive drawdown
        if drawdown > self.dna.max_drawdown_exit:
            reward -= drawdown * 10
        
        # Reward holding during trend (if trend follower)
        if self.dna.type_trend > 0.5 and hold_time > self.dna.hold_target_seconds:
            reward *= 1.1
        
        self.episode_pnl.append(pnl)
        self.episode_rewards.append(reward)
        
        return reward
    
    def train_epoch(self, experiences: list[dict]) -> dict:
        """
        Simple policy gradient update (REINFORCE algorithm).
        In production: replace with PPO from stable-baselines3.
        """
        if not experiences:
            return {"loss": 0, "mean_reward": 0}
        
        total_reward = sum(e["reward"] for e in experiences)
        mean_reward = total_reward / len(experiences)
        
        # Gradient update (simplified policy gradient)
        learning_rate = 0.001 * (1 - self.dna.risk_tolerance * 0.5)
        
        for exp in experiences:
            obs = np.array(exp["observation"], dtype=np.float32)
            action_idx = ["LONG", "SHORT", "HOLD"].index(exp["action"])
            reward = exp["reward"]
            
            # Forward pass
            h = np.tanh(obs @ self.W1 + self.b1)
            probs = self._forward(obs)
            
            # Policy gradient
            grad_output = np.zeros(3)
            grad_output[action_idx] = reward
            
            # Backprop (simplified)
            delta2 = grad_output * probs * (1 - probs)
            self.W2 += learning_rate * h[:, np.newaxis] * delta2[np.newaxis, :]
            self.b2 += learning_rate * delta2
        
        # Check if agent should evolve DNA
        if len(self.episode_rewards) > 50:
            recent_perf = np.mean(self.episode_rewards[-20:])
            older_perf = np.mean(self.episode_rewards[-50:-20])
            
            if recent_perf < older_perf * 0.8:  # performance degraded
                logger.info(f"Agent {self.agent_id}: performance declining, mutating DNA")
                self.dna = self.dna.mutate()
        
        return {
            "loss": -mean_reward,
            "mean_reward": mean_reward,
            "episode_length": len(experiences),
            "dna_generation": self.dna.generation,
        }
    
    def get_state_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "dna": asdict(self.dna),
            "W1": self.W1.tolist(),
            "b1": self.b1.tolist(),
            "W2": self.W2.tolist(),
            "b2": self.b2.tolist(),
        }
    
    @classmethod
    def from_state_dict(cls, state: dict) -> "TradingAgent":
        dna = StrategyDNA(**state["dna"])
        agent = cls(state["agent_id"], dna)
        agent.W1 = np.array(state["W1"])
        agent.b1 = np.array(state["b1"])
        agent.W2 = np.array(state["W2"])
        agent.b2 = np.array(state["b2"])
        return agent


# ── Agent Pool ────────────────────────────────────────────────────────────

class AgentPool:
    """Registry of live agents, runs their signal generation loop"""
    
    def __init__(self):
        self.agents: dict[str, TradingAgent] = {}
        self.signals: dict[str, dict] = {}
    
    def register(self, agent: TradingAgent):
        self.agents[agent.agent_id] = agent
        logger.info(f"Registered agent {agent.agent_id} (gen {agent.dna.generation})")
    
    def deregister(self, agent_id: str):
        self.agents.pop(agent_id, None)
    
    async def run_signal_loop(self, market_data_service):
        """Continuous loop: generate signals for all active agents"""
        while True:
            for agent_id, agent in list(self.agents.items()):
                try:
                    state = await market_data_service.get_state(agent.dna.type_trend > 0.5)
                    if state:
                        action, confidence = agent.get_action(state)
                        self.signals[agent_id] = {
                            "agent_id": agent_id,
                            "action": action,
                            "confidence": confidence,
                            "timestamp": asyncio.get_event_loop().time(),
                            "dna_generation": agent.dna.generation,
                        }
                except Exception as e:
                    logger.error(f"Agent {agent_id} signal error: {e}")
            
            await asyncio.sleep(1)  # Generate signals every second
    
    def get_signal(self, agent_id: str) -> Optional[dict]:
        return self.signals.get(agent_id)
    
    def get_top_signals(self, limit: int = 10) -> list[dict]:
        """Get highest-confidence signals across all agents"""
        signals = list(self.signals.values())
        signals.sort(key=lambda x: x["confidence"], reverse=True)
        return signals[:limit]


# ── Singleton pool ────────────────────────────────────────────────────────
agent_pool = AgentPool()
