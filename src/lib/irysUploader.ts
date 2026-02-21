import { WebUploader } from '@irys/web-upload';
import { WebSolana } from '@irys/web-upload-solana';
import BigNumber from 'bignumber.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { SOLANA_NETWORK, SOLANA_RPC_URL } from './constants';

const ESTIMATED_METADATA_BYTES = 8192;
const FUNDING_BUFFER_MULTIPLIER = 1.15;

/**
 * Create a connected Irys web uploader bound to the user's wallet.
 * Does NOT trigger any wallet popups — only reads the public key.
 */
export async function createIrysUploader(wallet: WalletContextState) {
  if (!wallet.publicKey || !wallet.signMessage) {
    throw new Error('Wallet not connected or does not support message signing');
  }

  const builder = WebUploader(WebSolana)
    .withProvider(wallet)
    .withRpc(SOLANA_RPC_URL)
    .withIrysConfig({ timeout: 60000 });

  if (SOLANA_NETWORK === 'mainnet-beta') {
    builder.mainnet();
  } else {
    builder.devnet();
  }

  return await builder.build();
}

type IrysInstance = Awaited<ReturnType<typeof createIrysUploader>>;

/**
 * Estimate total Irys upload cost for the given files plus metadata uploads.
 * Queries the Irys node (HTTP only — no wallet approval).
 *
 * @param metadataUploadCount How many JSON metadata uploads to budget for (default 2:
 *   initial metadata + final metadata with candy-machine addresses).
 * @returns Total cost in lamports (BigNumber string for safe storage in React state)
 *   and a human-readable SOL amount.
 */
export async function estimateUploadCost(
  irys: IrysInstance,
  files: File[],
  metadataUploadCount = 2,
): Promise<{ totalLamports: string; totalSol: number }> {
  const prices = await Promise.all([
    ...files.map((f) => irys.getPrice(f.size)),
    ...Array.from({ length: metadataUploadCount }, () =>
      irys.getPrice(ESTIMATED_METADATA_BYTES),
    ),
  ]);

  const subtotal = prices.reduce((sum, p) => sum.plus(p), new BigNumber(0));
  const totalLamports = subtotal
    .multipliedBy(FUNDING_BUFFER_MULTIPLIER)
    .integerValue(BigNumber.ROUND_CEIL);
  const totalSol = parseFloat(irys.utils.fromAtomic(totalLamports).toString());

  return { totalLamports: totalLamports.toString(), totalSol };
}

/**
 * Fund the wallet's Irys balance in a single SOL transaction.
 * This is the ONE wallet approval the user sees for storage.
 */
export async function fundIrysBalance(
  irys: IrysInstance,
  lamports: string,
): Promise<void> {
  await irys.fund(new BigNumber(lamports));
}

/**
 * Batch-upload multiple files via `uploadFolder` (nested bundle).
 *
 * Uses a throwaway key internally so all items are signed without
 * individual wallet popups.  The wallet signs the outer bundle ONCE.
 *
 * @param entries  Each entry maps a unique `key` to a `File`.
 *                 The key is used as the filename inside the manifest,
 *                 so it MUST be unique across entries.
 * @returns        A Map from entry key → `https://arweave.net/{txId}`.
 */
export async function irysUploadFiles(
  irys: IrysInstance,
  entries: Array<{ key: string; file: File }>,
): Promise<Map<string, string>> {
  if (entries.length === 0) return new Map();

  const taggedFiles = entries.map(({ key, file }) => {
    const named = new File([file], key, { type: file.type });
    return Object.assign(named, { tags: [] as Array<{ name: string; value: string }> });
  });

  const result = await irys.uploadFolder(taggedFiles);
  const urls = new Map<string, string>();

  for (const { key } of entries) {
    const id = (result.manifest.paths as unknown as Record<string, { id: string }>)[key]?.id;
    if (id) urls.set(key, `https://arweave.net/${id}`);
  }

  return urls;
}

/**
 * Upload a browser File object to Irys (balance must already be funded).
 * Returns an `arweave.net` URL so existing URL-resolution helpers work.
 */
export async function irysUploadFile(
  irys: IrysInstance,
  file: File,
): Promise<string> {
  const receipt = await irys.uploadFile(file);
  return `https://arweave.net/${receipt.id}`;
}

/**
 * Upload a JSON metadata object to Irys (balance must already be funded).
 * Returns an `arweave.net` URL.
 */
export async function irysUploadJson(
  irys: IrysInstance,
  json: Record<string, unknown>,
): Promise<string> {
  const data = JSON.stringify(json);
  const receipt = await irys.upload(data, {
    tags: [{ name: 'Content-Type', value: 'application/json' }],
  });
  return `https://arweave.net/${receipt.id}`;
}
