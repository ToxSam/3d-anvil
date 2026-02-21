'use client';

import { usePathname } from 'next/navigation';
import { Footer } from './Footer';

export function ConditionalFooter() {
  const pathname = usePathname();
  // No footer on mint flow, drop creation, drop page, or NFT item page (full-viewport, process-mint style)
  if (pathname === '/create/mint') return null;
  if (pathname === '/create-drop') return null;
  if (pathname?.startsWith('/drop/')) return null;
  if (pathname?.startsWith('/item/')) return null;
  return <Footer />;
}
