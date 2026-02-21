import type { Metadata } from 'next';
import {
  fetchOGAsset,
  fetchOGJson,
  getAssetType,
  getDropType,
  getDropPrice,
  getDropStatus,
} from '@/lib/og-data';
import { shortenAddress } from '@/lib/og';

export async function generateMetadata({
  params,
}: {
  params: { address: string };
}): Promise<Metadata> {
  const asset = await fetchOGAsset(params.address);
  const json = asset?.jsonUri ? await fetchOGJson(asset.jsonUri) : null;
  const mintConfig = json?.mint_config;

  const name = asset?.name || shortenAddress(params.address);
  const title = `${name} — 3D Anvil`;

  const parts: string[] = [];
  const assetType = getAssetType(json);
  if (assetType) parts.push(assetType);
  const dropType = getDropType(mintConfig);
  if (dropType) parts.push(dropType);
  const price = getDropPrice(mintConfig);
  if (price) parts.push(price);
  const status = getDropStatus(mintConfig);
  if (status) parts.push(status.text);

  const description =
    parts.length > 0
      ? `${parts.join(' · ')} — Forge on 3D Anvil`
      : `View this drop on 3D Anvil`;

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
