import { NextRequest, NextResponse } from 'next/server';
import {
  isRegistryConfigured,
  hasSig,
  setSig,
  setCollectionRecord,
} from '@/lib/server/launchpadRegistry';
import {
  getServerConnection,
  isNewlyCreatedAccount,
} from '@/lib/server/solanaVerify';

const REGISTRY_SECRET = process.env.LAUNCHPAD_REGISTRY_SECRET;

export async function POST(req: NextRequest) {
  if (REGISTRY_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${REGISTRY_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!isRegistryConfigured()) {
    return NextResponse.json(
      { error: 'Launchpad registry not configured' },
      { status: 503 },
    );
  }

  let body: { txSignature?: string; collectionMint?: string; network?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { txSignature, collectionMint, network } = body;

  if (!txSignature || typeof txSignature !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid txSignature' },
      { status: 400 },
    );
  }
  if (!collectionMint || typeof collectionMint !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid collectionMint' },
      { status: 400 },
    );
  }
  if (!network || typeof network !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid network' },
      { status: 400 },
    );
  }

  // Replay protection
  const sigExists = await hasSig(txSignature);
  if (sigExists) {
    return NextResponse.json(
      { error: 'Transaction signature already registered' },
      { status: 409 },
    );
  }

  // Verify on-chain — use "confirmed" (supermajority-voted, available quickly).
  // "finalized" takes 15-30s+ on devnet which exceeds Vercel function timeouts.
  // The Metaplex SDK already waits for confirmed before returning to the client.
  const MAX_ATTEMPTS = 4;
  const RETRY_DELAY_MS = 2500;
  const connection = getServerConnection();
  let tx: Awaited<ReturnType<typeof connection.getTransaction>> = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      tx = await connection.getTransaction(txSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
    } catch (err) {
      console.error(
        `[register-collection] getTransaction error (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        err,
      );
      if (attempt === MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: 'Failed to fetch transaction from Solana' },
          { status: 502 },
        );
      }
    }

    if (tx) break;

    if (attempt < MAX_ATTEMPTS) {
      console.log(
        `[register-collection] tx not confirmed yet, retrying in ${RETRY_DELAY_MS}ms (attempt ${attempt}/${MAX_ATTEMPTS}) sig=${txSignature}`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  if (!tx) {
    console.warn(
      `[register-collection] tx not found after ${MAX_ATTEMPTS} attempts (confirmed). sig=${txSignature} mint=${collectionMint}`,
    );
    return NextResponse.json(
      { error: 'Transaction not found after retries (not yet confirmed or invalid)' },
      { status: 400 },
    );
  }

  if (tx.meta?.err) {
    console.warn(
      `[register-collection] tx failed on-chain. sig=${txSignature} err=${JSON.stringify(tx.meta.err)}`,
    );
    return NextResponse.json(
      { error: 'Transaction failed on-chain' },
      { status: 400 },
    );
  }

  // Extract account keys (supports both legacy and v0 messages)
  const message = tx.transaction.message;
  let accountKeys: string[];
  if ('getAccountKeys' in message) {
    const resolved = (message as any).getAccountKeys({
      accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined,
    });
    accountKeys = (resolved.staticAccountKeys ?? resolved.keySegments?.().flat() ?? [])
      .map((k: any) => (typeof k === 'string' ? k : k.toBase58()));
    const lookupKeys = [
      ...(resolved.accountKeysFromLookups?.writable ?? []),
      ...(resolved.accountKeysFromLookups?.readonly ?? []),
    ].map((k: any) => (typeof k === 'string' ? k : k.toBase58()));
    accountKeys = [...accountKeys, ...lookupKeys];
  } else {
    accountKeys = (message as any).accountKeys.map((k: any) =>
      typeof k === 'string' ? k : k.toBase58(),
    );
  }

  const preBalances = tx.meta?.preBalances ?? [];
  const postBalances = tx.meta?.postBalances ?? [];

  if (
    !isNewlyCreatedAccount(accountKeys, preBalances, postBalances, collectionMint)
  ) {
    console.warn(
      `[register-collection] mint not in newly-created accounts. sig=${txSignature} mint=${collectionMint} accountKeys=[${accountKeys.join(', ')}] preBalances=[${preBalances.join(', ')}] postBalances=[${postBalances.join(', ')}]`,
    );
    return NextResponse.json(
      {
        error:
          'collectionMint was not newly created in this transaction',
      },
      { status: 400 },
    );
  }

  // Persist to registry
  await setCollectionRecord(collectionMint, {
    mint: collectionMint,
    creator: accountKeys[0],
    createdAt: new Date().toISOString(),
    network,
  });

  await setSig(txSignature);

  return NextResponse.json({ ok: true, mint: collectionMint });
}
