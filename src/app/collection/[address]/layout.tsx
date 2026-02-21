import type { Metadata } from 'next';
import { fetchOGAsset, fetchCollectionItemCount } from '@/lib/og-data';
import { shortenAddress } from '@/lib/og';

export async function generateMetadata({
  params,
}: {
  params: { address: string };
}): Promise<Metadata> {
  const [asset, itemCount] = await Promise.all([
    fetchOGAsset(params.address),
    fetchCollectionItemCount(params.address),
  ]);

  const name = asset?.name || shortenAddress(params.address);
  const title = `${name} — 3D Anvil`;

  const parts: string[] = [];
  if (itemCount !== null) parts.push(`${itemCount} items`);
  if (asset?.symbol) parts.push(asset.symbol);

  const description = parts.length > 0
    ? `${parts.join(' · ')} — Explore on 3D Anvil`
    : `Explore this collection on 3D Anvil`;

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
