import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/Navbar';
import { ConditionalFooter } from '@/components/ConditionalFooter';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: {
    default: '3D Anvil — Forge 3D Assets on Solana',
    template: '%s',
  },
  description:
    'Mint GLB models and VRM avatars as NFTs on Solana. Create collections, upload 3D assets, and forge on-chain — zero platform costs.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: '3D Anvil — Forge 3D Assets on Solana',
    description:
      'Mint GLB models and VRM avatars as NFTs on Solana. Create collections, upload 3D assets, and forge on-chain.',
    siteName: '3D Anvil',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '3D Anvil — Forge 3D Assets on Solana',
    description:
      'Mint GLB models and VRM avatars as NFTs on Solana. Create collections, upload 3D assets, and forge on-chain.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of unstyled content for dark mode */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <Providers>
          <Navbar />
          <main className="flex-1 pt-16 md:pt-20">{children}</main>
          <ConditionalFooter />
        </Providers>
      </body>
    </html>
  );
}
