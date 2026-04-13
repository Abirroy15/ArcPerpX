"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useTradingStore } from "@/store/tradingStore";

const ARC_TESTNET = {
  chainId: "0x7D1",       // 2001 in hex
  chainName: "Arc Testnet",
  nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
  rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://explorer.testnet.arc.network"],
};

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  isCorrectChain: boolean;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  balance: string;
  error: string | null;
}

export function useWallet() {
  const setWallet = useTradingStore((s) => s.setWallet);
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    chainId: null,
    isCorrectChain: false,
    provider: null,
    signer: null,
    balance: "0",
    error: null,
  });

  const getProvider = useCallback((): ethers.BrowserProvider | null => {
    if (typeof window === "undefined" || !window.ethereum) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setState((s) => ({ ...s, error: "MetaMask not installed" }));
      return;
    }

    setState((s) => ({ ...s, isConnecting: true, error: null }));

    try {
      // Request accounts
      const accounts = await provider.send("eth_requestAccounts", []);
      const address = accounts[0];
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      const balance = ethers.formatEther(await provider.getBalance(address));

      const isCorrectChain = chainId === 2001;

      setState({
        address,
        isConnected: true,
        isConnecting: false,
        chainId,
        isCorrectChain,
        provider,
        signer,
        balance,
        error: null,
      });

      setWallet(address);
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : "Connection failed",
      }));
    }
  }, [getProvider, setWallet]);

  const disconnect = useCallback(() => {
    setState({
      address: null,
      isConnected: false,
      isConnecting: false,
      chainId: null,
      isCorrectChain: false,
      provider: null,
      signer: null,
      balance: "0",
      error: null,
    });
    setWallet(null);
  }, [setWallet]);

  const switchToArc = useCallback(async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_TESTNET.chainId }],
      });
    } catch (switchError: unknown) {
      // Chain not added — add it
      if ((switchError as { code: number }).code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [ARC_TESTNET],
          });
        } catch (addError) {
          console.error("Failed to add Arc Testnet:", addError);
        }
      }
    }
  }, []);

  const signTypedData = useCallback(
    async (domain: object, types: object, value: object): Promise<string> => {
      if (!state.signer) throw new Error("Wallet not connected");
      return state.signer.signTypedData(
        domain as ethers.TypedDataDomain,
        types as Record<string, ethers.TypedDataField[]>,
        value
      );
    },
    [state.signer]
  );

  // Listen for account/chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setState((s) => ({ ...s, address: accounts[0] }));
        setWallet(accounts[0]);
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      setState((s) => ({ ...s, chainId, isCorrectChain: chainId === 2001 }));
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    // Auto-reconnect if previously connected
    window.ethereum.request({ method: "eth_accounts" }).then((accounts: string[]) => {
      if (accounts.length > 0) connect();
    });

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [connect, disconnect, setWallet]);

  return {
    ...state,
    connect,
    disconnect,
    switchToArc,
    signTypedData,
  };
}
