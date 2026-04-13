"""
AI Risk Oracle
Detects market anomalies, predicts liquidation cascades, 
and dynamically adjusts margin requirements.
"""

import asyncio
import logging
import numpy as np
from dataclasses import dataclass
from typing import Optional
from collections import deque
import aiohttp
import os

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3001")
ALERT_WEBHOOK = os.getenv("ALERT_WEBHOOK", "")


@dataclass
class RiskSignal:
    market: str
    risk_level: float          # 0-1 (0=safe, 1=extreme risk)
    anomaly_type: Optional[str]  # "flash_crash", "cascade_risk", "manipulation", etc.
    recommended_margin_multiplier: float  # 1.0 = normal, 2.0 = double margin
    cascade_probability: float   # probability of liquidation cascade
    description: str
    timestamp: float


class AIRiskOracle:
    """
    Continuous market risk monitoring system.
    Uses statistical anomaly detection + ML pattern recognition.
    """
    
    def __init__(self):
        self.status = "initializing"
        self.price_history: dict[str, deque] = {}
        self.volume_history: dict[str, deque] = {}
        self.current_risks: dict[str, RiskSignal] = {}
        
        # Anomaly detection params
        self.lookback_window = 60    # data points for baseline
        self.z_score_threshold = 3.0 # standard deviations for anomaly
        self.cascade_oi_threshold = 0.4  # OI imbalance threshold
        
        # Volatility regime
        self.volatility_ewm = {}     # EWMA volatility per market
        self.ewm_alpha = 0.1
        
        self.markets = ["ETH-USD", "BTC-USD", "SOL-USD", "ARB-USD"]
    
    async def monitor_loop(self):
        """Continuous monitoring loop"""
        self.status = "running"
        
        for market in self.markets:
            self.price_history[market] = deque(maxlen=200)
            self.volume_history[market] = deque(maxlen=200)
            self.volatility_ewm[market] = 0.02  # 2% initial vol estimate
        
        while True:
            try:
                for market in self.markets:
                    signal = await self._analyze_market(market)
                    self.current_risks[market] = signal
                    
                    # Alert backend if high risk
                    if signal.risk_level > 0.7:
                        await self._alert_backend(signal)
                    
                    # Trigger circuit breaker for extreme risk
                    if signal.risk_level > 0.9 and signal.cascade_probability > 0.8:
                        await self._trigger_circuit_breaker(market, signal)
                
                await asyncio.sleep(5)  # Check every 5 seconds
                
            except Exception as e:
                logger.error(f"Risk oracle error: {e}")
                await asyncio.sleep(10)
    
    async def _analyze_market(self, market: str) -> RiskSignal:
        """Full risk analysis for a market"""
        prices = list(self.price_history[market])
        
        if len(prices) < 10:
            return RiskSignal(
                market=market,
                risk_level=0.0,
                anomaly_type=None,
                recommended_margin_multiplier=1.0,
                cascade_probability=0.0,
                description="Insufficient data",
                timestamp=asyncio.get_event_loop().time(),
            )
        
        # 1. Price anomaly detection (Z-score)
        price_z = self._compute_z_score(prices)
        
        # 2. Volatility regime detection
        vol = self._compute_realized_vol(prices)
        self.volatility_ewm[market] = (
            self.ewm_alpha * vol + (1 - self.ewm_alpha) * self.volatility_ewm[market]
        )
        vol_ratio = vol / (self.volatility_ewm[market] + 1e-8)
        
        # 3. Return distribution analysis (fat tails)
        if len(prices) > 20:
            returns = np.diff(prices) / np.array(prices[:-1])
            kurtosis = float(self._compute_kurtosis(returns))
        else:
            kurtosis = 3.0  # normal distribution baseline
        
        # 4. Momentum anomaly (flash crash detection)
        recent_return = (prices[-1] - prices[-5]) / (prices[-5] + 1e-8) if len(prices) >= 5 else 0
        flash_crash_signal = abs(recent_return) > 0.05  # >5% in short window
        
        # ── Compute Overall Risk Level ────────────────────────────────────
        
        risk_components = {
            "z_score": min(abs(price_z) / self.z_score_threshold, 1.0),
            "vol_regime": min((vol_ratio - 1) / 2, 1.0) if vol_ratio > 1 else 0,
            "fat_tails": min((kurtosis - 3) / 7, 1.0) if kurtosis > 3 else 0,
            "flash_crash": 1.0 if flash_crash_signal else 0.0,
        }
        
        # Weighted risk score
        weights = [0.3, 0.3, 0.2, 0.2]
        risk_level = float(np.dot(list(risk_components.values()), weights))
        risk_level = float(np.clip(risk_level, 0, 1))
        
        # ── Cascade Probability ───────────────────────────────────────────
        cascade_prob = self._estimate_cascade_probability(risk_level, vol_ratio, price_z)
        
        # ── Determine Anomaly Type ────────────────────────────────────────
        anomaly_type = None
        if flash_crash_signal:
            anomaly_type = "flash_crash"
        elif abs(price_z) > self.z_score_threshold:
            anomaly_type = "price_anomaly"
        elif vol_ratio > 3:
            anomaly_type = "volatility_spike"
        elif kurtosis > 6:
            anomaly_type = "fat_tail_distribution"
        
        # ── Margin Recommendation ─────────────────────────────────────────
        margin_multiplier = 1.0 + risk_level * 1.5  # 1.0x - 2.5x
        
        description = f"Risk: {risk_level:.2f} | Vol ratio: {vol_ratio:.2f} | Z: {price_z:.2f}"
        if anomaly_type:
            description = f"⚠️ {anomaly_type.upper()} | {description}"
        
        return RiskSignal(
            market=market,
            risk_level=risk_level,
            anomaly_type=anomaly_type,
            recommended_margin_multiplier=margin_multiplier,
            cascade_probability=cascade_prob,
            description=description,
            timestamp=asyncio.get_event_loop().time(),
        )
    
    def _compute_z_score(self, prices: list) -> float:
        if len(prices) < 5:
            return 0
        arr = np.array(prices)
        mean = arr[:-1].mean()
        std = arr[:-1].std() + 1e-8
        return float((arr[-1] - mean) / std)
    
    def _compute_realized_vol(self, prices: list, window: int = 20) -> float:
        if len(prices) < 2:
            return 0
        arr = np.array(prices[-window:])
        returns = np.diff(arr) / arr[:-1]
        return float(returns.std() * np.sqrt(len(returns)))
    
    def _compute_kurtosis(self, returns: np.ndarray) -> float:
        if len(returns) < 4:
            return 3.0
        mean = returns.mean()
        std = returns.std() + 1e-8
        normalized = (returns - mean) / std
        return float(np.mean(normalized ** 4))
    
    def _estimate_cascade_probability(
        self, risk_level: float, vol_ratio: float, price_z: float
    ) -> float:
        """
        Estimate probability of liquidation cascade.
        High risk + high volatility + large price move → high cascade risk.
        """
        # Simple logistic model
        logit = (
            -3.0  # baseline (low cascade prob)
            + risk_level * 4.0
            + max(0, vol_ratio - 2) * 2.0
            + max(0, abs(price_z) - 2) * 1.5
        )
        return float(1 / (1 + np.exp(-logit)))
    
    async def _alert_backend(self, signal: RiskSignal):
        """Notify backend to adjust margin requirements"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "market": signal.market,
                    "risk_level": signal.risk_level,
                    "margin_multiplier": signal.recommended_margin_multiplier,
                    "cascade_probability": signal.cascade_probability,
                    "anomaly_type": signal.anomaly_type,
                }
                await session.post(
                    f"{BACKEND_URL}/api/internal/risk-update",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=5),
                )
        except Exception as e:
            logger.error(f"Failed to alert backend: {e}")
    
    async def _trigger_circuit_breaker(self, market: str, signal: RiskSignal):
        """Trigger circuit breaker on smart contract via backend"""
        logger.warning(f"🚨 CIRCUIT BREAKER: {market} | Risk: {signal.risk_level:.2f}")
        try:
            async with aiohttp.ClientSession() as session:
                await session.post(
                    f"{BACKEND_URL}/api/internal/circuit-breaker",
                    json={"market": market, "activate": True, "reason": signal.anomaly_type},
                )
        except Exception as e:
            logger.error(f"Circuit breaker call failed: {e}")
    
    def ingest_price(self, market: str, price: float):
        """Feed new price data into the oracle"""
        if market in self.price_history:
            self.price_history[market].append(price)
    
    async def get_current_risk(self, market: str) -> Optional[dict]:
        signal = self.current_risks.get(market)
        if not signal:
            return None
        return {
            "market": market,
            "risk_level": signal.risk_level,
            "anomaly_type": signal.anomaly_type,
            "margin_multiplier": signal.recommended_margin_multiplier,
            "cascade_probability": signal.cascade_probability,
            "description": signal.description,
        }


# ── Predictive Liquidity Engine ───────────────────────────────────────────

class PredictiveLiquidityEngine:
    """
    Predicts where liquidity is needed and signals the protocol to adjust.
    """
    
    def __init__(self):
        self.status = "initializing"
        self.predictions: dict[str, dict] = {}
    
    async def prediction_loop(self):
        self.status = "running"
        
        while True:
            try:
                for market in ["ETH-USD", "BTC-USD", "SOL-USD"]:
                    prediction = await self._predict_liquidity(market)
                    self.predictions[market] = prediction
                
                await asyncio.sleep(30)  # Update every 30 seconds
            except Exception as e:
                logger.error(f"Liquidity engine error: {e}")
                await asyncio.sleep(60)
    
    async def _predict_liquidity(self, market: str) -> dict:
        """
        Predict upcoming liquidity needs.
        Looks at OI, funding, and vol to determine where spreads should adjust.
        """
        # Simplified: in production use ML model
        volatility_score = np.random.random() * 0.3 + 0.1
        oi_imbalance = (np.random.random() - 0.5) * 0.6
        
        recommended_spread_bps = max(5, int(volatility_score * 50))
        lp_incentive_multiplier = 1.0 + max(0, abs(oi_imbalance) * 2)
        
        zones = []
        base_price = {"ETH-USD": 3200, "BTC-USD": 67000, "SOL-USD": 180}.get(market, 1000)
        for pct_away in [-0.05, -0.03, -0.01, 0.01, 0.03, 0.05]:
            zone_price = base_price * (1 + pct_away)
            liquidity_needed = np.random.random() * 100_000
            zones.append({"price": zone_price, "liquidity_needed": liquidity_needed})
        
        return {
            "market": market,
            "recommended_spread_bps": recommended_spread_bps,
            "lp_incentive_multiplier": lp_incentive_multiplier,
            "high_activity_zones": zones,
            "predicted_volume_30m": np.random.random() * 5_000_000,
        }
    
    async def get_prediction(self, market: str) -> Optional[dict]:
        return self.predictions.get(market)
