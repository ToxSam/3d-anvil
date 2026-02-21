import { Metaplex } from '@metaplex-foundation/js';
import { PublicKey } from '@solana/web3.js';
import { getServerConnection, getServerRpcUrl } from './solanaVerify';

/* ── DAS-style types (normalised for both DAS and Metaplex paths) ──────── */

export interface ServerDASGrouping {
  group_key: string;
  group_value: string;
  verified?: boolean;
}

export interface ServerDASAsset {
  id: string;
  content: {
    metadata: { name: string; symbol: string; [k: string]: unknown };
    links?: { image?: string; [k: string]: unknown };
    files?: { uri: string; mime?: string }[];
    json_uri?: string;
  };
  grouping: ServerDASGrouping[];
  ownership: { owner: string };
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

export function extractCollectionGroup(
  asset: ServerDASAsset,
): ServerDASGrouping | null {
  return (
    asset.grouping.find(
      (g) =>
        g.group_key === 'collection' && (g.verified === true || g.verified === undefined),
    ) ?? null
  );
}

export function isVerifiedGroup(g: ServerDASGrouping): boolean {
  return g.group_key === 'collection' && g.verified !== false;
}

/* ── DAS: getAssetsByOwner via raw JSON-RPC ────────────────────────────── */

async function fetchDASAssetsByOwner(
  owner: string,
): Promise<ServerDASAsset[] | null> {
  const rpcUrl = getServerRpcUrl();

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'das-assets-by-owner',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: owner,
          page: 1,
          limit: 1000,
          displayOptions: { showCollectionMetadata: false },
        },
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (json.error || !json.result?.items) return null;

    return json.result.items as ServerDASAsset[];
  } catch {
    return null;
  }
}

/* ── Metaplex fallback: findAllByOwner → DAS-style normalisation ───────── */

async function fetchMetaplexAssetsByOwner(
  owner: string,
): Promise<ServerDASAsset[]> {
  const connection = getServerConnection();
  const metaplex = Metaplex.make(connection);

  const nfts = await metaplex
    .nfts()
    .findAllByOwner({ owner: new PublicKey(owner) });

  return nfts
    .filter((nft) => nft.model === 'metadata')
    .map((nft): ServerDASAsset => {
      const collection = (nft as any).collection;
      const grouping: ServerDASGrouping[] = [];
      if (collection?.address) {
        grouping.push({
          group_key: 'collection',
          group_value: collection.address.toBase58(),
          verified: collection.verified ?? false,
        });
      }

      return {
        id: nft.mintAddress.toBase58(),
        content: {
          metadata: {
            name: nft.name ?? '',
            symbol: nft.symbol ?? '',
          },
          json_uri: nft.uri ?? undefined,
        },
        grouping,
        ownership: { owner },
      };
    });
}

/* ── Public: get all assets, DAS-first with Metaplex fallback ──────────── */

export async function getAllAssetsByOwner(
  owner: string,
): Promise<ServerDASAsset[]> {
  const dasResult = await fetchDASAssetsByOwner(owner);
  if (dasResult && dasResult.length > 0) return dasResult;

  return fetchMetaplexAssetsByOwner(owner);
}
