'use client';

import { useEffect, useCallback } from 'react';

interface ImagePreviewProps {
  /** Image src (data URI or URL). When null/undefined, nothing is rendered. */
  src: string | null | undefined;
  alt?: string;
  onClose: () => void;
}

/**
 * Full-screen image preview (lightbox). Use anywhere you want click-to-zoom on images.
 * - Click outside the image or the X button to close.
 * - Escape key also closes.
 */
export function ImagePreview({ src, alt = 'Preview', onClose }: ImagePreviewProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!src) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [src, handleKeyDown]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative max-h-full max-w-full">
        <img
          src={src}
          alt={alt}
          className="max-h-[90vh] max-w-full object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 shadow-lg transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          aria-label="Close preview"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
