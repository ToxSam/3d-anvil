'use client';

import { ThemeProvider } from '@/providers/ThemeProvider';
import { WalletContextProvider } from '@/providers/WalletProvider';
import { ToastProvider } from '@/components/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WalletContextProvider>
        <ToastProvider>{children}</ToastProvider>
      </WalletContextProvider>
    </ThemeProvider>
  );
}
