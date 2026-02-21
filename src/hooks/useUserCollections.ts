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
      const allNfts = await metaplex.nfts().findAllByOwner({
        owner: wallet.publicKey,
      });

      const collectionCandidates = allNfts.filter(
        (nft: any) =>
          nft.collectionDetails !== undefined &&
          nft.collectionDetails !== null,
      );

      // Drop NFTs whose metadata URI points at localhost — these were minted
      // during local dev and can never be fetched from the deployed site.
      const fetchable = collectionCandidates.filter((nft: any) => {
        const uri = nft.uri as string | undefined;
        return !uri || !isLocalhostUrl(uri);
      });

      const BATCH_SIZE = 3;
      const resolved: any[] = [];
      for (let i = 0; i < fetchable.length; i += BATCH_SIZE) {
        const batch = fetchable.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (nft: any) => {
            const uri = nft.uri as string | undefined;
            let loaded: any;

            try {
              loaded = await metaplex.nfts().load({ metadata: nft });
            } catch {
              try {
                loaded = await metaplex.nfts().load({
                  metadata: nft,
                  loadJsonMetadata: false,
                });
              } catch {
                loaded = nft;
              }
            }

            // If the SDK didn't populate JSON (e.g. arweave.net 404 on devnet),
            // try fetching through the Irys gateway so we can still determine
            // whether the NFT is a drop.
            if (!loaded.json && uri) {
              const json = await tryFetchJsonWithIrysGateway(uri);
              if (json) loaded = { ...loaded, json };
            }

            return loaded;
          }),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') resolved.push(r.value);
        }
      }

      const collectionNfts: CollectionOption[] = resolved
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
