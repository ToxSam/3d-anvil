'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMetaplex } from '@/lib/metaplex';
import { CollectionCard } from '@/components/CollectionCard';
import { NFTCard } from '@/components/NFTCard';
import { WalletButton } from '@/components/WalletButton';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import Link from 'next/link';
import { EXPLORER_URL, SOLANA_NETWORK, isDropCollection, isLocalhostUrl, tryFetchJsonWithIrysGateway, resolveArweaveUrl } from '@/lib/constants';
import { getOwnerAssetsInCreationOrder } from '@/lib/das';

const PAGE_SIZE = 20;

interface CollectionItem {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  itemCount: number;
  isDrop: boolean;
  mintConfig?: any;
  createdAt: number;
}

interface NFTItem {
  address: string;
  name: string;
  description?: string;
  image?: string;
  animationUrl?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
  collectionName?: string;
  createdAt: number;
}

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
  loadingTimestamps = false,
}: {
  value: string;
  onChange: (v: string) => void;
  totalCount: number;
  label: string;
  showItems?: boolean;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  loadingTimestamps?: boolean;
}) {
  const options = showItems ? SORT_OPTIONS_WITH_ITEMS : SORT_OPTIONS;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
      {/* Left: count + sort */}
      <div className="flex items-center gap-3">
        <span className="text-caption text-gray-400 dark:text-gray-500 font-mono">
          {totalCount > PAGE_SIZE ? `${from}–${to} of ` : ''}{totalCount} {label}
        </span>
        {loadingTimestamps && (value === 'newest' || value === 'oldest') && (
          <span className="text-caption text-orange-400/60 font-mono flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 border border-orange-400/60 border-t-transparent rounded-full animate-spin" />
            sorting...
          </span>
        )}
      </div>

      {/* Right: sort + pagination */}
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

export default function DashboardPage() {
  const wallet = useWallet();
  const metaplex = useMetaplex();

  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [drops, setDrops] = useState<CollectionItem[]>([]);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTimestamps, setLoadingTimestamps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<'inventory' | 'forged'>('inventory');
  const [forgedTab, setForgedTab] = useState<'collections' | 'drops'>('collections');

  const [inventorySort, setInventorySort] = useState<SortOption>('newest');
  const [forgedSort, setForgedSort] = useState<SortOption>('newest');

  const [inventoryPage, setInventoryPage] = useState(0);
  const [collectionsPage, setCollectionsPage] = useState(0);
  const [dropsPage, setDropsPage] = useState(0);

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

  const sortedNfts = useMemo(() => sortItems(nfts, inventorySort), [nfts, inventorySort]);
  const sortedCollections = useMemo(() => sortItems(collections, forgedSort, (c) => c.itemCount), [collections, forgedSort]);
  const sortedDrops = useMemo(() => sortItems(drops, forgedSort, (d) => d.itemCount), [drops, forgedSort]);

  const nftPages = Math.max(1, Math.ceil(nfts.length / PAGE_SIZE));
  const colPages = Math.max(1, Math.ceil(collections.length / PAGE_SIZE));
  const dropPages = Math.max(1, Math.ceil(drops.length / PAGE_SIZE));

  const pagedNfts = sortedNfts.slice(inventoryPage * PAGE_SIZE, (inventoryPage + 1) * PAGE_SIZE);
  const pagedCollections = sortedCollections.slice(collectionsPage * PAGE_SIZE, (collectionsPage + 1) * PAGE_SIZE);
  const pagedDrops = sortedDrops.slice(dropsPage * PAGE_SIZE, (dropsPage + 1) * PAGE_SIZE);

  const timestampRunRef = useRef(0);

  /**
   * Build a creation-order map using Helius DAS getAssetsByOwner with
   * sortBy:"created".  One indexed query replaces N getSignaturesForAddress
   * calls.  Returns a Map<address, syntheticTimestamp> where higher values
   * mean newer.  Falls back gracefully (all 0) when DAS is unavailable.
   */
  async function fetchCreationOrder(
    addresses: string[],
    ownerAddress: string,
  ): Promise<Map<string, number>> {
    const order = new Map<string, number>();
    if (addresses.length === 0) return order;

    const addressSet = new Set(addresses);
    const sorted = await getOwnerAssetsInCreationOrder(ownerAddress, 'desc');

    if (sorted.length > 0) {
      const total = sorted.length;
      for (let i = 0; i < sorted.length; i++) {
        if (addressSet.has(sorted[i])) {
          order.set(sorted[i], total - i);
        }
      }
    }

    for (const addr of addresses) {
      if (!order.has(addr)) order.set(addr, 0);
    }

    return order;
  }

  const loadDashboard = useCallback(async () => {
    if (!wallet.publicKey) return;

    const runId = ++timestampRunRef.current;

    setLoading(true);
    setLoadingTimestamps(false);
    setError(null);
    setInventoryPage(0);
    setCollectionsPage(0);
    setDropsPage(0);
    try {
      const allNfts = await metaplex.nfts().findAllByOwner({
        owner: wallet.publicKey,
      });

      // Drop NFTs whose metadata URI points at localhost — these were minted
      // during local dev and can never be fetched from the deployed site.
      const fetchableNfts = allNfts.filter((nft: any) => {
        const uri = nft.uri as string | undefined;
        return !uri || !isLocalhostUrl(uri);
      });

      // Load metadata in small batches (3 at a time)
      const BATCH_SIZE = 3;
      const resolvedNfts: any[] = [];
      for (let i = 0; i < fetchableNfts.length; i += BATCH_SIZE) {
        const batch = fetchableNfts.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (nft: any) => {
            try {
              return await metaplex.nfts().load({ metadata: nft });
            } catch {
              try {
                return await metaplex.nfts().load({
                  metadata: nft,
                  loadJsonMetadata: false,
                });
              } catch {
                return nft;
              }
            }
          }),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') resolvedNfts.push(r.value);
        }
      }

      // Separate collections, drops, and regular NFTs
      const collectionNfts: CollectionItem[] = [];
      const dropNfts: CollectionItem[] = [];
      const itemNfts: NFTItem[] = [];

      for (const nft of resolvedNfts) {
        const isCollection =
          nft.collectionDetails !== undefined && nft.collectionDetails !== null;

        if (isCollection) {
          let json = nft.json || {};

          if (!nft.json && nft.uri) {
            const fallbackJson = await tryFetchJsonWithIrysGateway(nft.uri);
            if (fallbackJson) json = fallbackJson;
          }

          const isDrop = isDropCollection(json);
          const item: CollectionItem = {
            address: (nft.mintAddress || nft.address).toString(),
            name: nft.name || 'Unnamed Collection',
            symbol: nft.symbol || '',
            description: json.description,
            image: resolveArweaveUrl(json.image),
            itemCount: nft.collectionDetails?.size
              ? Number(nft.collectionDetails.size)
              : 0,
            isDrop,
            mintConfig: isDrop ? json.mint_config : undefined,
            createdAt: 0,
          };

          if (isDrop) {
            dropNfts.push(item);
          } else {
            collectionNfts.push(item);
          }
        } else {
          let itemJson = nft.json || {};
          if (!nft.json && nft.uri) {
            const fallbackJson = await tryFetchJsonWithIrysGateway(nft.uri);
            if (fallbackJson) itemJson = fallbackJson;
          }
          itemNfts.push({
            address: (nft.mintAddress || nft.address).toString(),
            name: nft.name || (itemJson as any).name || 'Unnamed NFT',
            description: (itemJson as any).description,
            image: resolveArweaveUrl((itemJson as any).image),
            animationUrl: resolveArweaveUrl((itemJson as any).animation_url),
            attributes: (itemJson as any).attributes,
            collectionName: nft.collection?.address
              ? nft.collection.address.toString().slice(0, 8) + '...'
              : undefined,
            createdAt: 0,
          });
        }
      }

      // Show items immediately, then fetch timestamps in background
      setCollections(collectionNfts);
      setDrops(dropNfts);
      setNfts(itemNfts);
      setLoading(false);

      // ── Phase 2: fetch creation order via DAS (Helius) ──
      setLoadingTimestamps(true);
      if (timestampRunRef.current !== runId) return;

      const allAddresses = [
        ...itemNfts.map((n) => n.address),
        ...collectionNfts.map((c) => c.address),
        ...dropNfts.map((d) => d.address),
      ];

      const timestamps = await fetchCreationOrder(allAddresses, wallet.publicKey!.toBase58());
      if (timestampRunRef.current !== runId) return;

      const applyTs = <T extends { address: string; createdAt: number }>(items: T[]): T[] =>
        items.map((item) => ({ ...item, createdAt: timestamps.get(item.address) ?? 0 }));

      setNfts(applyTs(itemNfts));
      setCollections(applyTs(collectionNfts));
      setDrops(applyTs(dropNfts));
      setLoadingTimestamps(false);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setError((err as Error).message);
      setLoading(false);
      setLoadingTimestamps(false);
    }
  }, [wallet.publicKey, metaplex]);

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      loadDashboard();
    } else {
      timestampRunRef.current++;
      setCollections([]);
      setDrops([]);
      setNfts([]);
    }
  }, [wallet.connected, wallet.publicKey, loadDashboard]);

  // Not connected state
  if (!wallet.connected) {
    return (
      <ForgePageWrapper embers={16}>
        <div className="container-custom section-padding">
          <div className="max-w-2xl mx-auto text-center py-20">
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/20 dark:to-orange-800/20 mb-8 animate-fade-in">
              <svg className="w-12 h-12 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
              </svg>
            </div>
            
            {/* Text */}
            <p className="text-caption uppercase tracking-widest text-orange-400/70 font-mono mb-3 animate-slide-up">Dashboard</p>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4 animate-slide-up animation-delay-100">
              Connect your wallet
            </h1>
            <p className="text-body-lg text-gray-500 dark:text-gray-400 mb-10 animate-slide-up animation-delay-200">
              Connect your Solana wallet to view your inventory of owned avatars and manage your forged collections and drops.
            </p>
            
            {/* Wallet Button */}
            <div className="inline-block animate-slide-up animation-delay-300">
              <WalletButton />
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16 animate-slide-up animation-delay-400">
              <div className="p-6 bg-gray-50/50 dark:bg-gray-900/30 border border-gray-200/50 dark:border-gray-700/30">
                <div className="w-10 h-10 rounded-full bg-orange-400/10 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-small font-bold text-gray-900 dark:text-gray-100 mb-1">Inventory</h3>
                <p className="text-caption text-gray-500 dark:text-gray-400">Browse your owned avatars</p>
              </div>

              <div className="p-6 bg-gray-50/50 dark:bg-gray-900/30 border border-gray-200/50 dark:border-gray-700/30">
                <div className="w-10 h-10 rounded-full bg-orange-400/10 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-small font-bold text-gray-900 dark:text-gray-100 mb-1">Collections</h3>
                <p className="text-caption text-gray-500 dark:text-gray-400">Manage your NFT collections</p>
              </div>

              <div className="p-6 bg-gray-50/50 dark:bg-gray-900/30 border border-gray-200/50 dark:border-gray-700/30">
                <div className="w-10 h-10 rounded-full bg-orange-400/10 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-small font-bold text-gray-900 dark:text-gray-100 mb-1">Drops</h3>
                <p className="text-caption text-gray-500 dark:text-gray-400">Launch limited NFT drops</p>
              </div>
            </div>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  const pubkeyShort = wallet.publicKey
    ? `${wallet.publicKey.toString().slice(0, 4)}…${wallet.publicKey.toString().slice(-4)}`
    : '';

  return (
    <ForgePageWrapper embers={28} showHeat>
      {/* Hero Header with Glassmorphism */}
      <section className="container-custom pt-8 md:pt-12 pb-6">
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-900/5 via-orange-500/5 to-gray-900/5 dark:from-gray-100/5 dark:via-orange-400/10 dark:to-gray-100/5 backdrop-blur-sm border border-gray-200/30 dark:border-gray-700/30 p-6 md:p-8 mb-6 animate-slide-up">
          {/* Animated gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{backgroundSize: '200% 100%', animation: 'gradient-shift 3s ease infinite'}} />
          
          <div className="relative z-10">
            {/* Top row: Title + Actions */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-caption uppercase tracking-widest text-orange-400/70 font-mono block mb-1">Dashboard</span>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                      My Account
                    </h1>
                  </div>
                </div>
                
                {/* Wallet Address */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-small text-gray-500 dark:text-gray-400">Wallet:</span>
                  <code className="text-small font-mono bg-gray-900/5 dark:bg-gray-100/5 px-3 py-1.5 border border-gray-200/50 dark:border-gray-700/50 text-gray-900 dark:text-gray-100">
                    {pubkeyShort}
                  </code>
                  <a
                    href={`${EXPLORER_URL}/address/${wallet.publicKey?.toString()}?cluster=${SOLANA_NETWORK}`}
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

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                <Link href="/create" className="btn-hero-primary !py-2.5 !px-5 text-small flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create
                </Link>
                <Link
                  href={`/creator/${wallet.publicKey?.toString()}`}
                  className="btn-ghost !py-2.5 !px-4 text-small"
                >
                  Profile
                </Link>
                <Link href="/create" className="btn-ghost !py-2.5 !px-4 text-small">
                  Create
                </Link>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-slide-up animation-delay-100">
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
                    <p className="text-caption text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Drops</p>
                    <p className="text-2xl font-bold font-mono text-orange-400">{drops.length}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-orange-400/10 flex items-center justify-center group-hover:bg-orange-400/20 transition-colors">
                    <svg className="w-5 h-5 text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="stat-forge group cursor-default">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-caption text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Items</p>
                    <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{nfts.length}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gray-900/5 dark:bg-gray-100/5 flex items-center justify-center group-hover:bg-orange-400/10 transition-colors">
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
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
            {nfts.length > 0 && (
              <span className="ml-0.5 text-caption font-mono opacity-60">({nfts.length})</span>
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
            {(collections.length + drops.length) > 0 && (
              <span className="ml-0.5 text-caption font-mono opacity-60">({collections.length + drops.length})</span>
            )}
          </button>
        </div>
      </section>

      {/* Error Banner */}
      {error && (
        <section className="container-custom pt-0 pb-4">
          <div className="error-forge flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-small text-red-500 dark:text-red-400">
                Failed to load some data: {error}
              </p>
            </div>
            <button
              onClick={loadDashboard}
              className="btn-ghost !py-1.5 !px-3 text-small text-red-400 hover:text-orange-400"
            >
              Try again
            </button>
          </div>
        </section>
      )}

      {/* Content */}
      <section className="container-custom py-6 pb-16 md:pb-20">
        {loading ? (
          <div className="text-center py-20">
            <div className="spinner-forge mx-auto mb-4" style={{width: '2.5rem', height: '2.5rem'}} />
            <p className="text-body text-gray-500 dark:text-gray-400">
              {topTab === 'inventory' ? 'Loading your inventory...' : 'Loading your forged items...'}
            </p>
          </div>
        ) : topTab === 'inventory' ? (
          // ── Inventory Tab ────────────────────────────────────────────
          nfts.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 mb-6 animate-fade-in">
                <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 animate-slide-up">
                Your inventory is empty
              </h3>
              <p className="text-body text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto animate-slide-up animation-delay-100">
                Mint a VRM avatar from a drop to add it to your inventory.
              </p>
              <Link href="/create" className="btn-hero-primary !py-3 !px-6 animate-slide-up animation-delay-200 inline-flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create a drop or collection
              </Link>
            </div>
          ) : (
            <div>
              <SortBar
                value={inventorySort}
                onChange={(v) => setInventorySort(v as SortOption)}
                totalCount={nfts.length}
                label="items"
                page={inventoryPage}
                totalPages={nftPages}
                onPageChange={setInventoryPage}
                loadingTimestamps={loadingTimestamps}
              />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {pagedNfts.map((nft, idx) => (
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
            {/* Forged sub-tabs: Collections / Drops */}
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
                onClick={() => setForgedTab('drops')}
                className={`tab-forge !py-2.5 !px-4 text-small ${
                  forgedTab === 'drops' ? 'tab-forge-active' : 'tab-forge-inactive'
                }`}
              >
                Drops ({drops.length})
              </button>
            </div>

            {forgedTab === 'collections' ? (
              collections.length === 0 ? (
                <div className="text-center py-20">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 mb-6 animate-fade-in">
                    <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 animate-slide-up">
                    No collections yet
                  </h3>
                  <p className="text-body text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto animate-slide-up animation-delay-100">
                    Create your first VRM avatar collection to get started with 3D NFTs on Solana.
                  </p>
                  <Link href="/create" className="btn-hero-primary !py-3 !px-6 animate-slide-up animation-delay-200 inline-flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Create Collection
                  </Link>
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
                    totalPages={colPages}
                    onPageChange={setCollectionsPage}
                    loadingTimestamps={loadingTimestamps}
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
            ) : (
              drops.length === 0 ? (
                <div className="text-center py-20">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/20 dark:to-orange-800/20 mb-6 animate-fade-in">
                    <svg className="w-10 h-10 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 animate-slide-up">
                    No drops yet
                  </h3>
                  <p className="text-body text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto animate-slide-up animation-delay-100">
                    Launch a drop with Dutch Auctions or Open Editions to sell your NFTs.
                  </p>
                  <Link href="/create-drop" className="btn-hero-primary !py-3 !px-6 animate-slide-up animation-delay-200 inline-flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Create Drop
                  </Link>
                </div>
              ) : (
                <div>
                  <SortBar
                    value={forgedSort}
                    onChange={(v) => setForgedSort(v as SortOption)}
                    totalCount={drops.length}
                    label="drops"
                    showItems
                    page={dropsPage}
                    totalPages={dropPages}
                    onPageChange={setDropsPage}
                    loadingTimestamps={loadingTimestamps}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {pagedDrops.map((drop, idx) => (
                      <div key={drop.address} className="animate-fade-in" style={{animationDelay: `${idx * 50}ms`}}>
                        <CollectionCard
                          address={drop.address}
                          name={drop.name}
                          symbol={drop.symbol}
                          description={drop.description}
                          image={drop.image}
                          itemCount={drop.itemCount}
                          isDrop
                          mintConfig={drop.mintConfig}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Refresh */}
        {!loading && (
          <div className="text-center mt-10">
            <button
              onClick={loadDashboard}
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
