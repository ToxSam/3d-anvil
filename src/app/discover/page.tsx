'use client';

// Discover is disabled from nav/links for launch; route still works for development.
// Re-enable by adding { href: '/discover', label: 'Discover' } back to Navbar baseLinks and restoring links.

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMetaplex } from '@/lib/metaplex';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import { getAssetsByCreator } from '@/lib/das';
import { resolveArweaveUrl } from '@/lib/constants';
import Link from 'next/link';

interface DiscoverItem {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  itemCount: number;
  creator?: string;
  isDrop: boolean;
}

type Tab = 'drops' | 'collections' | 'all';

function isPublicKey(s: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
}

// ── Skeleton Cards ────────────────────────────────────────────────────────────

function DropCardSkeleton() {
  return (
    <div className="card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 overflow-hidden animate-pulse">
      <div className="relative z-10 aspect-square bg-gray-200/60 dark:bg-gray-800/60" />
      <div className="relative z-10 p-5 space-y-3">
        <div className="h-5 bg-gray-200/60 dark:bg-gray-700/40 rounded w-2/3" />
        <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-1/4" />
        <div className="flex items-center justify-between pt-3 border-t border-gray-200/20 dark:border-gray-700/10">
          <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-20" />
          <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-16" />
        </div>
      </div>
    </div>
  );
}

function CollectionCardSkeleton() {
  return (
    <div className="card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 overflow-hidden animate-pulse">
      <div className="relative z-10 aspect-square bg-gray-200/60 dark:bg-gray-800/60" />
      <div className="relative z-10 p-4 space-y-2.5">
        <div className="h-4 bg-gray-200/60 dark:bg-gray-700/40 rounded w-3/4" />
        <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-1/4" />
        <div className="flex items-center justify-between pt-3 border-t border-gray-200/20 dark:border-gray-700/10">
          <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-16" />
          <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-20" />
        </div>
      </div>
    </div>
  );
}

// ── Drop Card (large, 2-col) ──────────────────────────────────────────────────

function DropCard({ item }: { item: DiscoverItem }) {
  return (
    <Link href={`/drop/${item.address}`} className="block group">
      <article className="card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 overflow-hidden">
        <div className="card-forge-heat-shimmer" aria-hidden />
        <span className="card-spark card-spark-tl" aria-hidden />
        <span className="card-spark card-spark-tr" aria-hidden />
        <span className="card-spark card-spark-bl" aria-hidden />
        <span className="card-spark card-spark-br" aria-hidden />

        {/* Image */}
        <div className="relative z-10 aspect-square bg-gray-200/40 dark:bg-gray-800/40 overflow-hidden">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-400/5 via-transparent to-transparent">
              <svg
                className="w-16 h-16 text-orange-400/15"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={0.75}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          )}

          {/* Darkening overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* DROP badge with pulsing live dot */}
          <div className="absolute top-3 left-3 z-10">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-black/70 backdrop-blur-sm border border-orange-400/30 text-[10px] uppercase tracking-widest font-bold text-orange-400">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-400" />
              </span>
              Drop
            </div>
          </div>

          {/* View Drop CTA slides up from bottom */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
            <span className="flex w-full items-center justify-center gap-2 py-3 bg-orange-400 text-black text-xs font-bold uppercase tracking-wider">
              View Drop
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="relative z-10 p-5">
          <h3 className="text-body-lg font-bold text-gray-900 dark:text-gray-100 leading-tight mb-1.5 group-hover:text-orange-400 transition-colors duration-200 truncate">
            {item.name}
          </h3>
          {item.symbol && (
            <p className="text-caption uppercase tracking-widest text-orange-400/60 font-mono mb-4">
              {item.symbol}
            </p>
          )}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200/30 dark:border-gray-700/20">
            <span className="text-caption text-gray-400">
              {item.itemCount > 0 ? `${item.itemCount} minted` : 'Open edition'}
            </span>
            {item.creator && (
              <span className="text-caption text-gray-400/50 font-mono">
                {item.creator.slice(0, 4)}…{item.creator.slice(-4)}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}

// ── Collection Card (compact, 3-4 col) ───────────────────────────────────────

function CollectionCard({ item }: { item: DiscoverItem }) {
  const href = item.isDrop ? `/drop/${item.address}` : `/collection/${item.address}`;
  return (
    <Link href={href} className="block group">
      <article className="card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 overflow-hidden">
        <div className="card-forge-heat-shimmer" aria-hidden />
        <span className="card-spark card-spark-tl" aria-hidden />
        <span className="card-spark card-spark-br" aria-hidden />

        {/* Image */}
        <div className="relative z-10 aspect-square bg-gray-200/40 dark:bg-gray-800/40 overflow-hidden">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-400/5 via-transparent to-transparent">
              <svg
                className="w-10 h-10 text-orange-400/15"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={0.75}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          {/* View CTA */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-2.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
            <span className="flex w-full items-center justify-center gap-1.5 py-2 bg-orange-400 text-black text-xs font-bold uppercase tracking-wider">
              {item.isDrop ? 'View Drop' : 'View Collection'}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="relative z-10 p-4">
          <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 leading-tight mb-1 group-hover:text-orange-400 transition-colors duration-200 truncate">
            {item.name}
          </h3>
          {item.symbol && (
            <p className="text-caption uppercase tracking-widest text-orange-400/60 font-mono mb-3">
              {item.symbol}
            </p>
          )}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200/30 dark:border-gray-700/20">
            <span className="text-caption text-gray-400">
              {item.itemCount} item{item.itemCount !== 1 ? 's' : ''}
            </span>
            {item.creator && (
              <span className="text-caption text-gray-400/50 font-mono">
                {item.creator.slice(0, 4)}…{item.creator.slice(-4)}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const wallet = useWallet();
  const metaplex = useMetaplex();

  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('drops');

  const loadWalletCollections = useCallback(async () => {
    if (!wallet.publicKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const allNfts = await metaplex.nfts().findAllByOwner({ owner: wallet.publicKey });
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

      const newItems: DiscoverItem[] = resolved
        .filter((nft: any) => nft.collectionDetails != null)
        .map((nft: any) => ({
          address: (nft.mintAddress || nft.address).toString(),
          name: nft.name || 'Unnamed Collection',
          symbol: nft.symbol || '',
          description: nft.json?.description,
          image: resolveArweaveUrl(nft.json?.image),
          itemCount: nft.collectionDetails?.size ? Number(nft.collectionDetails.size) : 0,
          creator: (nft.updateAuthorityAddress || nft.updateAuthority?.address)?.toString(),
          isDrop: false,
        }));

      setItems(newItems);
    } catch (err) {
      console.error('Failed to load wallet collections:', err);
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey, metaplex]);

  useEffect(() => {
    loadWalletCollections();
  }, [loadWalletCollections]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q || !isPublicKey(q)) return;

    setSearchLoading(true);
    try {
      // Try DAS first
      const dasResult = await getAssetsByCreator(q);
      if (dasResult && dasResult.items.length > 0) {
        const newItems: DiscoverItem[] = dasResult.items
          .filter((item) => item.content?.metadata?.name)
          .map((item) => ({
            address: item.id,
            name: item.content?.metadata?.name || 'Unnamed',
            symbol: item.content?.metadata?.symbol || '',
            description: item.content?.metadata?.description,
            image: item.content?.links?.image,
            itemCount: 0,
            creator: q,
            isDrop: true, // creator search results show as drops
          }));
        setItems((prev) => {
          const existing = new Set(prev.map((c) => c.address));
          return [...newItems.filter((c) => !existing.has(c.address)), ...prev];
        });
        setActiveTab('drops'); // switch to drops tab to show results
        return;
      }

      // Metaplex fallback
      const { PublicKey } = await import('@solana/web3.js');
      const allNfts = await metaplex.nfts().findAllByCreator({
        creator: new PublicKey(q),
        position: 0,
      });
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

      const newItems: DiscoverItem[] = resolved
        .filter((nft: any) => nft.collectionDetails != null)
        .map((nft: any) => ({
          address: (nft.mintAddress || nft.address).toString(),
          name: nft.name || 'Unnamed Collection',
          symbol: nft.symbol || '',
          description: nft.json?.description,
          image: resolveArweaveUrl(nft.json?.image),
          itemCount: nft.collectionDetails?.size ? Number(nft.collectionDetails.size) : 0,
          creator: q,
          isDrop: true,
        }));

      setItems((prev) => {
        const existing = new Set(prev.map((c) => c.address));
        return [...newItems.filter((c) => !existing.has(c.address)), ...prev];
      });
      setActiveTab('drops');
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }

  // Name/symbol filter when query is not a wallet address
  const nameFiltered =
    !isPublicKey(searchQuery) && searchQuery
      ? items.filter(
          (c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.symbol.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : items;

  const drops = nameFiltered.filter((c) => c.isDrop);
  const collections = nameFiltered.filter((c) => !c.isDrop);

  const displayed =
    activeTab === 'drops' ? drops :
    activeTab === 'collections' ? collections :
    nameFiltered;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'drops', label: 'Drops', count: drops.length },
    { id: 'collections', label: 'Collections', count: collections.length },
    { id: 'all', label: 'All', count: nameFiltered.length },
  ];

  const showSearchBtn = isPublicKey(searchQuery);

  return (
    <ForgePageWrapper embers={16}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="section-forge border-b border-gray-300 dark:border-gray-700">
        <div className="container-custom py-14 md:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-end">
            {/* Left: Copy */}
            <div className="animate-slide-up">
              <p className="text-label mb-3">Live &amp; Upcoming</p>
              <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4 leading-tight">
                What&apos;s Hot<br className="hidden sm:block" /> to Collect
              </h1>
              <p className="text-body text-gray-500 dark:text-gray-400 max-w-sm">
                Find active drops from 3D creators on Solana. Be the first to
                mint something new.
              </p>
            </div>

            {/* Right: Search */}
            <div className="animate-slide-up animation-delay-100">
              <p className="text-caption text-gray-400/60 mb-2 uppercase tracking-widest">
                Search by creator
              </p>
              <form onSubmit={handleSearch}>
                <div className="relative flex items-center group/search">
                  <svg
                    className="absolute left-4 w-5 h-5 text-gray-400 pointer-events-none z-10 transition-colors group-focus-within/search:text-orange-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Paste a creator wallet address…"
                    className="input-forge w-full"
                    style={{ paddingLeft: '2.75rem', paddingRight: showSearchBtn ? '7.5rem' : '1rem' }}
                  />
                  {showSearchBtn && (
                    <button
                      type="submit"
                      disabled={searchLoading}
                      className="absolute right-1.5 btn-hero-primary !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {searchLoading ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="spinner-forge !w-3.5 !h-3.5" />
                          Loading
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                          Search
                        </span>
                      )}
                    </button>
                  )}
                </div>
                <p className="text-caption text-gray-400/50 mt-2">
                  {showSearchBtn
                    ? "Wallet detected — click Search to load their drops."
                    : 'Enter any creator address to explore their drops.'}
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <section className="container-custom py-8 pb-20 md:pb-28">
        {/* Tabs */}
        <div className="flex items-end justify-between mb-8 border-b border-gray-300 dark:border-gray-700">
          <div className="flex gap-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-forge capitalize ${activeTab === tab.id ? 'tab-forge-active' : 'tab-forge-inactive'}`}
              >
                {tab.label}
                {!loading && tab.count > 0 && (
                  <span
                    className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      activeTab === tab.id
                        ? 'bg-orange-400/20 text-orange-400'
                        : 'bg-gray-300/30 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Loading ── */}
        {loading ? (
          activeTab === 'drops' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, i) => <DropCardSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <CollectionCardSkeleton key={i} />)}
            </div>
          )

        /* ── Empty State ── */
        ) : displayed.length === 0 ? (
          <div className="text-center py-24 animate-fade-in">
            {/* Icon */}
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 bg-orange-400/10 rounded-2xl" />
              <div className="absolute inset-0 flex items-center justify-center">
                {activeTab !== 'collections' ? (
                  <svg className="w-12 h-12 text-orange-400/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ) : (
                  <svg className="w-12 h-12 text-orange-400/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                )}
              </div>
            </div>

            <h2 className="text-body-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
              {activeTab === 'drops'
                ? 'No drops here yet'
                : activeTab === 'collections'
                  ? 'No collections here yet'
                  : 'Nothing here yet'}
            </h2>
            <p className="text-body text-gray-400/70 mb-8 max-w-sm mx-auto">
              {activeTab === 'drops'
                ? 'Paste a creator wallet address above to discover their active drops.'
                : activeTab === 'collections'
                  ? wallet.connected
                    ? 'Your collections will show here once loaded.'
                    : 'Connect your wallet to see your collections.'
                  : 'Search by creator address to explore their work.'}
            </p>

            <div className="flex flex-wrap gap-3 justify-center">
              {activeTab === 'drops' ? (
                <>
                  <Link href="/create-drop" className="btn-hero-primary !py-2.5 !px-6">
                    Launch a Drop
                  </Link>
                  <Link href="/create" className="btn-ghost !py-2.5 !px-6">
                    Start Creating
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/create-collection" className="btn-hero-primary !py-2.5 !px-6">
                    Create Collection
                  </Link>
                  <Link href="/create-drop" className="btn-ghost !py-2.5 !px-6">
                    Launch Drop
                  </Link>
                </>
              )}
            </div>
          </div>

        /* ── Drops Grid (2-col, large cards) ── */
        ) : activeTab === 'drops' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {displayed.map((item) => (
                <DropCard key={item.address} item={item} />
              ))}
            </div>
            <p className="text-center text-caption text-gray-400/40 mt-10">
              {displayed.length} drop{displayed.length !== 1 ? 's' : ''}
            </p>
          </>

        /* ── Collections / All Grid (3-4 col, compact) ── */
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {displayed.map((item) => (
                <CollectionCard key={item.address} item={item} />
              ))}
            </div>
            <p className="text-center text-caption text-gray-400/40 mt-10">
              {displayed.length} result{displayed.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </section>
    </ForgePageWrapper>
  );
}
