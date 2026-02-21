import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create — 3D Anvil',
  description:
    'Upload GLB and VRM files, create collections, and launch 3D drops on Solana.',
  openGraph: {
    title: 'Create — 3D Anvil',
    description:
      'Upload GLB and VRM files, create collections, and launch 3D drops on Solana.',
    siteName: '3D Anvil',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Create — 3D Anvil',
    description:
      'Upload GLB and VRM files, create collections, and launch 3D drops on Solana.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
