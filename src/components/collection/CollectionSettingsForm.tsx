'use client';

import { useState, useRef, useEffect } from 'react';
import { MintConfig, DEFAULT_MINT_CONFIG } from '@/lib/types/mintConfig';
import { ForgeNumberInput } from '@/components/ForgeNumberInput';

export interface CollectionSettingsData {
  /** Collection status: public (anyone can mint) or private (owner + editors only) */
  isPublic: boolean;
  /** When private: addresses that can mint */
  editors: string[];
  /** Royalties 0-100 */
  royaltyPercent: number;
  /** Current image URL - if newImageFile is set, this will be replaced */
  imageUrl?: string;
  /** New thumbnail file to upload */
  newImageFile?: File | null;
}

interface Props {
  /** Initial mint config (for isPublic, editors) */
  initialMintConfig?: MintConfig | null;
  /** Current royalty (sellerFeeBasisPoints, 0-10000) */
  initialRoyaltyBps?: number;
  /** Current image URL */
  initialImageUrl?: string;
  onSave: (data: CollectionSettingsData, mintConfig: MintConfig) => void | Promise<void>;
  /** Called when form has changes */
  onFormChange?: (hasChanges: boolean) => void;
  saving?: boolean;
}

export function CollectionSettingsForm({
  initialMintConfig,
  initialRoyaltyBps = 500,
  initialImageUrl,
  onSave,
  onFormChange,
  saving,
}: Props) {
  const [isPublic, setIsPublic] = useState(initialMintConfig?.isPublic ?? false);
  const [editors, setEditors] = useState<string[]>(initialMintConfig?.editors ?? []);
  const [editorInput, setEditorInput] = useState('');
  const [royaltyPercent, setRoyaltyPercent] = useState(
    initialRoyaltyBps != null ? initialRoyaltyBps / 100 : 5
  );
  const [imageUrl, setImageUrl] = useState(initialImageUrl ?? '');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Track changes
  useEffect(() => {
    if (!onFormChange) return;

    const hasChanges =
      isPublic !== (initialMintConfig?.isPublic ?? false) ||
      JSON.stringify(editors.sort()) !== JSON.stringify((initialMintConfig?.editors ?? []).sort()) ||
      royaltyPercent !== (initialRoyaltyBps != null ? initialRoyaltyBps / 100 : 5) ||
      newImageFile !== null;

    onFormChange(hasChanges);
  }, [isPublic, editors, royaltyPercent, newImageFile, initialMintConfig, initialRoyaltyBps, onFormChange]);

  const addEditor = () => {
    const addr = editorInput.trim();
    if (!addr) return;
    // Basic validation - Solana addresses are typically 32-44 chars
    if (addr.length < 32 || addr.length > 48) return;
    if (!editors.includes(addr)) {
      setEditors([...editors, addr]);
      setEditorInput('');
    }
  };

  const removeEditor = (addr: string) => {
    setEditors(editors.filter((a) => a !== addr));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewImageFile(file);
      const reader = new FileReader();
      reader.onload = () => setImageUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const clearThumbnailChange = () => {
    setNewImageFile(null);
    setImageUrl(initialImageUrl ?? '');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleSubmit = () => {
    const mintConfig: MintConfig = {
      ...DEFAULT_MINT_CONFIG,
      ...(initialMintConfig || {}),
      isPublic,
      editors: isPublic ? undefined : editors,
    };
    onSave(
      {
        isPublic,
        editors: isPublic ? [] : editors,
        royaltyPercent,
        imageUrl: newImageFile ? imageUrl : initialImageUrl,
        newImageFile: newImageFile || undefined,
      },
      mintConfig
    );
  };

  const displayImage = imageUrl || initialImageUrl;

  return (
    <div className="space-y-10">
      {/* ── 1. Access: Collection Status ───────────────────────────────────────── */}
      <section>
        <div className="mb-5">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Access Control
          </h3>
          <p className="text-body text-gray-600 dark:text-gray-400">
            Control who can mint from this collection.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <label className={`flex items-start gap-3 p-5 border cursor-pointer transition-all duration-300 ${isPublic ? 'border-orange-400/50 bg-orange-400/5' : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-800/20 hover:border-orange-400/30'}`}>
              <input
                type="radio"
                name="status"
                checked={isPublic}
                onChange={() => setIsPublic(true)}
                className="mt-1 text-orange-400 accent-orange-400"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-bold text-gray-900 dark:text-gray-100">Public</p>
                </div>
                <p className="text-small text-gray-600 dark:text-gray-400">
                  Anyone with a Solana wallet can mint via the public mint page.
                </p>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-5 border cursor-pointer transition-all duration-300 ${!isPublic ? 'border-orange-400/50 bg-orange-400/5' : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-800/20 hover:border-orange-400/30'}`}>
              <input
                type="radio"
                name="status"
                checked={!isPublic}
                onChange={() => setIsPublic(false)}
                className="mt-1 text-orange-400 accent-orange-400"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="font-bold text-gray-900 dark:text-gray-100">Private</p>
                </div>
                <p className="text-small text-gray-600 dark:text-gray-400">
                  Only you and authorized editors can mint. No public access.
                </p>
              </div>
            </label>
          </div>

          {!isPublic && (
            <div className="p-5 border-l-2 border-orange-400/30 bg-gray-50/30 dark:bg-gray-800/20 space-y-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-body font-semibold text-gray-900 dark:text-gray-100">
                  Authorized Editors
                </p>
              </div>
              <p className="text-small text-gray-600 dark:text-gray-400">
                Add wallet addresses that can mint from this collection. Only these addresses and you can mint when the collection is private.
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
                  className="btn-hero-primary !py-2 !px-5 !text-small whitespace-nowrap"
                >
                  + Add
                </button>
              </div>
              {editors.length > 0 && (
                <ul className="space-y-2">
                  {editors.map((addr) => (
                    <li
                      key={addr}
                      className="flex items-center justify-between gap-3 p-3 bg-white/50 dark:bg-gray-900/30 border border-gray-200/30 dark:border-gray-700/30 font-mono text-small"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="truncate text-gray-900 dark:text-gray-100">
                          {addr.slice(0, 8)}...{addr.slice(-8)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEditor(addr)}
                        className="text-small text-red-500 hover:text-red-400 transition-colors flex-shrink-0 font-sans"
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
      </section>

      <div className="divider-forge" />

      {/* ── 2. Royalties ──────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-5">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Creator Royalties
          </h3>
          <p className="text-body text-gray-600 dark:text-gray-400">
            Percentage you earn on secondary sales. Most creators use 2.5%–10%.
          </p>
        </div>
        <div className="p-5 bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/30 dark:to-gray-900/20 border border-gray-200/30 dark:border-gray-700/30">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <ForgeNumberInput
                containerClassName="w-28"
                min={0}
                max={100}
                step={0.5}
                value={royaltyPercent}
                onValueChange={(v) =>
                  setRoyaltyPercent(Math.max(0, Math.min(100, parseFloat(v) || 0)))
                }
              />
              <span className="text-xl font-bold text-gray-700 dark:text-gray-300">%</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="text-small text-gray-500 dark:text-gray-400 mr-1">Quick select:</span>
              {[0, 2.5, 5, 10].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setRoyaltyPercent(p)}
                  className={`chip-forge ${royaltyPercent === p ? 'chip-forge-active' : ''}`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 text-small text-gray-600 dark:text-gray-400">
            <svg className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Royalties are paid on secondary market sales to support your continued work.</span>
          </div>
        </div>
      </section>

      <div className="divider-forge" />

      {/* ── 3. Collection Metadata ────────────────────────────────────────────── */}
      <section>
        <div className="mb-5">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Collection Thumbnail
          </h3>
          <p className="text-body text-gray-600 dark:text-gray-400">
            Update the collection image displayed on marketplaces and galleries.
          </p>
        </div>
        <div className="flex items-start gap-6 p-5 bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/30 dark:to-gray-900/20 border border-gray-200/30 dark:border-gray-700/30">
          <div className="w-32 h-32 overflow-hidden bg-gray-100 dark:bg-gray-800 border-2 border-gray-200/50 dark:border-gray-700/50 flex-shrink-0">
            {displayImage ? (
              <img
                src={displayImage}
                alt="Collection thumbnail"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 flex-1">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="btn-hero-primary !py-3 !px-5 inline-flex items-center gap-2 w-fit"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload New Image
            </button>
            {newImageFile && (
              <button
                type="button"
                onClick={clearThumbnailChange}
                className="text-small text-orange-400 hover:text-orange-300 transition-colors w-fit"
              >
                ← Revert to original
              </button>
            )}
            <p className="text-small text-gray-500 dark:text-gray-400">
              Recommended: Square image, at least 512×512px, PNG or JPG format
            </p>
          </div>
        </div>
      </section>

      <div className="divider-forge" />

      {/* ── Save Button ───────────────────────────────────────────────────────── */}
      <div className="pt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="btn-hero-primary w-full disabled:opacity-40 disabled:cursor-not-allowed py-4 text-base font-bold"
        >
          {saving ? (
            <span className="inline-flex items-center gap-3">
              <div className="spinner-forge" />
              Saving to Blockchain...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Save Changes
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
