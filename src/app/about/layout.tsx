import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About — 3D Anvil',
  description:
    'The open-source 3D minting platform on Solana. No marketplace, no middlemen — forge direct.',
  openGraph: {
    title: 'About — 3D Anvil',
    description:
      'The open-source 3D minting platform on Solana. No marketplace, no middlemen — forge direct.',
    siteName: '3D Anvil',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About — 3D Anvil',
    description:
      'The open-source 3D minting platform on Solana. No marketplace, no middlemen — forge direct.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
