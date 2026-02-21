import { Connection, clusterApiUrl } from '@solana/web3.js';

export const APP_NETWORK =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'devnet' | 'mainnet-beta') ||
  'devnet';

const HELIUS_RPC = process.env.HELIUS_RPC_URL;
const PUBLIC_FALLBACK =
  APP_NETWORK === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : clusterApiUrl('devnet');

export function getServerConnection(): Connection {
  const url = HELIUS_RPC || PUBLIC_FALLBACK;
  return new Connection(url, 'finalized');
}

export function getServerRpcUrl(): string {
  return HELIUS_RPC || PUBLIC_FALLBACK;
}

/**
 * Returns true if the given address is a newly-created account in the
 * transaction (preBalance === 0 and postBalance > 0).
 */
export function isNewlyCreatedAccount(
  accountKeys: string[],
  preBalances: number[],
  postBalances: number[],
  address: string,
): boolean {
  const idx = accountKeys.indexOf(address);
  if (idx === -1) return false;
  return preBalances[idx] === 0 && postBalances[idx] > 0;
}
