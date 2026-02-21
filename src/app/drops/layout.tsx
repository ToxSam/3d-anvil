import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Drops — 3D Anvil',
  description:
    'Explore live and upcoming 3D NFT drops on Solana.',
  openGraph: {
    title: 'Drops — 3D Anvil',
    description:
      'Explore live and upcoming 3D NFT drops on Solana.',
    siteName: '3D Anvil',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Drops — 3D Anvil',
    description:
      'Explore live and upcoming 3D NFT drops on Solana.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
