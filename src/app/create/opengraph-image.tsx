import { createForgeOG, OG_SIZE } from '@/lib/og';

export const alt = 'Creator Hub — 3D Anvil';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return createForgeOG({
    title: 'Creator Hub',
    subtitle:
      'Create collections, launch drops, and manage your 3D assets on Solana.',
  });
}
