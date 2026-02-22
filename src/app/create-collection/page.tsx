'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMetaplex } from '@/lib/metaplex';
import { useToast } from '@/components/Toast';
import { uploadFileToArweave, uploadMetadataToArweave } from '@/lib/uploadToArweave';
import { registerLaunchpadCollection } from '@/lib/registerLaunchpadCollection';
import { WalletButton } from '@/components/WalletButton';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import { MintConfig, DEFAULT_MINT_CONFIG } from '@/lib/types/mintConfig';
import { ForgeNumberInput } from '@/components/ForgeNumberInput';
import { TransactionConfirmModal, buildCreateCollectionTransaction } from '@/components/TransactionConfirmModal';
import { TransactionProgressModal, getCreateCollectionSteps } from '@/components/TransactionProgressModal';
import { checkSolBalance, estimateCollectionRent, createNftWalletFirst } from '@/lib/transactionUtils';
import {
  COLLECTION_TYPES,
  COLLECTION_SCHEMAS,
} from '@/lib/constants';

export default function CreateCollectionPage() {
  const wallet = useWallet();
  const metaplex = useMetaplex();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    description: '',
    collectionType: COLLECTION_TYPES.VRM_AVATARS as string,
    image: null as File | null,
    royaltyPercent: 5,
  });

  /** Private by default; when true, anyone can mint via public mint page */
  const [isPublicMinting, setIsPublicMinting] = useState(false);
  /** When private: wallet addresses that can mint (in addition to owner) */
  const [editors, setEditors] = useState<string[]>([]);
  const [editorInput, setEditorInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [status, setStatus] = useState('');
  const [createdCollection, setCreatedCollection] = useState<any>(null);
  const [collectionPhase, setCollectionPhase] = useState('uploading-image');
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addEditor = () => {
    const addr = editorInput.trim();
    if (!addr) return;
    if (addr.length < 32 || addr.length > 48) return;
    if (!editors.includes(addr)) {
      setEditors([...editors, addr]);
      setEditorInput('');
    }
  };

  const removeEditor = (addr: string) => {
    setEditors(editors.filter((a) => a !== addr));
  };

  function handleImageFile(file: File) {
    if (file && file.type.startsWith('image/')) {
      setFormData({ ...formData, image: file });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  /** Mint config stored in metadata (private by default, with optional editors) */
  const mintConfig: MintConfig = {
    ...DEFAULT_MINT_CONFIG,
    isPublic: isPublicMinting,
    editors: isPublicMinting ? undefined : editors,
  };

  function handleCreateCollectionRequest(e: React.FormEvent) {
    e.preventDefault();

    if (
      !wallet.connected ||
      !formData.name ||
      !formData.symbol ||
      !formData.image
    ) {
      toast('Please fill in all required fields and connect your wallet.', 'warning');
      return;
    }

    setShowCreateConfirm(true);
  }

  async function handleCreateCollection() {
    setShowCreateConfirm(false);
    if (!wallet.connected || !formData.name || !formData.symbol || !formData.image) return;

    setCreating(true);
    setCollectionError(null);
    setCollectionPhase('uploading-image');

    try {
      setStatus('Uploading collection image to Arweave...');
      setCollectionPhase('uploading-image');
      const imageUrl = await uploadFileToArweave(metaplex, formData.image);

      const schema =
        COLLECTION_SCHEMAS[
          formData.collectionType as keyof typeof COLLECTION_SCHEMAS
        ];

      const metadata: Record<string, unknown> = {
        name: formData.name,
        symbol: formData.symbol,
        description: formData.description,
        image: imageUrl,
        properties: {
          category: 'vr',
          collection_type: formData.collectionType,
          metadata_schema: schema,
        },
        mint_config: mintConfig,
      };

      setStatus('Storing metadata on Arweave...');
      setCollectionPhase('uploading-metadata');
      const metadataUrl = await uploadMetadataToArweave(metaplex, metadata);

      setStatus('Checking wallet balance...');
      const { rentSol } = estimateCollectionRent();
      const { sufficient, balance } = await checkSolBalance(
        metaplex.connection,
        wallet.publicKey!,
        rentSol,
      );
      if (!sufficient) {
        throw new Error(
          `Insufficient SOL. Creating a collection requires ~${rentSol} SOL for account rent, but your wallet only has ${balance.toFixed(4)} SOL.`,
        );
      }

      setStatus('Creating collection on Solana — approve in your wallet...');
      setCollectionPhase('creating-onchain');
      const { mintAddress: collectionMintPk, signature: createSig } =
        await createNftWalletFirst(
          metaplex,
          { publicKey: wallet.publicKey!, signTransaction: wallet.signTransaction! },
          {
            uri: metadataUrl,
            name: formData.name,
            symbol: formData.symbol,
            sellerFeeBasisPoints: Math.round(formData.royaltyPercent * 100),
            isCollection: true,
          },
        );

      setStatus('Confirming transaction on blockchain...');
      setCollectionPhase('confirming');

      setStatus('Registering collection...');
      setCollectionPhase('registering');
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

      const collectionNft = await metaplex.nfts().findByMint({
        mintAddress: collectionMintPk,
      });

      setCollectionPhase('success');
      setStatus('');
      setCreatedCollection(collectionNft);

      const message = isPublicMinting
        ? 'Collection created with public minting enabled!'
        : 'Collection created! You and editors can mint from the collection page.';
      toast(message, 'success');
    } catch (error) {
      console.error('Failed:', error);
      const msg = (error as Error).message || 'Unknown error';
      setCollectionError(msg);
      setStatus('');
      toast('Failed: ' + msg, 'error', 8000);
    }
  }

  function handleProgressClose() {
    setCreating(false);
    setCollectionError(null);
    setCollectionPhase('uploading-image');
  }

  if (!wallet.connected) {
    return (
      <ForgePageWrapper embers={16}>
        <div className="container-custom section-padding">
          <div className="max-w-lg mx-auto text-center py-20">
            <p className="text-label mb-4 animate-fade-in">New Collection</p>
            <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4 animate-slide-up">
              Connect your wallet
            </h1>
            <p className="text-body-lg text-gray-500 dark:text-gray-400 mb-8 animate-slide-up animation-delay-100">
              Connect your Solana wallet to create a collection.
            </p>
            <div className="inline-block animate-slide-up animation-delay-200">
              <WalletButton />
            </div>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  // ── Post-creation success screen ─────────────────────────────────────
  if (createdCollection) {
    const collAddr = createdCollection.address.toString();
    return (
      <ForgePageWrapper embers={20}>
        <div className="container-custom section-padding">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10 animate-slide-up">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-2">
                Collection Created!
              </h1>
              <p className="text-body text-gray-500 dark:text-gray-400 mb-1">
                {createdCollection.name}
              </p>
              <p className="text-caption text-gray-400 font-mono">{collAddr}</p>

              {isPublicMinting && (
                <div className="mt-4 p-3 bg-orange-400/5 border border-orange-400/20 rounded-lg inline-block">
                  <p className="text-caption text-orange-400 font-bold">
                    Public minting is enabled. Set price and options in collection settings.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-3 animate-slide-up animation-delay-100">
              <Link
                href={`/collection/${collAddr}`}
                className="btn-hero-primary w-full py-4 text-center block"
              >
                Go to Collection
              </Link>
              {isPublicMinting && (
                <Link
                  href={`/mint/${collAddr}`}
                  className="block w-full text-center btn-ghost py-3"
                >
                  View Public Mint Page
                </Link>
              )}
              <Link
                href="/dashboard"
                className="block w-full text-center text-caption text-gray-400 hover:text-orange-400 transition-colors mt-2"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </ForgePageWrapper>
    );
  }

  return (
    <ForgePageWrapper embers={20}>
      <div className="container-custom section-padding">
        <div className="max-w-2xl mx-auto">
          <Link href="/create" className="back-link-forge mb-8 animate-fade-in">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Creator&apos;s Hub
          </Link>

          <p className="text-label mb-4 animate-fade-in">New Collection</p>
          <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-4 animate-slide-up">
            Create Collection
          </h1>
          <p className="text-body-lg text-gray-500 dark:text-gray-400 mb-12 animate-slide-up animation-delay-100">
            Set up a new on-chain collection for your 3D assets. You can
            enable public minting or keep it private and add editors who can mint.
          </p>

          <form onSubmit={handleCreateCollectionRequest} className="space-y-8 animate-slide-up animation-delay-200">
            {/* ── Collection Details & Access ─────────────────────────── */}
            <div className="p-5 bg-gray-50/50 dark:bg-gray-800/20 rounded-lg border border-gray-200/30 dark:border-gray-700/20">
              <h2 className="text-body-lg font-bold text-gray-900 dark:text-gray-100 mb-6">
                Collection Details
              </h2>

              <div className="space-y-6">
                {/* Name */}
                <div>
                  <label className="text-label block mb-2">Collection Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value.slice(0, 32) })
                    }
                    placeholder="My VRM Collection"
                    className="input-forge"
                    maxLength={32}
                    required
                  />
                  {formData.name.length >= 28 && (
                    <p className="mt-1 text-xs text-gray-400">{formData.name.length}/32</p>
                  )}
                </div>

                {/* Symbol */}
                <div>
                  <label className="text-label block mb-2">Symbol * (3-10 chars)</label>
                  <input
                    type="text"
                    value={formData.symbol}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        symbol: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="VRM"
                    maxLength={10}
                    className="input-forge"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-label block mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Describe your collection..."
                    rows={4}
                    className="input-forge"
                  />
                </div>

                {/* Collection Type */}
                <div>
                  <label className="text-label block mb-2">Collection Type *</label>
                  <select
                    value={formData.collectionType}
                    onChange={(e) =>
                      setFormData({ ...formData, collectionType: e.target.value })
                    }
                    className="input-forge"
                  >
                    <option value={COLLECTION_TYPES.VRM_AVATARS}>VRM Avatars</option>
                    <option value={COLLECTION_TYPES.GLB_WEARABLES}>
                      GLB Wearables
                    </option>
                    <option value={COLLECTION_TYPES.CUSTOM}>Custom</option>
                  </select>
                </div>

                {/* Royalties */}
                <div>
                  <label className="text-label block mb-2">Default Royalties</label>
                  <p className="text-caption text-gray-500 dark:text-gray-400 mb-3">
                    The percentage you earn on every secondary sale.
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.5}
                      value={formData.royaltyPercent}
                      onChange={(e) =>
                        setFormData({ ...formData, royaltyPercent: parseFloat(e.target.value) })
                      }
                      className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(251,146,60,0.4)]"
                    />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <ForgeNumberInput
                        containerClassName="w-16"
                        inputClassName="text-center !px-2 !py-1.5 text-small"
                        min={0}
                        max={100}
                        step={0.5}
                        value={formData.royaltyPercent}
                        onValueChange={(v) => {
                          const val = parseFloat(v);
                          if (!isNaN(val)) setFormData({ ...formData, royaltyPercent: Math.max(0, Math.min(100, val)) });
                        }}
                      />
                      <span className="text-small text-gray-500 dark:text-gray-400">%</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {[0, 2.5, 5, 7.5, 10].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setFormData({ ...formData, royaltyPercent: preset })}
                        className={`chip-forge ${
                          formData.royaltyPercent === preset
                            ? 'chip-forge-active'
                            : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Image */}
                <div>
                  <label className="text-label block mb-2">Collection Image *</label>
                  <div
                    className={`upload-forge transition-all duration-200 ${
                      isDragging
                        ? 'border-orange-400 bg-orange-400/5 ring-2 ring-orange-400/20'
                        : ''
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                  >
                    {formData.image ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-3">
                          <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 6.75v11.25c0 1.24 1.007 2.25 2.25 2.25z" />
                          </svg>
                          <p className="text-small text-gray-600 dark:text-gray-300">
                            {formData.image.name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({ ...formData, image: null })
                          }
                          className="text-small text-gray-400 hover:text-orange-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block py-4">
                        {isDragging ? (
                          <>
                            <svg className="w-8 h-8 mx-auto mb-3 text-orange-400 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                            </svg>
                            <span className="text-body text-orange-400 font-medium">
                              Drop your image here
                            </span>
                          </>
                        ) : (
                          <>
                            <svg className="w-8 h-8 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                            <span className="text-body text-gray-500">
                              Drag & drop or click to upload
                            </span>
                            <p className="text-caption text-gray-400 mt-1">PNG, JPG, GIF, WebP</p>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageFile(file);
                          }}
                          className="hidden"
                          required
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* ── Access: Enable public minting (private by default) ── */}
                <div className="pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
                  <p className="text-label block mb-2">Access</p>
                  <p className="text-caption text-gray-500 dark:text-gray-400 mb-4">
                    Control who can mint. Private by default; only you and editors can mint. Enable public minting to allow anyone to mint (you can set price and options in collection settings after).
                  </p>
                  <div className="flex gap-4">
                    <label className="flex items-start gap-3 p-4 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-800/30 cursor-pointer hover:border-orange-400/30 flex-1">
                      <input
                        type="radio"
                        name="access"
                        checked={!isPublicMinting}
                        onChange={() => setIsPublicMinting(false)}
                        className="mt-1 text-orange-400"
                      />
                      <div>
                        <p className="font-bold text-gray-900 dark:text-gray-100">Private</p>
                        <p className="text-caption text-gray-500 dark:text-gray-400 mt-0.5">
                          Only you and editors you add can mint. No public mint page.
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-4 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-800/30 cursor-pointer hover:border-orange-400/30 flex-1">
                      <input
                        type="radio"
                        name="access"
                        checked={isPublicMinting}
                        onChange={() => setIsPublicMinting(true)}
                        className="mt-1 text-orange-400"
                      />
                      <div>
                        <p className="font-bold text-gray-900 dark:text-gray-100">Enable public minting</p>
                        <p className="text-caption text-gray-500 dark:text-gray-400 mt-0.5">
                          Anyone can mint via the public mint page. Configure price and options in collection settings after creation.
                        </p>
                      </div>
                    </label>
                  </div>

                  {!isPublicMinting && (
                    <div className="mt-4 ml-4 pl-4 border-l-2 border-orange-400/30 space-y-3">
                      <p className="text-label font-medium text-gray-900 dark:text-gray-100">
                        Editors
                      </p>
                      <p className="text-caption text-gray-500 dark:text-gray-400">
                        Add wallet addresses that can mint from this collection (in addition to you).
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editorInput}
                          onChange={(e) => setEditorInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEditor())}
                          placeholder="Paste Solana wallet address..."
                          className="input-forge flex-1 font-mono text-small"
                        />
                        <button
                          type="button"
                          onClick={addEditor}
                          className="btn-ghost !py-2 !px-4"
                        >
                          Add Editor
                        </button>
                      </div>
                      {editors.length > 0 && (
                        <ul className="space-y-2 mt-3">
                          {editors.map((addr) => (
                            <li
                              key={addr}
                              className="flex items-center justify-between gap-2 p-2 rounded bg-gray-900/5 dark:bg-gray-800/30 font-mono text-small"
                            >
                              <span className="truncate text-gray-900 dark:text-gray-100">
                                {addr.slice(0, 8)}...{addr.slice(-8)}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeEditor(addr)}
                                className="text-red-500 hover:text-red-400 text-caption"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Status */}
            {status && (
              <div className="status-forge">
                <div className="relative z-10 flex items-center gap-3">
                  <div className="spinner-forge" />
                  <p className="text-small text-orange-400/90">
                    {status}
                  </p>
                </div>
              </div>
            )}

            {/* ── Submit ─────────────────────────────────────────────── */}
            <div>
              <button
                type="submit"
                disabled={creating || !wallet.connected}
                className="btn-hero-primary w-full disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none py-4 text-center"
              >
                {!wallet.connected
                  ? 'Connect Wallet First'
                  : creating
                  ? 'Forging...'
                  : 'Create Collection'}
              </button>
            </div>
          </form>
        </div>
      </div>
      {showCreateConfirm && (
        <TransactionConfirmModal
          open={true}
          {...buildCreateCollectionTransaction({ collectionName: formData.name })}
          onConfirm={handleCreateCollection}
          onCancel={() => setShowCreateConfirm(false)}
        />
      )}

      <TransactionProgressModal
        open={creating}
        title="Creating Collection"
        steps={getCreateCollectionSteps()}
        currentStepId={collectionPhase}
        statusMessage={status}
        error={collectionError}
        success={collectionPhase === 'success'}
        onClose={handleProgressClose}
      />
    </ForgePageWrapper>
  );
}
