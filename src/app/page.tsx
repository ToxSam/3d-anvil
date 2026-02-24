'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ForgeWord } from '@/components/ForgeWord';
import { ForgeStepNumber } from '@/components/ForgeStepNumber';
import { IconGLB, IconVRM } from '@/components/AssetIcons';
import { SolanaIcon } from '@/components/SolanaIcon';

// Lazy load the 3D model to avoid SSR issues with Three.js
const HeroModel = dynamic(
  () => import('@/components/HeroModel').then((mod) => mod.HeroModel),
  {
    ssr: false,
    loading: () => (
      <div className="hero-model-container flex items-center justify-center">
        <div className="w-16 h-16 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin" />
      </div>
    ),
  }
);

const CardAnvilModel = dynamic(
  () => import('@/components/CardAnvilModel').then((mod) => mod.CardAnvilModel),
  {
    ssr: false,
    loading: () => (
      <div className="w-40 h-40 min-w-[10rem] min-h-[10rem] flex-shrink-0 flex items-center justify-center bg-transparent">
        <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin" />
      </div>
    ),
  }
);

const CardVRMModel = dynamic(
  () => import('@/components/CardVRMModel').then((mod) => mod.CardVRMModel),
  {
    ssr: false,
    loading: () => (
      <div className="w-40 h-40 min-w-[10rem] min-h-[10rem] flex-shrink-0 flex items-center justify-center bg-transparent">
        <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin" />
      </div>
    ),
  }
);

const StatAnvilModel = dynamic(
  () => import('@/components/StatAnvilModel').then((mod) => mod.StatAnvilModel),
  {
    ssr: false,
    loading: () => (
      <div className="w-14 h-14 min-w-[3.5rem] min-h-[3.5rem] flex-shrink-0 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin" />
      </div>
    ),
  }
);

/** Strike order: 01 (both digits), then 02, then 03. Each strike lasts 650ms; next after 2000ms. */
const STEP_STRIKE_ORDER: { stepIndex: number; digitIndex: number }[] = [
  { stepIndex: 0, digitIndex: 0 },
  { stepIndex: 0, digitIndex: 1 },
  { stepIndex: 1, digitIndex: 0 },
  { stepIndex: 1, digitIndex: 1 },
  { stepIndex: 2, digitIndex: 0 },
  { stepIndex: 2, digitIndex: 1 },
];
const STRIKE_DURATION_MS = 650;
const STRIKE_INTERVAL_MS = 2000;

/** Parallax curve: subtle at top, ramps up more toward bottom. progress^0.5 = slow start. */
function parallaxIntensity(progress: number): number {
  return Math.pow(Math.min(1, Math.max(0, progress)), 0.5);
}

export default function Home() {
  const [glbCardHover, setGlbCardHover] = useState(false);
  const [vrmCardHover, setVrmCardHover] = useState(false);
  const [stepStrikeAt, setStepStrikeAt] = useState(STEP_STRIKE_ORDER.length - 1);
  const [strikeActive, setStrikeActive] = useState(false);
  const [effectsIntensity, setEffectsIntensity] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) {
        setEffectsIntensity(0);
        return;
      }
      const progress = window.scrollY / docHeight;
      setEffectsIntensity(parallaxIntensity(progress));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepStrikeAt((i) => (i + 1) % STEP_STRIKE_ORDER.length);
      setStrikeActive(true);
    }, STRIKE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!strikeActive) return;
    const t = setTimeout(() => setStrikeActive(false), STRIKE_DURATION_MS);
    return () => clearTimeout(t);
  }, [strikeActive, stepStrikeAt]);

  const currentStrike = strikeActive ? STEP_STRIKE_ORDER[stepStrikeAt] : null;
  const struckStepIndex = currentStrike?.stepIndex ?? null;
  const struckDigitIndex = currentStrike?.digitIndex ?? null;

  return (
    <div className="page-home">
      {/* Page-wide ambient effects: heat, vignette, embers (intensity ramps with scroll) */}
      <div
        className="page-home-effects"
        aria-hidden
        style={{ ['--effects-intensity' as string]: effectsIntensity }}
      >
        <div className="page-heat-gradient" />
        <div className="page-heat-vignette" />
        <div className="cta-heat-shimmer" />
        {[...Array(80)].map((_, i) => {
          const drift = (i % 3) + 1;
          const isSmoke = i % 5 === 0;
          const left = 8 + ((i * 37 + 13) % 84);
          const bottomOffset = (i * 19 + 7) % 18;
          const duration = 7 + (i % 5);
          const delay = (i * 0.15 + (i % 4) * 1.2) % 9;
          return (
            <span
              key={i}
              className={`ember-particle ember-drift-${drift} ${isSmoke ? "ember-smoke" : ""}`}
              style={{
                left: `${left}%`,
                bottom: `${bottomOffset}%`,
                ["--ember-duration" as string]: `${duration}s`,
                ["--ember-delay" as string]: `${delay}s`,
              }}
            />
          );
        })}
      </div>

      {/* Hero */}
      <section className="section-hero overflow-hidden">
        {/* Hero particles: subtle floating embers for attention (always visible at top) */}
        <div className="hero-particles" aria-hidden>
          {[...Array(24)].map((_, i) => {
            const left = 5 + ((i * 47 + 11) % 90);
            const topStart = (i * 23 + 7) % 60;
            const duration = 12 + (i % 6);
            const delay = (i * 0.8 + (i % 3) * 2) % 8;
            return (
              <span
                key={i}
                className="hero-ember"
                style={{
                  left: `${left}%`,
                  top: `${topStart}%`,
                  ["--hero-duration" as string]: `${duration}s`,
                  ["--hero-delay" as string]: `${delay}s`,
                }}
              />
            );
          })}
        </div>
        <div className="container-custom relative z-10 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-0 items-center">
            {/* Left: Copy - ~5/12 so 3D dominates */}
            <div className="lg:col-span-5 max-w-xl relative z-10">
              <p className="text-label mb-3 animate-fade-in">
                Your forge for 3D on Solana
              </p>
              <h1 className="hero-heading-single text-gray-900 dark:text-gray-100 mb-5 animate-slide-up">
                <ForgeWord />
              </h1>
              <p className="text-body-lg text-gray-600 dark:text-gray-400 max-w-lg mb-8 animate-slide-up animation-delay-100">
                Create and sell 3D avatars and models. Launch timed sales or sell
                one-of-a-kind pieces. Share earnings with collaborators. Upload
                your 3D files — we support standard formats. No platform fees.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 animate-slide-up animation-delay-200">
                <Link
                  href="/create"
                  className="btn-hero-primary text-center"
                >
                  Start Forging
                </Link>
                <Link
                  href="/create-drop"
                  className="btn-ghost text-center"
                >
                  Launch Drop
                </Link>
              </div>
            </div>

            {/* Right: 3D Model - ~7/12, full height on desktop */}
            <div className="lg:col-span-7 relative lg:min-h-[75vh] flex items-center justify-center">
              <HeroModel />
            </div>
          </div>
        </div>
      </section>

      {/* What you can forge */}
      <section className="section-forge border-t border-gray-300 dark:border-gray-700 relative">
        <div className="container-custom section-padding relative z-10">
          <p className="text-label mb-4">What you can forge</p>
          <h2 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-16">
            Built for 3D creators
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
            <div
              className="card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 animate-slide-up flex flex-row items-stretch gap-6 p-6 md:p-8"
              onMouseEnter={() => setGlbCardHover(true)}
              onMouseLeave={() => setGlbCardHover(false)}
              role="presentation"
            >
              <div className="card-forge-heat-shimmer" aria-hidden />
              <span className="card-spark card-spark-tl" aria-hidden />
              <span className="card-spark card-spark-tr" aria-hidden />
              <span className="card-spark card-spark-bl" aria-hidden />
              <span className="card-spark card-spark-br" aria-hidden />
              <div className="relative z-10 flex flex-row items-center gap-6 flex-1 min-w-0">
                <CardAnvilModel isHovering={glbCardHover} />
                <div>
                  <h3 className="text-body-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
                    GLB 3D Models
                  </h3>
                  <p className="text-body text-gray-500 dark:text-gray-400">
                    Upload 3D models — characters, props, wearables. Preview them
                    in an interactive viewer right in your browser before you
                    list them for sale.
                  </p>
                </div>
              </div>
            </div>

            <div
              className="card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 animate-slide-up animation-delay-100 flex flex-row items-stretch gap-6 p-6 md:p-8"
              onMouseEnter={() => setVrmCardHover(true)}
              onMouseLeave={() => setVrmCardHover(false)}
              role="presentation"
            >
              <div className="card-forge-heat-shimmer" aria-hidden />
              <span className="card-spark card-spark-tl" aria-hidden />
              <span className="card-spark card-spark-tr" aria-hidden />
              <span className="card-spark card-spark-bl" aria-hidden />
              <span className="card-spark card-spark-br" aria-hidden />
              <div className="relative z-10 flex flex-row items-center gap-6 flex-1 min-w-0">
                <CardVRMModel isHovering={vrmCardHover} />
                <div>
                  <h3 className="text-body-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
                    VRM Avatars
                  </h3>
                  <p className="text-body text-gray-500 dark:text-gray-400">
                    Avatars that work across games, VR, and virtual worlds. We
                    read the model data automatically — license info, expressions,
                    and rigging. Ready to use anywhere.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For collectors */}
      <section className="section-forge border-t border-gray-300 dark:border-gray-700 relative">
        <div className="container-custom section-padding relative z-10">
          <p className="text-label mb-4">For collectors</p>
          <h2 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4">
            Secret drops, straight from the creator
          </h2>
          <p className="text-body text-gray-500 dark:text-gray-400 mb-12 max-w-2xl">
            When artists share a link, that&apos;s your invite. Limited drops,
            early access, or stuff just for their community — no feed, no
            algorithm. Mint, own the asset, use it in games and VR.
          </p>

          <Link
            href="/about"
            className="group card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 flex flex-row items-center gap-6 p-6 md:p-8 animate-slide-up"
          >
            <div className="card-forge-heat-shimmer" aria-hidden />
            <span className="card-spark card-spark-tl" aria-hidden />
            <span className="card-spark card-spark-tr" aria-hidden />
            <span className="card-spark card-spark-bl" aria-hidden />
            <span className="card-spark card-spark-br" aria-hidden />
            <div className="relative z-10 flex flex-row items-center gap-6 flex-1 min-w-0">
              <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center bg-orange-400/10 text-orange-400 rounded-xl [&_svg]:w-15 [&_svg]:h-15">
                <svg fill="currentColor" viewBox="0 0 490.002 490.002" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <g>
                    <path d="M138.447,111.457c28.471,28.347,66.324,43.958,106.579,43.958c40.245,0,78.098-15.611,106.57-43.958l26.627-26.518c2.13-1.766,5.655-8.603,0-14.465l-26.627-26.512c-28.472-28.348-66.324-43.959-106.57-43.959c-40.256,0-78.108,15.611-106.579,43.959l-26.627,26.512c-5.592,6.236-1.924,12.551,0,14.465L138.447,111.457z M152.862,58.427c24.613-24.509,57.342-38.008,92.164-38.008c34.812,0,67.54,13.499,92.154,38.008l19.37,19.279l-19.37,19.286c-24.613,24.509-57.341,38.007-92.154,38.007c-34.822,0-67.551-13.498-92.164-38.007l-19.37-19.286L152.862,58.427z"/>
                    <path d="M245.026,118.78c22.72,0,41.202-18.423,41.202-41.073c0-22.644-18.482-41.067-41.202-41.067s-41.202,18.423-41.202,41.067C203.824,100.357,222.306,118.78,245.026,118.78z M245.026,57.056c11.464,0,20.785,9.266,20.785,20.65c0,11.391-9.321,20.657-20.785,20.657c-11.464,0-20.785-9.266-20.785-20.657C224.241,66.322,233.562,57.056,245.026,57.056z"/>
                    <path d="M489.079,312.095l-45.011-97.122c-0.004-0.009-0.008-0.018-0.012-0.027l-0.007-0.015c0,0-0.002-0.001-0.002-0.002c-1.38-2.96-4.15-5.212-7.615-5.78l-189.762-31.054c-0.11-0.018-1.658-0.287-3.352,0.01l-189.71,31.044c-3.339,0.548-6.19,2.711-7.617,5.782l-45.02,97.164c-4.072,10.052,5.727,14.918,9.261,14.5h34.813v122.145c0,5,3.628,9.266,8.563,10.074l189.618,31.028c1.799,0.351,3.585,0.003,3.597,0l189.608-31.029c4.935-0.808,8.564-5.074,8.564-10.074V326.595h34.822C490.838,325.911,490.981,315.477,489.079,312.095z M26.214,306.178l36.028-77.753l167.45-27.4l-36.935,105.154H26.214z M234.818,467.782L65.463,440.068V326.595h134.533c4.336,0,8.194-2.737,9.629-6.824l25.192-71.729V467.782z M424.579,440.068l-169.345,27.714V248.054l25.182,71.717c1.435,4.087,5.294,6.824,9.63,6.824h134.533V440.068z M297.283,306.178l-36.925-105.154l167.44,27.4l36.038,77.753H297.283z"/>
                  </g>
                </svg>
              </div>
              <div>
                <h3 className="text-body-lg font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-orange-400 transition-colors">
                  Got a link? That&apos;s the good stuff
                </h3>
                <p className="text-body text-gray-500 dark:text-gray-400">
                  Open the drop or collection your creator shared. Preview the
                  3D, mint, and it&apos;s yours — ready for VR, games, and
                  virtual worlds.
                </p>
              </div>
              <svg className="w-6 h-6 text-gray-400 group-hover:text-orange-400 group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="section-forge border-t border-gray-300 dark:border-gray-700 relative">
        <div className="container-custom section-padding relative z-10">
          <p className="text-label mb-4">How it works</p>
          <h2 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4">
            Three steps to launch
          </h2>
          <p className="text-body text-gray-500 dark:text-gray-400 mb-16 max-w-2xl">
            Sell one-of-a-kind pieces or timed releases. Set prices, early access
            lists, and member-only perks. Simple setup.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 relative">
            {/* Connecting line: starts at 0 of 01, ends between 0 and 3 of 03 */}
            <div className="hidden md:block absolute top-[4.5rem] left-0 right-[30%] h-0.5 pointer-events-none step-line-wrapper">
              <div className="step-line" aria-hidden />
            </div>

            <div className="step-item relative animate-slide-up">
              <div className="flex items-center gap-4 mb-4">
                <ForgeStepNumber value="01" stepIndex={0} struckStepIndex={struckStepIndex} struckDigitIndex={struckDigitIndex} />
                <svg className="w-8 h-8 text-gray-900 dark:text-gray-100 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12a2.25 2.25 0 012.25-2.25h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </div>
              <h3 className="text-body-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                Create a collection or launch
              </h3>
              <p className="text-body text-gray-500 dark:text-gray-400">
                Start with a name and cover image. Choose one-of-a-kind or
                unlimited supply. Set your price and you&apos;re ready to go.
              </p>
            </div>

            <div className="step-item relative animate-slide-up animation-delay-100">
              <div className="flex items-center gap-4 mb-4">
                <ForgeStepNumber value="02" stepIndex={1} struckStepIndex={struckStepIndex} struckDigitIndex={struckDigitIndex} />
                <svg className="w-8 h-8 text-gray-900 dark:text-gray-100 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <h3 className="text-body-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                Upload your 3D file
              </h3>
              <p className="text-body text-gray-500 dark:text-gray-400">
                Drag and drop your 3D model. We detect the details automatically.
                Files are stored permanently — they won&apos;t disappear.
              </p>
            </div>

            <div className="step-item relative animate-slide-up animation-delay-200">
              <div className="flex items-center gap-4 mb-4">
                <ForgeStepNumber value="03" stepIndex={2} struckStepIndex={struckStepIndex} struckDigitIndex={struckDigitIndex} />
                <svg className="w-8 h-8 text-gray-900 dark:text-gray-100 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
              </div>
              <h3 className="text-body-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                List it for sale
              </h3>
              <p className="text-body text-gray-500 dark:text-gray-400">
                Go live. Your 3D asset is listed for sale — usually costs less
                than a coffee. Buyers can preview it right in the browser.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Features */}
      <section className="section-forge border-t border-gray-300 dark:border-gray-700 relative">
        <div className="container-custom section-padding relative z-10">
          <p className="text-label mb-4">Platform</p>
          <h2 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-16">
            Everything you need to launch
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Drops */}
            <Link
              href="/create-drop"
              className="group card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 p-6 animate-slide-up"
            >
              <div className="card-forge-heat-shimmer" aria-hidden />
              <span className="card-spark card-spark-tl" aria-hidden />
              <span className="card-spark card-spark-br" aria-hidden />
              <div className="relative z-10">
                <div className="w-10 h-10 flex items-center justify-center mb-4 bg-orange-400/10 text-orange-400 rounded-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-orange-400 transition-colors">
                  Timed sales
                </h3>
                <p className="text-caption text-gray-500 dark:text-gray-400 leading-relaxed">
                  Run timed sales — limited or unlimited supply. Early access
                  lists, member-only perks. All built-in.
                </p>
              </div>
            </Link>

            {/* Open Mints & Collections */}
            <Link
              href="/create-collection"
              className="group card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 p-6 animate-slide-up animation-delay-100"
            >
              <div className="card-forge-heat-shimmer" aria-hidden />
              <span className="card-spark card-spark-tl" aria-hidden />
              <span className="card-spark card-spark-br" aria-hidden />
              <div className="relative z-10">
                <div className="w-10 h-10 flex items-center justify-center mb-4 bg-orange-400/10 text-orange-400 rounded-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-orange-400 transition-colors">
                  Sell anytime
                </h3>
                <p className="text-caption text-gray-500 dark:text-gray-400 leading-relaxed">
                  Custom sales pages with your price, supply, and schedule. Share
                  your link — payments go straight to you.
                </p>
              </div>
            </Link>

            {/* Revenue Splits */}
            <Link
              href="/create-drop"
              className="group card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 p-6 animate-slide-up animation-delay-200"
            >
              <div className="card-forge-heat-shimmer" aria-hidden />
              <span className="card-spark card-spark-tl" aria-hidden />
              <span className="card-spark card-spark-br" aria-hidden />
              <div className="relative z-10">
                <div className="w-10 h-10 flex items-center justify-center mb-4 bg-orange-400/10 text-orange-400 rounded-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </div>
                <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-orange-400 transition-colors">
                  Split earnings
                </h3>
                <p className="text-caption text-gray-500 dark:text-gray-400 leading-relaxed">
                  Split earnings and royalties with collaborators. Build
                  collections together with your crew.
                </p>
              </div>
            </Link>

            {/* Discover – disabled for launch; card points to Create for now */}
            <Link
              href="/create"
              className="group card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 p-6 animate-slide-up animation-delay-300"
            >
              <div className="card-forge-heat-shimmer" aria-hidden />
              <span className="card-spark card-spark-tl" aria-hidden />
              <span className="card-spark card-spark-br" aria-hidden />
              <div className="relative z-10">
                <div className="w-10 h-10 flex items-center justify-center mb-4 bg-orange-400/10 text-orange-400 rounded-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-orange-400 transition-colors">
                  Create
                </h3>
                <p className="text-caption text-gray-500 dark:text-gray-400 leading-relaxed">
                  Start a collection or timed drop. Set your price and share
                  your link — payments go straight to you.
                </p>
              </div>
            </Link>

            {/* Creator Profiles */}
            <div
              className="group card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 p-6 animate-slide-up animation-delay-300"
            >
              <div className="card-forge-heat-shimmer" aria-hidden />
              <span className="card-spark card-spark-tl" aria-hidden />
              <span className="card-spark card-spark-br" aria-hidden />
              <div className="relative z-10">
                <div className="w-10 h-10 flex items-center justify-center mb-4 bg-orange-400/10 text-orange-400 rounded-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Creator Profiles
                </h3>
                <p className="text-caption text-gray-500 dark:text-gray-400 leading-relaxed">
                  Every creator gets a public profile: collections, creations,
                  stats. Share your portfolio with anyone.
                </p>
              </div>
            </div>

            {/* Analytics */}
            <div
              className="group card-forge relative bg-gray-50/80 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/30 p-6 animate-slide-up animation-delay-300"
            >
              <div className="card-forge-heat-shimmer" aria-hidden />
              <span className="card-spark card-spark-tl" aria-hidden />
              <span className="card-spark card-spark-br" aria-hidden />
              <div className="relative z-10">
                <div className="w-10 h-10 flex items-center justify-center mb-4 bg-orange-400/10 text-orange-400 rounded-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <h3 className="text-body font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Analytics
                </h3>
                <p className="text-caption text-gray-500 dark:text-gray-400 leading-relaxed">
                  See how many you&apos;ve sold, who owns them, and who your top
                  collectors are. All updated live.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="section-forge border-t border-gray-300 dark:border-gray-700 relative">
        <div className="container-custom section-padding relative z-10">
          <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-4">
            <div className="stat-item flex-1 text-center min-w-0">
              <div className="stat-glow rounded-full -z-10" aria-hidden />
              <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 mb-2">
                <p className="text-4xl md:text-5xl font-bold font-mono text-gray-900 dark:text-gray-100">
                  $0
                </p>
              </div>
              <p className="text-body text-gray-500 dark:text-gray-400">
                Platform fees
              </p>
            </div>

            <div className="hidden lg:block stat-divider flex-shrink-0" aria-hidden />

            <div className="stat-item flex-1 text-center min-w-0">
              <div className="stat-glow rounded-full -z-10" aria-hidden />
              <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 mb-2">
                <StatAnvilModel />
                <p className="text-4xl md:text-5xl font-bold font-mono text-gray-900 dark:text-gray-100">
                  3D
                </p>
              </div>
              <p className="text-body text-gray-500 dark:text-gray-400">
                Interactive viewer
              </p>
            </div>

            <div className="hidden lg:block stat-divider flex-shrink-0" aria-hidden />

            <div className="stat-item flex-1 text-center min-w-0">
              <div className="stat-glow rounded-full -z-10" aria-hidden />
              <div className="flex items-center justify-center gap-3 md:gap-4 mb-2">
                <IconGLB className="w-8 h-8 text-gray-900 dark:text-gray-100" aria-hidden />
                <span className="text-gray-500 dark:text-gray-400 font-medium">/</span>
                <IconVRM className="w-8 h-8 text-gray-900 dark:text-gray-100" aria-hidden />
              </div>
              <p className="text-body text-gray-500 dark:text-gray-400">
                Supported formats
              </p>
            </div>

            <div className="hidden lg:block stat-divider flex-shrink-0" aria-hidden />

            <div className="stat-item flex-1 text-center min-w-0">
              <div className="stat-glow rounded-full -z-10" aria-hidden />
              <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 mb-2">
                <SolanaIcon className="w-8 h-8 text-gray-900 dark:text-gray-100 flex-shrink-0" ariaHidden />
                <p className="text-4xl md:text-5xl font-bold font-mono text-gray-900 dark:text-gray-100">
                  SOL
                </p>
              </div>
              <p className="text-body text-gray-500 dark:text-gray-400">
                Solana powered
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-forge section-cta-forge border-t border-gray-300 dark:border-gray-700 relative">
        <div className="container-custom section-padding text-center relative z-10">
          <h2 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6">
            Ready to forge?
          </h2>
          <p className="text-body-lg text-gray-500 dark:text-gray-400 mb-8 max-w-xl mx-auto">
            Connect your wallet, create a collection or launch a sale, and start
            selling your 3D work. It takes less than a minute.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/create" className="btn-forge-cta inline-block">
              Start Forging
            </Link>
            <Link
              href="/create-drop"
              className="btn-ghost inline-block text-center !py-3 !px-8"
            >
              Launch Drop
            </Link>
            <Link
              href="/create"
              className="btn-ghost inline-block text-center !py-3 !px-8"
            >
              Create
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
