'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { MintPhaseConfig } from '@/lib/types/mintConfig';

function shortenAddress(addr: string, chars = 4): string {
  if (!addr || addr.length < chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

interface AllowlistModalProps {
  open: boolean;
  onClose: () => void;
  /** Connected wallet address (for highlighting in the list & token verification) */
  walletAddress?: string | null;
  /** Single-phase: allowlist addresses */
  allowlistAddresses?: string[];
  /** Single-phase: token holder mint addresses */
  tokenHolderMints?: string[];
  /** Multi-phase: phases with their own access rules */
  phases?: MintPhaseConfig[];
  /** Index of the phase currently active (for default tab selection) */
  currentPhaseIndex?: number | null;
  /** Explorer base URL for linking tokens */
  explorerUrl?: string;
  /** Solana network for explorer links */
  network?: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-1.5 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors flex-shrink-0"
      title="Copy address"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

function AllowlistSection({
  addresses,
  walletAddress,
  search,
}: {
  addresses: string[];
  walletAddress?: string | null;
  search: string;
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return addresses;
    const q = search.trim().toLowerCase();
    return addresses.filter((a) => a.toLowerCase().includes(q));
  }, [addresses, search]);

  const walletLower = walletAddress?.toLowerCase();
  const isOnList = walletLower ? addresses.some((a) => a.toLowerCase() === walletLower) : false;

  return (
    <div className="space-y-3">
      {walletAddress && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
            isOnList
              ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
          }`}
        >
          {isOnList ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span className="font-medium">
            {isOnList ? 'Your wallet is on the allowlist' : 'Your wallet is not on the allowlist'}
          </span>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {filtered.length === addresses.length
          ? `${addresses.length} address${addresses.length === 1 ? '' : 'es'}`
          : `${filtered.length} of ${addresses.length} shown`}
      </p>

      <div className="max-h-64 overflow-y-auto space-y-0.5 -mx-1 px-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
            {search.trim() ? 'No addresses match your search' : 'No addresses'}
          </p>
        ) : (
          filtered.map((addr, i) => {
            const isYou = walletLower && addr.toLowerCase() === walletLower;
            return (
              <div
                key={`${addr}-${i}`}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm font-mono ${
                  isYou
                    ? 'bg-orange-400/10 border border-orange-400/20'
                    : i % 2 === 0
                      ? 'bg-gray-50/50 dark:bg-gray-800/30'
                      : ''
                }`}
              >
                <span className="text-gray-400 dark:text-gray-500 text-xs w-6 text-right flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-gray-800 dark:text-gray-200 truncate flex-1 min-w-0" title={addr}>
                  {addr}
                </span>
                {isYou && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-orange-400/20 text-orange-500 dark:text-orange-400 font-semibold rounded flex-shrink-0">
                    YOU
                  </span>
                )}
                <CopyButton text={addr} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TokenHolderSection({
  tokenMints,
  walletAddress,
  explorerUrl,
  network,
}: {
  tokenMints: string[];
  walletAddress?: string | null;
  explorerUrl?: string;
  network?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Holders of any of these tokens can mint:
      </p>
      <div className="space-y-2">
        {tokenMints.map((mint, i) => (
          <div
            key={`${mint}-${i}`}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200/40 dark:border-gray-700/40 bg-gray-50/50 dark:bg-gray-800/30"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400/20 to-blue-400/20 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <span className="font-mono text-sm text-gray-800 dark:text-gray-200 truncate flex-1 min-w-0" title={mint}>
              {shortenAddress(mint, 6)}
            </span>
            <CopyButton text={mint} />
            {explorerUrl && (
              <a
                href={`${explorerUrl}/address/${mint}?cluster=${network || 'mainnet-beta'}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded text-gray-400 hover:text-orange-400 hover:bg-orange-400/10 transition-colors flex-shrink-0"
                title="View on Explorer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        ))}
      </div>
      {walletAddress && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          If you hold any of these tokens, your wallet will be verified on-chain when you mint.
          If minting fails, check that your wallet ({shortenAddress(walletAddress, 4)}) holds at least one of the listed tokens.
        </p>
      )}
    </div>
  );
}

function PhaseAccessContent({
  phase,
  phaseIndex,
  walletAddress,
  search,
  explorerUrl,
  network,
}: {
  phase: MintPhaseConfig;
  phaseIndex: number;
  walletAddress?: string | null;
  search: string;
  explorerUrl?: string;
  network?: string;
}) {
  const hasAllowlist = (phase.allowlistAddresses?.length ?? 0) > 0;
  const hasTokenGate = (phase.tokenHolderMints?.length ?? 0) > 0;
  const isPublic = (phase.access || 'anyone') === 'anyone' && !hasAllowlist && !hasTokenGate;

  if (isPublic) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Anyone can mint this phase — no restrictions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasTokenGate && (
        <TokenHolderSection
          tokenMints={phase.tokenHolderMints!}
          walletAddress={walletAddress}
          explorerUrl={explorerUrl}
          network={network}
        />
      )}
      {hasAllowlist && (
        <AllowlistSection
          addresses={phase.allowlistAddresses!}
          walletAddress={walletAddress}
          search={search}
        />
      )}
    </div>
  );
}

export function AllowlistModal({
  open,
  onClose,
  walletAddress,
  allowlistAddresses,
  tokenHolderMints,
  phases,
  currentPhaseIndex,
  explorerUrl,
  network,
}: AllowlistModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [activePhase, setActivePhase] = useState<number>(currentPhaseIndex ?? 0);

  useEffect(() => {
    if (open) {
      setSearch('');
      setActivePhase(currentPhaseIndex ?? 0);
    }
  }, [open, currentPhaseIndex]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  if (!open) return null;

  const hasPhases = phases && phases.length > 0;
  const hasCustomPhases = hasPhases && phases.some(
    (p) => (p.access || 'anyone') === 'custom' || (p.allowlistAddresses?.length ?? 0) > 0 || (p.tokenHolderMints?.length ?? 0) > 0,
  );

  const showSearch = hasPhases
    ? (phases[activePhase]?.allowlistAddresses?.length ?? 0) > 0
    : (allowlistAddresses?.length ?? 0) > 0;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="allowlist-modal-title"
    >
      <div className="w-full max-w-md border border-gray-300/40 dark:border-gray-700/60 rounded-2xl shadow-2xl overflow-hidden bg-[var(--background)] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-200/40 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2
              id="allowlist-modal-title"
              className="text-base font-bold text-gray-900 dark:text-gray-100"
            >
              Who can mint?
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {hasPhases
              ? 'This drop has multiple phases with different access rules.'
              : 'View the addresses and tokens allowed to mint.'}
          </p>

          {/* Search bar */}
          {showSearch && (
            <div className="relative mt-3">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by wallet address…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-gray-100/50 dark:bg-gray-800/50 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400/40"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Phase tabs */}
          {hasPhases && phases.length > 1 && (
            <div className="flex flex-nowrap gap-0 border-b border-gray-200/30 dark:border-gray-700/20 mt-3 overflow-x-auto min-w-0">
              {phases.map((phase, i) => {
                const isCustom = (phase.access || 'anyone') === 'custom'
                  || (phase.allowlistAddresses?.length ?? 0) > 0
                  || (phase.tokenHolderMints?.length ?? 0) > 0;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setActivePhase(i); setSearch(''); }}
                    className={`flex-shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                      activePhase === i
                        ? 'border-orange-400 text-orange-600 dark:text-orange-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Phase {i + 1}
                    {isCustom && (
                      <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          {hasPhases ? (
            <PhaseAccessContent
              phase={phases[activePhase] ?? phases[0]}
              phaseIndex={activePhase}
              walletAddress={walletAddress}
              search={search}
              explorerUrl={explorerUrl}
              network={network}
            />
          ) : (
            <div className="space-y-4">
              {(tokenHolderMints?.length ?? 0) > 0 && (
                <TokenHolderSection
                  tokenMints={tokenHolderMints!}
                  walletAddress={walletAddress}
                  explorerUrl={explorerUrl}
                  network={network}
                />
              )}
              {(allowlistAddresses?.length ?? 0) > 0 && (
                <AllowlistSection
                  addresses={allowlistAddresses!}
                  walletAddress={walletAddress}
                  search={search}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200/40 dark:border-gray-800 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-lg border border-gray-200/50 dark:border-gray-700/50 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-700/30 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
