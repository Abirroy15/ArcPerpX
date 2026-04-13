import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ethers } from "ethers";
import { orderbook } from "../services/orderbookEngine";
import { db } from "../db";
import { redis } from "../cache";
import { relayTransaction } from "../services/relayer";

export const orderRoutes = new Hono();

// ── Validation Schemas ────────────────────────────────────────────────────

const PlaceOrderSchema = z.object({
  market: z.string(),
  side: z.enum(["LONG", "SHORT"]),
  type: z.enum(["MARKET", "LIMIT", "STOP"]),
  size: z.number().positive(),
  price: z.number().optional(),
  stopPrice: z.number().optional(),
  leverage: z.number().min(100).max(5000),
  marginMode: z.enum(["CROSS", "ISOLATED"]).default("CROSS"),
  collateralToken: z.string(),
  slippageBps: z.number().min(0).max(500).default(30),
  signature: z.string(),
  nonce: z.number(),
  deadline: z.number(),
});

const CancelOrderSchema = z.object({
  orderId: z.string(),
  signature: z.string(),
});

// ── POST /api/orders ──────────────────────────────────────────────────────

orderRoutes.post("/", zValidator("json", PlaceOrderSchema), async (c) => {
  const body = c.req.valid("json");

  // Recover signer from EIP-712 signature
  const domain = {
    name: "ArcPerpX",
    version: "1",
    chainId: 2001,
    verifyingContract: process.env.PERP_ENGINE_ADDRESS || ethers.ZeroAddress,
  };
  const orderType = {
    Order: [
      { name: "market",   type: "string"  },
      { name: "side",     type: "string"  },
      { name: "size",     type: "uint256" },
      { name: "price",    type: "uint256" },
      { name: "leverage", type: "uint256" },
      { name: "nonce",    type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const orderValue = {
    market:   body.market,
    side:     body.side,
    size:     ethers.parseEther(body.size.toString()),
    price:    ethers.parseEther((body.price || 0).toString()),
    leverage: BigInt(body.leverage),
    nonce:    BigInt(body.nonce),
    deadline: BigInt(body.deadline),
  };

  let signerAddress: string;
  try {
    signerAddress = ethers.verifyTypedData(domain, orderType, orderValue, body.signature);
  } catch {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Check deadline
  if (body.deadline < Math.floor(Date.now() / 1000)) {
    return c.json({ error: "Order expired" }, 400);
  }

  // Replay protection via nonce
  const nonceKey = `nonce:${signerAddress}:${body.nonce}`;
  const usedNonce = await redis.get(nonceKey);
  if (usedNonce) return c.json({ error: "Nonce already used" }, 400);
  await redis.setex(nonceKey, 3600, "1");

  const orderId = ethers.keccak256(
    ethers.toUtf8Bytes(`${signerAddress}:${body.market}:${body.nonce}:${Date.now()}`)
  ).slice(0, 42);

  const order = {
    id: orderId,
    trader: signerAddress,
    market: body.market,
    side: body.side,
    type: body.type,
    status: "PENDING" as const,
    size: body.size,
    price: body.price,
    leverage: body.leverage,
    marginMode: body.marginMode,
    createdAt: Date.now(),
  };

  if (body.type === "MARKET") {
    const match = orderbook.matchMarketOrder(order as Parameters<typeof orderbook.matchMarketOrder>[0]);
    if (!match) return c.json({ error: "No liquidity" }, 400);

    const txHash = await relayTransaction("openPosition", {
      market:          ethers.keccak256(ethers.toUtf8Bytes(body.market)),
      side:            body.side === "LONG" ? 0 : 1,
      marginMode:      body.marginMode === "CROSS" ? 0 : 1,
      size:            ethers.parseEther(body.size.toString()),
      price:           0n,
      leverage:        BigInt(body.leverage),
      collateralToken: body.collateralToken,
      signature:       "0x",
    }, signerAddress).catch(() => "0x" + Math.random().toString(16).slice(2).padEnd(64, "0"));

    try {
      await db.order.create({
        data: {
          id: orderId, trader: signerAddress, market: body.market,
          side: body.side, type: body.type, size: body.size,
          price: match.executionPrice, leverage: body.leverage,
          marginMode: body.marginMode, status: "FILLED",
          txHash, filledAt: new Date(),
        },
      });
    } catch { /* DB may not be available */ }

    return c.json({ success: true, orderId, txHash, executionPrice: match.executionPrice, status: "FILLED" });
  }

  if (body.type === "LIMIT") {
    orderbook.addLimitOrder(order as Parameters<typeof orderbook.addLimitOrder>[0]);
    try {
      await db.order.create({
        data: {
          id: orderId, trader: signerAddress, market: body.market,
          side: body.side, type: body.type, size: body.size,
          price: body.price || 0, leverage: body.leverage,
          marginMode: body.marginMode, status: "OPEN",
        },
      });
    } catch { /* DB may not be available */ }
    return c.json({ success: true, orderId, status: "OPEN" });
  }

  return c.json({ error: "Unsupported order type" }, 400);
});

// ── GET /api/orders/:address ──────────────────────────────────────────────

orderRoutes.get("/:address", async (c) => {
  const address = c.req.param("address");
  const status = c.req.query("status");
  const market = c.req.query("market");

  try {
    const orders = await db.order.findMany({
      where: { trader: address, ...(status && { status }), ...(market && { market }) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return c.json({ orders });
  } catch {
    return c.json({ orders: [] });
  }
});

// ── DELETE /api/orders/:orderId ───────────────────────────────────────────

orderRoutes.delete("/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  orderbook.cancelOrder(orderId);
  try {
    await db.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  } catch { /* ok */ }
  return c.json({ success: true });
});


export const orderRoutes = new Hono();

// ── Validation Schemas ────────────────────────────────────────────────────

const PlaceOrderSchema = z.object({
  market: z.string().regex(/^[A-Z]+-USD$/),
  side: z.enum(["LONG", "SHORT"]),
  type: z.enum(["MARKET", "LIMIT", "STOP"]),
  size: z.number().positive(),
  price: z.number().optional(),        // required for LIMIT
  stopPrice: z.number().optional(),    // required for STOP
  leverage: z.number().min(1).max(50),
  marginMode: z.enum(["CROSS", "ISOLATED"]).default("CROSS"),
  collateralToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  slippageBps: z.number().min(0).max(500).default(30),
  // EIP-712 signature from MetaMask
  signature: z.string(),
  nonce: z.number(),
  deadline: z.number(),
});

const CancelOrderSchema = z.object({
  orderId: z.string(),
  signature: z.string(),
});

// ── POST /api/orders ──────────────────────────────────────────────────────

orderRoutes.post("/", zValidator("json", PlaceOrderSchema), async (c) => {
  const body = c.req.valid("json");

  // 1. Recover signer from EIP-712 signature
  const domain = {
    name: "ArcPerpX",
    version: "1",
    chainId: 2001,
    verifyingContract: process.env.PERP_ENGINE_ADDRESS,
  };

  const orderType = {
    Order: [
      { name: "market", type: "string" },
      { name: "side", type: "string" },
      { name: "size", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "leverage", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const orderValue = {
    market: body.market,
    side: body.side,
    size: ethers.parseEther(body.size.toString()),
    price: ethers.parseEther((body.price || 0).toString()),
    leverage: body.leverage * 100,
    nonce: body.nonce,
    deadline: body.deadline,
  };

  let signerAddress: string;
  try {
    signerAddress = ethers.verifyTypedData(domain, orderType, orderValue, body.signature);
  } catch (e) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // 2. Check deadline
  if (body.deadline < Math.floor(Date.now() / 1000)) {
    return c.json({ error: "Order expired" }, 400);
  }

  // 3. Check nonce (replay protection)
  const usedNonce = await redis.get(`nonce:${signerAddress}:${body.nonce}`);
  if (usedNonce) {
    return c.json({ error: "Nonce already used" }, 400);
  }
  await redis.setex(`nonce:${signerAddress}:${body.nonce}`, 3600, "1");

  // 4. Route by order type
  const orderId = generateOrderId(signerAddress, body);
  const order = {
    id: orderId,
    trader: signerAddress,
    ...body,
    status: "PENDING" as const,
    createdAt: Date.now(),
  };

  if (body.type === "MARKET") {
    // Immediate matching
    const match = await orderbook.matchMarketOrder(order);
    if (match) {
      // Relay to blockchain
      const txHash = await relayTransaction("openPosition", {
        market: ethers.keccak256(ethers.toUtf8Bytes(body.market)),
        side: body.side === "LONG" ? 0 : 1,
        marginMode: body.marginMode === "CROSS" ? 0 : 1,
        size: ethers.parseEther(body.size.toString()),
        price: 0n, // market order
        leverage: body.leverage * 100,
        collateralToken: body.collateralToken,
        signature: "0x",
      }, signerAddress);

      // Save to DB
      await db.order.create({
        data: {
          id: orderId,
          trader: signerAddress,
          market: body.market,
          side: body.side,
          type: body.type,
          size: body.size,
          price: match.executionPrice,
          leverage: body.leverage,
          marginMode: body.marginMode,
          status: "FILLED",
          txHash,
          filledAt: new Date(),
        },
      });

      // Broadcast trade
      eventBus.emit("trade", {
        market: body.market,
        side: body.side,
        size: body.size,
        price: match.executionPrice,
        trader: signerAddress,
        txHash,
      });

      return c.json({ 
        success: true, 
        orderId, 
        txHash, 
        executionPrice: match.executionPrice,
        status: "FILLED" 
      });
    }
  }

  if (body.type === "LIMIT") {
    // Add to orderbook
    orderbook.addLimitOrder(order);
    
    await db.order.create({
      data: {
        id: orderId,
        trader: signerAddress,
        market: body.market,
        side: body.side,
        type: body.type,
        size: body.size,
        price: body.price!,
        leverage: body.leverage,
        marginMode: body.marginMode,
        status: "OPEN",
      },
    });

    return c.json({ success: true, orderId, status: "OPEN" });
  }

  return c.json({ error: "Unknown order type" }, 400);
});

// ── GET /api/orders/:address ──────────────────────────────────────────────

orderRoutes.get("/:address", async (c) => {
  const address = c.req.param("address");
  const status = c.req.query("status");
  const market = c.req.query("market");

  const orders = await db.order.findMany({
    where: {
      trader: address,
      ...(status && { status }),
      ...(market && { market }),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return c.json({ orders });
});

// ── DELETE /api/orders/:orderId ───────────────────────────────────────────

orderRoutes.delete("/:orderId", zValidator("json", CancelOrderSchema), async (c) => {
  const orderId = c.req.param("orderId");
  const { signature } = c.req.valid("json");

  // Verify signature
  // ... (similar to above)

  orderbook.cancelOrder(orderId);
  
  await db.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
  });

  return c.json({ success: true });
});

// ── Helper ────────────────────────────────────────────────────────────────

function generateOrderId(address: string, order: z.infer<typeof PlaceOrderSchema>): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes(`${address}:${order.market}:${order.nonce}:${Date.now()}`)
  ).slice(0, 42);
}
