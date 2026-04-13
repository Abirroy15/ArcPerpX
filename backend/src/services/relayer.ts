import { ethers } from "ethers";

const PERP_ENGINE_ABI = [
  "function openPosition((bytes32 market, uint8 side, uint8 marginMode, uint256 size, uint256 price, uint256 leverage, address collateralToken, bytes signature) params, address trader) returns (bytes32)",
  "function closePosition(bytes32 positionId, address trader)",
];

function getProvider() {
  const rpc = process.env.RPC_URL || "https://rpc.testnet.arc.network";
  return new ethers.JsonRpcProvider(rpc);
}

function getSigner() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in environment");
  return new ethers.Wallet(pk, getProvider());
}

export async function relayTransaction(
  method: string,
  params: Record<string, unknown>,
  _trader: string
): Promise<string> {
  // In production: actually relay to smart contract
  // For now: return mock tx hash (safe for testnet demo)
  if (process.env.NODE_ENV === "development" || !process.env.PRIVATE_KEY) {
    const mockTx = "0x" + Math.random().toString(16).slice(2).padEnd(64, "0");
    console.log(`[Relayer] Mock tx: ${mockTx} | method: ${method}`);
    return mockTx;
  }

  try {
    const signer = getSigner();
    const contract = new ethers.Contract(
      process.env.PERP_ENGINE_ADDRESS!,
      PERP_ENGINE_ABI,
      signer
    );
    const tx = await (contract as unknown as Record<string, (...args: unknown[]) => Promise<{ hash: string; wait: () => Promise<unknown> }>>) [method](params, _trader);
    await tx.wait();
    return tx.hash;
  } catch (e) {
    console.error("[Relayer] Transaction failed:", e);
    throw e;
  }
}
