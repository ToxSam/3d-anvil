'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { SolanaIcon } from '@/components/SolanaIcon';
import {
  estimateDropRent,
  estimateCollectionRent,
  estimateMintRent,
} from '@/lib/transactionUtils';

// ── Public types ─────────────────────────────────────────────────────────────

export interface TxLineItem {
  label: string;
  sublabel?: string;
  value: string;
  /** Render a SOL icon next to the value */
  solIcon?: boolean;
  /** Smaller / muted styling (e.g. network fee) */
  muted?: boolean;
  /** Bold styling (e.g. total row) */
  bold?: boolean;
  /** Custom className on the value (e.g. green for "Free") */
  valueClassName?: string;
}

export interface TxWarning {
  type: 'info' | 'warning';
  title?: string;
  message: ReactNode;
}

export interface TransactionConfirmProps {
  open: boolean;
  /** Modal heading, e.g. "Confirm Mint" */
  title: string;
  /** Short helper text below heading */
  description: string;
  /** Optional badge next to title (e.g. phase name) */
  badge?: string;
  /** Cost / detail rows */
  lineItems: TxLineItem[];
  /** Warning or info banners between header and body */
  warnings?: TxWarning[];
  /** Wallet simulation note shown at the bottom of body */
  walletNote?: string;
  /** Primary action label */
  confirmLabel: string;
  /** Cancel label (default "Cancel") */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// ── Helpers to build common transaction details ──────────────────────────────

export function buildMintTransaction(opts: {
  collectionName: string;
  price: number;
  phaseName?: string;
  requiresAllowlistProof?: boolean;
  isCandyMachine?: boolean;
}): Omit<TransactionConfirmProps, 'open' | 'onConfirm' | 'onCancel'> {
  const { collectionName, price, phaseName, requiresAllowlistProof } = opts;
  const isFree = price === 0;
  const { rentSol } = estimateMintRent({ isCandyMachine: opts.isCandyMachine });
  const totalSol = price + rentSol;

  const lineItems: TxLineItem[] = [
    { label: 'Collection', value: collectionName },
    { label: 'You receive', value: '1 NFT' },
    isFree
      ? { label: 'Mint price', value: 'Free', valueClassName: 'text-green-600 dark:text-green-400' }
      : { label: 'Mint price', value: `${price.toFixed(price % 1 === 0 ? 1 : 4)} SOL`, solIcon: true },
    {
      label: 'Account rent',
      sublabel: '(est.)',
      value: `~${rentSol.toFixed(4)} SOL`,
      solIcon: true,
      muted: true,
    },
    {
      label: 'Total (max)',
      value: `~${totalSol.toFixed(isFree ? 3 : 4)} SOL`,
      solIcon: true,
      bold: true,
    },
  ];

  const warnings: TxWarning[] = [];
  if (requiresAllowlistProof) {
    warnings.push({
      type: 'warning',
      title: '2 wallet approvals required',
      message: (
        <ol className="text-xs text-amber-600 dark:text-amber-500 space-y-0.5 list-none">
          <li className="flex items-start gap-1.5">
            <span className="font-bold shrink-0">1.</span>
            <span>Allowlist proof — verifies your spot. Your wallet may show <em>&quot;No balance changes&quot;</em> — that&rsquo;s normal, it&rsquo;s free.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="font-bold shrink-0">2.</span>
            <span>Mint transaction — this is where the SOL is charged.</span>
          </li>
        </ol>
      ),
    });
  }

  return {
    title: 'Confirm Mint',
    description: 'Review the cost before approving in your wallet.',
    badge: phaseName,
    lineItems,
    warnings,
    walletNote: "Your wallet's preview may not show the exact mint price — the amounts above are what will actually be charged on-chain.",
    confirmLabel: isFree ? 'Mint Free' : `Mint for ${price.toFixed(price % 1 === 0 ? 1 : 4)} SOL`,
  };
}

export function buildSaveSettingsTransaction(): Omit<TransactionConfirmProps, 'open' | 'onConfirm' | 'onCancel'> {
  const txFee = 0.000005;
  return {
    title: 'Update On-Chain Rules',
    description: 'This will send a transaction to update your drop\'s mint rules (price, dates, allowlist, etc.) on the Solana blockchain.',
    lineItems: [
      { label: 'Action', value: 'Update Candy Guard' },
      {
        label: 'Network fee',
        sublabel: '(est.)',
        value: `~${txFee} SOL`,
        solIcon: true,
        muted: true,
      },
      {
        label: 'Total (max)',
        value: `~${txFee} SOL`,
        solIcon: true,
        bold: true,
      },
    ],
    walletNote: 'This updates on-chain guard settings only. No NFTs will be minted.',
    confirmLabel: 'Confirm & Save',
  };
}

export function buildCreateDropTransaction(opts: {
  collectionName: string;
  price: number;
  storageCostSol?: number | null;
  hasGuardGroups?: boolean;
}): Omit<TransactionConfirmProps, 'open' | 'onConfirm' | 'onCancel'> {
  const isFree = opts.price === 0;
  const { rentSol, breakdown: rentBreakdown } = estimateDropRent({ hasGuardGroups: opts.hasGuardGroups });
  const storageCost = opts.storageCostSol ?? 0;
  const totalEstimate = rentSol + storageCost;

  const storageLine: TxLineItem | null =
    opts.storageCostSol != null
      ? {
          label: 'Arweave storage',
          sublabel: '(est.)',
          value: `~${opts.storageCostSol < 0.0001 ? '<0.0001' : opts.storageCostSol.toFixed(4)} SOL`,
          solIcon: true,
        }
      : null;

  const lineItems: TxLineItem[] = [
    { label: 'Collection', value: opts.collectionName },
    isFree
      ? { label: 'Mint price', value: 'Free', valueClassName: 'text-green-600 dark:text-green-400' }
      : { label: 'Mint price', value: `${opts.price} SOL`, solIcon: true },
    ...(storageLine ? [storageLine] : []),
    {
      label: 'Solana rent',
      sublabel: '(est.)',
      value: `~${rentSol.toFixed(4)} SOL`,
      solIcon: true,
      muted: true,
    },
    { label: 'Transactions', value: opts.hasGuardGroups ? '3–4 approvals' : '2–3 approvals' },
    {
      label: 'Total cost',
      sublabel: '(est.)',
      value: `~${totalEstimate.toFixed(4)} SOL`,
      solIcon: true,
      bold: true,
    },
  ];

  return {
    title: 'Launch Drop',
    description: 'This will create your collection and Candy Machine on the Solana blockchain.',
    lineItems,
    warnings: [{
      type: 'info',
      message: `Solana rent (${rentBreakdown.map((b) => `${b.label}: ~${b.sol} SOL`).join(', ')}) is a one-time deposit to keep accounts alive on-chain.`,
    }],
    walletNote: 'Do not close the tab until all steps complete.',
    confirmLabel: 'Launch Drop',
  };
}

export function buildCreateCollectionTransaction(opts: {
  collectionName: string;
}): Omit<TransactionConfirmProps, 'open' | 'onConfirm' | 'onCancel'> {
  const { rentSol } = estimateCollectionRent();
  return {
    title: 'Create Collection',
    description: 'This will create a new collection on the Solana blockchain. You will need to approve the transaction in your wallet.',
    lineItems: [
      { label: 'Collection', value: opts.collectionName },
      { label: 'Transactions', value: '1–2 approvals' },
      {
        label: 'Solana rent',
        sublabel: '(est.)',
        value: `~${rentSol.toFixed(4)} SOL`,
        solIcon: true,
        muted: true,
      },
      {
        label: 'Total cost',
        sublabel: '(est.)',
        value: `~${rentSol.toFixed(4)} SOL`,
        solIcon: true,
        bold: true,
      },
    ],
    walletNote: 'Your wallet will ask you to approve the on-chain collection creation.',
    confirmLabel: 'Create Collection',
  };
}

export function buildUpdateCollectionTransaction(): Omit<TransactionConfirmProps, 'open' | 'onConfirm' | 'onCancel'> {
  const txFee = 0.000005;
  return {
    title: 'Update Collection',
    description: 'This will update your collection\'s on-chain metadata (image, settings, royalties). You\'ll need to approve the transaction in your wallet.',
    lineItems: [
      { label: 'Action', value: 'Update metadata' },
      {
        label: 'Network fee',
        sublabel: '(est.)',
        value: `~${txFee} SOL`,
        solIcon: true,
        muted: true,
      },
    ],
    walletNote: 'Your wallet will ask you to approve the on-chain metadata update.',
    confirmLabel: 'Confirm & Save',
  };
}

export function buildMintNftTransaction(opts: {
  collectionName: string;
  quantity: number;
  storageCostSol?: number | null;
}): Omit<TransactionConfirmProps, 'open' | 'onConfirm' | 'onCancel'> {
  const multi = opts.quantity > 1;
  const { rentSol } = estimateMintRent({ quantity: opts.quantity });
  const storageCost = opts.storageCostSol ?? 0;
  const totalEstimate = rentSol + storageCost;

  const storageLine: TxLineItem | null =
    opts.storageCostSol != null
      ? {
          label: 'Arweave storage',
          sublabel: '(est.)',
          value: `~${opts.storageCostSol < 0.0001 ? '<0.0001' : opts.storageCostSol.toFixed(4)} SOL`,
          solIcon: true,
        }
      : null;

  return {
    title: multi ? `Mint ${opts.quantity} NFTs` : 'Mint NFT',
    description: `This will create ${multi ? `${opts.quantity} NFTs` : 'an NFT'} in the "${opts.collectionName}" collection on Solana.`,
    lineItems: [
      { label: 'Collection', value: opts.collectionName },
      { label: 'Quantity', value: `${opts.quantity}` },
      ...(storageLine ? [storageLine] : []),
      {
        label: 'Solana rent',
        sublabel: '(est.)',
        value: `~${rentSol.toFixed(4)} SOL`,
        solIcon: true,
        muted: true,
      },
      { label: 'Transactions', value: multi ? `${opts.quantity * 2}–${opts.quantity * 3} approvals` : '2–3 approvals' },
      {
        label: 'Total cost',
        sublabel: '(est.)',
        value: `~${totalEstimate.toFixed(4)} SOL`,
        solIcon: true,
        bold: true,
      },
    ],
    warnings: multi ? [{
      type: 'info',
      message: `Minting ${opts.quantity} NFTs requires multiple wallet approvals. Each NFT needs a separate creation and verification transaction.`,
    }] : undefined,
    walletNote: 'Do not close the tab until all steps complete.',
    confirmLabel: multi ? `Mint ${opts.quantity} NFTs` : 'Mint NFT',
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function TransactionConfirmModal({
  open,
  title,
  description,
  badge,
  lineItems,
  warnings,
  walletNote,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: TransactionConfirmProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onCancel();
  }

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-confirm-title"
    >
      <div className="w-full max-w-sm border border-gray-300/40 dark:border-gray-700/60 rounded-2xl shadow-2xl overflow-hidden bg-[var(--background)]">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-200/40 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2
              id="tx-confirm-title"
              className="text-base font-bold text-gray-900 dark:text-gray-100"
            >
              {title}
            </h2>
            {badge && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        </div>

        {/* ── Warnings ── */}
        {warnings && warnings.length > 0 && (
          <div className="px-6 pt-4 space-y-3">
            {warnings.map((w, i) => (
              <div
                key={i}
                className={`px-3 py-3 rounded-lg border flex items-start gap-2 ${
                  w.type === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50'
                    : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200/50 dark:border-gray-700/40'
                }`}
              >
                <svg
                  className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    w.type === 'warning' ? 'text-amber-500' : 'text-gray-400'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  {w.type === 'warning' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  )}
                </svg>
                <div>
                  {w.title && (
                    <p className={`text-xs font-semibold mb-1 ${
                      w.type === 'warning'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {w.title}
                    </p>
                  )}
                  <div className="text-xs leading-relaxed">{w.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Line items ── */}
        <div className="px-6 py-5 space-y-3">
          {lineItems.map((item, i) => {
            const prev = i > 0 ? lineItems[i - 1] : null;
            const showDivider = item.bold || (prev && !prev.bold && !prev.muted && item.muted);

            return (
              <div key={i}>
                {showDivider && (
                  <div className="border-t border-gray-200/40 dark:border-gray-800 mb-3" />
                )}
                <div className={`flex items-center justify-between ${item.bold ? 'pt-1' : ''}`}>
                  <span className={`text-sm ${
                    item.bold
                      ? 'font-bold text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {item.label}
                    {item.sublabel && (
                      <span className="text-xs ml-1">{item.sublabel}</span>
                    )}
                  </span>
                  <span className={`flex items-center gap-1.5 text-sm text-right max-w-[60%] truncate ${
                    item.valueClassName
                      ? item.valueClassName
                      : item.bold
                        ? 'font-bold text-gray-900 dark:text-gray-100'
                        : item.muted
                          ? 'text-gray-500 dark:text-gray-400'
                          : 'font-semibold text-gray-900 dark:text-gray-100'
                  }`}>
                    {item.solIcon && (
                      <SolanaIcon className={`flex-shrink-0 ${
                        item.muted ? 'w-3.5 h-3.5 text-gray-400' : 'w-4 h-4 text-purple-500'
                      }`} />
                    )}
                    {item.value}
                  </span>
                </div>
              </div>
            );
          })}

          {/* ── Wallet simulation note ── */}
          {walletNote && (
            <div className="mt-2 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/40 flex gap-2 items-start">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {walletNote}
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="btn-forge-outline flex-1 py-3 rounded-xl text-sm font-semibold"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="btn-forge-cta flex-1 py-3 rounded-xl text-sm font-bold"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
