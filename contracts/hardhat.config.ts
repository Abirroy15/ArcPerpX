import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    "arc-testnet": {
      url: process.env.RPC_URL || "https://rpc.testnet.arc.network",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 2001,
    },
    hardhat: {
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      "arc-testnet": "no-api-key-needed",
    },
    customChains: [
      {
        network: "arc-testnet",
        chainId: 2001,
        urls: {
          apiURL: "https://explorer.testnet.arc.network/api",
          browserURL: "https://explorer.testnet.arc.network",
        },
      },
    ],
  },
};

export default config;
