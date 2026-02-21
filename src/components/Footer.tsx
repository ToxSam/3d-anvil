import { SolanaIcon } from '@/components/SolanaIcon';

export function Footer() {
  return (
    <footer className="border-t border-gray-300 dark:border-gray-700">
      <div className="container-custom py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-small text-gray-500 dark:text-gray-400">
            3D Anvil — Forge 3D assets on Solana
          </p>
          <div className="flex items-center gap-6">
            <a
              href="https://solana.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-small text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 link-hover transition-colors inline-flex items-center gap-1.5"
            >
              <SolanaIcon size={14} />
              Solana
            </a>
            <a
              href="https://www.metaplex.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-small text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 link-hover transition-colors"
            >
              Metaplex
            </a>
            <a
              href="https://arweave.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-small text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 link-hover transition-colors"
            >
              Arweave
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
