'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';

// Lazy-load VRMViewer to avoid SSR issues
const VRMViewer = dynamic(
  () => import('./VRMViewer').then((mod) => mod.VRMViewer),
  { ssr: false }
);

interface NFTCardProps {
  address: string;
  name: string;
  description?: string;
  image?: string;
  animationUrl?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}

export function NFTCard({
  address,
  name,
  description,
  image,
  animationUrl,
  attributes,
}: NFTCardProps) {
  const licenseTraitTypes = ['license', 'commercial use', 'commercial_use'];
  const displayAttributes = (attributes ?? []).filter(
    (attr) => !licenseTraitTypes.includes(attr.trait_type?.toLowerCase().trim() ?? '')
  );

  return (
    <Link href={`/item/${address}`} className="block group">
      <article className="card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 overflow-hidden">
        <div className="card-forge-heat-shimmer" aria-hidden />
        <span className="card-spark card-spark-tl" aria-hidden />
        <span className="card-spark card-spark-tr" aria-hidden />
        <span className="card-spark card-spark-bl" aria-hidden />
        <span className="card-spark card-spark-br" aria-hidden />
        {/* Preview */}
        <div className="relative z-10 aspect-square overflow-hidden">
          {image ? (
            <img
              src={image}
              alt={name}
              loading="lazy"
              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
            />
          ) : animationUrl ? (
            <VRMViewer url={animationUrl} height={240} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400/50">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 6.75v11.25c0 1.24 1.007 2.25 2.25 2.25z" />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="relative z-10 p-3">
          <h3 className="text-small font-bold text-gray-900 dark:text-gray-100 mb-0.5 truncate transition-colors">
            {name}
          </h3>
          <p className="text-caption text-gray-500 dark:text-gray-400 truncate">
            {description || 'VRM Avatar'}
          </p>

          {displayAttributes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {displayAttributes.slice(0, 2).map((attr, i) => (
                <span
                  key={i}
                  className="text-caption bg-gray-900/5 dark:bg-gray-100/5 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 border border-gray-200/20 dark:border-gray-700/20 text-[10px]"
                >
                  {attr.trait_type}: {attr.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}
