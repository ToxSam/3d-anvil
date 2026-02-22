'use client';

import Link from 'next/link';
import { getMintStatus, getMintStatusLabel, getMintStatusColor, MintConfig } from '@/lib/types/mintConfig';

interface CollectionCardProps {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  itemCount?: number;
  /** When true, renders as a Drop card with badge and links to /drop/ */
  isDrop?: boolean;
  /** Drop-specific mint config for showing status */
  mintConfig?: MintConfig;
}

export function CollectionCard({
  address,
  name,
  symbol,
  description,
  image,
  itemCount = 0,
  isDrop = false,
  mintConfig,
}: CollectionCardProps) {
  const href = isDrop ? `/drop/${address}` : `/collection/${address}`;

  // Drop status badge
  const status = isDrop && mintConfig ? getMintStatus(mintConfig, itemCount) : null;
  const statusLabel = status ? getMintStatusLabel(status) : null;
  const statusColor = status ? getMintStatusColor(status) : null;

  return (
    <Link href={href} className="block group">
      <article className="card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 overflow-hidden">
        <div className="card-forge-heat-shimmer" aria-hidden />
        <span className="card-spark card-spark-tl" aria-hidden />
        <span className="card-spark card-spark-tr" aria-hidden />
        <span className="card-spark card-spark-bl" aria-hidden />
        <span className="card-spark card-spark-br" aria-hidden />
        {image && (
          <div className="relative z-10 aspect-video bg-gray-100/50 dark:bg-gray-800/50 overflow-hidden">
            <img
              src={image}
              alt={name}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Drop badge on image */}
            {isDrop && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 bg-black/60 backdrop-blur-sm text-[10px] uppercase tracking-widest font-bold text-orange-400">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                DROP
              </div>
            )}
            {/* Mint status badge */}
            {isDrop && statusLabel && statusColor && (
              <div className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold border rounded-full ${statusColor}`}>
                {statusLabel}
              </div>
            )}
          </div>
        )}
        <div className="relative z-10 p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-caption uppercase tracking-widest text-orange-400/70 font-mono">{symbol}</p>
            {isDrop && !image && (
              <span className="text-[10px] px-1.5 py-0.5 bg-orange-400/10 border border-orange-400/20 text-orange-400 font-medium">
                DROP
              </span>
            )}
          </div>
          <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-1 transition-colors">
            {name}
          </h3>
          {description && (
            <p className="text-caption text-gray-500 dark:text-gray-400 line-clamp-2">
              {description}
            </p>
          )}
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-200/30 dark:border-gray-700/20">
            <p className="text-caption text-gray-400">
              {isDrop ? (
                <>
                  {itemCount} minted
                  {mintConfig?.maxSupply && (
                    <span className="text-gray-300 dark:text-gray-600"> / {mintConfig.maxSupply}</span>
                  )}
                </>
              ) : (
                <>
                  {itemCount} item{itemCount !== 1 ? 's' : ''}
                </>
              )}
            </p>
            {isDrop && mintConfig && (
              <p className="text-caption font-mono text-orange-400/70">
                {mintConfig.isDutchAuction
                  ? `${mintConfig.dutchAuction?.startPrice ?? 0} SOL`
                  : mintConfig.price === 0
                    ? 'FREE'
                    : `${mintConfig.price} SOL`}
              </p>
            )}
            <svg
              className="w-4 h-4 text-gray-400/40 group-hover:text-orange-400 transition-colors duration-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </article>
    </Link>
  );
}
