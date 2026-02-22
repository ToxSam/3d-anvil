/**
 * Server-side data fetching for OG images and dynamic metadata.
 * Uses Helius DAS to retrieve Solana NFT / collection data.
 */

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
const RPC_URL =
  process.env.HELIUS_RPC_URL ||
  (NETWORK === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com');

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://localhost')) return null;
  if (url.includes('arweave.net')) {
    return url.replace('https://arweave.net/', 'https://gateway.irys.xyz/');
  }
  return url;
}

export interface OGAssetInfo {
  name: string;
  description: string;
  image: string | null;
  symbol: string;
  jsonUri: string | null;
}

/**
 * Fetch basic asset data via DAS `getAsset`.
 */
export async function fetchOGAsset(
  address: string,
): Promise<OGAssetInfo | null> {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'og',
        method: 'getAsset',
        params: { id: address },
      }),
    });
    const data = await res.json();
    if (data.result?.content) {
      const c = data.result.content;
      return {
        name: c.metadata?.name || '',
        description: c.metadata?.description || '',
        image: resolveImageUrl(c.links?.image),
        symbol: c.metadata?.symbol || '',
        jsonUri: c.json_uri || null,
      };
    }
  } catch {
    // DAS unavailable
  }
  return null;
}

/**
 * Fetch raw JSON metadata from an Arweave/Irys URI.
 */
export async function fetchOGJson(
  uri: string | null | undefined,
): Promise<any | null> {
  if (!uri) return null;
  let url = uri;
  if (url.includes('arweave.net')) {
    url = url.replace('https://arweave.net/', 'https://gateway.irys.xyz/');
  }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (r.ok) return await r.json();
  } catch {
    // fetch failed
  }
  return null;
}

/**
 * Get the number of items in a collection via DAS `getAssetsByGroup`.
 */
export async function fetchCollectionItemCount(
  address: string,
): Promise<number | null> {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'og-count',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: address,
          page: 1,
          limit: 1,
        },
      }),
    });
    const data = await res.json();
    if (data.result?.total !== undefined) return data.result.total;
  } catch {
    // DAS unavailable
  }
  return null;
}

// ── Helpers for metadata & OG enrichment ──

/**
 * Detect the 3D asset type from the metadata JSON.
 */
export function getAssetType(json: any): string {
  if (!json) return '';
  if (!json.properties?.files) return '3D Asset';
  const files: { type?: string; uri?: string }[] = json.properties.files;
  if (
    files.some(
      (f) => f.type === 'model/vrm' || f.uri?.toLowerCase().endsWith('.vrm'),
    )
  )
    return 'VRM Avatar';
  if (
    files.some(
      (f) =>
        f.type === 'model/gltf-binary' ||
        f.uri?.toLowerCase().endsWith('.glb'),
    )
  )
    return 'GLB Model';
  return '3D Asset';
}

/**
 * Determine the drop type label from the mint config.
 */
export function getDropType(mintConfig: any): string {
  if (!mintConfig) return '';
  if (mintConfig.isDutchAuction) return 'Dutch Auction';
  if (mintConfig.maxSupply === null || mintConfig.maxSupply === undefined)
    return 'Open Edition';
  return `${mintConfig.maxSupply} Editions`;
}

/**
 * Determine live/upcoming/ended status from mint config timing.
 */
export function getDropStatus(
  mintConfig: any,
): { text: string; color: 'green' | 'orange' | 'red' | 'gray' } | null {
  if (!mintConfig) return null;
  const now = new Date();
  if (mintConfig.startDate && new Date(mintConfig.startDate) > now) {
    return { text: 'UPCOMING', color: 'orange' };
  }
  if (mintConfig.endDate && new Date(mintConfig.endDate) < now) {
    return { text: 'ENDED', color: 'gray' };
  }
  return { text: 'LIVE', color: 'green' };
}

/**
 * Get the display price string from a mint config.
 */
export function getDropPrice(mintConfig: any): string {
  if (!mintConfig) return '';
  const p =
    mintConfig.isDutchAuction && mintConfig.dutchAuction
      ? mintConfig.dutchAuction.startPrice
      : mintConfig.price;
  if (p === undefined || p === null) return '';
  return p === 0 ? 'FREE' : `${p} SOL`;
}
