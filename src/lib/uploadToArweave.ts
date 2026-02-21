import { Metaplex, toMetaplexFile } from '@metaplex-foundation/js';

const USE_LOCAL_STORAGE =
  process.env.NEXT_PUBLIC_USE_LOCAL_STORAGE === 'true';

/**
 * Upload a file (image, VRM, etc).
 * In dev mode (NEXT_PUBLIC_USE_LOCAL_STORAGE=true), saves locally.
 * In production, uploads to Arweave via Metaplex/Irys.
 */
export async function uploadFileToArweave(
  metaplex: Metaplex,
  file: File
): Promise<string> {
  if (USE_LOCAL_STORAGE) {
    return uploadFileLocal(file);
  }

  const buffer = await file.arrayBuffer();
  const metaplexFile = toMetaplexFile(new Uint8Array(buffer), file.name, {
    contentType: file.type,
  });
  const uri = await metaplex.storage().upload(metaplexFile);
  return uri;
}

/**
 * Upload a JSON metadata object.
 * In dev mode, saves locally. In production, uploads to Arweave.
 */
export async function uploadMetadataToArweave(
  metaplex: Metaplex,
  metadata: Record<string, unknown>
): Promise<string> {
  if (USE_LOCAL_STORAGE) {
    return uploadMetadataLocal(metadata);
  }

  const uri = await metaplex.storage().uploadJson(metadata);
  return uri;
}

// ── Local dev storage helpers ──────────────────────────────────────────

async function uploadFileLocal(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Local upload failed');
  }

  const data = await res.json();

  // Return full URL so it works the same as Arweave URLs
  return `${window.location.origin}${data.url}`;
}

async function uploadMetadataLocal(
  metadata: Record<string, unknown>
): Promise<string> {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Local metadata upload failed');
  }

  const data = await res.json();

  // Return full URL so it works the same as Arweave URLs
  return `${window.location.origin}${data.url}`;
}
