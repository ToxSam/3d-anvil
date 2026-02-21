import { createForgeOG, shortenAddress, OG_SIZE } from '@/lib/og';
import {
  fetchOGAsset,
  fetchOGJson,
  getAssetType,
  getDropType,
  getDropStatus,
  getDropPrice,
} from '@/lib/og-data';

export const alt = 'Drop — 3D Anvil';
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
      label: 'DROP',
      title: shortenAddress(params.address),
      subtitle: 'View this drop on 3D Anvil',
    });
  }

  const json = await fetchOGJson(asset.jsonUri);
  const mintConfig = json?.mint_config;

  const stats: { label: string; value: string }[] = [];
  const price = getDropPrice(mintConfig);
  if (price) stats.push({ label: 'Price', value: price });

  const dropType = getDropType(mintConfig);
  if (dropType) stats.push({ label: 'Type', value: dropType });

  if (mintConfig?.maxSupply != null) {
    stats.push({ label: 'Supply', value: String(mintConfig.maxSupply) });
  }

  const assetType = getAssetType(json);
  const subtitle =
    [assetType, asset.description].filter(Boolean).join(' · ') ||
    undefined;

  return createForgeOG({
    label: 'DROP',
    title: asset.name || shortenAddress(params.address),
    subtitle,
    imageUrl: asset.image,
    stats: stats.length > 0 ? stats : undefined,
    status: getDropStatus(mintConfig) ?? undefined,
  });
}
