import { createForgeOG, shortenAddress, OG_SIZE } from '@/lib/og';

export const alt = 'Creator — 3D Anvil';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({
  params,
}: {
  params: { address: string };
}) {
  return createForgeOG({
    label: 'CREATOR',
    title: shortenAddress(params.address),
    subtitle: 'Explore collections and drops by this creator on 3D Anvil.',
  });
}
