'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import type { WalletError } from '@solana/wallet-adapter-base';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';

import '@solana/wallet-adapter-react-ui/styles.css';
import { SOLANA_NETWORK, SOLANA_WS_URL } from '@/lib/constants';

/**
 * Suppress errors thrown by MetaMask or other non-Solana wallets that inject
 * into the page via the Wallet Standard. We only support Phantom, so these
 * errors are irrelevant noise.
 */
function useSuppressNonPhantomErrors() {
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      const msg = event?.message || '';
      if (
        msg.includes('MetaMask') ||
        msg.includes('Ethereum') ||
        msg.includes('eth_requestAccounts')
      ) {
        console.warn('[3D Anvil] Non-Phantom wallet error suppressed:', msg);
        event.preventDefault();
        return true;
      }
    };
    window.addEventListener('error', handler);

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const msg = String(event?.reason?.message || event?.reason || '');
      if (
        msg.includes('MetaMask') ||
        msg.includes('Ethereum') ||
        msg.includes('eth_requestAccounts')
      ) {
        console.warn('[3D Anvil] Non-Phantom wallet rejection suppressed:', msg);
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', rejectionHandler);

    return () => {
      window.removeEventListener('error', handler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    };
  }, []);
}

export function WalletContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useSuppressNonPhantomErrors();

  const network =
    (process.env.NEXT_PUBLIC_SOLANA_NETWORK as WalletAdapterNetwork) ||
    WalletAdapterNetwork.Devnet;

  const endpoint = useMemo(() => {
    if (typeof window === 'undefined') {
      return SOLANA_NETWORK === 'mainnet-beta'
        ? 'https://api.mainnet-beta.solana.com'
        : 'https://api.devnet.solana.com';
    }
    return `${window.location.origin}/api/rpc`;
  }, []);

  // WebSocket for transaction confirmation subscriptions.
  // Uses NEXT_PUBLIC_SOLANA_WS_URL if set (recommended for mainnet — point to Helius WS).
  // Falls back to the public Solana endpoint, which is unreliable on mainnet.
  const wsEndpoint = useMemo(() => SOLANA_WS_URL, []);

  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  const onError = useCallback((error: WalletError) => {
    console.warn('[3D Anvil] Wallet error:', error.message);
  }, []);

  return (
    <ConnectionProvider
      endpoint={endpoint}
      config={{
        wsEndpoint,
        commitment: 'confirmed',
        disableRetryOnRateLimit: true,
        confirmTransactionInitialTimeout: 90_000,
      }}
    >
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
        onError={onError}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
