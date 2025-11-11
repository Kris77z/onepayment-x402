import { RateSnapshot } from './types.js';

interface CacheEntry {
  snapshot: RateSnapshot;
  expiresAtMs: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedRate(feedId: string): RateSnapshot | null {
  const entry = cache.get(feedId);
  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiresAtMs) {
    cache.delete(feedId);
    return null;
  }

  return entry.snapshot;
}

export function setCachedRate(snapshot: RateSnapshot, ttlMs: number): void {
  const expiresAtMs = Date.now() + ttlMs;

  cache.set(snapshot.feedId, {
    snapshot: {
      ...snapshot,
      expiresAt: new Date(expiresAtMs).toISOString()
    },
    expiresAtMs
  });
}

export function clearRateCache(): void {
  cache.clear();
}


