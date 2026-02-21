'use client';

import {
  Metaplex,
  walletAdapterIdentity,
  irysStorage,
} from '@metaplex-foundation/js';
import { Connection } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMemo } from 'react';
import { SOLANA_RPC_URL, SOLANA_WS_URL, IRYS_NODE } from './constants';

export function useMetaplex() {
  const wallet = useWallet();

  const metaplex = useMemo(() => {
    const connection = new Connection(SOLANA_RPC_URL, {
      wsEndpoint: SOLANA_WS_URL,
      commitment: 'confirmed',
      disableRetryOnRateLimit: true,
      confirmTransactionInitialTimeout: 90_000,
    });
    const mx = Metaplex.make(connection);

    if (wallet.publicKey && wallet.signTransaction) {
      mx.use(walletAdapterIdentity(wallet));
      mx.use(
        irysStorage({
          address: IRYS_NODE,
          providerUrl: SOLANA_RPC_URL,
          timeout: 60000,
        })
      );
    }

    return mx;
  }, [wallet]);

  return metaplex;
}
