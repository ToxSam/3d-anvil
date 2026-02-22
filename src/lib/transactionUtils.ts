'use client';

import { Connection, Transaction, LAMPORTS_PER_SOL, PublicKey, Keypair } from '@solana/web3.js';
import type { Umi, TransactionBuilder, Signer as UmiSigner } from '@metaplex-foundation/umi';
import type { Metaplex } from '@metaplex-foundation/js';
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
 * Send-and-confirm a Umi builder with pre-simulation, fresh blockhash,
 * and wallet-first signing order (Phantom Lighthouse compatibility).
 *
 * Phantom's Lighthouse flags multi-signer transactions where additional
 * keypairs sign before the connected wallet. We ensure the wallet (identity)
 * signs first, then generated keypairs sign afterward.
 *
 * 1. Pre-simulates with `sigVerify: false` (catches errors before wallet popup)
 * 2. Fetches a fresh blockhash right before sending (minimises expiry window)
 * 3. Signs wallet-first, then keypair signers
 * 4. Sends and confirms
 */
export async function sendWithSimulation(
  umi: Umi,
  builder: TransactionBuilder,
): Promise<void> {
  await simulateUmiTransaction(umi, builder);

  // Collect unique signers from builder items, wallet-first.
  const identityKey = umi.identity.publicKey.toString();
  const seen = new Set<string>();
  const walletSigners: UmiSigner[] = [];
  const keypairSigners: UmiSigner[] = [];

  // Identity (wallet) always signs — it's the fee payer.
  walletSigners.push(umi.identity);
  seen.add(identityKey);

  for (const item of builder.items) {
    for (const s of item.signers) {
      const key = s.publicKey.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      keypairSigners.push(s);
    }
  }

  const readyBuilder = await builder.setLatestBlockhash(umi);
  let tx = readyBuilder.build(umi);

  for (const s of walletSigners) {
    tx = await s.signTransaction(tx);
  }
  for (const s of keypairSigners) {
    tx = await s.signTransaction(tx);
  }

  const sig = await umi.rpc.sendTransaction(tx, { skipPreflight: true });
  const confirmBlockhash = await umi.rpc.getLatestBlockhash({ commitment: 'confirmed' });
  await umi.rpc.confirmTransaction(sig, {
    strategy: { type: 'blockhash', ...confirmBlockhash },
    commitment: 'confirmed',
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

// ── Metaplex JS SDK wallet-first create ───────────────────────────────────────

/**
 * Create an NFT via the Metaplex JS SDK with wallet-first signing order.
 *
 * `metaplex.nfts().create()` internally generates a mint keypair and signs
 * it before the wallet, triggering Phantom Lighthouse warnings. This helper
 * uses the builder pattern to control signing order: wallet signs first,
 * then the generated mint keypair signs afterward.
 *
 * Returns the new mint address and the transaction signature.
 */
export async function createNftWalletFirst(
  metaplex: Metaplex,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createParams: any,
): Promise<{ mintAddress: PublicKey; signature: string }> {
  const builder = await metaplex.nfts().builders().create(createParams);

  const connection = metaplex.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');

  const tx = builder.toTransaction({ blockhash, lastValidBlockHeight });
  tx.feePayer = wallet.publicKey;

  await simulateRawTransaction(connection, tx);

  // Wallet (Phantom) signs FIRST
  const signedTx = await wallet.signTransaction(tx);

  // Additional keypairs (mint account, etc.) sign after
  const signers = builder.getSigners();
  for (const signer of signers) {
    if ('secretKey' in signer && !signer.publicKey.equals(wallet.publicKey)) {
      signedTx.partialSign(signer as Keypair);
    }
  }

  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: true,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  return { mintAddress: builder.getContext().mintAddress, signature: sig };
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
