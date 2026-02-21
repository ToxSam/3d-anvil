'use client';

import { useToast } from '@/components/Toast';

interface Props {
  url: string;
  title: string;
  description?: string;
}

export function ShareButtons({ url, title }: Props) {
  const { toast } = useToast();

  const shareOnTwitter = () => {
    const text = `Check out ${title} on 3D Anvil!`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank',
    );
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied to clipboard!', 'success');
    } catch {
      toast('Failed to copy link', 'error');
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={shareOnTwitter}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-caption rounded-md bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/30 dark:border-gray-700/20 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300/50 dark:hover:border-gray-600/40 transition-colors"
      >
        {/* X / Twitter icon */}
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share
      </button>

      <button
        onClick={copyLink}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-caption rounded-md bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/30 dark:border-gray-700/20 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300/50 dark:hover:border-gray-600/40 transition-colors"
      >
        {/* Copy icon — two overlapping documents */}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Copy Link
      </button>
    </div>
  );
}
