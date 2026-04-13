import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying ArcPerpX contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // ── Deploy Vault ──────────────────────────────────────────────────────
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(deployer.address);
  await vault.waitForDeployment();
  console.log("✅ Vault deployed:", await vault.getAddress());

  // ── Deploy FundingRateModule ──────────────────────────────────────────
  const FundingRateModule = await ethers.getContractFactory("FundingRateModule");
  const fundingModule = await FundingRateModule.deploy();
  await fundingModule.waitForDeployment();
  console.log("✅ FundingRateModule deployed:", await fundingModule.getAddress());

  // ── Deploy MarginManager ──────────────────────────────────────────────
  // (simplified: MarginManager needs Vault ref)
  const MarginManager = await ethers.getContractFactory("MarginManager");
  const marginManager = await MarginManager.deploy(await vault.getAddress(), deployer.address);
  await marginManager.waitForDeployment();
  console.log("✅ MarginManager deployed:", await marginManager.getAddress());

  // ── Deploy PerpEngine ─────────────────────────────────────────────────
  const PerpEngine = await ethers.getContractFactory("PerpEngine");
  const perpEngine = await PerpEngine.deploy(
    await vault.getAddress(),
    await marginManager.getAddress(),
    await fundingModule.getAddress(),
    deployer.address
  );
  await perpEngine.waitForDeployment();
  console.log("✅ PerpEngine deployed:", await perpEngine.getAddress());

  // ── Deploy LiquidationEngine ──────────────────────────────────────────
  const LiquidationEngine = await ethers.getContractFactory("LiquidationEngine");
  const liquidationEngine = await LiquidationEngine.deploy(
    await vault.getAddress(),
    await perpEngine.getAddress(),
    deployer.address
  );
  await liquidationEngine.waitForDeployment();
  console.log("✅ LiquidationEngine deployed:", await liquidationEngine.getAddress());

  // ── Deploy AgentRegistry ──────────────────────────────────────────────
  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const agentRegistry = await AgentRegistry.deploy(deployer.address, deployer.address);
  await agentRegistry.waitForDeployment();
  console.log("✅ AgentRegistry deployed:", await agentRegistry.getAddress());

  // ── Deploy RewardSystem ───────────────────────────────────────────────
  const RewardSystem = await ethers.getContractFactory("RewardSystem");
  const rewardSystem = await RewardSystem.deploy(deployer.address);
  await rewardSystem.waitForDeployment();
  console.log("✅ RewardSystem deployed:", await rewardSystem.getAddress());

  // ── Grant Roles ───────────────────────────────────────────────────────
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const LIQUIDATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LIQUIDATOR_ROLE"));
  const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

  await vault.grantRole(ENGINE_ROLE, await perpEngine.getAddress());
  await vault.grantRole(LIQUIDATOR_ROLE, await liquidationEngine.getAddress());
  await perpEngine.grantRole(RELAYER_ROLE, deployer.address); // backend relayer

  console.log("✅ Roles granted");

  // ── Save Addresses ────────────────────────────────────────────────────
  const addresses = {
    vault: await vault.getAddress(),
    perpEngine: await perpEngine.getAddress(),
    marginManager: await marginManager.getAddress(),
    liquidationEngine: await liquidationEngine.getAddress(),
    fundingRateModule: await fundingModule.getAddress(),
    agentRegistry: await agentRegistry.getAddress(),
    rewardSystem: await rewardSystem.getAddress(),
    deployedAt: new Date().toISOString(),
    network: "arc-testnet",
    chainId: 2001,
  };

  fs.writeFileSync("./deployed-addresses.json", JSON.stringify(addresses, null, 2));
  console.log("\n📄 Addresses saved to deployed-addresses.json");
  console.log("\n🎯 Deployment complete!");
  console.table(addresses);

  // ── Update .env ───────────────────────────────────────────────────────
  console.log("\n📋 Add these to your .env:");
  console.log(`VAULT_ADDRESS=${addresses.vault}`);
  console.log(`PERP_ENGINE_ADDRESS=${addresses.perpEngine}`);
  console.log(`MARGIN_MANAGER_ADDRESS=${addresses.marginManager}`);
  console.log(`LIQUIDATION_ENGINE_ADDRESS=${addresses.liquidationEngine}`);
  console.log(`FUNDING_RATE_MODULE_ADDRESS=${addresses.fundingRateModule}`);
  console.log(`AGENT_REGISTRY_ADDRESS=${addresses.agentRegistry}`);
  console.log(`REWARD_SYSTEM_ADDRESS=${addresses.rewardSystem}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
