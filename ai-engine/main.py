"""
ArcPerpX AI Engine
Handles: Strategy DNA generation, RL training, agent breeding, AI Risk Oracle
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.dna import router as dna_router
from api.training import router as training_router
from api.breeding import router as breeding_router
from api.oracle import router as oracle_router
from api.signals import router as signals_router
from agents.risk_oracle import AIRiskOracle
from agents.liquidity_engine import PredictiveLiquidityEngine
from services.market_data import MarketDataService

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

# ── Global Services ───────────────────────────────────────────────────────

risk_oracle = AIRiskOracle()
liquidity_engine = PredictiveLiquidityEngine()
market_data = MarketDataService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background services on startup"""
    logger.info("🚀 Starting ArcPerpX AI Engine...")
    
    # Start market data feed
    asyncio.create_task(market_data.start_feed())
    logger.info("✅ Market data feed started")
    
    # Start AI Risk Oracle (continuous monitoring)
    asyncio.create_task(risk_oracle.monitor_loop())
    logger.info("✅ AI Risk Oracle monitoring started")
    
    # Start predictive liquidity engine
    asyncio.create_task(liquidity_engine.prediction_loop())
    logger.info("✅ Predictive Liquidity Engine started")
    
    logger.info("🎯 AI Engine ready on port 8000")
    yield
    
    logger.info("Shutting down AI Engine...")


# ── FastAPI App ───────────────────────────────────────────────────────────

app = FastAPI(
    title="ArcPerpX AI Engine",
    description="Self-evolving trading agents, AI Risk Oracle, and Predictive Liquidity",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────

app.include_router(dna_router, prefix="/generate-dna", tags=["DNA"])
app.include_router(training_router, prefix="/train", tags=["Training"])
app.include_router(breeding_router, prefix="/breed", tags=["Breeding"])
app.include_router(oracle_router, prefix="/oracle", tags=["Risk Oracle"])
app.include_router(signals_router, prefix="/signals", tags=["Trading Signals"])


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "services": {
            "risk_oracle": risk_oracle.status,
            "liquidity_engine": liquidity_engine.status,
            "market_data": market_data.status,
        }
    }


@app.get("/market-state/{market}")
async def get_market_state(market: str):
    """Get current AI-computed market state for frontend"""
    state = await market_data.get_state(market)
    risk = await risk_oracle.get_current_risk(market)
    liquidity = await liquidity_engine.get_prediction(market)
    
    return {
        "market": market,
        "state": state,
        "risk": risk,
        "liquidity_prediction": liquidity,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, workers=1)
