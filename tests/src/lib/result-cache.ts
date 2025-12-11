// Stub: result cache
// Created to satisfy test imports

export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
}

export class ResultCache<K = string, V = unknown> {
  private cache: Map<K, { value: V; expiresAt: number }> = new Map();
  private options: CacheOptions;

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl || 300000, // 5 minutes default
      maxSize: options.maxSize || 1000,
    };
  }

  set(key: K, value: V, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.options.ttl!);
    this.cache.set(key, { value, expiresAt });

    // Simple size limit enforcement
    if (this.cache.size > this.options.maxSize!) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
