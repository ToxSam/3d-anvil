'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMetaplex } from '@/lib/metaplex';
import { PublicKey } from '@solana/web3.js';
import { VRMUploader, VRMUploadResult } from './VRMUploader';
import { ImagePreview } from './ImagePreview';
import { parse3DModel, VRMMetadata } from '@/lib/vrmParser';
import { GLBLicenseSelector } from './GLBLicenseSelector';
import { IconVRM, IconGLB, Icon3DCube, Icon3DBox } from './AssetIcons';
import { uploadFileToArweave, uploadMetadataToArweave } from '@/lib/uploadToArweave';
import {
  createIrysUploader,
  estimateUploadCost,
  fundIrysBalance,
  irysUploadFiles,
  irysUploadJson,
} from '@/lib/irysUploader';
import { validateCollectionMint } from '@/lib/validateCollectionMint';
import { SOLANA_NETWORK } from '@/lib/constants';
import { useToast } from '@/components/Toast';
import dynamic from 'next/dynamic';
import { ForgeNumberInput } from '@/components/ForgeNumberInput';
import { TransactionConfirmModal, buildMintNftTransaction } from '@/components/TransactionConfirmModal';
import { TransactionProgressModal, getMintNftSteps } from '@/components/TransactionProgressModal';
import { parseSolanaError } from '@/lib/solanaErrors';
import { checkSolBalance, estimateMintRent, createNftWalletFirst } from '@/lib/transactionUtils';

const VRMViewer = dynamic(
  () => import('@/components/VRMViewer').then((mod) => mod.VRMViewer),
  { ssr: false }
);

interface Props {
  collectionAddress: string;
  /** Display name of the collection (used in metadata). */
  collectionName?: string;
  /** Symbol of the collection (used in metadata). */
  collectionSymbol?: string;
  onMintComplete?: (nftAddress: string) => void;
  /** Called when minting starts or stops (e.g. to drive background forging animation). */
  onMintingChange?: (isMinting: boolean) => void;
  /** Full-viewport mint page: empty state = 3D viewer drop zone; with VRM = left panel + viewer, no main scroll */
  fullViewport?: boolean;
}

interface CustomTrait {
  trait_type: string;
  value: string;
}

/** An additional file (GLB, VRM, image) attached to the NFT beyond the main avatar. */
interface AdditionalFile {
  file: File;
  previewUrl: string;
  /** 'model' = VRM/GLB that can be viewed in 3D, 'image' = thumbnail/render */
  type: 'model' | 'image';
  name: string;
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

export function MintNFT({ collectionAddress, collectionName, collectionSymbol, onMintComplete, onMintingChange, fullViewport }: Props) {
  const router = useRouter();
  const wallet = useWallet();
  const metaplex = useMetaplex();
  const { toast } = useToast();

  // VRM / GLB state
  const [vrmData, setVrmData] = useState<VRMUploadResult | null>(null);
  const [vrmFile, setVrmFile] = useState<File | null>(null);
  const [vrmMetadata, setVrmMetadata] = useState<VRMMetadata | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // GLB license state (only used when fileType === 'glb')
  const [glbLicense, setGlbLicense] = useState('');
  const [glbCommercialUse, setGlbCommercialUse] = useState('');

  // Thumbnail state
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);

  // Additional files state
  const [additionalFiles, setAdditionalFiles] = useState<AdditionalFile[]>([]);

  // Active model in viewer (0 = main VRM, 1+ = additional model files)
  const [activeModelIndex, setActiveModelIndex] = useState(0);

  // Form state
  const [customTraits, setCustomTraits] = useState<CustomTrait[]>([]);
  const [nftName, setNftName] = useState('');
  const [nftDescription, setNftDescription] = useState('');
  const [minting, setMinting] = useState(false);
  const [showMintConfirm, setShowMintConfirm] = useState(false);
  const [status, setStatus] = useState('');

  // Steps: 1 = VRM metadata, 2 = NFT details, 3 = Mint Settings, 4 = Confirmation, 5 = Mint
  const [mintStep, setMintStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  // Highest step the user has confirmed/reached (gates tab navigation)
  const [maxStepReached, setMaxStepReached] = useState(1);

  // Ref for the step content scroll container — scroll to top when changing tabs
  const stepContentScrollRef = useRef<HTMLDivElement>(null);

  // Guided mint process phases
  type MintPhase = '' | 'funding' | 'uploading' | 'vrm' | 'preparing' | 'thumbnail' | 'additional' | 'metadata' | 'minting' | 'confirming' | 'verifying' | 'success';
  const [mintPhase, setMintPhase] = useState<MintPhase>('');

  // Irys storage cost estimate
  const [storageCostSol, setStorageCostSol] = useState<number | null>(null);
  const [storageCostLamports, setStorageCostLamports] = useState<string | null>(null);
  const [estimatingCost, setEstimatingCost] = useState(false);
  const useLocalStorage = process.env.NEXT_PUBLIC_USE_LOCAL_STORAGE === 'true';

  // Image preview (lightbox)
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);

  // Smooth transition overlay
  const [viewerTransitionOverlay, setViewerTransitionOverlay] = useState(false);
  const [overlayExiting, setOverlayExiting] = useState(false);

  // Success / error state
  const [mintedNftAddress, setMintedNftAddress] = useState<string | null>(null);
  const [verifyCollectionFailed, setVerifyCollectionFailed] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintErrorDetails, setMintErrorDetails] = useState<string | null>(null);

  // Step 2 validation error for thumbnail
  const [thumbnailError, setThumbnailError] = useState(false);

  // Step 3: Mint Settings
  const [royaltyPercent, setRoyaltyPercent] = useState(5);
  const [mintQuantity, setMintQuantity] = useState(1);

  // Drag-over states for drop zones
  const [thumbnailDragOver, setThumbnailDragOver] = useState(false);
  const [additionalFilesDragOver, setAdditionalFilesDragOver] = useState(false);

  // Animation / T-pose toggle (only for VRM models, index 0)
  const [tPose, setTPose] = useState(false);

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

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
      additionalFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show transition overlay when we have a VRM to preview
  useEffect(() => {
    if (previewUrl) {
      setViewerTransitionOverlay(true);
      setOverlayExiting(false);
    } else {
      setViewerTransitionOverlay(false);
      setOverlayExiting(false);
    }
  }, [previewUrl]);

  useEffect(() => {
    if (!overlayExiting) return;
    const t = setTimeout(() => {
      setViewerTransitionOverlay(false);
      setOverlayExiting(false);
    }, 650);
    return () => clearTimeout(t);
  }, [overlayExiting]);

  useEffect(() => {
    if (!viewerTransitionOverlay || overlayExiting) return;
    const t = setTimeout(() => setOverlayExiting(true), 3000);
    return () => clearTimeout(t);
  }, [viewerTransitionOverlay, overlayExiting]);

  // Notify parent when minting starts/stops (e.g. for background forging animation)
  useEffect(() => {
    onMintingChange?.(minting);
  }, [minting, onMintingChange]);

  function clearMintState() {
    setMintedNftAddress(null);
    setVerifyCollectionFailed(false);
    setVrmData(null);
    setVrmFile(null);
    setVrmMetadata(null);
    setNftName('');
    setNftDescription('');
    setCustomTraits([]);
    setRoyaltyPercent(5);
    setMintQuantity(1);
    setStatus('');
    setMintPhase('');
    setThumbnailFile(null);
    setThumbnailError(false);
    setMintStep(1);
    setMaxStepReached(1);
    setActiveModelIndex(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    additionalFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setAdditionalFiles([]);
    setPreviewUrl(null);
    setThumbnailPreview(null);
  }

  function handleViewNft() {
    if (!mintedNftAddress) return;
    router.push(`/item/${mintedNftAddress}`);
    clearMintState();
  }

  // ── Step navigation with validation gates ──

  function goToStep(step: 1 | 2 | 3 | 4 | 5) {
    // Can always go back; can only go forward if that step has been reached
    if (step <= maxStepReached) {
      setMintStep(step);
    }
  }

  // Scroll step content to top whenever the active step/tab changes
  useEffect(() => {
    stepContentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [mintStep]);

  function advanceFromStep(currentStep: 1 | 2 | 3 | 4 | 5) {
    // Validate current step before advancing
    if (currentStep === 1 && vrmMetadata?.fileType === 'glb' && !glbLicense) {
      toast('Please select a license for your GLB model before continuing.', 'warning');
      return;
    }
    if (currentStep === 2) {
      if (!nftName.trim()) {
        toast('Please enter a name for your NFT.', 'warning');
        return;
      }
      if (!thumbnailFile) {
        setThumbnailError(true);
        toast('A preview image is required. Please upload a PNG or JPG.', 'warning');
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
      if (mintQuantity < 1 || mintQuantity > 10) {
        toast('Mint quantity must be between 1 and 10.', 'warning');
        return;
      }
    }

    const nextStep = Math.min(currentStep + 1, 5) as 1 | 2 | 3 | 4 | 5;
    setMintStep(nextStep);
    setMaxStepReached((prev) => Math.max(prev, nextStep) as 1 | 2 | 3 | 4 | 5);
  }

  // ── File handling ──

  const handleFileSelected = useCallback((file: File, metadata: VRMMetadata) => {
    setVrmFile(file);
    setVrmMetadata(metadata);
    setNftName((metadata.title || file.name.replace(/\.(vrm|glb)$/i, '')).slice(0, 32));
    setMintStep(1);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setActiveModelIndex(0);
  }, [previewUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.toLowerCase();
      if (!ext.endsWith('.vrm') && !ext.endsWith('.glb')) return;
      try {
        const metadata = await parse3DModel(file);
        handleFileSelected(file, metadata);
      } catch (err) {
        console.error('Failed to parse model:', err);
        toast('Failed to parse file. Make sure it\u2019s a valid .vrm or .glb file.', 'error');
      }
    },
    [handleFileSelected]
  );

  function handleVRMUploaded(data: VRMUploadResult) {
    setVrmData(data);
  }

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

  /** Dev/test: run only collection validation */
  async function handleCheckCollectionOnly() {
    setStatus('Checking collection\u2026');
    try {
      const validation = await validateCollectionMint(metaplex.connection, collectionAddress);
      setStatus('');
      if (validation.valid) {
        toast('Collection OK \u2014 this is a valid mint on the current RPC.', 'success');
      } else {
        const networkHint =
          SOLANA_NETWORK === 'devnet' ? ' This app is on Devnet\u2014use a Devnet collection.' : '';
        toast(validation.message + networkHint, 'error', 8000);
      }
    } catch (e) {
      setStatus('');
      toast('Check failed: ' + (e as Error).message, 'error');
    }
  }

  // ── Mint handler (with additional files support) ──

  async function handleMintRequest() {
    const effectiveMetadata = vrmData?.metadata ?? vrmMetadata;
    const hasAvatar = vrmData || (vrmFile && vrmMetadata);
    if (!hasAvatar || !effectiveMetadata || !nftName) {
      toast('Please select an avatar and enter a name.', 'warning');
      return;
    }
    if (!thumbnailFile) {
      toast('A preview image is required.', 'warning');
      return;
    }

    if (!useLocalStorage) {
      try {
        setEstimatingCost(true);
        const irys = await createIrysUploader(wallet);
        const filesToUpload: File[] = [
          thumbnailFile,
          ...additionalFiles.map((af) => af.file),
        ];
        if (!vrmData && vrmFile) filesToUpload.unshift(vrmFile);
        const { totalLamports, totalSol } = await estimateUploadCost(
          irys,
          filesToUpload,
          mintQuantity, // one metadata upload per edition
        );
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

    setShowMintConfirm(true);
  }

  async function handleMint() {
    setShowMintConfirm(false);
    const effectiveMetadata = vrmData?.metadata ?? vrmMetadata;
    const hasAvatar = vrmData || (vrmFile && vrmMetadata);
    if (!hasAvatar || !effectiveMetadata || !nftName || !thumbnailFile) return;

    setStatus('Checking collection\u2026');
    const validation = await validateCollectionMint(metaplex.connection, collectionAddress);
    if (!validation.valid) {
      const networkHint =
        SOLANA_NETWORK === 'devnet'
          ? ' This app is on Devnet\u2014switch your wallet to Devnet and use a collection created on Devnet.'
          : '';
      toast(validation.message + networkHint, 'error', 8000);
      setStatus('');
      return;
    }

    setMinting(true);
    setMintError(null);
    setMintErrorDetails(null);

    try {
      let vrmUrl: string;
      let thumbnailUrl: string;
      const uploadedAdditionalFiles: { uri: string; type: string }[] = [];

      if (!useLocalStorage) {
        const irys = await createIrysUploader(wallet);

        // Single wallet approval for all storage
        if (storageCostLamports) {
          setMintPhase('funding');
          setStatus('Funding Arweave storage\u2026 Approve in your wallet.');
          await fundIrysBalance(irys, storageCostLamports);
        }

        setMintPhase('uploading');
        setStatus('Uploading all files to Arweave\u2026 Sign once to authorize.');

        const batchEntries: Array<{ key: string; file: File }> = [];
        const needsVrmUpload = !vrmData && vrmFile && vrmMetadata;

        if (needsVrmUpload) {
          batchEntries.push({ key: `vrm__${vrmFile!.name}`, file: vrmFile! });
        } else if (!vrmData) {
          throw new Error('Missing VRM');
        }

        batchEntries.push({ key: `thumb__${thumbnailFile.name}`, file: thumbnailFile });
        for (let i = 0; i < additionalFiles.length; i++) {
          const af = additionalFiles[i];
          batchEntries.push({ key: `add_${i}__${af.file.name}`, file: af.file });
        }

        const urlMap = await irysUploadFiles(irys, batchEntries);

        if (needsVrmUpload) {
          vrmUrl = urlMap.get(`vrm__${vrmFile!.name}`)!;
        } else {
          vrmUrl = vrmData!.vrmUrl;
        }

        thumbnailUrl = urlMap.get(`thumb__${thumbnailFile.name}`)!;
        for (let i = 0; i < additionalFiles.length; i++) {
          const af = additionalFiles[i];
          const uri = urlMap.get(`add_${i}__${af.file.name}`);
          if (uri) uploadedAdditionalFiles.push({ uri, type: getMimeType(af.file) });
        }
      } else {
        // Local storage fallback
        if (vrmData) {
          vrmUrl = vrmData.vrmUrl;
        } else if (vrmFile && vrmMetadata) {
          setMintPhase('vrm');
          setStatus('Storing your VRM file permanently\u2026');
          vrmUrl = await uploadFileToArweave(metaplex, vrmFile);
        } else {
          throw new Error('Missing VRM');
        }

        setMintPhase('thumbnail');
        setStatus('Storing your preview image\u2026');
        thumbnailUrl = await uploadFileToArweave(metaplex, thumbnailFile);

        if (additionalFiles.length > 0) {
          setMintPhase('additional');
          for (let i = 0; i < additionalFiles.length; i++) {
            const af = additionalFiles[i];
            setStatus(`Storing additional file ${i + 1}/${additionalFiles.length}: ${af.name}\u2026`);
            const uri = await uploadFileToArweave(metaplex, af.file);
            uploadedAdditionalFiles.push({ uri, type: getMimeType(af.file) });
          }
        }
      }

      // ── Shared metadata fields ──
      const royaltyBps = Math.round(royaltyPercent * 100);
      const nftSymbol = collectionSymbol || 'VRM';
      const attributes = [
        { trait_type: 'License', value: effectiveMetadata.license },
        { trait_type: 'Commercial Use', value: effectiveMetadata.commercialUse },
        { trait_type: 'Blend Shapes', value: effectiveMetadata.blendShapeCount.toString() },
        { trait_type: 'Bone Count', value: effectiveMetadata.boneCount.toString() },
        ...customTraits.filter((t) => t.trait_type && t.value),
      ];

      const mintedAddresses: string[] = [];
      let anyVerifyFailed = false;

      // ── Mint loop (supports batch minting) ──
      for (let edition = 0; edition < mintQuantity; edition++) {
        const editionName = mintQuantity > 1 ? `${nftName} #${edition + 1}` : nftName;
        const editionLabel = mintQuantity > 1 ? ` (${edition + 1}/${mintQuantity})` : '';

        // ── Phase 4: Build & upload metadata ──
        setMintPhase('preparing');
        setStatus(`Preparing metadata${editionLabel}\u2026`);

        const metadata = {
          name: editionName,
          symbol: nftSymbol,
          description: nftDescription || 'VRM Avatar NFT',
          seller_fee_basis_points: royaltyBps,
          image: thumbnailUrl,
          animation_url: vrmUrl,
          external_url: `${window.location.origin}/collection/${collectionAddress}`,
          attributes,
          properties: {
            files: [
              { uri: vrmUrl, type: 'model/vrm' },
              { uri: thumbnailUrl, type: thumbnailFile.type || 'image/png' },
              ...uploadedAdditionalFiles,
            ],
            category: 'vr',
            creators: [
              {
                address: wallet.publicKey?.toString() || '',
                share: 100,
                verified: false,
              },
            ],
          },
          collection: {
            name: collectionName || nftName,
            family: '3D Anvil',
          },
        };

        setMintPhase('metadata');
        setStatus(`Storing NFT metadata${editionLabel}\u2026`);
        let metadataUrl: string;
        if (!useLocalStorage) {
          const irys = await createIrysUploader(wallet);
          metadataUrl = await irysUploadJson(irys, metadata);
        } else {
          metadataUrl = await uploadMetadataToArweave(metaplex, metadata);
        }

        // ── Phase 5: Pre-flight balance check + Create NFT on Solana ──
        const { rentSol: nftRentSol } = estimateMintRent();
        const { sufficient: hasSol, balance: walletBal } = await checkSolBalance(
          metaplex.connection,
          wallet.publicKey!,
          nftRentSol,
        );
        if (!hasSol) {
          throw new Error(
            `Insufficient SOL. Minting requires ~${nftRentSol} SOL for account rent, but your wallet only has ${walletBal.toFixed(4)} SOL.`,
          );
        }

        setMintPhase('minting');
        setStatus(`Creating NFT on Solana${editionLabel}\u2026 Approve in Phantom.`);
        const { mintAddress: nftMintAddress } = await createNftWalletFirst(
          metaplex,
          { publicKey: wallet.publicKey!, signTransaction: wallet.signTransaction! },
          {
            uri: metadataUrl,
            name: editionName,
            symbol: nftSymbol,
            sellerFeeBasisPoints: royaltyBps,
            collection: new PublicKey(collectionAddress),
          },
        );

        // ── Phase 6: Confirm on-chain ──
        setMintPhase('confirming');
        setStatus(`Waiting for confirmation${editionLabel}\u2026`);
        await new Promise((r) => setTimeout(r, 2000));

        // ── Phase 7: Verify collection ──
        setMintPhase('verifying');
        setStatus(`Linking to collection${editionLabel}\u2026 Approve in Phantom.`);
        let verifyFailed = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await metaplex.nfts().verifyCollection({
              mintAddress: nftMintAddress,
              collectionMintAddress: new PublicKey(collectionAddress),
            });
            verifyFailed = false;
            break;
          } catch (verifyErr) {
            console.warn(`verifyCollection attempt ${attempt + 1} failed:`, verifyErr);
            verifyFailed = true;
            if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
          }
        }

        mintedAddresses.push(nftMintAddress.toString());
        if (verifyFailed) anyVerifyFailed = true;
      }

      // ── Done ──
      setMintPhase('success');
      setStatus(mintQuantity > 1 ? `${mintQuantity} NFTs are ready!` : 'Your NFT is ready!');
      setMintedNftAddress(mintedAddresses[0]);
      setVerifyCollectionFailed(anyVerifyFailed);

      if (onMintComplete) onMintComplete(mintedAddresses[0]);
    } catch (error) {
      console.error('Minting failed:', error);
      const parsed = parseSolanaError(error);
      setMintError(parsed.friendly);
      setMintErrorDetails(parsed.raw);
      setStatus('');
    }
  }

  function handleProgressModalClose() {
    setMinting(false);
    setMintPhase('');
    setMintError(null);
    setMintErrorDetails(null);
    setStatus('');
  }

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

  // ── No VRM loaded yet ──

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
              Mint your 3D model as an NFT
            </h2>
            <p className="text-body text-gray-500 dark:text-gray-400 mb-8">
              Drop your VRM or GLB file here, or click below to preview and mint it as an NFT on Solana.
            </p>
            <label className="btn-hero-primary cursor-pointer inline-block py-4 px-8">
              <span>Choose VRM / GLB to mint</span>
              <input type="file" accept=".vrm,.glb" onChange={handleFileInput} className="hidden" />
            </label>
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-2xl mx-auto">
        <h2 className="text-title font-bold text-gray-900 dark:text-gray-100 mb-6">Mint VRM NFT</h2>
        <VRMUploader onUploadComplete={handleVRMUploaded} onFileSelected={handleFileSelected} />
      </div>
    );
  }

  // ── VRM loaded: split layout ──

  const containerClass = fullViewport
    ? 'flex flex-1 min-h-0 min-w-0'
    : 'flex flex-col lg:flex-row gap-0 min-h-[600px] lg:min-h-[700px]';

  const isGlbFile = vrmMetadata?.fileType === 'glb';
  const stepLabels = {
    1: isGlbFile ? 'GLB Metadata' : 'VRM Metadata',
    2: 'NFT Details',
    3: 'Mint Settings',
    4: 'Confirmation',
    5: 'Mint',
  } as const;

  const stepNumbers = [1, 2, 3, 4, 5] as const;

  return (
    <div className={containerClass}>
      {/* Celebration overlay */}
      {mintedNftAddress && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fade-in"
          role="dialog"
          aria-labelledby="mint-success-title"
          aria-modal="true"
        >
          <div className="bg-[var(--background)] border border-gray-200/30 dark:border-gray-700/20 shadow-2xl max-w-md w-full p-8 md:p-10 text-center animate-slide-up" style={{ boxShadow: '0 0 60px rgba(251,146,60,0.15), 0 0 120px rgba(245,158,11,0.08)' }}>
            <div className="mx-auto w-16 h-16 md:w-20 md:h-20 bg-orange-400/10 border border-orange-400/20 flex items-center justify-center mb-6">
              <svg className="w-8 h-8 md:w-10 md:h-10 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 id="mint-success-title" className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Forged!
            </h2>
            <p className="text-body text-gray-600 dark:text-gray-400 mb-6">
              Your avatar is minted and stored on-chain. Time to see it live.
            </p>
            <button type="button" onClick={handleViewNft} className="btn-hero-primary w-full py-4">
              View your NFT
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
              Step {mintStep}: {stepLabels[mintStep]}
            </h2>
            <span className="text-caption text-orange-400/60 font-mono">
              {mintStep} / 5
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-0.5 bg-gray-200/30 dark:bg-gray-700/30 overflow-hidden">
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{
                width: `${(mintStep / 5) * 100}%`,
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
            {mintStep === 1 ? (
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
                          <button
                            type="button"
                            onClick={() => setPreviewImageSrc(vrmMetadata.thumbnail!)}
                            className="w-16 h-16 rounded overflow-hidden border border-gray-200 dark:border-gray-700 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-1"
                          >
                            <img src={vrmMetadata.thumbnail} alt="Model thumbnail" className="w-full h-full object-cover" />
                          </button>
                        </div>
                      )}
                      <MetadataRow label="Model" value={vrmMetadata.title} />
                      <MetadataRow label="Author" value={vrmMetadata.author || '\u2014'} />
                      <MetadataRow label="Version" value={vrmMetadata.version} />
                      {vrmMetadata.fileType === 'vrm' && (
                        <>
                          <LinkableMetadataRow label="Contact" value={vrmMetadata.contactInformation} />
                          <LinkableMetadataRow label="References" value={vrmMetadata.reference} />
                        </>
                      )}
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
                        <MetadataRow label="Allowed Users" value={vrmMetadata.allowedUserName} />
                        <MetadataRow label="Commercial" value={vrmMetadata.commercialUse} />
                        <MetadataRow label="Violent" value={vrmMetadata.violentUse} />
                        <MetadataRow label="Sexual" value={vrmMetadata.sexualUse} />
                        {vrmMetadata.otherPermissionUrl && (
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-caption text-gray-500 dark:text-gray-400 flex-shrink-0">Other Permissions</span>
                            <a href={vrmMetadata.otherPermissionUrl} target="_blank" rel="noopener noreferrer" className="text-caption text-gray-900 dark:text-gray-100 text-right break-all hover:underline">
                              {vrmMetadata.otherPermissionUrl}
                            </a>
                          </div>
                        )}
                        {vrmMetadata.otherLicenseUrl && (
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-caption text-gray-500 dark:text-gray-400 flex-shrink-0">Other License</span>
                            <a href={vrmMetadata.otherLicenseUrl} target="_blank" rel="noopener noreferrer" className="text-caption text-gray-900 dark:text-gray-100 text-right break-all hover:underline">
                              {vrmMetadata.otherLicenseUrl}
                            </a>
                          </div>
                        )}
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
                        <MetadataRow label="Bones" value={vrmMetadata.boneCount.toString()} />
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
                </div>
              )

            /* ════════ STEP 2: NFT Details ════════ */
            ) : mintStep === 2 ? (
              <>
                <p className="text-body text-gray-600 dark:text-gray-400">
                  Fill in the details for your NFT. A preview image is required for wallets and galleries.
                </p>

                {/* NFT Name */}
                <div>
                  <label className="text-label block mb-2">Name <span className="text-orange-400">*</span></label>
                  <input
                    type="text"
                    value={nftName}
                    onChange={(e) => setNftName(e.target.value.slice(0, 32))}
                    className="input-forge"
                    maxLength={32}
                  />
                  {nftName.length >= 28 && (
                    <p className="mt-1 text-xs text-gray-400">{nftName.length}/32</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="text-label block mb-2">Description</label>
                  <textarea
                    value={nftDescription}
                    onChange={(e) => setNftDescription(e.target.value)}
                    rows={3}
                    className="input-forge"
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

                {/* Preview Image (REQUIRED) — supports drag & drop */}
                <div>
                  <label className="text-label block mb-2">
                    Preview Image <span className="text-orange-400">*</span>
                  </label>
                  <p className="text-caption text-gray-500 dark:text-gray-400 mb-3">
                    A PNG or JPG used as the NFT image in wallets and galleries. This is required.
                  </p>
                  {thumbnailPreview ? (
                    <div className="relative group">
                      <button
                        type="button"
                        onClick={() => setPreviewImageSrc(thumbnailPreview)}
                        className="w-full aspect-video bg-gray-100 dark:bg-gray-900 overflow-hidden border border-gray-300 dark:border-gray-700 block text-left hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-1"
                      >
                        <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-full object-cover pointer-events-none" />
                      </button>
                      <button
                        onClick={removeThumbnail}
                        className="absolute top-2 right-2 bg-black/70 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove thumbnail"
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
                      className={`upload-forge block cursor-pointer ${
                        thumbnailDragOver
                          ? '!border-orange-400/50 !bg-orange-400/5'
                          : thumbnailError
                          ? '!border-red-400/40 !bg-red-400/5'
                          : ''
                      }`}
                    >
                      <svg className={`w-8 h-8 mx-auto mb-2 ${thumbnailDragOver ? 'text-orange-400' : thumbnailError ? 'text-red-400' : 'text-gray-400/60'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className={`text-small ${thumbnailDragOver ? 'text-orange-400 font-medium' : thumbnailError ? 'text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                        {thumbnailDragOver ? 'Drop image here' : thumbnailError ? 'Preview image is required \u2014 drop or click to upload' : 'Drag & drop or click to upload image'}
                      </span>
                      <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleThumbnailSelect} className="hidden" />
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
                    Optional. Drag &amp; drop one or multiple files at once: GLB models, alternate VRMs, render images, or extra thumbnails. We auto-detect the file type.
                  </p>

                  {/* Drop zone (always shown) */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setAdditionalFilesDragOver(true); }}
                    onDragLeave={() => setAdditionalFilesDragOver(false)}
                    onDrop={handleAdditionalFilesDrop}
                    className={`upload-forge !p-4 mb-3 ${
                      additionalFilesDragOver
                        ? '!border-orange-400/50 !bg-orange-400/5'
                        : ''
                    }`}
                  >
                    <svg className={`w-6 h-6 mx-auto mb-1.5 ${additionalFilesDragOver ? 'text-orange-400' : 'text-gray-400/60'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                    </svg>
                    <p className={`text-caption ${additionalFilesDragOver ? 'text-orange-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                      {additionalFilesDragOver ? 'Drop files here' : 'Drop files here \u2014 GLB, VRM, PNG, JPG'}
                    </p>
                  </div>

                  {/* File list */}
                  {additionalFiles.length > 0 && (
                    <div className="space-y-2">
                      {additionalFiles.map((af, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-3 border border-gray-200/30 dark:border-gray-700/20 bg-gray-50/30 dark:bg-gray-800/15"
                        >
                          {af.type === 'image' ? (
                            <button
                              type="button"
                              onClick={() => setPreviewImageSrc(af.previewUrl)}
                              className="flex-shrink-0 w-10 h-10 rounded overflow-hidden border border-gray-200 dark:border-gray-700 hover:opacity-90"
                            >
                              <img src={af.previewUrl} alt={af.name} className="w-full h-full object-cover" />
                            </button>
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
                              {af.type === 'model' ? '3D Model' : 'Image'} &middot; {formatFileSize(af.file.size)}
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
            ) : mintStep === 3 ? (
              <div className="space-y-6">
                <p className="text-body text-gray-600 dark:text-gray-400">
                  Configure your royalties and mint quantity before proceeding.
                </p>

                {/* ── Royalties ── */}
                <section>
                  <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                    Creator Royalties
                  </p>
                  <p className="text-caption text-gray-500 dark:text-gray-400 mb-4">
                    The percentage you earn on every secondary sale (resale) of this NFT. Standard range is 2.5%&ndash;10%.
                  </p>

                  <div className="space-y-3">
                    {/* Slider */}
                    <div className="flex items-center gap-4">
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

                    {/* Quick presets */}
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

                    {/* Basis points display */}
                    <p className="text-caption text-gray-400 dark:text-gray-500">
                      {Math.round(royaltyPercent * 100)} basis points &middot;
                      {royaltyPercent === 0 ? ' No royalties on resale' :
                       ` You earn ${royaltyPercent}% on every resale`}
                    </p>

                    {/* Warnings for high royalties */}
                    {royaltyPercent > 15 && royaltyPercent <= 50 && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-caption text-amber-800 dark:text-amber-200">
                          Heads up &mdash; {royaltyPercent}% is above the typical range. Most marketplaces and buyers expect 2.5&ndash;10%. Higher royalties may discourage secondary sales.
                        </p>
                      </div>
                    )}
                    {royaltyPercent > 50 && royaltyPercent < 100 && (
                      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                        <p className="text-caption text-red-800 dark:text-red-200">
                          Whoa there, {royaltyPercent}% royalties? That&apos;s&hellip; bold. Buyers would pay more in royalties than what they keep on resale. Totally your call, but just know this might scare off secondary buyers.
                        </p>
                      </div>
                    )}
                    {royaltyPercent === 100 && (
                      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                        <p className="text-caption text-red-800 dark:text-red-200">
                          100% royalties &mdash; the legendary full-send. Every resale goes entirely to you. Basically nobody will ever resell this unless they really, <em>really</em> love you. Your NFT, your rules though.
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                <div className="divider-forge" />

                {/* ── Mint Quantity ── */}
                <section>
                  <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 pb-1 border-b border-gray-200/30 dark:border-gray-700/20">
                    Mint Quantity
                  </p>
                  <p className="text-caption text-gray-500 dark:text-gray-400 mb-4">
                    How many copies (editions) to mint with the same avatar and metadata.
                    {mintQuantity > 1 && ` Each will be named "${nftName} #1", "${nftName} #2", etc.`}
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMintQuantity((q) => Math.max(1, q - 1))}
                      disabled={mintQuantity <= 1}
                      className="w-10 h-10 flex items-center justify-center border border-gray-300/30 dark:border-gray-700/20 text-gray-600 dark:text-gray-400 hover:border-orange-400/40 hover:text-orange-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      &minus;
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={mintQuantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) setMintQuantity(Math.max(1, Math.min(10, val)));
                      }}
                      className="w-16 input-forge !px-2 !py-2 text-body text-center"
                    />
                    <button
                      type="button"
                      onClick={() => setMintQuantity((q) => Math.min(10, q + 1))}
                      disabled={mintQuantity >= 10}
                      className="w-10 h-10 flex items-center justify-center border border-gray-300/30 dark:border-gray-700/20 text-gray-600 dark:text-gray-400 hover:border-orange-400/40 hover:text-orange-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                    <span className="text-small text-gray-500 dark:text-gray-400">
                      {mintQuantity === 1 ? 'edition' : 'editions'}
                    </span>
                  </div>

                  {mintQuantity > 1 && (
                    <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-caption text-amber-800 dark:text-amber-200">
                        Minting {mintQuantity} editions requires <strong>{mintQuantity * 2} wallet approvals</strong> (one to create each NFT and one to link each to the collection). Files are uploaded once and shared across all editions.
                      </p>
                    </div>
                  )}
                </section>

                <div className="divider-forge" />

                {/* ── Summary ── */}
                <section className="bg-gray-50/30 dark:bg-gray-800/15 border border-gray-200/30 dark:border-gray-700/20 p-4 space-y-2">
                  <div className="flex justify-between text-small">
                    <span className="text-gray-500 dark:text-gray-400">Royalties</span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium">{royaltyPercent}%</span>
                  </div>
                  <div className="flex justify-between text-small">
                    <span className="text-gray-500 dark:text-gray-400">Editions</span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium">{mintQuantity}</span>
                  </div>
                  <div className="flex justify-between text-small">
                    <span className="text-gray-500 dark:text-gray-400">Wallet approvals</span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium">{mintQuantity * 2}</span>
                  </div>
                </section>
              </div>

            /* ════════ STEP 4: Confirmation ════════ */
            ) : mintStep === 4 ? (
              <div className="space-y-6">
                <div className="relative overflow-hidden rounded-xl border-2 border-orange-400/20 bg-gradient-to-br from-orange-400/5 via-transparent to-orange-400/5 p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-400/5 rounded-full blur-3xl"></div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-small font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                        Ready to Mint
                      </h3>
                    </div>
                    <p className="text-body text-gray-600 dark:text-gray-400 leading-relaxed">
                      Review everything before minting. Once minted, this data is stored permanently on-chain and cannot be changed.
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
                          <span className="text-caption font-semibold text-gray-700 dark:text-gray-300">Preview Image</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewImageSrc(thumbnailPreview)}
                          className="rounded-lg overflow-hidden border border-gray-200/50 dark:border-gray-700/50 bg-gray-100 dark:bg-gray-900 block hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-1 w-full"
                        >
                          <img src={thumbnailPreview} alt="Preview" className="w-full h-auto max-h-[200px] object-contain pointer-events-none" />
                        </button>
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
                      <button
                        type="button"
                        onClick={() => { setActiveModelIndex(0); }}
                        className="text-caption text-orange-400 hover:text-orange-500 dark:hover:text-orange-300 transition-colors font-medium"
                      >
                        Preview
                      </button>
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
                          <button
                            type="button"
                            onClick={() => setPreviewImageSrc(af.previewUrl)}
                            className="flex-shrink-0 w-10 h-10 rounded overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 hover:opacity-90"
                          >
                            <img src={af.previewUrl} alt={af.name} className="w-full h-full object-cover" />
                          </button>
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
                        {af.type === 'model' && (
                          <button
                            type="button"
                            onClick={() => { setActiveModelIndex(i + 1); }}
                            className="text-caption text-orange-400 hover:text-orange-500 dark:hover:text-orange-300 transition-colors font-medium"
                          >
                            Preview
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                {/* NFT Details */}
                <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-gray-900/30 dark:to-transparent p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200/50 dark:border-gray-700/50">
                    <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <h3 className="text-small font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                      NFT Details
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <EnhancedMetadataRow label="Name" value={mintQuantity > 1 ? `${nftName} #1–#${mintQuantity}` : nftName} icon="collection" />
                    <EnhancedMetadataRow label="Description" value={nftDescription || 'VRM Avatar NFT'} icon="document" multiline />
                    <EnhancedMetadataRow label="Collection" value={collectionName || nftName} icon="collection" />
                    <EnhancedMetadataRow label="Symbol" value={collectionSymbol || 'VRM'} icon="tag" />
                  </div>
                </section>

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
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-small text-gray-700 dark:text-gray-300">Royalties</span>
                      </div>
                      <span className="text-body font-bold text-orange-400">{royaltyPercent}%</span>
                    </div>
                    <div className="p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                      <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">Editions</div>
                      <div className="text-body font-bold text-gray-900 dark:text-gray-100">
                        {mintQuantity === 1 ? '1 (unique)' : `${mintQuantity} copies`}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30">
                      <div className="text-caption text-gray-500 dark:text-gray-400 mb-1">Wallet Approvals</div>
                      <div className="text-body font-bold text-gray-900 dark:text-gray-100">{mintQuantity * 2}</div>
                    </div>
                    {royaltyPercent > 15 && (
                      <p className="text-caption text-amber-600 dark:text-amber-400 mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/10">
                        Note: {royaltyPercent}% is above the standard 2.5–10% range.
                      </p>
                    )}
                  </div>
                </section>

                {/* Traits — only license-related and custom traits */}
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

                {/* Total files summary */}
                <section className="rounded-xl border border-orange-400/20 bg-gradient-to-br from-orange-400/5 to-transparent p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    <h4 className="text-small font-semibold text-gray-900 dark:text-gray-100">Summary</h4>
                  </div>
                  <p className="text-small text-gray-600 dark:text-gray-400 leading-relaxed">
                    <strong className="text-orange-400">{2 + additionalFiles.length} files</strong> will be stored permanently:
                    1 VRM avatar, 1 preview image{additionalFiles.length > 0 ? `, and ${additionalFiles.length} additional file${additionalFiles.length > 1 ? 's' : ''}` : ''}.
                    You&apos;ll approve <strong className="text-gray-900 dark:text-gray-100">{mintQuantity * 2} wallet transaction{mintQuantity * 2 > 1 ? 's' : ''}</strong> on the mint step{mintQuantity > 1 ? ` (${mintQuantity} editions)` : ''}.
                  </p>
                  <p className="text-small text-gray-500 dark:text-gray-500 leading-relaxed">
                    <strong>Storage costs:</strong> Files are stored permanently on Arweave. The cost depends entirely on the total size of your files and current network rates — this is something we cannot control. Larger files (especially 3D models) cost more to store.
                    Your total file size is approximately <strong className="text-gray-900 dark:text-gray-100">{formatFileSize(
                      (vrmFile?.size || 0) + (thumbnailFile?.size || 0) + additionalFiles.reduce((sum, f) => sum + f.file.size, 0)
                    )}</strong>.
                  </p>
                </section>
              </div>

            /* ════════ STEP 4: Mint ════════ */
            ) : (
              <div className="space-y-6">
                <p className="text-body text-gray-700 dark:text-gray-300 leading-relaxed">
                  Everything happens here. We store your files permanently, then create your NFT on Solana. You&apos;ll approve <strong>two transactions</strong> in Phantom.
                </p>

                <section className="border border-gray-200/30 dark:border-gray-700/20 p-5 space-y-4 bg-gray-50/30 dark:bg-gray-900/30">
                  <p className="text-caption font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {minting ? 'In progress' : 'What happens when you tap Start minting'}
                  </p>

                  {(() => {
                    const PHASE_ORDER = ['', 'funding', 'uploading', 'vrm', 'thumbnail', 'additional', 'preparing', 'metadata', 'minting', 'confirming', 'verifying', 'success'];
                    const phaseIdx = PHASE_ORDER.indexOf(mintPhase);
                    const isAfter = (phase: string) => phaseIdx > PHASE_ORDER.indexOf(phase);
                    let stepNum = 0;
                    return (
                      <>
                        {!useLocalStorage && (
                          <ProcessStep
                            step={++stepNum}
                            label="Fund Arweave storage"
                            detail="A single SOL payment covers all file uploads."
                            walletPrompt
                            status={minting ? (mintPhase === 'funding' ? 'current' : isAfter('funding') ? 'done' : 'upcoming') : 'upcoming'}
                            minting={minting}
                          />
                        )}
                        {!useLocalStorage ? (
                          <ProcessStep
                            step={++stepNum}
                            label="Upload all files to Arweave"
                            detail="VRM, thumbnail, and additional files stored in a single batch."
                            walletPrompt
                            status={minting ? (mintPhase === 'uploading' ? 'current' : isAfter('uploading') ? 'done' : 'upcoming') : vrmData ? 'done' : 'upcoming'}
                            minting={minting}
                          />
                        ) : (
                          <>
                            <ProcessStep
                              step={++stepNum}
                              label="Store your VRM file"
                              detail={vrmData ? 'Already stored.' : 'Your avatar is saved permanently so it can never be lost.'}
                              status={minting ? (mintPhase === 'vrm' ? 'current' : isAfter('vrm') ? 'done' : 'upcoming') : vrmData ? 'done' : 'upcoming'}
                              minting={minting}
                            />
                            <ProcessStep
                              step={++stepNum}
                              label="Store your preview image"
                              detail="Your thumbnail image is saved alongside the avatar."
                              status={minting ? (mintPhase === 'thumbnail' ? 'current' : isAfter('thumbnail') ? 'done' : 'upcoming') : 'upcoming'}
                              minting={minting}
                            />
                            {additionalFiles.length > 0 && (
                              <ProcessStep
                                step={++stepNum}
                                label={`Store ${additionalFiles.length} additional file${additionalFiles.length > 1 ? 's' : ''}`}
                                detail="Extra models and images stored permanently."
                                status={minting ? (mintPhase === 'additional' ? 'current' : isAfter('additional') ? 'done' : 'upcoming') : 'upcoming'}
                                minting={minting}
                              />
                            )}
                          </>
                        )}
                        <ProcessStep
                          step={++stepNum}
                          label="Store NFT metadata"
                          detail="Name, description, traits, and file links \u2014 what wallets and galleries read."
                          status={minting ? (mintPhase === 'metadata' || mintPhase === 'preparing' ? 'current' : isAfter('metadata') ? 'done' : 'upcoming') : 'upcoming'}
                          minting={minting}
                        />
                        <ProcessStep
                          step={++stepNum}
                          label="Create NFT on Solana"
                          detail="Approve in Phantom \u2014 this creates the on-chain token."
                          walletPrompt
                          status={minting ? (mintPhase === 'minting' ? 'current' : isAfter('minting') ? 'done' : 'upcoming') : 'upcoming'}
                          minting={minting}
                        />
                        <ProcessStep
                          step={++stepNum}
                          label="Blockchain confirmation"
                          detail="Waiting for the Solana network to confirm your transaction."
                          status={minting ? (mintPhase === 'confirming' ? 'current' : isAfter('confirming') ? 'done' : 'upcoming') : 'upcoming'}
                          minting={minting}
                        />
                        <ProcessStep
                          step={++stepNum}
                          label="Link to collection"
                          detail="Approve in Phantom \u2014 this verifies your NFT belongs to this collection."
                          walletPrompt
                          status={minting ? (mintPhase === 'verifying' ? 'current' : mintPhase === 'success' ? 'done' : 'upcoming') : 'upcoming'}
                          minting={minting}
                        />
                      </>
                    );
                  })()}

                  {mintPhase === 'success' && (
                    <>
                      <div className="flex items-center gap-2 pt-2 text-orange-400 text-small font-medium">
                        <span aria-hidden>&#10003;</span>
                        Your NFT is ready. Redirecting&hellip;
                      </div>
                      {verifyCollectionFailed && (
                        <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-small text-amber-800 dark:text-amber-200">
                          Your NFT was minted but could not be linked to this collection (e.g. wrong network or collection address). You can see it in <strong>Dashboard &rarr; Items</strong>. Use Devnet and the collection&apos;s mint address to fix this for future mints.
                        </div>
                      )}
                    </>
                  )}
                </section>

                <section className="bg-gray-50/30 dark:bg-gray-800/15 border border-gray-200/30 dark:border-gray-700/20 p-4 space-y-2">
                  <p className="text-small text-gray-600 dark:text-gray-400 leading-relaxed">
                    Your files are stored permanently on <strong>Arweave</strong>.{' '}
                    {mintQuantity > 1 ? <><strong>{mintQuantity}</strong> NFTs are</> : <>Your <strong>NFT</strong> is</>}{' '}
                    created on <strong>Solana</strong>. Phantom will ask you to approve{' '}
                    <strong>{mintQuantity * 2} transaction{mintQuantity * 2 > 1 ? 's' : ''}</strong>
                    {mintQuantity > 1 ? ' \u2014 two per edition (create + link to collection)' : ' \u2014 one to create the token, one to link it to the collection'}.
                  </p>
                  <p className="text-caption text-gray-500 dark:text-gray-500 leading-relaxed">
                    Storage costs on Arweave vary based on total file size and current network rates. This is determined by the Arweave network and is outside our control.
                  </p>
                </section>

                {status && (
                  <div className="status-forge">
                    <div className="relative z-10 flex items-center gap-3">
                      {minting && <div className="spinner-forge flex-shrink-0" />}
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
          {mintStep === 1 ? (
            <button
              type="button"
              onClick={() => advanceFromStep(1)}
              className="btn-hero-primary w-full py-3.5 text-center"
            >
              {isGlbFile ? 'Confirm GLB' : 'Confirm VRM'}
            </button>
          ) : mintStep === 2 ? (
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
          ) : mintStep === 3 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => advanceFromStep(3)}
                className="btn-hero-primary w-full py-3.5 text-center"
              >
                Continue to Review
              </button>
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="text-small text-gray-500 hover:text-orange-400/70 dark:text-gray-400 transition-colors text-center"
              >
                Back to NFT Details
              </button>
            </div>
          ) : mintStep === 4 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => advanceFromStep(4)}
                className="btn-hero-primary w-full py-3.5 text-center"
              >
                Confirm &amp; Proceed to Mint
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
                onClick={handleMintRequest}
                disabled={minting || estimatingCost || !wallet.connected || !(vrmData || (vrmFile && vrmMetadata)) || !nftName.trim() || !thumbnailFile}
                className="btn-hero-primary w-full py-3.5 text-center disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {estimatingCost
                  ? 'Estimating storage cost\u2026'
                  : minting
                  ? mintQuantity > 1
                    ? `Minting ${mintQuantity} editions\u2026`
                    : 'Minting\u2026'
                  : !wallet.connected
                  ? 'Connect your wallet'
                  : !(vrmData || (vrmFile && vrmMetadata))
                  ? 'Select an avatar first'
                  : !nftName.trim()
                  ? 'Add a name'
                  : !thumbnailFile
                  ? 'Add a preview image'
                  : mintQuantity > 1
                  ? `Start minting ${mintQuantity} editions`
                  : 'Start minting'}
              </button>
              <button
                type="button"
                onClick={() => goToStep(4)}
                disabled={minting}
                className="text-small text-gray-500 hover:text-orange-400/70 dark:text-gray-400 transition-colors text-center disabled:opacity-50"
              >
                Back to Confirmation
              </button>
              <button
                type="button"
                onClick={handleCheckCollectionOnly}
                disabled={minting}
                className="text-caption text-gray-400/60 hover:text-orange-400/70 underline disabled:opacity-50 transition-colors"
              >
                Check collection
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Right Side: 3D Viewer ═══ */}
      <div className={`flex-1 min-w-0 bg-gray-100/10 dark:bg-black/10 relative ${fullViewport ? 'min-h-0 flex flex-col' : 'min-h-[400px] lg:min-h-0'}`}>
        {fullViewport ? (
          <div className="flex-1 min-h-0 relative">
            <VRMViewer
              url={activeViewerUrl || previewUrl!}
              height="100%"
              onLoaded={() => setOverlayExiting(true)}
              animationUrl={activeModelIndex === 0 ? '/animations/Bored.fbx' : undefined}
              tPose={tPose}
            />
            {viewerTransitionOverlay && (
              <div
                className={`absolute inset-0 flex items-center justify-center pointer-events-none bg-[var(--background)] transition-opacity duration-[650ms] ease-out z-10 ${overlayExiting ? 'opacity-0' : 'opacity-100'}`}
                aria-hidden
              >
                <div className={`flex items-center justify-center transition-all duration-[650ms] ease-out ${overlayExiting ? 'scale-150 opacity-0' : 'scale-100 opacity-100'}`}>
                  <div className="w-[min(80vmax,600px)] h-[min(80vmax,600px)] rounded-full border border-gray-300/40 dark:border-gray-600/40 absolute" />
                  <div className="w-[min(60vmax,450px)] h-[min(60vmax,450px)] rounded-full border border-gray-300/30 dark:border-gray-600/30 absolute" />
                  <div className="w-[min(40vmax,300px)] h-[min(40vmax,300px)] rounded-full border border-gray-300/20 dark:border-gray-600/20 absolute" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <VRMViewer
              url={activeViewerUrl || previewUrl!}
              height={400}
              onLoaded={() => setOverlayExiting(true)}
              animationUrl={activeModelIndex === 0 ? '/animations/Bored.fbx' : undefined}
              tPose={tPose}
            />
            {viewerTransitionOverlay && (
              <div
                className={`absolute inset-0 flex items-center justify-center pointer-events-none bg-[var(--background)] transition-opacity duration-[650ms] ease-out z-10 ${overlayExiting ? 'opacity-0' : 'opacity-100'}`}
                aria-hidden
              >
                <div className={`flex items-center justify-center transition-all duration-[650ms] ease-out ${overlayExiting ? 'scale-150 opacity-0' : 'scale-100 opacity-100'}`}>
                  <div className="w-[min(80vmax,600px)] h-[min(80vmax,600px)] rounded-full border border-gray-300/40 dark:border-gray-600/40 absolute" />
                  <div className="w-[min(60vmax,450px)] h-[min(60vmax,450px)] rounded-full border border-gray-300/30 dark:border-gray-600/30 absolute" />
                  <div className="w-[min(40vmax,300px)] h-[min(40vmax,300px)] rounded-full border border-gray-300/20 dark:border-gray-600/20 absolute" />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Floating step tabs (left edge) ── */}
        <div className="absolute left-0 top-4 flex flex-col gap-0.5 z-10">
          {stepNumbers.map((step) => {
            const isActive = mintStep === step;
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

        {/* ── Floating info badge ── */}
        {vrmMetadata && (
          <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm text-white px-3 py-2 text-caption z-10">
            {activeModelIndex === 0
              ? `${vrmMetadata.title} \u00b7 ${vrmMetadata.boneCount} bones \u00b7 ${vrmMetadata.blendShapeCount} expressions`
              : modelFiles[activeModelIndex]?.label || ''}
          </div>
        )}
      </div>

      <ImagePreview src={previewImageSrc} alt="Preview" onClose={() => setPreviewImageSrc(null)} />

      {showMintConfirm && (
        <TransactionConfirmModal
          open={true}
          {...buildMintNftTransaction({
            collectionName: collectionName || nftName,
            quantity: mintQuantity,
            storageCostSol,
          })}
          onConfirm={handleMint}
          onCancel={() => setShowMintConfirm(false)}
        />
      )}

      <TransactionProgressModal
        open={minting}
        title={mintQuantity > 1 ? `Minting ${mintQuantity} NFTs` : 'Minting NFT'}
        steps={getMintNftSteps({
          hasVrm: !!vrmData,
          additionalFileCount: additionalFiles.length,
          useLocalStorage,
        })}
        currentStepId={mintPhase || (useLocalStorage ? 'vrm' : 'funding')}
        statusMessage={status}
        error={mintError}
        errorDetails={mintErrorDetails}
        success={mintPhase === 'success'}
        successContent={
          <div className="space-y-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              {mintQuantity > 1 ? `${mintQuantity} NFTs minted successfully!` : 'Your NFT has been minted!'}
            </p>
            {verifyCollectionFailed && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Note: Collection verification failed. Your NFT was minted but may not appear linked to the collection.
              </p>
            )}
          </div>
        }
        onClose={handleProgressModalClose}
      />
    </div>
  );
}

// ── Helper components ──

function ProcessStep({
  step,
  label,
  detail,
  status,
  minting,
  walletPrompt,
}: {
  step: number;
  label: string;
  detail: string;
  status: 'done' | 'current' | 'upcoming';
  minting: boolean;
  walletPrompt?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={`flex-shrink-0 w-8 h-8 flex items-center justify-center text-small font-medium ${
          status === 'done'
            ? 'bg-orange-400/15 text-orange-400 border border-orange-400/20'
            : status === 'current'
            ? 'bg-orange-400/20 text-orange-300 border border-orange-400/30'
            : 'bg-gray-200/30 dark:bg-gray-700/20 text-gray-500 dark:text-gray-400 border border-gray-200/30 dark:border-gray-700/20'
        }`}
        style={status === 'current' ? { boxShadow: '0 0 12px rgba(251,146,60,0.2)' } : undefined}
      >
        {status === 'done' ? (
          <span aria-hidden>&#10003;</span>
        ) : status === 'current' && minting ? (
          <span className="inline-block w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" aria-hidden />
        ) : (
          step
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-small font-medium ${status === 'upcoming' ? 'text-gray-500 dark:text-gray-400' : status === 'current' ? 'text-orange-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {label}
          </p>
          {walletPrompt && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-purple-400 bg-purple-400/10 border border-purple-400/20 px-1.5 py-0.5">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="2" y="6" width="20" height="14" rx="2" />
                <path d="M16 14h.01" />
                <path d="M2 10h20" />
              </svg>
              wallet
            </span>
          )}
        </div>
        <p className="text-caption text-gray-500 dark:text-gray-400 mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

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

const MAX_DISPLAY_LEN = 48;
function truncateForDisplay(s: string): string {
  if (s.length <= MAX_DISPLAY_LEN) return s;
  return s.slice(0, MAX_DISPLAY_LEN - 3) + '\u2026';
}

function LinkableMetadataRow({ label, value }: { label: string; value: string | null | undefined }) {
  const raw = (value || '').trim();
  if (!raw) {
    return (
      <div className="flex justify-between items-baseline gap-3 text-caption">
        <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
        <span className="text-gray-900 dark:text-gray-100 text-right">&mdash;</span>
      </div>
    );
  }
  const parts = raw.split(/\s*\/\/\s*|\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  const items = parts.length ? parts : [raw];
  const isUrl = (s: string) => /^https?:\/\//i.test(s);
  const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  return (
    <div className="flex justify-between items-baseline gap-3 text-caption">
      <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0 min-w-0 text-right">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center">
            {i > 0 && <span className="text-gray-400 dark:text-gray-500 mx-0.5">&middot;</span>}
            {isUrl(item) ? (
              <a href={item} target="_blank" rel="noopener noreferrer" title={item} className="text-gray-900 dark:text-gray-100 hover:underline truncate max-w-[220px] xl:max-w-[260px]">
                {truncateForDisplay(item)}
              </a>
            ) : isEmail(item) ? (
              <a href={`mailto:${item}`} title={item} className="text-gray-900 dark:text-gray-100 hover:underline truncate max-w-[220px] xl:max-w-[260px]">
                {truncateForDisplay(item)}
              </a>
            ) : (
              <span title={item} className="text-gray-900 dark:text-gray-100 truncate max-w-[220px] xl:max-w-[260px]">
                {truncateForDisplay(item)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
