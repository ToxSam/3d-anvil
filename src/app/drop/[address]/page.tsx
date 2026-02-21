'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useMetaplex } from '@/lib/metaplex';
import { useUmi } from '@/lib/umi';
import { mintFromCandyMachine, updateDropGuards, fetchCandyMachineState, fetchPhasesFromCandyMachine, fetchDutchAuctionConfigFromCandyMachine, getCurrentDutchAuctionStepPrice, DUTCH_AUCTION_STEPS, type CandyMachineState } from '@/lib/candyMachine';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ShareButtons } from '@/components/ShareButtons';
import { SolanaIcon } from '@/components/SolanaIcon';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import { ImagePreview } from '@/components/ImagePreview';
import { useToast } from '@/components/Toast';
import {
  MintConfig,
  MintPhaseConfig,
  DEFAULT_MINT_CONFIG,
  getMintStatus,
  getMintStatusLabel,
  getMintStatusColor,
  MintStatus,
  mintConfigToPhase,
  phaseToMintConfig,
  getCurrentPhaseAt,
  getCurrentPhaseIndexAt,
  getPhaseInRangeIndexAt,
} from '@/lib/types/mintConfig';
import { getMintsByCollection, getCollectionAssets, getCollectionHolders, type HolderInfo } from '@/lib/das';
import { isDropCollection, tryFetchJsonWithIrysGateway, resolveArweaveUrl } from '@/lib/constants';
import { EXPLORER_URL, SOLANA_NETWORK, SOLANA_RPC_URL } from '@/lib/constants';
import { uploadMetadataToArweave } from '@/lib/uploadToArweave';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import DateTimePicker from '@/components/DateTimePicker';
import { ForgeNumberInput } from '@/components/ForgeNumberInput';
import { IconVRM, IconGLB, Icon3DCube } from '@/components/AssetIcons';
import { MintConfirmModal, type MintConfirmDetails } from '@/components/MintConfirmModal';
import { TransactionConfirmModal, buildSaveSettingsTransaction } from '@/components/TransactionConfirmModal';
import { TransactionProgressModal, getPublicMintSteps, getCandyMachineMintSteps } from '@/components/TransactionProgressModal';
import { AllowlistModal } from '@/components/AllowlistModal';
import { parseSolanaError } from '@/lib/solanaErrors';
import type { VRMMetadata } from '@/lib/vrmParser';

const VRMViewer = dynamic(
  () => import('@/components/VRMViewer').then((mod) => mod.VRMViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="spinner-forge" />
      </div>
    ),
  }
);

function shortenAddress(addr: string, chars = 4): string {
  if (!addr) return '';
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

function getExtFromUri(uri: string): string {
  try {
    const pathname = new URL(uri).pathname;
    const lastSegment = pathname.split('/').filter(Boolean).pop() || '';
    if (!lastSegment.includes('.')) return '';
    return lastSegment.split('.').pop()?.toLowerCase() || '';
  } catch {
    const part = uri.split('/').pop()?.split('?')[0] || '';
    if (!part.includes('.')) return '';
    return part.split('.').pop()?.toLowerCase() || '';
  }
}

function inferFileType(file: { uri: string; type: string }): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = getExtFromUri(file.uri);
  const extMap: Record<string, string> = {
    vrm: 'model/vrm', glb: 'model/gltf-binary', gltf: 'model/gltf+json',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  };
  return extMap[ext] || file.type || 'application/octet-stream';
}

function isModelType(mimeType: string): boolean {
  return mimeType.startsWith('model/') || mimeType === 'application/octet-stream';
}

function isImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function getFileTypeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    'model/vrm': 'VRM Model', 'model/gltf-binary': 'GLB Model', 'model/gltf+json': 'GLTF Model',
    'image/png': 'PNG Image', 'image/jpeg': 'JPEG Image', 'image/webp': 'WebP Image', 'image/gif': 'GIF Image',
  };
  return map[mimeType] || mimeType;
}

/** Format label for 3D model from URI extension (single source of truth, no metadata mismatch) */
function getModelFormatFromUri(uri: string): string {
  const ext = getExtFromUri(uri).toLowerCase();
  if (ext === 'glb') return 'GLB Model';
  if (ext === 'vrm') return 'VRM Model';
  if (ext === 'gltf') return 'GLTF Model';
  return '3D Model';
}

/** File name from URI (last path segment), e.g. "Bell_Structure.glb" */
function getFileNameFromUri(uri: string): string {
  try {
    const pathname = new URL(uri).pathname;
    const segment = pathname.split('/').filter(Boolean).pop();
    return segment || uri.split('/').pop() || uri;
  } catch {
    return uri.split('/').pop() || uri;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function MetadataRow({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-caption text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-caption text-gray-900 dark:text-gray-100 text-right">{value}</span>
    </div>
  );
}

function LinkableMetadataRow({ label, value }: { label: string; value: string | undefined | null }) {
  if (!value) return null;
  const isUrl = value.startsWith('http://') || value.startsWith('https://');
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-caption text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
      {isUrl ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-caption text-gray-900 dark:text-gray-100 text-right break-all hover:underline">
          {value}
        </a>
      ) : (
        <span className="text-caption text-gray-900 dark:text-gray-100 text-right break-all">{value}</span>
      )}
    </div>
  );
}

type TabId = 'details' | 'holders' | 'assets' | 'vrm';

function getTokenHolderMints(c: MintConfig): string[] {
  if (c.tokenHolderMints?.length) return c.tokenHolderMints;
  return [];
}

function DropAccessEditor({ config, onChange }: { config: MintConfig; onChange: (c: MintConfig) => void }) {
  const [customTab, setCustomTab] = useState<'token_holders' | 'allowlist'>('token_holders');
  const [allowlistText, setAllowlistText] = useState(() => (config.allowlistAddresses || []).join('\n'));
  useEffect(() => {
    setAllowlistText((config.allowlistAddresses || []).join('\n'));
  }, [config.allowlistAddresses?.length, config.allowlistAddresses?.join(',')]);
  const mints = getTokenHolderMints(config);
  const hasCustom = (config.access || 'anyone') === 'custom';

  return (
    <div className="space-y-4">
      <div className="flex flex-nowrap gap-0 border-b border-gray-200/30 dark:border-gray-700/20 overflow-x-auto min-w-0">
        <button
          type="button"
          onClick={() => onChange({ ...config, access: 'anyone', requiresAllowlist: false, tokenHolderMints: undefined, allowlistAddresses: undefined })}
          className={`tab-forge flex-shrink-0 px-2.5 py-2 text-xs ${!hasCustom ? 'tab-forge-active' : 'tab-forge-inactive'}`}
        >
          Default
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...config, access: 'custom', requiresAllowlist: (config.allowlistAddresses?.length ?? 0) > 0 })}
          className={`tab-forge flex-shrink-0 px-2.5 py-2 text-xs ${hasCustom ? 'tab-forge-active' : 'tab-forge-inactive'}`}
        >
          Custom
        </button>
      </div>
      {!hasCustom ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">Anyone can mint.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-nowrap gap-0 border-b border-gray-200/30 dark:border-gray-700/20 overflow-x-auto min-w-0">
            <button
              type="button"
              onClick={() => setCustomTab('token_holders')}
              className={`tab-forge flex-shrink-0 px-2.5 py-2 text-xs ${customTab === 'token_holders' ? 'tab-forge-active' : 'tab-forge-inactive'}`}
            >
              Token holders
            </button>
            <button
              type="button"
              onClick={() => setCustomTab('allowlist')}
              className={`tab-forge flex-shrink-0 px-2.5 py-2 text-xs ${customTab === 'allowlist' ? 'tab-forge-active' : 'tab-forge-inactive'}`}
            >
              Allowlist
            </button>
          </div>
          {customTab === 'token_holders' && (
            <div>
              <p className="text-caption text-gray-500 dark:text-gray-400 mb-2">Holders of any of these tokens or NFTs can mint.</p>
              {mints.map((mint, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={mint}
                    onChange={(e) => {
                      const next = [...mints];
                      next[i] = e.target.value.trim();
                      onChange({ ...config, tokenHolderMints: next.filter(Boolean) });
                    }}
                    className="input-forge flex-1 font-mono text-sm"
                    placeholder="Token or NFT mint address"
                  />
                  <button type="button" onClick={() => onChange({ ...config, tokenHolderMints: mints.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500 p-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => onChange({ ...config, tokenHolderMints: [...mints, ''] })} className="btn-forge-outline text-sm">
                + Add token or NFT
              </button>
            </div>
          )}
          {customTab === 'allowlist' && (
            <div>
              <label className="text-label block mb-1">One address per line</label>
              <textarea
                value={allowlistText}
                onChange={(e) => setAllowlistText(e.target.value)}
                onBlur={() => {
                  const lines = allowlistText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                  onChange({ ...config, allowlistAddresses: lines, requiresAllowlist: lines.length > 0 });
                }}
                className="input-forge min-h-[80px] font-mono text-sm w-full resize-y"
                placeholder="Wallet addresses, one per line"
                rows={3}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getPhaseTokenHolderMints(phase: MintPhaseConfig): string[] {
  if (phase.tokenHolderMints?.length) return phase.tokenHolderMints;
  return [];
}

/** Format phase price for display; never shows NaN. */
function formatPhasePrice(price: number | undefined | null): string {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return 'Free';
  return `${n} SOL`;
}

/** Format SOL price safely (never NaN, with configurable decimals). */
function formatSolPrice(price: number | undefined | null, decimals = 2): string {
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return '0.00';
  return n.toFixed(decimals);
}

/** Effective start of a phase for display: explicit startDate, or previous phase's endDate when "start when previous ends". */
function getPhaseDisplayStart(phases: MintPhaseConfig[], index: number): string | null {
  const p = phases[index];
  if (!p) return null;
  if (p.startDate) return p.startDate;
  if (index > 0 && phases[index - 1]?.endDate) return phases[index - 1].endDate ?? null;
  return null;
}

function DropPhasesEditor({
  phases,
  onChange,
  baseConfig,
  currentPhaseIndex,
}: {
  phases: MintPhaseConfig[];
  onChange: (p: MintPhaseConfig[]) => void;
  baseConfig: MintConfig;
  currentPhaseIndex: number | null;
}) {
  const [phaseCustomTab, setPhaseCustomTab] = useState<Record<number, 'token_holders' | 'allowlist'>>({});

  const updatePhase = (index: number, patch: Partial<MintPhaseConfig>) => {
    const next = phases.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {phases.map((phase, index) => {
        const isCurrent = currentPhaseIndex === index;
        const customTab = phaseCustomTab[index] ?? 'token_holders';
        const phaseMints = getPhaseTokenHolderMints(phase);
        return (
          <div
            key={index}
            className={`p-4 rounded-lg border bg-white/50 dark:bg-gray-900/30 space-y-3 ${
              isCurrent
                ? 'border-orange-400/60 dark:border-orange-400/50 shadow-[0_0_0_1px_rgba(251,146,60,0.2)]'
                : 'border-gray-200/40 dark:border-gray-700/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Phase {index + 1}</span>
              {isCurrent && (
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-orange-400/20 text-orange-500 dark:text-orange-400 border border-orange-400/30">
                  Current
                </span>
              )}
              {phases.length > 1 && (
                <button type="button" onClick={() => onChange(phases.filter((_, i) => i !== index))} className="text-xs text-red-500 hover:underline">
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-caption text-gray-500 dark:text-gray-400 block mb-1">Start</label>
                <DateTimePicker value={phase.startDate || undefined} onChange={(v) => updatePhase(index, { startDate: v })} placeholder="Immediate" />
              </div>
              <div>
                <label className="text-caption text-gray-500 dark:text-gray-400 block mb-1">End</label>
                <DateTimePicker value={phase.endDate || undefined} onChange={(v) => updatePhase(index, { endDate: v })} placeholder="No end" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-caption text-gray-500 dark:text-gray-400 block mb-1">Price (SOL)</label>
                <ForgeNumberInput min="0" step="0.01" value={typeof phase.price === 'number' && Number.isFinite(phase.price) ? phase.price : ''} onValueChange={(v) => updatePhase(index, { price: parseFloat(v) || 0 })} placeholder="0" />
              </div>
              <div>
                <label className="text-caption text-gray-500 dark:text-gray-400 block mb-1">Max supply</label>
                <ForgeNumberInput min="1" value={phase.maxSupply ?? ''} onValueChange={(v) => updatePhase(index, { maxSupply: v ? parseInt(v) : null })} placeholder="Unlimited" />
              </div>
            </div>
            <div>
              <label className="text-caption text-gray-500 dark:text-gray-400 block mb-1">Max per wallet</label>
              <ForgeNumberInput min="1" value={phase.maxPerWallet ?? ''} onValueChange={(v) => updatePhase(index, { maxPerWallet: v ? parseInt(v) : null })} placeholder="Unlimited" />
            </div>
            <div className="flex flex-nowrap gap-0 border-b border-gray-200/30 dark:border-gray-700/20 overflow-x-auto min-w-0">
              <button
                type="button"
                onClick={() => updatePhase(index, { access: 'anyone', tokenHolderMints: undefined, allowlistAddresses: undefined })}
                className={`tab-forge flex-shrink-0 px-2.5 py-2 text-xs ${(phase.access || 'anyone') === 'anyone' ? 'tab-forge-active' : 'tab-forge-inactive'}`}
              >
                Anyone
              </button>
              <button
                type="button"
                onClick={() => updatePhase(index, { access: 'custom' })}
                className={`tab-forge flex-shrink-0 px-2.5 py-2 text-xs ${(phase.access || 'anyone') === 'custom' ? 'tab-forge-active' : 'tab-forge-inactive'}`}
              >
                Custom
              </button>
            </div>
            {(phase.access || 'anyone') === 'custom' && (
              <div className="space-y-3">
                <div className="flex flex-nowrap gap-0 border-b border-gray-200/30 dark:border-gray-700/20 overflow-x-auto min-w-0">
                  <button
                    type="button"
                    onClick={() => setPhaseCustomTab((t) => ({ ...t, [index]: 'token_holders' }))}
                    className={`tab-forge flex-shrink-0 px-2.5 py-2 text-xs ${customTab === 'token_holders' ? 'tab-forge-active' : 'tab-forge-inactive'}`}
                  >
                    Token holders
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhaseCustomTab((t) => ({ ...t, [index]: 'allowlist' }))}
                    className={`tab-forge flex-shrink-0 px-2.5 py-2 text-xs ${customTab === 'allowlist' ? 'tab-forge-active' : 'tab-forge-inactive'}`}
                  >
                    Allowlist
                  </button>
                </div>
                {customTab === 'token_holders' && (
                  <div>
                    <p className="text-caption text-gray-500 dark:text-gray-400 mb-2">Holders of any of these tokens or NFTs can mint in this phase.</p>
                    {phaseMints.map((mint, i) => (
                      <div key={i} className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={mint}
                          onChange={(e) => {
                            const next = [...phaseMints];
                            next[i] = e.target.value.trim();
                            updatePhase(index, { tokenHolderMints: next.filter(Boolean) });
                          }}
                          className="input-forge flex-1 font-mono text-xs"
                          placeholder="Token or NFT mint address"
                        />
                        <button
                          type="button"
                          onClick={() => updatePhase(index, { tokenHolderMints: phaseMints.filter((_, j) => j !== i) })}
                          className="text-gray-400 hover:text-red-500 p-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => updatePhase(index, { tokenHolderMints: [...phaseMints, ''] })}
                      className="btn-forge-outline text-xs"
                    >
                      + Add token or NFT
                    </button>
                  </div>
                )}
                {customTab === 'allowlist' && (
                  <div>
                    <label className="text-caption text-gray-500 dark:text-gray-400 block mb-1">One wallet per line</label>
                    <textarea
                      value={(phase.allowlistAddresses || []).join('\n')}
                      onChange={(e) => updatePhase(index, { allowlistAddresses: e.target.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) })}
                      className="input-forge min-h-[60px] font-mono text-xs w-full"
                      placeholder="Wallet addresses, one per line"
                      rows={2}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...phases, { price: baseConfig.price, maxSupply: baseConfig.maxSupply, maxPerWallet: baseConfig.maxPerWallet, startDate: null, endDate: null, access: 'anyone' }])}
        className="btn-forge-outline text-sm w-full"
      >
        + Add phase
      </button>
    </div>
  );
}

export default function DropPage() {
  const params = useParams();
  const address = params.address as string;
  const router = useRouter();
  const wallet = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const metaplex = useMetaplex();
  const umi = useUmi();
  const { toast } = useToast();
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const dutchAuctionStartRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const [collection, setCollection] = useState<any>(null);
  const [mintConfig, setMintConfig] = useState<MintConfig | null>(null);
  const [nfts, setNfts] = useState<any[]>([]);
  const [stats, setStats] = useState({ minted: 0, holders: 0 });
  const [holdersList, setHoldersList] = useState<HolderInfo[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [userMintCount, setUserMintCount] = useState(0);
  const [minting, setMinting] = useState(false);
  const [lastMintedAddress, setLastMintedAddress] = useState<string | null>(null);
  const [mintConfirm, setMintConfirm] = useState<MintConfirmDetails | null>(null);
  type DropMintPhase = '' | 'preparing' | 'allowlist' | 'payment' | 'minting' | 'confirming' | 'verifying' | 'success';
  const [mintPhase, setMintPhase] = useState<DropMintPhase>('');
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintErrorDetails, setMintErrorDetails] = useState<string | null>(null);
  const [mintIsCandyMachine, setMintIsCandyMachine] = useState(false);
  const [mintHasAllowlist, setMintHasAllowlist] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('details');
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const [countdown, setCountdown] = useState<{ d: number; h: number; m: number; s: number } | null>(null);
  const [countdownLabel, setCountdownLabel] = useState<'ends' | 'starts' | 'ended' | null>(null);
  const [nextPhaseCountdown, setNextPhaseCountdown] = useState<{ d: number; h: number; m: number; s: number } | null>(null);
  const [detailsPhaseExpanded, setDetailsPhaseExpanded] = useState<number | null>(null);
  const [dutchCountdown, setDutchCountdown] = useState<{ h: number; m: number; s: number } | null>(null);
  const [nextDropCountdown, setNextDropCountdown] = useState<{ m: number; s: number } | null>(null);
  const [nextStepPrice, setNextStepPrice] = useState<number | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [vrmParsed, setVrmParsed] = useState<VRMMetadata | null>(null);
  const [vrmParsing, setVrmParsing] = useState(false);
  const [vrmParseError, setVrmParseError] = useState<string | null>(null);
  const [vrmParseFetched, setVrmParseFetched] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savingMintConfig, setSavingMintConfig] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ config: MintConfig; phases?: MintPhaseConfig[] } | null>(null);
  const [showAllowlistModal, setShowAllowlistModal] = useState(false);
  /** Phases stored in metadata (optional); when set, current phase is used for mint logic */
  const [mintPhases, setMintPhases] = useState<MintPhaseConfig[]>([]);
  /** On-chain Candy Machine state (null = legacy drop without CM) */
  const [cmState, setCmState] = useState<CandyMachineState | null>(null);
  /** Wallet SOL balance in SOL (null = not yet fetched) */
  const [walletBalanceSol, setWalletBalanceSol] = useState<number | null>(null);
  /** When editing settings: access only */
  const [settingsMintConfig, setSettingsMintConfig] = useState<MintConfig | null>(null);
  /** When editing settings (Open Mint only): phases list */
  const [settingsPhases, setSettingsPhases] = useState<MintPhaseConfig[]>([]);

  /** When mint_phases exists, use current phase; else use mint_config. Computed early for countdown deps. */
  const effectiveMintConfig = useMemo(() => {
    if (!mintConfig) return null;
    if (mintPhases.length > 0) {
      const now = new Date();
      const current = getCurrentPhaseAt(mintPhases, now);
      if (current) return phaseToMintConfig(current, mintConfig);
      const inRangeIdx = getPhaseInRangeIndexAt(mintPhases, now);
      if (inRangeIdx != null && mintPhases[inRangeIdx].paused) return { ...mintConfig, isPublic: false };
      return phaseToMintConfig(mintPhases[0], mintConfig);
    }
    return mintConfig;
  }, [mintConfig, mintPhases]);

  const hasAccessRestrictions = useMemo(() => {
    if (mintPhases.length > 0) {
      return mintPhases.some(
        (p) =>
          (p.access || 'anyone') === 'custom' ||
          (p.allowlistAddresses?.length ?? 0) > 0 ||
          (p.tokenHolderMints?.length ?? 0) > 0,
      );
    }
    if (!effectiveMintConfig) return false;
    return (
      (effectiveMintConfig.allowlistAddresses?.length ?? 0) > 0 ||
      (effectiveMintConfig.tokenHolderMints?.length ?? 0) > 0 ||
      effectiveMintConfig.requiresAllowlist
    );
  }, [effectiveMintConfig, mintPhases]);

  // ── Live countdown ────────────────────────────────────────────────────
  useEffect(() => {
    const target = effectiveMintConfig?.endDate
      ? new Date(effectiveMintConfig.endDate).getTime()
      : effectiveMintConfig?.startDate
        ? new Date(effectiveMintConfig.startDate).getTime()
        : null;
    const isEnd = !!effectiveMintConfig?.endDate;

    if (!target) {
      setCountdown(null);
      setCountdownLabel(null);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        if (isEnd) {
          setCountdown({ d: 0, h: 0, m: 0, s: 0 });
          setCountdownLabel('ended');
        } else {
          setCountdown(null);
          setCountdownLabel(null);
        }
        return;
      }
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown({ d, h, m, s });
      setCountdownLabel(isEnd ? 'ends' : 'starts');
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [effectiveMintConfig?.endDate, effectiveMintConfig?.startDate]);

  /** Next phase start time (earliest future start among phases); for "X until next phase starts". */
  const nextPhaseStartTime = useMemo(() => {
    if (mintPhases.length === 0) return null;
    const now = Date.now();
    let earliest: number | null = null;
    for (const p of mintPhases) {
      if (!p.startDate) continue;
      const t = new Date(p.startDate).getTime();
      if (t > now && (earliest == null || t < earliest)) earliest = t;
    }
    return earliest != null ? new Date(earliest) : null;
  }, [mintPhases]);

  // ── Next phase countdown (when no phase is live) ──────────────────────
  useEffect(() => {
    if (!nextPhaseStartTime) {
      setNextPhaseCountdown(null);
      return;
    }
    const target = nextPhaseStartTime.getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setNextPhaseCountdown(null);
        return;
      }
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setNextPhaseCountdown({ d, h, m, s });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextPhaseStartTime]);

  // ── Dutch Auction countdown ──────────────────────────────────────────
  useEffect(() => {
    if (!effectiveMintConfig?.isDutchAuction || !effectiveMintConfig?.dutchAuction) {
      setDutchCountdown(null);
      setNextDropCountdown(null);
      setNextStepPrice(null);
      dutchAuctionStartRef.current = null;
      return;
    }

    if (dutchAuctionStartRef.current === null) {
      if (effectiveMintConfig.startDate) {
        dutchAuctionStartRef.current = new Date(effectiveMintConfig.startDate).getTime();
      } else {
        dutchAuctionStartRef.current = Date.now();
      }
    }

    const { startPrice, endPrice, durationHours } = effectiveMintConfig.dutchAuction;
    if (!Number.isFinite(startPrice) || !Number.isFinite(endPrice) || !durationHours) return;
    const useStepBasedDisplay = !!effectiveMintConfig.candyMachineAddress;

    const tick = () => {
      const startTime = dutchAuctionStartRef.current!;
      const durationMs = durationHours * 60 * 60 * 1000;
      const endTime = startTime + durationMs;
      const now = Date.now();
      const diff = endTime - now;

      if (diff <= 0) {
        setDutchCountdown({ h: 0, m: 0, s: 0 });
        setNextDropCountdown(null);
        setNextStepPrice(null);
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setDutchCountdown({ h, m, s });

      // Next price drop countdown: use 7-step logic when this drop has a Candy Machine
      if (useStepBasedDisplay && now >= startTime) {
        const stepDurationMs = durationMs / DUTCH_AUCTION_STEPS;
        const elapsed = now - startTime;
        const currentStepIdx = Math.floor(elapsed / stepDurationMs);

        if (currentStepIdx < DUTCH_AUCTION_STEPS) {
          const nextStepStart = startTime + (currentStepIdx + 1) * stepDurationMs;
          const dropDiff = nextStepStart - now;
          const dm = Math.floor(dropDiff / (1000 * 60));
          const ds = Math.floor((dropDiff % (1000 * 60)) / 1000);
          setNextDropCountdown({ m: dm, s: ds });

          const priceDrop = (startPrice - endPrice) / DUTCH_AUCTION_STEPS;
          const next = currentStepIdx + 1 >= DUTCH_AUCTION_STEPS
            ? endPrice
            : Math.max(endPrice, startPrice - priceDrop * (currentStepIdx + 1));
          setNextStepPrice(next);
        } else {
          setNextDropCountdown(null);
          setNextStepPrice(null);
        }
      } else {
        setNextDropCountdown(null);
        setNextStepPrice(null);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [effectiveMintConfig?.isDutchAuction, effectiveMintConfig?.dutchAuction, effectiveMintConfig?.startDate, effectiveMintConfig?.candyMachineAddress]);

  const fetchAndParseVRM = useCallback(async () => {
    if (vrmParsed || vrmParsing || vrmParseFetched) return;
    const rawUrl = collection?.json?.animation_url;
    const url = resolveArweaveUrl(rawUrl);
    if (!url) return;

    setVrmParsing(true);
    setVrmParseError(null);
    setVrmParseFetched(true);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch model: ${response.status}`);
      const blob = await response.blob();
      const isGlb = url.toLowerCase().includes('.glb');
      const fileName = isGlb ? 'model.glb' : 'model.vrm';
      const mimeType = isGlb ? 'model/gltf-binary' : 'model/vrm';
      const file = new File([blob], fileName, { type: mimeType });
      const { parse3DModel } = await import('@/lib/vrmParser');
      const parsed = await parse3DModel(file);
      setVrmParsed(parsed);
    } catch (err) {
      console.error('Failed to parse model:', err);
      setVrmParseError((err as Error).message || 'Failed to parse model file');
    } finally {
      setVrmParsing(false);
    }
  }, [collection?.json?.animation_url, vrmParsed, vrmParsing, vrmParseFetched]);

  useEffect(() => {
    if (activeTab === 'vrm') fetchAndParseVRM();
  }, [activeTab, fetchAndParseVRM]);

  const handleLeftPanelScroll = useCallback(() => {
    const el = leftPanelRef.current;
    setScrollTop(el?.scrollTop ?? 0);
  }, []);

  const scrollToTopOpacity = Math.min(1, scrollTop / 400);

  const scrollToTop = useCallback(() => {
    leftPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ── Load collection data ─────────────────────────────────────────────

  const loadCollectionData = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setLoadError(null);

    try {
      let coll: any = null;
      try {
        coll = await metaplex.nfts().findByMint({
          mintAddress: new PublicKey(address),
        });
      } catch {
        try {
          coll = await metaplex.nfts().findByMint({
            mintAddress: new PublicKey(address),
            loadJsonMetadata: false,
          });
        } catch {
          // Collection might be expired on devnet
        }
      }

      if (coll) {
        // If JSON wasn't loaded (Irys devnet → arweave.net 404), try Irys gateway
        if (!coll.json && coll.uri) {
          const fallbackJson = await tryFetchJsonWithIrysGateway(coll.uri);
          if (fallbackJson) {
            coll = { ...coll, json: fallbackJson, jsonLoaded: true };
          }
        }

        // Only redirect if we have JSON and it's definitively NOT a drop.
        // When JSON is null (couldn't be loaded) stay here — the user navigated
        // to /drop explicitly and we can't disprove it's a drop.
        if (coll.json && !isDropCollection(coll.json)) {
          router.replace(`/collection/${address}`);
          return;
        }

        setCollection(coll);
        const config = coll.json?.mint_config as MintConfig | undefined;
        const phases = (coll.json?.mint_phases as MintPhaseConfig[] | undefined)?.filter(Boolean);
        console.log('[Drop Page] Loaded mintConfig:', config);
        if (config?.isDutchAuction) {
          console.log('[Drop Page] Dutch auction config:', {
            startDate: config.startDate,
            durationHours: config.dutchAuction?.durationHours,
            startPrice: config.dutchAuction?.startPrice,
            endPrice: config.dutchAuction?.endPrice,
          });
        }
        setMintConfig(config || null);
        setMintPhases(phases?.length ? phases : []);

        // Load Candy Machine state and on-chain config (phases / Dutch auction) if this drop has one
        if (config?.candyMachineAddress) {
          try {
            const state = await fetchCandyMachineState(umi, config.candyMachineAddress);
            setCmState(state);

            // Prefer phases from chain when CM has phase groups (p0, p1, ...); merge allowlist from JSON
            const chainPhases = await fetchPhasesFromCandyMachine(umi, config.candyMachineAddress, phases?.length ? phases : undefined);
            if (chainPhases && chainPhases.length > 0) {
              setMintPhases(chainPhases);
            }

            // Prefer Dutch auction config from chain when CM has Dutch auction groups (da0..daN)
            const chainDutch = await fetchDutchAuctionConfigFromCandyMachine(umi, config.candyMachineAddress);
            if (chainDutch && config && chainDutch.durationHours > 0) {
              setMintConfig((prev) => ({
                ...(prev || DEFAULT_MINT_CONFIG),
                isDutchAuction: true,
                startDate: chainDutch.startDate,
                endDate: chainDutch.endDate,
                dutchAuction: {
                  startPrice: chainDutch.startPrice,
                  endPrice: chainDutch.endPrice,
                  durationHours: chainDutch.durationHours,
                },
              }));
            }
          } catch (err) {
            console.warn('[Drop Page] Could not load Candy Machine state:', err);
            setCmState(null);
          }
        } else {
          setCmState(null);
        }
      } else {
        setLoadError('Drop not found on-chain.');
      }

      // Load stats via DAS
      await loadStats();

      // Load items
      await loadNFTs(address);

      // Load holders list (DAS – has ownership; Metaplex NFTs from findByMint do not)
      setHoldersLoading(true);
      try {
        const list = await getCollectionHolders(address);
        setHoldersList(list);
      } catch (err) {
        console.warn('Failed to load holders:', err);
      } finally {
        setHoldersLoading(false);
      }

      // User mint count
      if (wallet.publicKey) {
        await loadUserMintCount();
      }
    } catch (error) {
      console.error('Failed to load drop:', error);
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address, metaplex, umi, wallet.publicKey]);

  useEffect(() => {
    loadCollectionData();
  }, [loadCollectionData]);

  // Fetch wallet SOL balance for pre-mint affordability check
  useEffect(() => {
    if (!wallet.publicKey || !metaplex) {
      setWalletBalanceSol(null);
      return;
    }
    let cancelled = false;
    metaplex.connection
      .getBalance(wallet.publicKey)
      .then((lamports) => {
        if (!cancelled) setWalletBalanceSol(lamports / LAMPORTS_PER_SOL);
      })
      .catch(() => {
        if (!cancelled) setWalletBalanceSol(null);
      });
    return () => { cancelled = true; };
  }, [wallet.publicKey, metaplex, mintPhase]);

  async function loadStats() {
    try {
      const result = await getCollectionAssets(address);
      if (result) {
        const holders = new Set<string>();
        result.items.forEach((item: any) => {
          if (item.ownership?.owner) holders.add(item.ownership.owner);
        });
        setStats({
          minted: result.total || result.items.length,
          holders: holders.size,
        });
      }
    } catch (err) {
      console.warn('Failed to load stats:', err);
    }
  }

  async function loadNFTs(collectionAddress: string) {
    try {
      const mintAddresses = await getMintsByCollection(SOLANA_RPC_URL, collectionAddress);
      if (mintAddresses.length > 0) {
        const loadedNfts = await Promise.allSettled(
          mintAddresses.map(async (mint) => {
            try {
              return await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mint) });
            } catch {
              try {
                return await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mint), loadJsonMetadata: false });
              } catch {
                return null;
              }
            }
          })
        );
        const resolved = loadedNfts
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value != null)
          .map((r) => r.value);
        setNfts(resolved);
      }
    } catch (error) {
      console.warn('Failed to load NFTs:', error);
    }
  }

  async function loadUserMintCount() {
    if (!wallet.publicKey) return;
    try {
      const userNfts = await metaplex.nfts().findAllByOwner({ owner: wallet.publicKey });
      const collKey = new PublicKey(address);
      const inCollection = userNfts.filter((nft: any) => nft.collection?.address?.equals(collKey));
      setUserMintCount(inCollection.length);
    } catch {
      // Non-critical
    }
  }

  // ── Dutch Auction price calculation ──────────────────────────────────

  function getCurrentPrice(): number {
    if (!effectiveMintConfig) return 0;
    if (!effectiveMintConfig.isDutchAuction || !effectiveMintConfig.dutchAuction) return effectiveMintConfig.price ?? 0;

    // When this drop uses a Candy Machine, use the discrete step price (matches on-chain).
    if (effectiveMintConfig.candyMachineAddress) {
      const stepPrice = getCurrentDutchAuctionStepPrice(effectiveMintConfig);
      if (stepPrice != null && Number.isFinite(stepPrice)) return stepPrice;
    }

    // Legacy fallback: smooth linear interpolation
    const { startPrice, endPrice, durationHours } = effectiveMintConfig.dutchAuction;
    if (!Number.isFinite(startPrice) || !Number.isFinite(endPrice) || !durationHours) {
      return startPrice ?? endPrice ?? effectiveMintConfig.price ?? 0;
    }
    const startTime = effectiveMintConfig.startDate ? new Date(effectiveMintConfig.startDate).getTime() : Date.now();
    const elapsed = (Date.now() - startTime) / (1000 * 60 * 60);
    const progress = Math.min(1, Math.max(0, elapsed / durationHours));
    return Math.max(endPrice, startPrice - (startPrice - endPrice) * progress);
  }

  function getDutchAuctionProgress(): number {
    if (!effectiveMintConfig?.isDutchAuction || !effectiveMintConfig?.dutchAuction) return 0;
    const { durationHours } = effectiveMintConfig.dutchAuction;
    if (!durationHours || !Number.isFinite(durationHours)) return 0;
    const startTime = effectiveMintConfig.startDate ? new Date(effectiveMintConfig.startDate).getTime() : Date.now();
    const elapsed = (Date.now() - startTime) / (1000 * 60 * 60);
    return Math.min(1, Math.max(0, elapsed / durationHours));
  }

  function canMint(): { ok: boolean; reason?: string } {
    if (!effectiveMintConfig) return { ok: false, reason: 'No mint config found' };
    if (!effectiveMintConfig.isPublic) return { ok: false, reason: 'Public minting is not enabled' };

    const now = new Date();
    if (effectiveMintConfig.startDate && new Date(effectiveMintConfig.startDate) > now) return { ok: false, reason: 'Minting has not started yet' };
    if (effectiveMintConfig.endDate && new Date(effectiveMintConfig.endDate) < now) return { ok: false, reason: 'Minting has ended' };
    const cap = cmState && effectiveMintConfig.candyMachineAddress ? cmState.itemsAvailable : effectiveMintConfig.maxSupply;
    const minted = cmState && effectiveMintConfig.candyMachineAddress ? cmState.itemsRedeemed : stats.minted;
    if (cap !== null && cap !== undefined && minted >= cap) return { ok: false, reason: 'Max supply reached' };
    if (effectiveMintConfig.maxPerWallet !== null && userMintCount >= effectiveMintConfig.maxPerWallet) return { ok: false, reason: `Wallet limit reached (${effectiveMintConfig.maxPerWallet} max)` };

    if (effectiveMintConfig.requiresAllowlist && effectiveMintConfig.allowlistAddresses) {
      if (!wallet.publicKey) return { ok: false, reason: 'Connect wallet to verify allowlist' };
      if (!effectiveMintConfig.allowlistAddresses.includes(wallet.publicKey.toString())) return { ok: false, reason: 'Your wallet is not on the allowlist' };
    }

    // Balance check: price + ~0.015 SOL for rent & tx fees
    const price = getCurrentPrice();
    const TX_FEE_BUFFER = 0.015;
    if (walletBalanceSol !== null && price > 0 && walletBalanceSol < price + TX_FEE_BUFFER) {
      return { ok: false, reason: `Insufficient balance (${walletBalanceSol.toFixed(4)} SOL). You need ~${(price + TX_FEE_BUFFER).toFixed(4)} SOL.` };
    }

    return { ok: true };
  }

  // ── Mint flow ─────────────────────────────────────────────────────────
  //
  // Two-step: handleMintRequest shows our confirmation modal first, then
  // executeMint does the actual work once the user clicks "Confirm".
  // This mirrors how MetaMask previews costs before sending on Ethereum.

  function handleMintRequest() {
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
      toast('Please connect your wallet first', 'warning');
      return;
    }
    if (!mintConfig || !collection) return;

    const { ok, reason } = canMint();
    if (!ok) {
      toast(reason || 'Cannot mint', 'error');
      return;
    }

    const price = getCurrentPrice();
    const activePhaseIdx = mintPhases.length > 0
      ? getCurrentPhaseIndexAt(mintPhases, new Date())
      : null;
    const phaseName = activePhaseIdx != null
      ? `Phase ${activePhaseIdx + 1}`
      : undefined;

    // Detect if allowlist proof is needed: user must be on the list AND CM is active
    const activePhase = activePhaseIdx != null ? mintPhases[activePhaseIdx] : null;
    const allowlist = activePhase?.allowlistAddresses ?? mintConfig.allowlistAddresses ?? [];
    const requiresAllowlistProof = Boolean(
      cmState &&
      mintConfig.candyMachineAddress &&
      allowlist.length > 0 &&
      wallet.publicKey &&
      allowlist.includes(wallet.publicKey.toString()),
    );

    setMintConfirm({
      collectionName: collection.name || 'This Collection',
      price,
      phaseName,
      requiresAllowlistProof,
    });
  }

  async function executeMint() {
    setMintConfirm(null);
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) return;
    if (!mintConfig || !collection) return;

    setMinting(true);
    setMintError(null);
    setMintErrorDetails(null);

    try {
      // ── Candy Machine path (on-chain enforcement) ─────────────────
      if (cmState && mintConfig.candyMachineAddress) {
        setMintIsCandyMachine(true);
        const activePhaseIdx = mintPhases.length > 0
          ? getCurrentPhaseIndexAt(mintPhases, new Date())
          : null;

        const activePhase = activePhaseIdx != null ? mintPhases[activePhaseIdx] : null;
        const allowlistAddresses = activePhase?.allowlistAddresses ?? mintConfig.allowlistAddresses;
        const hasAllowlist = !!(allowlistAddresses && allowlistAddresses.filter(Boolean).length > 0);
        setMintHasAllowlist(hasAllowlist);

        const candidateTokenMints = [
          ...(activePhase?.tokenHolderMints ?? []),
          ...(mintConfig.tokenHolderMints ?? []),
        ].filter(Boolean);

        const price = getCurrentPrice();
        const phasePart = activePhaseIdx != null ? ` — Phase ${activePhaseIdx + 1}` : '';
        const memo = `Minting ${collection.name || 'NFT'}${phasePart} — ${price > 0 ? `${price} SOL` : 'Free'}`;

        const { mintAddress: cmMintAddress } = await mintFromCandyMachine(umi, {
          candyMachineAddress: mintConfig.candyMachineAddress,
          phaseIndex: activePhaseIdx,
          userTokenMints: candidateTokenMints,
          allowlistAddresses: allowlistAddresses?.filter(Boolean),
          memo,
          onProgress: (step) => setMintPhase(step),
        });

        setMintPhase('success');
        toast('NFT minted successfully!', 'success');
        setLastMintedAddress(cmMintAddress);
        await loadCollectionData();
        return;
      }

      // ── Legacy path (pre-Candy Machine drops) ─────────────────────
      setMintIsCandyMachine(false);
      const actualPrice = getCurrentPrice();

      if (actualPrice > 0) {
        setMintPhase('payment');
        const creatorAddress =
          collection.updateAuthorityAddress ||
          collection.updateAuthority?.address ||
          collection.updateAuthority;

        if (creatorAddress) {
          const creatorKey =
            creatorAddress instanceof PublicKey
              ? creatorAddress
              : new PublicKey(creatorAddress.toString());

          const connection = metaplex.connection;
          const { blockhash } = await connection.getLatestBlockhash();
          const tx = new Transaction({
            recentBlockhash: blockhash,
            feePayer: wallet.publicKey,
          }).add(
            SystemProgram.transfer({
              fromPubkey: wallet.publicKey,
              toPubkey: creatorKey,
              lamports: Math.round(actualPrice * LAMPORTS_PER_SOL),
            }),
          );

          const signed = await wallet.signTransaction(tx);
          await connection.sendRawTransaction(signed.serialize());
        }
      }

      setMintPhase('minting');
      const { nft } = await metaplex.nfts().create({
        uri: collection.uri,
        name: `${collection.name} #${stats.minted + 1}`,
        symbol: collection.symbol || '',
        sellerFeeBasisPoints: collection.sellerFeeBasisPoints || 500,
        collection: new PublicKey(address),
      });

      setMintPhase('verifying');
      try {
        await metaplex.nfts().verifyCollection({
          mintAddress: nft.address,
          collectionMintAddress: new PublicKey(address),
        });
      } catch (verifyErr) {
        console.warn('Collection verification failed:', verifyErr);
      }

      setMintPhase('success');
      toast('NFT minted successfully!', 'success');
      setLastMintedAddress(nft.address.toString());
      await loadCollectionData();
    } catch (error) {
      console.error('Mint failed:', error);
      const parsed = parseSolanaError(error);
      setMintError(parsed.friendly);
      setMintErrorDetails(parsed.raw);
    }
  }

  function handleMintProgressClose() {
    setMinting(false);
    setMintPhase('');
    setMintError(null);
    setMintErrorDetails(null);
    setMintHasAllowlist(false);
  }

  // ── Save mint config (pause / close / resume) ─────────────────────────

  function handleSaveMintConfig(nextConfig: MintConfig, phases?: MintPhaseConfig[]) {
    if (!collection) return;
    const merged: MintConfig = {
      ...(mintConfig || DEFAULT_MINT_CONFIG),
      ...nextConfig,
      revenueSplits: nextConfig.revenueSplits ?? mintConfig?.revenueSplits,
      editors: nextConfig.editors ?? mintConfig?.editors,
      candyMachineAddress: mintConfig?.candyMachineAddress,
      candyGuardAddress: mintConfig?.candyGuardAddress,
    };

    if (merged.candyMachineAddress) {
      setPendingSave({ config: merged, phases });
    } else {
      executeSaveMintConfig(merged, phases);
    }
  }

  async function executeSaveMintConfig(merged: MintConfig, phases?: MintPhaseConfig[]) {
    if (!collection) return;
    setPendingSave(null);
    setSavingMintConfig(true);
    try {
      if (merged.candyMachineAddress) {
        try {
          await updateDropGuards(
            umi,
            merged.candyMachineAddress,
            merged,
            phases && phases.length >= 1 ? phases : undefined,
          );
        } catch (guardErr) {
          console.error('Failed to update Candy Machine guards:', guardErr);
          toast('Warning: on-chain guard update failed. Metadata will still be updated.', 'warning', 6000);
        }
      }

      const currentJson = collection.json || {};
      const updatedMetadata: Record<string, unknown> = {
        ...currentJson,
        name: collection.name,
        symbol: collection.symbol,
        mint_config: merged,
      };
      if (phases && phases.length >= 1) {
        updatedMetadata.mint_phases = phases;
      } else {
        delete updatedMetadata.mint_phases;
      }

      const newMetadataUrl = await uploadMetadataToArweave(metaplex, updatedMetadata);

      await metaplex.nfts().update({
        nftOrSft: collection,
        uri: newMetadataUrl,
      });

      setMintConfig(merged);
      setMintPhases(phases && phases.length >= 1 ? phases : []);
      setCollection((prev: any) =>
        prev
          ? {
              ...prev,
              uri: newMetadataUrl,
              json: {
                ...prev.json,
                mint_config: merged,
                ...(phases && phases.length >= 1 ? { mint_phases: phases } : {}),
              },
            }
          : null
      );
      toast('Drop settings updated.', 'success');
      setShowSettings(false);
      await loadCollectionData();
    } catch (error) {
      console.error('Failed to save drop settings:', error);
      toast('Failed to save: ' + (error as Error).message, 'error', 8000);
    } finally {
      setSavingMintConfig(false);
    }
  }

  function handleSaveDropSettings() {
    if (!collection || !mintConfig) return;
    const base = settingsMintConfig ?? mintConfig;
    let phases = settingsPhases.length > 0 ? settingsPhases.map((p) => ({ ...p })) : [mintConfigToPhase(mintConfig)];

    const arrEq = (a: string[] | undefined, b: string[] | undefined) => {
      const aa = [...(a ?? [])].filter(Boolean).sort();
      const bb = [...(b ?? [])].filter(Boolean).sort();
      return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
    };
    const baseAccessChanged =
      (base.access ?? 'anyone') !== (mintConfig.access ?? 'anyone') ||
      !arrEq(base.allowlistAddresses, mintConfig.allowlistAddresses) ||
      !arrEq(base.tokenHolderMints, mintConfig.tokenHolderMints);

    if (baseAccessChanged) {
      phases = phases.map((p) => ({
        ...p,
        access: base.access ?? p.access ?? 'anyone',
        allowlistAddresses: base.allowlistAddresses,
        tokenHolderMints: base.tokenHolderMints,
      }));
    }

    const first = phases[0];
    const merged: MintConfig = {
      ...mintConfig,
      access: base.access ?? 'anyone',
      tokenHolderMints: base.tokenHolderMints,
      allowlistAddresses: base.allowlistAddresses,
      requiresAllowlist: (base.allowlistAddresses?.length ?? 0) > 0,
      price: first.price,
      maxSupply: first.maxSupply,
      maxPerWallet: first.maxPerWallet,
      startDate: first.startDate,
      endDate: first.endDate,
      ...(mintConfig.isDutchAuction && base.dutchAuction
        ? {
            startDate: base.startDate ?? first.startDate,
            endDate: base.endDate ?? first.endDate,
            dutchAuction: base.dutchAuction,
          }
        : {}),
    };

    if (!baseAccessChanged && (first.access || 'anyone') === 'custom') {
      merged.access = 'custom';
      merged.tokenHolderMints = first.tokenHolderMints;
      merged.allowlistAddresses = first.allowlistAddresses;
      merged.requiresAllowlist = (first.allowlistAddresses?.length ?? 0) > 0;
    }

    const hadPhases = mintPhases.length > 0;
    const persistPhases = hadPhases || phases.length > 1 ? phases : undefined;
    handleSaveMintConfig(merged, persistPhases);
  }

  function handlePauseDrop() {
    if (!mintConfig) return;
    handleSaveMintConfig({ ...mintConfig, isPublic: false });
  }

  function handleResumeDrop() {
    if (!mintConfig) return;
    handleSaveMintConfig({ ...mintConfig, isPublic: true });
  }

  function handleCloseDrop() {
    if (!mintConfig) return;
    handleSaveMintConfig({
      ...mintConfig,
      isPublic: false,
      endDate: new Date().toISOString(),
    });
  }

  /** Open Edition with phases: phase in range (for settings actions). */
  const phaseInRangeIndex = mintPhases.length >= 1 && !mintConfig?.isDutchAuction ? getPhaseInRangeIndexAt(mintPhases, new Date()) : null;
  const phaseInRange = phaseInRangeIndex != null ? mintPhases[phaseInRangeIndex] : null;
  const isPhasedOpenEdition = mintPhases.length >= 1 && !mintConfig?.isDutchAuction;

  function handlePausePhase() {
    if (!mintConfig || phaseInRangeIndex == null) return;
    const updated = mintPhases.map((p, i) => (i === phaseInRangeIndex ? { ...p, paused: true } : p));
    handleSaveMintConfig({ ...mintConfig }, updated);
  }

  function handleResumePhase() {
    if (!mintConfig || phaseInRangeIndex == null) return;
    const updated = mintPhases.map((p, i) => (i === phaseInRangeIndex ? { ...p, paused: false } : p));
    handleSaveMintConfig({ ...mintConfig }, updated);
  }

  function handleEndCurrentPhase() {
    if (!mintConfig || phaseInRangeIndex == null) return;
    const now = new Date().toISOString();
    const updated = mintPhases.map((p, i) => (i === phaseInRangeIndex ? { ...p, endDate: now } : p));
    const merged = phaseInRangeIndex === 0 ? { ...mintConfig, endDate: now } : mintConfig;
    handleSaveMintConfig(merged, updated);
  }

  // ── Derived data ─────────────────────────────────────────────────────

  // When we have Candy Machine state, use chain supply for sold-out and counts (single source of truth)
  const supplyCap =
    cmState && effectiveMintConfig?.candyMachineAddress
      ? cmState.itemsAvailable
      : (effectiveMintConfig?.maxSupply ?? null);
  const mintedCount =
    cmState && effectiveMintConfig?.candyMachineAddress ? cmState.itemsRedeemed : stats.minted;
  const configForStatus =
    cmState && effectiveMintConfig?.candyMachineAddress && effectiveMintConfig
      ? { ...effectiveMintConfig, maxSupply: cmState.itemsAvailable }
      : effectiveMintConfig;

  const status: MintStatus = getMintStatus(configForStatus, mintedCount);
  const statusLabel = getMintStatusLabel(status);
  const statusColor = getMintStatusColor(status);
  const currentPrice = getCurrentPrice();
  const isDutch = effectiveMintConfig?.isDutchAuction && effectiveMintConfig?.dutchAuction;

  const displayName = collection?.name || 'Drop';
  const displayDescription = collection?.json?.description || '';
  const displayImage = resolveArweaveUrl(collection?.json?.image);
  const displaySymbol = collection?.symbol || '';
  const animationUrl = resolveArweaveUrl(collection?.json?.animation_url);
  const isVRM = !!animationUrl;
  const json = collection?.json || {};
  const rawFiles: { uri: string; type: string; name?: string }[] = json.properties?.files || [];
  const files = rawFiles.map((f) => ({ ...f, uri: resolveArweaveUrl(f.uri) || f.uri }));
  const attributes = json.attributes || [];

  // Main model is GLB when URL has .glb or we've already parsed it as GLB
  const isMainModelGLB = !!(animationUrl && (getExtFromUri(animationUrl) === 'glb' || vrmParsed?.fileType === 'glb'));

  // Files (same structure as item page)
  const typedFiles = useMemo(() => files.map((f) => ({ ...f, resolvedType: inferFileType(f) })), [files]);
  const modelFiles = useMemo(() => typedFiles.filter((f) => isModelType(f.resolvedType)), [typedFiles]);
  const imageFiles = useMemo(() => typedFiles.filter((f) => isImageType(f.resolvedType)), [typedFiles]);

  // Viewer models: main animation_url + additional model files (for 3D viewer tabs)
  const viewerModels = useMemo(() => {
    const models: { url: string; label: string; isVrm: boolean }[] = [];
    if (animationUrl) {
      models.push({ url: animationUrl, label: 'Main Avatar', isVrm: true });
    }
    modelFiles.forEach((f) => {
      if (f.uri === animationUrl) return;
      const label = f.name || getFileTypeLabel(f.resolvedType);
      models.push({ url: f.uri, label, isVrm: f.resolvedType === 'model/vrm' });
    });
    return models;
  }, [animationUrl, modelFiles]);

  const safeModelIndex = Math.min(activeModelIndex, Math.max(0, viewerModels.length - 1));
  const activeViewerUrl = viewerModels[safeModelIndex]?.url || animationUrl || null;
  const activeModelIsVrm = viewerModels[safeModelIndex]?.isVrm ?? true;

  const modelTabLabel = isMainModelGLB ? 'GLB' : 'VRM';

  const tabs: { id: TabId; label: string }[] = useMemo(() => {
    const t: { id: TabId; label: string }[] = [
      { id: 'details', label: 'Details' },
      { id: 'holders', label: `Holders (${holdersList.length})` },
    ];
    if (isVRM) t.push({ id: 'vrm', label: modelTabLabel });
    if (files.length > 0) t.push({ id: 'assets', label: 'Assets' });
    return t;
  }, [holdersList.length, files.length, isVRM, modelTabLabel]);

  // Check ownership
  const ownerPubkey = wallet.publicKey;
  const isOwner =
    ownerPubkey &&
    collection &&
    (collection.updateAuthorityAddress?.equals(ownerPubkey) ||
      collection.updateAuthority?.address?.equals(ownerPubkey) ||
      collection.updateAuthority?.equals?.(ownerPubkey));

  // ── Loading state ────────────────────────────────────────────────────

  if (loading) {
    return (
      <ForgePageWrapper embers={12} noScroll>
        <div className="flex items-center justify-center flex-1 min-h-0">
          <div className="text-center">
            <div className="spinner-forge mx-auto" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 animate-fade-in">Loading drop...</p>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  if (!collection) {
    return (
      <ForgePageWrapper embers={12} noScroll>
        <div className="flex items-center justify-center flex-1 min-h-0">
          <div className="text-center max-w-sm animate-slide-up">
            <div className="w-12 h-12 mx-auto mb-4 bg-gray-100/50 dark:bg-gray-800/50 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Drop not found</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {loadError || 'The drop at this address could not be loaded.'}
            </p>
            <Link href="/dashboard" className="btn-hero-primary inline-block py-3 px-8">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <ForgePageWrapper embers={16} noScroll>
      <ImagePreview src={previewImageSrc} onClose={() => setPreviewImageSrc(null)} />
      <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] min-h-0 overflow-hidden">

        {/* ═══ Left Panel (wrapper: button stays bottom-right of visible area) ═══ */}
        <div className="w-full lg:w-[420px] xl:w-[460px] flex-shrink-0 flex flex-col min-h-0 border-r border-gray-200/30 dark:border-gray-700/30 bg-[var(--background)]/80 backdrop-blur-sm relative z-10">
          <div
            ref={leftPanelRef}
            onScroll={handleLeftPanelScroll}
            className="flex-1 min-h-0 overflow-y-auto"
          >
          <div className="p-6 lg:p-8">

            {/* 1. Name + Settings (owner only) */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight min-w-0">
                {displayName}
              </h1>
              {isOwner && !showSettings && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(true);
                    const base = mintConfig ?? DEFAULT_MINT_CONFIG;
                    setSettingsMintConfig({ ...base });
                    setSettingsPhases(
                      mintPhases.length > 0
                        ? mintPhases.map((p) => ({ ...p }))
                        : [mintConfigToPhase(base)]
                    );
                  }}
                  className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100/80 dark:bg-gray-800/80 hover:bg-orange-400/15 border border-gray-200/50 dark:border-gray-700/50 flex items-center justify-center transition-all duration-200 hover:border-orange-400/30 hover:text-orange-400"
                  title="Drop settings"
                  aria-label="Drop settings"
                >
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}
            </div>

            {/* ── Guard price mismatch warning (owner only) ─────────────────────── */}
            {isOwner && !showSettings && cmState && mintConfig && mintConfig.price > 0 && currentPrice === 0 && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700/60 flex items-start gap-3">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-red-700 dark:text-red-400">
                    Security: Candy Machine guard price is 0 (free)
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
                    Your drop metadata shows {mintConfig.price} SOL, but the on-chain guard charges nothing — anyone can mint for free right now. Open Settings and save the correct price to fix the guard.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(true);
                    const base = mintConfig ?? DEFAULT_MINT_CONFIG;
                    setSettingsMintConfig({ ...base });
                    // Force the correct price from mintConfig into every phase so
                    // saving immediately pushes the right price to the CM guard.
                    setSettingsPhases(
                      mintPhases.length > 0
                        ? mintPhases.map((p) => ({ ...p, price: base.price }))
                        : [mintConfigToPhase(base)]
                    );
                  }}
                  className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  Fix now
                </button>
              </div>
            )}

            {/* ── Settings view (owner only) ───────────────────────────────────── */}
            {showSettings && isOwner && (
              <div className="space-y-6 animate-fade-in">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  disabled={savingMintConfig}
                  className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-orange-400 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to drop
                </button>

                <div className="border border-gray-200/40 dark:border-gray-700/40 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 p-5">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Drop settings
                  </h2>

                  {/* Supply cap notice (Candy Machine drops) */}
                  {cmState && (
                    <div className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200/60 dark:border-amber-700/30">
                      <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                          Supply cap: {(supplyCap ?? mintConfig?.maxSupply ?? 100_000).toLocaleString()} (set at launch, cannot be increased)
                        </p>
                        <p className="text-xs text-amber-600/80 dark:text-amber-500/70 mt-0.5">
                          {mintedCount.toLocaleString()} minted so far. Price, dates, access, and phases can still be updated.
                        </p>
                      </div>
                    </div>
                  )}

                  {isPhasedOpenEdition && phaseInRangeIndex != null ? (
                    <>
                      <p className="text-caption text-gray-500 dark:text-gray-400 mb-3">
                        Open Edition with phases. Control the phase that is currently in range.
                      </p>
                      <div className="mb-4 px-3 py-2 rounded-lg bg-orange-400/10 border border-orange-400/20">
                        <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">Current Phase {phaseInRangeIndex + 1}</span>
                        {phaseInRange?.paused && (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">(paused)</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-3">
                        {phaseInRange?.paused ? (
                          <button
                            type="button"
                            onClick={handleResumePhase}
                            disabled={savingMintConfig}
                            className="w-full py-3 px-4 rounded-lg border border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400 font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {savingMintConfig ? 'Updating…' : 'Resume phase'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handlePausePhase}
                            disabled={savingMintConfig}
                            className="w-full py-3 px-4 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {savingMintConfig ? 'Updating…' : 'Pause phase'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleEndCurrentPhase}
                          disabled={savingMintConfig}
                          className="w-full py-3 px-4 rounded-lg border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {savingMintConfig ? 'Updating…' : 'End current phase'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                        Pause: temporarily disables minting for this phase; you can resume later. End: sets this phase’s end date to now (next phase may become active).
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-caption text-gray-500 dark:text-gray-400 mb-5">
                        Pause or close this drop. Changes are saved on-chain.
                      </p>
                      <div className="flex flex-col gap-3">
                        {mintConfig?.isPublic ? (
                          <button
                            type="button"
                            onClick={handlePauseDrop}
                            disabled={savingMintConfig}
                            className="w-full py-3 px-4 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {savingMintConfig ? 'Updating…' : 'Pause drop'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResumeDrop}
                            disabled={savingMintConfig}
                            className="w-full py-3 px-4 rounded-lg border border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400 font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {savingMintConfig ? 'Updating…' : 'Resume drop'}
                          </button>
                        )}

                        {status !== 'ended' && status !== 'sold_out' && (
                          <button
                            type="button"
                            onClick={handleCloseDrop}
                            disabled={savingMintConfig}
                            className="w-full py-3 px-4 rounded-lg border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            {savingMintConfig ? 'Updating…' : 'Close drop permanently'}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                        Pause: temporarily disables minting; you can resume later. Close: ends the drop and disables minting permanently.
                      </p>
                    </>
                  )}
                </div>

                {/* Access: who can mint (Default vs Custom, token holders, allowlist) */}
                <div className="border border-gray-200/40 dark:border-gray-700/40 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 p-5">
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">Access</h3>
                  <p className="text-caption text-gray-500 dark:text-gray-400 mb-4">
                    Who can mint: anyone (default) or custom (token holders and/or allowlist).
                  </p>
                  <DropAccessEditor
                    config={settingsMintConfig ?? mintConfig ?? DEFAULT_MINT_CONFIG}
                    onChange={setSettingsMintConfig}
                  />
                </div>

                {/* Dutch Auction: price curve and timing (when drop is Dutch auction) */}
                {mintConfig?.isDutchAuction && (
                  <div className="border border-gray-200/40 dark:border-gray-700/40 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 p-5">
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">Dutch Auction</h3>
                    <p className="text-caption text-gray-500 dark:text-gray-400 mb-4">
                      Price decreases over time in {DUTCH_AUCTION_STEPS} steps. Start and end price, duration, and window are enforced on-chain.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Start price (SOL)</label>
                        <ForgeNumberInput
                          min="0"
                          step="0.01"
                          value={settingsMintConfig?.dutchAuction?.startPrice ?? mintConfig?.dutchAuction?.startPrice ?? ''}
                          onValueChange={(v) =>
                            setSettingsMintConfig((prev) => ({
                              ...(prev ?? mintConfig ?? DEFAULT_MINT_CONFIG),
                              dutchAuction: {
                                ...(prev?.dutchAuction ?? mintConfig?.dutchAuction ?? { startPrice: 0, endPrice: 0, durationHours: 24 }),
                                startPrice: parseFloat(v) || 0,
                              },
                            }))
                          }
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">End price / floor (SOL)</label>
                        <ForgeNumberInput
                          min="0"
                          step="0.01"
                          value={settingsMintConfig?.dutchAuction?.endPrice ?? mintConfig?.dutchAuction?.endPrice ?? ''}
                          onValueChange={(v) =>
                            setSettingsMintConfig((prev) => ({
                              ...(prev ?? mintConfig ?? DEFAULT_MINT_CONFIG),
                              dutchAuction: {
                                ...(prev?.dutchAuction ?? mintConfig?.dutchAuction ?? { startPrice: 0, endPrice: 0, durationHours: 24 }),
                                endPrice: parseFloat(v) || 0,
                              },
                            }))
                          }
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Duration (hours)</label>
                        <ForgeNumberInput
                          min="0.1"
                          step="0.5"
                          value={settingsMintConfig?.dutchAuction?.durationHours ?? mintConfig?.dutchAuction?.durationHours ?? ''}
                          onValueChange={(v) =>
                            setSettingsMintConfig((prev) => ({
                              ...(prev ?? mintConfig ?? DEFAULT_MINT_CONFIG),
                              dutchAuction: {
                                ...(prev?.dutchAuction ?? mintConfig?.dutchAuction ?? { startPrice: 0, endPrice: 0, durationHours: 24 }),
                                durationHours: parseFloat(v) || 24,
                              },
                            }))
                          }
                          placeholder="24"
                        />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Mint start</label>
                        <DateTimePicker
                          value={settingsMintConfig?.startDate ?? mintConfig?.startDate ?? undefined}
                          onChange={(v) =>
                            setSettingsMintConfig((prev) => ({
                              ...(prev ?? mintConfig ?? DEFAULT_MINT_CONFIG),
                              startDate: v ?? null,
                            }))
                          }
                          placeholder="Immediate"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Mint end</label>
                        <DateTimePicker
                          value={settingsMintConfig?.endDate ?? mintConfig?.endDate ?? undefined}
                          onChange={(v) =>
                            setSettingsMintConfig((prev) => ({
                              ...(prev ?? mintConfig ?? DEFAULT_MINT_CONFIG),
                              endDate: v ?? null,
                            }))
                          }
                          placeholder="No end"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Phases: only for Open Mint (not Dutch Auction) */}
                {mintConfig && !mintConfig.isDutchAuction && (
                  <div className="border border-gray-200/40 dark:border-gray-700/40 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 p-5">
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">Phases</h3>
                    <p className="text-caption text-gray-500 dark:text-gray-400 mb-4">
                      Add or edit phases (schedule, price, supply, access per phase).
                    </p>
                    <DropPhasesEditor
                      phases={settingsPhases}
                      onChange={setSettingsPhases}
                      baseConfig={mintConfig}
                      currentPhaseIndex={getCurrentPhaseIndexAt(settingsPhases, new Date())}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleSaveDropSettings()}
                  disabled={savingMintConfig}
                  className="btn-hero-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {savingMintConfig ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            )}

            {/* 2. Description */}
            {!showSettings && displayDescription && (
              <div className="mb-5">
                <p className={`text-sm text-gray-600 dark:text-gray-400 leading-relaxed ${!descriptionExpanded ? 'line-clamp-3' : ''}`}>
                  {displayDescription}
                </p>
                {displayDescription.length > 180 && (
                  <button
                    type="button"
                    onClick={() => setDescriptionExpanded((e) => !e)}
                    className="mt-1 inline-flex items-center gap-1 text-caption text-gray-500 dark:text-gray-400 hover:text-orange-400 transition-colors"
                    aria-label={descriptionExpanded ? 'Show less' : 'Show more'}
                  >
                    {descriptionExpanded ? 'Show less' : 'Show more'}
                    <span className="inline-flex w-5 h-5 items-center justify-center rounded bg-gray-200/50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400">
                      {descriptionExpanded ? '−' : '+'}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Creator — subtle */}
            {!showSettings && collection && (
              <div className="flex items-center gap-2 mb-5">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 flex-shrink-0" />
                <Link
                  href={`/creator/${(collection.updateAuthorityAddress || collection.updateAuthority?.address || collection.updateAuthority)?.toString()}`}
                  className="text-sm font-mono text-gray-500 dark:text-gray-400 hover:text-orange-400 transition-colors"
                >
                  {shortenAddress(
                    (collection.updateAuthorityAddress || collection.updateAuthority?.address || collection.updateAuthority)?.toString() || '',
                    4
                  )}
                </Link>
                {isOwner && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-orange-400/10 border border-orange-400/20 text-orange-400 font-medium">
                    YOU
                  </span>
                )}
              </div>
            )}

            {/* 3. Minting card — always the same, scrolls with content */}
            {!showSettings && (
            <div
              className={`rounded-xl border bg-gray-50/60 dark:bg-gray-800/40 p-5 mb-5 ${
                status === 'live'
                  ? 'mint-card-open'
                  : 'mint-card-closed border-gray-200/40 dark:border-gray-700/40'
              }`}
            >
              {/* Check if auction ended or sold out */}
              {(() => {
                const isAuctionEnded = isDutch && dutchCountdown && dutchCountdown.h === 0 && dutchCountdown.m === 0 && dutchCountdown.s === 0;
                const isSoldOut = supplyCap != null && mintedCount >= supplyCap;
                const isAuctionOver = status === 'ended' || isAuctionEnded || isSoldOut;

                if (isAuctionOver) {
                  // Show final sold price without countdown/progress bar
                  return (
                    <>
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex-1">
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                            {isSoldOut ? 'Sold for' : 'Final price'}
                          </p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {!currentPrice || currentPrice <= 0 ? 'Free' : `${formatSolPrice(currentPrice)} SOL`}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200/50 dark:bg-gray-700/50 border border-gray-200/50 dark:border-gray-600/50 text-sm font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">
                          <SolanaIcon className="w-4 h-4 flex-shrink-0" />
                          Solana
                        </span>
                      </div>

                      <div className="w-full bg-gray-100 dark:bg-gray-800/50 border border-gray-200/30 dark:border-gray-700/20 text-gray-600 dark:text-gray-400 font-bold px-8 py-4 text-center rounded-lg">
                        {isSoldOut ? 'SOLD OUT' : 'AUCTION ENDED'}
                      </div>

                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200/40 dark:border-gray-700/40 text-sm text-gray-500 dark:text-gray-400">
                        <span>
                          {mintedCount}
                          {supplyCap != null && ` / ${supplyCap}`} minted
                        </span>
                        <span>{isDutch ? 'Dutch Auction' : 'Open edition'}</span>
                      </div>
                    </>
                  );
                }

                // Normal active auction state
                return (
                  <>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex-1">
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {!currentPrice || currentPrice <= 0 ? 'Free' : `${formatSolPrice(currentPrice)} SOL`}
                        </p>
                        {currentPrice > 0 && (
                          <p className="text-caption text-gray-500 dark:text-gray-400 mt-0.5">+ network fee</p>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200/50 dark:bg-gray-700/50 border border-gray-200/50 dark:border-gray-600/50 text-sm font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">
                        <SolanaIcon className="w-4 h-4 flex-shrink-0" />
                        Solana
                      </span>
                    </div>

                    {hasAccessRestrictions && (
                      <button
                        type="button"
                        onClick={() => setShowAllowlistModal(true)}
                        className="flex items-center gap-1.5 mb-3 text-xs text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors group"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span className="group-hover:underline">Who can mint?</span>
                      </button>
                    )}

                    {/* Dutch Auction Info - Full Width */}
                    {isDutch && effectiveMintConfig?.dutchAuction && (
                      <div className="mb-4 space-y-2">
                        {/* Price range with progress bar */}
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                          <span>{formatSolPrice(effectiveMintConfig.dutchAuction.startPrice)} SOL</span>
                          <span>{formatSolPrice(effectiveMintConfig.dutchAuction.endPrice)} SOL</span>
                        </div>
                        <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden w-full">
                          <div 
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-1000 ease-linear"
                            style={{ width: `${getDutchAuctionProgress() * 100}%` }}
                          />
                        </div>

                        {/* Next price drop countdown (step-based) */}
                        {nextDropCountdown && nextStepPrice != null && (
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                              </svg>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                Next drop to <span className="font-semibold text-gray-700 dark:text-gray-200">{formatSolPrice(nextStepPrice)} SOL</span>
                              </span>
                            </div>
                            <span className="text-xs font-mono font-semibold text-orange-400">
                              {String(nextDropCountdown.m).padStart(2, '0')}:{String(nextDropCountdown.s).padStart(2, '0')}
                            </span>
                          </div>
                        )}

                        {/* Overall auction countdown */}
                        {dutchCountdown && !(dutchCountdown.h === 0 && dutchCountdown.m === 0 && dutchCountdown.s === 0) && (
                          <div className="flex items-center justify-between pt-0.5">
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                Floor price ({formatSolPrice(effectiveMintConfig.dutchAuction.endPrice)} SOL) in
                              </span>
                            </div>
                            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                              {String(dutchCountdown.h).padStart(2, '0')}:{String(dutchCountdown.m).padStart(2, '0')}:{String(dutchCountdown.s).padStart(2, '0')}
                            </span>
                          </div>
                        )}

                        {/* How it works */}
                        <div className="mt-2 p-2.5 rounded-lg bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200/40 dark:border-orange-800/30">
                          <p className="text-[11px] leading-relaxed text-orange-800/80 dark:text-orange-300/70">
                            Price decreases in {DUTCH_AUCTION_STEPS} steps from {formatSolPrice(effectiveMintConfig.dutchAuction.startPrice)} to {formatSolPrice(effectiveMintConfig.dutchAuction.endPrice)} SOL over {effectiveMintConfig.dutchAuction.durationHours ?? 0}h. The price shown is the exact amount you&apos;ll pay. Mint now or wait for the next drop.
                          </p>
                        </div>
                      </div>
                    )}

                    {status === 'live' ? (
                      <div className="space-y-2">
                        <button
                          onClick={
                            wallet.connected
                              ? handleMintRequest
                              : () => setWalletModalVisible(true)
                          }
                          disabled={wallet.connected && (minting || !canMint().ok)}
                          className="btn-hero-primary w-full py-4 text-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {minting ? 'Minting...' : 'MINT'}
                        </button>
                        {!wallet.connected && (
                          <p className="text-caption text-amber-600 dark:text-amber-400 text-center">
                            Connect your wallet to mint
                          </p>
                        )}
                        {!canMint().ok && wallet.connected && (
                          <p className="text-caption text-red-500 dark:text-red-400 text-center">
                            {canMint().reason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="w-full bg-gray-100 dark:bg-gray-800/50 border border-gray-200/30 dark:border-gray-700/20 font-bold px-8 py-4 text-center rounded-lg">
                          {isPhasedOpenEdition && phaseInRange?.paused ? (
                            <span className="text-amber-600 dark:text-amber-400 flex items-center justify-center gap-2">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Mint paused
                            </span>
                          ) : isPhasedOpenEdition && nextPhaseCountdown ? (
                            <span className="text-gray-700 dark:text-gray-300">
                              Next phase starts in{' '}
                              <span className="font-mono text-orange-500 dark:text-orange-400">
                                {nextPhaseCountdown.d}D : {nextPhaseCountdown.h}H : {nextPhaseCountdown.m}M : {nextPhaseCountdown.s}S
                              </span>
                            </span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">{statusLabel}</span>
                          )}
                        </div>
                        {hasAccessRestrictions && (
                          <button
                            type="button"
                            onClick={() => setShowAllowlistModal(true)}
                            className="flex items-center justify-center gap-1.5 mt-2 text-xs text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors group w-full"
                          >
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span className="group-hover:underline">Who can mint?</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Post-mint success: link to the minted item */}
                    {lastMintedAddress && !minting && (
                      <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 animate-slide-up">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                              <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-small font-bold text-green-700 dark:text-green-400">Avatar minted!</p>
                              <p className="text-caption text-gray-500 dark:text-gray-400">View and download your 3D file.</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setLastMintedAddress(null)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0 mt-0.5 transition-colors"
                            aria-label="Dismiss"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <Link
                          href={`/item/${lastMintedAddress}`}
                          className="flex items-center justify-center gap-2 w-full py-2.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-700 dark:text-green-400 text-small font-bold transition-colors"
                        >
                          View Your Avatar
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </Link>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200/40 dark:border-gray-700/40 text-sm text-gray-500 dark:text-gray-400">
                      <span>
                        {mintedCount}
                        {supplyCap != null && ` / ${supplyCap}`} minted
                      </span>
                      <span>{isDutch ? 'Dutch Auction' : 'Open edition'}</span>
                    </div>

                    {countdownLabel && (
                      <div className="mt-3 pt-3 border-t border-gray-200/40 dark:border-gray-700/40 text-center">
                        {countdownLabel === 'ended' ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">Ended</p>
                        ) : countdown ? (
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            {countdownLabel === 'starts' ? 'Starts in ' : 'Ends in '}
                            <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                              {countdown.d}D : {countdown.h}H : {countdown.m}M : {countdown.s}S
                            </span>
                          </p>
                        ) : null}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            )}

            {/* Social + Links (below mint card) */}
            {!showSettings && (
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <ShareButtons
                url={typeof window !== 'undefined' ? window.location.href : ''}
                title={displayName}
                description={displayDescription}
              />
              <a
                href={`${EXPLORER_URL}/address/${address}?cluster=${SOLANA_NETWORK}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-caption text-gray-400 hover:text-orange-400 transition-colors"
              >
                Explorer
              </a>
            </div>
            )}

            {/* ── Tabs (single line, horizontal scroll if needed) ── */}
            {!showSettings && (
            <div className="flex flex-nowrap gap-0 border-b border-gray-200/30 dark:border-gray-700/20 mb-6 overflow-x-auto min-w-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-forge flex-shrink-0 px-2.5 py-2 text-xs ${activeTab === tab.id ? 'tab-forge-active' : 'tab-forge-inactive'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            )}

            {/* ════════ TAB: Holders ════════ */}
            {!showSettings && activeTab === 'holders' && (
              <div>
                {holdersLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="spinner-forge mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading holders...</p>
                  </div>
                ) : holdersList.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-body text-gray-400 mb-2">No holders yet</p>
                    <p className="text-small text-gray-400/60">Be the first to mint from this drop!</p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {holdersList.map(({ address: owner, count }) => (
                      <li
                        key={owner}
                        className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200/30 dark:border-gray-700/20 hover:border-gray-300/40 dark:hover:border-gray-600/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-mono text-gray-900 dark:text-gray-100 truncate" title={owner}>
                            {shortenAddress(owner, 6)}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(owner);
                                toast?.success?.('Address copied');
                              } catch {
                                toast?.error?.('Failed to copy');
                              }
                            }}
                            className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                            title="Copy address"
                            aria-label="Copy address"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
                            {count} {count === 1 ? 'item' : 'items'}
                          </span>
                          <a
                            href={`${EXPLORER_URL}/address/${owner}?cluster=${SOLANA_NETWORK}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-caption text-gray-400 hover:text-orange-400 transition-colors"
                            title="View on Explorer"
                          >
                            Explorer
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ════════ TAB: VRM/GLB (parsed from animation_url) ════════ */}
            {!showSettings && activeTab === 'vrm' && isVRM && (
              <div className="space-y-5">
                {vrmParsing && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="spinner-forge mx-auto mb-4" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Parsing {modelTabLabel} model...</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Downloading and analyzing the 3D file</p>
                  </div>
                )}

                {vrmParseError && !vrmParsing && (
                  <div className="error-forge">
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Could not parse {modelTabLabel}</p>
                    <p className="text-xs text-red-500 dark:text-red-400/80">{vrmParseError}</p>
                    <button
                      onClick={() => { setVrmParseFetched(false); setVrmParseError(null); fetchAndParseVRM(); }}
                      className="mt-3 text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {vrmParsed && (
                  <>
                    <section>
                      <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                        Basic Information
                      </p>
                      <div className="space-y-1.5 pt-1">
                        {vrmParsed.fileType === 'vrm' && (
                          <div>
                            <span className="text-caption text-gray-500 dark:text-gray-400 block mb-0.5">Thumbnail</span>
                            {vrmParsed.thumbnail ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImageSrc(vrmParsed.thumbnail!)}
                                className="w-16 h-16 rounded overflow-hidden border border-gray-200 dark:border-gray-700 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-1"
                              >
                                <img src={vrmParsed.thumbnail} alt="Model thumbnail" className="w-full h-full object-cover" />
                              </button>
                            ) : (
                              <span className="text-caption text-gray-500 dark:text-gray-400">No embedded thumbnail</span>
                            )}
                          </div>
                        )}
                        <MetadataRow label="Model" value={vrmParsed.title} />
                        {vrmParsed.fileType === 'vrm' && (
                          <MetadataRow label="Author" value={vrmParsed.author || '\u2014'} />
                        )}
                        <MetadataRow label="Version" value={vrmParsed.version} />
                        {vrmParsed.fileType === 'vrm' && (
                          <>
                            <LinkableMetadataRow label="Contact" value={vrmParsed.contactInformation} />
                            <LinkableMetadataRow label="References" value={vrmParsed.reference} />
                          </>
                        )}
                      </div>
                    </section>

                    <section>
                      <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                        License
                      </p>
                      <div className="space-y-1.5 pt-1">
                        {/* VRM: from file. GLB: parser leaves empty — use license stored in drop attributes at create time */}
                        <MetadataRow
                          label="License"
                          value={
                            vrmParsed.license ||
                            (attributes.find((a: { trait_type?: string; value?: unknown }) => a.trait_type === 'License')?.value as string) ||
                            '\u2014'
                          }
                        />
                        {vrmParsed.fileType === 'vrm' && (
                          <>
                            <MetadataRow label="Allowed Users" value={vrmParsed.allowedUserName} />
                            <MetadataRow label="Commercial" value={vrmParsed.commercialUse} />
                            <MetadataRow label="Violent" value={vrmParsed.violentUse} />
                            <MetadataRow label="Sexual" value={vrmParsed.sexualUse} />
                          </>
                        )}
                        {vrmParsed.fileType === 'glb' && (
                          <MetadataRow
                            label="Commercial"
                            value={
                              vrmParsed.commercialUse ||
                              (attributes.find((a: { trait_type?: string; value?: unknown }) => a.trait_type === 'Commercial Use')?.value as string) ||
                              '\u2014'
                            }
                          />
                        )}
                        {vrmParsed.otherPermissionUrl && (
                          <LinkableMetadataRow label="Other Permissions" value={vrmParsed.otherPermissionUrl} />
                        )}
                        {vrmParsed.otherLicenseUrl && (
                          <LinkableMetadataRow label="Other License" value={vrmParsed.otherLicenseUrl} />
                        )}
                      </div>
                    </section>

                    <section>
                      <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                        Model Statistics
                      </p>
                      <div className="space-y-1.5 pt-1">
                        <MetadataRow label="Format" value={vrmParsed.fileType === 'glb' ? 'GLB' : vrmParsed.vrmType} />
                        <MetadataRow label="File Size" value={formatFileSize(vrmParsed.fileSizeBytes)} />
                        <MetadataRow label="Height" value={`${vrmParsed.heightMeters.toFixed(2)}m`} />
                        <MetadataRow label="Vertices" value={vrmParsed.vertexCount.toLocaleString()} />
                        <MetadataRow label="Triangles" value={vrmParsed.triangleCount.toLocaleString()} />
                        <MetadataRow label="Materials" value={vrmParsed.materialCount.toString()} />
                        <MetadataRow label="Textures" value={vrmParsed.textureCount.toString()} />
                        {vrmParsed.fileType === 'vrm' && (
                          <MetadataRow label="Bones" value={vrmParsed.boneCount.toString()} />
                        )}
                        {vrmParsed.fileType === 'glb' && vrmParsed.skeletonBoneCount > 0 && (
                          <MetadataRow label="Skeleton Bones" value={vrmParsed.skeletonBoneCount.toString()} />
                        )}
                        {vrmParsed.fileType === 'glb' && vrmParsed.animationCount > 0 && (
                          <MetadataRow label="Animations" value={vrmParsed.animationCount.toString()} />
                        )}
                      </div>
                    </section>

                    {vrmParsed.textures && vrmParsed.textures.length > 0 && (
                      <section>
                        <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                          Textures
                        </p>
                        <div className="space-y-2 pt-1 max-h-[280px] overflow-y-auto">
                          {vrmParsed.textures.map((tex, i) => (
                            <div key={i} className="flex gap-3 items-center py-1.5">
                              <button
                                type="button"
                                onClick={() => setPreviewImageSrc(tex.dataUri)}
                                className="flex-shrink-0 w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-1"
                              >
                                <img src={tex.dataUri} alt={tex.name} className="w-full h-full object-cover pointer-events-none" />
                              </button>
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
                  </>
                )}

                {!vrmParsed && !vrmParsing && !vrmParseError && (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-400">Loading {modelTabLabel} data...</p>
                  </div>
                )}
              </div>
            )}

            {/* ════════ TAB: Assets (display only, no download) ════════ */}
            {!showSettings && activeTab === 'assets' && (
              <div className="space-y-5">
                {typedFiles.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No assets in this drop.</p>
                  </div>
                ) : (
                  <>
                    {/* 3D Model Files — View 3D only, no download */}
                    {modelFiles.length > 0 && (
                      <section>
                        <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">3D Models ({modelFiles.length})</p>
                        <div className="space-y-2">
                          {modelFiles.map((file, i) => {
                            const isMain = file.uri === animationUrl;
                            const fileName = file.name || getFileNameFromUri(file.uri);
                            const formatLabel = getModelFormatFromUri(file.uri);
                            const viewerIdx = viewerModels.findIndex((m) => m.url === file.uri);
                            const ext = getExtFromUri(file.uri).toLowerCase();
                            // Prefer URI extension over metadata type (metadata can be wrong)
                            const isGlb = ext === 'glb' || (ext !== 'vrm' && file.resolvedType === 'model/gltf-binary');
                            const isVrm = ext === 'vrm' || (ext !== 'glb' && file.resolvedType === 'model/vrm');
                            const ModelIcon = isGlb ? IconGLB : isVrm ? IconVRM : Icon3DCube;
                            return (
                              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200/30 dark:border-gray-700/20">
                                <ModelIcon className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={fileName}>{fileName}</p>
                                    {isMain && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">MAIN</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatLabel}</p>
                                </div>
                                {viewerIdx >= 0 && (
                                  <button
                                    onClick={() => setActiveModelIndex(viewerIdx)}
                                    className={`text-xs px-2.5 py-1 transition-colors flex-shrink-0 ${
                                      safeModelIndex === viewerIdx
                                        ? 'bg-orange-400/15 text-orange-400 border border-orange-400/30'
                                        : 'text-gray-500 hover:text-orange-400 hover:bg-orange-400/5'
                                    }`}
                                  >
                                    {safeModelIndex === viewerIdx ? 'Viewing' : 'View 3D'}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* Image Files — preview only */}
                    {imageFiles.length > 0 && (
                      <section>
                        <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Images ({imageFiles.length})</p>
                        <div className="grid grid-cols-2 gap-2">
                          {imageFiles.map((file, i) => {
                            const isMainImage = file.uri === displayImage;
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setPreviewImageSrc(file.uri)}
                                className="group relative overflow-hidden border border-gray-200/30 dark:border-gray-700/20 hover:border-orange-400/40 transition-colors aspect-square focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                              >
                                <img src={file.uri} alt={`Asset ${i + 1}`} className="w-full h-full object-cover" />
                                {isMainImage && (
                                  <span className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-white font-medium backdrop-blur-sm">MAIN</span>
                                )}
                                <span className="absolute bottom-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-white font-medium backdrop-blur-sm">
                                  {getExtFromUri(file.uri).toUpperCase() || 'IMG'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* All Assets — display only */}
                    <section>
                      <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">All Assets ({typedFiles.length})</p>
                      <div className="space-y-1">
                        {typedFiles.map((file, i) => (
                          <div key={i} className="flex items-center justify-between rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 px-3 py-2 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-4 text-right flex-shrink-0">{i + 1}</span>
                              <span className="text-sm text-gray-600 dark:text-gray-300 truncate">{getFileTypeLabel(file.resolvedType)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}

            {/* ════════ TAB: Details ════════ */}
            {!showSettings && activeTab === 'details' && (
              <div className="space-y-5">
                {/* Drop Config */}
                <section>
                  <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Drop Configuration</p>
                  <div className="bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200/30 dark:border-gray-700/20 p-4 space-y-2.5">
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Type</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {isDutch ? 'Dutch Auction' : mintPhases.length > 1 ? 'Open Edition (phases)' : 'Open Edition'}
                      </span>
                    </div>
                    {isDutch && effectiveMintConfig?.dutchAuction && (
                      <>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Current Price</span>
                          <span className="text-sm font-bold text-orange-500 dark:text-orange-400">{formatSolPrice(currentPrice)} SOL</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Start Price</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatSolPrice(effectiveMintConfig.dutchAuction.startPrice)} SOL</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Floor Price</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatSolPrice(effectiveMintConfig.dutchAuction.endPrice)} SOL</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Duration</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{effectiveMintConfig.dutchAuction.durationHours ?? 0}h</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Price Steps</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{DUTCH_AUCTION_STEPS} drops + floor</span>
                        </div>
                        {nextStepPrice != null && (
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-sm text-gray-500 dark:text-gray-400">Next Price</span>
                            <span className="text-sm font-medium text-green-600 dark:text-green-400">{formatSolPrice(nextStepPrice)} SOL</span>
                          </div>
                        )}
                      </>
                    )}
                    {!isDutch && (
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {mintPhases.length > 1 ? 'Current phase price' : 'Price'}
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {!currentPrice || currentPrice <= 0 ? 'Free' : `${formatSolPrice(currentPrice)} SOL`}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Max Supply</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {supplyCap != null
                          ? supplyCap.toLocaleString()
                          : cmState ? '100,000' : 'Unlimited'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Max Per Wallet</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {effectiveMintConfig?.maxPerWallet ?? 'Unlimited'}
                      </span>
                    </div>
                    {collection?.sellerFeeBasisPoints != null && (
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Royalties</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {(collection.sellerFeeBasisPoints / 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {hasAccessRestrictions && mintPhases.length === 0 && (
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Access</span>
                        <button
                          type="button"
                          onClick={() => setShowAllowlistModal(true)}
                          className="text-sm text-orange-500 dark:text-orange-400 hover:underline font-medium"
                        >
                          View list →
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                {/* Phases (collapsible cards); only when we have phases */}
                {mintPhases.length >= 1 && !mintConfig?.isDutchAuction && (() => {
                  const defaultExpanded = getPhaseInRangeIndexAt(mintPhases, new Date()) ?? 0;
                  return (
                  <section>
                    <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Phases</p>
                    <div className="space-y-2">
                      {mintPhases.map((phase, index) => {
                        const now = Date.now();
                        const displayStart = getPhaseDisplayStart(mintPhases, index);
                        const start = displayStart ? new Date(displayStart).getTime() : 0;
                        const end = phase.endDate ? new Date(phase.endDate).getTime() : Number.POSITIVE_INFINITY;
                        const isCurrent = phaseInRangeIndex === index;
                        const isPaused = phase.paused;
                        const isUpcoming = start > now;
                        const isEnded = end < now;
                        const expanded = detailsPhaseExpanded === null ? (defaultExpanded === index) : (detailsPhaseExpanded >= 0 && detailsPhaseExpanded === index);
                        const badge = isCurrent && isPaused
                          ? 'Paused'
                          : isCurrent
                            ? 'Current'
                            : isUpcoming
                              ? 'Upcoming'
                              : isEnded
                                ? 'Ended'
                                : null;
                        return (
                          <div
                            key={index}
                            className={`rounded-lg border overflow-hidden ${
                              isCurrent ? 'border-orange-400/40 dark:border-orange-400/30' : 'border-gray-200/40 dark:border-gray-700/40'
                            } bg-gray-50/50 dark:bg-gray-800/20`}
                          >
                            <button
                              type="button"
                              onClick={() => setDetailsPhaseExpanded(expanded ? -1 : index)}
                              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-100/50 dark:hover:bg-gray-700/30 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Phase {index + 1}</span>
                                {badge && (
                                  <span
                                    className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${
                                      badge === 'Current'
                                        ? 'bg-orange-400/20 text-orange-600 dark:text-orange-400'
                                        : badge === 'Paused'
                                          ? 'bg-amber-400/20 text-amber-600 dark:text-amber-400'
                                          : badge === 'Upcoming'
                                            ? 'bg-gray-400/20 text-gray-600 dark:text-gray-400'
                                            : 'bg-gray-500/20 text-gray-500 dark:text-gray-500'
                                    }`}
                                  >
                                    {badge}
                                  </span>
                                )}
                                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {formatPhasePrice(phase.price)}
                                  {displayStart && ` · ${new Date(displayStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
                                </span>
                              </div>
                              <svg
                                className={`w-5 h-5 flex-shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {expanded && (
                              <div className="px-4 pb-4 pt-0 space-y-2.5 border-t border-gray-200/30 dark:border-gray-700/30">
                                <div className="flex justify-between items-center gap-4 pt-3">
                                  <span className="text-sm text-gray-500 dark:text-gray-400">Price</span>
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatPhasePrice(phase.price)}</span>
                                </div>
                                <div className="flex justify-between items-center gap-4">
                                  <span className="text-sm text-gray-500 dark:text-gray-400">Start</span>
                                  <span className="text-sm text-gray-900 dark:text-gray-100">
                                    {displayStart ? new Date(displayStart).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Immediate'}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center gap-4">
                                  <span className="text-sm text-gray-500 dark:text-gray-400">End</span>
                                  <span className="text-sm text-gray-900 dark:text-gray-100">
                                    {phase.endDate ? new Date(phase.endDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'No end'}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center gap-4">
                                  <span className="text-sm text-gray-500 dark:text-gray-400">Max supply</span>
                                  <span className="text-sm text-gray-900 dark:text-gray-100">{phase.maxSupply ?? 'Unlimited'}</span>
                                </div>
                                <div className="flex justify-between items-center gap-4">
                                  <span className="text-sm text-gray-500 dark:text-gray-400">Max per wallet</span>
                                  <span className="text-sm text-gray-900 dark:text-gray-100">{phase.maxPerWallet ?? 'Unlimited'}</span>
                                </div>
                                <div className="flex justify-between items-center gap-4">
                                  <span className="text-sm text-gray-500 dark:text-gray-400">Access</span>
                                  {(phase.access || 'anyone') === 'anyone' && !(phase.allowlistAddresses?.length) && !(phase.tokenHolderMints?.length) ? (
                                    <span className="text-sm text-gray-900 dark:text-gray-100">Anyone</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => { setShowAllowlistModal(true); }}
                                      className="text-sm text-orange-500 dark:text-orange-400 hover:underline font-medium"
                                    >
                                      View list →
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  );
                })()}

                {/* Traits */}
                {attributes.length > 0 && (
                  <section>
                    <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Traits</p>
                    <div className="grid grid-cols-2 gap-2">
                      {attributes.map((attr: any, i: number) => (
                        <div key={i} className="bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200/30 dark:border-gray-700/20 px-3 py-2.5">
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">
                            {attr.trait_type}
                          </p>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={String(attr.value)}>
                            {attr.display_type === 'date' ? new Date(attr.value).toLocaleDateString() : String(attr.value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* On-Chain */}
                <section>
                  <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">On-Chain Details</p>
                  <div className="bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200/30 dark:border-gray-700/20 p-4 space-y-2.5">
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Address</span>
                      <span className="text-sm font-mono text-gray-900 dark:text-gray-100 text-right truncate max-w-[200px]" title={address}>
                        {shortenAddress(address, 6)}
                      </span>
                    </div>
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Network</span>
                      <span className="text-sm text-gray-900 dark:text-gray-100">{SOLANA_NETWORK}</span>
                    </div>
                  </div>
                </section>

                {/* Explorer Link */}
                <div className="pt-1">
                  <a
                    href={`${EXPLORER_URL}/address/${address}?cluster=${SOLANA_NETWORK}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-orange-400 transition-colors"
                  >
                    View on Solana Explorer
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            )}
          </div>
          </div>

          {/* Scroll to top — fades in as you scroll, transparent with orange icon */}
          <button
            type="button"
            onClick={scrollToTop}
            aria-label="Scroll to top"
            style={{ opacity: scrollToTopOpacity }}
            className={`scroll-to-top-forge absolute bottom-4 right-4 z-20 w-11 h-11 rounded-full flex items-center justify-center text-orange-400 border border-orange-400/50 bg-transparent backdrop-blur-sm transition-opacity duration-200 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-[var(--background)] ${scrollToTopOpacity > 0 ? 'hover:bg-orange-400/10 hover:border-orange-400' : 'pointer-events-none'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>

        {/* ═══ Right Panel - 3D Viewer / Image ═══ */}
        <div className="flex-1 min-w-0 bg-gray-100/10 dark:bg-black/10 relative flex flex-col z-10">
          {/* Model tabs (when multiple files) — same as item page */}
          {viewerModels.length > 1 && (
            <div className="absolute top-4 left-4 z-10 flex gap-1 bg-black/50 backdrop-blur-md p-1">
              {viewerModels.map((model, i) => (
                <button
                  key={i}
                  onClick={() => setActiveModelIndex(i)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    safeModelIndex === i ? 'bg-orange-400/20 text-orange-300' : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {model.label}
                </button>
              ))}
            </div>
          )}

          {activeViewerUrl ? (
            <div className="flex-1 min-h-0 w-full">
              <VRMViewer
                url={activeViewerUrl}
                height="100%"
                animationUrl={activeModelIsVrm ? '/animations/Bored.fbx' : undefined}
              />
            </div>
          ) : displayImage ? (
            <div className="flex-1 flex items-center justify-center p-8 min-h-[400px]">
              <img src={displayImage} alt={displayName} className="max-w-full max-h-full object-contain rounded-lg" />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-400">No preview available</p>
              </div>
            </div>
          )}

          {/* Drop info overlay */}
          {collection && (
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm text-white px-3 py-2 text-caption z-10">
              {displayName} · {isDutch ? 'Dutch Auction' : 'Open Edition'}
              {supplyCap != null && ` · ${mintedCount}/${supplyCap} minted`}
            </div>
          )}
        </div>
      </div>
      {mintConfirm && (
        <MintConfirmModal
          open={true}
          details={mintConfirm}
          onConfirm={executeMint}
          onCancel={() => setMintConfirm(null)}
        />
      )}

      <TransactionProgressModal
        open={minting}
        title="Minting NFT"
        steps={
          mintIsCandyMachine
            ? getCandyMachineMintSteps({ hasAllowlist: mintHasAllowlist })
            : getPublicMintSteps({ isFree: getCurrentPrice() === 0 })
        }
        currentStepId={mintPhase || 'preparing'}
        statusMessage={
          mintPhase === 'preparing' ? 'Fetching collection state from the blockchain\u2026' :
          mintPhase === 'allowlist' ? 'Submitting your allowlist proof\u2026 Approve in your wallet.' :
          mintPhase === 'payment' ? 'Sending payment\u2026 Approve in your wallet.' :
          mintPhase === 'minting' ? 'Creating your NFT on Solana\u2026 Approve in your wallet.' :
          mintPhase === 'confirming' ? 'Waiting for the Solana network to confirm\u2026' :
          mintPhase === 'verifying' ? 'Verifying collection membership\u2026' :
          undefined
        }
        error={mintError}
        errorDetails={mintErrorDetails}
        success={mintPhase === 'success'}
        successContent={
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            Your NFT has been minted successfully!
          </p>
        }
        onClose={handleMintProgressClose}
      />

      {pendingSave && (
        <TransactionConfirmModal
          open={true}
          {...buildSaveSettingsTransaction()}
          onConfirm={() => executeSaveMintConfig(pendingSave.config, pendingSave.phases)}
          onCancel={() => setPendingSave(null)}
        />
      )}

      <AllowlistModal
        open={showAllowlistModal}
        onClose={() => setShowAllowlistModal(false)}
        walletAddress={wallet.publicKey?.toString()}
        allowlistAddresses={mintPhases.length > 0 ? undefined : effectiveMintConfig?.allowlistAddresses}
        tokenHolderMints={mintPhases.length > 0 ? undefined : effectiveMintConfig?.tokenHolderMints}
        phases={mintPhases.length > 0 ? mintPhases : undefined}
        currentPhaseIndex={mintPhases.length > 0 ? (getPhaseInRangeIndexAt(mintPhases, new Date()) ?? 0) : null}
        explorerUrl={EXPLORER_URL}
        network={SOLANA_NETWORK}
      />
    </ForgePageWrapper>
  );
}
