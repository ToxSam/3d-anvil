import { createForgeOG, OG_SIZE } from '@/lib/og';

export const alt = 'Dashboard — 3D Anvil';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return createForgeOG({
    title: 'Dashboard',
    subtitle:
      'Your collections, drops, and minted assets — all in one place.',
  });
}
