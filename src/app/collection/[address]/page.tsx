'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMetaplex } from '@/lib/metaplex';
import { PublicKey } from '@solana/web3.js';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import { NFTCard } from '@/components/NFTCard';
import { ShareButtons } from '@/components/ShareButtons';
import { CollectionAnalytics } from '@/components/analytics/CollectionAnalytics';
import { CollectionSettingsForm } from '@/components/collection/CollectionSettingsForm';
import { MintConfig } from '@/lib/types/mintConfig';
import { useToast } from '@/components/Toast';
import { uploadFileToArweave, uploadMetadataToArweave } from '@/lib/uploadToArweave';
import { EXPLORER_URL, SOLANA_NETWORK, isDropCollection, tryFetchJsonWithIrysGateway, resolveArweaveUrl } from '@/lib/constants';
import { getCollectionAssets, getCollectionHolders, type HolderInfo, type DASAsset } from '@/lib/das';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TransactionConfirmModal, buildUpdateCollectionTransaction } from '@/components/TransactionConfirmModal';

type CollectionNFTItem = {
  address: string;
  name: string;
  description?: string;
  image?: string;
  animationUrl?: string;
  attributes?: Array<{ trait_type?: string; value?: string }>;
};

export default function CollectionPage() {
  const params = useParams();
  const address = params.address as string;
  const wallet = useWallet();
  const metaplex = useMetaplex();
  const router = useRouter();

  const [collection, setCollection] = useState<any>(null);
  const [nfts, setNfts] = useState<CollectionNFTItem[]>([]);
  const [holdersList, setHoldersList] = useState<HolderInfo[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'items' | 'holders' | 'analytics' | 'mint-settings'>('items');
  const [mintConfig, setMintConfig] = useState<MintConfig | null>(null);
  const [savingMintConfig, setSavingMintConfig] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ data: { isPublic: boolean; editors: string[]; royaltyPercent: number; newImageFile?: File | null }; config: MintConfig } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { toast } = useToast();

  function shortenAddress(addr: string, chars = 4): string {
    if (!addr) return '';
    return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
  }

  // Handle settings toggle with animation
  const toggleSettings = (show: boolean) => {
    if (isAnimating) return; // Prevent double-clicks during animation
    setIsAnimating(true);
    
    if (!show) {
      // Start collapse animation
      setIsCollapsing(true);
      setTimeout(() => {
        setShowSettings(false);
        setIsCollapsing(false);
        setIsAnimating(false);
        setHasUnsavedChanges(false); // Reset on close
      }, 400); // Match collapse animation duration
    } else {
      // Start expand animation
      setShowSettings(true);
      setTimeout(() => {
        setIsAnimating(false);
      }, 550); // Match expand animation duration
    }
  };

  useEffect(() => {
    if (!address) return;
    loadCollection(address);
  }, [address, metaplex]);

  async function loadCollection(collectionAddress: string) {
    setLoading(true);
    setLoadError(null);

    let collectionNft: any = null;

    try {
      // First try to load with JSON metadata
      try {
        collectionNft = await metaplex.nfts().findByMint({
          mintAddress: new PublicKey(collectionAddress),
        });
      } catch (jsonError) {
        // If JSON load fails (e.g. Arweave 404), try without JSON
        console.warn('Failed to load with JSON, trying without:', jsonError);
        try {
          collectionNft = await metaplex.nfts().findByMint({
            mintAddress: new PublicKey(collectionAddress),
            loadJsonMetadata: false,
          });
        } catch (chainError) {
          console.warn('Collection NFT not found on-chain:', chainError);
          // Collection might have been cleaned up on devnet — continue anyway
          // so we can still attempt to discover NFTs via wallet fallback.
        }
      }

      if (collectionNft) {
        // If JSON wasn't loaded (Irys devnet → arweave.net 404), try Irys gateway
        if (!collectionNft.json && collectionNft.uri) {
          const fallbackJson = await tryFetchJsonWithIrysGateway(collectionNft.uri);
          if (fallbackJson) {
            collectionNft = { ...collectionNft, json: fallbackJson, jsonLoaded: true };
          }
        }

        // Only redirect if we have JSON and it IS a drop.
        // When JSON is null we stay here — can't determine the type.
        if (collectionNft.json && isDropCollection(collectionNft.json)) {
          router.replace(`/drop/${collectionAddress}`);
          return;
        }

        setCollection(collectionNft);
        // Extract mint config from metadata
        const config = collectionNft.json?.mint_config as MintConfig | undefined;
        if (config) setMintConfig(config);
      }

      // Always attempt to load NFTs, even if the collection NFT itself
      // couldn't be fetched (common on devnet when accounts expire).
      await loadNFTs(collectionAddress, collectionNft);

      // Load holders list from DAS (ownership is on DAS, not on Metaplex NFT from findByMint)
      setHoldersLoading(true);
      try {
        const list = await getCollectionHolders(collectionAddress);
        setHoldersList(list);
      } catch (err) {
        console.warn('Failed to load holders:', err);
      } finally {
        setHoldersLoading(false);
      }

      if (!collectionNft) {
        setLoadError(
          'The collection account was not found on-chain. This can happen on devnet when accounts expire. NFTs that belong to this collection are shown below if any were found.'
        );
      }
    } catch (error) {
      console.error('Failed to load collection:', error);
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Load all NFTs belonging to this collection.
   *
   * Strategy (matches dashboard/creator DAS-first pattern):
   *   1. DAS getCollectionAssets — full metadata including images in one RPC call.
   *   2. Fallback A: Metaplex findAllByUpdateAuthority, filter by collection.
   *   3. Fallback B: Metaplex findAllByCreator (if wallet connected).
   *   4. Fallback C: Metaplex findAllByOwner (if wallet connected).
   */
  async function loadNFTs(
    collectionAddress: string,
    collectionNft?: any
  ) {
    try {
      // ── 1. DAS API (preferred) — full metadata in one call, like dashboard ──
      const dasResult = await getCollectionAssets(
        collectionAddress,
        1,
        1000
      );

      if (dasResult?.items && dasResult.items.length > 0) {
        const get3DModelUrl = (asset: DASAsset): string | undefined =>
          asset.content?.links?.animation_url ||
          asset.content?.files?.find(
            (f) =>
              f.mime?.startsWith('model/') ||
              /\.(vrm|glb|gltf)$/i.test(f.uri ?? ''),
          )?.uri;

        const itemResults = await Promise.allSettled(
          dasResult.items.map(async (asset) => {
            let image = resolveArweaveUrl(asset.content?.links?.image);
            const animationUrl = resolveArweaveUrl(get3DModelUrl(asset));

            // DAS sometimes hasn't indexed the image yet — fall back to JSON
            if (!image && asset.content?.json_uri) {
              const json = await tryFetchJsonWithIrysGateway(
                asset.content.json_uri,
              );
              if (json) image = resolveArweaveUrl(json.image);
            }

            return {
              address: asset.id,
              name:
                asset.content?.metadata?.name || 'Unnamed',
              description: asset.content?.metadata?.description,
              image,
              animationUrl,
              attributes: asset.content?.metadata?.attributes as Array<{
                trait_type?: string;
                value?: string;
              }>,
            };
          }),
        );

        const resolved = itemResults
          .filter(
            (r): r is PromiseFulfilledResult<CollectionNFTItem> =>
              r.status === 'fulfilled',
          )
          .map((r) => r.value);

        if (resolved.length > 0) {
          setNfts(resolved);
          return;
        }
      }

      // ── 2–4. Metaplex fallbacks (when DAS unavailable) ───────────────────
      const collectionKey = new PublicKey(collectionAddress);
      const belongsToCollection = (nft: any) => {
        if (nft.collectionDetails != null) return false;
        return nft.collection?.address?.equals(collectionKey);
      };

      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
        Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
          ),
        ]);

      const col = collectionNft || collection;
      const updateAuthority =
        col?.updateAuthorityAddress ||
        col?.updateAuthority?.address ||
        col?.updateAuthority;

      let found: any[] = [];

      if (updateAuthority) {
        try {
          const authorityKey =
            updateAuthority instanceof PublicKey
              ? updateAuthority
              : new PublicKey(updateAuthority.toString());
          const allByAuthority = await withTimeout(
            metaplex.nfts().findAllByUpdateAuthority({
              updateAuthority: authorityKey,
            }),
            15000,
          );
          found = allByAuthority.filter(belongsToCollection);
        } catch (err) {
          console.warn('Fallback A (update authority) failed:', err);
        }
      }

      if (found.length === 0 && wallet.publicKey) {
        try {
          const allByCreator = await withTimeout(
            metaplex.nfts().findAllByCreator({
              creator: wallet.publicKey,
              position: 0,
            }),
            15000,
          );
          found = allByCreator.filter(belongsToCollection);
        } catch (err) {
          console.warn('Fallback B (creator) failed:', err);
        }
      }

      if (found.length === 0 && wallet.publicKey) {
        try {
          const allByOwner = await withTimeout(
            metaplex.nfts().findAllByOwner({ owner: wallet.publicKey }),
            15000,
          );
          found = allByOwner.filter(belongsToCollection);
        } catch (err) {
          console.warn('Fallback C (owner) failed:', err);
        }
      }

      const loadedNfts = await Promise.allSettled(
        found.map(async (nft: any) => {
          try {
            return await metaplex.nfts().load({ metadata: nft });
          } catch {
            try {
              return await metaplex
                .nfts()
                .load({ metadata: nft, loadJsonMetadata: false });
            } catch {
              return nft;
            }
          }
        }),
      );

      const resolved: CollectionNFTItem[] = loadedNfts
        .filter(
          (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled',
        )
        .map((r) => r.value)
        .map((nft: any) => ({
          address: (nft.mintAddress || nft.address)?.toString() ?? '',
          name: nft.name || nft.json?.name || 'Unnamed',
          description: nft.json?.description,
          image: resolveArweaveUrl(nft.json?.image),
          animationUrl: resolveArweaveUrl(nft.json?.animation_url),
          attributes: nft.json?.attributes,
        }))
        .filter((n) => n.address);

      setNfts(resolved);
    } catch (error) {
      console.error('Failed to load NFTs:', error);
    }
  }

  function handleSaveSettingsRequest(
    data: { isPublic: boolean; editors: string[]; royaltyPercent: number; newImageFile?: File | null },
    config: MintConfig
  ) {
    if (!collection) return;
    setPendingSave({ data, config });
  }

  async function handleSaveSettings() {
    if (!collection || !pendingSave) return;
    const { data, config } = pendingSave;
    setPendingSave(null);

    setSavingMintConfig(true);
    try {
      const currentJson = collection.json || {};
      let imageUrl = currentJson.image;

      // Upload new thumbnail if changed
      if (data.newImageFile) {
        imageUrl = await uploadFileToArweave(metaplex, data.newImageFile);
      }

      const updatedMetadata = {
        ...currentJson,
        name: collection.name,
        symbol: collection.symbol,
        image: imageUrl,
        mint_config: config,
      };

      const newMetadataUrl = await uploadMetadataToArweave(metaplex, updatedMetadata);
      const royaltyBps = Math.round(Math.max(0, Math.min(100, data.royaltyPercent)) * 100);

      await metaplex.nfts().update({
        nftOrSft: collection,
        uri: newMetadataUrl,
        sellerFeeBasisPoints: royaltyBps,
      });

      setMintConfig(config);
      setCollection((prev: any) =>
        prev
          ? {
              ...prev,
              uri: newMetadataUrl,
              json: { ...prev.json, mint_config: config, image: imageUrl },
              sellerFeeBasisPoints: royaltyBps,
            }
          : null
      );
      toast('Collection settings saved!', 'success');
      setHasUnsavedChanges(false);
      toggleSettings(false);
      loadCollection(address);
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast('Failed to save: ' + (error as Error).message, 'error', 8000);
    } finally {
      setSavingMintConfig(false);
    }
  }

  // Check ownership - handle both possible property names
  const ownerPubkey = wallet.publicKey;
  const isOwner =
    ownerPubkey &&
    collection &&
    (collection.updateAuthorityAddress?.equals(ownerPubkey) ||
      collection.updateAuthority?.address?.equals(ownerPubkey) ||
      collection.updateAuthority?.equals?.(ownerPubkey));

  if (loading) {
    return (
      <ForgePageWrapper embers={12}>
        <div className="container-custom section-padding text-center">
          <div className="spinner-forge mx-auto" />
          <p className="text-body text-gray-500 dark:text-gray-400 mt-4 animate-fade-in">Loading collection...</p>
        </div>
      </ForgePageWrapper>
    );
  }

  if (!collection && nfts.length === 0) {
    return (
      <ForgePageWrapper embers={12}>
        <div className="container-custom section-padding text-center animate-slide-up">
          <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100">
            Collection not found
          </h1>
          <p className="text-body text-gray-500 dark:text-gray-400 mt-2">
            The collection at this address could not be loaded.
            {SOLANA_NETWORK === 'devnet' && ' On devnet, accounts can expire after a while.'}
          </p>
          {loadError && (
            <p className="text-small text-gray-400/60 mt-4 font-mono max-w-lg mx-auto break-all">
              {loadError}
            </p>
          )}
          <Link href="/dashboard" className="btn-hero-primary inline-block mt-8 py-3 px-8">
            Back to Dashboard
          </Link>
        </div>
      </ForgePageWrapper>
    );
  }

  // Get display data - handle missing JSON gracefully
  const displayName = collection?.name || 'Collection';
  const displaySymbol = collection?.symbol || '';
  const displayDescription = collection
    ? collection.json?.description || (collection.jsonLoaded === false
        ? '(Metadata not loaded - stored on Arweave devnet)'
        : '')
    : '';
  const displayImage = resolveArweaveUrl(collection?.json?.image);

  return (
    <ForgePageWrapper embers={20}>
      {/* Warning banner when collection account is missing */}
      {!collection && nfts.length > 0 && (
        <div className="bg-amber-400/5 border-b border-amber-400/20">
          <div className="container-custom py-3 px-4 flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-small text-amber-800 dark:text-amber-200">
              The collection account was not found on-chain (this is common on devnet). NFTs referencing this collection are shown below.
            </p>
          </div>
        </div>
      )}

      {/* Owner banner: configure / edit mint settings */}
      {isOwner && (
        <div className="bg-orange-400/5 border-b border-orange-400/20">
          <div className="container-custom py-3 px-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <p className="text-small font-bold text-orange-400">
                  You own this collection
                </p>
                <p className="text-caption text-gray-500 dark:text-gray-400">
                  {mintConfig?.isPublic
                    ? `Public minting is enabled at ${mintConfig.price} SOL${mintConfig.isDutchAuction ? ' (Dutch Auction)' : ''}`
                    : 'Public minting is off — click the gear icon to configure'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {mintConfig?.isPublic && (
                <Link href={`/mint/${address}`} className="btn-ghost !py-2 !px-4 !text-small">
                  View Mint Page
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collection Header */}
      <section className="container-custom py-8 md:py-12">
        {!showSettings && !isCollapsing ? (
          /* Profile View */
          <div className="relative overflow-hidden bg-gradient-to-br from-gray-900/5 via-orange-500/5 to-gray-900/5 dark:from-gray-100/5 dark:via-orange-400/10 dark:to-gray-100/5 backdrop-blur-sm border border-gray-200/30 dark:border-gray-700/30 p-6 md:p-8 animate-fade-in">
            {/* Animated gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{backgroundSize: '200% 100%', animation: 'gradient-shift 3s ease infinite'}} />
            
            {/* Settings Button - Top Right */}
            {isOwner && (
              <button
                onClick={() => toggleSettings(true)}
                disabled={isAnimating}
                className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-gray-900/5 dark:bg-gray-100/5 hover:bg-orange-400/10 dark:hover:bg-orange-400/20 border border-gray-200/50 dark:border-gray-700/50 flex items-center justify-center transition-all duration-300 group disabled:opacity-50 disabled:cursor-not-allowed"
                title="Collection Settings"
              >
                <svg className="w-5 h-5 text-gray-400 group-hover:text-orange-400 transition-all duration-300 group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
            
            <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start">
              {/* Image */}
              <div className="w-full md:w-56 lg:w-64 aspect-square bg-gray-100/50 dark:bg-gray-900/40 flex-shrink-0 overflow-hidden border border-gray-200/30 dark:border-gray-700/30">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-caption uppercase tracking-widest text-orange-400/70 font-mono block mb-1">{displaySymbol}</span>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                      {displayName}
                    </h1>
                  </div>
                </div>
                
                {displayDescription && (
                  <p className="text-body text-gray-600 dark:text-gray-400 mb-4">
                    {displayDescription}
                  </p>
                )}

                {/* Address */}
                <div className="flex items-center gap-2 flex-wrap mb-5">
                  <code className="text-small font-mono bg-gray-900/5 dark:bg-gray-100/5 px-3 py-1.5 border border-gray-200/50 dark:border-gray-700/50 text-gray-900 dark:text-gray-100 break-all">
                    {address.slice(0, 8)}...{address.slice(-8)}
                  </code>
                  <a
                    href={`${EXPLORER_URL}/address/${address}?cluster=${SOLANA_NETWORK}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-caption text-orange-400 hover:text-orange-500 transition-colors flex items-center gap-1"
                  >
                    View Explorer
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>

                {/* Stats Card */}
                <div className="stat-forge group cursor-default max-w-xs mb-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-caption text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Items Minted</p>
                      <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{nfts.length}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gray-900/5 dark:bg-gray-100/5 flex items-center justify-center group-hover:bg-orange-400/10 transition-colors">
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  {isOwner && (
                    <Link
                      href={`/create/mint?collection=${encodeURIComponent(address)}`}
                      className="btn-hero-primary !py-2.5 !px-5 inline-flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Mint NFT
                    </Link>
                  )}
                  {mintConfig?.isPublic && (
                    <Link href={`/mint/${address}`} className="btn-ghost !py-2.5 !px-4">
                      Public Mint Page
                    </Link>
                  )}
                  <Link href="/dashboard" className="btn-ghost !py-2.5 !px-4">
                    Dashboard
                  </Link>
                </div>

                {/* Share & Creator */}
                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <ShareButtons
                    url={typeof window !== 'undefined' ? window.location.href : ''}
                    title={displayName}
                    description={displayDescription}
                  />
                  {collection && (
                    <Link
                      href={`/creator/${(collection.updateAuthorityAddress || collection.updateAuthority?.address || collection.updateAuthority)?.toString()}`}
                      className="text-caption text-gray-400 hover:text-orange-400 transition-colors flex items-center gap-1"
                    >
                      View Creator
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Settings View */
          <div className={`relative flex flex-col overflow-hidden bg-gradient-to-br from-gray-900/5 via-orange-500/5 to-gray-900/5 dark:from-gray-100/5 dark:via-orange-400/10 dark:to-gray-100/5 backdrop-blur-sm border border-gray-200/30 dark:border-gray-700/30 ${isCollapsing ? 'settings-panel-collapse' : 'settings-panel-expand'}`}>
            {/* Animated gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{backgroundSize: '200% 100%', animation: 'gradient-shift 3s ease infinite'}} />
            
            {/* Back Button & Unsaved Changes Banner - Top Left */}
            <div className="absolute top-6 left-6 z-20 flex items-center gap-3">
              <button
                onClick={() => toggleSettings(false)}
                disabled={isAnimating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900/5 dark:bg-gray-100/5 hover:bg-orange-400/10 dark:hover:bg-orange-400/20 border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 text-gray-400 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="text-small text-gray-600 dark:text-gray-400 group-hover:text-orange-400 transition-colors font-medium">Back to Collection</span>
              </button>
              
              {hasUnsavedChanges && (
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-amber-400/10 dark:bg-amber-400/15 border border-amber-400/30 dark:border-amber-400/25 animate-fade-in">
                  <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-small font-medium text-amber-700 dark:text-amber-300">Unsaved Changes</span>
                </div>
              )}
            </div>

            <div className="relative z-10 flex flex-col">
              {/* Settings Header */}
              <div className="flex items-start gap-4 px-6 pt-24 pb-8 flex-shrink-0 border-b border-gray-200/20 dark:border-gray-700/20">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-caption uppercase tracking-widest text-orange-400 font-mono">Collection Settings</span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-2">
                    Configuration
                  </h2>
                  <p className="text-body text-gray-600 dark:text-gray-400">
                    Manage access control, royalties, and collection metadata
                  </p>
                </div>
              </div>

              {/* Settings Form - scrollable */}
              <div className="px-6 py-10 max-w-4xl mx-auto w-full">
                <CollectionSettingsForm
                  initialMintConfig={mintConfig}
                  initialRoyaltyBps={collection?.sellerFeeBasisPoints ?? 500}
                  initialImageUrl={collection?.json?.image}
                  onSave={(data, config) => handleSaveSettingsRequest(data, config)}
                  onFormChange={(hasChanges) => setHasUnsavedChanges(hasChanges)}
                  saving={savingMintConfig}
                />
                {(mintConfig?.isPublic ?? false) && (
                  <div className="mt-8 p-5 bg-gradient-to-br from-orange-400/5 to-orange-500/5 border border-orange-400/20 dark:border-orange-400/15">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-orange-400/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-small font-medium text-gray-900 dark:text-gray-100 mb-1">
                          Public Mint Page
                        </p>
                        <Link
                          href={`/mint/${address}`}
                          className="text-small text-orange-400 hover:text-orange-300 font-mono break-all transition-colors inline-flex items-center gap-2 group"
                        >
                          <span className="break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/mint/{address}</span>
                          <svg className="w-4 h-4 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Tabs: Holders / Analytics */}
      <section className="border-t border-gray-200/30 dark:border-gray-700/20">
        <div className="container-custom pt-6 pb-0">
          <div className="flex gap-0 border-b border-gray-300/20 dark:border-gray-700/20">
            <button
              onClick={() => setActiveSection('items')}
              className={`tab-forge !py-3 !px-4 text-small ${
                activeSection === 'items' ? 'tab-forge-active' : 'tab-forge-inactive'
              }`}
            >
              Items ({nfts.length})
            </button>
            <button
              onClick={() => setActiveSection('holders')}
              className={`tab-forge !py-3 !px-4 text-small ${
                activeSection === 'holders' ? 'tab-forge-active' : 'tab-forge-inactive'
              }`}
            >
              Holders ({holdersList.length})
            </button>
            <button
              onClick={() => setActiveSection('analytics')}
              className={`tab-forge !py-3 !px-4 text-small ${
                activeSection === 'analytics' ? 'tab-forge-active' : 'tab-forge-inactive'
              }`}
            >
              Analytics
            </button>
          </div>
        </div>

        <div className="container-custom py-8 md:py-12">
          {activeSection === 'items' ? (
            nfts.length === 0 ? (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 mb-6 animate-fade-in">
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 6.75v11.25c0 1.24 1.007 2.25 2.25 2.25z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 animate-slide-up">
                  No items yet
                </h3>
                {isOwner && (
                  <p className="text-body text-gray-500 dark:text-gray-400 animate-slide-up animation-delay-100">
                    Click &quot;Mint NFT&quot; above to mint your first item.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {nfts.map((nft, idx) => (
                  <div key={nft.address ?? idx} className="animate-fade-in" style={{animationDelay: `${idx * 30}ms`}}>
                    <NFTCard
                      address={nft.address}
                      name={nft.name}
                      description={nft.description}
                      image={nft.image}
                      animationUrl={nft.animationUrl}
                      attributes={nft.attributes}
                    />
                  </div>
                ))}
              </div>
            )
          ) : activeSection === 'holders' ? (
            <>
              {holdersLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="spinner-forge mx-auto mb-4" />
                  <p className="text-body text-gray-500 dark:text-gray-400">Loading holders...</p>
                </div>
              ) : holdersList.length === 0 ? (
                <div className="text-center py-20">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 mb-6 animate-fade-in">
                    <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 animate-slide-up">
                    No holders yet
                  </h3>
                  {isOwner && (
                    <p className="text-body text-gray-500 dark:text-gray-400 animate-slide-up animation-delay-100">
                      Click &quot;Mint NFT&quot; above to mint your first avatar.
                    </p>
                  )}
                </div>
              ) : (
                <div className="max-w-2xl">
                  <ul className="space-y-2">
                    {holdersList.map(({ address: owner, count }) => (
                      <li
                        key={owner}
                        className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200/30 dark:border-gray-700/20 hover:border-gray-300/40 dark:hover:border-gray-600/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-mono text-gray-900 dark:text-gray-100 truncate" title={owner}>
                            {shortenAddress(owner, 6)}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(owner);
                                toast?.success?.('Address copied');
                              } catch {
                                toast?.error?.('Failed to copy');
                              }
                            }}
                            className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                            title="Copy address"
                            aria-label="Copy address"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
                            {count} {count === 1 ? 'item' : 'items'}
                          </span>
                          <a
                            href={`${EXPLORER_URL}/address/${owner}?cluster=${SOLANA_NETWORK}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-caption text-gray-400 hover:text-orange-400 transition-colors"
                            title="View on Explorer"
                          >
                            Explorer
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : activeSection === 'analytics' ? (
            <CollectionAnalytics collectionAddress={address} />
          ) : null}
        </div>
      </section>
      {pendingSave && (
        <TransactionConfirmModal
          open={true}
          {...buildUpdateCollectionTransaction()}
          onConfirm={handleSaveSettings}
          onCancel={() => setPendingSave(null)}
        />
      )}
    </ForgePageWrapper>
  );
}
