'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletButton } from './WalletButton';
import { SOLANA_NETWORK } from '@/lib/constants';

const baseLinks = [
  { href: '/', label: 'Home' },
  { href: '/create', label: 'Create' },
  { href: '/about', label: 'About' },
];

export function Navbar() {
  const pathname = usePathname();
  const wallet = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = useMemo(() => {
    if (wallet.connected) {
      return [
        ...baseLinks,
        { href: '/dashboard', label: 'Dashboard' },
      ];
    }
    return baseLinks;
  }, [wallet.connected]);

  const isActive = (href: string) =>
    pathname === href ||
    (href === '/create' && pathname.startsWith('/create')) ||
    (href === '/about' && pathname.startsWith('/about'));

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--background)]/98 dark:bg-[#0d0c0a]/98 backdrop-blur-md border-b border-gray-300/50 dark:border-gray-700/50">
      <div className="container-custom flex items-center justify-between h-16 md:h-20">
        {/* Logo - SVG + "3D ANVIL" text */}
        <Link
          href="/"
          className="flex items-center gap-3 transition-opacity duration-200 hover:opacity-80 focus:outline-none"
          aria-label="3D Anvil Home"
        >
          <img
            src="/3d-anvil-logo.svg"
            alt=""
            className="h-9 w-auto object-contain"
            width={1408}
            height={736}
          />
          <span className="flex flex-col leading-none gap-0 -space-y-2">
            <span
              className="text-xs font-extrabold uppercase tracking-tight text-orange-500 dark:text-orange-400 block"
              style={{
                textShadow:
                  '-1px -1px 0 rgba(255,255,255,0.25), 1px 1px 0 rgba(0,0,0,0.2)',
                letterSpacing: '-0.03em',
              }}
            >
              3D
            </span>
            <span
              className="text-lg font-extrabold uppercase tracking-tight text-gray-900 dark:text-white"
              style={{ letterSpacing: '-0.03em' }}
            >
              ANVIL
            </span>
          </span>
        </Link>

        {/* Desktop Nav - forge tab styling */}
        <div className="hidden md:flex items-center h-full">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`tab-forge h-full flex items-center ${
                isActive(link.href) ? 'tab-forge-active' : 'tab-forge-inactive'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-2">
          <span
            className="hidden sm:inline-flex items-center px-2.5 py-1 rounded text-caption font-medium uppercase tracking-wider border border-amber-200 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
            title={
              SOLANA_NETWORK === 'devnet'
                ? 'Using Solana Devnet. Switch your wallet (e.g. Phantom) to Devnet to match.'
                : `Solana ${SOLANA_NETWORK}`
            }
          >
            {SOLANA_NETWORK === 'devnet' ? 'Devnet' : SOLANA_NETWORK}
          </span>
          <div className="hidden md:block">
            <WalletButton />
          </div>

          {/* Mobile Hamburger - forge accent when open */}
          <button
            className="md:hidden w-10 h-10 flex flex-col items-center justify-center gap-1.5 rounded transition-colors duration-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/30 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span
              className={`w-5 h-[1.5px] transition-all duration-200 ${
                mobileOpen
                  ? 'rotate-45 translate-y-[4.5px] bg-orange-500 dark:bg-orange-400'
                  : 'bg-gray-900 dark:bg-gray-100'
              }`}
            />
            <span
              className={`w-5 h-[1.5px] bg-gray-900 dark:bg-gray-100 transition-opacity duration-200 ${
                mobileOpen ? 'opacity-0' : ''
              }`}
            />
            <span
              className={`w-5 h-[1.5px] transition-all duration-200 ${
                mobileOpen
                  ? '-rotate-45 -translate-y-[4.5px] bg-orange-500 dark:bg-orange-400'
                  : 'bg-gray-900 dark:bg-gray-100'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mobile Menu - same design tokens and forge styling */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-300/50 dark:border-gray-700/50 bg-[var(--background)]/98 dark:bg-[#0d0c0a]/98 backdrop-blur-md">
          <div className="container-custom py-6 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block py-3 text-sm uppercase tracking-wider border-l-2 pl-4 -ml-px transition-colors duration-200 ${
                  isActive(link.href)
                    ? 'text-orange-500 dark:text-orange-400 font-medium border-orange-500 dark:border-orange-400'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4 mt-2 border-t border-gray-200 dark:border-gray-700">
              <WalletButton />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
