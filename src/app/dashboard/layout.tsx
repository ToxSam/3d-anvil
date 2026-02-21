import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — 3D Anvil',
  description:
    'Manage your 3D collections, drops, and minted assets on Solana.',
  openGraph: {
    title: 'Dashboard — 3D Anvil',
    description:
      'Manage your 3D collections, drops, and minted assets on Solana.',
    siteName: '3D Anvil',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dashboard — 3D Anvil',
    description:
      'Manage your 3D collections, drops, and minted assets on Solana.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
