// Stub: skill cache
// Created to satisfy test imports

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  expiresAt?: Date;
}

export class SkillCache {
  private cache: Map<string, CacheEntry> = new Map();

  set<T>(key: string, value: T, ttlSeconds?: number): void {
    const entry: CacheEntry<T> = {
      key,
      value,
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

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    return this.cache.has(key) && !this.isExpired(key);
  }

  private isExpired(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry || !entry.expiresAt) return false;
    return entry.expiresAt < new Date();
  }
}
