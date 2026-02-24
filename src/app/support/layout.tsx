import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support — 3D Anvil',
  description:
    'Help fund 3D Anvil. No platform fees — we run on community support. Mint the Beta Supporter Edition.',
  openGraph: {
    title: 'Support — 3D Anvil',
    description:
      'Help fund 3D Anvil. No platform fees — we run on community support. Mint the Beta Supporter Edition.',
    siteName: '3D Anvil',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Support — 3D Anvil',
    description:
      'Help fund 3D Anvil. No platform fees — we run on community support. Mint the Beta Supporter Edition.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
