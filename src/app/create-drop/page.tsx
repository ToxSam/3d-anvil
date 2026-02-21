'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { CreateDropWithVRM } from '@/components/CreateDropWithVRM';
import { WalletButton } from '@/components/WalletButton';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import Link from 'next/link';

export default function CreateDropPage() {
  const wallet = useWallet();
  const [forging, setForging] = useState(false);

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

  // Show full-viewport drop creation page
  return (
    <div className="fixed inset-0 top-16 md:top-20 overflow-hidden flex flex-col">
      <ForgePageWrapper embers={16} forging={forging} noScroll>
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header bar with back link */}
        <div className="flex-shrink-0 border-b border-gray-300/30 dark:border-gray-700/30 bg-[var(--background)]/90 backdrop-blur-sm relative z-10">
          <div className="container-custom py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/create" className="back-link-forge">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Creator&apos;s Hub
              </Link>
            </div>

            <span className="text-small text-gray-500 dark:text-gray-400">
              New Drop
            </span>
          </div>
        </div>

        <div className="flex-1 flex min-h-0 relative z-10">
          <CreateDropWithVRM
            onCreatingChange={setForging}
            fullViewport
          />
        </div>
      </div>
    </ForgePageWrapper>
    </div>
  );
}
