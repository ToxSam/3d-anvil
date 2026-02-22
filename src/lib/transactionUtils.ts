'use client';

import { Connection, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { Umi, TransactionBuilder } from '@metaplex-foundation/umi';
import { SOLANA_RPC_URL } from './constants';

// ── Rent cost estimates (SOL) ────────────────────────────────────────────────

export const RENT_ESTIMATES = {
  /** Candy Machine + Candy Guard account rent (~0.01–0.02 SOL) */
  CANDY_MACHINE: 0.016,
  /** Collection NFT: mint + metadata + master edition (~0.005–0.008 SOL) */
  COLLECTION_NFT: 0.007,
  /** Per minted NFT: mint + metadata + token accounts (~0.003 SOL) */
  MINTED_NFT: 0.003,
  /** Approximate tx fee per transaction (~0.000005 SOL each) */
  TX_FEE_EACH: 0.000005,
} as const;

/**
 * Estimate total Solana rent for creating a drop (collection + Candy Machine).
 * Returns { rentSol, breakdown } for display in the cost confirmation modal.
 */
export function estimateDropRent(opts?: { hasGuardGroups?: boolean }): {
  rentSol: number;
  breakdown: { label: string; sol: number }[];
} {
  const breakdown: { label: string; sol: number }[] = [
    { label: 'Collection NFT accounts', sol: RENT_ESTIMATES.COLLECTION_NFT },
    { label: 'Candy Machine account', sol: RENT_ESTIMATES.CANDY_MACHINE },
  ];
  const txCount = opts?.hasGuardGroups ? 4 : 3;
  breakdown.push({ label: `Transaction fees (×${txCount})`, sol: RENT_ESTIMATES.TX_FEE_EACH * txCount });
  const rentSol = breakdown.reduce((sum, b) => sum + b.sol, 0);
  return { rentSol: Math.round(rentSol * 10000) / 10000, breakdown };
}

/**
 * Estimate Solana rent for creating a standalone collection.
 */
export function estimateCollectionRent(): {
  rentSol: number;
  breakdown: { label: string; sol: number }[];
} {
  const breakdown: { label: string; sol: number }[] = [
    { label: 'Collection NFT accounts', sol: RENT_ESTIMATES.COLLECTION_NFT },
    { label: 'Transaction fees (×1–2)', sol: RENT_ESTIMATES.TX_FEE_EACH * 2 },
  ];
  const rentSol = breakdown.reduce((sum, b) => sum + b.sol, 0);
  return { rentSol: Math.round(rentSol * 10000) / 10000, breakdown };
}

/**
 * Estimate Solana rent for minting an NFT (from collection mint page or Candy Machine).
 */
export function estimateMintRent(opts?: { isCandyMachine?: boolean; quantity?: number }): {
  rentSol: number;
  breakdown: { label: string; sol: number }[];
} {
  const qty = opts?.quantity ?? 1;
  const breakdown: { label: string; sol: number }[] = [
    { label: `NFT account rent (×${qty})`, sol: RENT_ESTIMATES.MINTED_NFT * qty },
    { label: `Transaction fees`, sol: RENT_ESTIMATES.TX_FEE_EACH * (opts?.isCandyMachine ? 2 : 3) * qty },
  ];
  const rentSol = breakdown.reduce((sum, b) => sum + b.sol, 0);
  return { rentSol: Math.round(rentSol * 10000) / 10000, breakdown };
}

// ── Transaction simulation ───────────────────────────────────────────────────

/**
 * Pre-simulate a raw web3.js Transaction with `sigVerify: false`.
 * Catches on-chain failures (insufficient funds, account mismatches, etc.)
 * BEFORE the wallet popup appears, reducing false Phantom warnings.
 *
 * Uses the raw RPC call to ensure `sigVerify: false` works with unsigned transactions.
 * Throws with a descriptive message if simulation fails.
 */
export async function simulateRawTransaction(
  connection: Connection,
  transaction: Transaction,
): Promise<void> {
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  const base64Tx = serialized.toString('base64');

  const rpcUrl = typeof window !== 'undefined' ? SOLANA_RPC_URL : '';
  if (!rpcUrl) return;

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'sim-raw-preflight',
      method: 'simulateTransaction',
      params: [
        base64Tx,
        {
          encoding: 'base64',
          sigVerify: false,
          commitment: 'confirmed',
          replaceRecentBlockhash: true,
        },
      ],
    }),
  });

  const result = await response.json();
  if (result.result?.value?.err) {
    const logs = (result.result.value.logs as string[] | undefined)?.join('\n') || '';
    throw new Error(
      `Simulation failed: ${JSON.stringify(result.result.value.err)}${logs ? '\n' + logs : ''}`,
    );
  }
}

/**
 * Pre-simulate a Umi TransactionBuilder with `sigVerify: false`.
 *
 * Builds the transaction without wallet signing, serializes it, and sends a
 * `simulateTransaction` RPC call through the /api/rpc proxy. This catches
 * program errors (wrong accounts, insufficient SOL, guard violations) before
 * Phantom's approval dialog, reducing false-positive warnings.
 */
export async function simulateUmiTransaction(
  umi: Umi,
  builder: TransactionBuilder,
): Promise<void> {
  const builtTx = await builder.buildWithLatestBlockhash(umi);
  const serialized = umi.transactions.serialize(builtTx);
  const base64Tx = Buffer.from(serialized).toString('base64');

  const rpcUrl = typeof window !== 'undefined' ? SOLANA_RPC_URL : '';
  if (!rpcUrl) return;

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'sim-preflight',
      method: 'simulateTransaction',
      params: [
        base64Tx,
        {
          encoding: 'base64',
          sigVerify: false,
          commitment: 'confirmed',
          replaceRecentBlockhash: true,
        },
      ],
    }),
  });

  const result = await response.json();
  if (result.result?.value?.err) {
    const logs = (result.result.value.logs as string[] | undefined)?.join('\n') || '';
    throw new Error(
      `Simulation failed: ${JSON.stringify(result.result.value.err)}${logs ? '\n' + logs : ''}`,
    );
  }
}

/**
 * Send-and-confirm a Umi builder with pre-simulation and a fresh blockhash.
 *
 * 1. Pre-simulates with `sigVerify: false` (catches errors before wallet popup)
 * 2. Fetches a fresh blockhash right before sending (minimises expiry window)
 * 3. Signs and sends via the normal Umi flow
 *
 * Use this as a drop-in replacement for `builder.sendAndConfirm(umi)`.
 */
export async function sendWithSimulation(
  umi: Umi,
  builder: TransactionBuilder,
): Promise<void> {
  await simulateUmiTransaction(umi, builder);
  await builder.sendAndConfirm(umi, {
    send: { skipPreflight: true },
    confirm: { commitment: 'confirmed' },
  });
}

/**
 * Build, simulate, sign, and send a raw web3.js Transaction with fresh blockhash.
 *
 * 1. Fetches fresh blockhash
 * 2. Sets it on the transaction
 * 3. Simulates with `sigVerify: false`
 * 4. Returns the ready-to-sign transaction
 *
 * The caller should then sign with `wallet.signTransaction(tx)` and send.
 */
export async function prepareAndSimulateRawTransaction(
  connection: Connection,
  transaction: Transaction,
): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');

  transaction.recentBlockhash = blockhash;

  await simulateRawTransaction(connection, transaction);

  return { blockhash, lastValidBlockHeight };
}

// ── Balance pre-flight check ─────────────────────────────────────────────────

/**
 * Check that the wallet has enough SOL for the estimated cost.
 * Returns `true` if sufficient, `false` otherwise.
 */
export async function checkSolBalance(
  connection: Connection,
  walletPubkey: { toBuffer(): Buffer },
  requiredSol: number,
): Promise<{ sufficient: boolean; balance: number }> {
  const balance = await connection.getBalance(walletPubkey as any);
  const balanceSol = balance / LAMPORTS_PER_SOL;
  return {
    sufficient: balanceSol >= requiredSol,
    balance: balanceSol,
  };
}
