'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletButton } from '@/components/WalletButton';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import { useUserCollections, CollectionOption } from '@/hooks/useUserCollections';
import { getMintStatus, getMintStatusLabel, getMintStatusColor, MintStatus, MintConfig } from '@/lib/types/mintConfig';
import { getCollectionAssets } from '@/lib/das';
import { useMetaplex } from '@/lib/metaplex';

type Tab = 'collections' | 'drops';

interface ExpandedCardData {
  totalMinted?: number;
  loading?: boolean;
}

function shortenAddress(addr: string, chars = 4): string {
  if (!addr) return '';
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

export default function CreateHubPage() {
  const wallet = useWallet();
  const metaplex = useMetaplex();
  const { collections, drops, loading, error, reload } = useUserCollections();
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('drops');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [cardData, setCardData] = useState<Record<string, ExpandedCardData>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load stats when a card is expanded (so expanded view has fresh count)
  useEffect(() => {
    if (expandedCard && !cardData[expandedCard]) {
      loadCardStats(expandedCard);
    }
  }, [expandedCard]);

  // Preload minted count for visible collections (all in parallel)
  const collectionAddresses = collections.map((c) => c.address).sort().join(',');
  useEffect(() => {
    if (activeTab !== 'collections' || collections.length === 0) return;
    let cancelled = false;
    const toLoad = collections.filter(col => cardData[col.address] === undefined);
    if (toLoad.length === 0) return;
    Promise.allSettled(toLoad.map(col => {
      if (cancelled) return Promise.resolve();
      return loadCardStats(col.address);
    }));
    return () => { cancelled = true; };
  }, [activeTab, collectionAddresses]);

  async function loadCardStats(address: string) {
    setCardData(prev => ({ ...prev, [address]: { ...prev[address], loading: true } }));
    try {
      const result = await getCollectionAssets(address, 1, 1);
      const total = result?.total ?? result?.items?.length ?? 0;
      setCardData(prev => ({
        ...prev,
        [address]: { totalMinted: total, loading: false },
      }));
    } catch (err) {
      console.error('Failed to load stats:', err);
      setCardData(prev => ({
        ...prev,
        [address]: { totalMinted: 0, loading: false },
      }));
    }
  }

  function toggleCard(address: string) {
    setExpandedCard(prev => prev === address ? null : address);
  }

  async function togglePublicMinting(col: CollectionOption) {
    // TODO: Implement updating collection metadata to toggle public minting
    alert('Feature coming soon: Toggle public minting on/off');
  }

  if (!wallet.connected) {
    return (
      <ForgePageWrapper embers={16}>
        <div className="container-custom py-16 md:py-24">
          <div className="max-w-lg mx-auto text-center py-12">
            <p className="text-label mb-4 animate-fade-in">Creator&apos;s Hub</p>
            <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4 animate-slide-up">
              Connect your wallet
            </h1>
            <p className="text-body-lg text-gray-500 dark:text-gray-400 mb-8 animate-slide-up animation-delay-100">
              Connect your Solana wallet to start creating collections and minting
              NFTs.
            </p>
            <div className="inline-block animate-slide-up animation-delay-200">
              <WalletButton />
            </div>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  // Loading collections
  if (loading) {
    return (
      <ForgePageWrapper embers={12}>
        <div className="container-custom py-16 md:py-24 text-center py-20">
          <div className="spinner-forge mx-auto" />
          <p className="text-body text-gray-500 dark:text-gray-400 mt-4 animate-fade-in">
            Loading your drops and collections...
          </p>
        </div>
      </ForgePageWrapper>
    );
  }

  // Error state
  if (error) {
    return (
      <ForgePageWrapper embers={12} compact>
        <div className="container-custom py-16 md:py-24">
          <div className="max-w-lg mx-auto text-center py-20">
            <p className="text-label mb-4 animate-fade-in">Creator&apos;s Hub</p>
            <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4 animate-slide-up">
              Something went wrong
            </h1>
            <p className="text-body text-gray-500 dark:text-gray-400 mb-4 animate-slide-up animation-delay-100">
              {error}
            </p>
            <button
              onClick={reload}
              className="btn-hero-primary animate-slide-up animation-delay-200"
            >
              Try Again
            </button>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  return (
    <ForgePageWrapper embers={20} compact>
      <div className="container-custom py-16 md:py-24">
        <div className="max-w-3xl mx-auto">
          <p className="text-label mb-4 animate-fade-in">Creator&apos;s Hub</p>
          <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4 animate-slide-up">
            Manage Your Creations
          </h1>
          <p className="text-body-lg text-gray-500 dark:text-gray-400 mb-8 animate-slide-up animation-delay-100">
            Create new collections, launch drops, or mint into existing collections.
          </p>

          {/* Create new collection/drop box */}
          <div className="mb-8 animate-slide-up animation-delay-200">
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="w-full flex items-center gap-4 card-forge-interactive p-5 text-left group border-2 border-dashed border-gray-300/50 dark:border-gray-600/50 hover:border-orange-400/50 transition-colors"
              >
                <div className="w-14 h-14 flex-shrink-0 bg-gradient-to-br from-orange-400/10 to-pink-500/10 rounded-lg flex items-center justify-center text-orange-400 group-hover:text-orange-500 transition-colors">
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0 relative z-10">
                  <p className="text-body-lg font-semibold text-gray-900 dark:text-gray-100">
                    Create New
                  </p>
                  <p className="text-small text-gray-500 dark:text-gray-400">
                    Launch a Drop or create a Collection
                  </p>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400/50 group-hover:text-orange-400 transition-all duration-300 flex-shrink-0 relative z-10 ${showDropdown ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Dropdown options */}
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-900 border border-gray-200/50 dark:border-gray-700/50 rounded-lg shadow-xl overflow-hidden z-20 animate-slide-up">
                  {/* DROP Option */}
                  <Link
                    href="/create-drop"
                    onClick={() => setShowDropdown(false)}
                    className="block p-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 border-b border-gray-200/30 dark:border-gray-700/30 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-orange-400/20 to-pink-500/20 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-bold text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-orange-400 transition-colors">
                          DROP
                        </p>
                        <p className="text-small text-gray-500 dark:text-gray-400">
                          Launch NFTs with Open Editions or Dutch Auctions — perfect for timed releases
                        </p>
                      </div>
                    </div>
                  </Link>

                  {/* Collection Option */}
                  <Link
                    href="/create-collection"
                    onClick={() => setShowDropdown(false)}
                    className="block p-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-blue-400/20 to-purple-500/20 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-bold text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-orange-400 transition-colors">
                          Collection
                        </p>
                        <p className="text-small text-gray-500 dark:text-gray-400">
                          Standard collection where you can mint individual NFTs over time
                        </p>
                      </div>
                    </div>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-300/30 dark:border-gray-700/30 mb-6 animate-slide-up animation-delay-300">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('drops')}
                className={`px-6 py-3 text-body font-medium transition-colors relative ${
                  activeTab === 'drops'
                    ? 'text-orange-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                Drops
                {activeTab === 'drops' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-400" />
                )}
                {drops.length > 0 && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300">
                    {drops.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('collections')}
                className={`px-6 py-3 text-body font-medium transition-colors relative ${
                  activeTab === 'collections'
                    ? 'text-orange-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                Collections
                {activeTab === 'collections' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-400" />
                )}
                {collections.length > 0 && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300">
                    {collections.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="animate-fade-in">
            {/* Collections Tab */}
            {activeTab === 'collections' && (
              <div className="space-y-3">
                {collections.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <p className="text-body text-gray-500 dark:text-gray-400 mb-2">
                      No collections yet
                    </p>
                    <p className="text-small text-gray-400">
                      Create your first collection above to get started
                    </p>
                  </div>
                ) : (
                  collections.map((col) => {
                    const isExpanded = expandedCard === col.address;
                    const stats = cardData[col.address];
                    // Use itemCount from hook or stats if expanded
                    const totalMinted = stats?.totalMinted ?? col.itemCount ?? 0;
                    const mintConfig = col.mintConfig as MintConfig | undefined;
                    const isPublic = mintConfig?.isPublic ?? false;
                    
                    return (
                      <div key={col.address} className="card-forge-interactive overflow-hidden">
                        {/* Row: expand area + Mint button on the right */}
                        <div className="flex items-stretch">
                          <button
                            onClick={() => toggleCard(col.address)}
                            className="flex-1 flex items-center gap-4 p-4 text-left group min-w-0"
                          >
                            <div className="w-14 h-14 flex-shrink-0 bg-gray-100/50 dark:bg-gray-800/50 overflow-hidden rounded-lg">
                              {col.image ? (
                                <img
                                  src={col.image}
                                  alt={col.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                  <svg
                                    className="w-6 h-6"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1}
                                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                    />
                                  </svg>
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-body font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {col.name}
                                </p>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide flex-shrink-0 border ${
                                    isPublic
                                      ? 'bg-blue-400/10 border-blue-400/30 text-blue-500'
                                      : 'bg-gray-400/10 border-gray-400/30 text-gray-500'
                                  }`}
                                >
                                  {isPublic ? 'Public' : 'Private'}
                                </span>
                              </div>
                              <p className="text-small text-gray-400 font-mono truncate">
                                {col.symbol && (
                                  <span className="mr-2 text-orange-400/70">{col.symbol}</span>
                                )}
                                {shortenAddress(col.address, 8)}
                                <span className="ml-2 text-gray-500 dark:text-gray-400">
                                  · {totalMinted} minted
                                </span>
                              </p>
                            </div>

                            <svg
                              className={`w-5 h-5 text-gray-400/50 group-hover:text-orange-400 transition-all duration-300 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </button>
                          <Link
                            href={`/create/mint?collection=${encodeURIComponent(col.address)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center min-w-[7rem] px-6 py-3 border-l border-gray-200/30 dark:border-gray-700/30 bg-orange-400/15 hover:bg-orange-400/25 text-orange-500 dark:text-orange-400 font-semibold text-body transition-colors shrink-0"
                          >
                            Mint
                          </Link>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="border-t border-gray-200/30 dark:border-gray-700/30 p-4 bg-gray-50/30 dark:bg-gray-800/30 animate-slide-down">
                            {stats?.loading ? (
                              <div className="flex items-center justify-center py-4">
                                <div className="spinner-forge" />
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                                    <p className="text-caption text-gray-500 dark:text-gray-400 mb-1">Total Minted</p>
                                    <p className="text-body-lg font-bold text-gray-900 dark:text-gray-100">
                                      {totalMinted}
                                    </p>
                                  </div>
                                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                                    <p className="text-caption text-gray-500 dark:text-gray-400 mb-1">Type</p>
                                    <p className="text-body-lg font-bold text-gray-900 dark:text-gray-100">
                                      Collection
                                    </p>
                                  </div>
                                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                                    <p className="text-caption text-gray-500 dark:text-gray-400 mb-1">Status</p>
                                    <p className="text-body-lg font-bold text-gray-900 dark:text-gray-100">
                                      {isPublic ? 'Public' : 'Private'}
                                    </p>
                                  </div>
                                </div>

                                {/* Detailed Info */}
                                {mintConfig && (
                                  <div className="space-y-2 mb-4 p-3 bg-white/30 dark:bg-gray-900/30 rounded-lg text-small">
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 dark:text-gray-400">Public Minting:</span>
                                      <span className="font-medium text-gray-900 dark:text-gray-100">
                                        {isPublic ? 'Enabled' : 'Disabled'}
                                      </span>
                                    </div>
                                    {isPublic && (
                                      <>
                                        <div className="flex justify-between">
                                          <span className="text-gray-500 dark:text-gray-400">Price:</span>
                                          <span className="font-medium text-gray-900 dark:text-gray-100">
                                            {mintConfig.price ? `${mintConfig.price} SOL` : 'Free'}
                                          </span>
                                        </div>
                                        {mintConfig.maxSupply && (
                                          <div className="flex justify-between">
                                            <span className="text-gray-500 dark:text-gray-400">Max Supply:</span>
                                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                              {mintConfig.maxSupply}
                                            </span>
                                          </div>
                                        )}
                                        {mintConfig.maxPerWallet && (
                                          <div className="flex justify-between">
                                            <span className="text-gray-500 dark:text-gray-400">Per Wallet:</span>
                                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                              {mintConfig.maxPerWallet}
                                            </span>
                                          </div>
                                        )}
                                      </>
                                    )}
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 dark:text-gray-400">Address:</span>
                                      <span className="font-mono text-gray-900 dark:text-gray-100">{shortenAddress(col.address, 6)}</span>
                                    </div>
                                  </div>
                                )}

                                {/* Action Buttons */}
                                <div className="space-y-2">
                                  {/* Secondary Actions */}
                                  <div className="flex gap-2">
                                    <Link
                                      href={`/collection/${col.address}`}
                                      className="flex-1 btn-forge-secondary text-center"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <svg className="w-4 h-4 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      </svg>
                                      Settings
                                    </Link>
                                    <Link
                                      href={`/collection/${col.address}`}
                                      className="flex-1 btn-forge-secondary text-center"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <svg className="w-4 h-4 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                      View
                                    </Link>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Drops Tab */}
            {activeTab === 'drops' && (
              <div className="space-y-3">
                {drops.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-orange-400/10 to-pink-500/10 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <p className="text-body text-gray-500 dark:text-gray-400 mb-2">
                      No drops yet
                    </p>
                    <p className="text-small text-gray-400">
                      Launch your first drop above to get started
                    </p>
                  </div>
                ) : (
                  drops.map((drop) => {
                    const mintConfig = drop.mintConfig as MintConfig | undefined;
                    const isExpanded = expandedCard === drop.address;
                    const stats = cardData[drop.address];
                    // Use itemCount from the hook for status calculation, or stats if expanded
                    const totalMinted = stats?.totalMinted ?? drop.itemCount ?? 0;
                    const status = getMintStatus(mintConfig || null, totalMinted);
                    const statusColor = getMintStatusColor(status);
                    const statusLabel = getMintStatusLabel(status);
                    const dropType = mintConfig?.isDutchAuction ? 'Dutch Auction' : 'Open Edition';
                    const canEndEarly = status === 'live' && mintConfig?.endDate;
                    
                    return (
                      <div key={drop.address} className="card-forge-interactive overflow-hidden">
                        {/* Main clickable card */}
                        <button
                          onClick={() => toggleCard(drop.address)}
                          className="w-full flex items-center gap-4 p-4 text-left group"
                        >
                          <div className="w-14 h-14 flex-shrink-0 bg-gray-100/50 dark:bg-gray-800/50 overflow-hidden rounded-lg relative">
                            {drop.image ? (
                              <img
                                src={drop.image}
                                alt={drop.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-body font-medium text-gray-900 dark:text-gray-100 truncate">
                                {drop.name}
                              </p>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide flex-shrink-0 border ${statusColor}`}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-small text-gray-400">
                              {drop.symbol && (
                                <span className="text-orange-400/70">{drop.symbol}</span>
                              )}
                              <span className="text-gray-300 dark:text-gray-600">•</span>
                              <span>{dropType}</span>
                            </div>
                          </div>

                          <svg
                            className={`w-5 h-5 text-gray-400/50 group-hover:text-orange-400 transition-all duration-300 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </button>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="border-t border-gray-200/30 dark:border-gray-700/30 p-4 bg-gray-50/30 dark:bg-gray-800/30 animate-slide-down">
                            {stats?.loading ? (
                              <div className="flex items-center justify-center py-4">
                                <div className="spinner-forge" />
                              </div>
                            ) : (
                              <>
                                {/* Stats Grid */}
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                                    <p className="text-caption text-gray-500 dark:text-gray-400 mb-1">Minted</p>
                                    <p className="text-body-lg font-bold text-gray-900 dark:text-gray-100">
                                      {totalMinted}
                                      {mintConfig?.maxSupply && (
                                        <span className="text-small text-gray-400 font-normal"> / {mintConfig.maxSupply}</span>
                                      )}
                                    </p>
                                  </div>
                                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                                    <p className="text-caption text-gray-500 dark:text-gray-400 mb-1">Price</p>
                                    <p className="text-body-lg font-bold text-gray-900 dark:text-gray-100">
                                      {mintConfig?.price ? `${mintConfig.price} SOL` : 'Free'}
                                    </p>
                                  </div>
                                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                                    <p className="text-caption text-gray-500 dark:text-gray-400 mb-1">Supply</p>
                                    <p className="text-body-lg font-bold text-gray-900 dark:text-gray-100">
                                      {mintConfig?.maxSupply ?? '∞'}
                                    </p>
                                  </div>
                                </div>

                                {/* Detailed Info */}
                                <div className="space-y-2 mb-4 p-3 bg-white/30 dark:bg-gray-900/30 rounded-lg text-small">
                                  <div className="flex justify-between">
                                    <span className="text-gray-500 dark:text-gray-400">Status:</span>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">{statusLabel}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500 dark:text-gray-400">Type:</span>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">{dropType}</span>
                                  </div>
                                  {mintConfig?.startDate && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 dark:text-gray-400">Start:</span>
                                      <span className="font-medium text-gray-900 dark:text-gray-100">
                                        {new Date(mintConfig.startDate).toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                  {mintConfig?.endDate && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 dark:text-gray-400">End:</span>
                                      <span className="font-medium text-gray-900 dark:text-gray-100">
                                        {new Date(mintConfig.endDate).toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                  {mintConfig?.maxPerWallet && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 dark:text-gray-400">Per Wallet:</span>
                                      <span className="font-medium text-gray-900 dark:text-gray-100">{mintConfig.maxPerWallet}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span className="text-gray-500 dark:text-gray-400">Address:</span>
                                    <span className="font-mono text-gray-900 dark:text-gray-100">{shortenAddress(drop.address, 6)}</span>
                                  </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="space-y-2">
                                  {/* View Drop Button */}
                                  <Link
                                    href={`/drop/${drop.address}`}
                                    className="w-full btn-hero-primary text-center block py-4 text-body-lg font-bold"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <svg className="w-5 h-5 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    View Drop Page
                                  </Link>

                                  {/* Secondary Actions */}
                                  <div className="flex gap-2">
                                    <Link
                                      href={`/collection/${drop.address}`}
                                      className="flex-1 btn-forge-secondary text-center"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <svg className="w-4 h-4 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      </svg>
                                      Settings
                                    </Link>
                                    {canEndEarly && (
                                      <Link
                                        href={`/collection/${drop.address}#end-drop`}
                                        className="btn-forge-secondary text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        onClick={(e) => e.stopPropagation()}
                                        title="End drop early"
                                      >
                                        <svg className="w-4 h-4 mr-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        End Drop
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ForgePageWrapper>
  );
}
