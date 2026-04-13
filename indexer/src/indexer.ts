import { ethers } from "ethers";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const prisma = new PrismaClient();

// ── Contract ABIs (events only) ───────────────────────────────────────────

const PERP_ENGINE_ABI = [
  "event PositionOpened(bytes32 indexed positionId, address indexed trader, bytes32 indexed market, uint8 side, uint256 size, uint256 entryPrice, uint256 leverage)",
  "event PositionClosed(bytes32 indexed positionId, address indexed trader, int256 pnl, uint256 exitPrice, uint256 timestamp)",
  "event FundingSettled(bytes32 indexed positionId, int256 fundingAmount)",
];

const LIQUIDATION_ABI = [
  "event Liquidated(bytes32 indexed positionId, address indexed trader, address indexed liquidator, uint256 liqPrice, uint256 liquidatorBonus)",
  "event CircuitBreakerTriggered(uint256 liquidationCount, uint256 blockNumber)",
  "event DynamicMarginAdjusted(uint256 newMultiplier, string reason)",
];

const AGENT_REGISTRY_ABI = [
  "event AgentCreated(uint256 indexed agentId, address indexed owner, string name, bytes32 strategyHash)",
  "event AgentBred(uint256 indexed childId, uint256 indexed parent1, uint256 indexed parent2, address owner)",
  "event AgentEvolved(uint256 indexed agentId, bytes32 newStrategyHash, uint256 generation)",
  "event AgentSold(uint256 indexed agentId, address from, address to, uint256 price)",
  "event StatsUpdated(uint256 indexed agentId, int256 pnl, bool won)",
  "event XPAwarded(uint256 indexed agentId, uint256 xp, string reason)",
];

const FUNDING_ABI = [
  "event FundingRateUpdated(bytes32 indexed market, int256 rate, int256 predicted, uint256 timestamp)",
  "event OpenInterestUpdated(bytes32 indexed market, uint256 longOI, uint256 shortOI)",
];

// ── Provider Setup ────────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(
  process.env.RPC_URL || "https://rpc.testnet.arc.network"
);

// ── Indexer State ─────────────────────────────────────────────────────────

let lastProcessedBlock = 0;
const CONFIRMATION_BLOCKS = 2;
const POLL_INTERVAL_MS = 3000; // 3s

// ── Event Handlers ────────────────────────────────────────────────────────

async function handlePositionOpened(
  positionId: string,
  trader: string,
  market: string,
  side: number,
  size: bigint,
  entryPrice: bigint,
  leverage: bigint,
  event: ethers.Log
) {
  const marketStr = await resolveMarket(market);

  await prisma.position.upsert({
    where: { id: positionId },
    create: {
      id: positionId,
      trader: trader.toLowerCase(),
      market: marketStr,
      side: side === 0 ? "LONG" : "SHORT",
      size: Number(ethers.formatEther(size)),
      entryPrice: Number(ethers.formatEther(entryPrice)),
      margin: 0, // computed off-chain
      leverage: Number(leverage) / 100,
      liquidationPrice: 0, // computed
      isOpen: true,
      txHashOpen: event.transactionHash,
    },
    update: {},
  });

  // Update trader stats
  await updateTraderXP(trader, 50, "position_opened");

  console.log(`[Indexer] Position opened: ${positionId} | ${trader.slice(0, 8)} | ${marketStr} ${side === 0 ? "LONG" : "SHORT"}`);
}

async function handlePositionClosed(
  positionId: string,
  trader: string,
  pnl: bigint,
  exitPrice: bigint,
  timestamp: bigint,
  event: ethers.Log
) {
  const pnlNum = Number(ethers.formatEther(pnl));
  const won = pnlNum > 0;

  await prisma.position.update({
    where: { id: positionId },
    data: {
      isOpen: false,
      realizedPnl: pnlNum,
      closedAt: new Date(Number(timestamp) * 1000),
      txHashClose: event.transactionHash,
    },
  });

  // Record as filled order for analytics
  await prisma.order.updateMany({
    where: { trader: trader.toLowerCase(), status: "OPEN" },
    data: { status: "FILLED", pnl: pnlNum, filledAt: new Date() },
  });

  // XP for closing
  const xp = won ? 100 + Math.floor(Math.abs(pnlNum) / 100) : 10;
  await updateTraderXP(trader, xp, won ? "winning_trade" : "losing_trade");

  console.log(`[Indexer] Position closed: ${positionId} | PnL: ${pnlNum.toFixed(2)}`);
}

async function handleLiquidated(
  positionId: string,
  trader: string,
  liquidator: string,
  liqPrice: bigint,
  bonus: bigint,
  event: ethers.Log
) {
  await prisma.position.update({
    where: { id: positionId },
    data: {
      isOpen: false,
      realizedPnl: -1e9, // sentinel for liquidation
      closedAt: new Date(),
    },
  }).catch(() => {}); // position might not be in DB if indexer restarted

  await prisma.riskEvent.create({
    data: {
      market: "UNKNOWN",
      riskLevel: 1.0,
      anomalyType: "liquidation",
      description: `Position ${positionId} liquidated at $${ethers.formatEther(liqPrice)}`,
      actionTaken: `Liquidator ${liquidator.slice(0, 8)} received $${ethers.formatEther(bonus)} bonus`,
    },
  });

  console.log(`[Indexer] LIQUIDATION: ${positionId} | trader: ${trader.slice(0, 8)}`);
}

async function handleFundingRateUpdated(
  market: string,
  rate: bigint,
  predicted: bigint,
  timestamp: bigint
) {
  const marketStr = await resolveMarket(market);

  await prisma.fundingRate.create({
    data: {
      market: marketStr,
      rate: Number(rate) / 10000,  // convert from bps
      predicted: Number(predicted) / 10000,
      timestamp: new Date(Number(timestamp) * 1000),
    },
  });

  console.log(`[Indexer] Funding rate: ${marketStr} = ${Number(rate) / 100}bps`);
}

async function handleAgentEvolved(
  agentId: bigint,
  newStrategyHash: string,
  generation: bigint
) {
  // Try to find agent by on-chain ID
  await prisma.agent.updateMany({
    where: { onChainId: Number(agentId) },
    data: {
      strategyHash: newStrategyHash,
      generation: Number(generation),
      status: "ACTIVE",
    },
  });

  console.log(`[Indexer] Agent evolved: #${agentId} → gen ${generation}`);
}

// ── Main Indexer Loop ─────────────────────────────────────────────────────

async function indexEvents(fromBlock: number, toBlock: number) {
  const perpAddress = process.env.PERP_ENGINE_ADDRESS;
  const liqAddress = process.env.LIQUIDATION_ENGINE_ADDRESS;
  const agentAddress = process.env.AGENT_REGISTRY_ADDRESS;
  const fundingAddress = process.env.FUNDING_RATE_MODULE_ADDRESS;

  if (!perpAddress || !liqAddress || !agentAddress || !fundingAddress) {
    console.warn("[Indexer] Contract addresses not set — skipping");
    return;
  }

  const perpContract = new ethers.Contract(perpAddress, PERP_ENGINE_ABI, provider);
  const liqContract = new ethers.Contract(liqAddress, LIQUIDATION_ABI, provider);
  const agentContract = new ethers.Contract(agentAddress, AGENT_REGISTRY_ABI, provider);
  const fundingContract = new ethers.Contract(fundingAddress, FUNDING_ABI, provider);

  // Fetch events in parallel
  const [perpEvents, liqEvents, agentEvents, fundingEvents] = await Promise.all([
    perpContract.queryFilter("*", fromBlock, toBlock),
    liqContract.queryFilter("*", fromBlock, toBlock),
    agentContract.queryFilter("*", fromBlock, toBlock),
    fundingContract.queryFilter("*", fromBlock, toBlock),
  ]);

  // Process PerpEngine events
  for (const log of perpEvents) {
    const event = log as ethers.EventLog;
    try {
      switch (event.eventName) {
        case "PositionOpened":
          await handlePositionOpened(...(event.args as Parameters<typeof handlePositionOpened>).slice(0, -1) as Parameters<typeof handlePositionOpened>, event);
          break;
        case "PositionClosed":
          await handlePositionClosed(...(event.args as Parameters<typeof handlePositionClosed>).slice(0, -1) as Parameters<typeof handlePositionClosed>, event);
          break;
      }
    } catch (e) {
      console.error(`[Indexer] Error processing ${event.eventName}:`, e);
    }
  }

  // Process Liquidation events
  for (const log of liqEvents) {
    const event = log as ethers.EventLog;
    if (event.eventName === "Liquidated") {
      await handleLiquidated(...event.args as Parameters<typeof handleLiquidated>).catch(console.error);
    }
  }

  // Process Agent events
  for (const log of agentEvents) {
    const event = log as ethers.EventLog;
    if (event.eventName === "AgentEvolved") {
      await handleAgentEvolved(...event.args as Parameters<typeof handleAgentEvolved>).catch(console.error);
    }
  }

  // Process Funding events
  for (const log of fundingEvents) {
    const event = log as ethers.EventLog;
    if (event.eventName === "FundingRateUpdated") {
      await handleFundingRateUpdated(...event.args as Parameters<typeof handleFundingRateUpdated>).catch(console.error);
    }
  }
}

async function start() {
  console.log("🔍 ArcPerpX Indexer starting...");
  console.log(`   Network: Arc Testnet`);
  console.log(`   RPC: ${process.env.RPC_URL}`);

  // Get current block
  const currentBlock = await provider.getBlockNumber();
  lastProcessedBlock = currentBlock - 100; // start 100 blocks back

  console.log(`   Starting from block: ${lastProcessedBlock}`);

  // Main loop
  while (true) {
    try {
      const latestBlock = await provider.getBlockNumber();
      const safeBlock = latestBlock - CONFIRMATION_BLOCKS;

      if (safeBlock > lastProcessedBlock) {
        const fromBlock = lastProcessedBlock + 1;
        const toBlock = Math.min(safeBlock, fromBlock + 500); // max 500 blocks per batch

        await indexEvents(fromBlock, toBlock);
        lastProcessedBlock = toBlock;

        console.log(`[Indexer] Processed blocks ${fromBlock}–${toBlock}`);
      }
    } catch (e) {
      console.error("[Indexer] Loop error:", e);
    }

    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function resolveMarket(marketHash: string): Promise<string> {
  const KNOWN_MARKETS: Record<string, string> = {
    [ethers.keccak256(ethers.toUtf8Bytes("ETH-USD"))]: "ETH-USD",
    [ethers.keccak256(ethers.toUtf8Bytes("BTC-USD"))]: "BTC-USD",
    [ethers.keccak256(ethers.toUtf8Bytes("SOL-USD"))]: "SOL-USD",
    [ethers.keccak256(ethers.toUtf8Bytes("ARB-USD"))]: "ARB-USD",
  };
  return KNOWN_MARKETS[marketHash] || "UNKNOWN";
}

async function updateTraderXP(address: string, xp: number, reason: string) {
  await prisma.traderStats.upsert({
    where: { address: address.toLowerCase() },
    create: {
      address: address.toLowerCase(),
      xpPoints: xp,
      totalTrades: 1,
      winningTrades: reason === "winning_trade" ? 1 : 0,
    },
    update: {
      xpPoints: { increment: xp },
      totalTrades: { increment: 1 },
      winningTrades: { increment: reason === "winning_trade" ? 1 : 0 },
    },
  });
}

// ── Entry Point ───────────────────────────────────────────────────────────

start().catch((e) => {
  console.error("Indexer fatal error:", e);
  process.exit(1);
});
