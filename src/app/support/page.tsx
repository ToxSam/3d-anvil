'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import { ForgeWord } from '@/components/ForgeWord';
import { getAsset } from '@/lib/das';
import { resolveArweaveUrl, tryFetchJsonWithIrysGateway, BETA_SUPPORTER_COLLECTION_MINT } from '@/lib/constants';

const MINT_BETA_SUPPORTER_URL = `/drop/${BETA_SUPPORTER_COLLECTION_MINT}`;

const CardAnvilModel = dynamic(
  () => import('@/components/CardAnvilModel').then((mod) => mod.CardAnvilModel),
  {
    ssr: false,
    loading: () => (
      <div className="w-36 h-36 min-w-[9rem] min-h-[9rem] flex-shrink-0 flex items-center justify-center bg-transparent">
        <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-orange-400 rounded-full animate-spin" />
      </div>
    ),
  }
);

const SupportCardGLBViewer = dynamic(
  () =>
    import('@/components/SupportCardGLBViewer').then((mod) => mod.SupportCardGLBViewer),
  { ssr: false }
);

function SupportMintCard({ isSticky = true }: { isSticky?: boolean }) {
  const [hover, setHover] = useState(false);
  const [dropMeta, setDropMeta] = useState<{
    name: string | null;
    animationUrl: string | null;
  }>({ name: null, animationUrl: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const asset = await getAsset(BETA_SUPPORTER_COLLECTION_MINT);
      if (cancelled || !asset?.content) return;
      const c = asset.content;
      // Name: prefer DAS metadata, fallback to JSON (some RPCs don't populate metadata.name for collection NFTs)
      let name: string | null = c.metadata?.name ?? null;
      let animationUrl = resolveArweaveUrl(c.links?.animation_url ?? undefined);
      if (c.json_uri) {
        const json = await tryFetchJsonWithIrysGateway(c.json_uri);
        if (json) {
          if (!name && typeof json.name === 'string') name = json.name;
          if (!animationUrl && json.animation_url) {
            animationUrl = resolveArweaveUrl(json.animation_url) ?? undefined;
          }
        }
      }
      if (!cancelled) {
        setDropMeta({ name, animationUrl });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = dropMeta.name?.trim() || 'Beta Supporter Edition';
  const hasModelUrl = !!dropMeta.animationUrl;

  return (
    <Link
      href={MINT_BETA_SUPPORTER_URL}
      className={`card-forge card-forge-support relative overflow-hidden rounded-xl border-0 bg-gray-900/95 dark:bg-gray-950/95 flex flex-row items-center gap-4 p-5 md:p-6 lg:flex-col lg:items-center lg:text-center lg:gap-4 ${
        isSticky ? 'lg:sticky lg:top-28' : ''
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="card-forge-heat-shimmer" aria-hidden />
      <span className="card-spark card-spark-tl" aria-hidden />
      <span className="card-spark card-spark-tr" aria-hidden />
      <span className="card-spark card-spark-bl" aria-hidden />
      <span className="card-spark card-spark-br" aria-hidden />
      <div className="relative z-10 flex flex-row items-center gap-4 flex-1 min-w-0 lg:flex-col lg:items-center lg:text-center lg:w-full">
        {/* Mobile: model left. Wide: model on top */}
        <div className="flex-shrink-0 flex justify-center lg:mb-0 lg:order-first">
          {hasModelUrl ? (
            <SupportCardGLBViewer modelUrl={dropMeta.animationUrl} isHovering={hover} />
          ) : (
            <CardAnvilModel isHovering={hover} />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center text-left lg:order-last lg:items-center lg:text-center">
          <h3 className="text-body font-bold text-gray-100 tracking-tight mb-1">
            {displayName}
          </h3>
          <p className="text-small text-gray-400 mb-3">
            Mint this Anvil to support the project.
            <br />
            0.1 SOL · 1000 editions
          </p>
          <span className="btn-hero-primary inline-flex items-center gap-2 text-small py-2 w-fit lg:w-auto">
            Mint Beta Anvil →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function SupportPage() {
  return (
    <ForgePageWrapper embers={16} compact>
      <div className="container-custom py-12 md:py-20">
        {/* Hero */}
        <div className="max-w-3xl mb-16 animate-slide-up">
          <p className="text-label mb-4 animate-fade-in">Community</p>
          <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-5">
            <ForgeWord text="Support 3D Anvil" lineBreakAfterWordIndex={2} />
          </h1>
          <p className="text-body-lg text-gray-500 dark:text-gray-400 max-w-2xl">
            No platform fees. We run on community support. Here&apos;s how you
            can help keep the forge running.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 relative">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-12 max-w-2xl">
          {/* Here's the deal */}
          <section>
            <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
              Here&apos;s the deal
            </h2>
            <div className="space-y-4 text-body text-gray-600 dark:text-gray-400 leading-relaxed">
              <p>
                3D Anvil doesn&apos;t charge platform fees. Creators keep 100% of
                their sales. No subscriptions, no hidden costs. Stored on
                Arweave forever. Your assets, your choice.
              </p>
              <p>
                <strong className="text-gray-900 dark:text-gray-100">
                  The money part:
                </strong>{' '}
                But running this thing costs real money:
              </p>
              <ul className="list-none space-y-2 pl-0">
                <li className="flex items-start gap-2">
                  <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                  <span>Helius RPC: $50–200/month (scales with usage)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                  <span>Vercel hosting: $20/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                  <span>Domain: $12/year</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                  <span>Development: Too many hours to count</span>
                </li>
              </ul>
              <p>
                We&apos;re not VC-backed. We&apos;re not running ads.
              </p>
              <p>
                <strong className="text-gray-900 dark:text-gray-100">
                  No token:
                </strong>{' '}
                We don&apos;t have an official Solana token and have no plans to
                launch one. If you want to support the project, minting the Beta
                Supporter Edition is the only way — no airdrops, no token sales,
                just the NFT drop.
              </p>
            </div>
          </section>

          {/* How you can help */}
          <section>
            <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
              How you can help
            </h2>
            <p className="text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
              We&apos;re doing it the old-school way: community support.
            </p>
            <p className="text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
              Mint the <strong className="text-gray-900 dark:text-gray-100">Beta Supporter Edition</strong> — a limited drop of the 3D Anvil logo:
            </p>
            <ul className="space-y-2 text-body text-gray-600 dark:text-gray-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>You get a 3D model (GLB format)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>Shows as &quot;Beta Supporter&quot; badge on your profile</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>Helps fund infrastructure</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>First in a collection of seasonal drops</span>
              </li>
            </ul>
          </section>

          <div className="divider-forge lg:hidden" aria-hidden />

          {/* Where does the money go */}
          <section>
            <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
              Where does the money go?
            </h2>
            <ul className="space-y-2 text-body text-gray-600 dark:text-gray-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>Paying for RPC nodes as we scale</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>Hosting costs</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>Development time</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>Staying independent</span>
              </li>
            </ul>
          </section>

          {/* What if I can't support */}
          <section>
            <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
              What if I can&apos;t support right now?
            </h2>
            <p className="text-body text-gray-600 dark:text-gray-400 leading-relaxed">
              No worries! The platform stays free either way. This is just for
              people who vibe with the mission and want to chip in.
            </p>
          </section>

          {/* More supporter drops */}
          <section>
            <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
              Will there be more supporter drops?
            </h2>
            <p className="text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
              Yep. Thinking:
            </p>
            <ul className="space-y-2 text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>Seasonal editions (one per quarter)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>Milestone editions (1K users, 10K drops)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                <span>Maybe tiered editions later (different models, different prices)</span>
              </li>
            </ul>
            <p className="text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
              This Beta Edition won&apos;t be available again, so if you want #1
              in the collection, now&apos;s the time.
            </p>

            <Link
              href={MINT_BETA_SUPPORTER_URL}
              className="btn-forge-cta inline-flex items-center gap-2"
            >
              Support the Project →
            </Link>
          </section>

          {/* Footer line */}
          <section className="pt-8 border-t border-gray-200/50 dark:border-gray-700/30">
            <p className="text-small text-gray-500 dark:text-gray-400 italic">
              Built with 🔥 on Solana
            </p>
            <p className="text-small text-gray-500 dark:text-gray-400 italic mt-1">
              No utility. No roadmap. Just good vibes and infrastructure costs.
            </p>
          </section>
          </div>

          {/* Sticky mint card — right on desktop, bottom on mobile */}
          <aside className="w-full lg:w-80 flex-shrink-0">
            <SupportMintCard />
          </aside>
        </div>
      </div>
    </ForgePageWrapper>
  );
}
