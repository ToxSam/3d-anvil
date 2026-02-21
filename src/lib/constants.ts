export const COLLECTION_TYPES = {
  VRM_AVATARS: 'vrm_avatars',
  GLB_WEARABLES: 'glb_wearables',
  CUSTOM: 'custom',
} as const;

export type CollectionType = (typeof COLLECTION_TYPES)[keyof typeof COLLECTION_TYPES];

export const COLLECTION_SCHEMAS = {
  [COLLECTION_TYPES.VRM_AVATARS]: {
    required_fields: ['animation_url', 'vrm_version', 'license'],
    suggested_traits: ['License', 'Commercial Use', 'Blend Shapes', 'Bone Count'],
  },
  [COLLECTION_TYPES.GLB_WEARABLES]: {
    required_fields: ['animation_url', 'wearable_type'],
    suggested_traits: ['Type', 'Rarity', 'Compatible With'],
  },
  [COLLECTION_TYPES.CUSTOM]: {
    required_fields: ['animation_url'],
    suggested_traits: [],
  },
};

/**
 * Collection kind — used to differentiate standard collections from drops.
 * Stored in `properties.collection_kind` inside the on-chain JSON metadata.
 */
export const COLLECTION_KIND = {
  COLLECTION: 'collection',
  DROP: 'drop',
} as const;

export type CollectionKind = (typeof COLLECTION_KIND)[keyof typeof COLLECTION_KIND];

/**
 * Helper to detect whether a loaded NFT JSON represents a Drop.
 * Checks both the new `collection_kind` field and the legacy `is_drop` flag.
 */
export function isDropCollection(json: any): boolean {
  if (!json) return false;
  const props = json.properties || {};
  return (
    props.collection_kind === COLLECTION_KIND.DROP ||
    props.is_drop === true
  );
}

/**
 * Returns true when a URL points at localhost / 127.0.0.1.
 * Used to suppress mixed-content warnings on the deployed site for NFTs
 * that were minted during local development with local storage.
 */
export function isLocalhostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * On Irys devnet, the SDK stores data on the Irys gateway but returns
 * `arweave.net` URIs which 404.  On devnet this rewrites to the working
 * Irys gateway URL.  On mainnet it's a no-op (arweave.net URLs are correct).
 *
 * Localhost URLs are silently dropped so the deployed site never attempts to
 * fetch assets from http://localhost, which triggers mixed-content warnings.
 */
export function resolveArweaveUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (isLocalhostUrl(url)) return undefined;
  if (SOLANA_NETWORK !== 'mainnet-beta' && url.includes('arweave.net')) {
    return url.replace('https://arweave.net/', 'https://gateway.irys.xyz/');
  }
  return url;
}

/**
 * Deep-rewrite all `arweave.net` string values in a JSON object to
 * `gateway.irys.xyz` on devnet.  Returns a new object (does not mutate).
 */
function rewriteArweaveUrlsInJson(json: any): any {
  if (SOLANA_NETWORK === 'mainnet-beta') return json;
  if (!json || typeof json !== 'object') return json;

  const rewrite = (val: any): any => {
    if (typeof val === 'string' && val.includes('arweave.net')) {
      return val.replace('https://arweave.net/', 'https://gateway.irys.xyz/');
    }
    if (Array.isArray(val)) return val.map(rewrite);
    if (val && typeof val === 'object') {
      const out: any = {};
      for (const k of Object.keys(val)) out[k] = rewrite(val[k]);
      return out;
    }
    return val;
  };
  return rewrite(json);
}

/**
 * On Irys devnet, uploaded data is stored on the Irys gateway but the SDK
 * returns `arweave.net` URIs which 404. This helper rewrites the URI to the
 * Irys gateway and attempts to fetch the JSON.  All `arweave.net` URLs inside
 * the returned JSON are also rewritten so images and model files resolve.
 * Returns the parsed JSON on success, or null if the fetch fails.
 */
export async function tryFetchJsonWithIrysGateway(uri: string | undefined | null): Promise<any | null> {
  if (!uri) return null;
  if (isLocalhostUrl(uri)) return null;
  const urls: string[] = [];
  if (uri.includes('arweave.net')) {
    urls.push(uri.replace('https://arweave.net/', 'https://gateway.irys.xyz/'));
  }
  urls.push(uri);

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const json = await res.json();
        return rewriteArweaveUrlsInJson(json);
      }
    } catch {
      // try next URL
    }
  }
  return null;
}

export const DEFAULT_ROYALTY_BPS = 500; // 5%

/** Solana cluster: default is devnet. Set NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta for production. */
export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

/**
 * All Solana RPC / DAS calls are routed through our server-side proxy so the
 * Helius API key (HELIUS_RPC_URL) never appears in the client bundle.
 *
 * In the browser: absolute URL pointing at our /api/rpc proxy route.
 * During SSR: falls back to the public endpoint (no actual RPC calls happen
 * during SSR in this app — all callers are 'use client' components).
 */
export const SOLANA_RPC_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/rpc`
    : (SOLANA_NETWORK === 'mainnet-beta'
        ? 'https://api.mainnet-beta.solana.com'
        : 'https://api.devnet.solana.com');

/**
 * WebSocket endpoint — points to the public Solana validator directly.
 * Vercel serverless can't proxy WebSocket, so WS subscriptions
 * (transaction confirmation, account change notifications) bypass the proxy.
 * No API key needed; this is free tier.
 */
export const SOLANA_WS_URL =
  SOLANA_NETWORK === 'mainnet-beta'
    ? 'wss://api.mainnet-beta.solana.com'
    : 'wss://api.devnet.solana.com';

export const IRYS_NODE =
  process.env.NEXT_PUBLIC_IRYS_NODE || 'https://devnet.irys.xyz';
export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://explorer.solana.com';
