import { createForgeOG, shortenAddress, OG_SIZE } from '@/lib/og';
import { fetchOGAsset, fetchCollectionItemCount } from '@/lib/og-data';

export const alt = 'Collection — 3D Anvil';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const revalidate = 3600;

export default async function Image({
  params,
}: {
  params: { address: string };
}) {
  const [asset, itemCount] = await Promise.all([
    fetchOGAsset(params.address),
    fetchCollectionItemCount(params.address),
  ]);

  if (!asset) {
    return createForgeOG({
      label: 'COLLECTION',
      title: shortenAddress(params.address),
      subtitle: 'View this collection on 3D Anvil',
    });
  }

  const stats: { label: string; value: string }[] = [];
  if (itemCount !== null) {
    stats.push({ label: 'Items', value: String(itemCount) });
  }
  if (asset.symbol) {
    stats.push({ label: 'Symbol', value: asset.symbol });
  }

  return createForgeOG({
    label: 'COLLECTION',
    title: asset.name || shortenAddress(params.address),
    subtitle: asset.description,
    imageUrl: asset.image,
    stats: stats.length > 0 ? stats : undefined,
  });
}
