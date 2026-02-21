/**
 * Client-side helper to register a newly created collection in the
 * launchpad registry. POSTs to /api/launchpad/register-collection.
 *
 * Handles the Metaplex SDK's varying response shapes defensively:
 * the tx signature may be a string, a Uint8Array, or nested in a
 * response object — this function accepts a pre-extracted string.
 */

interface RegisterInput {
  txSignature: string;
  collectionMint: string;
  network: string;
}

interface RegisterResult {
  ok: boolean;
  mint: string;
}

export async function registerLaunchpadCollection(
  input: RegisterInput,
): Promise<RegisterResult> {
  const { txSignature, collectionMint, network } = input;

  if (!txSignature || !collectionMint || !network) {
    throw new Error('registerLaunchpadCollection: missing required fields');
  }

  const res = await fetch('/api/launchpad/register-collection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txSignature, collectionMint, network }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const json = await res.json();
      detail = json.error || JSON.stringify(json);
    } catch {
      detail = await res.text().catch(() => `HTTP ${res.status}`);
    }
    throw new Error(`Registration failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return { ok: !!data.ok, mint: data.mint ?? collectionMint };
}
