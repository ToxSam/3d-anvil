import { Redis } from '@upstash/redis';
import * as fs from 'fs';

/* ── Key patterns ──────────────────────────────────────────────────────── */
const collectionKey = (mint: string) => `lp:collection:${mint}`;
const sigKey = (sig: string) => `lp:sig:${sig}`;
const SIG_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/* ── Types ─────────────────────────────────────────────────────────────── */
export interface CollectionRecord {
  mint: string;
  creator: string;
  createdAt: string;
  network: string;
}

/* ── Backend abstraction ───────────────────────────────────────────────── */

interface RegistryBackend {
  getCollection(mint: string): Promise<CollectionRecord | null>;
  setCollection(mint: string, record: CollectionRecord): Promise<void>;
  mgetCollections(mints: string[]): Promise<(CollectionRecord | null)[]>;
  hasSig(sig: string): Promise<boolean>;
  setSig(sig: string): Promise<void>;
}

/* ── Upstash Redis backend ─────────────────────────────────────────────── */

function createRedisBackend(): RegistryBackend {
  const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });

  return {
    async getCollection(mint) {
      return redis.get<CollectionRecord>(collectionKey(mint));
    },
    async setCollection(mint, record) {
      await redis.set(collectionKey(mint), record);
    },
    async mgetCollections(mints) {
      if (mints.length === 0) return [];
      const keys = mints.map(collectionKey);
      const results = await redis.mget<(CollectionRecord | null)[]>(...keys);
      return results;
    },
    async hasSig(sig) {
      const v = await redis.exists(sigKey(sig));
      return v === 1;
    },
    async setSig(sig) {
      await redis.set(sigKey(sig), '1', { ex: SIG_TTL_SECONDS });
    },
  };
}

/* ── Local JSON file backend (dev only) ────────────────────────────────── */

interface LocalStore {
  collections: Record<string, CollectionRecord>;
  sigs: Record<string, { value: string; expiresAt: number }>;
}

function readLocalStore(path: string): LocalStore {
  try {
    const raw = fs.readFileSync(path, 'utf-8');
    return JSON.parse(raw) as LocalStore;
  } catch {
    return { collections: {}, sigs: {} };
  }
}

function writeLocalStore(path: string, store: LocalStore): void {
  fs.writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8');
}

function createLocalBackend(filePath: string): RegistryBackend {
  return {
    async getCollection(mint) {
      const store = readLocalStore(filePath);
      return store.collections[mint] ?? null;
    },
    async setCollection(mint, record) {
      const store = readLocalStore(filePath);
      store.collections[mint] = record;
      writeLocalStore(filePath, store);
    },
    async mgetCollections(mints) {
      if (mints.length === 0) return [];
      const store = readLocalStore(filePath);
      return mints.map((m) => store.collections[m] ?? null);
    },
    async hasSig(sig) {
      const store = readLocalStore(filePath);
      const entry = store.sigs[sig];
      if (!entry) return false;
      if (Date.now() > entry.expiresAt) {
        delete store.sigs[sig];
        writeLocalStore(filePath, store);
        return false;
      }
      return true;
    },
    async setSig(sig) {
      const store = readLocalStore(filePath);
      store.sigs[sig] = {
        value: '1',
        expiresAt: Date.now() + SIG_TTL_SECONDS * 1000,
      };
      writeLocalStore(filePath, store);
    },
  };
}

/* ── Resolve backend ───────────────────────────────────────────────────── */

let _backend: RegistryBackend | null = null;

function getBackend(): RegistryBackend | null {
  if (_backend) return _backend;

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    _backend = createRedisBackend();
    return _backend;
  }

  if (process.env.LOCAL_KV_PATH) {
    _backend = createLocalBackend(process.env.LOCAL_KV_PATH);
    return _backend;
  }

  return null;
}

/* ── Public API ────────────────────────────────────────────────────────── */

export function isRegistryConfigured(): boolean {
  return getBackend() !== null;
}

export async function getCollectionRecord(
  mint: string,
): Promise<CollectionRecord | null> {
  const b = getBackend();
  if (!b) return null;
  return b.getCollection(mint);
}

export async function setCollectionRecord(
  mint: string,
  record: CollectionRecord,
): Promise<void> {
  const b = getBackend();
  if (!b) throw new Error('Registry not configured');
  await b.setCollection(mint, record);
}

export async function mgetCollectionRecords(
  mints: string[],
): Promise<(CollectionRecord | null)[]> {
  const b = getBackend();
  if (!b) return mints.map(() => null);
  return b.mgetCollections(mints);
}

export async function isCollectionMintAllowed(mint: string): Promise<boolean> {
  const record = await getCollectionRecord(mint);
  return record !== null;
}

export async function hasSig(sig: string): Promise<boolean> {
  const b = getBackend();
  if (!b) throw new Error('Registry not configured');
  return b.hasSig(sig);
}

export async function setSig(sig: string): Promise<void> {
  const b = getBackend();
  if (!b) throw new Error('Registry not configured');
  await b.setSig(sig);
}
