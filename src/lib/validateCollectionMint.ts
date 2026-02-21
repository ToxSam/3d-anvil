'use client';

import { Connection, PublicKey } from '@solana/web3.js';

// SPL Token program: mint accounts are owned by this program and are 82 bytes
const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
);
const MINT_ACCOUNT_DATA_LENGTH = 82;

export type ValidateCollectionMintResult =
  | { valid: true }
  | { valid: false; reason: 'not_found' | 'not_mint'; message: string };

/**
 * Checks that the given address is a valid SPL Token mint on the current RPC.
 * Use before minting to fail fast with a clear error when the collection
 * doesn't exist (e.g. wrong network) or isn't a mint address.
 */
export async function validateCollectionMint(
  connection: Connection,
  collectionMintAddress: string
): Promise<ValidateCollectionMintResult> {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(collectionMintAddress);
  } catch {
    return {
      valid: false,
      reason: 'not_mint',
      message:
        "This doesn't look like a valid Solana address. Use the collection's mint address from the collection page or dashboard.",
    };
  }

  const account = await connection.getAccountInfo(pubkey);

  if (!account) {
    return {
      valid: false,
      reason: 'not_found',
      message:
        "Collection not found at this address. Make sure your wallet is on the same network as this app (e.g. Devnet) and you're using the collection NFT's mint address—not a metadata or wallet address.",
    };
  }

  if (!account.owner.equals(TOKEN_PROGRAM_ID)) {
    return {
      valid: false,
      reason: 'not_mint',
      message:
        "This address is not a token mint. Use the collection's mint address (from the collection page URL or Dashboard → Collections).",
    };
  }

  if (account.data.length !== MINT_ACCOUNT_DATA_LENGTH) {
    return {
      valid: false,
      reason: 'not_mint',
      message:
        "This address doesn't look like a collection mint. Use the collection NFT's mint address.",
    };
  }

  return { valid: true };
}
