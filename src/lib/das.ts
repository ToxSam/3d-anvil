'use client';

/**
 * DAS (Digital Asset Standard) API helpers.
 *
 * Uses Helius / compatible RPCs – no custom server needed.
 * All discovery, analytics, and search are powered by DAS directly from the
 * browser.
 */

import { SOLANA_RPC_URL, BETA_SUPPORTER_COLLECTION_MINT } from './constants';
import { cachedFetch } from './cache';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DASAsset {
  id: string;
  content?: {
    json_uri?: string;
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      attributes?: Array<{ trait_type?: string; value?: string }>;
    };
    links?: {
      image?: string;
      animation_url?: string;
    };
    files?: Array<{ uri?: string; mime?: string }>;
  };
  authorities?: Array<{ address: string; scopes: string[] }>;
  compression?: { compressed: boolean };
  grouping?: Array<{ group_key: string; group_value: string }>;
  ownership?: {
    owner: string;
    delegate?: string;
    frozen: boolean;
  };
  royalty?: {
    basis_points: number;
    percent: number;
  };
  creators?: Array<{ address: string; share: number; verified: boolean }>;
  interface?: string; // "V1_NFT" | "ProgrammableNFT" etc.
}

export interface DASSearchResult {
  total: number;
  limit: number;
  page: number;
  items: DASAsset[];
}

// ── Core RPC helper ────────────────────────────────────────────────────────

async function dasRPC<T>(method: string, params: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `das-${method}`,
        method,
        params,
      }),
    });
    const data = await res.json();
    if (data.error) {
      console.warn(`DAS ${method} error:`, data.error);
      return null;
    }
    return data.result as T;
  } catch (err) {
    console.warn(`DAS ${method} failed:`, err);
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get mint addresses of all NFTs in a collection (original helper).
 */
export async function getMintsByCollection(
  rpcUrl: string,
  collectionMint: string,
): Promise<string[]> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'das-get-assets-by-group',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: collectionMint,
        },
      }),
    });
    const data = await res.json();
    if (data.error) return [];
    const items = data.result?.items ?? [];
    return items.map((a: { id?: string }) => a.id).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get full DAS assets for a collection (with metadata).
 * Results are cached for 2 minutes.
 */
export async function getCollectionAssets(
  collectionMint: string,
  page = 1,
  limit = 50,
): Promise<DASSearchResult | null> {
  return cachedFetch(
    `das:collection:${collectionMint}:${page}:${limit}`,
    () =>
      dasRPC<DASSearchResult>('getAssetsByGroup', {
        groupKey: 'collection',
        groupValue: collectionMint,
        page,
        limit,
      }),
    120,
  );
}

/**
 * Get all assets owned by a wallet address.
 * Cached for 60 seconds.
 */
export async function getAssetsByOwner(
  ownerAddress: string,
  page = 1,
  limit = 100,
): Promise<DASSearchResult | null> {
  return cachedFetch(
    `das:owner:${ownerAddress}:${page}:${limit}`,
    () =>
      dasRPC<DASSearchResult>('getAssetsByOwner', {
        ownerAddress,
        page,
        limit,
      }),
    60,
  );
}

/**
 * Get all assets owned by a wallet, sorted by creation time.
 * Returns full DAS metadata AND implicit creation order (array position).
 * Cached for 60 seconds.
 */
export async function getAssetsByOwnerSorted(
  ownerAddress: string,
  sortBy: 'created' | 'updated' | 'recent_action' = 'created',
  sortDirection: 'asc' | 'desc' = 'desc',
  page = 1,
  limit = 1000,
): Promise<DASSearchResult | null> {
  return cachedFetch(
    `das:owner-sorted:${ownerAddress}:${sortBy}:${sortDirection}:${page}:${limit}`,
    () =>
      dasRPC<DASSearchResult>('getAssetsByOwner', {
        ownerAddress,
        sortBy: { sortBy, sortDirection },
        page,
        limit,
      }),
    60,
  );
}

/**
 * Get all assets created by a specific wallet address.
 * Cached for 2 minutes.
 */
export async function getAssetsByCreator(
  creatorAddress: string,
  page = 1,
  limit = 100,
): Promise<DASSearchResult | null> {
  return cachedFetch(
    `das:creator:${creatorAddress}:${page}:${limit}`,
    () =>
      dasRPC<DASSearchResult>('getAssetsByCreator', {
        creatorAddress,
        onlyVerified: true,
        page,
        limit,
      }),
    120,
  );
}

/**
 * Get a single asset by its mint address (DAS getAsset).
 * Cached for 5 minutes.
 */
export async function getAsset(mintAddress: string): Promise<DASAsset | null> {
  return cachedFetch(
    `das:asset:${mintAddress}`,
    () =>
      dasRPC<DASAsset>('getAsset', {
        id: mintAddress,
      }),
    300,
  );
}

/**
 * Search assets by name or other criteria.
 * Uses the searchAssets RPC if available.
 */
export async function searchAssets(
  query: string,
  page = 1,
  limit = 20,
): Promise<DASSearchResult | null> {
  return dasRPC<DASSearchResult>('searchAssets', {
    negate: false,
    conditionType: 'all',
    interface: 'V1_NFT',
    page,
    limit,
    // Free-text search (Helius supports this)
    ...(query ? { jsonUri: query } : {}),
  });
}

/**
 * Get all assets owned by a wallet sorted by creation time (Helius DAS).
 * Returns asset IDs in creation order — a single indexed query replaces
 * per-mint getSignaturesForAddress calls.  Falls back gracefully (empty
 * array) when the RPC doesn't support DAS (e.g. public devnet).
 */
export async function getOwnerAssetsInCreationOrder(
  ownerAddress: string,
  direction: 'asc' | 'desc' = 'desc',
  limit = 1000,
): Promise<string[]> {
  try {
    const result = await dasRPC<DASSearchResult>('getAssetsByOwner', {
      ownerAddress,
      sortBy: { sortBy: 'created', sortDirection: direction },
      page: 1,
      limit,
    });
    return (result?.items ?? []).map((a) => a.id).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Analytics helpers (compute in browser) ─────────────────────────────────

export interface CollectionStats {
  totalMinted: number;
  uniqueHolders: number;
  topHolders: Array<{ address: string; count: number }>;
}

/**
 * Calculate collection analytics entirely from DAS data – no server.
 * Cached for 3 minutes.
 */
export async function getCollectionStats(collectionMint: string): Promise<CollectionStats> {
  return cachedFetch(
    `das:stats:${collectionMint}`,
    async () => {
      const allItems: DASAsset[] = [];
      let page = 1;
      const limit = 1000;

      // Paginate through all assets
      while (true) {
        const result = await getCollectionAssets(collectionMint, page, limit);
        if (!result || result.items.length === 0) break;
        allItems.push(...result.items);
        if (allItems.length >= result.total || result.items.length < limit) break;
        page++;
      }

      // Calculate holders
      const holderCounts = new Map<string, number>();
      for (const item of allItems) {
        const owner = item.ownership?.owner;
        if (owner) {
          holderCounts.set(owner, (holderCounts.get(owner) || 0) + 1);
        }
      }

      // Top holders sorted descending
      const topHolders = Array.from(holderCounts.entries())
        .map(([address, count]) => ({ address, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalMinted: allItems.length,
        uniqueHolders: holderCounts.size,
        topHolders,
      };
    },
    180,
  );
}

/** Holder address and count for display (e.g. Holders tab). */
export interface HolderInfo {
  address: string;
  count: number;
}

/**
 * Get all holders for a collection with counts (from DAS).
 * Cached for 2 minutes. Use for Holders tab.
 */
export async function getCollectionHolders(collectionMint: string): Promise<HolderInfo[]> {
  return cachedFetch(
    `das:holders:${collectionMint}`,
    async () => {
      const holderCounts = new Map<string, number>();
      let page = 1;
      const limit = 500;
      while (true) {
        const result = await getCollectionAssets(collectionMint, page, limit);
        if (!result || result.items.length === 0) break;
        for (const item of result.items) {
          const owner = item.ownership?.owner;
          if (owner) holderCounts.set(owner, (holderCounts.get(owner) ?? 0) + 1);
        }
        if (result.items.length < limit || (result.total != null && page * limit >= result.total)) break;
        page++;
      }
      return Array.from(holderCounts.entries())
        .map(([address, count]) => ({ address, count }))
        .sort((a, b) => b.count - a.count);
    },
    120,
  );
}

/**
 * Returns true if the given wallet owns at least one NFT from the Beta Supporter collection.
 * Used for dashboard and creator Beta Badge. Cached 60s per owner.
 */
export async function ownerHasBetaSupporterNft(ownerAddress: string): Promise<boolean> {
  const result = await getAssetsByOwner(ownerAddress, 1, 1000);
  if (!result?.items?.length) return false;
  return result.items.some(
    (asset) =>
      asset.grouping?.some(
        (g) => g.group_key === 'collection' && g.group_value === BETA_SUPPORTER_COLLECTION_MINT,
      ),
  );
}
