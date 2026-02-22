'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useMetaplex } from '@/lib/metaplex';
import { useUmi } from '@/lib/umi';
import { createDropCandyMachine, validateDropConfig } from '@/lib/candyMachine';
import { VRMUploader } from './VRMUploader';
import { parse3DModel, VRMMetadata } from '@/lib/vrmParser';
import { GLBLicenseSelector } from './GLBLicenseSelector';
import { IconVRM, IconGLB, Icon3DCube, Icon3DBox } from './AssetIcons';
import { uploadFileToArweave, uploadMetadataToArweave } from '@/lib/uploadToArweave';
import { registerLaunchpadCollection } from '@/lib/registerLaunchpadCollection';
import {
  createIrysUploader,
  estimateUploadCost,
  fundIrysBalance,
  irysUploadFiles,
  irysUploadJson,
} from '@/lib/irysUploader';
import { useToast } from '@/components/Toast';
import { MintConfig, DEFAULT_MINT_CONFIG, type MintAccessType } from '@/lib/types/mintConfig';
import { COLLECTION_TYPES, COLLECTION_SCHEMAS, COLLECTION_KIND } from '@/lib/constants';
import { publicKey, type Umi } from '@metaplex-foundation/umi';
import { findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';
import dynamic from 'next/dynamic';
import DateTimePicker from '@/components/DateTimePicker';
import { ForgeNumberInput } from '@/components/ForgeNumberInput';
import { TransactionConfirmModal, buildCreateDropTransaction } from '@/components/TransactionConfirmModal';
import { TransactionProgressModal, getCreateDropSteps } from '@/components/TransactionProgressModal';
import { checkSolBalance, estimateDropRent, createNftWalletFirst } from '@/lib/transactionUtils';

const VRMViewer = dynamic(
  () => import('@/components/VRMViewer').then((mod) => mod.VRMViewer),
  { ssr: false, loading: () => <div className="min-h-[320px] flex items-center justify-center text-white/60">Loading viewer…</div> }
);

/**
 * Poll until the collection metadata PDA is owned by the Token Metadata
 * program. Helius load-balances RPC across nodes; after creating a collection
 * NFT the next request can land on a node that hasn't replicated it yet.
 * Without this the Candy Machine InitializeV2 → Delegate CPI fails with
 * "Incorrect account owner" because it sees System Program instead of Token
 * Metadata as the metadata account owner.
 */
async function waitForAccount(
  umi: Umi,
  mintAddress: string,
  maxAttempts = 10,
  delayMs = 2000,
): Promise<void> {
  const TOKEN_METADATA_PROGRAM =
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
  const metadataPda = findMetadataPda(umi, {
    mint: publicKey(mintAddress),
  });
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const account = await umi.rpc.getAccount(metadataPda[0]);
      if (account.exists && account.owner.toString() === TOKEN_METADATA_PROGRAM) {
        return;
      }
    } catch {
      // RPC error — retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // If we get here, proceed anyway and let the CM creation surface the error
  console.warn('[CreateDrop] Metadata account not visible after polling — proceeding anyway');
}

interface CustomTrait {
  trait_type: string;
  value: string;
}

/** An additional file (GLB, VRM, image) attached to the drop beyond the main avatar. */
interface AdditionalFile {
  file: File;
  previewUrl: string;
  /** 'model' = VRM/GLB that can be viewed in 3D, 'image' = thumbnail/render */
  type: 'model' | 'image';
  name: string;
}

/** A single mint phase (Advanced mode): price, supply, limits, schedule, and access. */
export interface MintPhase {
  price: number;
  maxSupply: number | null;
  maxPerWallet: number | null;
  startDate: string | null;
  endDate: string | null;
  /** Who can mint in this phase */
  access?: MintAccessType;
  /** Holders of any of these token/NFT mints can mint */
  tokenHolderMints?: string[];
  tokenHolderMint?: string;
  allowlistAddresses?: string[];
}

function getPhaseTokenHolderMints(phase: MintPhase): string[] {
  if (phase.tokenHolderMints && phase.tokenHolderMints.length > 0) return phase.tokenHolderMints;
  if (phase.tokenHolderMint?.trim()) return [phase.tokenHolderMint.trim()];
  return [];
}

function getMintConfigTokenHolderMints(config: MintConfig): string[] {
  if (config.tokenHolderMints && config.tokenHolderMints.length > 0) return config.tokenHolderMints;
  if (config.tokenHolderMint?.trim()) return [config.tokenHolderMint.trim()];
  return [];
}

type CustomAccessTab = 'token_holders' | 'allowlist';

interface CreateDropAccessBlockProps {
  radioName: string;
  access: MintAccessType | undefined;
  tokenHolderMints: string[];
  allowlistAddresses: string[] | undefined;
  onChange: (patch: {
    access?: MintAccessType;
    tokenHolderMints?: string[];
    allowlistAddresses?: string[];
    requiresAllowlist?: boolean;
  }) => void;
  compact?: boolean;
}

function CreateDropAccessBlock({
  radioName,
  access,
  tokenHolderMints,
  allowlistAddresses,
  onChange,
  compact,
}: CreateDropAccessBlockProps) {
  const [customTab, setCustomTab] = useState<CustomAccessTab>('token_holders');
  const [allowlistText, setAllowlistText] = useState(() => (allowlistAddresses || []).join('\n'));
  useEffect(() => {
    setAllowlistText((allowlistAddresses || []).join('\n'));
  }, [allowlistAddresses?.length, allowlistAddresses?.join(',')]);

  const isCustom = (access || 'anyone') === 'custom';

  function commitAllowlist() {
    const lines = allowlistText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    onChange({ allowlistAddresses: lines, requiresAllowlist: lines.length > 0 });
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex gap-2 border-b border-gray-200/30 dark:border-gray-700/30">
        <button
          type="button"
          onClick={() => onChange({ access: 'anyone', requiresAllowlist: false, tokenHolderMints: undefined, allowlistAddresses: undefined })}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            !isCustom
              ? 'border-orange-400 text-orange-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Default
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              access: 'custom',
              requiresAllowlist: (allowlistAddresses?.length ?? 0) > 0,
              tokenHolderMints: tokenHolderMints.length > 0 ? tokenHolderMints : undefined,
            })
          }
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            isCustom
              ? 'border-orange-400 text-orange-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Custom
        </button>
      </div>

      {!isCustom ? (
        <div className={compact ? 'pt-2' : 'pt-4'}>
          <p className={compact ? 'text-small text-gray-600 dark:text-gray-400' : 'text-body text-gray-700 dark:text-gray-300'}>
            Anyone can mint. No token or allowlist restrictions.
          </p>
        </div>
      ) : (
        <div className={compact ? 'pt-2 space-y-3' : 'pt-4 space-y-4'}>
          <div className="flex gap-2 border-b border-gray-200/30 dark:border-gray-700/30">
            <button
              type="button"
              onClick={() => setCustomTab('token_holders')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                customTab === 'token_holders'
                  ? 'border-orange-400 text-orange-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Token holders
            </button>
            <button
              type="button"
              onClick={() => setCustomTab('allowlist')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                customTab === 'allowlist'
                  ? 'border-orange-400 text-orange-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Allowlist
            </button>
          </div>

          {customTab === 'token_holders' && (
            <div className="space-y-2">
              <p className="text-caption text-gray-500 dark:text-gray-400">
                Holders of <strong>any</strong> of these tokens or NFTs can mint.
              </p>
              {tokenHolderMints.map((mint, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={mint}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      const next = [...tokenHolderMints];
                      next[i] = v;
                      onChange({ tokenHolderMints: next.filter(Boolean).length ? next : undefined });
                    }}
                    className={`input-forge flex-1 font-mono text-small ${compact ? '!py-2' : ''}`}
                    placeholder="Token or NFT mint address"
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ tokenHolderMints: tokenHolderMints.filter((_, j) => j !== i) })}
                    className="text-gray-400 hover:text-red-500 p-2"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onChange({ tokenHolderMints: [...tokenHolderMints, ''] })}
                className="btn-forge-outline text-sm"
              >
                + Add token or NFT
              </button>
            </div>
          )}

          {customTab === 'allowlist' && (
            <div>
              <label className={compact ? 'text-caption block mb-1.5 text-gray-700 dark:text-gray-300' : 'text-label block mb-2'}>Allowed wallet addresses</label>
              <textarea
                value={allowlistText}
                onChange={(e) => setAllowlistText(e.target.value)}
                onBlur={commitAllowlist}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.stopPropagation();
                }}
                className={`input-forge w-full font-mono text-small resize-y ${compact ? 'min-h-[80px] !py-2' : 'min-h-[100px]'}`}
                placeholder="One address per line. Press Enter for new line."
                rows={compact ? 3 : 4}
              />
              <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                Press Enter for a new line. {(() => {
                  const count = allowlistText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;
                  return count > 0 ? <span className="text-orange-400 font-medium">{count} address{count !== 1 ? 'es' : ''} (saved on blur)</span> : null;
                })()}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Returns true if two phases have overlapping [start, end] intervals. */
function phasesOverlap(a: MintPhase, b: MintPhase): boolean {
  const aStart = a.startDate ? new Date(a.startDate).getTime() : 0;
  const aEnd = a.endDate ? new Date(a.endDate).getTime() : Number.POSITIVE_INFINITY;
  const bStart = b.startDate ? new Date(b.startDate).getTime() : 0;
  const bEnd = b.endDate ? new Date(b.endDate).getTime() : Number.POSITIVE_INFINITY;
  return aStart < bEnd && aEnd > bStart;
}

/** Effective start timestamp for phase i: explicit start or (for i>0) previous phase's effective end. */
function getEffectiveStart(phases: MintPhase[], i: number, effectiveEnds: number[]): number {
  if (phases[i].startDate) return new Date(phases[i].startDate!).getTime();
  if (i === 0) return 0;
  return effectiveEnds[i - 1];
}

/** Effective end timestamp for phase i: explicit end or Infinity. */
function getEffectiveEnd(phase: MintPhase): number {
  return phase.endDate ? new Date(phase.endDate).getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Returns the set of phase indices that have validation errors:
 * - end <= start (when both set), or
 * - effective end <= effective start (e.g. phase with no start but end before previous phase end), or
 * - overlaps with another phase's effective range.
 */
function getPhaseValidationErrors(phases: MintPhase[]): Set<number> {
  const errors = new Set<number>();
  if (phases.length === 0) return errors;

  const effectiveEnds = phases.map((p) => getEffectiveEnd(p));
  const effectiveStarts = phases.map((_, i) => getEffectiveStart(phases, i, effectiveEnds));

  for (let i = 0; i < phases.length; i++) {
    // Same phase: end must be after start (when both set)
    if (phases[i].startDate && phases[i].endDate) {
      if (new Date(phases[i].endDate!).getTime() <= new Date(phases[i].startDate!).getTime()) {
        errors.add(i);
      }
    }
    // Effective range must be valid (end > start)
    if (effectiveEnds[i] <= effectiveStarts[i]) {
      errors.add(i);
    }
  }

  for (let i = 0; i < phases.length; i++) {
    for (let j = i + 1; j < phases.length; j++) {
      if (effectiveStarts[i] < effectiveEnds[j] && effectiveEnds[i] > effectiveStarts[j]) {
        errors.add(i);
        errors.add(j);
      }
    }
  }

  return errors;
}

/** Determines the MIME type string for metadata.properties.files */
function getMimeType(file: File): string {
  if (file.name.endsWith('.vrm')) return 'model/vrm';
  if (file.name.endsWith('.glb')) return 'model/gltf-binary';
  if (file.name.endsWith('.gltf')) return 'model/gltf+json';
  return file.type || 'application/octet-stream';
}

/** Checks if a file is a 3D model that can be previewed */
function isModelFile(file: File): boolean {
  const ext = file.name.toLowerCase();
  return ext.endsWith('.vrm') || ext.endsWith('.glb');
}

interface Props {
  onCreatingChange?: (isCreating: boolean) => void;
  fullViewport?: boolean;
}

export function CreateDropWithVRM({ onCreatingChange, fullViewport }: Props) {
  const router = useRouter();
  const wallet = useWallet();
  const metaplex = useMetaplex();
  const umi = useUmi();
  const { toast } = useToast();

  // VRM state
  const [vrmFile, setVrmFile] = useState<File | null>(null);
  const [vrmMetadata, setVrmMetadata] = useState<VRMMetadata | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);

  // GLB license state (only used when fileType === 'glb')
  const [glbLicense, setGlbLicense] = useState('');
  const [glbCommercialUse, setGlbCommercialUse] = useState('');

  // Additional files state
  const [additionalFiles, setAdditionalFiles] = useState<AdditionalFile[]>([]);

  // Active model in viewer (0 = main VRM, 1+ = additional model files)
  const [activeModelIndex, setActiveModelIndex] = useState(0);

  // Form state
  const [collectionName, setCollectionName] = useState('');
  const [collectionSymbol, setCollectionSymbol] = useState('');
  const [collectionDescription, setCollectionDescription] = useState('');
  const [royaltyPercent, setRoyaltyPercent] = useState(5);
  const [revenueSplitsEnabled, setRevenueSplitsEnabled] = useState(false);
  const [revenueSplits, setRevenueSplits] = useState<{ address: string; percent: number }[]>(() => {
    const me = wallet.publicKey?.toString() ?? '';
    return [{ address: me, percent: 100 }];
  });
  const [customTraits, setCustomTraits] = useState<CustomTrait[]>([]);
  
  // Drop configuration
  const [mintConfig, setMintConfig] = useState<MintConfig>({ 
    ...DEFAULT_MINT_CONFIG,
    isPublic: true,
    access: 'anyone',
  });

  // Steps: 1 = VRM metadata, 2 = Details, 3 = Mint Settings, 4 = Confirmation, 5 = Launch
  const [dropStep, setDropStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [maxStepReached, setMaxStepReached] = useState(1);

  // Ref for the step content scroll container
  const stepContentScrollRef = useRef<HTMLDivElement>(null);

  // UI state
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const [createdCollectionAddress, setCreatedCollectionAddress] = useState<string | null>(null);

  // Progress modal state
  type DropPhase = '' | 'funding' | 'uploading' | 'vrm' | 'thumbnail' | 'additional' | 'metadata' | 'collection' | 'confirming' | 'candy-machine' | 'candy-guard' | 'finalizing' | 'success';
  const [dropPhase, setDropPhase] = useState<DropPhase>('');
  const [dropError, setDropError] = useState<string | null>(null);

  // Transaction confirm modal
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);

  // Irys storage cost estimate (calculated before showing confirmation modal)
  const [storageCostSol, setStorageCostSol] = useState<number | null>(null);
  const [storageCostLamports, setStorageCostLamports] = useState<string | null>(null);
  const [estimatingCost, setEstimatingCost] = useState(false);

  // Validation errors
  const [thumbnailError, setThumbnailError] = useState(false);

  // Drag states
  const [thumbnailDragOver, setThumbnailDragOver] = useState(false);
  const [additionalFilesDragOver, setAdditionalFilesDragOver] = useState(false);

  // Animation / T-pose toggle (only for VRM models, index 0)
  const [tPose, setTPose] = useState(false);

  // Dutch auction duration mode: 'quick' or 'advanced'
  const [durationMode, setDurationMode] = useState<'quick' | 'advanced'>('quick');

  // Mint settings tab: default (single config) vs advanced (phases)
  const [mintSettingsTab, setMintSettingsTab] = useState<'default' | 'advanced'>('default');
  const [mintPhases, setMintPhases] = useState<MintPhase[]>(() => [
    { price: 0, maxSupply: null, maxPerWallet: null, startDate: null, endDate: null, access: 'anyone' },
  ]);
  // When user clicks "+ Add phase" without locking previous phase, highlight that phase's end box (index or null)
  const [addPhaseHintPhaseIndex, setAddPhaseHintPhaseIndex] = useState<number | null>(null);
  // Increment to re-trigger the outline animation on every click of + Add phase
  const [addPhaseHintTrigger, setAddPhaseHintTrigger] = useState(0);
  

  // Phase validation: indices of phases with start/end order or overlap errors (advanced tab only)
  const phaseValidationErrors =
    !mintConfig.isDutchAuction && mintSettingsTab === 'advanced' && mintPhases.length > 0
      ? getPhaseValidationErrors(mintPhases)
      : new Set<number>();
  const hasPhaseErrors = phaseValidationErrors.size > 0;

  // ── Computed: all model files (main VRM + additional models) ──
  const modelFiles: { url: string; label: string }[] = [];
  if (previewUrl) {
    modelFiles.push({ url: previewUrl, label: vrmFile?.name || 'Main Avatar' });
  }
  additionalFiles
    .filter((f) => f.type === 'model')
    .forEach((f) => {
      modelFiles.push({ url: f.previewUrl, label: f.name });
    });

  // The URL currently shown in the 3D viewer
  const activeViewerUrl = modelFiles[activeModelIndex]?.url || previewUrl;

  // Revenue split total (should equal 100 when enabled)
  const revenueSplitTotal = revenueSplits.reduce(
    (sum, s) => sum + (Number.isFinite(s.percent) ? Math.round(s.percent) : 0),
    0
  );

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
      additionalFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll step content to top whenever the active step changes
  useEffect(() => {
    stepContentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [dropStep]);

  // Step navigation
  function goToStep(step: 1 | 2 | 3 | 4 | 5) {
    if (step <= maxStepReached) {
      setDropStep(step);
    }
  }

  function advanceFromStep(currentStep: 1 | 2 | 3 | 4 | 5) {
    // Validate current step before advancing
    if (currentStep === 1 && vrmMetadata?.fileType === 'glb' && !glbLicense) {
      toast('Please select a license for your GLB model before continuing.', 'warning');
      return;
    }
    if (currentStep === 2) {
      if (!collectionName.trim()) {
        toast('Please enter a name for your drop collection.', 'warning');
        return;
      }
      if (!thumbnailFile) {
        setThumbnailError(true);
        toast('A thumbnail image is required. Please upload a PNG or JPG.', 'warning');
        return;
      }
      setThumbnailError(false);
    }

    if (currentStep === 3) {
      // Validate mint settings
      if (royaltyPercent < 0 || royaltyPercent > 100) {
        toast('Royalties must be between 0% and 100%.', 'warning');
        return;
      }
      if (revenueSplitsEnabled) {
        const cleaned = revenueSplits.map((s) => ({
          address: (s.address || '').trim(),
          percent: Number.isFinite(s.percent) ? Math.round(s.percent) : 0,
        }));

        if (cleaned.length === 0) {
          toast('Add at least one revenue split recipient.', 'warning');
          return;
        }
        if (cleaned.some((s) => !s.address)) {
          toast('Revenue split addresses cannot be empty.', 'warning');
          return;
        }
        try {
          cleaned.forEach((s) => new PublicKey(s.address));
        } catch {
          toast('One or more revenue split addresses are invalid Solana addresses.', 'warning');
          return;
        }
        if (cleaned.some((s) => s.percent < 0 || s.percent > 100)) {
          toast('Revenue split percentages must be between 0% and 100%.', 'warning');
          return;
        }
        const total = cleaned.reduce((sum, s) => sum + s.percent, 0);
        if (total !== 100) {
          toast('Revenue split must total 100%.', 'warning');
          return;
        }
        const seen = new Set<string>();
        for (const s of cleaned) {
          const key = s.address;
          if (seen.has(key)) {
            toast('Revenue split addresses must be unique.', 'warning');
            return;
          }
          seen.add(key);
        }

        // Persist cleaned rounding back into state (keeps UI consistent).
        setRevenueSplits(cleaned);
      }
      if (mintConfig.isDutchAuction) {
        if (!mintConfig.dutchAuction || mintConfig.dutchAuction.startPrice <= mintConfig.dutchAuction.endPrice) {
          toast('Dutch auction start price must be higher than end price.', 'warning');
          return;
        }
      }
      // Open Edition Advanced: block if any phase has order/overlap errors
      if (!mintConfig.isDutchAuction && mintSettingsTab === 'advanced' && hasPhaseErrors) {
        toast('Fix the highlighted phases: start must be before end, and phases must not overlap in time.', 'warning');
        return;
      }
      // When Advanced with phases, sync first phase into mintConfig for the rest of the flow
      if (mintSettingsTab === 'advanced' && mintPhases.length > 0) {
        const first = mintPhases[0];
        const firstMints = getPhaseTokenHolderMints(first);
        setMintConfig((prev) => ({
          ...prev,
          price: first.price,
          maxSupply: first.maxSupply,
          maxPerWallet: first.maxPerWallet,
          startDate: first.startDate,
          endDate: first.endDate,
          access: first.access ?? 'anyone',
          tokenHolderMints: firstMints.length > 0 ? firstMints : undefined,
          tokenHolderMint: undefined,
          allowlistAddresses: first.allowlistAddresses,
          requiresAllowlist: (first.allowlistAddresses?.length ?? 0) > 0,
        }));
      }
    }

    const nextStep = Math.min(currentStep + 1, 5) as 1 | 2 | 3 | 4 | 5;
    setDropStep(nextStep);
    setMaxStepReached((prev) => Math.max(prev, nextStep) as 1 | 2 | 3 | 4 | 5);
  }

  // File handling
  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.toLowerCase();
      if (!ext.endsWith('.vrm') && !ext.endsWith('.glb')) return;
      try {
        const metadata = await parse3DModel(file);
        setVrmFile(file);
        setVrmMetadata(metadata);
        setCollectionName((metadata.title || file.name.replace(/\.(vrm|glb)$/i, '')).slice(0, 32));
        setDropStep(1);
        
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } catch (err) {
        console.error('Failed to parse model:', err);
        toast('Failed to parse file. Make sure it\'s a valid .vrm or .glb file.', 'error');
      }
    },
    [previewUrl, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      const ext = file?.name.toLowerCase() ?? '';
      if (file && (ext.endsWith('.vrm') || ext.endsWith('.glb'))) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  // Thumbnail handling (click + drag-and-drop)
  function applyThumbnail(file: File) {
    if (!file.type.startsWith('image/')) return;
    setThumbnailFile(file);
    setThumbnailError(false);
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailPreview(URL.createObjectURL(file));
  }

  function handleThumbnailSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) applyThumbnail(file);
  }

  function handleThumbnailDrop(e: React.DragEvent) {
    e.preventDefault();
    setThumbnailDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) applyThumbnail(file);
  }

  function removeThumbnail() {
    setThumbnailFile(null);
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailPreview(null);
  }

  // Additional files handling (click + multi-file drag-and-drop)

  /** Check if the file extension is one we accept */
  function isAcceptedFile(file: File): boolean {
    const ext = file.name.toLowerCase();
    return ext.endsWith('.glb') || ext.endsWith('.vrm') || ext.endsWith('.gltf') || file.type.startsWith('image/');
  }

  function addAdditionalFiles(files: FileList | File[]) {
    const newFiles: AdditionalFile[] = [];
    for (const file of Array.from(files)) {
      if (!isAcceptedFile(file)) continue;
      newFiles.push({
        file,
        previewUrl: URL.createObjectURL(file),
        type: isModelFile(file) ? 'model' : 'image',
        name: file.name,
      });
    }
    if (newFiles.length > 0) {
      setAdditionalFiles((prev) => [...prev, ...newFiles]);
    }
  }

  function handleAdditionalFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addAdditionalFiles(e.target.files);
    }
    e.target.value = '';
  }

  function handleAdditionalFilesDrop(e: React.DragEvent) {
    e.preventDefault();
    setAdditionalFilesDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addAdditionalFiles(e.dataTransfer.files);
    }
  }

  function removeAdditionalFile(index: number) {
    setAdditionalFiles((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const updated = prev.filter((_, i) => i !== index);

      // If the removed file was a model that was being viewed, reset to main
      if (removed?.type === 'model') {
        // Count how many models came before this index
        const modelsBefore = prev.slice(0, index).filter((f) => f.type === 'model').length;
        const removedModelIdx = modelsBefore + 1; // +1 because index 0 is main VRM
        if (activeModelIndex === removedModelIdx) {
          setActiveModelIndex(0);
        } else if (activeModelIndex > removedModelIdx) {
          setActiveModelIndex((i) => i - 1);
        }
      }

      return updated;
    });
  }

  const useLocalStorage = process.env.NEXT_PUBLIC_USE_LOCAL_STORAGE === 'true';

  async function handleCreateDropRequest() {
    if (!vrmFile || !vrmMetadata || !collectionName || !thumbnailFile) {
      toast('Please complete all required fields', 'warning');
      return;
    }

    // Pre-flight: validate all Candy Machine constraints BEFORE spending on storage
    const cmCreatorsForValidation =
      revenueSplitsEnabled && revenueSplits.length > 0
        ? revenueSplits.map((s) => ({
            address: (s.address || '').trim(),
            percent: Number.isFinite(s.percent) ? Math.round(s.percent) : 0,
          }))
        : [];
    const validationErrors = validateDropConfig({
      collectionName,
      collectionSymbol: collectionSymbol || 'DROP',
      sellerFeeBasisPoints: Math.round(royaltyPercent * 100),
      creators: cmCreatorsForValidation.map((c) => ({ address: c.address, share: c.percent })),
      mintConfig,
      phases: mintSettingsTab === 'advanced' && mintPhases.length > 0 ? mintPhases : undefined,
    });
    if (validationErrors.length > 0) {
      const messages = validationErrors.map((e) => e.message);
      toast(messages.join('\n'), 'error');
      return;
    }

    if (!useLocalStorage) {
      try {
        setEstimatingCost(true);
        const irys = await createIrysUploader(wallet);
        const allFiles = [
          vrmFile,
          thumbnailFile,
          ...additionalFiles.map((af) => af.file),
        ];
        const { totalLamports, totalSol } = await estimateUploadCost(irys, allFiles);
        setStorageCostLamports(totalLamports);
        setStorageCostSol(totalSol);
      } catch (e) {
        console.error('Failed to estimate storage cost:', e);
        toast('Could not estimate storage cost. Check your wallet connection and try again.', 'warning');
        setEstimatingCost(false);
        return;
      } finally {
        setEstimatingCost(false);
      }
    }

    setShowLaunchConfirm(true);
  }

  async function handleCreateDrop() {
    setShowLaunchConfirm(false);
    if (!vrmFile || !vrmMetadata || !collectionName || !thumbnailFile) return;

    setCreating(true);
    setDropError(null);
    onCreatingChange?.(true);

    try {
      // ── Fund Irys once & upload all files via Irys SDK directly ─────
      // (local-storage mode falls back to the Metaplex adapter path)
      let vrmUrl: string;
      let thumbnailUrl: string;
      const uploadedAdditionalFiles: { uri: string; type: string; name: string }[] = [];
      let metadataUrl: string;

      if (!useLocalStorage) {
        const irys = await createIrysUploader(wallet);

        // Single wallet approval for all file storage
        if (storageCostLamports) {
          setDropPhase('funding');
          setStatus('Funding Arweave storage\u2026 Approve in your wallet.');
          await fundIrysBalance(irys, storageCostLamports);
        }

        setDropPhase('uploading');
        setStatus('Uploading all files to Arweave\u2026 Sign once to authorize.');

        const batchEntries: Array<{ key: string; file: File }> = [
          { key: `vrm__${vrmFile.name}`, file: vrmFile },
          { key: `thumb__${thumbnailFile.name}`, file: thumbnailFile },
          ...additionalFiles.map((af, i) => ({
            key: `add_${i}__${af.file.name}`,
            file: af.file,
          })),
        ];

        const urlMap = await irysUploadFiles(irys, batchEntries);
        vrmUrl = urlMap.get(`vrm__${vrmFile.name}`)!;
        thumbnailUrl = urlMap.get(`thumb__${thumbnailFile.name}`)!;

        if (additionalFiles.length > 0) {
          for (let i = 0; i < additionalFiles.length; i++) {
            const af = additionalFiles[i];
            const uri = urlMap.get(`add_${i}__${af.file.name}`);
            if (uri) uploadedAdditionalFiles.push({ uri, type: getMimeType(af.file), name: af.file.name });
          }
        }
      } else {
        setDropPhase('vrm');
        setStatus('Uploading VRM to Arweave\u2026');
        vrmUrl = await uploadFileToArweave(metaplex, vrmFile);

        setDropPhase('thumbnail');
        setStatus('Uploading thumbnail\u2026');
        thumbnailUrl = await uploadFileToArweave(metaplex, thumbnailFile);

        if (additionalFiles.length > 0) {
          setDropPhase('additional');
          for (let i = 0; i < additionalFiles.length; i++) {
            const af = additionalFiles[i];
            setStatus(`Storing additional file ${i + 1}/${additionalFiles.length}: ${af.name}\u2026`);
            const uri = await uploadFileToArweave(metaplex, af.file);
            uploadedAdditionalFiles.push({ uri, type: getMimeType(af.file), name: af.file.name });
          }
        }
      }

      // Build attributes with custom traits
      const attributes = [
        { trait_type: 'License', value: vrmMetadata.license },
        { trait_type: 'Commercial Use', value: vrmMetadata.commercialUse },
        { trait_type: 'Blend Shapes', value: vrmMetadata.blendShapeCount.toString() },
        { trait_type: 'Bone Count', value: vrmMetadata.boneCount.toString() },
        ...customTraits.filter((t) => t.trait_type && t.value),
      ];

      // Prepare mint config with startDate for Dutch auctions
      const finalMintConfig = { ...mintConfig };
      if (finalMintConfig.isDutchAuction && !finalMintConfig.startDate) {
        finalMintConfig.startDate = new Date().toISOString();
      }
      // Sanitize access: filter empty token holder mints
      if (finalMintConfig.tokenHolderMints?.length) {
        finalMintConfig.tokenHolderMints = finalMintConfig.tokenHolderMints.filter(Boolean);
        if (finalMintConfig.tokenHolderMints.length === 0) delete finalMintConfig.tokenHolderMints;
      }
      if (finalMintConfig.tokenHolderMint && finalMintConfig.tokenHolderMints?.length) delete finalMintConfig.tokenHolderMint;
      // Attach optional revenue splits (used for mint revenue and can be reused for royalties)
      finalMintConfig.revenueSplits = revenueSplitsEnabled
        ? revenueSplits.map((s) => ({
            address: (s.address || '').trim(),
            percent: Number.isFinite(s.percent) ? Math.round(s.percent) : 0,
          }))
        : undefined;

      const isGlb = vrmMetadata?.fileType === 'glb';
      const collectionType = isGlb ? COLLECTION_TYPES.GLB_MODELS : COLLECTION_TYPES.VRM_AVATARS;

      const metadata = {
        name: collectionName,
        symbol: collectionSymbol || 'DROP',
        description: collectionDescription,
        image: thumbnailUrl,
        animation_url: vrmUrl,
        attributes,
        properties: {
          category: 'vr',
          collection_type: collectionType,
          metadata_schema: COLLECTION_SCHEMAS[collectionType],
          collection_kind: COLLECTION_KIND.DROP,
          is_drop: true, // legacy compat
          files: [
            { uri: vrmUrl, type: getMimeType(vrmFile), name: vrmFile.name },
            { uri: thumbnailUrl, type: thumbnailFile.type || 'image/png', name: thumbnailFile.name },
            ...uploadedAdditionalFiles,
          ],
        },
        mint_config: finalMintConfig,
      };

      setDropPhase('metadata');
      setStatus('Uploading metadata to Arweave\u2026');
      if (!useLocalStorage) {
        const irys = await createIrysUploader(wallet);
        metadataUrl = await irysUploadJson(irys, metadata);
      } else {
        metadataUrl = await uploadMetadataToArweave(metaplex, metadata);
      }

      setDropPhase('collection');
      setStatus('Checking wallet balance\u2026');
      const { rentSol: dropRentSol } = estimateDropRent({
        hasGuardGroups: (mintSettingsTab === 'advanced' && mintPhases.length > 0) || !!mintConfig.isDutchAuction,
      });
      const totalNeeded = dropRentSol + (storageCostSol ?? 0);
      const { sufficient, balance } = await checkSolBalance(
        metaplex.connection,
        wallet.publicKey!,
        totalNeeded,
      );
      if (!sufficient) {
        throw new Error(
          `Insufficient SOL. Creating this drop requires ~${totalNeeded.toFixed(4)} SOL (rent + storage), but your wallet only has ${balance.toFixed(4)} SOL.`,
        );
      }

      setStatus('Creating collection on Solana\u2026 Approve in your wallet.');
      const creatorsList =
        finalMintConfig.revenueSplits && finalMintConfig.revenueSplits.length > 0
          ? finalMintConfig.revenueSplits.map((s) => ({
              address: new PublicKey(s.address),
              share: s.percent,
            }))
          : undefined;
      const { mintAddress: collectionMintPk, signature: createSig } =
        await createNftWalletFirst(
          metaplex,
          { publicKey: wallet.publicKey!, signTransaction: wallet.signTransaction! },
          {
            uri: metadataUrl,
            name: collectionName,
            symbol: collectionSymbol || 'DROP',
            sellerFeeBasisPoints: Math.round(royaltyPercent * 100),
            isCollection: true,
            ...(creatorsList ? { creators: creatorsList } : {}),
          },
        );

      // Register in launchpad allowlist (non-blocking)
      try {
        if (createSig) {
          const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
          await registerLaunchpadCollection({
            txSignature: createSig,
            collectionMint: collectionMintPk.toBase58(),
            network,
          });
        }
      } catch (e) {
        console.warn('Registry registration failed:', e);
      }

      setDropPhase('confirming');
      setStatus('Waiting for collection to propagate across Solana nodes\u2026');
      const collectionMintAddr = collectionMintPk.toString();
      await waitForAccount(umi, collectionMintAddr, 10, 2000);

      // ── Create Candy Machine linked to this collection ──────────────
      setDropPhase('candy-machine');
      setStatus('Setting up Candy Machine with your mint rules\u2026 Approve in your wallet.');
      const cmCreators =
        finalMintConfig.revenueSplits && finalMintConfig.revenueSplits.length > 0
          ? finalMintConfig.revenueSplits.map((s) => ({
              address: s.address,
              share: s.percent,
            }))
          : [];
      const { candyMachineAddress, candyGuardAddress } = await createDropCandyMachine(
        umi,
        {
          collectionMintAddress: collectionMintAddr,
          collectionName,
          collectionUri: metadataUrl,
          collectionSymbol: collectionSymbol || 'DROP',
          sellerFeeBasisPoints: Math.round(royaltyPercent * 100),
          creators: cmCreators,
          mintConfig: finalMintConfig,
          phases: mintSettingsTab === 'advanced' && mintPhases.length > 0 ? mintPhases : undefined,
        },
        (phase) => {
          if (phase === 'guards') {
            setDropPhase('candy-guard');
            setStatus('Applying mint rules\u2026 Approve in your wallet.');
          }
        },
      );

      // Store CM addresses and phases in the collection metadata
      finalMintConfig.candyMachineAddress = candyMachineAddress;
      finalMintConfig.candyGuardAddress = candyGuardAddress;
      const updatedMetadata: Record<string, unknown> = {
        ...metadata,
        mint_config: finalMintConfig,
        ...(mintSettingsTab === 'advanced' && mintPhases.length > 0 ? { mint_phases: mintPhases } : {}),
      };
      setDropPhase('finalizing');
      setStatus('Saving final drop configuration\u2026 Approve in your wallet.');
      let finalMetadataUrl: string;
      if (!useLocalStorage) {
        const irys = await createIrysUploader(wallet);
        finalMetadataUrl = await irysUploadJson(irys, updatedMetadata);
      } else {
        finalMetadataUrl = await uploadMetadataToArweave(metaplex, updatedMetadata);
      }
      const collectionNft = await metaplex.nfts().findByMint({
        mintAddress: collectionMintPk,
      });
      await metaplex.nfts().update({
        nftOrSft: collectionNft,
        uri: finalMetadataUrl,
      });

      setDropPhase('success');
      setStatus('');
      setCreatedCollectionAddress(collectionMintAddr);
      toast('Drop created with on-chain mint rules!', 'success');
    } catch (error) {
      console.error('Failed:', error);
      const msg = (error as Error).message || String(error);
      if (msg.includes('User rejected') || msg.includes('Transaction rejected')) {
        setDropError('Transaction rejected \u2014 no changes were made.');
      } else {
        setDropError(msg);
      }
      setStatus('');
    }
  }

  function handleDropProgressClose() {
    setCreating(false);
    setDropPhase('');
    setDropError(null);
    setStatus('');
    onCreatingChange?.(false);
  }

  // Empty state
  if (!previewUrl) {
    if (fullViewport) {
      return (
        <div
          className="flex-1 min-w-0 flex flex-col items-center justify-center bg-[var(--background)]/10 relative overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[min(80vmax,600px)] h-[min(80vmax,600px)] rounded-full border border-gray-300/40 dark:border-gray-600/40" />
            <div className="absolute w-[min(60vmax,450px)] h-[min(60vmax,450px)] rounded-full border border-gray-300/30 dark:border-gray-600/30" />
            <div className="absolute w-[min(40vmax,300px)] h-[min(40vmax,300px)] rounded-full border border-gray-300/20 dark:border-gray-600/20" />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-md">
            <div className="w-16 h-16 md:w-20 md:h-20 mb-6 text-gray-400 dark:text-gray-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Create your Drop
            </h2>
            <p className="text-body text-gray-500 dark:text-gray-400 mb-8">
              Drop your VRM or GLB file here, or click below to configure your drop.
            </p>
            <label className="btn-hero-primary cursor-pointer inline-block py-4 px-8">
              <span>Choose VRM / GLB for drop</span>
              <input type="file" accept=".vrm,.glb" onChange={handleFileInput} className="hidden" />
            </label>
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-2xl mx-auto">
        <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 mb-6">Create Drop</h2>
        <VRMUploader onFileSelected={handleFile} />
      </div>
    );
  }

  const isGlbFile = vrmMetadata?.fileType === 'glb';
  const stepLabels = {
    1: isGlbFile ? 'GLB Metadata' : 'VRM Metadata',
    2: 'Drop Details',
    3: 'Mint Settings',
    4: 'Confirmation',
    5: 'Launch',
  } as const;

  const stepNumbers = [1, 2, 3, 4, 5] as const;

  // Main interface with VRM loaded
  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      {/* Success overlay */}
      {createdCollectionAddress && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[var(--background)] border border-gray-200/30 dark:border-gray-700/20 shadow-2xl max-w-md w-full p-8 text-center animate-slide-up">
            <div className="mx-auto w-16 h-16 bg-orange-400/10 border border-orange-400/20 flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Drop Created!
            </h2>
            <p className="text-body text-gray-600 dark:text-gray-400 mb-6">
              Your drop is live and ready for public minting.
            </p>
            <button 
              onClick={() => router.push(`/drop/${createdCollectionAddress}`)}
              className="btn-hero-primary w-full py-4"
            >
              View Drop
            </button>
          </div>
        </div>
      )}

      {/* ═══ Left Panel ═══ */}
      <div className={`w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 border-r border-gray-200/30 dark:border-gray-700/20 flex flex-col ${fullViewport ? 'h-full' : 'min-h-[600px]'}`}>
        {/* Header */}
        <div className="flex-shrink-0 px-6 lg:px-8 pt-6 pb-3 border-b border-gray-200/30 dark:border-gray-700/20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Step {dropStep}: {stepLabels[dropStep]}
            </h2>
            <span className="text-caption text-orange-400/60 font-mono">
              {dropStep} / 5
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-0.5 bg-gray-200/30 dark:bg-gray-700/30 overflow-hidden">
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{
                width: `${(dropStep / 5) * 100}%`,
                background: 'linear-gradient(90deg, rgba(251,146,60,0.6), rgba(245,158,11,0.8))',
                boxShadow: '0 0 8px rgba(251,146,60,0.3)',
              }}
            />
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={stepContentScrollRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-6 lg:p-8 space-y-6">

            {/* ════════ STEP 1: Model Metadata Confirmation ════════ */}
            {dropStep === 1 ? (
              vrmMetadata && (
                <div className="space-y-5">
                  <section>
                    <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                      Basic Information
                    </p>
                    <div className="space-y-1.5 pt-1">
                      <MetadataRow label="Format" value={vrmMetadata.fileType === 'glb' ? 'GLB' : vrmMetadata.vrmType} />
                      {vrmMetadata.thumbnail && (
                        <div>
                          <span className="text-caption text-gray-500 dark:text-gray-400 block mb-0.5">Thumbnail</span>
                          <div className="w-16 h-16 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                            <img src={vrmMetadata.thumbnail} alt="Model thumbnail" className="w-full h-full object-cover" />
                          </div>
                        </div>
                      )}
                      <MetadataRow label="Model" value={vrmMetadata.title} />
                      <MetadataRow label="Author" value={vrmMetadata.author || '—'} />
                      <MetadataRow label="Version" value={vrmMetadata.version} />
                    </div>
                  </section>

                  <section>
                    <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                      License
                    </p>
                    {vrmMetadata.fileType === 'glb' ? (
                      <GLBLicenseSelector
                        license={glbLicense}
                        commercialUse={glbCommercialUse}
                        onLicenseChange={(v) => {
                          setGlbLicense(v);
                          setVrmMetadata((prev) => prev ? { ...prev, license: v } : prev);
                        }}
                        onCommercialUseChange={(v) => {
                          setGlbCommercialUse(v);
                          setVrmMetadata((prev) => prev ? { ...prev, commercialUse: v } : prev);
                        }}
                      />
                    ) : (
                      <div className="space-y-1.5 pt-1">
                        <MetadataRow label="License" value={vrmMetadata.license} />
                        <MetadataRow label="Commercial" value={vrmMetadata.commercialUse} />
                        <MetadataRow label="Violent" value={vrmMetadata.violentUse} />
                        <MetadataRow label="Sexual" value={vrmMetadata.sexualUse} />
                      </div>
                    )}
                  </section>

                  <section>
                    <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                      Model Statistics
                    </p>
                    <div className="space-y-1.5 pt-1">
                      <MetadataRow label="File Size" value={formatFileSize(vrmMetadata.fileSizeBytes)} />
                      <MetadataRow label="Height" value={`${vrmMetadata.heightMeters.toFixed(2)}m`} />
                      <MetadataRow label="Vertices" value={vrmMetadata.vertexCount.toLocaleString()} />
                      <MetadataRow label="Triangles" value={vrmMetadata.triangleCount.toLocaleString()} />
                      <MetadataRow label="Materials" value={vrmMetadata.materialCount.toString()} />
                      <MetadataRow label="Textures" value={vrmMetadata.textureCount.toString()} />
                      {vrmMetadata.fileType === 'vrm' && (
                        <>
                          <MetadataRow label="Bones" value={vrmMetadata.boneCount.toString()} />
                          <MetadataRow label="Blend Shapes" value={vrmMetadata.blendShapeCount.toString()} />
                        </>
                      )}
                      {vrmMetadata.fileType === 'glb' && (
                        <>
                          {vrmMetadata.skeletonBoneCount > 0 && (
                            <MetadataRow label="Skeleton Bones" value={vrmMetadata.skeletonBoneCount.toString()} />
                          )}
                          {vrmMetadata.animationCount > 0 && (
                            <MetadataRow label="Animations" value={vrmMetadata.animationCount.toString()} />
                          )}
                        </>
                      )}
                    </div>
                  </section>

                  {vrmMetadata.textures && vrmMetadata.textures.length > 0 && (
                    <section>
                      <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                        Textures
                      </p>
                      <div className="space-y-2 pt-1 max-h-[280px] overflow-y-auto">
                        {vrmMetadata.textures.map((tex, i) => (
                          <div key={i} className="flex gap-3 items-center py-1.5">
                            <div className="flex-shrink-0 w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                              <img src={tex.dataUri} alt={tex.name} className="w-full h-full object-cover pointer-events-none" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-caption font-medium text-gray-900 dark:text-gray-100 truncate" title={tex.name}>{tex.name}</p>
                              <p className="text-caption text-gray-500 dark:text-gray-400">
                                {tex.width}&times;{tex.height} &middot; {formatFileSize(tex.sizeBytes)} &middot; {tex.type}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )

            /* ════════ STEP 2: Drop Details ════════ */
            ) : dropStep === 2 ? (
              <>
                <p className="text-body text-gray-600 dark:text-gray-400">
                  Configure your drop collection details and thumbnail.
                </p>

                <div>
                  <label className="text-label block mb-2">Collection Name <span className="text-orange-400">*</span></label>
                  <input
                    type="text"
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value.slice(0, 32))}
                    className="input-forge"
                    placeholder="My Drop Collection"
                    maxLength={32}
                  />
                  {collectionName.length >= 28 && (
                    <p className="mt-1 text-xs text-gray-400">{collectionName.length}/32</p>
                  )}
                </div>

                <div>
                  <label className="text-label block mb-2">Symbol <span className="text-orange-400">*</span></label>
                  <input
                    type="text"
                    value={collectionSymbol}
                    onChange={(e) => setCollectionSymbol(e.target.value.toUpperCase())}
                    className="input-forge"
                    placeholder="DROP"
                    maxLength={10}
                  />
                </div>

                <div>
                  <label className="text-label block mb-2">Description</label>
                  <textarea
                    value={collectionDescription}
                    onChange={(e) => setCollectionDescription(e.target.value)}
                    className="input-forge"
                    rows={3}
                    placeholder="Describe your drop..."
                  />
                </div>

                {/* Custom Traits */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-label">Custom Traits</span>
                    <button
                      type="button"
                      onClick={() => setCustomTraits([...customTraits, { trait_type: '', value: '' }])}
                      className="text-small text-gray-500 hover:text-orange-400 transition-colors"
                    >
                      + Add Trait
                    </button>
                  </div>
                  <p className="text-caption text-gray-500 dark:text-gray-400 mb-3">
                    Add custom attributes that will appear on all NFTs minted from this drop.
                  </p>
                  {customTraits.map((trait, i) => (
                    <div key={i} className="flex gap-3 mb-3">
                      <input
                        type="text"
                        value={trait.trait_type}
                        onChange={(e) => {
                          const updated = [...customTraits];
                          updated[i].trait_type = e.target.value;
                          setCustomTraits(updated);
                        }}
                        placeholder="Trait name"
                        className="flex-1 input-forge !px-3 !py-2 text-small"
                      />
                      <input
                        type="text"
                        value={trait.value}
                        onChange={(e) => {
                          const updated = [...customTraits];
                          updated[i].value = e.target.value;
                          setCustomTraits(updated);
                        }}
                        placeholder="Value"
                        className="flex-1 input-forge !px-3 !py-2 text-small"
                      />
                      <button
                        type="button"
                        onClick={() => setCustomTraits(customTraits.filter((_, idx) => idx !== i))}
                        className="text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 px-2 transition-colors"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>

                <div className="divider-forge" />

                {/* Thumbnail */}
                <div>
                  <label className="text-label block mb-2">Thumbnail Image <span className="text-orange-400">*</span></label>
                  <p className="text-caption text-gray-500 dark:text-gray-400 mb-3">
                    A PNG or JPG used as the collection thumbnail. This is required.
                  </p>
                  {thumbnailPreview ? (
                    <div className="relative group">
                      <img src={thumbnailPreview} alt="Thumbnail" className="w-full aspect-video object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                      <button
                        onClick={removeThumbnail}
                        className="absolute top-2 right-2 bg-black/70 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <label
                      onDragOver={(e) => { e.preventDefault(); setThumbnailDragOver(true); }}
                      onDragLeave={() => setThumbnailDragOver(false)}
                      onDrop={handleThumbnailDrop}
                      className={`block cursor-pointer w-full p-8 border-2 border-dashed rounded-lg transition-colors ${
                        thumbnailDragOver
                          ? 'border-orange-400 bg-orange-400/5'
                          : thumbnailError
                          ? 'border-red-400/40 bg-red-400/5'
                          : 'border-gray-300/30 dark:border-gray-700/30 hover:border-gray-400/50 dark:hover:border-gray-600/50'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        <svg className={`w-10 h-10 mb-3 ${thumbnailDragOver ? 'text-orange-400' : thumbnailError ? 'text-red-400' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className={`text-body font-medium mb-1 ${thumbnailDragOver ? 'text-orange-400' : thumbnailError ? 'text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                          {thumbnailDragOver ? 'Drop image here' : thumbnailError ? 'Thumbnail is required' : 'Drop image or click to upload'}
                        </p>
                        <p className="text-caption text-gray-500 dark:text-gray-400">
                          PNG, JPG or WebP
                        </p>
                      </div>
                      <input type="file" accept="image/*" onChange={handleThumbnailSelect} className="hidden" />
                    </label>
                  )}
                </div>

                <div className="divider-forge" />

                {/* Additional Files — drag & drop multiple files */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-label">Additional Files</label>
                    <label className="text-small text-gray-500 hover:text-orange-400 cursor-pointer transition-colors">
                      + Add Files
                      <input
                        type="file"
                        accept=".glb,.vrm,.gltf,image/png,image/jpeg,image/jpg,image/webp"
                        multiple
                        onChange={handleAdditionalFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <p className="text-caption text-gray-500 dark:text-gray-400 mb-3">
                    Optional. Drag &amp; drop one or multiple files at once: GLB models, alternate VRMs, render images, or extra thumbnails. These will be included in the drop metadata.
                  </p>

                  {/* Drop zone (always shown) */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setAdditionalFilesDragOver(true); }}
                    onDragLeave={() => setAdditionalFilesDragOver(false)}
                    onDrop={handleAdditionalFilesDrop}
                    className={`block cursor-pointer w-full p-4 border-2 border-dashed rounded-lg transition-colors mb-3 ${
                      additionalFilesDragOver
                        ? 'border-orange-400/50 bg-orange-400/5'
                        : 'border-gray-300/30 dark:border-gray-700/30 hover:border-gray-400/50 dark:hover:border-gray-600/50'
                    }`}
                  >
                    <svg className={`w-6 h-6 mx-auto mb-1.5 ${additionalFilesDragOver ? 'text-orange-400' : 'text-gray-400/60'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                    </svg>
                    <p className={`text-caption text-center ${additionalFilesDragOver ? 'text-orange-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                      {additionalFilesDragOver ? 'Drop files here' : 'Drop files here — GLB, VRM, PNG, JPG'}
                    </p>
                  </div>

                  {/* File list */}
                  {additionalFiles.length > 0 && (
                    <div className="space-y-2">
                      {additionalFiles.map((af, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-3 border border-gray-200/30 dark:border-gray-700/20 bg-gray-50/30 dark:bg-gray-800/15 rounded-lg"
                        >
                          {af.type === 'image' ? (
                            <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                              <img src={af.previewUrl} alt={af.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <>
                              {af.name.toLowerCase().endsWith('.vrm') ? (
                                <IconVRM className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                              ) : af.name.toLowerCase().endsWith('.glb') ? (
                                <IconGLB className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                              ) : (
                                <Icon3DCube className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                              )}
                            </>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-small font-medium text-gray-900 dark:text-gray-100 truncate">{af.name}</p>
                            <p className="text-caption text-gray-500 dark:text-gray-400">
                              {af.type === 'model' ? '3D Model' : 'Image'} · {formatFileSize(af.file.size)}
                            </p>
                          </div>
                          {af.type === 'model' && (
                            <button
                              type="button"
                              onClick={() => {
                                const modelIdx = additionalFiles.slice(0, i).filter((f) => f.type === 'model').length + 1;
                                setActiveModelIndex(modelIdx);
                              }}
                              className="text-caption text-gray-500 hover:text-orange-400 transition-colors"
                              title="Preview in 3D viewer"
                            >
                              View
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAdditionalFile(i)}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1"
                            title="Remove file"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>

            /* ════════ STEP 3: Mint Settings ════════ */
            ) : dropStep === 3 ? (
              <div className="space-y-6">
                <p className="text-body text-gray-600 dark:text-gray-400">
                  Configure how users will mint from this drop. These settings were moved from the previous drop configuration.
                </p>

                {/* Drop Type */}
                <div>
                  <label className="text-label block mb-3">Drop Type</label>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors hover:border-orange-400/50"
                      style={{
                        borderColor: mintConfig.isDutchAuction ? 'rgb(251 146 60 / 0.3)' : 'rgb(229 231 235 / 0.3)',
                        backgroundColor: mintConfig.isDutchAuction ? 'rgb(251 146 60 / 0.05)' : 'transparent',
                      }}
                    >
                      <input
                        type="radio"
                        checked={mintConfig.isDutchAuction}
                        onChange={() =>
                          setMintConfig({
                            ...mintConfig,
                            isDutchAuction: true,
                            dutchAuction: { startPrice: 1, endPrice: 0.1, durationHours: 24 },
                          })
                        }
                        className="mt-0.5 w-5 h-5 text-orange-400"
                      />
                      <div className="flex-1">
                        <p className="text-body font-bold text-gray-900 dark:text-gray-100 mb-1">
                          Dutch Auction
                        </p>
                        <p className="text-small text-gray-500 dark:text-gray-400">
                          Price starts high and decreases over time
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors hover:border-orange-400/50"
                      style={{
                        borderColor: !mintConfig.isDutchAuction ? 'rgb(251 146 60 / 0.3)' : 'rgb(229 231 235 / 0.3)',
                        backgroundColor: !mintConfig.isDutchAuction ? 'rgb(251 146 60 / 0.05)' : 'transparent',
                      }}
                    >
                      <input
                        type="radio"
                        checked={!mintConfig.isDutchAuction}
                        onChange={() =>
                          setMintConfig({
                            ...mintConfig,
                            isDutchAuction: false,
                            dutchAuction: undefined,
                          })
                        }
                        className="mt-0.5 w-5 h-5 text-orange-400"
                      />
                      <div className="flex-1">
                        <p className="text-body font-bold text-gray-900 dark:text-gray-100 mb-1">
                          Open Edition
                        </p>
                        <p className="text-small text-gray-500 dark:text-gray-400">
                          Fixed price with optional supply limits
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Open Edition only: Default vs Advanced (phases) tabs */}
                {!mintConfig.isDutchAuction && (
                  <div className="flex gap-2 border-b border-gray-200/30 dark:border-gray-700/30">
                    <button
                      type="button"
                      onClick={() => {
                        if (mintSettingsTab === 'advanced' && mintPhases.length > 0) {
                          const first = mintPhases[0];
                          const firstMints = getPhaseTokenHolderMints(first);
                          setMintConfig({
                            ...mintConfig,
                            price: first.price,
                            maxSupply: first.maxSupply,
                            maxPerWallet: first.maxPerWallet,
                            startDate: first.startDate,
                            endDate: first.endDate,
                            access: first.access ?? 'anyone',
                            tokenHolderMints: firstMints.length > 0 ? firstMints : undefined,
                            tokenHolderMint: undefined,
                            allowlistAddresses: first.allowlistAddresses,
                            requiresAllowlist: (first.allowlistAddresses?.length ?? 0) > 0,
                          });
                        }
                        setMintSettingsTab('default');
                      }}
                      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                        mintSettingsTab === 'default'
                          ? 'border-orange-400 text-orange-400'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                      }`}
                    >
                      Default
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Always sync the first phase from mintConfig when switching to Advanced
                        // (mintPhases starts with a default price:0 item, so we can't rely on
                        // mintPhases.length === 0 — that condition was the root cause of phases
                        // inheriting price=0 instead of the user-set mintConfig.price).
                        if (mintSettingsTab === 'default') {
                          const mints = getMintConfigTokenHolderMints(mintConfig);
                          if (mintPhases.length <= 1) {
                            setMintPhases([
                              {
                                price: mintConfig.price,
                                maxSupply: mintConfig.maxSupply,
                                maxPerWallet: mintConfig.maxPerWallet,
                                startDate: mintConfig.startDate,
                                endDate: mintConfig.endDate,
                                access: mintConfig.access ?? 'anyone',
                                tokenHolderMints: mints.length > 0 ? mints : undefined,
                                allowlistAddresses: mintConfig.allowlistAddresses,
                              },
                            ]);
                          }
                        }
                        setMintSettingsTab('advanced');
                      }}
                      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                        mintSettingsTab === 'advanced'
                          ? 'border-orange-400 text-orange-400'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                      }`}
                    >
                      Advanced
                    </button>
                  </div>
                )}

                {/* Dutch Auction: single config (no phases) */}
                {mintConfig.isDutchAuction && (
                  <>
                    <div className="divider-forge" />
                <div className="space-y-4">
                    <div className="p-3 bg-orange-50 dark:bg-orange-900/10 border border-orange-200/50 dark:border-orange-800/50 rounded-lg">
                      <p className="text-small text-orange-800 dark:text-orange-200">
                        <strong>How it works:</strong> The price starts high and decreases linearly over the duration. 
                        The auction begins when you launch the drop{mintConfig.startDate ? ' or at the scheduled start time' : ''}.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-label block mb-2">Starting Price (SOL)</label>
                        <ForgeNumberInput
                          step="0.01"
                          min="0"
                          value={mintConfig.dutchAuction?.startPrice ?? 1}
                          onValueChange={(v) => {
                            const next = parseFloat(v) || 0;
                            setMintConfig({
                              ...mintConfig,
                              dutchAuction: {
                                ...(mintConfig.dutchAuction || { startPrice: 1, endPrice: 0.1, durationHours: 24 }),
                                startPrice: next,
                              },
                              price: next,
                            });
                          }}
                          placeholder="1"
                        />
                        <p className="text-caption text-gray-500 dark:text-gray-400 mt-1">
                          Highest price at auction start
                        </p>
                      </div>

                      <div>
                        <label className="text-label block mb-2">Floor Price (SOL)</label>
                        <ForgeNumberInput
                          step="0.01"
                          min="0"
                          value={mintConfig.dutchAuction?.endPrice ?? 0.1}
                          onValueChange={(v) => {
                            const next = parseFloat(v) || 0;
                            setMintConfig({
                              ...mintConfig,
                              dutchAuction: {
                                ...(mintConfig.dutchAuction || { startPrice: 1, endPrice: 0.1, durationHours: 24 }),
                                endPrice: next,
                              },
                            });
                          }}
                          placeholder="0.1"
                        />
                        <p className="text-caption text-gray-500 dark:text-gray-400 mt-1">
                          Lowest price at auction end
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="text-label block mb-3">
                        Auction Duration
                      </label>

                      {/* Tab Switcher */}
                      <div className="flex gap-2 mb-4 border-b border-gray-200/30 dark:border-gray-700/30">
                        <button
                          type="button"
                          onClick={() => setDurationMode('quick')}
                          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                            durationMode === 'quick'
                              ? 'border-orange-400 text-orange-400'
                              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                        >
                          Quick Options
                        </button>
                        <button
                          type="button"
                          onClick={() => setDurationMode('advanced')}
                          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                            durationMode === 'advanced'
                              ? 'border-orange-400 text-orange-400'
                              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                        >
                          Advanced Options
                        </button>
                      </div>

                      {/* Quick Options */}
                      {durationMode === 'quick' ? (
                        <div className="space-y-3">
                          <p className="text-caption text-gray-500 dark:text-gray-400">
                            Choose a preset or enter custom hours. Auction starts immediately when you launch.
                          </p>
                          
                          {/* Text Input for Hours */}
                          <div>
                            <label className="text-caption block mb-2 text-gray-700 dark:text-gray-300 font-medium">
                              Duration (Hours)
                            </label>
                            <ForgeNumberInput
                              min="1"
                              value={mintConfig.dutchAuction?.durationHours ?? 24}
                              onValueChange={(v) => {
                                setMintConfig({
                                  ...mintConfig,
                                  startDate: null,
                                  endDate: null,
                                  dutchAuction: {
                                    ...(mintConfig.dutchAuction || { startPrice: 1, endPrice: 0.1, durationHours: 24 }),
                                    durationHours: parseInt(v) || 1,
                                  },
                                });
                              }}
                              placeholder="24"
                            />
                          </div>

                          {/* Quick Presets */}
                          <div className="flex flex-wrap gap-2">
                            {[6, 12, 24, 48, 72].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  setMintConfig({
                                    ...mintConfig,
                                    startDate: null,
                                    endDate: null,
                                    dutchAuction: {
                                      ...(mintConfig.dutchAuction || { startPrice: 1, endPrice: 0.1, durationHours: 24 }),
                                      durationHours: preset,
                                    },
                                  });
                                }}
                                className={`chip-forge ${
                                  mintConfig.dutchAuction?.durationHours === preset && !mintConfig.startDate && !mintConfig.endDate
                                    ? 'chip-forge-active'
                                    : 'text-gray-600 dark:text-gray-400'
                                }`}
                              >
                                {preset}h
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Advanced Options */
                        <div className="space-y-4">
                          <p className="text-caption text-gray-500 dark:text-gray-400">
                            Schedule exact start and finish times for your auction.
                          </p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Start Time */}
                            <div>
                              <label className="text-caption block mb-2 text-gray-700 dark:text-gray-300 font-medium">
                                Start Time
                              </label>
                              <DateTimePicker
                                value={mintConfig.startDate || undefined}
                                onChange={(value) => {
                                  setMintConfig({ ...mintConfig, startDate: value });
                                  // Recalculate duration if both start and end are set
                                  if (value && mintConfig.endDate) {
                                    const durationMs = new Date(mintConfig.endDate).getTime() - new Date(value).getTime();
                                    const durationHours = Math.max(1, Math.round(durationMs / (1000 * 60 * 60)));
                                    setMintConfig({
                                      ...mintConfig,
                                      startDate: value,
                                      dutchAuction: {
                                        ...(mintConfig.dutchAuction || { startPrice: 1, endPrice: 0.1, durationHours: 24 }),
                                        durationHours,
                                      },
                                    });
                                  }
                                }}
                                placeholder="Start immediately when launched"
                              />
                              <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                                Leave empty to start immediately
                              </p>
                            </div>

                            {/* Finish Time */}
                            <div>
                              <label className="text-caption block mb-2 text-gray-700 dark:text-gray-300 font-medium">
                                Finish Time
                              </label>
                              <DateTimePicker
                                value={mintConfig.endDate || undefined}
                                minDate={mintConfig.startDate ?? new Date().toISOString()}
                                onChange={(value) => {
                                  setMintConfig({ ...mintConfig, endDate: value });
                                  // Calculate duration from start to end
                                  if (mintConfig.startDate && value) {
                                    const durationMs = new Date(value).getTime() - new Date(mintConfig.startDate).getTime();
                                    const durationHours = Math.max(1, Math.round(durationMs / (1000 * 60 * 60)));
                                    setMintConfig({
                                      ...mintConfig,
                                      endDate: value,
                                      dutchAuction: {
                                        ...(mintConfig.dutchAuction || { startPrice: 1, endPrice: 0.1, durationHours: 24 }),
                                        durationHours,
                                      },
                                    });
                                  } else if (!mintConfig.startDate && value) {
                                    // If only end date is set, calculate from "now" (or when they launch)
                                    const now = Date.now();
                                    const durationMs = new Date(value).getTime() - now;
                                    const durationHours = Math.max(1, Math.round(durationMs / (1000 * 60 * 60)));
                                    setMintConfig({
                                      ...mintConfig,
                                      endDate: value,
                                      dutchAuction: {
                                        ...(mintConfig.dutchAuction || { startPrice: 1, endPrice: 0.1, durationHours: 24 }),
                                        durationHours,
                                      },
                                    });
                                  }
                                }}
                                placeholder="Set finish time"
                              />
                              <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                                When the auction reaches floor price
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Timeline Preview - shown for both modes */}
                      {mintConfig.dutchAuction && (
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-800/50 rounded-lg">
                          <p className="text-small text-blue-800 dark:text-blue-200">
                            <strong>📅 Timeline:</strong>{' '}
                            {mintConfig.startDate 
                              ? `Starts ${new Date(mintConfig.startDate).toLocaleString()}`
                              : 'Starts immediately on launch'}
                            {', '}
                            runs {mintConfig.dutchAuction.durationHours}h
                            {mintConfig.endDate && ` (ends ${new Date(mintConfig.endDate).toLocaleString()})`}
                            {', '}
                            price drops from {mintConfig.dutchAuction.startPrice} to {mintConfig.dutchAuction.endPrice} SOL
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                <div className="divider-forge" />

                {/* Max Supply - Dutch */}
                <div>
                  <label className="text-label block mb-2">Max Supply</label>
                  <ForgeNumberInput
                    min="1"
                    value={mintConfig.maxSupply ?? ''}
                    onValueChange={(v) =>
                      setMintConfig({ ...mintConfig, maxSupply: v ? parseInt(v) : null })
                    }
                    placeholder="Defaults to 100,000"
                  />
                  <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                    Total number of NFTs that can be minted. Defaults to 100,000 if not set.
                  </p>
                  <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200/60 dark:border-amber-700/30">
                    <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-xs text-amber-700 dark:text-amber-400/90">
                      Supply cap is permanent and cannot be increased after launch. Choose carefully.
                    </p>
                  </div>
                </div>

                {/* Max Per Wallet - Dutch */}
                <div>
                  <label className="text-label block mb-2">Max Per Wallet</label>
                  <ForgeNumberInput
                    min="1"
                    value={mintConfig.maxPerWallet ?? ''}
                    onValueChange={(v) =>
                      setMintConfig({ ...mintConfig, maxPerWallet: v ? parseInt(v) : null })
                    }
                    placeholder="Leave empty for unlimited"
                  />
                  <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                    Prevent whales from minting everything.
                  </p>
                </div>

                <div className="divider-forge" />

                {/* Access - Dutch */}
                <div className="space-y-3">
                  <p className="text-label font-medium text-gray-900 dark:text-gray-100">Access</p>
                  <p className="text-caption text-gray-500 dark:text-gray-400">
                    Who can mint from this drop
                  </p>
                  <CreateDropAccessBlock
                    radioName="access-dutch"
                    access={mintConfig.access}
                    tokenHolderMints={getMintConfigTokenHolderMints(mintConfig)}
                    allowlistAddresses={mintConfig.allowlistAddresses}
                    onChange={(patch) => setMintConfig((prev) => ({ ...prev, ...patch }))}
                  />
                </div>

                  </>
                )}

                {/* Open Edition Default tab: Price, Max Supply, Max Per Wallet, Schedule */}
                {!mintConfig.isDutchAuction && mintSettingsTab === 'default' && (
                  <>
                <div className="divider-forge" />

                {/* Price */}
                <div>
                  <label className="text-label block mb-2">Mint Price (SOL)</label>
                  <ForgeNumberInput
                    step="0.01"
                    min="0"
                    value={mintConfig.price}
                    onValueChange={(v) => setMintConfig({ ...mintConfig, price: parseFloat(v) || 0 })}
                    placeholder="0.5"
                  />
                  <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                    Set to 0 for free mints.
                  </p>
                  <div className="flex gap-2 mt-2">
                    {[0, 0.1, 0.25, 0.5, 1, 2].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setMintConfig({ ...mintConfig, price: preset })}
                        className={`chip-forge ${
                          mintConfig.price === preset
                            ? 'chip-forge-active'
                            : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {preset === 0 ? 'Free' : `${preset} SOL`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divider-forge" />

                {/* Max Supply */}
                <div>
                  <label className="text-label block mb-2">Max Supply</label>
                  <ForgeNumberInput
                    min="1"
                    value={mintConfig.maxSupply ?? ''}
                    onValueChange={(v) =>
                      setMintConfig({ ...mintConfig, maxSupply: v ? parseInt(v) : null })
                    }
                    placeholder="Defaults to 100,000"
                  />
                  <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                    Total number of NFTs that can be minted. Defaults to 100,000 if not set.
                  </p>
                  <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200/60 dark:border-amber-700/30">
                    <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-xs text-amber-700 dark:text-amber-400/90">
                      Supply cap is permanent and cannot be increased after launch. Choose carefully.
                    </p>
                  </div>
                </div>

                {/* Max Per Wallet */}
                <div>
                  <label className="text-label block mb-2">Max Per Wallet</label>
                  <ForgeNumberInput
                    min="1"
                    value={mintConfig.maxPerWallet ?? ''}
                    onValueChange={(v) =>
                      setMintConfig({ ...mintConfig, maxPerWallet: v ? parseInt(v) : null })
                    }
                    placeholder="Leave empty for unlimited"
                  />
                  <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                    Prevent whales from minting everything.
                  </p>
                </div>

                <div className="divider-forge" />

                {/* Schedule */}
                <div>
                  <label className="text-label block mb-2">Drop Schedule (Optional)</label>
                    <p className="text-caption text-gray-500 dark:text-gray-400 mb-3">
                      Set when minting should start and end. Leave empty to start immediately and run indefinitely.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-caption block mb-2 text-gray-500 dark:text-gray-400">
                          Mint Start Time
                        </label>
                        <DateTimePicker
                          value={mintConfig.startDate || undefined}
                          onChange={(value) => setMintConfig({ ...mintConfig, startDate: value })}
                          placeholder="Start immediately"
                        />
                        <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                          When minting becomes available
                        </p>
                      </div>

                      <div>
                        <label className="text-caption block mb-2 text-gray-500 dark:text-gray-400">
                          Mint End Time
                        </label>
                        <DateTimePicker
                          value={mintConfig.endDate || undefined}
                          minDate={mintConfig.startDate ?? new Date().toISOString()}
                          onChange={(value) => setMintConfig({ ...mintConfig, endDate: value })}
                          placeholder="No end time"
                        />
                        <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                          When minting closes
                        </p>
                      </div>
                    </div>
                </div>

                <div className="divider-forge" />

                {/* Access - Open Edition Default */}
                <div className="space-y-3">
                  <p className="text-label font-medium text-gray-900 dark:text-gray-100">Access</p>
                  <p className="text-caption text-gray-500 dark:text-gray-400">
                    Who can mint from this drop
                  </p>
                  <CreateDropAccessBlock
                    radioName="access-default"
                    access={mintConfig.access}
                    tokenHolderMints={getMintConfigTokenHolderMints(mintConfig)}
                    allowlistAddresses={mintConfig.allowlistAddresses}
                    onChange={(patch) => setMintConfig((prev) => ({ ...prev, ...patch }))}
                  />
                </div>

                  </>
                )}

                {!mintConfig.isDutchAuction && mintSettingsTab === 'advanced' && (
                  <div className="space-y-4 pt-2">
                    <p className="text-caption text-gray-500 dark:text-gray-400">
                      Add multiple phases with different prices, supply caps, per-wallet limits, and schedules. Lock an end date on the current phase before adding the next.
                    </p>
                    {hasPhaseErrors && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg">
                        <p className="text-small text-red-800 dark:text-red-200 font-medium">
                          Fix the highlighted phases below: each phase must have start before end, and no two phases may overlap in time. You cannot continue to review until this is fixed.
                        </p>
                      </div>
                    )}
                    {mintPhases.map((phase, index) => (
                      <div
                        key={index}
                        className={`p-4 border-2 rounded-lg space-y-4 transition-colors ${
                          phaseValidationErrors.has(index)
                            ? 'border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-900/20'
                            : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-900/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-label font-medium">Phase {index + 1}</span>
                          {phaseValidationErrors.has(index) && (
                            <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                              Adjust start/end dates
                            </span>
                          )}
                          {mintPhases.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setMintPhases((prev) => prev.filter((_, i) => i !== index))
                              }
                              className="text-gray-400 hover:text-red-500 transition-colors p-1"
                              title="Remove phase"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-caption block mb-2 text-gray-700 dark:text-gray-300 font-medium">
                              Price (SOL)
                            </label>
                            <ForgeNumberInput
                              step="0.01"
                              min="0"
                              value={phase.price}
                              onValueChange={(v) => {
                                const next = parseFloat(v) || 0;
                                setMintPhases((prev) =>
                                  prev.map((p, i) => (i === index ? { ...p, price: next } : p))
                                );
                              }}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="text-caption block mb-2 text-gray-700 dark:text-gray-300 font-medium">
                              Max supply (this phase)
                            </label>
                            <ForgeNumberInput
                              min="1"
                              value={phase.maxSupply ?? ''}
                              onValueChange={(v) => {
                                const next = v ? parseInt(v) : null;
                                setMintPhases((prev) =>
                                  prev.map((p, i) => (i === index ? { ...p, maxSupply: next } : p))
                                );
                              }}
                              placeholder="Unlimited"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-caption block mb-2 text-gray-700 dark:text-gray-300 font-medium">
                            Max per wallet (this phase)
                          </label>
                          <ForgeNumberInput
                            containerClassName="w-full md:max-w-xs"
                            min="1"
                            value={phase.maxPerWallet ?? ''}
                            onValueChange={(v) => {
                              const next = v ? parseInt(v) : null;
                              setMintPhases((prev) =>
                                prev.map((p, i) => (i === index ? { ...p, maxPerWallet: next } : p))
                              );
                            }}
                            placeholder="Unlimited"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-caption block mb-2 text-gray-700 dark:text-gray-300 font-medium">
                              Phase start
                            </label>
                            <DateTimePicker
                              value={phase.startDate || undefined}
                              onChange={(value) =>
                                setMintPhases((prev) =>
                                  prev.map((p, i) => (i === index ? { ...p, startDate: value } : p))
                                )
                              }
                              placeholder={index === 0 ? 'Start immediately' : 'After previous phase ends'}
                              minDate={
                                index === 0
                                  ? new Date().toISOString()
                                  : (mintPhases[index - 1]?.endDate ?? new Date().toISOString())
                              }
                            />
                            {index > 0 && !mintPhases[index - 1]?.endDate && (
                              <p className="text-caption text-amber-600 dark:text-amber-400 mt-1">
                                Lock an end date on Phase {index} first.
                              </p>
                            )}
                          </div>
                          <div
                            key={`phase-end-${index}-${addPhaseHintPhaseIndex === index ? addPhaseHintTrigger : 0}`}
                            className={`rounded-lg ${
                              addPhaseHintPhaseIndex === index
                                ? 'phase-end-highlight-forge'
                                : ''
                            }`}
                          >
                            <label className="text-caption block mb-2 text-gray-700 dark:text-gray-300 font-medium">
                              Phase end
                            </label>
                            <DateTimePicker
                              value={phase.endDate || undefined}
                              onChange={(value) => {
                                setMintPhases((prev) =>
                                  prev.map((p, i) => (i === index ? { ...p, endDate: value } : p))
                                );
                                if (addPhaseHintPhaseIndex === index) setAddPhaseHintPhaseIndex(null);
                              }}
                              placeholder="No end time"
                              minDate={
                                phase.startDate
                                  ?? (index === 0
                                        ? new Date().toISOString()
                                        : (mintPhases[index - 1]?.endDate ?? new Date().toISOString()))
                              }
                            />
                            {phase.startDate && !phase.endDate && (
                              <p className="text-caption text-gray-500 dark:text-gray-400 mt-1">
                                Set end to lock this phase and allow adding the next.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Access - this phase */}
                        <div className="pt-4 mt-4 border-t border-gray-200/50 dark:border-gray-700/50">
                          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                            <p className="text-caption font-medium text-gray-700 dark:text-gray-300">Access (this phase)</p>
                            {index > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const prevPhase = mintPhases[index - 1];
                                  const prevMints = getPhaseTokenHolderMints(prevPhase);
                                  setMintPhases((prev) =>
                                    prev.map((p, i) =>
                                      i === index
                                        ? {
                                            ...p,
                                            access: prevPhase.access ?? 'anyone',
                                            tokenHolderMints: prevMints.length > 0 ? [...prevMints] : undefined,
                                            tokenHolderMint: undefined,
                                            allowlistAddresses: prevPhase.allowlistAddresses?.length
                                              ? [...prevPhase.allowlistAddresses]
                                              : undefined,
                                          }
                                        : p
                                    )
                                  );
                                }}
                                className="text-small text-orange-500 hover:text-orange-400 font-medium"
                              >
                                Use previous phase access
                              </button>
                            )}
                          </div>
                          <CreateDropAccessBlock
                            radioName={`phase-access-${index}`}
                            access={phase.access}
                            tokenHolderMints={getPhaseTokenHolderMints(phase)}
                            allowlistAddresses={phase.allowlistAddresses}
                            onChange={(patch) =>
                              setMintPhases((prev) =>
                                prev.map((p, i) => (i === index ? { ...p, ...patch } : p))
                              )
                            }
                            compact
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const last = mintPhases.length > 0 ? mintPhases[mintPhases.length - 1] : null;
                        if (last && !last.endDate) {
                          setAddPhaseHintPhaseIndex(mintPhases.length - 1);
                          setAddPhaseHintTrigger((t) => t + 1);
                          return;
                        }
                        setAddPhaseHintPhaseIndex(null);
                        setMintPhases((prev) => [
                          ...prev,
                          // Inherit price from the last phase so a new phase doesn't silently default to free
                          { price: prev[prev.length - 1]?.price ?? mintConfig.price, maxSupply: null, maxPerWallet: null, startDate: null, endDate: null, access: 'anyone' },
                        ]);
                      }}
                      className="btn-forge-outline w-full sm:w-auto"
                    >
                      + Add phase
                    </button>
                    {addPhaseHintPhaseIndex !== null && (
                      <p className="text-small text-orange-600 dark:text-orange-400 mt-2">
                        Set an end date on <strong>Phase {addPhaseHintPhaseIndex + 1}</strong> above to lock it, then you can add the next phase.
                      </p>
                    )}
                  </div>
                )}

                <div className="divider-forge" />

                {/* Royalties */}
                <div>
                  <label className="text-label block mb-2">Royalties (%)</label>
                  <div className="flex items-center gap-4 mb-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.5}
                      value={royaltyPercent}
                      onChange={(e) => setRoyaltyPercent(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-200/30 dark:bg-gray-700/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(251,146,60,0.4)]"
                    />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <ForgeNumberInput
                        containerClassName="w-16"
                        inputClassName="text-center !px-2 !py-1.5 text-small"
                        min={0}
                        max={100}
                        step={0.5}
                        value={royaltyPercent}
                        onValueChange={(v) => {
                          const val = parseFloat(v);
                          if (!isNaN(val)) setRoyaltyPercent(Math.max(0, Math.min(100, val)));
                        }}
                      />
                      <span className="text-small text-gray-500 dark:text-gray-400">%</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[0, 2.5, 5, 7.5, 10].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRoyaltyPercent(preset)}
                        className={`chip-forge ${
                          royaltyPercent === preset
                            ? 'chip-forge-active'
                            : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                  <p className="text-caption text-gray-500 dark:text-gray-400 mt-2">
                    Percentage you earn on secondary sales
                  </p>
                </div>

                <div className="divider-forge" />

                {/* Split Revenues */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-4 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg border border-gray-200/30 dark:border-gray-700/20">
                    <div>
                      <p className="text-body font-bold text-gray-900 dark:text-gray-100">
                        Split revenues
                      </p>
                      <p className="text-caption text-gray-500 dark:text-gray-400">
                        Split mint revenue (and optionally royalties) between multiple wallets
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={revenueSplitsEnabled}
                      onClick={() => {
                        const enabling = !revenueSplitsEnabled;
                        setRevenueSplitsEnabled(enabling);
                        if (enabling) {
                          setRevenueSplits((prev) => {
                            const me = wallet.publicKey?.toString() ?? '';
                            if (!prev || prev.length === 0) {
                              return [{ address: me, percent: 100 }];
                            }
                            const next = prev.map((s) => ({
                              address: (s.address || '').trim(),
                              percent: Number.isFinite(s.percent) ? Math.round(s.percent) : 0,
                            }));
                            if (!next[0].address && me) next[0].address = me;
                            return next;
                          });
                        }
                      }}
                      className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ${
                        revenueSplitsEnabled
                          ? 'bg-orange-400'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${
                          revenueSplitsEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {revenueSplitsEnabled && (() => {
                    const n = revenueSplits.length;

                    function setRevenueSplitPercent(idx: number, rawVal: number) {
                      const val = Math.round(Math.max(0, Math.min(100, rawVal)));
                      if (n <= 1) {
                        setRevenueSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, percent: 100 } : s)));
                        return;
                      }
                      setRevenueSplits((prev) => {
                        if (idx === n - 1) {
                          // Last row: set last to val, redistribute (100 - val) among first n-1 proportionally
                          const newLast = val;
                          const sumFirst = prev.slice(0, n - 1).reduce((s, r) => s + (Number.isFinite(r.percent) ? r.percent : 0), 0);
                          const toDistribute = 100 - newLast;
                          if (sumFirst <= 0) {
                            const equal = Math.floor(toDistribute / (n - 1));
                            const remainder = toDistribute - equal * (n - 1);
                            return prev.map((s, i) =>
                              i < n - 1 ? { ...s, percent: equal + (i === 0 ? remainder : 0) } : { ...s, percent: newLast }
                            );
                          }
                          const rounded = prev.slice(0, n - 1).map((s) =>
                            Math.round((toDistribute * (Number.isFinite(s.percent) ? s.percent : 0)) / sumFirst)
                          );
                          const diff = toDistribute - rounded.reduce((a, b) => a + b, 0);
                          if (diff !== 0) rounded[0] = Math.max(0, rounded[0] + diff);
                          return prev.map((s, i) =>
                            i < n - 1 ? { ...s, percent: rounded[i] } : { ...s, percent: newLast }
                          );
                        }
                        const othersSum = prev
                          .slice(0, n - 1)
                          .reduce((sum, s, i) => sum + (i === idx ? 0 : (Number.isFinite(s.percent) ? s.percent : 0)), 0);
                        const clamped = Math.min(val, 100 - othersSum);
                        const next = prev.map((s, i) =>
                          i === idx ? { ...s, percent: clamped } : i === n - 1 ? { ...s, percent: Math.max(0, 100 - othersSum - clamped) } : s
                        );
                        return next;
                      });
                    }

                    function addRecipient() {
                      setRevenueSplits((prev) => {
                        if (prev.length === 0) {
                          return [{ address: wallet.publicKey?.toString() ?? '', percent: 100 }];
                        }
                        const k = prev.length + 1;
                        const equal = Math.floor(100 / k);
                        const remainder = 100 - equal * k;
                        return [
                          ...prev.map((s) => ({ ...s, percent: equal })),
                          { address: '', percent: equal + remainder },
                        ];
                      });
                    }

                    function removeRecipient(removeIdx: number) {
                      if (n <= 1) return;
                      setRevenueSplits((prev) => {
                        const kept = prev.filter((_, i) => i !== removeIdx);
                        const newN = kept.length;
                        if (newN === 1) return [{ ...kept[0], percent: 100 }];
                        const editable = kept.slice(0, newN - 1);
                        const sum = editable.reduce((s, r) => s + (Number.isFinite(r.percent) ? r.percent : 0), 0);
                        return kept.map((s, i) => (i === newN - 1 ? { ...s, percent: Math.max(0, 100 - sum) } : s));
                      });
                    }

                    return (
                      <div className="space-y-3">
                        {revenueSplits.map((split, idx) => {
                          const isLast = idx === n - 1;
                          const percent = Number.isFinite(split.percent) ? split.percent : 0;
                          const maxForThis = n <= 1 ? 100 : (isLast ? 100 : Math.max(0, 100 - (revenueSplits.slice(0, n - 1).reduce((s, r, i) => s + (i === idx ? 0 : (Number.isFinite(r.percent) ? r.percent : 0)), 0))));
                          return (
                            <div
                              key={idx}
                              className="p-3 rounded-lg border border-gray-200/40 dark:border-gray-700/30 bg-gray-50/30 dark:bg-gray-900/20"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  value={split.address}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setRevenueSplits((prev) =>
                                      prev.map((s, i) => (i === idx ? { ...s, address: v } : s))
                                    );
                                  }}
                                  className="input-forge font-mono text-small"
                                  placeholder="Solana wallet address"
                                />
                                {revenueSplits.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeRecipient(idx)}
                                    className="btn-forge-outline !px-3 !py-2 text-small"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-4 mt-3">
                                {n === 1 ? (
                                  <span className="text-small text-gray-600 dark:text-gray-400">100% (single recipient)</span>
                                ) : (
                                  <>
                                    <input
                                      type="range"
                                      min={0}
                                      max={Math.max(0, maxForThis)}
                                      step={1}
                                      value={percent}
                                      onChange={(e) => setRevenueSplitPercent(idx, parseFloat(e.target.value) || 0)}
                                      className="flex-1 h-1.5 bg-gray-200/30 dark:bg-gray-700/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(251,146,60,0.4)]"
                                    />
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <ForgeNumberInput
                                        containerClassName="w-16"
                                        inputClassName="text-center !px-2 !py-1.5 text-small"
                                        min={0}
                                        max={Math.max(0, maxForThis)}
                                        step={1}
                                        value={percent}
                                        onValueChange={(v) => setRevenueSplitPercent(idx, parseFloat(v) || 0)}
                                      />
                                      <span className="text-small text-gray-500 dark:text-gray-400">%</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <button
                            type="button"
                            onClick={addRecipient}
                            className="btn-forge-outline w-full sm:w-auto"
                          >
                            + Add recipient
                          </button>
                          <p className="text-small text-gray-600 dark:text-gray-400">
                            Total: 100%
                          </p>
                        </div>
                        <p className="text-caption text-gray-500 dark:text-gray-400">
                          Sliders and amounts adjust so the total is always 100%.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>

            /* ════════ STEP 4: Confirmation ════════ */
            ) : dropStep === 4 ? (
              <div className="relative space-y-6">
                <div className="relative overflow-hidden rounded-xl border-2 border-orange-400/20 bg-gradient-to-br from-orange-400/5 via-transparent to-orange-400/5 p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-400/5 rounded-full blur-3xl"></div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-small font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                        Ready to Launch
                      </h3>
                    </div>
                    <p className="text-body text-gray-600 dark:text-gray-400 leading-relaxed">
                      Review everything before launching. Once created, this data is stored permanently on-chain and cannot be changed.
                    </p>
                  </div>
                </div>

                {/* Unified Files Card */}
                <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-gray-900/30 dark:to-transparent p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200/50 dark:border-gray-700/50">
                    <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    <h3 className="text-small font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                      Files
                    </h3>
                    <span className="ml-auto px-2 py-0.5 rounded-full bg-orange-400/10 text-caption font-semibold text-orange-400">
                      {2 + additionalFiles.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Thumbnail Image */}
                    {thumbnailPreview && (
                      <div className="p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v12h16V6H4zm3 3l3 4 3-3 4 5H7l0-6z" />
                          </svg>
                          <span className="text-caption font-semibold text-gray-700 dark:text-gray-300">Thumbnail Image</span>
                        </div>
                        <div className="rounded-lg overflow-hidden border border-gray-200/50 dark:border-gray-700/50 bg-gray-100 dark:bg-gray-900">
                          <img 
                            src={thumbnailPreview} 
                            alt="Drop Thumbnail" 
                            className="w-full h-auto max-h-[200px] object-contain"
                          />
                        </div>
                      </div>
                    )}

                    {/* Main model file (VRM or GLB) */}
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                      {isGlbFile ? <IconGLB className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" /> : <IconVRM className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-small font-medium text-gray-900 dark:text-gray-100 truncate">{vrmFile?.name}</p>
                        <p className="text-caption text-gray-500 dark:text-gray-400">
                          {isGlbFile ? 'GLB Model' : 'VRM Avatar'} · {vrmFile ? formatFileSize(vrmFile.size) : ''}
                        </p>
                      </div>
                    </div>

                    {/* Separator for additional files */}
                    {additionalFiles.length > 0 && (
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200/50 dark:border-gray-700/50"></div>
                        </div>
                        <div className="relative flex justify-center">
                          <span className="px-2 text-caption text-gray-400 dark:text-gray-500 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-gray-900/30 dark:to-transparent">
                            Additional Files
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Additional Files */}
                    {additionalFiles.map((af, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                        {af.type === 'image' ? (
                          <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
                            <img src={af.previewUrl} alt={af.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <>
                            {af.name.toLowerCase().endsWith('.vrm') ? (
                              <IconVRM className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                            ) : af.name.toLowerCase().endsWith('.glb') ? (
                              <IconGLB className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                            ) : (
                              <Icon3DBox className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                            )}
                          </>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-small font-medium text-gray-900 dark:text-gray-100 truncate">{af.name}</p>
                          <p className="text-caption text-gray-500 dark:text-gray-400">
                            {af.type === 'model' ? '3D Model' : 'Image'} · {formatFileSize(af.file.size)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Drop Details */}
                <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-gray-900/30 dark:to-transparent p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200/50 dark:border-gray-700/50">
                    <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <h3 className="text-small font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                      Drop Details
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <EnhancedMetadataRow label="Collection Name" value={collectionName} icon="collection" />
                    <EnhancedMetadataRow label="Symbol" value={collectionSymbol || 'DROP'} icon="tag" />
                    <EnhancedMetadataRow label="Description" value={collectionDescription || '—'} icon="document" multiline />
                  </div>
                </section>

                {/* Traits — license-related and custom traits */}
                {(vrmMetadata || customTraits.filter((t) => t.trait_type && t.value).length > 0) && (
                  <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-gray-900/30 dark:to-transparent p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200/50 dark:border-gray-700/50">
                      <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                      </svg>
                      <h3 className="text-small font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                        Attributes
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {vrmMetadata && (
                        <>
                          <AttributeCard label="License" value={vrmMetadata.license} />
                          <AttributeCard label="Commercial Use" value={vrmMetadata.commercialUse} />
                          <AttributeCard label="Blend Shapes" value={vrmMetadata.blendShapeCount.toString()} />
                          <AttributeCard label="Bone Count" value={vrmMetadata.boneCount.toString()} />
                        </>
                      )}
                      {customTraits
                        .filter((t) => t.trait_type && t.value)
                        .map((t, i) => (
                          <AttributeCard key={i} label={t.trait_type} value={t.value} />
                        ))}
                    </div>
                  </section>
                )}


                {/* Mint Settings */}
                <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-gray-900/30 dark:to-transparent p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200/50 dark:border-gray-700/50">
                    <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <h3 className="text-small font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                      Mint Settings
                    </h3>
                  </div>
                  
                  {/* Drop Type Badge */}
                  <div className="mb-4">
                    <div className="inline-flex items-center px-4 py-2 rounded-lg bg-gradient-to-r from-orange-400/10 to-orange-500/5 border border-orange-400/20">
                      <span className="font-semibold text-orange-400">
                        {mintConfig.isDutchAuction ? 'Dutch Auction' : 'Open Edition'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {mintConfig.isDutchAuction ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                          <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">Start Price</div>
                          <div className="text-body font-bold text-gray-900 dark:text-gray-100">{mintConfig.dutchAuction?.startPrice} SOL</div>
                        </div>
                        <div className="p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                          <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">End Price</div>
                          <div className="text-body font-bold text-gray-900 dark:text-gray-100">{mintConfig.dutchAuction?.endPrice} SOL</div>
                        </div>
                        <div className="p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                          <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">Duration</div>
                          <div className="text-body font-bold text-gray-900 dark:text-gray-100">{mintConfig.dutchAuction?.durationHours}h</div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                        <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">Mint Price</div>
                        <div className="text-headline font-bold text-orange-400">
                          {mintConfig.price === 0 ? 'Free' : `${mintConfig.price} SOL`}
                        </div>
                      </div>
                    )}
                    
                    {!mintConfig.isDutchAuction && mintSettingsTab === 'advanced' && mintPhases.length > 1 ? (
                      <EnhancedMetadataRow label="Phases" value={`${mintPhases.length} phases configured`} icon="phases" />
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                          <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">Max Supply</div>
                          <div className="text-body font-bold text-gray-900 dark:text-gray-100">
                            {mintConfig.maxSupply ? mintConfig.maxSupply.toLocaleString() : '100,000'}
                          </div>
                          {!mintConfig.maxSupply && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400/80 mt-0.5">default</div>
                          )}
                        </div>
                        <div className="p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                          <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">Max Per Wallet</div>
                          <div className="text-body font-bold text-gray-900 dark:text-gray-100">
                            {mintConfig.maxPerWallet ? mintConfig.maxPerWallet.toString() : '∞ Unlimited'}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <EnhancedMetadataRow
                      label="Access Control"
                      value={
                        (mintConfig.access || 'anyone') === 'anyone'
                          ? 'Anyone can mint'
                          : (() => {
                              const mints = getMintConfigTokenHolderMints(mintConfig).filter(Boolean);
                              const addrs = mintConfig.allowlistAddresses?.length ?? 0;
                              const parts = [];
                              if (mints.length > 0) parts.push(`${mints.length} token${mints.length !== 1 ? 's' : ''}`);
                              if (addrs > 0) parts.push(`${addrs} address${addrs !== 1 ? 'es' : ''}`);
                              return parts.length > 0 ? `Custom access: ${parts.join(', ')}` : 'Custom access configured';
                            })()
                      }
                      icon="lock"
                    />
                    
                    <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-small text-gray-700 dark:text-gray-300">Royalties</span>
                      </div>
                      <span className="text-body font-bold text-orange-400">{royaltyPercent}%</span>
                    </div>
                    
                    {revenueSplitsEnabled && revenueSplits.length > 0 ? (
                      <div className="p-3 rounded-lg border border-orange-400/20 bg-orange-400/5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="text-small font-semibold text-gray-900 dark:text-gray-100">Revenue Split</span>
                          </div>
                          <span className="text-caption px-2 py-0.5 rounded-full bg-orange-400/10 text-orange-400 font-medium">
                            {revenueSplits.length} recipient{revenueSplits.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="space-y-1.5 mt-2">
                          {revenueSplits.map((s, i) => (
                            <div key={`rev-split-${i}`} className="flex justify-between items-center text-caption">
                              <span className="text-gray-600 dark:text-gray-400 truncate flex-1 mr-2">{s.address || '—'}</span>
                              <span className="text-orange-400 font-semibold">{Number.isFinite(s.percent) ? Math.round(s.percent) : 0}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30 text-center">
                        <span className="text-small text-gray-500 dark:text-gray-400">Revenue split: Off</span>
                      </div>
                    )}
                  </div>
                </section>

                {/* Phase Settings (Advanced with multiple phases) */}
                {!mintConfig.isDutchAuction && mintSettingsTab === 'advanced' && mintPhases.length > 0 && (
                  <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-gray-900/30 dark:to-transparent p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200/50 dark:border-gray-700/50">
                      <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-small font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                        Phase Settings
                      </h3>
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-orange-400/10 text-caption font-semibold text-orange-400">
                        {mintPhases.length} phase{mintPhases.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-4">
                      {mintPhases.map((phase, index) => (
                        <div
                          key={index}
                          className="relative p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50"
                        >
                          <div className="absolute -top-3 left-4 px-3 py-1 rounded-full bg-gradient-to-r from-orange-400 to-orange-500 text-white text-caption font-bold">
                            Phase {index + 1}
                          </div>
                          
                          <div className="mt-2 space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                              <div className="p-2 rounded-lg bg-gray-100/50 dark:bg-gray-900/30">
                                <div className="text-caption text-gray-500 dark:text-gray-400 mb-0.5">Price</div>
                                <div className="text-small font-bold text-orange-400">{phase.price === 0 ? 'Free' : `${phase.price} SOL`}</div>
                              </div>
                              <div className="p-2 rounded-lg bg-gray-100/50 dark:bg-gray-900/30">
                                <div className="text-caption text-gray-500 dark:text-gray-400 mb-0.5">Supply</div>
                                <div className="text-small font-bold text-gray-900 dark:text-gray-100">
                                  {phase.maxSupply != null ? phase.maxSupply.toString() : '∞'}
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-gray-100/50 dark:bg-gray-900/30">
                                <div className="text-caption text-gray-500 dark:text-gray-400 mb-0.5">Per Wallet</div>
                                <div className="text-small font-bold text-gray-900 dark:text-gray-100">
                                  {phase.maxPerWallet != null ? phase.maxPerWallet.toString() : '∞'}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-100/50 dark:bg-gray-900/30">
                              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <span className="text-caption text-gray-900 dark:text-gray-100">
                                {(phase.access ?? 'anyone') === 'anyone'
                                  ? 'Anyone can mint'
                                  : (() => {
                                      const mints = getPhaseTokenHolderMints(phase).filter(Boolean);
                                      const addrs = phase.allowlistAddresses?.length ?? 0;
                                      const parts = [];
                                      if (mints.length > 0) parts.push(`${mints.length} token${mints.length !== 1 ? 's' : ''}`);
                                      if (addrs > 0) parts.push(`${addrs} address${addrs !== 1 ? 'es' : ''}`);
                                      return parts.length > 0 ? `Custom: ${parts.join(', ')}` : 'Custom access';
                                    })()
                                }
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                              <div>
                                <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">Start Time</div>
                                <div className="text-caption text-gray-900 dark:text-gray-100">
                                  {phase.startDate
                                    ? new Date(phase.startDate).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                                    : index === 0
                                      ? '🚀 Immediately'
                                      : '⏭️ After previous'
                                  }
                                </div>
                              </div>
                              <div>
                                <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">End Time</div>
                                <div className="text-caption text-gray-900 dark:text-gray-100">
                                  {phase.endDate
                                    ? new Date(phase.endDate).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                                    : '∞ No end'
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

            /* ════════ STEP 5: Launch ════════ */
            ) : (
              <div className="space-y-6">
                <p className="text-body text-gray-700 dark:text-gray-300 leading-relaxed">
                  Ready to launch! We&apos;ll store your VRM and thumbnail permanently, then create your drop collection on Solana.
                </p>

                <section className="border border-gray-200/30 dark:border-gray-700/20 p-5 space-y-4 bg-gray-50/30 dark:bg-gray-900/30">
                  <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    What happens when you launch
                  </p>
                  <div className="space-y-3 text-small text-gray-600 dark:text-gray-400">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-orange-400/10 border border-orange-400/20 flex items-center justify-center text-orange-400 text-caption font-medium">
                        1
                      </div>
                      <p>Your VRM file is stored permanently on Arweave</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-orange-400/10 border border-orange-400/20 flex items-center justify-center text-orange-400 text-caption font-medium">
                        2
                      </div>
                      <p>Your thumbnail image is stored on Arweave</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-orange-400/10 border border-orange-400/20 flex items-center justify-center text-orange-400 text-caption font-medium">
                        3
                      </div>
                      <p>Collection metadata (with mint settings) is uploaded</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-orange-400/10 border border-orange-400/20 flex items-center justify-center text-orange-400 text-caption font-medium">
                        4
                      </div>
                      <p>Drop collection is created on Solana (requires wallet approval)</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-orange-400/10 border border-orange-400/20 flex items-center justify-center text-orange-400 text-caption font-medium">
                        5
                      </div>
                      <p>Mint rules (price, supply, access) are enforced on-chain</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-orange-400/10 border border-orange-400/20 flex items-center justify-center text-orange-400 text-caption font-medium">
                        6
                      </div>
                      <p>Your drop goes live for minting!</p>
                    </div>
                  </div>
                </section>

                {status && (
                  <div className="status-forge">
                    <div className="relative z-10 flex items-center gap-3">
                      {creating && <div className="spinner-forge flex-shrink-0" />}
                      <p className="text-small text-orange-400/90">{status}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ═══ Fixed bottom buttons ═══ */}
        <div className="flex-shrink-0 p-6 lg:p-8 pt-0 border-t border-gray-200/30 dark:border-gray-700/20">
          {dropStep === 1 ? (
            <button
              type="button"
              onClick={() => advanceFromStep(1)}
              className="btn-hero-primary w-full py-3.5 text-center"
            >
              {isGlbFile ? 'Confirm GLB' : 'Confirm VRM'}
            </button>
          ) : dropStep === 2 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => advanceFromStep(2)}
                className="btn-hero-primary w-full py-3.5 text-center"
              >
                Continue to Mint Settings
              </button>
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="text-small text-gray-500 hover:text-orange-400/70 dark:text-gray-400 transition-colors text-center"
              >
                Back to VRM Metadata
              </button>
            </div>
          ) : dropStep === 3 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => advanceFromStep(3)}
                disabled={
                  !mintConfig.isDutchAuction &&
                  mintSettingsTab === 'advanced' &&
                  hasPhaseErrors
                }
                className="btn-hero-primary w-full py-3.5 text-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Review
              </button>
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="text-small text-gray-500 hover:text-orange-400/70 dark:text-gray-400 transition-colors text-center"
              >
                Back to Drop Details
              </button>
            </div>
          ) : dropStep === 4 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => advanceFromStep(4)}
                className="btn-hero-primary w-full py-3.5 text-center"
              >
                Confirm &amp; Proceed to Launch
              </button>
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="text-small text-gray-500 hover:text-orange-400/70 dark:text-gray-400 transition-colors text-center"
              >
                Back to Mint Settings
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleCreateDropRequest}
                disabled={creating || estimatingCost || !collectionName || !thumbnailFile}
                className="btn-hero-primary w-full py-3.5 text-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {estimatingCost ? 'Estimating storage cost\u2026' : creating ? 'Launching Drop...' : 'Launch Drop'}
              </button>
              <button
                type="button"
                onClick={() => goToStep(4)}
                disabled={creating}
                className="text-small text-gray-500 hover:text-orange-400/70 dark:text-gray-400 transition-colors text-center disabled:opacity-50"
              >
                Back to Confirmation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Right Side: 3D Viewer ═══ */}
      <div className={`flex-1 min-w-0 bg-gray-100/10 dark:bg-black/10 relative ${fullViewport ? 'min-h-0 flex flex-col' : 'min-h-[400px] lg:min-h-0'}`}>
        <div className="h-full relative">
          <VRMViewer
            url={activeViewerUrl || previewUrl!}
            height="100%"
            animationUrl={activeModelIndex === 0 && !tPose ? '/animations/Bored.fbx' : undefined}
            tPose={tPose}
          />
          
          {vrmMetadata && (
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm text-white px-3 py-2 text-caption z-10">
              {activeModelIndex === 0
                ? `${vrmMetadata.title} · ${vrmMetadata.boneCount} bones · ${vrmMetadata.blendShapeCount} expressions`
                : modelFiles[activeModelIndex]?.label || ''}
            </div>
          )}
        </div>

        {/* ── Model selector tabs (top center, when multiple models) ── */}
        {modelFiles.length > 1 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-black/50 backdrop-blur-sm p-1">
            {modelFiles.map((model, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveModelIndex(i)}
                className={`px-3 py-1.5 text-caption font-medium transition-colors ${
                  activeModelIndex === i
                    ? 'bg-orange-400/20 text-orange-300'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                title={model.label}
              >
                <span className="max-w-[120px] truncate block">{model.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Animation / T-pose toggle (bottom-right, only for main VRM) ── */}
        {activeModelIndex === 0 && (
          <div className="absolute bottom-4 right-4 z-10">
            <button
              type="button"
              onClick={() => setTPose((p) => !p)}
              className="flex items-center gap-2 bg-black/60 backdrop-blur-sm text-white px-3 py-2 text-caption font-medium hover:bg-black/80 transition-colors"
              title={tPose ? 'Play animation' : 'Show T-Pose'}
            >
              {tPose ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  Play Animation
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                  </svg>
                  T-Pose
                </>
              )}
            </button>
          </div>
        )}

        {/* ── Launch confirmation modal ── */}
        {showLaunchConfirm && (
          <TransactionConfirmModal
            open={true}
            {...buildCreateDropTransaction({
              collectionName,
              price: mintConfig.price,
              storageCostSol,
              hasGuardGroups: (mintSettingsTab === 'advanced' && mintPhases.length > 0) || !!mintConfig.isDutchAuction,
            })}
            onConfirm={handleCreateDrop}
            onCancel={() => setShowLaunchConfirm(false)}
          />
        )}

        <TransactionProgressModal
          open={creating}
          title="Launching Drop"
          steps={getCreateDropSteps({
            additionalFileCount: additionalFiles.length,
            hasGuardGroups: mintConfig.isDutchAuction || (mintSettingsTab === 'advanced' && mintPhases.length > 0) || (mintConfig.tokenHolderMints?.filter(Boolean).length ?? 0) > 1,
            useLocalStorage,
          })}
          currentStepId={dropPhase || 'funding'}
          statusMessage={status}
          error={dropError}
          success={dropPhase === 'success'}
          successContent={
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              Your drop is live! Redirecting to collection page&hellip;
            </p>
          }
          onClose={handleDropProgressClose}
        />

        {/* ── Floating step tabs (left edge) ── */}
        <div className="absolute left-0 top-4 flex flex-col gap-0.5 z-10">
          {stepNumbers.map((step) => {
            const isActive = dropStep === step;
            const isLocked = step > maxStepReached;
            return (
              <button
                key={step}
                type="button"
                onClick={() => goToStep(step)}
                disabled={isLocked}
                className={`px-3 py-2 text-caption font-medium uppercase tracking-wider border border-l-0 transition-colors duration-200 ${
                  isActive
                    ? 'bg-orange-400/15 text-orange-400 border-orange-400/30 backdrop-blur-sm'
                    : isLocked
                    ? 'bg-gray-100/50 dark:bg-gray-900/50 text-gray-300 dark:text-gray-600 border-gray-200/30 dark:border-gray-800/30 cursor-not-allowed'
                    : 'bg-gray-100/80 dark:bg-gray-900/80 text-gray-500 dark:text-gray-400 border-gray-300/30 dark:border-gray-700/30 hover:text-orange-400 hover:border-orange-400/30 backdrop-blur-sm'
                }`}
                title={isLocked ? `Complete step ${step - 1} first` : stepLabels[step]}
              >
                {stepLabels[step]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Helper components ──

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3 text-caption">
      <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-900 dark:text-gray-100 text-right break-all">{value}</span>
    </div>
  );
}

function EnhancedMetadataRow({ label, value, icon, multiline }: { label: string; value: string; icon?: string; multiline?: boolean }) {
  const getIcon = () => {
    switch (icon) {
      case 'collection':
        return (
          <svg className="w-4 h-4 text-orange-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
        );
      case 'tag':
        return (
          <svg className="w-4 h-4 text-orange-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
          </svg>
        );
      case 'document':
        return (
          <svg className="w-4 h-4 text-orange-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        );
      case 'lock':
        return (
          <svg className="w-4 h-4 text-orange-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        );
      case 'phases':
        return (
          <svg className="w-4 h-4 text-orange-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex ${multiline ? 'flex-col' : 'justify-between items-start'} gap-2 p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30`}>
      <div className="flex items-center gap-2">
        {icon && getIcon()}
        <span className="text-small text-gray-600 dark:text-gray-400">{label}</span>
      </div>
      <span className={`text-small font-medium text-gray-900 dark:text-gray-100 ${multiline ? '' : 'text-right'} break-words`}>
        {value}
      </span>
    </div>
  );
}

function AttributeCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30 hover:border-orange-400/30 hover:bg-orange-400/5 transition-colors">
      <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className="text-small font-semibold text-gray-900 dark:text-gray-100 break-words">{value}</div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
