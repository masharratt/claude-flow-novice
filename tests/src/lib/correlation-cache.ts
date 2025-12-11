// Stub: correlation cache
// Created to satisfy test imports

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  correlationId: string;
  expiresAt?: Date;
}

export class CorrelationCache {
  private cache: Map<string, CacheEntry> = new Map();

  set<T>(key: string, value: T, correlationId: string, ttlSeconds?: number): void {
    const entry: CacheEntry<T> = {
      key,
      value,
      correlationId,
      expiresAt: ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : undefined,
    };
    this.cache.set(key, entry);
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clearByCorrelation(correlationId: string): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.correlationId === correlationId) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }
}
