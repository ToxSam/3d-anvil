'use client';

import dynamic from 'next/dynamic';

// Lazy-load to prevent hydration mismatch (wallet adapter renders differently on server vs client)
const WalletMultiButton = dynamic(
  async () => {
    const { WalletMultiButton } = await import(
      '@solana/wallet-adapter-react-ui'
    );
    return { default: WalletMultiButton };
  },
  { ssr: false }
);

export function WalletButton() {
  return <WalletMultiButton className="wallet-adapter-button-trigger" />;
}
