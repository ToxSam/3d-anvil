'use client';

import { useEffect, useState } from 'react';
import { getCollectionStats, CollectionStats } from '@/lib/das';
import { StatSkeleton } from '@/components/Skeleton';

interface Props {
  collectionAddress: string;
}

export function CollectionAnalytics({ collectionAddress }: Props) {
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [collectionAddress]);

  async function loadAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const data = await getCollectionStats(collectionAddress);
      setStats(data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('Could not load analytics. Your RPC may not support the DAS API.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-title font-bold text-gray-900 dark:text-gray-100">Analytics</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-title font-bold text-gray-900 dark:text-gray-100">Analytics</h2>
        <div className="p-4 bg-amber-400/5 border border-amber-400/20 rounded-lg">
          <p className="text-small text-amber-800 dark:text-amber-200">{error}</p>
          <button
            onClick={loadAnalytics}
            className="text-small text-amber-600 dark:text-amber-400 hover:text-orange-400 mt-2 underline transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const holderPercent =
    stats.totalMinted > 0
      ? ((stats.uniqueHolders / stats.totalMinted) * 100).toFixed(1)
      : '0';

  return (
    <div className="space-y-6">
      <h2 className="text-title font-bold text-gray-900 dark:text-gray-100">Analytics</h2>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="stat-forge !p-4">
          <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
            {stats.totalMinted}
          </p>
          <p className="text-caption text-gray-500 dark:text-gray-400 mt-1">Total Minted</p>
        </div>

        <div className="stat-forge !p-4">
          <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
            {stats.uniqueHolders}
          </p>
          <p className="text-caption text-gray-500 dark:text-gray-400 mt-1">Unique Holders</p>
        </div>

        <div className="stat-forge !p-4">
          <p className="text-2xl font-bold font-mono text-orange-400/80">
            {holderPercent}%
          </p>
          <p className="text-caption text-gray-500 dark:text-gray-400 mt-1">Holder Ratio</p>
        </div>
      </div>

      {/* Top Holders */}
      {stats.topHolders.length > 0 && (
        <div className="bg-gray-50/50 dark:bg-gray-800/30 rounded-lg border border-gray-200/30 dark:border-gray-700/20 p-5">
          <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-4">
            Top Holders
          </h3>
          <div className="space-y-2.5">
            {stats.topHolders.map((holder, i) => (
              <div
                key={holder.address}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-caption text-gray-400 w-5 flex-shrink-0 text-right">
                    {i + 1}.
                  </span>
                  <span className="text-caption font-mono text-gray-600 dark:text-gray-300 truncate">
                    {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                  </span>
                </div>
                <span className="text-caption font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">
                  {holder.count} NFT{holder.count !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refresh */}
      <div className="text-center">
        <button
          onClick={loadAnalytics}
          className="text-small text-gray-400/60 hover:text-orange-400 transition-colors"
        >
          Refresh analytics
        </button>
      </div>
    </div>
  );
}
