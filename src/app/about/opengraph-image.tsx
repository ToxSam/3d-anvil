import { createForgeOG, OG_SIZE } from '@/lib/og';

export const alt = 'About — 3D Anvil';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return createForgeOG({
    title: 'About 3D Anvil',
    subtitle:
      'The creator tool for 3D NFTs on Solana. No marketplace, no middlemen — forge direct.',
  });
}
