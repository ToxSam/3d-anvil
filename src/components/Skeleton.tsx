'use client';

/**
 * Loading skeletons that match the forge design system.
 */

export function CollectionCardSkeleton() {
  return (
    <div className="card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 overflow-hidden animate-pulse">
      <div className="relative z-10 aspect-video bg-gray-200/60 dark:bg-gray-800/60" />
      <div className="relative z-10 p-4 space-y-3">
        <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-16" />
        <div className="h-5 bg-gray-200/60 dark:bg-gray-700/40 rounded w-3/4" />
        <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-full" />
        <div className="flex items-center justify-between pt-2.5 border-t border-gray-200/20 dark:border-gray-700/10">
          <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-16" />
          <div className="h-4 w-4 bg-gray-200/60 dark:bg-gray-700/40 rounded" />
        </div>
      </div>
    </div>
  );
}

export function NFTCardSkeleton() {
  return (
    <div className="card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 overflow-hidden animate-pulse">
      <div className="relative z-10 aspect-square bg-gray-200/60 dark:bg-gray-800/60" />
      <div className="relative z-10 p-3 space-y-2">
        <div className="h-4 bg-gray-200/60 dark:bg-gray-700/40 rounded w-2/3" />
        <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-1/2" />
      </div>
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="stat-forge !p-4 animate-pulse">
      <div className="h-8 bg-gray-200/60 dark:bg-gray-700/40 rounded w-16 mb-2" />
      <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-20" />
    </div>
  );
}

export function ProfileHeaderSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-gray-200/60 dark:bg-gray-700/40 rounded w-48" />
      <div className="h-4 bg-gray-200/60 dark:bg-gray-700/40 rounded w-96 max-w-full" />
      <div className="grid grid-cols-3 gap-4 mt-6">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6, type = 'collection' }: { count?: number; type?: 'collection' | 'nft' }) {
  const Card = type === 'nft' ? NFTCardSkeleton : CollectionCardSkeleton;
  const cols = type === 'nft'
    ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  return (
    <div className={`grid ${cols} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} />
      ))}
    </div>
  );
}
