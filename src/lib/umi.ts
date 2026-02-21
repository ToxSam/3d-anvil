'use client';

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplCandyMachine } from '@metaplex-foundation/mpl-candy-machine';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { Connection } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMemo } from 'react';
import { SOLANA_RPC_URL, SOLANA_WS_URL } from './constants';

export function useUmi() {
  const wallet = useWallet();

  const umi = useMemo(() => {
    const connection = new Connection(SOLANA_RPC_URL, {
      wsEndpoint: SOLANA_WS_URL,
      commitment: 'confirmed',
      disableRetryOnRateLimit: true,
      confirmTransactionInitialTimeout: 90_000,
    });

    const u = createUmi(connection)
      .use(mplTokenMetadata())
      .use(mplCandyMachine());

    if (wallet.publicKey && wallet.signTransaction) {
      u.use(walletAdapterIdentity(wallet));
    }

    return u;
  }, [wallet]);

  return umi;
}
