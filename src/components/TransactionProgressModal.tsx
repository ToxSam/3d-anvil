'use client';

import { useEffect, useState, type ReactNode } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProgressStep {
  id: string;
  label: string;
  description: string;
  /** Shows a "wallet" badge indicating user needs to approve in wallet */
  walletPrompt?: boolean;
}

export interface TransactionProgressModalProps {
  open: boolean;
  /** Modal heading, e.g. "Minting NFT" */
  title: string;
  /** Steps to display in order */
  steps: ProgressStep[];
  /** ID of the currently active step (must match a step's id) */
  currentStepId: string;
  /** Human-readable status message shown below the steps */
  statusMessage?: string;
  /** When set, the modal shows an error state and allows closing */
  error?: string | null;
  /** Raw error details for the collapsible "Show details" section */
  errorDetails?: string | null;
  /** When true, the modal shows a success state and allows closing */
  success?: boolean;
  /** Custom success content (replaces default) */
  successContent?: ReactNode;
  /** Called when the user closes the modal (only available on success/error) */
  onClose?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getStepStatus(
  steps: ProgressStep[],
  currentStepId: string,
  stepId: string,
  success: boolean,
): 'done' | 'current' | 'upcoming' {
  if (success) return 'done';
  const currentIdx = steps.findIndex((s) => s.id === currentStepId);
  const stepIdx = steps.findIndex((s) => s.id === stepId);
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'current';
  return 'upcoming';
}

// ── Component ────────────────────────────────────────────────────────────────

export function TransactionProgressModal({
  open,
  title,
  steps,
  currentStepId,
  statusMessage,
  error,
  errorDetails,
  success = false,
  successContent,
  onClose,
}: TransactionProgressModalProps) {
  const canClose = success || !!error;
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  useEffect(() => {
    if (!error) setShowErrorDetails(false);
  }, [error]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canClose) onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, canClose, onClose]);

  if (!open) return null;

  const currentIdx = steps.findIndex((s) => s.id === currentStepId);
  const progressPercent = success
    ? 100
    : steps.length > 0
      ? Math.max(5, ((currentIdx + 0.5) / steps.length) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-progress-title"
    >
      <div className="w-full max-w-md border border-gray-300/40 dark:border-gray-700/60 rounded-2xl shadow-2xl overflow-hidden bg-[var(--background)]">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-200/40 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2
              id="tx-progress-title"
              className="text-base font-bold text-gray-900 dark:text-gray-100"
            >
              {title}
            </h2>
            {!error && !success && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 animate-pulse">
                In progress
              </span>
            )}
            {success && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400">
                Complete
              </span>
            )}
            {error && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                Failed
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 w-full rounded-full bg-gray-200/50 dark:bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                error
                  ? 'bg-red-500'
                  : success
                    ? 'bg-green-500'
                    : 'bg-gradient-to-r from-orange-400 to-orange-500'
              }`}
              style={{ width: `${error ? progressPercent : progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {error
              ? 'Transaction failed'
              : success
                ? 'All steps completed'
                : `Step ${Math.min(currentIdx + 1, steps.length)} of ${steps.length}`
            }
          </p>
        </div>

        {/* ── Steps ── */}
        <div className="px-6 py-5 space-y-4 max-h-[50vh] overflow-y-auto">
          {steps.map((step, i) => {
            const stepStatus = error && currentStepId === step.id
              ? 'current'
              : getStepStatus(steps, currentStepId, step.id, success);

            return (
              <div key={step.id} className="flex gap-3">
                {/* Step indicator */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={`w-8 h-8 flex items-center justify-center text-xs font-semibold rounded-full transition-all duration-300 ${
                      stepStatus === 'done'
                        ? 'bg-green-500/15 text-green-500 border border-green-500/30'
                        : stepStatus === 'current' && error
                          ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                          : stepStatus === 'current'
                            ? 'bg-orange-400/20 text-orange-300 border border-orange-400/40 shadow-[0_0_12px_rgba(251,146,60,0.25)]'
                            : 'bg-gray-200/30 dark:bg-gray-700/20 text-gray-400 dark:text-gray-500 border border-gray-200/30 dark:border-gray-700/20'
                    }`}
                  >
                    {stepStatus === 'done' ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : stepStatus === 'current' && !error ? (
                      <span className="inline-block w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                    ) : stepStatus === 'current' && error ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`w-px flex-1 min-h-[12px] mt-1 transition-colors duration-300 ${
                      stepStatus === 'done' ? 'bg-green-500/30' : 'bg-gray-200/30 dark:bg-gray-700/20'
                    }`} />
                  )}
                </div>

                {/* Step content */}
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium transition-colors duration-300 ${
                      stepStatus === 'done'
                        ? 'text-green-600 dark:text-green-400'
                        : stepStatus === 'current' && error
                          ? 'text-red-500 dark:text-red-400'
                          : stepStatus === 'current'
                            ? 'text-orange-400'
                            : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {step.label}
                    </p>
                    {step.walletPrompt && stepStatus === 'current' && !error && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-purple-400 bg-purple-400/10 border border-purple-400/20 px-1.5 py-0.5 rounded animate-pulse">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <rect x="2" y="6" width="20" height="14" rx="2" />
                          <path d="M16 14h.01" />
                          <path d="M2 10h20" />
                        </svg>
                        approve in wallet
                      </span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 transition-colors duration-300 ${
                    stepStatus === 'current' && !error
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Status / Error / Success footer ── */}
        <div className="px-6 pb-6 space-y-3">
          {/* Status message */}
          {statusMessage && !error && !success && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/40 border border-gray-200/30 dark:border-gray-700/20">
              <span className="inline-block w-4 h-4 border-2 border-orange-400/20 border-t-orange-400 rounded-full animate-spin flex-shrink-0" />
              <p className="text-xs text-orange-400/90 leading-relaxed">{statusMessage}</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 space-y-2">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                <p className="text-sm font-medium text-red-700 dark:text-red-300 leading-relaxed">{error}</p>
              </div>
              {errorDetails && errorDetails !== error && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowErrorDetails((v) => !v)}
                    className="text-[11px] text-red-500/70 hover:text-red-500 transition-colors underline underline-offset-2"
                  >
                    {showErrorDetails ? 'Hide details' : 'Show details'}
                  </button>
                  {showErrorDetails && (
                    <pre className="text-[10px] text-red-600/70 dark:text-red-400/60 leading-relaxed whitespace-pre-wrap break-all max-h-32 overflow-y-auto bg-red-100/50 dark:bg-red-950/30 rounded p-2">
                      {errorDetails}
                    </pre>
                  )}
                </>
              )}
            </div>
          )}

          {/* Success content */}
          {success && successContent && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              {successContent}
            </div>
          )}

          {/* Do-not-close warning */}
          {!canClose && (
            <p className="text-[11px] text-center text-gray-400 dark:text-gray-500">
              Do not close this window or switch tabs while the transaction is in progress.
            </p>
          )}

          {/* Close button (only on success/error) */}
          {canClose && (
            <button
              onClick={onClose}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-colors ${
                error
                  ? 'btn-forge-outline'
                  : 'btn-forge-cta'
              }`}
            >
              {error ? 'Close' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pre-built step configs for common flows ─────────────────────────────────

export const MINT_NFT_STEPS: ProgressStep[] = [
  { id: 'funding', label: 'Funding Arweave storage', description: 'A single SOL payment to cover all file uploads.', walletPrompt: true },
  { id: 'uploading', label: 'Uploading files to Arweave', description: 'All files are being stored permanently in a single batch.', walletPrompt: true },
  { id: 'preparing', label: 'Preparing metadata', description: 'Building the on-chain metadata for your NFT.' },
  { id: 'metadata', label: 'Storing metadata on Arweave', description: 'Name, traits, and file links are saved permanently.', walletPrompt: true },
  { id: 'minting', label: 'Creating NFT on Solana', description: 'The on-chain token is being minted.', walletPrompt: true },
  { id: 'confirming', label: 'Confirming on blockchain', description: 'Waiting for the Solana network to finalize your transaction.' },
  { id: 'verifying', label: 'Verifying collection membership', description: 'Linking your NFT to its collection on-chain.', walletPrompt: true },
];

const MINT_NFT_STEPS_LOCAL: ProgressStep[] = [
  { id: 'vrm', label: 'Uploading VRM to Arweave', description: 'Your avatar file is being stored permanently on the decentralized web.' },
  { id: 'thumbnail', label: 'Uploading preview image', description: 'Your thumbnail is being stored on Arweave.' },
  { id: 'preparing', label: 'Preparing metadata', description: 'Building the on-chain metadata for your NFT.' },
  { id: 'metadata', label: 'Storing metadata on Arweave', description: 'Name, traits, and file links are saved permanently.' },
  { id: 'minting', label: 'Creating NFT on Solana', description: 'The on-chain token is being minted.', walletPrompt: true },
  { id: 'confirming', label: 'Confirming on blockchain', description: 'Waiting for the Solana network to finalize your transaction.' },
  { id: 'verifying', label: 'Verifying collection membership', description: 'Linking your NFT to its collection on-chain.', walletPrompt: true },
];

export function getMintNftSteps(opts?: { hasVrm?: boolean; additionalFileCount?: number; useLocalStorage?: boolean }): ProgressStep[] {
  if (opts?.useLocalStorage) {
    const steps = [...MINT_NFT_STEPS_LOCAL];
    if (opts.hasVrm) {
      const idx = steps.findIndex((s) => s.id === 'vrm');
      if (idx >= 0) steps.splice(idx, 1);
    }
    if (opts.additionalFileCount && opts.additionalFileCount > 0) {
      const metaIdx = steps.findIndex((s) => s.id === 'preparing');
      steps.splice(metaIdx, 0, {
        id: 'additional',
        label: `Uploading ${opts.additionalFileCount} additional file${opts.additionalFileCount > 1 ? 's' : ''}`,
        description: 'Extra models and images are being stored permanently.',
      });
    }
    return steps;
  }

  const steps = [...MINT_NFT_STEPS];
  return steps;
}

export const CREATE_DROP_STEPS: ProgressStep[] = [
  { id: 'funding', label: 'Funding Arweave storage', description: 'A single SOL payment to cover all file uploads.', walletPrompt: true },
  { id: 'uploading', label: 'Uploading files to Arweave', description: 'All files are being stored permanently in a single batch.', walletPrompt: true },
  { id: 'metadata', label: 'Storing metadata on Arweave', description: 'Collection info, traits, and file links are saved permanently.', walletPrompt: true },
  { id: 'collection', label: 'Creating collection on Solana', description: 'The on-chain collection NFT is being created.', walletPrompt: true },
  { id: 'confirming', label: 'Confirming on blockchain', description: 'Waiting for the collection to propagate across Solana nodes.' },
  { id: 'candy-machine', label: 'Creating Candy Machine', description: 'Setting up the on-chain minting program.', walletPrompt: true },
  { id: 'candy-guard', label: 'Setting up mint rules', description: 'Applying pricing, scheduling, and access rules.', walletPrompt: true },
  { id: 'finalizing', label: 'Saving drop configuration', description: 'Updating collection metadata with mint configuration.', walletPrompt: true },
];

const CREATE_DROP_STEPS_LOCAL: ProgressStep[] = [
  { id: 'vrm', label: 'Uploading VRM to Arweave', description: 'Your avatar file is being stored permanently on the decentralized web.' },
  { id: 'thumbnail', label: 'Uploading preview image', description: 'Your thumbnail is being stored on Arweave.' },
  { id: 'metadata', label: 'Storing metadata on Arweave', description: 'Collection info, traits, and file links are saved permanently.' },
  { id: 'collection', label: 'Creating collection on Solana', description: 'The on-chain collection NFT is being created.', walletPrompt: true },
  { id: 'confirming', label: 'Confirming on blockchain', description: 'Waiting for the collection to propagate across Solana nodes.' },
  { id: 'candy-machine', label: 'Creating Candy Machine', description: 'Setting up the on-chain minting program.', walletPrompt: true },
  { id: 'candy-guard', label: 'Setting up mint rules', description: 'Applying pricing, scheduling, and access rules.', walletPrompt: true },
  { id: 'finalizing', label: 'Saving drop configuration', description: 'Updating collection metadata with mint configuration.', walletPrompt: true },
];

export function getCreateDropSteps(opts?: { additionalFileCount?: number; hasGuardGroups?: boolean; useLocalStorage?: boolean }): ProgressStep[] {
  let steps = opts?.useLocalStorage ? [...CREATE_DROP_STEPS_LOCAL] : [...CREATE_DROP_STEPS];
  if (!opts?.hasGuardGroups) {
    steps = steps.filter((s) => s.id !== 'candy-guard');
  }
  if (opts?.useLocalStorage && opts.additionalFileCount && opts.additionalFileCount > 0) {
    const metadataIdx = steps.findIndex((s) => s.id === 'metadata');
    steps.splice(metadataIdx, 0, {
      id: 'additional',
      label: `Uploading ${opts.additionalFileCount} additional file${opts.additionalFileCount > 1 ? 's' : ''}`,
      description: 'Extra models and images are being stored permanently.',
    });
  }
  return steps;
}

export const PUBLIC_MINT_STEPS: ProgressStep[] = [
  { id: 'payment', label: 'Processing payment', description: 'Sending SOL to the collection creator.', walletPrompt: true },
  { id: 'minting', label: 'Minting your NFT', description: 'Creating your unique NFT on the Solana blockchain.', walletPrompt: true },
  { id: 'verifying', label: 'Verifying collection', description: 'Confirming your NFT belongs to this collection.' },
];

export function getPublicMintSteps(opts?: { isFree?: boolean }): ProgressStep[] {
  if (opts?.isFree) {
    return PUBLIC_MINT_STEPS.filter((s) => s.id !== 'payment');
  }
  return [...PUBLIC_MINT_STEPS];
}

const CANDY_MACHINE_MINT_STEPS_BASE: ProgressStep[] = [
  { id: 'preparing', label: 'Preparing transaction', description: 'Fetching collection state from the blockchain.' },
  { id: 'minting', label: 'Minting your NFT', description: 'Creating your unique NFT on the Solana blockchain.', walletPrompt: true },
  { id: 'confirming', label: 'Confirming on blockchain', description: 'Waiting for the Solana network to finalize your transaction.' },
];

const ALLOWLIST_STEP: ProgressStep = {
  id: 'allowlist',
  label: 'Verifying allowlist',
  description: 'Submitting your merkle proof to the Candy Guard on-chain.',
  walletPrompt: true,
};

export function getCandyMachineMintSteps(opts?: { hasAllowlist?: boolean }): ProgressStep[] {
  if (opts?.hasAllowlist) {
    const steps = [...CANDY_MACHINE_MINT_STEPS_BASE];
    steps.splice(1, 0, ALLOWLIST_STEP);
    return steps;
  }
  return [...CANDY_MACHINE_MINT_STEPS_BASE];
}

export const CREATE_COLLECTION_STEPS: ProgressStep[] = [
  { id: 'uploading-image', label: 'Uploading collection image', description: 'Your image is being stored permanently on Arweave.' },
  { id: 'uploading-metadata', label: 'Storing metadata on Arweave', description: 'Collection name, description, and settings are saved permanently.' },
  { id: 'creating-onchain', label: 'Creating collection on Solana', description: 'The on-chain collection NFT is being created.', walletPrompt: true },
  { id: 'confirming', label: 'Confirming on blockchain', description: 'Waiting for the Solana network to finalize your transaction.' },
  { id: 'registering', label: 'Registering collection', description: 'Adding your collection to the launchpad registry.' },
];

export function getCreateCollectionSteps(): ProgressStep[] {
  return [...CREATE_COLLECTION_STEPS];
}
