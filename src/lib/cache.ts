/**
 * Simple in-memory cache for expensive RPC / DAS calls.
 *
 * All data is stored in a module-level Map so it persists across re-renders
 * but is cleared on a full page reload.  No server required.
 */

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Return cached data if still valid, otherwise call `fetcher` and cache the
 * result for `ttlSeconds`.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 60,
): Promise<T> {
  const now = Date.now();
  const cached = store.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expires > now) {
    return cached.data;
  }

  const data = await fetcher();
  store.set(key, { data, expires: now + ttlSeconds * 1000 });
  return data;
}

/** Manually invalidate a single cache key. */
export function invalidateCache(key: string) {
  store.delete(key);
}

/** Invalidate all keys that start with `prefix`. */
export function invalidateCachePrefix(prefix: string) {
  const keys = Array.from(store.keys());
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/** Clear everything. */
export function clearCache() {
  store.clear();
}
