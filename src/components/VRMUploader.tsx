'use client';

import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { parse3DModel, VRMMetadata } from '@/lib/vrmParser';
import { useMetaplex } from '@/lib/metaplex';
import { uploadFileToArweave } from '@/lib/uploadToArweave';

const IS_LOCAL = process.env.NEXT_PUBLIC_USE_LOCAL_STORAGE === 'true';

export interface VRMUploadResult {
  vrmUrl: string;
  metadata: VRMMetadata;
  fileName: string;
}

interface Props {
  onUploadComplete: (result: VRMUploadResult) => void;
  onFileSelected?: (file: File, metadata: VRMMetadata) => void;
  /** When the parent already has the file (e.g. from viewer drop), pass it so we don't ask to choose again */
  initialFile?: File | null;
  initialMetadata?: VRMMetadata | null;
  compact?: boolean;
  /** Selection only: no upload to Arweave here. Parent will handle upload on Mint tab. */
  selectionOnly?: boolean;
}

export function VRMUploader({ onUploadComplete, onFileSelected, initialFile, initialMetadata, compact, selectionOnly }: Props) {
  const wallet = useWallet();
  const metaplex = useMetaplex();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [vrmMetadata, setVrmMetadata] = useState<VRMMetadata | null>(null);
  const [progress, setProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Sync when parent already has the file (e.g. dropped on full-viewport viewer), or when it clears after mint
  useEffect(() => {
    if (initialFile && initialMetadata) {
      setFile(initialFile);
      setVrmMetadata(initialMetadata);
      setProgress('');
    } else if (initialFile === null && initialMetadata === null) {
      setFile(null);
      setVrmMetadata(null);
      setProgress('');
    }
  }, [initialFile, initialMetadata]);

  const handleFile = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    const isGlb = selectedFile.name.toLowerCase().endsWith('.glb');
    setProgress(isGlb ? 'Parsing GLB...' : 'Parsing VRM...');

    try {
      const metadata = await parse3DModel(selectedFile);
      setVrmMetadata(metadata);
      setProgress('');
      if (onFileSelected) {
        onFileSelected(selectedFile, metadata);
      }
    } catch (error) {
      console.error('Failed to parse model:', error);
      setProgress(isGlb ? 'Failed to parse GLB file' : 'Failed to parse VRM file');
      setFile(null);
    }
  }, [onFileSelected]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFile(selectedFile);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    const ext = droppedFile?.name.toLowerCase() ?? '';
    if (droppedFile && (ext.endsWith('.vrm') || ext.endsWith('.glb'))) {
      handleFile(droppedFile);
    }
  }

  async function handleUpload() {
    if (!file || !wallet.connected || selectionOnly) return;

    setUploading(true);
    setProgress(IS_LOCAL ? 'Uploading locally...' : 'Uploading to Arweave...');

    try {
      const vrmUrl = await uploadFileToArweave(metaplex, file);

      setProgress('Upload complete!');
      onUploadComplete({
        vrmUrl,
        metadata: vrmMetadata!,
        fileName: file.name,
      });
    } catch (error) {
      console.error('Upload failed:', error);
      setProgress('Upload failed: ' + (error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`upload-forge transition-colors duration-200 ${
          compact ? '!p-4' : '!p-8'
        } ${
          dragOver
            ? '!border-orange-400/50 !bg-orange-400/5'
            : ''
        }`}
      >
        {file ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <svg className="w-5 h-5 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-small text-gray-900 dark:text-gray-100 truncate">{file.name}</span>
            </div>
            <label className="text-small text-gray-500 hover:text-orange-400 cursor-pointer transition-colors flex-shrink-0 ml-2">
              Change
              <input
                type="file"
                accept=".vrm,.glb"
                onChange={handleFileSelect}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          <>
            <p className={`text-gray-500 dark:text-gray-400 ${compact ? 'text-small mb-3' : 'text-body mb-4'}`}>
              Drag & drop a .vrm or .glb file, or click to select
            </p>
            <label className="btn-hero-primary inline-block cursor-pointer py-3 px-6">
              <span>Choose File</span>
              <input
                type="file"
                accept=".vrm,.glb"
                onChange={handleFileSelect}
                disabled={uploading}
                className="hidden"
              />
            </label>
            {!selectionOnly && !wallet.connected && (
              <p className="text-small text-gray-400 mt-3">
                Connect wallet to upload
              </p>
            )}
          </>
        )}
      </div>

      {/* Parsed Metadata - only show in non-compact mode */}
      {!compact && vrmMetadata && (
        <div className="mt-6 border border-gray-200/30 dark:border-gray-700/20 p-6 bg-gray-50/30 dark:bg-gray-800/15">
          <p className="text-label mb-4">Auto-detected Metadata</p>
          <div className="grid grid-cols-2 gap-4 text-small">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Title:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">
                {vrmMetadata.title}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Author:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">
                {vrmMetadata.author || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">License:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">
                {vrmMetadata.license}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Commercial:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">
                {vrmMetadata.commercialUse}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Blend Shapes:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">
                {vrmMetadata.blendShapeCount}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Bones:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">
                {vrmMetadata.boneCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className={`${compact ? 'mt-3' : 'mt-4'} status-forge`}>
          <p className="text-small text-orange-400/90 relative z-10">
            {progress}
          </p>
        </div>
      )}

      {/* Upload Button — hidden when selectionOnly (upload happens on Mint tab) */}
      {!selectionOnly && file && vrmMetadata && !uploading && (
        <button onClick={handleUpload} className={`btn-hero-primary w-full py-3 text-center ${compact ? 'mt-4' : 'mt-6'}`}>
          {IS_LOCAL ? 'Upload (Dev Mode)' : 'Upload to Arweave'}
        </button>
      )}

      {!selectionOnly && uploading && (
        <div className={`${compact ? 'mt-4' : 'mt-6'} text-center`}>
          <div className="spinner-forge" />
        </div>
      )}
    </div>
  );
}
