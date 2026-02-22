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
                : 'Using Solana Mainnet. Make sure your wallet is set to Mainnet.'
            }
          >
            {SOLANA_NETWORK === 'devnet' ? 'Devnet' : 'Mainnet-Beta🧪'}
          </span>
          <a
            href="https://github.com/ToxSam/3d-anvil"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="3D Anvil on GitHub"
            className="hidden md:flex w-9 h-9 items-center justify-center rounded text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/50 dark:hover:bg-gray-700/30 transition-colors duration-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>
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
            <a
              href="https://github.com/ToxSam/3d-anvil"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 py-3 text-sm uppercase tracking-wider border-l-2 pl-4 -ml-px border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-400 dark:hover:border-gray-500 transition-colors duration-200"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              GitHub
            </a>
            <div className="pt-4 mt-2 border-t border-gray-200 dark:border-gray-700">
              <WalletButton />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
