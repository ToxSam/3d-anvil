'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMetaplex } from '@/lib/metaplex';
import { PublicKey } from '@solana/web3.js';
import { EXPLORER_URL, SOLANA_NETWORK, resolveArweaveUrl, tryFetchJsonWithIrysGateway } from '@/lib/constants';
import { ImagePreview } from '@/components/ImagePreview';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import { IconVRM, IconGLB, Icon3DCube } from '@/components/AssetIcons';
import type { VRMMetadata } from '@/lib/vrmParser';
import dynamic from 'next/dynamic';

const VRMViewer = dynamic(
  () => import('@/components/VRMViewer').then((mod) => mod.VRMViewer),
  { ssr: false }
);

type TabId = 'details' | 'vrm' | 'assets' | 'metadata';

// ── Helpers ──

function shortenAddress(addr: string, chars = 4): string {
  if (!addr) return '';
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function getFileTypeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    'model/vrm': 'VRM Model',
    'model/gltf-binary': 'GLB Model',
    'model/gltf+json': 'GLTF Model',
    'image/png': 'PNG Image',
    'image/jpeg': 'JPEG Image',
    'image/jpg': 'JPEG Image',
    'image/webp': 'WebP Image',
    'image/gif': 'GIF Image',
  };
  return map[mimeType] || mimeType;
}

function isModelType(mimeType: string): boolean {
  return mimeType.startsWith('model/') || mimeType === 'application/octet-stream';
}

function isImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
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

function inferFileType(file: { uri: string; type: string }): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = getExtFromUri(file.uri);
  const extMap: Record<string, string> = {
    vrm: 'model/vrm', glb: 'model/gltf-binary', gltf: 'model/gltf+json',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  };
  return extMap[ext] || file.type || 'application/octet-stream';
}

// ── Small Components ──

/** Row with label / value for metadata display */
function MetadataRow({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-caption text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-caption text-gray-900 dark:text-gray-100 text-right">{value}</span>
    </div>
  );
}

/** Row whose value is auto-linked if it looks like a URL */
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

/** Copiable address with explorer link */
function CopyableAddress({ label, address, explorerPath }: { label: string; address: string; explorerPath?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    copyToClipboard(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          onClick={handleCopy}
          className="text-sm font-mono text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-300 transition-colors truncate"
          title={address}
        >
          {copied ? 'Copied!' : shortenAddress(address, 6)}
        </button>
        {explorerPath && (
          <a
            href={`${EXPLORER_URL}/${explorerPath}?cluster=${SOLANA_NETWORK}`}
            target="_blank" rel="noopener noreferrer"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 transition-colors"
            title="View on Explorer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

/** Fetch a remote file and trigger a browser download with a specific filename. */
async function downloadFile(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Download failed, falling back to direct link:', err);
    window.open(url, '_blank');
  }
}

/** Build a clean download filename from an NFT name and a URI. */
function buildDownloadFilename(nftName: string, uri: string, mimeHint?: string): string {
  const ext = getExtFromUri(uri).toLowerCase();
  const safeName = nftName.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim() || 'model';
  const knownExts = ['vrm', 'glb', 'gltf', 'png', 'jpg', 'jpeg', 'webp', 'gif'];
  if (ext && knownExts.includes(ext)) {
    return `${safeName}.${ext}`;
  }
  const fileName = getFileNameFromUri(uri);
  const fileExt = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
  if (fileExt && knownExts.includes(fileExt)) return fileName;

  const mimeExtMap: Record<string, string> = {
    'model/vrm': 'vrm', 'model/gltf-binary': 'glb', 'model/gltf+json': 'gltf',
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  };
  const fallbackExt = mimeHint ? mimeExtMap[mimeHint] : undefined;
  return fallbackExt ? `${safeName}.${fallbackExt}` : safeName;
}

// ── Main Component ──

export default function ItemPage() {
  const params = useParams();
  const address = params.address as string;
  const router = useRouter();
  const metaplex = useMetaplex();

  const [nft, setNft] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('details');
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const [tPose, setTPose] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [metadataCopied, setMetadataCopied] = useState(false);

  // Parsed VRM metadata (fetched from animation_url)
  const [vrmParsed, setVrmParsed] = useState<VRMMetadata | null>(null);
  const [vrmParsing, setVrmParsing] = useState(false);
  const [vrmParseError, setVrmParseError] = useState<string | null>(null);
  const [vrmParseFetched, setVrmParseFetched] = useState(false);

  useEffect(() => {
    if (!address) return;
    loadNFT(address);
  }, [address, metaplex]);

  async function loadNFT(nftAddress: string) {
    setLoading(true);
    try {
      let loadedNft: any = null;
      try {
        loadedNft = await metaplex.nfts().findByMint({
          mintAddress: new PublicKey(nftAddress),
        });
      } catch {
        try {
          loadedNft = await metaplex.nfts().findByMint({
            mintAddress: new PublicKey(nftAddress),
            loadJsonMetadata: false,
          });
        } catch {
          // NFT might be expired on devnet
        }
      }

      if (loadedNft) {
        if (!loadedNft.json && loadedNft.uri) {
          const fallbackJson = await tryFetchJsonWithIrysGateway(loadedNft.uri);
          if (fallbackJson) {
            loadedNft = { ...loadedNft, json: fallbackJson, jsonLoaded: true };
          }
        }
        setNft(loadedNft);
      }
    } catch (error) {
      console.error('Failed to load NFT:', error);
    } finally {
      setLoading(false);
    }
  }

  // Fetch and parse the VRM file when the VRM tab is opened
  const fetchAndParseVRM = useCallback(async () => {
    if (vrmParsed || vrmParsing || vrmParseFetched) return;
    const animUrl = resolveArweaveUrl(nft?.json?.animation_url);
    if (!animUrl) return;

    setVrmParsing(true);
    setVrmParseError(null);
    setVrmParseFetched(true);

    try {
      const response = await fetch(animUrl);
      if (!response.ok) throw new Error(`Failed to fetch model: ${response.status}`);
      const blob = await response.blob();
      const isGlb = animUrl.toLowerCase().includes('.glb');
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
  }, [nft, vrmParsed, vrmParsing, vrmParseFetched]);

  // Auto-trigger parse when VRM tab is selected
  useEffect(() => {
    if (activeTab === 'vrm') fetchAndParseVRM();
  }, [activeTab, fetchAndParseVRM]);

  // ── Derived data ──
  const json = nft?.json || {};
  const attributes = json.attributes || [];
  const properties = json.properties || {};
  const rawFiles: { uri: string; type: string; name?: string }[] = properties.files || [];
  const files = rawFiles.map((f) => ({ ...f, uri: resolveArweaveUrl(f.uri) || f.uri }));
  const resolvedAnimationUrl = resolveArweaveUrl(json.animation_url);
  const resolvedImage = resolveArweaveUrl(json.image);
  const isVRM = !!resolvedAnimationUrl;
  const royaltyPercent = nft?.sellerFeeBasisPoints != null ? (nft.sellerFeeBasisPoints / 100) : null;

  // License-related VRM attributes (relevant for Details)
  const licenseKeys = ['License', 'Commercial Use'];
  const licenseAttributes = attributes.filter((a: any) => licenseKeys.includes(a.trait_type));
  // Technical VRM attributes (hidden from Details, shown in VRM tab)
  const technicalVrmKeys = ['Blend Shapes', 'Bone Count'];
  const allVrmKeys = [...licenseKeys, ...technicalVrmKeys];
  // Custom attributes = everything that's NOT a VRM system attribute
  const customAttributes = attributes.filter((a: any) => !allVrmKeys.includes(a.trait_type));

  // Files categorized
  const typedFiles = useMemo(() => files.map((f) => ({ ...f, resolvedType: inferFileType(f) })), [files]);
  const modelFiles = useMemo(() => typedFiles.filter((f) => isModelType(f.resolvedType)), [typedFiles]);
  const imageFiles = useMemo(() => typedFiles.filter((f) => isImageType(f.resolvedType)), [typedFiles]);

  // Models for the 3D viewer
  const viewerModels = useMemo(() => {
    const models: { url: string; label: string; isVrm: boolean }[] = [];
    if (resolvedAnimationUrl) {
      models.push({ url: resolvedAnimationUrl, label: 'Main Avatar', isVrm: true });
    }
    modelFiles.forEach((f) => {
      if (f.uri === resolvedAnimationUrl) return;
      const label = f.name || getFileTypeLabel(f.resolvedType);
      models.push({ url: f.uri, label, isVrm: f.resolvedType === 'model/vrm' });
    });
    return models;
  }, [resolvedAnimationUrl, modelFiles]);

  const activeViewerUrl = viewerModels[activeModelIndex]?.url || null;
  const activeModelIsVrm = viewerModels[activeModelIndex]?.isVrm ?? false;

  // Tabs
  const tabs = useMemo(() => {
    const t: { id: TabId; label: string }[] = [{ id: 'details', label: 'Details' }];
    if (isVRM) t.push({ id: 'vrm', label: 'VRM' });
    if (files.length > 0) t.push({ id: 'assets', label: 'Assets' });
    t.push({ id: 'metadata', label: 'Metadata' });
    return t;
  }, [isVRM, files.length]);

  // Raw metadata JSON (full, including ETM extensions)
  const rawMetadataJson = useMemo(() => {
    if (!json || Object.keys(json).length === 0) return '{}';
    try { return JSON.stringify(json, null, 2); }
    catch { return '{}'; }
  }, [json]);

  // Creators
  const creators = nft?.creators || properties.creators || [];

  // Collection name from metadata or on-chain
  const collectionName = json.collection?.name || '';
  const collectionFamily = json.collection?.family || '';

  // ETM extension fields
  const metadataStandard = json.metadata_standard || null;
  const extensions = json.extensions || null;
  const etmAssets = json.assets || null;
  const createdAt = json.createdAt ? new Date(json.createdAt).toLocaleString() : null;
  const createdBy = json.createdBy || null;

  // ── Loading / Error states ──

  if (loading) {
    return (
      <ForgePageWrapper embers={12}>
        <div className="flex items-center justify-center h-[calc(100vh-8rem)] md:h-[calc(100vh-10rem)]">
          <div className="text-center">
            <div className="spinner-forge mx-auto" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 animate-fade-in">Loading NFT...</p>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  if (!nft) {
    return (
      <ForgePageWrapper embers={12}>
        <div className="flex items-center justify-center h-[calc(100vh-8rem)] md:h-[calc(100vh-10rem)]">
          <div className="text-center max-w-sm animate-slide-up">
            <div className="w-12 h-12 mx-auto mb-4 bg-gray-100/50 dark:bg-gray-800/50 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">NFT not found</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">The NFT at this address could not be loaded.</p>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  return (
    <ForgePageWrapper embers={16}>
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] min-h-0">
      <ImagePreview src={previewImageSrc} onClose={() => setPreviewImageSrc(null)} />

      {/* ═══ Left Panel ═══ */}
      <div className="w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 border-r border-gray-200/30 dark:border-gray-700/30 overflow-y-auto bg-[var(--background)]/80 backdrop-blur-sm relative z-10">
        <div className="p-6 lg:p-8">
          {/* Type badge */}
          {isVRM && (
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-400/10 border border-orange-400/20 text-[11px] uppercase tracking-widest font-medium text-orange-400/80">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V15m0 0l-2.25 1.313" />
                </svg>
                VRM Avatar
              </span>
            </div>
          )}

          {/* Name */}
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight mb-1">
            {nft.name}
          </h1>

          {nft.symbol && (
            <p className="text-sm text-gray-400 dark:text-gray-500 font-mono mb-1">{nft.symbol}</p>
          )}

          {/* Collection name + link */}
          {nft.collection && (
            <button
              onClick={() => router.push(`/collection/${nft.collection.address.toString()}`)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-orange-400 transition-colors mb-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {collectionName || 'View Collection'}
            </button>
          )}

          {/* Creator (top-level, prominent) */}
          {creators.length > 0 && (
            <div className="flex items-center gap-2 mb-5 mt-1">
              {creators.map((c: any, i: number) => {
                const creatorAddr = c.address?.toString?.() || c.address || '';
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 flex-shrink-0" />
                    <a
                      href={`${EXPLORER_URL}/address/${creatorAddr}?cluster=${SOLANA_NETWORK}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-sm font-mono text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    >
                      {shortenAddress(creatorAddr, 4)}
                    </a>
                    {c.verified && (
                      <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                    {creators.length > 1 && (
                      <span className="text-xs text-gray-400">{c.share}%</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="flex gap-0 border-b border-gray-200/30 dark:border-gray-700/20 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-forge ${
                  activeTab === tab.id
                    ? 'tab-forge-active'
                    : 'tab-forge-inactive'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ════════════════════════════════════════════
              TAB: Details
              ════════════════════════════════════════════ */}
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Description */}
              {json.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {json.description}
                </p>
              )}

              {/* License Info (prominent) */}
              {licenseAttributes.length > 0 && (
                <section>
                  <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">License</p>
                  <div className="bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200/30 dark:border-gray-700/20 p-4 space-y-2.5">
                    {licenseAttributes.map((attr: any, i: number) => (
                      <div key={i} className="flex justify-between items-center gap-4">
                        <span className="text-sm text-gray-500 dark:text-gray-400">{attr.trait_type}</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{attr.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Custom Attributes / Traits */}
              {customAttributes.length > 0 && (
                <section>
                  <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Traits</p>
                  <div className="grid grid-cols-2 gap-2">
                    {customAttributes.map((attr: any, i: number) => (
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

              {/* On-Chain Details */}
              <section>
                <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">On-Chain Details</p>
                <div className="bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200/30 dark:border-gray-700/20 p-4 space-y-3">
                  <CopyableAddress label="Token Address" address={address} explorerPath={`address/${address}`} />

                  {nft.collection && (
                    <>
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Collection</span>
                        <button
                          onClick={() => router.push(`/collection/${nft.collection.address.toString()}`)}
                          className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:underline text-right"
                        >
                          {collectionName || shortenAddress(nft.collection.address.toString(), 6)}
                        </button>
                      </div>
                      {collectionFamily && (
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Family</span>
                          <span className="text-sm text-gray-900 dark:text-gray-100 text-right">{collectionFamily}</span>
                        </div>
                      )}
                    </>
                  )}

                  {nft.updateAuthorityAddress && (
                    <CopyableAddress label="Update Authority" address={nft.updateAuthorityAddress.toString()} explorerPath={`address/${nft.updateAuthorityAddress.toString()}`} />
                  )}

                  {royaltyPercent != null && (
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Royalties</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{royaltyPercent}%</span>
                    </div>
                  )}

                  {nft.tokenStandard != null && (
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Standard</span>
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {nft.tokenStandard === 0 ? 'Non-Fungible' : nft.tokenStandard === 4 ? 'pNFT' : `Standard ${nft.tokenStandard}`}
                      </span>
                    </div>
                  )}

                  {nft.collection && (
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Verified</span>
                      <span className={`text-sm font-medium ${nft.collection.verified ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                        {nft.collection.verified ? 'Yes' : 'No'}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* Explorer Link */}
              <div className="pt-1">
                <a
                  href={`${EXPLORER_URL}/address/${address}?cluster=${SOLANA_NETWORK}`}
                  target="_blank" rel="noopener noreferrer"
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

          {/* ════════════════════════════════════════════
              TAB: VRM (parsed from actual VRM file)
              Mirrors the minting Step 1 layout exactly
              ════════════════════════════════════════════ */}
          {activeTab === 'vrm' && isVRM && (
            <div className="space-y-5">
              {/* Loading state */}
              {vrmParsing && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="spinner-forge mx-auto mb-4" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Parsing VRM model...</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Downloading and analyzing the 3D file</p>
                </div>
              )}

              {/* Error state */}
              {vrmParseError && !vrmParsing && (
                <div className="error-forge">
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Could not parse VRM</p>
                  <p className="text-xs text-red-500 dark:text-red-400/80">{vrmParseError}</p>
                  <button
                    onClick={() => { setVrmParseFetched(false); setVrmParseError(null); fetchAndParseVRM(); }}
                    className="mt-3 text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Parsed VRM data — same layout as minting Step 1 */}
              {vrmParsed && (
                <>
                  {/* Basic Information */}
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

                  {/* License */}
                  <section>
                    <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                      License
                    </p>
                    <div className="space-y-1.5 pt-1">
                      <MetadataRow label="License" value={vrmParsed.license || '\u2014'} />
                      {vrmParsed.fileType === 'vrm' && (
                        <>
                          <MetadataRow label="Allowed Users" value={vrmParsed.allowedUserName} />
                          <MetadataRow label="Commercial" value={vrmParsed.commercialUse} />
                          <MetadataRow label="Violent" value={vrmParsed.violentUse} />
                          <MetadataRow label="Sexual" value={vrmParsed.sexualUse} />
                        </>
                      )}
                      {vrmParsed.fileType === 'glb' && vrmParsed.commercialUse && (
                        <MetadataRow label="Commercial" value={vrmParsed.commercialUse} />
                      )}
                      {vrmParsed.otherPermissionUrl && (
                        <LinkableMetadataRow label="Other Permissions" value={vrmParsed.otherPermissionUrl} />
                      )}
                      {vrmParsed.otherLicenseUrl && (
                        <LinkableMetadataRow label="Other License" value={vrmParsed.otherLicenseUrl} />
                      )}
                    </div>
                  </section>

                  {/* Model Statistics */}
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

                  {/* Textures */}
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

              {/* Fallback: show what we have from on-chain metadata if parse hasn't happened */}
              {!vrmParsed && !vrmParsing && !vrmParseError && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">Loading VRM data...</p>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════
              TAB: Assets
              ════════════════════════════════════════════ */}
          {activeTab === 'assets' && (
            <div className="space-y-6">
              {/* Preview Image */}
              {resolvedImage && (
                <section>
                  <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Preview Image</p>
                  <button
                    type="button"
                    onClick={() => setPreviewImageSrc(resolvedImage)}
                    className="w-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:opacity-95 transition-opacity focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  >
                    <img src={resolvedImage} alt={`${nft.name} preview`} className="w-full aspect-video object-cover" />
                  </button>
                </section>
              )}

              {/* 3D Model Files */}
              {modelFiles.length > 0 && (
                <section>
                  <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">3D Models ({modelFiles.length})</p>
                  <div className="space-y-2">
                    {modelFiles.map((file, i) => {
                      const isMain = file.uri === resolvedAnimationUrl;
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
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {viewerIdx >= 0 && (
                              <button
                                onClick={() => setActiveModelIndex(viewerIdx)}
                                className={`text-xs px-2.5 py-1 transition-colors ${
                                  activeModelIndex === viewerIdx
                                    ? 'bg-orange-400/15 text-orange-400 border border-orange-400/30'
                                    : 'text-gray-500 hover:text-orange-400 hover:bg-orange-400/5'
                                }`}
                              >
                                {activeModelIndex === viewerIdx ? 'Viewing' : 'View 3D'}
                              </button>
                            )}
                            <button
                              onClick={() => downloadFile(file.uri, buildDownloadFilename(nft.name, file.uri, file.resolvedType))}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              title="Download"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Image Files */}
              {imageFiles.length > 0 && (
                <section>
                  <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Images ({imageFiles.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {imageFiles.map((file, i) => {
                      const isMainImage = file.uri === resolvedImage;
                      return (
                        <button
                          key={i} type="button"
                          onClick={() => setPreviewImageSrc(file.uri)}
                          className="group relative overflow-hidden border border-gray-200/30 dark:border-gray-700/20 hover:border-orange-400/40 transition-colors aspect-square focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                        >
                          <img src={file.uri} alt={`Asset ${i + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                          </div>
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

              {/* All Files (compact) */}
              <section>
                <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">All Files ({typedFiles.length})</p>
                <div className="space-y-1">
                  {typedFiles.map((file, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 px-3 py-2 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-4 text-right flex-shrink-0">{i + 1}</span>
                        <span className="text-sm text-gray-600 dark:text-gray-300 truncate">{getFileTypeLabel(file.resolvedType)}</span>
                      </div>
                      <a href={file.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex-shrink-0 ml-3 transition-colors">
                        Open
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ════════════════════════════════════════════
              TAB: Metadata (raw JSON + ETM extensions)
              ════════════════════════════════════════════ */}
          {activeTab === 'metadata' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500">Raw Metadata</p>
                <button
                  onClick={() => { copyToClipboard(rawMetadataJson); setMetadataCopied(true); setTimeout(() => setMetadataCopied(false), 2000); }}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  {metadataCopied ? (
                    <>
                      <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      Copy JSON
                    </>
                  )}
                </button>
              </div>

              {/* URI */}
              {nft.uri && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 dark:text-gray-500">Source:</span>
                  <a href={nft.uri} target="_blank" rel="noopener noreferrer" className="text-gray-600 dark:text-gray-300 hover:underline font-mono truncate">
                    {nft.uri}
                  </a>
                </div>
              )}

              {/* ETM Standard badge */}
              {(metadataStandard || extensions) && (
                <div className="flex flex-wrap gap-2">
                  {metadataStandard && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-400/10 border border-orange-400/20 text-[11px] font-mono font-medium text-orange-400/80">
                      {metadataStandard}
                    </span>
                  )}
                  {extensions && Array.isArray(extensions) && extensions.map((ext: string, i: number) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-400/10 border border-purple-400/20 text-[11px] font-mono font-medium text-purple-400/80">
                      {ext}
                    </span>
                  ))}
                </div>
              )}

              {/* JSON Block */}
              <div className="border border-gray-200/30 dark:border-gray-700/20 overflow-hidden">
                <div className="bg-gray-100/50 dark:bg-gray-800/30 px-4 py-2 border-b border-gray-200/30 dark:border-gray-700/20 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-orange-400/40" />
                    <div className="w-2 h-2 rounded-full bg-orange-400/25" />
                    <div className="w-2 h-2 rounded-full bg-orange-400/15" />
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono ml-2">metadata.json</span>
                </div>
                <pre className="p-4 overflow-x-auto overflow-y-auto max-h-[60vh] bg-gray-50/30 dark:bg-[#0a0a0a]">
                  <code className="text-xs font-mono leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre">
                    {rawMetadataJson}
                  </code>
                </pre>
              </div>

              {/* On-chain fields */}
              <section>
                <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 mt-4">On-Chain Fields</p>
                <div className="bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200/30 dark:border-gray-700/20 p-4 space-y-2.5 text-sm">
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-gray-500 dark:text-gray-400">Name</span>
                    <span className="text-gray-900 dark:text-gray-100 text-right font-medium">{nft.name}</span>
                  </div>
                  {nft.symbol && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-gray-500 dark:text-gray-400">Symbol</span>
                      <span className="text-gray-900 dark:text-gray-100 text-right font-mono">{nft.symbol}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-gray-500 dark:text-gray-400">Seller Fee</span>
                    <span className="text-gray-900 dark:text-gray-100 text-right">{nft.sellerFeeBasisPoints} bps ({(nft.sellerFeeBasisPoints / 100).toFixed(1)}%)</span>
                  </div>
                  {nft.uri && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">Metadata URI</span>
                      <a href={nft.uri} target="_blank" rel="noopener noreferrer"
                        className="text-gray-900 dark:text-gray-100 text-right font-mono text-xs break-all hover:underline truncate max-w-[200px]"
                        title={nft.uri}
                      >
                        {nft.uri.length > 40 ? `${nft.uri.slice(0, 20)}...${nft.uri.slice(-16)}` : nft.uri}
                      </a>
                    </div>
                  )}
                  <CopyableAddress label="Token Address" address={address} explorerPath={`address/${address}`} />
                  {nft.updateAuthorityAddress && (
                    <CopyableAddress label="Update Authority" address={nft.updateAuthorityAddress.toString()} explorerPath={`address/${nft.updateAuthorityAddress.toString()}`} />
                  )}
                </div>
              </section>

              {/* ETM Extension Details */}
              {(etmAssets || createdAt || createdBy) && (
                <section>
                  <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 mt-4">Extension Data</p>
                  <div className="bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200/30 dark:border-gray-700/20 p-4 space-y-2.5 text-sm">
                    {createdAt && (
                      <div className="flex justify-between items-start gap-4">
                        <span className="text-gray-500 dark:text-gray-400">Created At</span>
                        <span className="text-gray-900 dark:text-gray-100 text-right">{createdAt}</span>
                      </div>
                    )}
                    {createdBy && (
                      <div className="flex justify-between items-start gap-4">
                        <span className="text-gray-500 dark:text-gray-400">Created By</span>
                        <span className="text-gray-900 dark:text-gray-100 text-right font-mono text-xs truncate max-w-[200px]" title={createdBy}>{createdBy}</span>
                      </div>
                    )}
                    {etmAssets && Array.isArray(etmAssets) && etmAssets.map((asset: any, ai: number) => (
                      <div key={ai} className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                        <div className="flex justify-between items-center gap-4 mb-1">
                          <span className="text-gray-500 dark:text-gray-400">Asset</span>
                          <span className="text-gray-900 dark:text-gray-100 text-right">
                            {asset.asset_type || 'default'} &middot; {asset.media_type || 'unknown'}
                          </span>
                        </div>
                        {asset.files && Array.isArray(asset.files) && asset.files.map((f: any, fi: number) => (
                          <div key={fi} className="flex justify-between items-center gap-2 pl-3 py-0.5">
                            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{f.name || f.file_type}</span>
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 flex-shrink-0 transition-colors">
                              Open
                            </a>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Right Panel - 3D Viewer ═══ */}
      <div className="flex-1 min-w-0 bg-gray-100/10 dark:bg-black/10 relative flex flex-col z-10">
        {/* Model tabs */}
        {viewerModels.length > 1 && (
          <div className="absolute top-4 left-4 z-10 flex gap-1 bg-black/50 backdrop-blur-md p-1">
            {viewerModels.map((model, i) => (
              <button
                key={i}
                onClick={() => { setActiveModelIndex(i); setTPose(false); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeModelIndex === i ? 'bg-orange-400/20 text-orange-300' : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {model.label}
              </button>
            ))}
          </div>
        )}

        {/* T-Pose toggle */}
        {activeViewerUrl && activeModelIsVrm && (
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => setTPose((p) => !p)}
              className="bg-black/50 backdrop-blur-md text-white px-3 py-1.5 text-xs font-medium hover:bg-black/70 transition-colors flex items-center gap-1.5"
            >
              {tPose ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                  Play Animation
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  T-Pose
                </>
              )}
            </button>
          </div>
        )}

        {/* Viewer */}
        {activeViewerUrl ? (
          <div className="flex-1 min-h-0 w-full">
            <VRMViewer
              url={activeViewerUrl}
              height="100%"
              animationUrl={activeModelIsVrm ? '/animations/Bored.fbx' : undefined}
              tPose={tPose}
            />
          </div>
        ) : resolvedImage ? (
          <div className="flex-1 flex items-center justify-center p-8 min-h-[400px]">
            <img src={resolvedImage} alt={nft.name} className="max-w-full max-h-full object-contain rounded-lg" />
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

        {/* Download */}
        {activeViewerUrl && (
          <div className="absolute bottom-4 right-4 flex gap-2">
            <button
              onClick={() => downloadFile(activeViewerUrl, buildDownloadFilename(nft.name, activeViewerUrl, activeModelIsVrm ? 'model/vrm' : 'model/gltf-binary'))}
              className="bg-black/60 hover:bg-black/80 backdrop-blur-md text-white px-4 py-2 text-xs font-medium transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download {activeModelIsVrm ? 'VRM' : 'Model'}
            </button>
          </div>
        )}
      </div>
    </div>
    </ForgePageWrapper>
  );
}
