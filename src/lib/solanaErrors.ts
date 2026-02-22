/**
 * Centralized Solana / Candy Machine error parser.
 *
 * Converts raw program log walls into short, user-friendly messages while
 * preserving the original for a collapsible "details" section.
 */

export interface ParsedSolanaError {
  /** Short, user-facing message (one sentence). */
  friendly: string;
  /** Original raw error string for debugging (shown in collapsible details). */
  raw: string;
}

const ERROR_PATTERNS: { test: (msg: string) => boolean; friendly: string }[] = [
  {
    test: (m) => /user rejected|transaction rejected/i.test(m),
    friendly: 'Transaction rejected — no changes were made.',
  },
  {
    test: (m) => /not enough sol|insufficient.*sol|NotEnoughSOL/i.test(m),
    friendly: 'Insufficient SOL balance to complete this transaction.',
  },
  {
    test: (m) => /insufficient funds|insufficient lamports/i.test(m),
    friendly: 'Insufficient funds. Please add more SOL to your wallet.',
  },
  {
    test: (m) => /exceeded.*length|ExceededLengthError/i.test(m),
    friendly: 'A value exceeded the on-chain character limit. Check your collection name and symbol length.',
  },
  {
    test: (m) => /mint limit/i.test(m),
    friendly: 'You have reached the per-wallet mint limit for this drop.',
  },
  {
    test: (m) => /not live|MintNotLive/i.test(m),
    friendly: 'Minting is not active yet. Check the start time and try again later.',
  },
  {
    test: (m) => /allowlist|AllowListNotFound|not on the allow/i.test(m),
    friendly: 'Your wallet is not on the allowlist for this drop.',
  },
  {
    test: (m) => /token.*gate|TokenGateNotSatisfied/i.test(m),
    friendly: 'You need to hold the required token to mint from this drop.',
  },
  {
    test: (m) => /blockhash.*expired|BlockhashNotFound/i.test(m),
    friendly: 'Transaction expired. The network was slow — please try again.',
  },
  {
    test: (m) => /timeout|timed?\s*out/i.test(m),
    friendly: 'Transaction timed out. The network may be congested — please try again.',
  },
  {
    test: (m) => /account.*not found|AccountNotFound/i.test(m),
    friendly: 'On-chain account not found. The collection may have expired on devnet or was created on a different network.',
  },
  {
    test: (m) => /already minted|already.*been.*minted/i.test(m),
    friendly: 'This NFT has already been minted.',
  },
  {
    test: (m) => /candy machine.*empty|no more items/i.test(m),
    friendly: 'This drop is sold out — no more NFTs available.',
  },
  {
    test: (m) => /Incorrect account owner/i.test(m),
    friendly: 'On-chain account mismatch. The collection may still be propagating — wait a moment and retry.',
  },
  {
    test: (m) => /Simulation failed.*InsufficientFundsForRent/i.test(m),
    friendly: 'Insufficient SOL to cover account rent. Please add more SOL to your wallet.',
  },
  {
    test: (m) => /Simulation failed/i.test(m),
    friendly: 'Transaction pre-check failed. This usually means an on-chain condition was not met — see details below.',
  },
];

/**
 * Parse a raw Solana/Candy Machine error into a user-friendly message.
 * Always returns both a `friendly` message and the `raw` string.
 */
export function parseSolanaError(error: unknown): ParsedSolanaError {
  const raw = error instanceof Error ? error.message : String(error);

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return { friendly: pattern.friendly, raw };
    }
  }

  return {
    friendly: 'Something went wrong. See details below or try again.',
    raw,
  };
}
