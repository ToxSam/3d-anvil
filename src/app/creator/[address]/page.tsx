'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useMetaplex } from '@/lib/metaplex';
import { PublicKey } from '@solana/web3.js';
import { CollectionCard } from '@/components/CollectionCard';
import { NFTCard } from '@/components/NFTCard';
import { ShareButtons } from '@/components/ShareButtons';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import { SkeletonGrid, StatSkeleton } from '@/components/Skeleton';
import { EXPLORER_URL, SOLANA_NETWORK, resolveArweaveUrl, tryFetchJsonWithIrysGateway } from '@/lib/constants';
import { getAssetsByCreator, getAssetsByOwner, DASAsset } from '@/lib/das';

const PAGE_SIZE = 20;

type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'items-desc';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name-asc', label: 'Name A→Z' },
  { value: 'name-desc', label: 'Name Z→A' },
];

const SORT_OPTIONS_WITH_ITEMS = [
  ...SORT_OPTIONS,
  { value: 'items-desc', label: 'Most items' },
];

function SortBar({
  value,
  onChange,
  totalCount,
  label,
  showItems = false,
  page,
  totalPages,
  onPageChange,
}: {
  value: string;
  onChange: (v: string) => void;
  totalCount: number;
  label: string;
  showItems?: boolean;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const options = showItems ? SORT_OPTIONS_WITH_ITEMS : SORT_OPTIONS;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <span className="text-caption text-gray-400 dark:text-gray-500 font-mono">
          {totalCount > PAGE_SIZE ? `${from}–${to} of ` : ''}{totalCount} {label}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 12h12M10 17h4" />
          </svg>
          <select
            value={value}
            onChange={(e) => { onChange(e.target.value); onPageChange(0); }}
            className="text-caption font-mono bg-transparent border border-gray-200/40 dark:border-gray-700/40 text-gray-500 dark:text-gray-400 hover:border-orange-400/50 hover:text-orange-400 focus:outline-none focus:border-orange-400/60 focus:text-orange-400 transition-colors px-2 py-1 cursor-pointer appearance-none pr-6 relative"
            style={{backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M1 1l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center'}}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value} className="bg-gray-900 dark:bg-gray-900 text-gray-100">
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="p-1 text-gray-400 hover:text-orange-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-caption font-mono text-gray-400 min-w-[2.5rem] text-center">
              {page + 1}/{totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="p-1 text-gray-400 hover:text-orange-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface CollectionItem {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  itemCount: number;
  createdAt: number;
}

interface NFTItem {
  address: string;
  name: string;
  description?: string;
  image?: string;
  animationUrl?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
  createdAt: number;
}

export default function CreatorPage() {
  const params = useParams();
  const address = params.address as string;
  const metaplex = useMetaplex();

  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [inventory, setInventory] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [topTab, setTopTab] = useState<'inventory' | 'forged'>('inventory');
  const [forgedTab, setForgedTab] = useState<'collections' | 'creations'>('collections');
  const [inventorySort, setInventorySort] = useState<SortOption>('newest');
  const [forgedSort, setForgedSort] = useState<SortOption>('newest');
  const [inventoryPage, setInventoryPage] = useState(0);
  const [collectionsPage, setCollectionsPage] = useState(0);
  const [creationsPage, setCreationsPage] = useState(0);
  const [, setStats] = useState({
    totalCollections: 0,
    totalCreations: 0,
    totalAssets: 0,
  });

  const loadInventory = useCallback(async () => {
    if (!address) return;
    setInventoryLoading(true);
    try {
      const result = await getAssetsByOwner(address);
      if (result?.items) {
        const get3DModelUrl = (item: DASAsset): string | undefined =>
          item.content?.links?.animation_url ||
          item.content?.files?.find(
            f => f.mime?.startsWith('model/') || /\.(vrm|glb|gltf)$/i.test(f.uri ?? ''),
          )?.uri;

        const results = await Promise.allSettled(
          result.items
            .filter(item => !!get3DModelUrl(item))
            .map(async (item) => {
              const animationUrl = resolveArweaveUrl(get3DModelUrl(item));
              let image = resolveArweaveUrl(item.content?.links?.image);
              // DAS sometimes hasn't indexed the image yet — fetch JSON as fallback
              if (!image && item.content?.json_uri) {
                const json = await tryFetchJsonWithIrysGateway(item.content.json_uri);
                if (json) image = resolveArweaveUrl(json.image);
              }
              return {
                address: item.id,
                name: item.content?.metadata?.name || 'Unnamed',
                description: item.content?.metadata?.description,
                image,
                animationUrl,
                createdAt: 0,
              } as NFTItem;
            }),
        );

        setInventory(
          results
            .filter((r): r is PromiseFulfilledResult<NFTItem> => r.status === 'fulfilled')
            .map(r => r.value),
        );
      }
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setInventoryLoading(false);
    }
  }, [address]);

  const loadCreatorData = useCallback(async () => {
    if (!address) return;
    setLoading(true);

    try {
      // Try DAS API first (fast, no wallet needed)
      const dasResult = await getAssetsByCreator(address);
      if (dasResult && dasResult.items.length > 0) {
        processAssets(dasResult.items);
        return;
      }

      // Fallback: use Metaplex SDK
      const creatorKey = new PublicKey(address);
      const allNfts = await metaplex.nfts().findAllByCreator({
        creator: creatorKey,
        position: 0,
      });

      // Load full data
      const loaded = await Promise.allSettled(
        allNfts.map(async (nft: any) => {
          try {
            return await metaplex.nfts().load({ metadata: nft });
          } catch {
            try {
              return await metaplex.nfts().load({ metadata: nft, loadJsonMetadata: false });
            } catch {
              return nft;
            }
          }
        }),
      );

      const resolved = loaded
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map((r) => r.value);

      // Separate collections from items
      const collectionList: CollectionItem[] = [];
      const nftList: NFTItem[] = [];

      for (const nft of resolved) {
        const isCollection = nft.collectionDetails != null;
        if (isCollection) {
          collectionList.push({
            address: (nft.mintAddress || nft.address).toString(),
            name: nft.name || 'Unnamed Collection',
            symbol: nft.symbol || '',
            description: nft.json?.description,
            image: resolveArweaveUrl(nft.json?.image),
            itemCount: nft.collectionDetails?.size ? Number(nft.collectionDetails.size) : 0,
            createdAt: 0,
          });
        } else {
          nftList.push({
            address: (nft.mintAddress || nft.address).toString(),
            name: nft.name || 'Unnamed',
            description: nft.json?.description,
            image: resolveArweaveUrl(nft.json?.image),
            animationUrl: resolveArweaveUrl(nft.json?.animation_url),
            attributes: nft.json?.attributes,
            createdAt: 0,
          });
        }
      }

      setCollections(collectionList);
      setNfts(nftList);
      setStats({
        totalCollections: collectionList.length,
        totalCreations: nftList.length,
        totalAssets: collectionList.length + nftList.length,
      });
    } catch (error) {
      console.error('Failed to load creator data:', error);
    } finally {
      setLoading(false);
    }
  }, [address, metaplex]);

  function processAssets(items: DASAsset[]) {
    const nftList: NFTItem[] = [];

    for (const item of items) {
      // Only include 3D Anvil creations — they always have a VRM/GLB model file.
      // Check content.links.animation_url first; also check content.files for VRM/GLB
      // mime types in case Helius hasn't populated content.links yet.
      const animUrl =
        item.content?.links?.animation_url ||
        item.content?.files?.find(
          f => f.mime?.startsWith('model/') || /\.(vrm|glb|gltf)$/i.test(f.uri ?? ''),
        )?.uri;
      if (!animUrl) continue;

      nftList.push({
        address: item.id,
        name: item.content?.metadata?.name || 'Unnamed',
        description: item.content?.metadata?.description,
        image: resolveArweaveUrl(item.content?.links?.image),
        animationUrl: resolveArweaveUrl(animUrl),
        createdAt: 0,
      });
    }

    setNfts(nftList);
    setStats({
      totalCollections: 0,
      totalCreations: nftList.length,
      totalAssets: nftList.length,
    });
  }

  function sortItems<T extends { createdAt: number; name: string }>(
    items: T[],
    sort: SortOption,
    getItemCount?: (item: T) => number,
  ): T[] {
    const arr = [...items];
    if (sort === 'newest') return arr.sort((a, b) => b.createdAt - a.createdAt);
    if (sort === 'oldest') return arr.sort((a, b) => a.createdAt - b.createdAt);
    if (sort === 'name-asc') return arr.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'name-desc') return arr.sort((a, b) => b.name.localeCompare(a.name));
    if (sort === 'items-desc' && getItemCount) return arr.sort((a, b) => getItemCount(b) - getItemCount(a));
    return arr;
  }

  const sortedInventory = useMemo(() => sortItems(inventory, inventorySort), [inventory, inventorySort]);
  const sortedCollections = useMemo(() => sortItems(collections, forgedSort, (c) => c.itemCount), [collections, forgedSort]);
  const sortedCreations = useMemo(() => sortItems(nfts, forgedSort), [nfts, forgedSort]);

  const inventoryPages = Math.max(1, Math.ceil(inventory.length / PAGE_SIZE));
  const collectionsPages = Math.max(1, Math.ceil(collections.length / PAGE_SIZE));
  const creationsPages = Math.max(1, Math.ceil(nfts.length / PAGE_SIZE));

  const pagedInventory = sortedInventory.slice(inventoryPage * PAGE_SIZE, (inventoryPage + 1) * PAGE_SIZE);
  const pagedCollections = sortedCollections.slice(collectionsPage * PAGE_SIZE, (collectionsPage + 1) * PAGE_SIZE);
  const pagedCreations = sortedCreations.slice(creationsPage * PAGE_SIZE, (creationsPage + 1) * PAGE_SIZE);

  useEffect(() => {
    loadCreatorData();
    loadInventory();
  }, [loadCreatorData, loadInventory]);

  const shortAddr = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  return (
    <ForgePageWrapper embers={20}>
      {/* Hero Header with Glassmorphism */}
      <section className="container-custom pt-8 md:pt-12 pb-6">
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-900/5 via-orange-500/5 to-gray-900/5 dark:from-gray-100/5 dark:via-orange-400/10 dark:to-gray-100/5 backdrop-blur-sm border border-gray-200/30 dark:border-gray-700/30 p-6 md:p-8 mb-6 animate-slide-up">
          {/* Animated gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{backgroundSize: '200% 100%', animation: 'gradient-shift 3s ease infinite'}} />
          
          <div className="relative z-10">
            {/* Top row: Profile Info */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-caption uppercase tracking-widest text-orange-400/70 font-mono block mb-1">Creator Profile</span>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight font-mono">
                      {shortAddr}
                    </h1>
                  </div>
                </div>
                
                {/* Full Address */}
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-small font-mono bg-gray-900/5 dark:bg-gray-100/5 px-3 py-1.5 border border-gray-200/50 dark:border-gray-700/50 text-gray-900 dark:text-gray-100 break-all">
                    {address}
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
              </div>

              {/* Share Buttons */}
              <div className="flex gap-2 flex-shrink-0">
                <ShareButtons
                  url={typeof window !== 'undefined' ? window.location.href : ''}
                  title={`Creator ${shortAddr}`}
                />
              </div>
            </div>

            {/* Stats Cards */}
            {loading && inventoryLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-slide-up animation-delay-100">
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-slide-up animation-delay-100">
                <div className="stat-forge group cursor-default">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-caption text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Inventory</p>
                      <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{inventory.length}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gray-900/5 dark:bg-gray-100/5 flex items-center justify-center group-hover:bg-orange-400/10 transition-colors">
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-orange-400 transition-colors" viewBox="0 0 512 512" fill="currentColor">
                        <path d="M436.38,138c-21.53-46-67.93-74.16-118-76a21.68,21.68,0,0,0-2.17-.12H213.29c-46.31,0-89.6,10-120.79,47.4-26.42,31.71-31.34,68.29-31.34,107.72V432.42A17.9,17.9,0,0,0,78.8,450.06H431.63a17.9,17.9,0,0,0,17.64-17.64V290.93C449.27,242.52,457.48,183.15,436.38,138Zm-332.8,20c18.17-44.52,60-60.76,104.72-60.76H316.2c41,.85,78.47,25.82,92.24,65.11,6.28,17.94,5.55,36.12,5.55,54.72v21.3H96.42C96.23,212,93.49,182.71,103.58,158ZM218.39,273.65H292v33H218.39ZM123.2,414.77H96.44V273.64h86.67v50.67A17.9,17.9,0,0,0,200.75,342H309.68a17.67,17.67,0,0,0,17.64-17.64V273.64H414V414.77Z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="stat-forge group cursor-default">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-caption text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Collections</p>
                      <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{collections.length}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gray-900/5 dark:bg-gray-100/5 flex items-center justify-center group-hover:bg-orange-400/10 transition-colors">
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="stat-forge group cursor-default">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-caption text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Creations</p>
                      <p className="text-2xl font-bold font-mono text-orange-400">{nfts.length}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-orange-400/10 flex items-center justify-center group-hover:bg-orange-400/20 transition-colors">
                      <svg className="w-5 h-5 text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top-level tabs: Inventory / Forged */}
        <div className="flex gap-0 border-b border-gray-300/20 dark:border-gray-700/20 animate-slide-up animation-delay-200">
          <button
            onClick={() => setTopTab('inventory')}
            className={`tab-forge !py-3 !px-5 text-small flex items-center gap-2 ${
              topTab === 'inventory' ? 'tab-forge-active' : 'tab-forge-inactive'
            }`}
          >
            <span className={`flex-shrink-0 w-4 h-4 ${topTab === 'inventory' ? 'text-orange-400' : 'text-orange-400/60'}`} aria-hidden>
              <svg viewBox="0 0 512 512" fill="currentColor" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <path d="M436.38,138c-21.53-46-67.93-74.16-118-76a21.68,21.68,0,0,0-2.17-.12H213.29c-46.31,0-89.6,10-120.79,47.4-26.42,31.71-31.34,68.29-31.34,107.72V432.42A17.9,17.9,0,0,0,78.8,450.06H431.63a17.9,17.9,0,0,0,17.64-17.64V290.93C449.27,242.52,457.48,183.15,436.38,138Zm-332.8,20c18.17-44.52,60-60.76,104.72-60.76H316.2c41,.85,78.47,25.82,92.24,65.11,6.28,17.94,5.55,36.12,5.55,54.72v21.3H96.42C96.23,212,93.49,182.71,103.58,158ZM218.39,273.65H292v33H218.39ZM123.2,414.77H96.44V273.64h86.67v50.67A17.9,17.9,0,0,0,200.75,342H309.68a17.67,17.67,0,0,0,17.64-17.64V273.64H414V414.77Z" />
              </svg>
            </span>
            Inventory
            {inventory.length > 0 && (
              <span className="ml-0.5 text-caption font-mono opacity-60">({inventory.length})</span>
            )}
          </button>
          <button
            onClick={() => setTopTab('forged')}
            className={`tab-forge !py-3 !px-5 text-small flex items-center gap-2 ${
              topTab === 'forged' ? 'tab-forge-active' : 'tab-forge-inactive'
            }`}
          >
            <span className={`flex-shrink-0 w-4 h-4 ${topTab === 'forged' ? 'text-orange-400' : 'text-orange-400/60'}`} aria-hidden>
              <svg viewBox="0 0 512 512" fill="currentColor" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <path d="M413.375 69.906L336.937 191.47l-8.25-32.69-30.218 88.97 62.655-29.375.22 29.438 127.03-50.938-70.813-1.97 47.782-68.686-73.47 39.25 21.5-95.564zM210.22 102.094l-32 14.406 16.874 55.656-177.813 80.03 12.564 27.876L207.656 200l30.406 49.47 49.313-22.19-21.344-70.343-55.81-54.843zM197.593 266.78v20.345h-88.906c15.994 38.807 51.225 65.43 88.906 74.28v32.97h58.562c-12.118 30.528-33.505 55.684-58.47 77.594H172.22v18.686H456.56V471.97h-27.406c-28.734-21.895-50.055-47.018-61.625-77.595h63.658v-29.188c19.748-6.995 39.5-19.51 59.25-36.687-19.812-17.523-39.23-27.25-59.25-31.938v-29.78H197.594z" />
              </svg>
            </span>
            Forged
            {(collections.length + nfts.length) > 0 && (
              <span className="ml-0.5 text-caption font-mono opacity-60">({collections.length + nfts.length})</span>
            )}
          </button>
        </div>
      </section>

      {/* Content */}
      <section className="container-custom py-6 pb-16 md:pb-20">
        {topTab === 'inventory' ? (
          // ── Inventory Tab ────────────────────────────────────────────
          inventoryLoading ? (
            <SkeletonGrid count={8} type="nft" />
          ) : inventory.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 mb-6 animate-fade-in">
                <svg className="w-10 h-10 text-gray-400" viewBox="0 0 512 512" fill="currentColor">
                  <path d="M436.38,138c-21.53-46-67.93-74.16-118-76a21.68,21.68,0,0,0-2.17-.12H213.29c-46.31,0-89.6,10-120.79,47.4-26.42,31.71-31.34,68.29-31.34,107.72V432.42A17.9,17.9,0,0,0,78.8,450.06H431.63a17.9,17.9,0,0,0,17.64-17.64V290.93C449.27,242.52,457.48,183.15,436.38,138Zm-332.8,20c18.17-44.52,60-60.76,104.72-60.76H316.2c41,.85,78.47,25.82,92.24,65.11,6.28,17.94,5.55,36.12,5.55,54.72v21.3H96.42C96.23,212,93.49,182.71,103.58,158ZM218.39,273.65H292v33H218.39ZM123.2,414.77H96.44V273.64h86.67v50.67A17.9,17.9,0,0,0,200.75,342H309.68a17.67,17.67,0,0,0,17.64-17.64V273.64H414V414.77Z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 animate-slide-up">
                Inventory is empty
              </h3>
              <p className="text-body text-gray-500 dark:text-gray-400 max-w-md mx-auto animate-slide-up animation-delay-100">
                This address doesn&apos;t own any NFTs yet.
              </p>
            </div>
          ) : (
            <div>
              <SortBar
                value={inventorySort}
                onChange={(v) => setInventorySort(v as SortOption)}
                totalCount={inventory.length}
                label="items"
                page={inventoryPage}
                totalPages={inventoryPages}
                onPageChange={setInventoryPage}
              />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {pagedInventory.map((nft, idx) => (
                  <div key={nft.address} className="animate-fade-in" style={{animationDelay: `${idx * 30}ms`}}>
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
            </div>
          )
        ) : (
          // ── Forged Tab ───────────────────────────────────────────────
          <div>
            {/* Forged sub-tabs: Collections / DROPS Creations */}
            <div className="flex gap-0 border-b border-gray-200/30 dark:border-gray-700/20 mb-6">
              <button
                onClick={() => setForgedTab('collections')}
                className={`tab-forge !py-2.5 !px-4 text-small ${
                  forgedTab === 'collections' ? 'tab-forge-active' : 'tab-forge-inactive'
                }`}
              >
                Collections ({collections.length})
              </button>
              <button
                onClick={() => setForgedTab('creations')}
                className={`tab-forge !py-2.5 !px-4 text-small ${
                  forgedTab === 'creations' ? 'tab-forge-active' : 'tab-forge-inactive'
                }`}
              >
                DROPS Creations ({nfts.length})
              </button>
            </div>

            {loading ? (
              <SkeletonGrid
                count={6}
                type={forgedTab === 'collections' ? 'collection' : 'nft'}
              />
            ) : forgedTab === 'collections' ? (
              collections.length === 0 ? (
                <div className="text-center py-20">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 mb-6 animate-fade-in">
                    <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 animate-slide-up">
                    No collections found
                  </h3>
                  <p className="text-body text-gray-500 dark:text-gray-400 max-w-md mx-auto animate-slide-up animation-delay-100">
                    This creator hasn&apos;t created any collections yet.
                  </p>
                </div>
              ) : (
                <div>
                  <SortBar
                    value={forgedSort}
                    onChange={(v) => setForgedSort(v as SortOption)}
                    totalCount={collections.length}
                    label="collections"
                    showItems
                    page={collectionsPage}
                    totalPages={collectionsPages}
                    onPageChange={setCollectionsPage}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {pagedCollections.map((col, idx) => (
                      <div key={col.address} className="animate-fade-in" style={{animationDelay: `${idx * 50}ms`}}>
                        <CollectionCard
                          address={col.address}
                          name={col.name}
                          symbol={col.symbol}
                          description={col.description}
                          image={col.image}
                          itemCount={col.itemCount}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : nfts.length === 0 ? (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 mb-6 animate-fade-in">
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 animate-slide-up">
                  No creations found
                </h3>
                <p className="text-body text-gray-500 dark:text-gray-400 max-w-md mx-auto animate-slide-up animation-delay-100">
                  This creator hasn&apos;t minted any NFTs yet.
                </p>
              </div>
            ) : (
              <div>
                <SortBar
                  value={forgedSort}
                  onChange={(v) => setForgedSort(v as SortOption)}
                  totalCount={nfts.length}
                  label="creations"
                  page={creationsPage}
                  totalPages={creationsPages}
                  onPageChange={setCreationsPage}
                />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {pagedCreations.map((nft, idx) => (
                    <div key={nft.address} className="animate-fade-in" style={{animationDelay: `${idx * 30}ms`}}>
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
              </div>
            )}
          </div>
        )}

        {/* Refresh */}
        {!loading && (
          <div className="text-center mt-10">
            <button
              onClick={() => { loadCreatorData(); loadInventory(); }}
              className="inline-flex items-center gap-2 text-small text-gray-400/70 hover:text-orange-400 transition-colors group"
            >
              <svg className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        )}
      </section>
    </ForgePageWrapper>
  );
}
