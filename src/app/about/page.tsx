'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import { SolanaIcon } from '@/components/SolanaIcon';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'creators', label: 'For Creators' },
  { id: 'collectors', label: 'For Collectors' },
  { id: 'technology', label: 'Technology' },
  { id: 'formats', label: 'Supported Formats' },
  { id: 'open-source', label: 'Open Source' },
  { id: 'who-behind', label: "Who's Behind" },
  { id: 'developers', label: 'For Developers' },
  { id: 'expect', label: 'What to Expect' },
  { id: 'faq', label: 'FAQ' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

interface FaqItem {
  q: string;
  a: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'Is 3D Anvil a marketplace?',
    a: 'No. 3D Anvil is a creator tool — think of it like Manifold for 3D on Solana. We give creators the tools to create collections, launch drops, and share their own mint pages. We don\'t list or resell your work. You share your page, collectors mint from you directly.',
  },
  {
    q: 'Do I need to know how to code?',
    a: 'Not at all. Everything is done through forms and buttons — upload your file, fill in the details, set your price, and publish. The on-chain contracts (Candy Machine, NFT minting) are handled automatically behind the scenes. No smart contract knowledge, no command line, no scripts.',
  },
  {
    q: 'Do I need SOL to create a collection?',
    a: 'Yes. Creating a collection, minting an NFT, and launching a drop all require small amounts of SOL to cover Solana network fees (called "rent" and transaction fees). These are typically fractions of a SOL — far cheaper than other blockchains. You\'ll need a Solana wallet with some SOL before you start.',
  },
  {
    q: 'What wallet do I need?',
    a: 'Any Solana-compatible wallet works. We recommend Phantom or Solflare. Make sure your wallet is set to the same network the app is running on (Devnet during testing, Mainnet for production).',
  },
  {
    q: 'What file formats can I upload?',
    a: 'We support GLB (standard 3D models) and VRM (humanoid avatars). GLB files can contain characters, props, wearables, environments — anything 3D. VRM files are specifically designed for avatars and carry extra metadata like license info, expressions, and rigging data that we read automatically.',
  },
  {
    q: 'Where are my files stored?',
    a: 'Your 3D files and metadata are uploaded to Arweave, a permanent decentralized storage network. Once uploaded, files cannot be deleted or modified — they\'re stored forever. This means your assets won\'t disappear even if our platform goes offline.',
  },
  {
    q: 'What\'s the difference between a Collection and a Drop?',
    a: 'A Collection is a standard NFT collection where you (the creator) mint items one at a time, at your own pace. A Drop is a timed release — you set a start time, end time, price, and optional supply cap, then anyone with the link can mint during that window. Drops support advanced features like Dutch auctions, allowlists, and per-wallet limits.',
  },
  {
    q: 'Are there platform fees?',
    a: 'No. 3D Anvil charges zero platform fees and takes no revenue share. When someone mints your NFT, the full payment goes to you (minus standard Solana network fees, which are fractions of a cent). You keep what you earn.',
  },
  {
    q: 'Can I set royalties?',
    a: 'Yes. When creating a collection or drop, you can set creator royalties (a percentage of secondary sales) and split revenue among multiple collaborators. Royalties are stored on-chain in the NFT metadata via Metaplex.',
  },
  {
    q: 'What is a Dutch Auction?',
    a: 'A Dutch auction starts at a high price and decreases over time until it reaches a floor price. Collectors decide when the price is right for them. Our Dutch auctions use on-chain price steps enforced by the Candy Machine program — the price schedule can\'t be tampered with.',
  },
  {
    q: 'Can collectors use my 3D assets in games or VR?',
    a: 'Yes — that\'s the whole idea. GLB and VRM are open standards supported across many platforms, game engines, and virtual worlds. Once someone owns your NFT, they can download the 3D file and use it wherever these formats are supported.',
  },
  {
    q: 'Is this on Mainnet or Devnet?',
    a: '3D Anvil is live on Solana Mainnet. Check the network badge in the top-right corner of the app to confirm. Make sure your wallet is set to Mainnet to mint and interact with real NFTs.',
  },
  {
    q: 'What happens if 3D Anvil shuts down?',
    a: 'Your NFTs and 3D files live on Solana and Arweave — not on our servers. Even if 3D Anvil goes offline, your assets remain on-chain and your files remain on Arweave permanently. Any compatible wallet or tool can read and display them.',
  },
  {
    q: 'Can I edit my collection after creating it?',
    a: 'It depends. Collection metadata (name, image, description) can be updated if the authority hasn\'t been revoked. For drops, the Candy Machine configuration (price, dates, allowlist, etc.) is mutable by default so you can adjust settings after launch. We plan to add a "freeze" option later for creators who want to lock their config for transparency.',
  },
];

function useActiveSection() {
  const [active, setActive] = useState<SectionId>('overview');

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const entries = new Map<string, boolean>();

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          entries.set(id, entry.isIntersecting);
          const first = SECTIONS.find((s) => entries.get(s.id));
          if (first) setActive(first.id);
        },
        { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return active;
}

function FaqAccordion({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <div className="border border-gray-200/50 dark:border-gray-700/30 rounded-lg overflow-hidden transition-colors hover:border-orange-400/30">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left group"
      >
        <span className="text-body font-medium text-gray-900 dark:text-gray-100 group-hover:text-orange-400 transition-colors">
          {item.q}
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 group-hover:text-orange-400 transition-transform duration-300 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        ref={bodyRef}
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: open ? bodyRef.current?.scrollHeight ?? 500 : 0,
          opacity: open ? 1 : 0,
        }}
      >
        <div className="px-5 pb-5 text-body text-gray-500 dark:text-gray-400 leading-relaxed">
          {item.a}
        </div>
      </div>
    </div>
  );
}

export default function AboutPage() {
  const activeSection = useActiveSection();

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      const offset = 100;
      const y = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  return (
    <ForgePageWrapper embers={16} compact>
      <div className="container-custom py-12 md:py-20">
        {/* Hero */}
        <div className="max-w-3xl mb-16 animate-slide-up">
          <p className="text-label mb-4 animate-fade-in">Learn</p>
          <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-5">
            About 3D Anvil
          </h1>
          <p className="text-body-lg text-gray-500 dark:text-gray-400 max-w-2xl">
            Everything you need to know — what 3D Anvil is, how it works, the
            technology behind it, and what to expect. Whether you&apos;re a
            creator, artist, or collector, this is your starting point.
          </p>
        </div>

        <div className="flex gap-12 lg:gap-16 relative">
          {/* Sidebar Nav (desktop) */}
          <nav className="hidden lg:block w-52 flex-shrink-0">
            <div className="sticky top-28 space-y-1">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`block w-full text-left px-3 py-2 text-small rounded transition-colors duration-200 ${
                    activeSection === s.id
                      ? 'text-orange-500 dark:text-orange-400 font-medium bg-orange-400/5'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-20">
            {/* Overview */}
            <section id="overview">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
                What is 3D Anvil?
              </h2>
              <div className="space-y-4 text-body text-gray-600 dark:text-gray-400 leading-relaxed">
                <p>
                  3D Anvil is a no-code tool for creators to mint and drop 3D
                  assets as NFTs on Solana. Think of it like{' '}
                  <a
                    href="https://www.manifold.xyz/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 dark:text-orange-400 hover:underline"
                  >
                    Manifold
                  </a>
                  , but built specifically for 3D — models, avatars,
                  wearables, props. Upload your files, set your terms, and
                  share your mint page. No coding, no middleman, no platform
                  fees.
                </p>
                <p>
                  We&apos;re not a marketplace. We&apos;re the tool that helps you
                  create your own collections and drops, with your own mint
                  pages, on your own terms. Creators keep full control — you
                  set the price, supply, schedule, and who can mint. Payments
                  go straight to your wallet.
                </p>
                <p>
                  Every asset gets an interactive 3D viewer so collectors can
                  rotate, zoom, and inspect models right in the browser before
                  they mint. Files are stored permanently on Arweave, so nothing
                  disappears.
                </p>
                <p>
                  Whether you&apos;re a 3D artist launching your first avatar
                  collection, a game studio distributing in-game items, or
                  someone who just wants to put their 3D work on-chain — 3D
                  Anvil makes it simple. No smart contract knowledge needed.
                </p>
              </div>
            </section>

            {/* For Creators */}
            <section id="creators">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
                For Creators &amp; Artists
              </h2>
              <div className="space-y-4 text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
                <p>
                  3D Anvil handles the on-chain complexity so you don&apos;t
                  have to. Connect your wallet, upload your 3D file, configure
                  your sale, and you&apos;re live. Here&apos;s what the tool
                  gives you:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Collections
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    Create a collection and mint NFTs into it one at a time — no
                    code required. Great for 1/1 pieces, curated releases, or
                    building a catalog over time. You control pricing, supply, and
                    who can mint.
                  </p>
                </div>
                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Drops (Timed Sales)
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    Launch timed releases with a start/end window, your own mint
                    page, and on-chain rules. Open editions, limited supply,
                    Dutch auctions, allowlists, token-gated access, per-wallet
                    limits — all configured through a simple form.
                  </p>
                </div>
                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Revenue Splits
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    Collaborate with other artists. Split primary sale revenue and
                    royalties among multiple wallet addresses. Payments go
                    directly to each collaborator — no intermediary.
                  </p>
                </div>
                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Your Own Pages
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    Every collection and drop gets its own page with a 3D viewer,
                    mint button, and all the info collectors need. Share the link
                    anywhere — social media, your website, Discord. You also get
                    a creator profile with your full portfolio and stats.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-lg bg-orange-400/5 border border-orange-400/20">
                <p className="text-small text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="font-semibold text-orange-500 dark:text-orange-400">
                    No platform fees. No revenue share.
                  </span>{' '}
                  You only pay Solana network fees (typically fractions of a
                  SOL). When someone mints your NFT, the full payment goes
                  straight to your wallet. We don&apos;t take a cut.
                </p>
              </div>
            </section>

            {/* For Collectors */}
            <section id="collectors">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
                For Collectors
              </h2>
              <div className="space-y-4 text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
                <p>
                  When a creator shares their mint page with you, you&apos;re
                  minting directly from them — not through a marketplace.
                  Every NFT you mint is a real 3D file you can download and use.
                </p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-orange-400/10 text-orange-400 rounded-lg mt-0.5">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-1">
                      Preview before you mint
                    </h3>
                    <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                      Every mint page has an interactive 3D viewer. Rotate, zoom,
                      and inspect the model from every angle before you commit.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-orange-400/10 text-orange-400 rounded-lg mt-0.5">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-1">
                      Usable 3D files, not just JPEGs
                    </h3>
                    <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                      GLB and VRM are open standards. Use your minted assets in
                      Unity, Unreal Engine, VRChat, Decentraland, or any
                      compatible platform. These are real 3D models you can
                      actually take into games and virtual worlds.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-orange-400/10 text-orange-400 rounded-lg mt-0.5">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-1">
                      Own it forever
                    </h3>
                    <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                      Your NFT lives on Solana and the 3D file lives on Arweave.
                      No one can take them away — not even us. If 3D Anvil shuts
                      down, your assets still exist on-chain and on permanent
                      storage.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-orange-400/10 text-orange-400 rounded-lg mt-0.5">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-1">
                      Mint directly from creators
                    </h3>
                    <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                      When you mint, payment goes directly to the creator&apos;s
                      wallet — no platform in the middle taking a cut.                       You can
                      also browse collections from creators when you have their links.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Technology */}
            <section id="technology">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
                Technology
              </h2>
              <div className="space-y-4 text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
                <p>
                  3D Anvil is built on open, well-established infrastructure.
                  Here&apos;s what powers it under the hood:
                </p>
              </div>

              <div className="space-y-6">
                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <div className="flex items-center gap-3 mb-3">
                    <SolanaIcon className="w-6 h-6 text-gray-900 dark:text-gray-100 flex-shrink-0" ariaHidden />
                    <h3 className="text-body font-bold text-gray-900 dark:text-gray-100">
                      Solana
                    </h3>
                  </div>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    All NFTs, collections, and transactions live on the Solana
                    blockchain. Solana offers fast finality (~400ms), low
                    transaction costs (fractions of a cent), and a large
                    ecosystem of wallets and tools. Your assets are secured by
                    the network, not by us.
                  </p>
                </div>

                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-3">
                    Metaplex
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    NFTs follow the{' '}
                    <a
                      href="https://www.metaplex.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 dark:text-orange-400 hover:underline"
                    >
                      Metaplex
                    </a>{' '}
                    standard — the most widely used NFT protocol on Solana.
                    This means your NFTs are compatible with every major Solana
                    wallet, marketplace, and tool out of the box. Royalties,
                    creator splits, and collection grouping are all handled via
                    Metaplex metadata.
                  </p>
                </div>

                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-3">
                    Candy Machine (On-Chain Enforcement)
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    Drops use{' '}
                    <a
                      href="https://docs.metaplex.com/programs/candy-machine/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 dark:text-orange-400 hover:underline"
                    >
                      Metaplex Candy Machine
                    </a>{' '}
                    to enforce mint rules on-chain. Price, supply, dates,
                    allowlists, token gating, per-wallet limits, and Dutch
                    auction price steps are all enforced by the program — not
                    by our frontend. This means the rules can&apos;t be
                    bypassed, even by someone building their own client.
                  </p>
                </div>

                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-3">
                    Arweave (Permanent Storage)
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    3D files and metadata are uploaded to{' '}
                    <a
                      href="https://www.arweave.org/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 dark:text-orange-400 hover:underline"
                    >
                      Arweave
                    </a>
                    , a permanent decentralized storage network. You pay once at
                    upload time and the file is stored forever. No monthly fees,
                    no risk of files vanishing. If our app goes away, the files
                    are still there.
                  </p>
                </div>

                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-3">
                    3D Viewer (Three.js)
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    Every asset has an interactive 3D preview powered by{' '}
                    <a
                      href="https://threejs.org/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 dark:text-orange-400 hover:underline"
                    >
                      Three.js
                    </a>
                    . GLB models can be rotated and zoomed. VRM avatars
                    display with animations, expressions, and rigging info
                    extracted from the file. No plugins or downloads needed —
                    everything runs in the browser.
                  </p>
                </div>
              </div>
            </section>

            {/* Supported Formats */}
            <section id="formats">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
                Supported Formats
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <div className="flex items-center gap-3 mb-4">
                    <a
                      href="https://www.khronos.org/gltf/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-body-lg font-bold font-mono text-orange-500 dark:text-orange-400 hover:underline"
                    >
                      .glb
                    </a>
                    <span className="text-small text-gray-500 dark:text-gray-400">
                      GL Transmission Format (Binary)
                    </span>
                  </div>
                  <div className="space-y-3 text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    <p>
                      The standard format for 3D models on the web. GLB files can
                      contain geometry, textures, materials, and animations in a
                      single file.
                    </p>
                    <p>
                      Use for: characters, props, wearables, environments, game
                      assets, or anything 3D.
                    </p>
                    <p className="text-caption text-gray-400 dark:text-gray-500">
                      Supported by: Unity, Unreal Engine, Blender, Three.js,
                      Babylon.js, Godot, and most modern 3D tools.
                    </p>
                  </div>
                </div>

                <div className="p-6 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <div className="flex items-center gap-3 mb-4">
                    <a
                      href="https://vrm.dev/en/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-body-lg font-bold font-mono text-orange-500 dark:text-orange-400 hover:underline"
                    >
                      .vrm
                    </a>
                    <span className="text-small text-gray-500 dark:text-gray-400">
                      VR Model (Humanoid Avatars)
                    </span>
                  </div>
                  <div className="space-y-3 text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    <p>
                      An extension of glTF specifically designed for humanoid
                      avatars. VRM files include rigging, expressions (blendshapes),
                      spring bones, and license metadata.
                    </p>
                    <p>
                      We read VRM metadata automatically — license info,
                      allowed usage, avatar expressions, and more are displayed
                      on the asset page.
                    </p>
                    <p className="text-caption text-gray-400 dark:text-gray-500">
                      Supported by: VRChat, Cluster, VSeeFace, three-vrm,
                      PixivVRM, and the growing VRM ecosystem.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Open Source */}
            <section id="open-source">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
                Open Source &amp; CC0
              </h2>
              <div className="space-y-4 text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
                <p>
                  3D Anvil is fully{' '}
                  <a
                    href="https://github.com/ToxSam/3d-anvil"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 dark:text-orange-400 hover:underline"
                  >
                    open source on GitHub
                  </a>{' '}
                  and released under the CC0 license — meaning anyone can fork
                  it, build on it, host their own copy, or integrate the NFT
                  infrastructure into their own project. No restrictions, no
                  royalties, no permission needed.
                </p>
                <p>
                  The real beauty of how this works is that{' '}
                  <strong className="text-gray-900 dark:text-gray-100">
                    3D Anvil doesn&apos;t deploy any contracts itself
                  </strong>
                  . Every collection and drop you create is your own — deployed
                  by your wallet, owned by you. 3D Anvil isn&apos;t a custodian of
                  anything you make. It&apos;s just a beautiful interface that
                  connects you to Solana programs that have been running
                  reliably for years (Metaplex, Candy Machine).
                </p>
                <p>
                  When you use 3D Anvil, you&apos;re paying Solana&apos;s
                  network fees and Arweave&apos;s storage costs — not a
                  platform fee to the project. 3D Anvil&apos;s only cost is a minimal hosting bill to
                  keep the UX running. Since everything is CC0, anyone in the
                  community can fork this project, host their own copy, or take
                  over hosting if the maintainers step back. No single point of failure.
                </p>
              </div>

              <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30 mb-4">
                <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-3">
                  What 3D Anvil actually does
                </h3>
                <ul className="space-y-2 text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                    <span>Provides a polished, no-code UI to interact with Solana</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                    <span>Handles uploading 3D files to Arweave via Irys so creators don&apos;t have to</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                    <span>Wires up Candy Machine so creators can launch drops with real sale mechanics in minutes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 mt-0.5 flex-shrink-0">—</span>
                    <span>Shows an interactive 3D viewer for every asset so collectors can inspect before minting</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 rounded-lg bg-orange-400/5 border border-orange-400/20">
                <p className="text-small text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="font-semibold text-orange-500 dark:text-orange-400">
                    Because it&apos;s CC0:
                  </span>{' '}
                  anyone can fork this repo and run their own copy — supporting
                  the community, building a competing version, or adapting it
                  for a specific niche. The more forks and hosts, the more
                  resilient the whole ecosystem becomes.
                </p>
              </div>
            </section>

            {/* Who's Behind */}
            <section id="who-behind">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
                Who&apos;s Behind 3D Anvil
              </h2>
              <div className="space-y-4 text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
                <p>
                  3D Anvil was built by{' '}
                  <a
                    href="https://toxsam.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 dark:text-orange-400 hover:underline"
                  >
                    ToxSam
                  </a>
                  — a developer and digital creator who&apos;s been deep in the NFT
                  and virtual worlds space since 2018, back when most people
                  still thought NFTs were a typo.
                </p>
                <p>
                  You&apos;ve probably already used something he made. Cool Banana,
                  Butter, Mushy among many other — some of the most widely used
                  free avatars in the world — are his. That obsession with making
                  3D identity accessible to everyone is the thread that runs
                  through everything he builds.
                </p>
                <p>
                  In 2020 he launched CryptoAvatars, the first platform
                  to let creators mint VRM avatars on Ethereum. It evolved into
                  VIPE (Virtual Persona), pushing the idea of truly ownable 3D
                  identities across virtual worlds.
                </p>
                <p>
                  He also developed{' '}
                  <a
                    href="https://www.opensourceavatars.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 dark:text-orange-400 hover:underline"
                  >
                    OpenSourceAvatars.com
                  </a>
                  {' '}and{' '}
                  <a
                    href="https://www.opensource3dassets.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 dark:text-orange-400 hover:underline"
                  >
                    OpenSource3DAssets.com
                  </a>
                  — free, interoperable 3D assets anyone can use across any
                  world or platform.
                </p>
                <p>
                  Both CryptoAvatars and VIPE eventually had to close. The
                  ecosystem wasn&apos;t ready, the infrastructure was expensive,
                  and Ethereum wasn&apos;t the friendliest place for this kind
                  of experimentation.
                </p>
                <p>
                  3D Anvil is what happens when you take all of that — the
                  failures, the lessons, the deep conviction that 3D assets
                  deserve a proper permanent home on-chain — and rebuild it from
                  scratch on Solana. Leaner, open source, CC0, no platform fees.
                  Less startup, more tool. Built by someone who&apos;s been trying
                  to solve this problem for years.
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <a
                  href="https://x.com/toxsam"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-small font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-orange-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                >
                  <span aria-hidden>👁️</span> @toxsam on X
                </a>
                <a
                  href="https://toxsam.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-small font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-orange-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                >
                  <span aria-hidden>👽</span> toxsam.com
                </a>
                <a
                  href="https://github.com/ToxSam"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-small font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-orange-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                >
                  <span aria-hidden>💻</span> github.com/ToxSam
                </a>
                <a
                  href="https://www.opensourceavatars.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-small font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-orange-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                >
                  <span aria-hidden>🐻</span> Open Source Avatars
                </a>
                <a
                  href="https://www.opensource3dassets.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-small font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-orange-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                >
                  <span aria-hidden>🥩</span> Open Source 3D Assets
                </a>
              </div>
            </section>

            {/* For Developers */}
            <section id="developers">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
                For Developers
              </h2>
              <div className="space-y-4 text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
                <p>
                  Want to build something similar, integrate 3D Anvil&apos;s NFT
                  infrastructure into your own project, or just understand how
                  everything fits together? The repo is structured to make
                  that easy.
                </p>
              </div>

              <div className="space-y-6">
                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-3">
                    AGENTS.md — start here
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
                    The{' '}
                    <a
                      href="https://github.com/ToxSam/3d-anvil/blob/main/AGENTS.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 dark:text-orange-400 hover:underline font-mono"
                    >
                      AGENTS.md
                    </a>{' '}
                    file at the root of the repo is the full map of the project.
                    It documents what every part does, which files are critical,
                    the security model, the environment variables, every route,
                    and how to run it locally. It&apos;s written to be readable by
                    both humans and AI coding assistants — so you (or your AI
                    agent) can get up to speed immediately and make changes
                    safely.
                  </p>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed">
                    If you&apos;re using Cursor, Claude, or any LLM to help you
                    build on this codebase, point it at AGENTS.md first. It
                    tells the AI what not to touch and what patterns to follow.
                  </p>
                </div>

                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-3">
                    Launchpad Registry — integrate NFTs into your project
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
                    3D Anvil includes a registry that tracks all collections
                    created through the platform. The registry is backed by
                    Vercel KV (Redis) and every write is verified on-chain
                    before it&apos;s accepted — so the data is trustworthy.
                  </p>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
                    If you&apos;re building a game, metaverse, or any project
                    that wants to support 3D Anvil NFTs, you can query the
                    registry to enumerate collections and verify ownership.
                    The{' '}
                    <a
                      href="https://github.com/ToxSam/3d-anvil/blob/main/src/lib/server/launchpadRegistry.ts"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 dark:text-orange-400 hover:underline font-mono"
                    >
                      launchpadRegistry.ts
                    </a>{' '}
                    module and the{' '}
                    <span className="font-mono text-gray-600 dark:text-gray-300">/api/launchpad/</span>{' '}
                    endpoints are documented in AGENTS.md.
                  </p>
                  <div className="mt-3 p-3 rounded bg-gray-100/60 dark:bg-gray-800/40 font-mono text-caption text-gray-600 dark:text-gray-400 leading-relaxed">
                    <span className="text-gray-400 dark:text-gray-500">KV key structure:</span>
                    <br />
                    lp:collection:&lt;mint&gt; → {'{'} mint, creator, createdAt, network {'}'}
                    <br />
                    lp:sig:&lt;txSig&gt; → 1 <span className="text-gray-400 dark:text-gray-500">(replay protection)</span>
                  </div>
                </div>

                <div className="p-5 rounded-lg bg-gray-50/60 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-3">
                    Use it as a template
                  </h3>
                  <p className="text-small text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
                    The codebase is a working Next.js 14 App Router project with
                    Solana wallet integration, Metaplex/UMI, Candy Machine drops,
                    Irys/Arweave uploads, a server-side RPC proxy, and a KV
                    registry — all production-ready patterns. Fork it and swap
                    in your own branding, domain, and features.
                  </p>
                  <div className="flex flex-wrap gap-3 mt-4">
                    <a
                      href="https://github.com/ToxSam/3d-anvil"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-small font-medium bg-gray-900 dark:bg-gray-100 text-gray-100 dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                      </svg>
                      View on GitHub
                    </a>
                    <a
                      href="https://github.com/ToxSam/3d-anvil/blob/main/AGENTS.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-small font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-orange-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                    >
                      Read AGENTS.md
                    </a>
                  </div>
                </div>
              </div>
            </section>

            {/* What to Expect */}
            <section id="expect">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
                What to Expect
              </h2>
              <div className="space-y-4 text-body text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
                <p>
                  3D Anvil is under active development. Here&apos;s what you should
                  know about the current state:
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-lg border-l-2 border-green-400 bg-green-50/50 dark:bg-green-950/20">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Live on Mainnet
                  </h3>
                  <p className="text-small text-gray-600 dark:text-gray-400 leading-relaxed">
                    3D Anvil is live on Solana Mainnet. Real mints, real NFTs,
                    real 3D assets on-chain. Check the network badge in the
                    top-right corner to confirm you&apos;re on Mainnet and your
                    wallet matches.
                  </p>
                </div>

                <div className="p-5 rounded-lg border-l-2 border-blue-400 bg-blue-50/50 dark:bg-blue-950/20">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Active Development
                  </h3>
                  <p className="text-small text-gray-600 dark:text-gray-400 leading-relaxed">
                    Features are being added regularly. You may encounter bugs,
                    UI changes, or features that are partially implemented. We
                    appreciate your patience and feedback as we build.
                  </p>
                </div>

                <div className="p-5 rounded-lg border-l-2 border-green-400 bg-green-50/50 dark:bg-green-950/20">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                    On-Chain Enforcement
                  </h3>
                  <p className="text-small text-gray-600 dark:text-gray-400 leading-relaxed">
                    Drop rules (price, supply, dates, allowlists) are enforced by
                    Solana programs, not just our frontend. This means the rules
                    can&apos;t be bypassed. Regular collections use a simpler
                    flow where rules are enforced by the app (which is by design
                    for that use case).
                  </p>
                </div>

                <div className="p-5 rounded-lg border-l-2 border-gray-300 dark:border-gray-600 bg-gray-50/60 dark:bg-gray-900/40">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Desktop First (Mobile Coming Later)
                  </h3>
                  <p className="text-small text-gray-600 dark:text-gray-400 leading-relaxed">
                    3D Anvil is optimized for desktop browsers right now. A
                    mobile-friendly version will come at some point — for the
                    best experience today, use a laptop or desktop.
                  </p>
                </div>

                <div className="p-5 rounded-lg border-l-2 border-purple-400 bg-purple-50/50 dark:bg-purple-950/20">
                  <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Coming Soon
                  </h3>
                  <ul className="space-y-2 text-small text-gray-600 dark:text-gray-400 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-1">—</span>
                      <span>
                        Burn-to-mint mechanics (burn one NFT to mint another)
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-1">—</span>
                      <span>
                        Config freeze option for creators who want to lock settings
                        for trust
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-1">—</span>
                      <span>Mobile-friendly version</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-1">—</span>
                      <span>
                        More 3D format support and enhanced viewer features
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* FAQ */}
            <section id="faq">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
                Frequently Asked Questions
              </h2>
              <div className="space-y-3">
                {FAQ_ITEMS.map((item, i) => (
                  <FaqAccordion key={i} item={item} />
                ))}
              </div>
            </section>

            {/* CTA */}
            <section className="pt-8 pb-4 border-t border-gray-200/50 dark:border-gray-700/30">
              <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4">
                Ready to get started?
              </h2>
              <p className="text-body text-gray-500 dark:text-gray-400 mb-8 max-w-xl">
                Connect your wallet and start creating — or browse what others
                have built.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/create" className="btn-hero-primary">
                  Start Forging
                </Link>
                <Link href="/create" className="btn-ghost">
                  Create
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </ForgePageWrapper>
  );
}
