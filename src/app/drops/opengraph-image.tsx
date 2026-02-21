import { createForgeOG, OG_SIZE } from '@/lib/og';

export const alt = 'Drops — 3D Anvil';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return createForgeOG({
    title: 'Drops',
    subtitle: 'Live and upcoming 3D asset drops on Solana.',
  });
}
