/**
 * Mint configuration types.
 *
 * Mint config is stored inside the collection's JSON metadata on Arweave
 * under the `mint_config` key.  This avoids any server dependency – the
 * config is read directly from the NFT's URI.
 */

/** Who can mint: anyone, or custom (token holders + allowlist). */
export type MintAccessType = 'anyone' | 'custom';

/** A single mint phase (schedule, price, limits, access). Stored in mint_phases when multiple. */
export interface MintPhaseConfig {
  price: number;
  maxSupply: number | null;
  maxPerWallet: number | null;
  startDate: string | null;
  endDate: string | null;
  /** When true, this phase is paused (no minting until resumed). */
  paused?: boolean;
  access?: MintAccessType;
  tokenHolderMints?: string[];
  allowlistAddresses?: string[];
}

export interface MintConfig {
  /** Can anyone mint from this collection? */
  isPublic: boolean;
  /** Price in SOL (0 = free mint) */
  price: number;
  /** Total supply cap (null = unlimited) */
  maxSupply: number | null;

  // ── Revenue Splits (Primary sale + royalties helper) ───────────────
  /**
   * Optional split instructions for primary mint revenue (and can also be reused
   * as creator shares for secondary royalties).
   *
   * Percentages are expected to sum to 100.
   */
  revenueSplits?: { address: string; percent: number }[];

  // ── Timing ──────────────────────────────────────────────────────────
  /** ISO date string – minting opens at this time (null = immediately) */
  startDate: string | null;
  /** ISO date string – minting closes at this time (null = no end) */
  endDate: string | null;

  // ── Limits ──────────────────────────────────────────────────────────
  /** Maximum mints per wallet (null = unlimited) */
  maxPerWallet: number | null;

  // ── Access (when access === 'custom') ─────────────────────────────────
  /** Who can mint: anyone (default) or custom (token holders and/or allowlist) */
  access?: MintAccessType;
  /** Holders of ANY of these token/NFT mints can mint */
  tokenHolderMints?: string[];
  /** Legacy single mint; migrated to tokenHolderMints when present */
  tokenHolderMint?: string;
  /** Require allowlist? (legacy; prefer access === 'custom' with allowlistAddresses) */
  requiresAllowlist: boolean;
  /** Wallet addresses on the allowlist (can be combined with token holders) */
  allowlistAddresses?: string[];

  /** When private: addresses allowed to mint (editors). Owner can always mint. */
  editors?: string[];

  /** Is this a dutch auction? */
  isDutchAuction: boolean;
  dutchAuction?: {
    startPrice: number;
    endPrice: number;
    durationHours: number;
  };

  // ── Candy Machine (Phase 1 on-chain enforcement) ───────────────────
  /** Address of the Candy Machine program account (null = legacy/pre-CM drop). */
  candyMachineAddress?: string | null;
  /** Address of the Candy Guard wrapping the CM (null = legacy). */
  candyGuardAddress?: string | null;
}

export const DEFAULT_MINT_CONFIG: MintConfig = {
  isPublic: true,
  price: 0,
  maxSupply: null,
  startDate: null,
  endDate: null,
  maxPerWallet: null,
  access: 'anyone',
  requiresAllowlist: false,
  isDutchAuction: false,
};

/**
 * Derive the current status of a mint from its configuration and stats.
 */
export type MintStatus = 'live' | 'not_started' | 'ended' | 'sold_out' | 'private';

export function getMintStatus(config: MintConfig | null, totalMinted: number): MintStatus {
  if (!config || !config.isPublic) return 'private';

  const now = new Date();

  if (config.startDate && new Date(config.startDate) > now) return 'not_started';
  if (config.endDate && new Date(config.endDate) < now) return 'ended';
  if (config.maxSupply !== null && totalMinted >= config.maxSupply) return 'sold_out';

  return 'live';
}

export function getMintStatusLabel(status: MintStatus): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'not_started':
      return 'Not Started';
    case 'ended':
      return 'Ended';
    case 'sold_out':
      return 'Sold Out';
    case 'private':
      return 'Private';
  }
}

export function getMintStatusColor(status: MintStatus): string {
  switch (status) {
    case 'live':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'not_started':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'ended':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'sold_out':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'private':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

/** Get the phase that is active at a given time (first matching by start/end, not paused). */
export function getCurrentPhaseAt(phases: MintPhaseConfig[], at: Date): MintPhaseConfig | null {
  const idx = getCurrentPhaseIndexAt(phases, at);
  return idx != null ? phases[idx] ?? null : null;
}

/** Get the index of the phase active at a given time (skips paused phases), or null if none. */
export function getCurrentPhaseIndexAt(phases: MintPhaseConfig[], at: Date): number | null {
  const t = at.getTime();
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (p.paused) continue;
    const start = p.startDate ? new Date(p.startDate).getTime() : 0;
    const end = p.endDate ? new Date(p.endDate).getTime() : Number.POSITIVE_INFINITY;
    if (t >= start && t <= end) return i;
  }
  return null;
}

/** Get the index of the phase whose time range contains `at` (ignores paused). For settings: "current phase" to act on. */
export function getPhaseInRangeIndexAt(phases: MintPhaseConfig[], at: Date): number | null {
  const t = at.getTime();
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const start = p.startDate ? new Date(p.startDate).getTime() : 0;
    const end = p.endDate ? new Date(p.endDate).getTime() : Number.POSITIVE_INFINITY;
    if (t >= start && t <= end) return i;
  }
  return null;
}

/** Turn mint_config into a single phase for editing. */
export function mintConfigToPhase(c: MintConfig): MintPhaseConfig {
  return {
    price: c.price,
    maxSupply: c.maxSupply,
    maxPerWallet: c.maxPerWallet,
    startDate: c.startDate,
    endDate: c.endDate,
    access: c.access ?? 'anyone',
    tokenHolderMints: c.tokenHolderMints?.length ? c.tokenHolderMints : undefined,
    allowlistAddresses: c.allowlistAddresses?.length ? c.allowlistAddresses : undefined,
  };
}

/** Merge phase into mint_config (preserve isPublic, dutch, revenueSplits, editors). */
export function phaseToMintConfig(phase: MintPhaseConfig, base: MintConfig): MintConfig {
  return {
    ...base,
    price: phase.price,
    maxSupply: phase.maxSupply,
    maxPerWallet: phase.maxPerWallet,
    startDate: phase.startDate,
    endDate: phase.endDate,
    access: phase.access ?? 'anyone',
    tokenHolderMints: phase.tokenHolderMints,
    allowlistAddresses: phase.allowlistAddresses,
    requiresAllowlist: (phase.allowlistAddresses?.length ?? 0) > 0,
  };
}
