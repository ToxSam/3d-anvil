import { NextRequest, NextResponse } from 'next/server';
import { isRegistryConfigured, mgetCollectionRecords } from '@/lib/server/launchpadRegistry';
import { getAllAssetsByOwner, extractCollectionGroup, ServerDASAsset } from '@/lib/server/das';
import { APP_NETWORK } from '@/lib/server/solanaVerify';

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const { address } = params;

  if (!address || address.length < 32 || address.length > 48) {
    return NextResponse.json(
      { error: 'Invalid wallet address' },
      { status: 400 },
    );
  }

  if (!isRegistryConfigured()) {
    return NextResponse.json(
      {
        error:
          'Launchpad registry not configured. Set KV_REST_API_URL/KV_REST_API_TOKEN or LOCAL_KV_PATH.',
      },
      { status: 503 },
    );
  }

  let assets: ServerDASAsset[];
  try {
    assets = await getAllAssetsByOwner(address);
  } catch (err) {
    console.error('[balances] asset fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch assets' },
      { status: 502 },
    );
  }

  // 2. Extract verified collection mints, discard assets without one
  const assetsByCollection = new Map<string, ServerDASAsset[]>();
  for (const asset of assets) {
    const group = extractCollectionGroup(asset);
    if (!group) continue;
    const collMint = group.group_value;
    const arr = assetsByCollection.get(collMint) ?? [];
    arr.push(asset);
    assetsByCollection.set(collMint, arr);
  }

  const uniqueCollMints = [...assetsByCollection.keys()];
  if (uniqueCollMints.length === 0) {
    return NextResponse.json({
      address,
      network: APP_NETWORK,
      count: 0,
      items: [],
    });
  }

  // 3. Batch-check KV allowlist (one external call: MGET)
  const records = await mgetCollectionRecords(uniqueCollMints);

  // 4. Filter: keep only assets whose collection is in the allowlist
  const filtered: ServerDASAsset[] = [];
  for (let i = 0; i < uniqueCollMints.length; i++) {
    if (records[i] !== null) {
      filtered.push(...(assetsByCollection.get(uniqueCollMints[i]) ?? []));
    }
  }

  return NextResponse.json({
    address,
    network: APP_NETWORK,
    count: filtered.length,
    items: filtered,
  });
}
