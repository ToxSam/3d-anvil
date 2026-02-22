'use client';

import { ReactNode } from 'react';

interface ForgePageWrapperProps {
  children: ReactNode;
  /** Number of ember particles (default 24) */
  embers?: number;
  /** Show heat gradient at bottom (default true) */
  showHeat?: boolean;
  /** If true, wrapper does not force min full viewport; footer can show without scrolling (default false) */
  compact?: boolean;
  /** When true, heat-shimmer overlay becomes more prominent to simulate forging (e.g. during minting) */
  forging?: boolean;
  /** When true, wrapper is fixed to parent height and does not allow page scroll (e.g. full-viewport mint) */
  noScroll?: boolean;
}

/**
 * Wraps inner pages with the same forge aesthetic as the home page:
 * - Gradient background
 * - Animated grid overlay
 * - Subtle heat gradient from bottom
 * - Floating ember particles
 */
export function ForgePageWrapper({
  children,
  embers = 24,
  showHeat = true,
  compact = false,
  forging = false,
  noScroll = false,
}: ForgePageWrapperProps) {
  // Triple embers during forging for intense effect
  const effectiveEmbers = forging ? embers * 3 : embers;
  
  return (
    <div className={`page-inner-forge ${compact ? 'page-inner-forge--compact' : ''} ${forging ? 'page-inner-forge--forging' : ''} ${noScroll ? 'page-inner-forge--no-scroll page-inner-forge--full-cover' : ''}`}>
      {/* Ambient effects layer */}
      <div className="page-inner-effects" aria-hidden>
        {showHeat && <div className="page-inner-heat-gradient" />}
        <div className="page-inner-heat-shimmer" aria-hidden />
        <div className="page-inner-vignette" />
        {[...Array(effectiveEmbers)].map((_, i) => {
          const drift = (i % 3) + 1;
          const isSmoke = i % 6 === 0;
          const left = 8 + ((i * 37 + 13) % 84);
          const bottomOffset = (i * 19 + 7) % 18;
          const duration = 9 + (i % 5);
          const delay = (i * 0.25 + (i % 4) * 1.5) % 12;
          return (
            <span
              key={i}
              className={`ember-particle ember-drift-${drift} ${isSmoke ? 'ember-smoke' : ''}`}
              style={{
                left: `${left}%`,
                bottom: `${bottomOffset}%`,
                ['--ember-duration' as string]: `${duration}s`,
                ['--ember-delay' as string]: `${delay}s`,
              }}
            />
          );
        })}
      </div>

      {/* Page content */}
      <div className={`relative z-10 ${noScroll ? 'h-full min-h-0 flex flex-col' : ''}`}>{children}</div>
    </div>
  );
}
