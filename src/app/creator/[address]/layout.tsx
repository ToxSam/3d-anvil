import type { Metadata } from 'next';
import { shortenAddress } from '@/lib/og';

export async function generateMetadata({
  params,
}: {
  params: { address: string };
}): Promise<Metadata> {
  const addr = shortenAddress(params.address);
  const title = `Creator ${addr} — 3D Anvil`;
  const description = `Explore 3D drops and collections by ${addr} on 3D Anvil.`;

  return {
    title,
    description,
    openGraph: { title, description, siteName: '3D Anvil' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
