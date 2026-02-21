'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { MintNFT } from '@/components/MintNFT';
import { WalletButton } from '@/components/WalletButton';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import Link from 'next/link';
import { useUserCollections } from '@/hooks/useUserCollections';

function DropsPageContent() {
  const wallet = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectionAddress = searchParams.get('collection');

  const { collections, loading, error, reload, connected } = useUserCollections();
  const [forging, setForging] = useState(false);
  const selected = collectionAddress
    ? collections.find((c) => c.address === collectionAddress)
    : null;

  // No collection in URL → redirect to /create to choose one
  useEffect(() => {
    if (connected && !loading && !collectionAddress) {
      router.replace('/create');
    }
  }, [connected, loading, collectionAddress, router]);

  // Not connected
  if (!wallet.connected) {
    return (
      <ForgePageWrapper embers={16}>
        <div className="container-custom section-padding">
          <div className="max-w-lg mx-auto text-center py-20">
            <p className="text-label mb-4 animate-fade-in">Create Drop</p>
            <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4 animate-slide-up">
              Connect your wallet
            </h1>
            <p className="text-body-lg text-gray-500 dark:text-gray-400 mb-8 animate-slide-up animation-delay-100">
              Connect your Solana wallet to create a drop.
            </p>
            <div className="inline-block animate-slide-up animation-delay-200">
              <WalletButton />
            </div>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  // No collection param — redirect is pending or we show a brief loading/redirect state
  if (!collectionAddress) {
    return (
      <ForgePageWrapper embers={12}>
        <div className="container-custom section-padding text-center py-20">
          <div className="spinner-forge mx-auto" />
          <p className="text-body text-gray-500 dark:text-gray-400 mt-4 animate-fade-in">
            Taking you to choose a collection...
          </p>
        </div>
      </ForgePageWrapper>
    );
  }

  // Loading collections (we need to resolve the selected collection)
  if (loading) {
    return (
      <ForgePageWrapper embers={12}>
        <div className="container-custom section-padding text-center py-20">
          <div className="spinner-forge mx-auto" />
          <p className="text-body text-gray-500 dark:text-gray-400 mt-4 animate-fade-in">
            Loading collection...
          </p>
        </div>
      </ForgePageWrapper>
    );
  }

  // Error loading collections
  if (error) {
    return (
      <ForgePageWrapper embers={12}>
        <div className="container-custom section-padding">
          <div className="max-w-lg mx-auto text-center py-20">
            <p className="text-label mb-4 animate-fade-in">Create Drop</p>
            <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4 animate-slide-up">
              Something went wrong
            </h1>
            <p className="text-body text-gray-500 dark:text-gray-400 mb-4 animate-slide-up animation-delay-100">
              {error}
            </p>
            <div className="flex gap-3 justify-center animate-slide-up animation-delay-200">
              <button onClick={reload} className="btn-hero-primary">
                Try Again
              </button>
              <Link href="/create" className="btn-ghost">
                Choose collection
              </Link>
            </div>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  // Collection param present but not in user's collections (invalid or not owner)
  if (!selected) {
    return (
      <ForgePageWrapper embers={16}>
        <div className="container-custom section-padding">
          <div className="max-w-lg mx-auto text-center py-20">
            <p className="text-label mb-4 animate-fade-in">Create Drop</p>
            <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4 animate-slide-up">
              Collection not found
            </h1>
            <p className="text-body-lg text-gray-500 dark:text-gray-400 mb-8 animate-slide-up animation-delay-100">
              This collection doesn&apos;t exist or you don&apos;t own it. Choose another
              collection to create a drop.
            </p>
            <Link href="/create" className="btn-hero-primary animate-slide-up animation-delay-200">
              Choose collection
            </Link>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  // Collection selected — show full-viewport drop creation page
  return (
    <div className="h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] overflow-hidden flex flex-col">
      <ForgePageWrapper embers={16} forging={forging} noScroll>
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header bar with collection info and back */}
        <div className="flex-shrink-0 border-b border-gray-300/30 dark:border-gray-700/30 bg-[var(--background)]/90 backdrop-blur-sm relative z-10">
          <div className="container-custom py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/create" className="back-link-forge">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Change collection
              </Link>
              <div className="w-px h-5 bg-gray-300/30 dark:bg-gray-700/30" />
              <div className="flex items-center gap-3">
                {selected.image && (
                  <div className="w-8 h-8 bg-gray-100/50 dark:bg-gray-800/50 overflow-hidden flex-shrink-0 rounded">
                    <img
                      src={selected.image}
                      alt={selected.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <span className="text-small font-medium text-gray-900 dark:text-gray-100">
                  {selected.name}
                </span>
              </div>
            </div>

            <Link
              href={`/collection/${collectionAddress}`}
              className="text-small text-gray-400 hover:text-orange-400 transition-colors"
            >
              View collection
            </Link>
          </div>
        </div>

        <div className="flex-1 flex min-h-0 relative z-10">
          <MintNFT
            collectionAddress={collectionAddress}
            collectionName={selected.name}
            collectionSymbol={selected.symbol}
            onMintingChange={setForging}
            fullViewport
          />
        </div>
      </div>
    </ForgePageWrapper>
    </div>
  );
}

export default function DropsPage() {
  return (
    <Suspense fallback={
      <ForgePageWrapper embers={12}>
        <div className="container-custom section-padding text-center py-20">
          <div className="spinner-forge mx-auto" />
        </div>
      </ForgePageWrapper>
    }>
      <DropsPageContent />
    </Suspense>
  );
}
