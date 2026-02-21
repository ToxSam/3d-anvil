import { createForgeOG, shortenAddress, OG_SIZE } from '@/lib/og';
import { fetchOGAsset, fetchOGJson, getAssetType } from '@/lib/og-data';

export const alt = 'NFT — 3D Anvil';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const revalidate = 3600;

export default async function Image({
  params,
}: {
  params: { address: string };
}) {
  const asset = await fetchOGAsset(params.address);

  if (!asset) {
    return createForgeOG({
      label: 'NFT',
      title: shortenAddress(params.address),
      subtitle: 'View this 3D asset on 3D Anvil',
    });
  }

  const json = await fetchOGJson(asset.jsonUri);
  const assetType = getAssetType(json);

  const stats: { label: string; value: string }[] = [];
  if (assetType !== '3D Asset') stats.push({ label: 'Format', value: assetType });
  if (asset.symbol) stats.push({ label: 'Symbol', value: asset.symbol });

  const subtitle =
    [assetType, asset.description].filter(Boolean).join(' · ') ||
    undefined;

  return createForgeOG({
    label: 'NFT',
    title: asset.name || shortenAddress(params.address),
    subtitle,
    imageUrl: asset.image,
    stats: stats.length > 0 ? stats : undefined,
  });
}
