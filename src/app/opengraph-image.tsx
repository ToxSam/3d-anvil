import { createForgeOG, OG_SIZE } from '@/lib/og';

export const alt = '3D Anvil — Forge 3D Assets on Solana';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return createForgeOG({
    title: 'Forge 3D Assets\nOn Solana',
    subtitle:
      'Mint GLB models and VRM avatars as NFTs. Create collections, launch drops, and forge on-chain.',
  });
}
