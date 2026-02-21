import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Discover — 3D Anvil',
  description:
    'Browse 3D NFT collections and drops on Solana.',
  openGraph: {
    title: 'Discover — 3D Anvil',
    description:
      'Browse 3D NFT collections and drops on Solana.',
    siteName: '3D Anvil',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Discover — 3D Anvil',
    description:
      'Browse 3D NFT collections and drops on Solana.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
