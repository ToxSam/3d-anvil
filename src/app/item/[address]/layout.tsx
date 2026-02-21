import type { Metadata } from 'next';
import { fetchOGAsset, fetchOGJson, getAssetType } from '@/lib/og-data';
import { shortenAddress } from '@/lib/og';

export async function generateMetadata({
  params,
}: {
  params: { address: string };
}): Promise<Metadata> {
  const asset = await fetchOGAsset(params.address);
  const json = asset?.jsonUri ? await fetchOGJson(asset.jsonUri) : null;

  const name = asset?.name || shortenAddress(params.address);
  const title = `${name} — 3D Anvil`;

  const assetType = getAssetType(json);
  const description = asset?.description
    ? `${assetType} · ${asset.description}`
    : `${assetType} on Solana — View on 3D Anvil`;

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
