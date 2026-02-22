'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMetaplex } from '@/lib/metaplex';
import {
  isDropCollection,
  isLocalhostUrl,
  tryFetchJsonWithIrysGateway,
  resolveArweaveUrl,
} from '@/lib/constants';

export interface CollectionOption {
  address: string;
  name: string;
  symbol: string;
  image?: string;
  /** True when the collection was created as a Drop (open edition / dutch auction). */
  isDrop: boolean;
  /** Drop-specific: the mint_config stored in metadata */
  mintConfig?: any;
  /** Drop-specific: the animation_url (VRM / GLB) stored in metadata */
  animationUrl?: string;
  /** The raw JSON metadata from the collection NFT */
  json?: any;
  /** Number of items in the collection (from collectionDetails.size) */
  itemCount?: number;
}

export function useUserCollections() {
  const wallet = useWallet();
  const metaplex = useMetaplex();

  const [allCollections, setAllCollections] = useState<CollectionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCollections = useCallback(async () => {
    if (!wallet.publicKey) return;

    setLoading(true);
    setError(null);

    try {
      // Single RPC call — returns on-chain metadata including collectionDetails
      // without loading JSON (fast).
      const allNfts = await metaplex.nfts().findAllByOwner({
        owner: wallet.publicKey,
      });

      const collectionCandidates = allNfts.filter(
        (nft: any) =>
          nft.collectionDetails !== undefined &&
          nft.collectionDetails !== null,
      );

      const fetchable = collectionCandidates.filter((nft: any) => {
        const uri = nft.uri as string | undefined;
        return !uri || !isLocalhostUrl(uri);
      });

      // Fetch JSON metadata for all collections in parallel.
      // Collections are typically 1-10, so we can fire all fetches at once
      // instead of the old sequential batch-of-3 approach.
      const results = await Promise.allSettled(
        fetchable.map(async (nft: any) => {
          const uri = nft.uri as string | undefined;
          let json: any = {};
          if (uri) {
            json = await tryFetchJsonWithIrysGateway(uri) || {};
          }
          return { ...nft, json };
        }),
      );

      const collectionNfts: CollectionOption[] = results
        .filter(
          (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled',
        )
        .map((r) => r.value)
        .filter(
          (nft) =>
            nft.collectionDetails !== undefined &&
            nft.collectionDetails !== null,
        )
        .map((nft) => {
          const json = nft.json || {};
          const isDrop = isDropCollection(json);
          return {
            address: (nft.mintAddress || nft.address).toString(),
            name: nft.name || 'Unnamed Collection',
            symbol: nft.symbol || '',
            image: resolveArweaveUrl(json.image) || undefined,
            isDrop,
            mintConfig: isDrop ? json.mint_config : undefined,
            animationUrl: isDrop
              ? resolveArweaveUrl(json.animation_url) || undefined
              : undefined,
            json,
            itemCount: nft.collectionDetails?.size ? Number(nft.collectionDetails.size) : 0,
          };
        });

      setAllCollections(collectionNfts);
    } catch (err) {
      console.error('Failed to load collections:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey, metaplex]);

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      loadCollections();
    } else {
      setAllCollections([]);
      setError(null);
    }
  }, [wallet.connected, wallet.publicKey, loadCollections]);

  // Derived filtered lists
  const collections = allCollections.filter((c) => !c.isDrop);
  const drops = allCollections.filter((c) => c.isDrop);

  return {
    /** All collections (both standard and drops) */
    allCollections,
    /** Only standard collections (not drops) */
    collections,
    /** Only drop collections */
    drops,
    loading,
    error,
    reload: loadCollections,
    connected: wallet.connected,
  };
}
