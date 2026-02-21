'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMetaplex } from '@/lib/metaplex';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletButton } from '@/components/WalletButton';
import { ShareButtons } from '@/components/ShareButtons';
import { ForgePageWrapper } from '@/components/ForgePageWrapper';
import { useToast } from '@/components/Toast';
import {
  MintConfig,
  getMintStatus,
  getMintStatusLabel,
  getMintStatusColor,
  MintStatus,
} from '@/lib/types/mintConfig';
import { getCollectionAssets } from '@/lib/das';
import { EXPLORER_URL, SOLANA_NETWORK, resolveArweaveUrl, tryFetchJsonWithIrysGateway } from '@/lib/constants';
import Link from 'next/link';
import { MintConfirmModal, type MintConfirmDetails } from '@/components/MintConfirmModal';
import { TransactionProgressModal, getPublicMintSteps } from '@/components/TransactionProgressModal';
import { parseSolanaError } from '@/lib/solanaErrors';

export default function PublicMintPage() {
  const params = useParams();
  const address = params.address as string;
  const wallet = useWallet();
  const metaplex = useMetaplex();
  const { toast } = useToast();

  const [collection, setCollection] = useState<any>(null);
  const [mintConfig, setMintConfig] = useState<MintConfig | null>(null);
  const [stats, setStats] = useState({ minted: 0, holders: 0 });
  const [userMintCount, setUserMintCount] = useState(0);
  const [minting, setMinting] = useState(false);
  const [mintConfirm, setMintConfirm] = useState<MintConfirmDetails | null>(null);
  type PublicMintPhase = '' | 'payment' | 'minting' | 'verifying' | 'success';
  const [mintPhase, setMintPhase] = useState<PublicMintPhase>('');
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintErrorDetails, setMintErrorDetails] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCollectionData = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setLoadError(null);

    try {
      // Load collection NFT
      let coll: any = null;
      try {
        coll = await metaplex.nfts().findByMint({
          mintAddress: new PublicKey(address),
        });
      } catch {
        try {
          coll = await metaplex.nfts().findByMint({
            mintAddress: new PublicKey(address),
            loadJsonMetadata: false,
          });
        } catch {
          // Collection might be expired on devnet
        }
      }

      if (coll) {
        // If JSON wasn't loaded (Irys devnet → arweave.net 404), try Irys gateway
        if (!coll.json && coll.uri) {
          const fallbackJson = await tryFetchJsonWithIrysGateway(coll.uri);
          if (fallbackJson) {
            coll = { ...coll, json: fallbackJson, jsonLoaded: true };
          }
        }

        setCollection(coll);

        // Parse mint config from metadata
        const config = coll.json?.mint_config as MintConfig | undefined;
        setMintConfig(config || null);
      } else {
        setLoadError('Collection not found on-chain.');
      }

      // Load stats via DAS
      await loadStats();

      // Load user's mint count
      if (wallet.publicKey) {
        await loadUserMintCount();
      }
    } catch (error) {
      console.error('Failed to load collection:', error);
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address, metaplex, wallet.publicKey]);

  useEffect(() => {
    loadCollectionData();
  }, [loadCollectionData]);

  async function loadStats() {
    try {
      const result = await getCollectionAssets(address);
      if (result) {
        const holders = new Set<string>();
        result.items.forEach((item) => {
          if (item.ownership?.owner) holders.add(item.ownership.owner);
        });
        setStats({
          minted: result.total || result.items.length,
          holders: holders.size,
        });
      }
    } catch (err) {
      console.warn('Failed to load stats:', err);
    }
  }

  async function loadUserMintCount() {
    if (!wallet.publicKey) return;
    try {
      const userNfts = await metaplex.nfts().findAllByOwner({
        owner: wallet.publicKey,
      });
      const collKey = new PublicKey(address);
      const inCollection = userNfts.filter(
        (nft: any) => nft.collection?.address?.equals(collKey),
      );
      setUserMintCount(inCollection.length);
    } catch {
      // Non-critical
    }
  }

  /** Calculate the current dutch auction price based on elapsed time. */
  function getCurrentPrice(): number {
    if (!mintConfig) return 0;
    if (!mintConfig.isDutchAuction || !mintConfig.dutchAuction) return mintConfig.price;

    const { startPrice, endPrice, durationHours } = mintConfig.dutchAuction;
    const startTime = mintConfig.startDate ? new Date(mintConfig.startDate).getTime() : Date.now();
    const elapsed = (Date.now() - startTime) / (1000 * 60 * 60); // hours
    const progress = Math.min(1, Math.max(0, elapsed / durationHours));
    return Math.max(endPrice, startPrice - (startPrice - endPrice) * progress);
  }

  function canMint(): { ok: boolean; reason?: string } {
    if (!mintConfig) return { ok: false, reason: 'No mint config found' };
    if (!mintConfig.isPublic) {
      // Private: only owner or editors can mint
      if (!wallet.publicKey) return { ok: false, reason: 'Connect wallet to mint' };
      const ownerAddr = (collection?.updateAuthorityAddress || collection?.updateAuthority?.address || collection?.updateAuthority)?.toString();
      const isOwner = ownerAddr && wallet.publicKey.toString() === ownerAddr;
      const isEditor = (mintConfig.editors || []).some(
        (addr) => addr.trim().toLowerCase() === wallet.publicKey!.toString().toLowerCase()
      );
      if (!isOwner && !isEditor) return { ok: false, reason: 'This collection is private. Only the owner and editors can mint.' };
    }

    const now = new Date();
    if (mintConfig.startDate && new Date(mintConfig.startDate) > now) {
      return { ok: false, reason: 'Minting has not started yet' };
    }
    if (mintConfig.endDate && new Date(mintConfig.endDate) < now) {
      return { ok: false, reason: 'Minting has ended' };
    }
    if (mintConfig.maxSupply !== null && stats.minted >= mintConfig.maxSupply) {
      return { ok: false, reason: 'Max supply reached' };
    }
    if (mintConfig.maxPerWallet !== null && userMintCount >= mintConfig.maxPerWallet) {
      return { ok: false, reason: `Wallet limit reached (${mintConfig.maxPerWallet} max)` };
    }

    // Check allowlist
    if (mintConfig.requiresAllowlist && mintConfig.allowlistAddresses) {
      if (!wallet.publicKey) return { ok: false, reason: 'Connect wallet to verify allowlist' };
      const walletAddr = wallet.publicKey.toString();
      if (!mintConfig.allowlistAddresses.includes(walletAddr)) {
        return { ok: false, reason: 'Your wallet is not on the allowlist' };
      }
    }

    return { ok: true };
  }

  function handleMintRequest() {
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
      toast('Please connect your wallet first', 'warning');
      return;
    }
    if (!mintConfig || !collection) return;

    const { ok, reason } = canMint();
    if (!ok) {
      toast(reason || 'Cannot mint', 'error');
      return;
    }

    const price = getCurrentPrice();
    setMintConfirm({
      collectionName: collection.name || 'This Collection',
      price,
    });
  }

  async function executeMint() {
    setMintConfirm(null);
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) return;
    if (!mintConfig || !collection) return;

    setMinting(true);
    setMintError(null);
    const actualPrice = getCurrentPrice();
    const isFree = actualPrice === 0;

    try {
      // If there's a price, send SOL to the collection creator first
      if (!isFree) {
        setMintPhase('payment');

        const creatorAddress =
          collection.updateAuthorityAddress ||
          collection.updateAuthority?.address ||
          collection.updateAuthority;

        if (creatorAddress) {
          const creatorKey =
            creatorAddress instanceof PublicKey
              ? creatorAddress
              : new PublicKey(creatorAddress.toString());

          const connection = metaplex.connection;
          const { blockhash } = await connection.getLatestBlockhash();
          const totalLamports = Math.round(actualPrice * LAMPORTS_PER_SOL);

          let payoutSplits: { address: PublicKey; percent: number }[] | null = null;
          if (mintConfig.revenueSplits && Array.isArray(mintConfig.revenueSplits) && mintConfig.revenueSplits.length > 0) {
            try {
              const cleaned = mintConfig.revenueSplits.map((s) => ({
                address: new PublicKey((s.address || '').trim()),
                percent: (() => {
                  const raw = (s as unknown as { percent?: unknown }).percent;
                  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
                  return Math.round(Number(raw) || 0);
                })(),
              }));
              const totalPct = cleaned.reduce((sum, s) => sum + s.percent, 0);
              if (totalPct === 100 && cleaned.every((s) => s.percent >= 0 && s.percent <= 100)) {
                payoutSplits = cleaned;
              }
            } catch {
              // fall back to sending to creatorKey
            }
          }

          if (!payoutSplits) {
            payoutSplits = [{ address: creatorKey, percent: 100 }];
          }

          const baseAllocations = payoutSplits.map((s) => Math.floor((totalLamports * s.percent) / 100));
          const allocated = baseAllocations.reduce((sum, v) => sum + v, 0);
          const remainder = totalLamports - allocated;
          if (baseAllocations.length > 0) baseAllocations[0] += remainder;

          const tx = new Transaction({
            recentBlockhash: blockhash,
            feePayer: wallet.publicKey,
          });
          payoutSplits.forEach((s, i) => {
            const lamports = baseAllocations[i] || 0;
            if (lamports <= 0) return;
            tx.add(
              SystemProgram.transfer({
                fromPubkey: wallet.publicKey!,
                toPubkey: s.address,
                lamports,
              }),
            );
          });

          const signed = await wallet.signTransaction(tx);
          await connection.sendRawTransaction(signed.serialize());
        }
      }

      // Mint the NFT
      setMintPhase('minting');

      let royaltyCreators: { address: PublicKey; share: number }[] | undefined;
      if (mintConfig.revenueSplits && Array.isArray(mintConfig.revenueSplits) && mintConfig.revenueSplits.length > 0) {
        try {
          const cleaned = mintConfig.revenueSplits.map((s) => ({
            address: new PublicKey((s.address || '').trim()),
            share: (() => {
              const raw = (s as unknown as { percent?: unknown }).percent;
              if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
              return Math.round(Number(raw) || 0);
            })(),
          }));
          const total = cleaned.reduce((sum, c) => sum + c.share, 0);
          if (total === 100 && cleaned.every((c) => c.share >= 0 && c.share <= 100)) {
            royaltyCreators = cleaned;
          }
        } catch {
          // ignore
        }
      }

      const { nft } = await metaplex.nfts().create({
        uri: collection.uri,
        name: `${collection.name} #${stats.minted + 1}`,
        symbol: collection.symbol || '',
        sellerFeeBasisPoints: collection.sellerFeeBasisPoints || 500,
        collection: new PublicKey(address),
        ...(royaltyCreators ? { creators: royaltyCreators } : {}),
      });

      // Verify collection membership
      setMintPhase('verifying');
      try {
        await metaplex.nfts().verifyCollection({
          mintAddress: nft.address,
          collectionMintAddress: new PublicKey(address),
        });
      } catch (verifyErr) {
        console.warn('Collection verification failed (may need authority):', verifyErr);
      }

      setMintPhase('success');
      toast('NFT minted successfully!', 'success');
      await loadCollectionData();
    } catch (error) {
      console.error('Mint failed:', error);
      const parsed = parseSolanaError(error);
      setMintError(parsed.friendly);
      setMintErrorDetails(parsed.raw);
    }
  }

  function handleMintProgressClose() {
    setMinting(false);
    setMintPhase('');
    setMintError(null);
    setMintErrorDetails(null);
  }

  const status: MintStatus = getMintStatus(mintConfig, stats.minted);
  const statusLabel = getMintStatusLabel(status);
  const statusColor = getMintStatusColor(status);

  // Current price (respects dutch auction)
  const currentPrice = getCurrentPrice();
  const isDutch = mintConfig?.isDutchAuction && mintConfig?.dutchAuction;

  // Display data
  const displayName = collection?.name || 'Collection';
  const displayDescription = collection?.json?.description || '';
  const displayImage = resolveArweaveUrl(collection?.json?.image);
  const displaySymbol = collection?.symbol || '';

  if (loading) {
    return (
      <ForgePageWrapper embers={12}>
        <div className="container-custom section-padding text-center">
          <div className="spinner-forge mx-auto" />
          <p className="text-body text-gray-500 dark:text-gray-400 mt-4 animate-fade-in">
            Loading mint page...
          </p>
        </div>
      </ForgePageWrapper>
    );
  }

  if (!collection) {
    return (
      <ForgePageWrapper embers={12}>
        <div className="container-custom section-padding text-center animate-slide-up">
          <h1 className="text-headline font-bold text-gray-900 dark:text-gray-100">
            Collection not found
          </h1>
          <p className="text-body text-gray-500 dark:text-gray-400 mt-2">
            {loadError || 'The collection at this address could not be loaded.'}
          </p>
          <Link href="/" className="btn-hero-primary inline-block mt-8 py-3 px-8">
            Back to Home
          </Link>
        </div>
      </ForgePageWrapper>
    );
  }

  return (
    <ForgePageWrapper embers={24} showHeat>
      <div className="container-custom py-8 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
          {/* Left: Preview */}
          <div className="animate-slide-up">
            {/* Image */}
            <div className="aspect-square bg-gray-100/50 dark:bg-gray-900/50 rounded-lg overflow-hidden border border-gray-200/30 dark:border-gray-700/20 mb-6">
              {displayImage ? (
                <img
                  src={displayImage}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="stat-forge !p-3 text-center">
                <p className="text-caption text-gray-500 dark:text-gray-400">Minted</p>
                <p className="text-xl font-bold font-mono text-gray-900 dark:text-gray-100">
                  {stats.minted}
                  {mintConfig?.maxSupply !== null && mintConfig?.maxSupply !== undefined && (
                    <span className="text-gray-400 text-sm"> / {mintConfig.maxSupply}</span>
                  )}
                </p>
              </div>

              <div className="stat-forge !p-3 text-center">
                <p className="text-caption text-gray-500 dark:text-gray-400">Holders</p>
                <p className="text-xl font-bold font-mono text-gray-900 dark:text-gray-100">
                  {stats.holders}
                </p>
              </div>

              <div className="stat-forge !p-3 text-center">
                <p className="text-caption text-gray-500 dark:text-gray-400">
                  {isDutch ? 'Current Price' : 'Price'}
                </p>
                <p className="text-xl font-bold font-mono text-orange-400">
                  {currentPrice === 0 ? 'FREE' : `${currentPrice.toFixed(2)} SOL`}
                </p>
                {isDutch && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                    Dutch Auction
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right: Mint Form */}
          <div className="animate-slide-up animation-delay-100">
            {/* Symbol */}
            {displaySymbol && (
              <p className="text-caption uppercase tracking-widest text-orange-400/70 mb-1.5 font-mono">
                {displaySymbol}
              </p>
            )}

            <h1 className="text-display font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-3">
              {displayName}
            </h1>

            {displayDescription && (
              <p className="text-body-lg text-gray-600 dark:text-gray-400 mb-6">
                {displayDescription}
              </p>
            )}

            {/* Status Badge */}
            <div className="mb-6 flex flex-wrap gap-2">
              <span
                className={`inline-block px-3 py-1 rounded-full text-caption font-bold border ${statusColor}`}
              >
                {statusLabel}
              </span>
              {isDutch && (
                <span className="inline-block px-3 py-1 rounded-full text-caption font-bold border bg-purple-500/20 text-purple-400 border-purple-500/30">
                  Dutch Auction
                </span>
              )}
              {mintConfig?.requiresAllowlist && (
                <span className="inline-block px-3 py-1 rounded-full text-caption font-bold border bg-blue-500/20 text-blue-400 border-blue-500/30">
                  Allowlist Only
                </span>
              )}
            </div>

            {/* Dutch Auction Info */}
            {isDutch && mintConfig?.dutchAuction && (
              <div className="mb-4 p-3 bg-purple-400/5 border border-purple-400/20 rounded-lg">
                <p className="text-caption text-purple-400 font-bold mb-1">Dutch Auction</p>
                <p className="text-caption text-gray-500 dark:text-gray-400">
                  Price drops from{' '}
                  <span className="text-gray-900 dark:text-gray-100 font-bold">
                    {mintConfig.dutchAuction.startPrice} SOL
                  </span>{' '}
                  to{' '}
                  <span className="text-gray-900 dark:text-gray-100 font-bold">
                    {mintConfig.dutchAuction.endPrice} SOL
                  </span>{' '}
                  over {mintConfig.dutchAuction.durationHours}h. Current:{' '}
                  <span className="text-orange-400 font-bold">{currentPrice.toFixed(2)} SOL</span>
                </p>
              </div>
            )}

            {/* Mint Schedule */}
            {mintConfig?.startDate && (
              <p className="text-caption text-gray-500 dark:text-gray-400 mb-1">
                Starts: {new Date(mintConfig.startDate).toLocaleString()}
              </p>
            )}
            {mintConfig?.endDate && (
              <p className="text-caption text-gray-500 dark:text-gray-400 mb-4">
                Ends: {new Date(mintConfig.endDate).toLocaleString()}
              </p>
            )}

            {/* User's mint count */}
            {wallet.connected && mintConfig?.maxPerWallet !== null && mintConfig?.maxPerWallet !== undefined && (
              <p className="text-caption text-gray-500 dark:text-gray-400 mb-4">
                Your mints: {userMintCount} / {mintConfig.maxPerWallet}
              </p>
            )}

            {/* Mint Button */}
            {status === 'live' ? (
              <div className="space-y-3">
                {wallet.connected ? (
                  <button
                    onClick={handleMintRequest}
                    disabled={minting || !canMint().ok}
                    className="btn-hero-primary w-full py-4 text-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {minting
                      ? 'Minting...'
                      : currentPrice === 0
                        ? 'Mint for Free'
                        : `Mint for ${currentPrice.toFixed(2)} SOL`}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="w-full">
                      <WalletButton />
                    </div>
                    <p className="text-caption text-amber-600 dark:text-amber-400 text-center">
                      Connect your wallet to mint
                    </p>
                  </div>
                )}

                {!canMint().ok && wallet.connected && (
                  <p className="text-caption text-red-500 dark:text-red-400 text-center">
                    {canMint().reason}
                  </p>
                )}
              </div>
            ) : (
              <div className="w-full bg-gray-100 dark:bg-gray-800/50 border border-gray-200/30 dark:border-gray-700/20 text-gray-500 dark:text-gray-400 font-bold px-8 py-4 rounded-lg text-center">
                Minting {statusLabel}
              </div>
            )}

            <div className="divider-forge mt-6 mb-4" />

            {/* Share + Links */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <ShareButtons
                url={typeof window !== 'undefined' ? window.location.href : ''}
                title={displayName}
                description={displayDescription}
              />
              <div className="flex gap-2">
                <a
                  href={`${EXPLORER_URL}/address/${address}?cluster=${SOLANA_NETWORK}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption text-gray-400 hover:text-orange-400 transition-colors"
                >
                  Explorer
                </a>
                <Link
                  href={`/collection/${address}`}
                  className="text-caption text-gray-400 hover:text-orange-400 transition-colors"
                >
                  Collection
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      {mintConfirm && (
        <MintConfirmModal
          open={true}
          details={mintConfirm}
          onConfirm={executeMint}
          onCancel={() => setMintConfirm(null)}
        />
      )}

      <TransactionProgressModal
        open={minting}
        title="Minting NFT"
        steps={getPublicMintSteps({ isFree: getCurrentPrice() === 0 })}
        currentStepId={mintPhase || 'minting'}
        statusMessage={
          mintPhase === 'payment' ? 'Sending payment\u2026 Approve in your wallet.' :
          mintPhase === 'minting' ? 'Creating your NFT on Solana\u2026 Approve in your wallet.' :
          mintPhase === 'verifying' ? 'Verifying collection membership\u2026' :
          undefined
        }
        error={mintError}
        errorDetails={mintErrorDetails}
        success={mintPhase === 'success'}
        successContent={
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            Your NFT has been minted successfully!
          </p>
        }
        onClose={handleMintProgressClose}
      />
    </ForgePageWrapper>
  );
}
