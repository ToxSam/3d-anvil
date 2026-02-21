'use client';

import {
  generateSigner,
  publicKey,
  sol,
  some,
  none,
  transactionBuilder,
  type Umi,
  type PublicKey as UmiPublicKey,
} from '@metaplex-foundation/umi';
import {
  create,
  mintV2,
  fetchCandyMachine,
  safeFetchCandyMachine,
  fetchCandyGuard,
  safeFetchCandyGuard,
  updateCandyGuard,
  getMerkleRoot,
  getMerkleProof,
  route,
  type DefaultGuardSetArgs,
  type DefaultGuardSetMintArgs,
  type CandyMachine,
  type CandyGuard,
} from '@metaplex-foundation/mpl-candy-machine';
import { TokenStandard } from '@metaplex-foundation/mpl-token-metadata';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';

import type { MintConfig, MintPhaseConfig } from './types/mintConfig';

// ── Helpers ──────────────────────────────────────────────────────────────────

const RPC_POLL_DELAY_MS = 1500;
const RPC_POLL_MAX_ATTEMPTS = 6;

async function fetchCandyMachineWithRetry(
  umi: Umi,
  address: UmiPublicKey,
): Promise<CandyMachine> {
  for (let attempt = 0; attempt < RPC_POLL_MAX_ATTEMPTS; attempt++) {
    const cm = await safeFetchCandyMachine(umi, address);
    if (cm) return cm;
    if (attempt < RPC_POLL_MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, RPC_POLL_DELAY_MS));
    }
  }
  return fetchCandyMachine(umi, address);
}

async function fetchCandyGuardWithRetry(
  umi: Umi,
  address: UmiPublicKey,
): Promise<CandyGuard> {
  for (let attempt = 0; attempt < RPC_POLL_MAX_ATTEMPTS; attempt++) {
    const guard = await safeFetchCandyGuard(umi, address);
    if (guard) return guard;
    if (attempt < RPC_POLL_MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, RPC_POLL_DELAY_MS));
    }
  }
  return fetchCandyGuard(umi, address);
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ITEMS_AVAILABLE = 100_000;
const MINT_COMPUTE_UNITS = 800_000;

/**
 * Number of discrete price steps for Dutch auctions (excluding the floor).
 * Total guard groups = DUTCH_AUCTION_STEPS + 1 (floor group).
 * Kept low to fit within Solana transaction size limits (~1232 bytes).
 */
export const DUTCH_AUCTION_STEPS = 4;

// Candy Machine v3 on-chain field limits
const CM_MAX_NAME_LENGTH = 32;
const CM_MAX_URI_LENGTH = 200;
const CM_MAX_SYMBOL_LENGTH = 10;
const CM_MAX_CREATORS = 4; // CM address occupies slot #0, leaving 4 for user-specified
const CM_MAX_SELLER_FEE_BPS = 10_000;
const CM_MAX_GROUP_LABEL_BYTES = 6;
const CM_HIDDEN_SETTINGS_SUFFIX = ' #$ID+1$'; // 9 chars appended to name

// ── Pre-flight validation ────────────────────────────────────────────────────

export interface DropValidationError {
  field: string;
  message: string;
}

/**
 * Validate all values that will be sent to the Candy Machine program BEFORE
 * any Arweave uploads or on-chain transactions.  Returns an empty array when
 * everything is within limits.
 */
export function validateDropConfig(params: {
  collectionName: string;
  collectionSymbol: string;
  sellerFeeBasisPoints: number;
  creators: { address: string; share: number }[];
  mintConfig: MintConfig;
  phases?: MintPhaseConfig[];
}): DropValidationError[] {
  const errors: DropValidationError[] = [];
  const { collectionName, collectionSymbol, sellerFeeBasisPoints, creators, mintConfig, phases } = params;

  // Hidden settings name: collectionName + suffix must fit in 32 chars
  const hiddenName = `${collectionName}${CM_HIDDEN_SETTINGS_SUFFIX}`;
  if (hiddenName.length > CM_MAX_NAME_LENGTH) {
    const maxNameInput = CM_MAX_NAME_LENGTH - CM_HIDDEN_SETTINGS_SUFFIX.length;
    errors.push({
      field: 'collectionName',
      message: `Collection name is too long. Max ${maxNameInput} characters (yours is ${collectionName.length}). The suffix "${CM_HIDDEN_SETTINGS_SUFFIX}" is appended automatically.`,
    });
  }

  // Symbol
  if (collectionSymbol.length > CM_MAX_SYMBOL_LENGTH) {
    errors.push({
      field: 'collectionSymbol',
      message: `Symbol must be ${CM_MAX_SYMBOL_LENGTH} characters or less (yours is ${collectionSymbol.length}).`,
    });
  }

  // Seller fee basis points
  if (sellerFeeBasisPoints < 0 || sellerFeeBasisPoints > CM_MAX_SELLER_FEE_BPS) {
    errors.push({
      field: 'sellerFeeBasisPoints',
      message: `Royalty must be between 0% and 100% (${CM_MAX_SELLER_FEE_BPS} basis points).`,
    });
  }

  // Creators: max count (CM takes slot #0)
  if (creators.length > CM_MAX_CREATORS) {
    errors.push({
      field: 'creators',
      message: `Maximum ${CM_MAX_CREATORS} creators allowed (the Candy Machine address occupies one slot). You have ${creators.length}.`,
    });
  }

  // Creators: shares must sum to 100
  if (creators.length > 0) {
    const totalShares = creators.reduce((sum, c) => sum + c.share, 0);
    if (totalShares !== 100) {
      errors.push({
        field: 'creators',
        message: `Creator shares must sum to 100% (currently ${totalShares}%).`,
      });
    }

    // Validate addresses are valid base58 public keys
    for (const c of creators) {
      try {
        publicKey(c.address);
      } catch {
        errors.push({
          field: 'creators',
          message: `Invalid creator address: "${c.address.slice(0, 12)}…"`,
        });
      }
    }
  }

  // Items available
  const itemsAvailable = mintConfig.maxSupply ?? DEFAULT_ITEMS_AVAILABLE;
  if (itemsAvailable <= 0) {
    errors.push({
      field: 'maxSupply',
      message: 'Max supply must be greater than 0.',
    });
  }

  // Guard group labels — check labels won't exceed 6 bytes
  const groupLabels = computeGroupLabels(mintConfig, phases);
  for (const label of groupLabels) {
    if (new TextEncoder().encode(label).length > CM_MAX_GROUP_LABEL_BYTES) {
      errors.push({
        field: 'phases',
        message: `Guard group label "${label}" exceeds ${CM_MAX_GROUP_LABEL_BYTES}-byte limit. Reduce the number of phases or token gates.`,
      });
    }
  }

  // Token gate addresses must be valid
  const tokenMints = getTokenHolderMints(mintConfig);
  for (const mint of tokenMints) {
    try {
      publicKey(mint);
    } catch {
      errors.push({
        field: 'tokenHolderMints',
        message: `Invalid token mint address: "${mint.slice(0, 12)}…"`,
      });
    }
  }

  // Allowlist addresses must be valid when present
  const allowlistAddrs = mintConfig.allowlistAddresses?.filter(Boolean) ?? [];
  for (const addr of allowlistAddrs) {
    try {
      publicKey(addr);
    } catch {
      errors.push({
        field: 'allowlistAddresses',
        message: `Invalid allowlist address: "${addr.slice(0, 12)}…"`,
      });
    }
  }

  // Dutch auction sanity
  if (mintConfig.isDutchAuction && mintConfig.dutchAuction) {
    const { startPrice, endPrice, durationHours } = mintConfig.dutchAuction;
    if (startPrice <= endPrice) {
      errors.push({
        field: 'dutchAuction',
        message: 'Dutch auction start price must be higher than end price.',
      });
    }
    if (durationHours <= 0) {
      errors.push({
        field: 'dutchAuction',
        message: 'Dutch auction duration must be greater than 0 hours.',
      });
    }
    if (!mintConfig.startDate) {
      errors.push({
        field: 'dutchAuction',
        message: 'Dutch auction requires a start date.',
      });
    }
  }

  return errors;
}

/**
 * Compute the guard group labels that would be generated, without actually
 * building guard objects (which would require a Umi instance).
 */
function computeGroupLabels(mintConfig: MintConfig, phases?: MintPhaseConfig[]): string[] {
  if (!needsGroups(mintConfig, phases)) return [];

  if (mintConfig.isDutchAuction && mintConfig.dutchAuction) {
    return Array.from({ length: DUTCH_AUCTION_STEPS + 1 }, (_, i) => `da${i}`);
  }

  const labels: string[] = [];

  if (phases && phases.length > 0) {
    for (let pi = 0; pi < phases.length; pi++) {
      const phase = phases[pi];
      const tokens = getTokenHolderMints(phase);
      const isCustomAccess = phase.access === 'custom' || tokens.length > 0;

      if (tokens.length > 1) {
        for (let ti = 0; ti < tokens.length; ti++) {
          labels.push(`p${pi}-t${ti}`);
        }
      } else {
        labels.push(`p${pi}`);
      }

      if (tokens.length > 0 && !isCustomAccess) {
        labels.push(`p${pi}-pub`);
      }
    }
  } else {
    const tokens = getTokenHolderMints(mintConfig);
    for (let ti = 0; ti < tokens.length; ti++) {
      labels.push(`t${ti}`);
    }
    if (mintConfig.access !== 'custom') {
      labels.push('pub');
    }
  }

  return labels;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateCandyMachineParams {
  collectionMintAddress: string;
  collectionName: string;
  collectionUri: string;
  collectionSymbol: string;
  sellerFeeBasisPoints: number;
  creators: { address: string; share: number }[];
  mintConfig: MintConfig;
  phases?: MintPhaseConfig[];
}

export interface CandyMachineState {
  address: string;
  itemsAvailable: number;
  itemsRedeemed: number;
  authority: string;
  collectionMint: string;
  candyGuardAddress: string | null;
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createDropCandyMachine(
  umi: Umi,
  params: CreateCandyMachineParams,
  onProgress?: (phase: 'created' | 'guards') => void,
): Promise<{ candyMachineAddress: string; candyGuardAddress: string }> {
  const {
    collectionMintAddress,
    collectionName,
    collectionUri,
    collectionSymbol,
    sellerFeeBasisPoints,
    creators,
    mintConfig,
    phases,
  } = params;

  const candyMachineSigner = generateSigner(umi);
  const itemsAvailable = mintConfig.maxSupply ?? DEFAULT_ITEMS_AVAILABLE;

  const umiCreators = creators.map((c) => ({
    address: publicKey(c.address),
    verified: false,
    percentageShare: c.share,
  }));
  if (umiCreators.length === 0) {
    umiCreators.push({
      address: umi.identity.publicKey,
      verified: false,
      percentageShare: 100,
    });
  }

  const hash = computeHiddenSettingsHash(collectionUri);

  const guards = buildGuards(umi, mintConfig, phases);
  const groups = buildGuardGroups(umi, mintConfig, phases);

  // When there are many guard groups (e.g. Dutch auction), packing
  // everything into the create tx exceeds the 1232-byte limit.
  // Split: create with empty guards first, then update the guard separately.
  const hasGroups = groups.length > 0;

  const builder = await create(umi, {
    candyMachine: candyMachineSigner,
    collectionMint: publicKey(collectionMintAddress),
    collectionUpdateAuthority: umi.identity,
    tokenStandard: TokenStandard.NonFungible,
    sellerFeeBasisPoints: { basisPoints: BigInt(sellerFeeBasisPoints), identifier: '%', decimals: 2 },
    itemsAvailable,
    isMutable: true,
    symbol: collectionSymbol || 'DROP',
    creators: umiCreators,
    hiddenSettings: some({
      name: `${collectionName.slice(0, CM_MAX_NAME_LENGTH - CM_HIDDEN_SETTINGS_SUFFIX.length)}${CM_HIDDEN_SETTINGS_SUFFIX}`,
      uri: collectionUri.slice(0, CM_MAX_URI_LENGTH),
      hash,
    }),
    guards: hasGroups ? emptyGuards() : guards,
  });

  await builder.sendAndConfirm(umi);

  const cmAddress = candyMachineSigner.publicKey.toString();
  const cm = await fetchCandyMachineWithRetry(umi, candyMachineSigner.publicKey);
  const guardAddress = cm.mintAuthority.toString();

  if (hasGroups) {
    onProgress?.('guards');
    const guardUpdateBuilder = updateCandyGuard(umi, {
      candyGuard: cm.mintAuthority,
      guards,
      groups,
    });
    await guardUpdateBuilder.sendAndConfirm(umi);
  }

  return {
    candyMachineAddress: cmAddress,
    candyGuardAddress: guardAddress,
  };
}

// ── Mint ─────────────────────────────────────────────────────────────────────

export interface MintFromCMParams {
  candyMachineAddress: string;
  /**
   * Which group to mint from. When null, the library picks the best group
   * based on the guard configuration. Pass explicitly to override.
   */
  group?: string | null;
  /** If the CM has an allowList guard, provide the full list so we can compute the proof. */
  allowlistAddresses?: string[];
  /** Active phase index (0-based) when using phased minting. */
  phaseIndex?: number | null;
  /** Token mints the user holds — used to auto-select the correct token-gated group. */
  userTokenMints?: string[];
  /**
   * Optional UTF-8 memo text attached to the mint transaction via the Solana Memo Program.
   * Appears in block explorers and some wallets (e.g. Phantom's transaction details).
   * Example: "Minting My Collection #1 — 0.5 SOL"
   */
  memo?: string;
}

// Solana Memo Program — adds human-readable text visible in explorers and some wallets
const MEMO_PROGRAM_ID = publicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export async function mintFromCandyMachine(
  umi: Umi,
  params: MintFromCMParams,
): Promise<{ mintAddress: string }> {
  const { candyMachineAddress, allowlistAddresses, phaseIndex, userTokenMints, memo } = params;
  const cmPubkey = publicKey(candyMachineAddress);

  const cm = await fetchCandyMachineWithRetry(umi, cmPubkey);
  const candyGuard = await fetchCandyGuardWithRetry(umi, cm.mintAuthority);

  // Resolve the best group for this minter
  const resolvedGroup = params.group !== undefined
    ? params.group
    : resolveGroupForMinter(candyGuard, phaseIndex ?? null, userTokenMints ?? []);

  if (allowlistAddresses && allowlistAddresses.length > 0) {
    await proveAllowlist(umi, cm, candyGuard, allowlistAddresses, resolvedGroup ?? null);
  }

  const nftMint = generateSigner(umi);

  const mintArgs = buildMintArgs(umi, candyGuard, resolvedGroup ?? null, allowlistAddresses);

  let builder = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: MINT_COMPUTE_UNITS }))
    .add(
      mintV2(umi, {
        candyMachine: cm.publicKey,
        nftMint,
        collectionMint: cm.collectionMint,
        collectionUpdateAuthority: cm.authority,
        mintArgs,
        group: resolvedGroup ? some(resolvedGroup) : none(),
        candyGuard: candyGuard.publicKey,
      }),
    );

  // Attach memo so Phantom's transaction details (and explorers) show a human-readable label.
  // Umi's UmiInstruction uses `keys` (not `accounts`) for the account list.
  if (memo) {
    builder = builder.add({
      instruction: {
        programId: MEMO_PROGRAM_ID,
        keys: [],
        data: new TextEncoder().encode(memo),
      },
      signers: [],
      bytesCreatedOnChain: 0,
    });
  }

  await builder.sendAndConfirm(umi);

  return { mintAddress: nftMint.publicKey.toString() };
}

// ── Update guards ────────────────────────────────────────────────────────────

export async function updateDropGuards(
  umi: Umi,
  candyMachineAddress: string,
  mintConfig: MintConfig,
  phases?: MintPhaseConfig[],
): Promise<void> {
  const cmPubkey = publicKey(candyMachineAddress);
  const cm = await fetchCandyMachineWithRetry(umi, cmPubkey);
  const candyGuard = await fetchCandyGuardWithRetry(umi, cm.mintAuthority);

  const guards = buildGuards(umi, mintConfig, phases);
  const groups = buildGuardGroups(umi, mintConfig, phases);

  const builder = updateCandyGuard(umi, {
    candyGuard: candyGuard.publicKey,
    guards,
    groups: groups.length > 0 ? groups : [],
  });

  await builder.sendAndConfirm(umi);
}

// ── Fetch state ──────────────────────────────────────────────────────────────

export async function fetchCandyMachineState(
  umi: Umi,
  candyMachineAddress: string,
): Promise<CandyMachineState | null> {
  const cm = await safeFetchCandyMachine(umi, publicKey(candyMachineAddress));
  if (!cm) return null;

  // itemsAvailable = max supply (from config data); itemsLoaded = config lines loaded (lazy-load)
  const itemsAvailable =
    cm.data?.itemsAvailable != null ? Number(cm.data.itemsAvailable) : Number(cm.itemsLoaded);

  return {
    address: cm.publicKey.toString(),
    itemsAvailable,
    itemsRedeemed: Number(cm.itemsRedeemed),
    authority: cm.authority.toString(),
    collectionMint: cm.collectionMint.toString(),
    candyGuardAddress: cm.mintAuthority.toString(),
  };
}

// ── Guard builders ───────────────────────────────────────────────────────────

function getTokenHolderMints(config: MintConfig | MintPhaseConfig): string[] {
  const mints: string[] = [];
  if (config.tokenHolderMints?.length) mints.push(...config.tokenHolderMints.filter(Boolean));
  if ('tokenHolderMint' in config && (config as MintConfig).tokenHolderMint?.trim()) {
    const legacy = (config as MintConfig).tokenHolderMint!.trim();
    if (!mints.includes(legacy)) mints.push(legacy);
  }
  return mints;
}

function needsGroups(mintConfig: MintConfig, phases?: MintPhaseConfig[]): boolean {
  if (mintConfig.isDutchAuction && mintConfig.dutchAuction) return true;
  if (phases && phases.length > 0) return true;
  if (getTokenHolderMints(mintConfig).length > 1) return true;
  return false;
}

function buildGuards(
  umi: Umi,
  mintConfig: MintConfig,
  phases?: MintPhaseConfig[],
): DefaultGuardSetArgs {
  if (needsGroups(mintConfig, phases)) {
    if (mintConfig.isDutchAuction && mintConfig.dutchAuction) {
      return buildDutchAuctionDefaultGuards(umi, mintConfig);
    }
    return emptyGuards();
  }
  return buildBaseGuards(umi, mintConfig);
}

/**
 * Default guards for Dutch auction mode.
 * Price and timing are per-group; common guards (mint limit, allowlist,
 * token gating) live in the default set and are inherited by every group.
 */
function buildDutchAuctionDefaultGuards(
  umi: Umi,
  mintConfig: MintConfig,
): DefaultGuardSetArgs {
  const guards: DefaultGuardSetArgs = { ...emptyGuards() };
  const allowlistAddresses = mintConfig.allowlistAddresses?.filter(Boolean) ?? [];
  const tokenMints = getTokenHolderMints(mintConfig);

  if (mintConfig.maxPerWallet) {
    guards.mintLimit = some({ id: 1, limit: mintConfig.maxPerWallet });
  }
  if (allowlistAddresses.length > 0) {
    guards.allowList = some({ merkleRoot: getMerkleRoot(allowlistAddresses) });
  }
  if (tokenMints.length === 1) {
    guards.tokenGate = some({ mint: publicKey(tokenMints[0]), amount: 1 });
  }

  return guards;
}

/**
 * Build guards from a config WITHOUT token gating (token gating is handled
 * via per-token groups when multiple tokens are present).
 */
function buildBaseGuards(
  umi: Umi,
  config: MintConfig | MintPhaseConfig,
  opts?: { skipTokenGate?: boolean; mintLimitId?: number },
): DefaultGuardSetArgs {
  const price = config.price ?? 0;
  const destination = umi.identity.publicKey;
  const allowlistAddresses = config.allowlistAddresses?.filter(Boolean) ?? [];
  const tokenMints = getTokenHolderMints(config);
  const skipTokenGate = opts?.skipTokenGate ?? false;
  const mintLimitId = opts?.mintLimitId ?? 1;

  const guards: DefaultGuardSetArgs = { ...emptyGuards() };

  if (price > 0) {
    guards.solPayment = some({ lamports: sol(price), destination });
  }
  if (config.startDate) {
    guards.startDate = some({ date: dateTimeFromISO(config.startDate) });
  }
  if (config.endDate) {
    guards.endDate = some({ date: dateTimeFromISO(config.endDate) });
  }
  if (config.maxPerWallet) {
    guards.mintLimit = some({ id: mintLimitId, limit: config.maxPerWallet });
  }
  if (allowlistAddresses.length > 0) {
    guards.allowList = some({ merkleRoot: getMerkleRoot(allowlistAddresses) });
  }
  if (!skipTokenGate && tokenMints.length === 1) {
    guards.tokenGate = some({ mint: publicKey(tokenMints[0]), amount: 1 });
  }

  return guards;
}

/**
 * Build guard groups. Handles four scenarios:
 *
 * 0. **Dutch auction** — one group per price step + floor group.
 * 1. **Phases only, single or no token** — one group per phase.
 * 2. **Multi-token, no phases** — one group per token (plus public group if access !== 'custom').
 * 3. **Multi-token + phases** — cross-product: one group per (phase, token) pair,
 *    plus a public group for any phase that has open access.
 *
 * Group label format: `da{i}` for Dutch auction steps, `p{phaseIdx}` or
 * `p{phaseIdx}-t{tokenIdx}` or `pub` / `p{phaseIdx}-pub`.
 * A unique mintLimit `id` is assigned per group so per-wallet caps work independently.
 */
function buildGuardGroups(
  umi: Umi,
  mintConfig: MintConfig,
  phases?: MintPhaseConfig[],
): { label: string; guards: DefaultGuardSetArgs }[] {
  if (!needsGroups(mintConfig, phases)) return [];

  if (mintConfig.isDutchAuction && mintConfig.dutchAuction && mintConfig.startDate) {
    return buildDutchAuctionGroups(umi, mintConfig);
  }

  const groups: { label: string; guards: DefaultGuardSetArgs }[] = [];
  let mintLimitIdCounter = 1;

  if (phases && phases.length > 0) {
    // Phases present — iterate each phase
    for (let pi = 0; pi < phases.length; pi++) {
      const phase = phases[pi];
      const tokens = getTokenHolderMints(phase);
      const isCustomAccess = phase.access === 'custom' || tokens.length > 0;

      if (tokens.length > 1) {
        // Multi-token phase: one group per token
        for (let ti = 0; ti < tokens.length; ti++) {
          const id = mintLimitIdCounter++;
          const base = buildBaseGuards(umi, phase, { skipTokenGate: true, mintLimitId: id });
          base.tokenGate = some({ mint: publicKey(tokens[ti]), amount: 1 });
          groups.push({ label: `p${pi}-t${ti}`, guards: base });
        }
      } else if (tokens.length === 1) {
        // Single token phase
        const id = mintLimitIdCounter++;
        const g = buildBaseGuards(umi, phase, { mintLimitId: id });
        groups.push({ label: `p${pi}`, guards: g });
      } else {
        // No token gating for this phase — public group
        const id = mintLimitIdCounter++;
        const g = buildBaseGuards(umi, phase, { mintLimitId: id });
        groups.push({ label: `p${pi}`, guards: g });
      }

      // If the phase has tokens but is NOT custom-only, also add a public group
      // (e.g., phase 2 allows token holders + anyone)
      if (tokens.length > 0 && !isCustomAccess) {
        const id = mintLimitIdCounter++;
        const g = buildBaseGuards(umi, phase, { skipTokenGate: true, mintLimitId: id });
        groups.push({ label: `p${pi}-pub`, guards: g });
      }
    }
  } else {
    // No phases — multi-token on the base config
    const tokens = getTokenHolderMints(mintConfig);
    for (let ti = 0; ti < tokens.length; ti++) {
      const id = mintLimitIdCounter++;
      const base = buildBaseGuards(umi, mintConfig, { skipTokenGate: true, mintLimitId: id });
      base.tokenGate = some({ mint: publicKey(tokens[ti]), amount: 1 });
      groups.push({ label: `t${ti}`, guards: base });
    }
    // If not custom-only access, add a public fallback group
    if (mintConfig.access !== 'custom') {
      const id = mintLimitIdCounter++;
      const g = buildBaseGuards(umi, mintConfig, { skipTokenGate: true, mintLimitId: id });
      groups.push({ label: 'pub', guards: g });
    }
  }

  return groups;
}

/**
 * Build mint arguments. Checks both group-specific guards and default guards,
 * with the group taking precedence when both define the same guard (mirrors
 * on-chain merge behaviour).
 */
function buildMintArgs(
  umi: Umi,
  candyGuard: CandyGuard,
  group: string | null,
  allowlistAddresses?: string[],
): Partial<DefaultGuardSetMintArgs> {
  const args: Partial<DefaultGuardSetMintArgs> = {};
  const groupGuards = resolveGuardSet(candyGuard, group);
  const defaultGuards = candyGuard.guards;

  const pickGuard = <K extends keyof typeof groupGuards>(name: K) => {
    if (groupGuards?.[name]?.__option === 'Some') return groupGuards[name];
    if (defaultGuards?.[name]?.__option === 'Some') return defaultGuards[name];
    return null;
  };

  const solPayment = pickGuard('solPayment');
  if (solPayment && solPayment.__option === 'Some') {
    args.solPayment = some({ destination: (solPayment.value as any).destination });
  }

  const mintLimit = pickGuard('mintLimit');
  if (mintLimit && mintLimit.__option === 'Some') {
    args.mintLimit = some({ id: (mintLimit.value as any).id });
  }

  const allowList = pickGuard('allowList');
  if (allowList && allowList.__option === 'Some' && allowlistAddresses && allowlistAddresses.length > 0) {
    args.allowList = some({ merkleRoot: getMerkleRoot(allowlistAddresses) });
  }

  const tokenGate = pickGuard('tokenGate');
  if (tokenGate && tokenGate.__option === 'Some') {
    args.tokenGate = some({ mint: (tokenGate.value as any).mint });
  }

  return args;
}

// ── Allowlist proof (route instruction) ──────────────────────────────────────

async function proveAllowlist(
  umi: Umi,
  cm: CandyMachine,
  candyGuard: CandyGuard,
  allowlistAddresses: string[],
  group: string | null,
): Promise<void> {
  const minterAddress = umi.identity.publicKey.toString();
  if (!allowlistAddresses.includes(minterAddress)) return;

  const merkleRoot = getMerkleRoot(allowlistAddresses);
  const merkleProof = getMerkleProof(allowlistAddresses, minterAddress);

  const builder = route(umi, {
    candyMachine: cm.publicKey,
    candyGuard: candyGuard.publicKey,
    guard: 'allowList',
    routeArgs: {
      path: 'proof',
      merkleRoot,
      merkleProof,
    },
    group: group ? some(group) : none(),
  });

  await builder.sendAndConfirm(umi);
}

// ── Dutch Auction groups ─────────────────────────────────────────────────────

interface DutchAuctionStep {
  label: string;
  price: number;
  startISO: string;
  endISO: string | null;
}

function computeDutchAuctionSteps(
  startPrice: number,
  endPrice: number,
  durationHours: number,
  startTimeISO: string,
  mintEndDateISO: string | null,
): DutchAuctionStep[] {
  const startMs = new Date(startTimeISO).getTime();
  const stepDurationMs = (durationHours * 60 * 60 * 1000) / DUTCH_AUCTION_STEPS;
  const priceDrop = (startPrice - endPrice) / DUTCH_AUCTION_STEPS;

  const steps: DutchAuctionStep[] = [];

  for (let i = 0; i < DUTCH_AUCTION_STEPS; i++) {
    steps.push({
      label: `da${i}`,
      price: Math.max(endPrice, startPrice - priceDrop * i),
      startISO: new Date(startMs + i * stepDurationMs).toISOString(),
      endISO: new Date(startMs + (i + 1) * stepDurationMs).toISOString(),
    });
  }

  // Floor group: endPrice, runs from end of last step until mint endDate (or indefinitely)
  steps.push({
    label: `da${DUTCH_AUCTION_STEPS}`,
    price: endPrice,
    startISO: new Date(startMs + DUTCH_AUCTION_STEPS * stepDurationMs).toISOString(),
    endISO: mintEndDateISO ?? null,
  });

  return steps;
}

function buildDutchAuctionGroups(
  umi: Umi,
  mintConfig: MintConfig,
): { label: string; guards: DefaultGuardSetArgs }[] {
  const { startPrice, endPrice, durationHours } = mintConfig.dutchAuction!;
  const steps = computeDutchAuctionSteps(
    startPrice,
    endPrice,
    durationHours,
    mintConfig.startDate!,
    mintConfig.endDate ?? null,
  );
  const destination = umi.identity.publicKey;

  return steps.map((step) => {
    const guards: DefaultGuardSetArgs = { ...emptyGuards() };

    if (step.price > 0) {
      guards.solPayment = some({ lamports: sol(step.price), destination });
    }
    guards.startDate = some({ date: dateTimeFromISO(step.startISO) });
    if (step.endISO) {
      guards.endDate = some({ date: dateTimeFromISO(step.endISO) });
    }

    return { label: step.label, guards };
  });
}

/**
 * Compute the on-chain step price for a Dutch auction at the current moment.
 * Returns null when the config is not a Dutch auction or lacks a start date.
 */
export function getCurrentDutchAuctionStepPrice(mintConfig: MintConfig): number | null {
  if (!mintConfig.isDutchAuction || !mintConfig.dutchAuction || !mintConfig.startDate) return null;

  const { startPrice, endPrice, durationHours } = mintConfig.dutchAuction;
  if (!Number.isFinite(startPrice) || !Number.isFinite(endPrice) || !durationHours) return null;

  const startMs = new Date(mintConfig.startDate).getTime();
  if (!Number.isFinite(startMs)) return null;
  const now = Date.now();

  if (now < startMs) return startPrice;

  const durationMs = durationHours * 60 * 60 * 1000;
  if (now >= startMs + durationMs) return endPrice;

  const stepDurationMs = durationMs / DUTCH_AUCTION_STEPS;
  const stepIndex = Math.min(DUTCH_AUCTION_STEPS - 1, Math.floor((now - startMs) / stepDurationMs));
  const priceDrop = (startPrice - endPrice) / DUTCH_AUCTION_STEPS;

  return Math.max(endPrice, startPrice - priceDrop * stepIndex);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyGuards(): DefaultGuardSetArgs {
  return {
    botTax: none(),
    solPayment: none(),
    tokenPayment: none(),
    startDate: none(),
    thirdPartySigner: none(),
    tokenGate: none(),
    gatekeeper: none(),
    endDate: none(),
    allowList: none(),
    mintLimit: none(),
    nftPayment: none(),
    redeemedAmount: none(),
    addressGate: none(),
    nftGate: none(),
    nftBurn: none(),
    tokenBurn: none(),
    freezeSolPayment: none(),
    freezeTokenPayment: none(),
    programGate: none(),
    allocation: none(),
    token2022Payment: none(),
  };
}

/**
 * Pick the best group label for a minter based on the guard groups present.
 * Tries token-gated groups first (the user holds the token), then falls back
 * to a public group.
 *
 * Label conventions:
 * - `da{i}` — Dutch auction price step i (time-based)
 * - `p{i}` — phase i (single/no token)
 * - `p{i}-t{j}` — phase i, token j
 * - `p{i}-pub` — phase i, public fallback
 * - `t{j}` — no phases, token j
 * - `pub` — no phases, public fallback
 */
function resolveGroupForMinter(
  candyGuard: CandyGuard,
  phaseIndex: number | null,
  userTokenMints: string[],
): string | null {
  const labels = candyGuard.groups.map((g) => g.label);
  if (labels.length === 0) return null;

  // Dutch auction: pick the currently active time-step group
  if (labels.some((l) => l.startsWith('da'))) {
    return resolveDutchAuctionGroup(candyGuard);
  }

  const phasePrefix = phaseIndex != null ? `p${phaseIndex}` : null;
  const userTokenSet = new Set(userTokenMints.map((t) => t.toLowerCase()));

  // Find matching token-gated group
  for (const g of candyGuard.groups) {
    if (phasePrefix && !g.label.startsWith(phasePrefix)) continue;
    if (!phasePrefix && g.label.match(/^p\d/)) continue;

    if (g.guards.tokenGate.__option === 'Some') {
      const gatedMint = g.guards.tokenGate.value.mint.toString().toLowerCase();
      if (userTokenSet.has(gatedMint)) return g.label;
    }
  }

  // Fall back to public group
  if (phasePrefix) {
    const pubLabel = `${phasePrefix}-pub`;
    if (labels.includes(pubLabel)) return pubLabel;
    // Single-token phase uses just `p{i}`
    const plainLabel = phasePrefix;
    if (labels.includes(plainLabel)) return plainLabel;
  } else {
    if (labels.includes('pub')) return 'pub';
  }

  // Last resort: first matching group for this phase
  if (phasePrefix) {
    const match = labels.find((l) => l.startsWith(phasePrefix));
    if (match) return match;
  }

  return labels[0] ?? null;
}

/**
 * Find the Dutch auction guard group whose time window contains "now".
 * - If "now" is inside a step window → return that group (correct price).
 * - If "now" is before the first step (auction not started) → return first group (da0)
 *   so they pay start price; the UI should block mint via canMint() when startDate > now.
 * - If "now" is past all steps → return last group (floor).
 */
function resolveDutchAuctionGroup(candyGuard: CandyGuard): string | null {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const daGroups = candyGuard.groups.filter((g) => g.label.startsWith('da'));

  for (const g of daGroups) {
    const start =
      g.guards.startDate.__option === 'Some' ? g.guards.startDate.value.date : 0n;
    const end =
      g.guards.endDate.__option === 'Some'
        ? g.guards.endDate.value.date
        : BigInt(Number.MAX_SAFE_INTEGER);

    if (now >= start && now < end) return g.label;
  }

  if (daGroups.length === 0) return null;
  const firstStart =
    daGroups[0].guards.startDate.__option === 'Some'
      ? (daGroups[0].guards.startDate.value as { date: bigint }).date
      : 0n;
  // Before auction start: use first group (start price), not floor.
  if (now < firstStart) return daGroups[0].label;
  // Past all windows: use floor (last group).
  return daGroups[daGroups.length - 1].label;
}

function resolveGuardSet(
  candyGuard: CandyGuard,
  group: string | null,
) {
  if (!group) return candyGuard.guards;
  const found = candyGuard.groups.find((g) => g.label === group);
  return found?.guards ?? candyGuard.guards;
}

function dateTimeFromISO(iso: string): bigint {
  return BigInt(Math.floor(new Date(iso).getTime() / 1000));
}

function dateTimeToISO(unix: bigint): string {
  return new Date(Number(unix) * 1000).toISOString();
}

const LAMPORTS_PER_SOL = 1_000_000_000;

function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

/** Safely parse lamports from guard value. Umi SolAmount is { basisPoints: bigint, identifier, decimals }; also handle raw bigint/number. Never return NaN. */
function parseSolPaymentToPrice(value: unknown): number | undefined {
  if (value == null) return undefined;
  const v = value as Record<string, unknown>;
  const lamportsObj = v.lamports;
  let n: number;
  if (lamportsObj != null && typeof lamportsObj === 'object' && 'basisPoints' in lamportsObj) {
    const bp = (lamportsObj as { basisPoints: bigint }).basisPoints;
    n = Number(bp);
  } else if (lamportsObj != null) {
    const raw = lamportsObj;
    n = typeof raw === 'bigint' ? Number(raw) : typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  } else {
    const raw = (v as { basisPoints?: unknown }).basisPoints;
    if (raw == null) return undefined;
    n = typeof raw === 'bigint' ? Number(raw) : typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  }
  if (!Number.isFinite(n) || n < 0) return undefined;
  const sol = n / LAMPORTS_PER_SOL;
  return Number.isFinite(sol) ? sol : undefined;
}

/** Extract a single phase config from a guard set (price, dates, limits, token gate). Allowlist cannot be recovered from chain. */
function parsePhaseFromGuards(guards: CandyGuard['guards']): Partial<MintPhaseConfig> {
  const out: Partial<MintPhaseConfig> = {};
  if (guards.solPayment?.__option === 'Some' && guards.solPayment.value) {
    const p = parseSolPaymentToPrice(guards.solPayment.value);
    if (p !== undefined) out.price = p;
  }
  if (guards.startDate?.__option === 'Some' && guards.startDate.value) {
    const v = guards.startDate.value as { date?: bigint };
    if (v.date != null) out.startDate = dateTimeToISO(v.date);
  }
  if (guards.endDate?.__option === 'Some' && guards.endDate.value) {
    const v = guards.endDate.value as { date?: bigint };
    if (v.date != null) out.endDate = dateTimeToISO(v.date);
  }
  if (guards.mintLimit?.__option === 'Some' && guards.mintLimit.value) {
    const v = guards.mintLimit.value as { limit?: number };
    if (v.limit != null) out.maxPerWallet = v.limit;
  }
  if (guards.tokenGate?.__option === 'Some' && guards.tokenGate.value) {
    const v = guards.tokenGate.value as { mint?: { toString: () => string } };
    if (v.mint) out.tokenHolderMints = [v.mint.toString()];
  }
  return out;
}

/**
 * Fetch Candy Guard and parse phase groups (p0, p1, ...) into MintPhaseConfig[].
 * Use when the drop has a CM with phased open edition. Merges with jsonPhases for allowlist (chain cannot store allowlist addresses).
 */
export async function fetchPhasesFromCandyMachine(
  umi: Umi,
  candyMachineAddress: string,
  jsonPhases?: MintPhaseConfig[],
): Promise<MintPhaseConfig[] | null> {
  const cm = await safeFetchCandyMachine(umi, publicKey(candyMachineAddress));
  if (!cm) return null;
  const candyGuard = await safeFetchCandyGuard(umi, cm.mintAuthority);
  if (!candyGuard || !candyGuard.groups.length) return null;

  const phaseLabels = candyGuard.groups
    .map((g) => g.label)
    .filter((l) => /^p\d+(-pub|-t\d+)?$/.test(l));
  if (phaseLabels.length === 0) return null;

  const phaseIndices = new Set<number>();
  for (const l of phaseLabels) {
    const m = l.match(/^p(\d+)/);
    if (m) phaseIndices.add(parseInt(m[1], 10));
  }
  const sortedIndices = Array.from(phaseIndices).sort((a, b) => a - b);

  const phases: MintPhaseConfig[] = [];
  for (const pi of sortedIndices) {
    const mainLabel = candyGuard.groups.find((g) => g.label === `p${pi}`) ? `p${pi}` : candyGuard.groups.find((g) => g.label === `p${pi}-t0`) ? `p${pi}-t0` : candyGuard.groups.find((g) => g.label === `p${pi}-pub`) ? `p${pi}-pub` : candyGuard.groups.find((g) => g.label.startsWith(`p${pi}-`))?.label ?? `p${pi}`;
    const group = candyGuard.groups.find((g) => g.label === mainLabel);
    if (!group) continue;
    const partial = parsePhaseFromGuards(group.guards);
    const tokenMints = new Set<string>();
    for (const g of candyGuard.groups) {
      if (g.label !== `p${pi}` && !g.label.startsWith(`p${pi}-`)) continue;
      if (g.guards.tokenGate?.__option === 'Some' && g.guards.tokenGate.value) {
        const v = (g.guards.tokenGate.value as { mint?: { toString: () => string } }).mint;
        if (v) tokenMints.add(v.toString());
      }
    }
    const price = typeof partial.price === 'number' && Number.isFinite(partial.price) ? partial.price : 0;
    const phase: MintPhaseConfig = {
      price,
      maxSupply: partial.maxSupply ?? null,
      maxPerWallet: partial.maxPerWallet ?? null,
      startDate: partial.startDate ?? null,
      endDate: partial.endDate ?? null,
      access: tokenMints.size > 0 ? 'custom' : 'anyone',
      tokenHolderMints: tokenMints.size > 0 ? Array.from(tokenMints) : undefined,
      allowlistAddresses: jsonPhases?.[phases.length]?.allowlistAddresses,
    };
    phases.push(phase);
  }
  return phases.length > 0 ? phases : null;
}

/**
 * Dutch auction config derived from on-chain guard groups (da0..daN).
 * Use to populate mintConfig when the drop has a CM with Dutch auction.
 */
export interface DutchAuctionConfigFromChain {
  startDate: string;
  endDate: string | null;
  startPrice: number;
  endPrice: number;
  durationHours: number;
}

export async function fetchDutchAuctionConfigFromCandyMachine(
  umi: Umi,
  candyMachineAddress: string,
): Promise<DutchAuctionConfigFromChain | null> {
  const cm = await safeFetchCandyMachine(umi, publicKey(candyMachineAddress));
  if (!cm) return null;
  const candyGuard = await safeFetchCandyGuard(umi, cm.mintAuthority);
  if (!candyGuard) return null;

  const daGroups = candyGuard.groups
    .filter((g) => g.label.startsWith('da'))
    .sort((a, b) => {
      const ai = parseInt(a.label.replace('da', ''), 10);
      const bi = parseInt(b.label.replace('da', ''), 10);
      return ai - bi;
    });
  if (daGroups.length < 2) return null;

  const first = daGroups[0].guards;
  const last = daGroups[daGroups.length - 1].guards;

  const startDate =
    first.startDate?.__option === 'Some' && (first.startDate.value as { date?: bigint })?.date != null
      ? dateTimeToISO((first.startDate.value as { date: bigint }).date)
      : null;
  const endDate =
    last.endDate?.__option === 'Some' && (last.endDate.value as { date?: bigint })?.date != null
      ? dateTimeToISO((last.endDate.value as { date: bigint }).date)
      : null;
  const startPrice =
    first.solPayment?.__option === 'Some' && first.solPayment.value
      ? (parseSolPaymentToPrice(first.solPayment.value) ?? 0)
      : 0;
  const endPrice =
    last.solPayment?.__option === 'Some' && last.solPayment.value
      ? (parseSolPaymentToPrice(last.solPayment.value) ?? 0)
      : 0;

  if (!startDate) return null;
  if (startPrice === 0 && endPrice === 0) return null;

  // Dynamically detect step count from chain data (supports drops created with any DUTCH_AUCTION_STEPS value)
  const numPriceSteps = daGroups.length - 1; // last group is the floor
  const firstStart = first.startDate?.__option === 'Some' ? (first.startDate.value as { date: bigint }).date : 0n;
  const lastStepEnd =
    numPriceSteps > 0
      ? (daGroups[numPriceSteps - 1].guards.endDate?.__option === 'Some'
          ? (daGroups[numPriceSteps - 1].guards.endDate.value as { date: bigint }).date
          : 0n)
      : 0n;
  const durationSeconds = Number(lastStepEnd - firstStart);
  const durationHours = durationSeconds > 0 ? durationSeconds / 3600 : 0;

  return {
    startDate,
    endDate,
    startPrice,
    endPrice,
    durationHours: Math.round(durationHours * 100) / 100,
  };
}

function computeHiddenSettingsHash(uri: string): Uint8Array {
  const encoder = new TextEncoder();
  const data = encoder.encode(uri);
  const hash = new Uint8Array(32);
  for (let i = 0; i < data.length && i < 32; i++) {
    hash[i] = data[i];
  }
  return hash;
}

export { fetchCandyMachine as fetchCandyMachineRaw, safeFetchCandyMachine, fetchCandyGuard, safeFetchCandyGuard };
