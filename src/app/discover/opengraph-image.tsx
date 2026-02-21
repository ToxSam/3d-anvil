import { createForgeOG, OG_SIZE } from '@/lib/og';

export const alt = 'Discover — 3D Anvil';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return createForgeOG({
    title: 'Discover',
    subtitle: 'Explore 3D collections and drops forged on Solana.',
  });
}
