'use client';

import Image from 'next/image';

/**
 * Badge shown when a wallet owns the Beta Supporter Edition NFT.
 * Uses the app icon in a green “success” box per STYLE_GUIDE (green-500).
 */
export function BetaBadge({ className = '', size = 'md', showLabel = false }: { className?: string; size?: 'sm' | 'md'; showLabel?: boolean }) {
  const isSm = size === 'sm';
  const boxSize = isSm ? 'w-8 h-8' : 'w-10 h-10';
  const iconSize = isSm ? 20 : 24;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg bg-green-500/15 border border-green-500/40 ${className}`}
      title="Beta Supporter"
      role="img"
      aria-label="Beta Supporter"
    >
      <span className={`flex-shrink-0 flex items-center justify-center ${boxSize} rounded-md bg-green-500/25 p-0.5`}>
        <Image
          src="/icon-192x192.png"
          alt=""
          width={iconSize}
          height={iconSize}
          className="rounded-sm"
        />
      </span>
      {showLabel && (
        <span className="text-caption font-medium uppercase tracking-wider text-green-700 dark:text-green-300 pr-2">
          Beta Supporter
        </span>
      )}
    </span>
  );
}
