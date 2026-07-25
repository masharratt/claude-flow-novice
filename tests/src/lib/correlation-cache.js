// Stub: correlation cache (JavaScript)
// Created to satisfy test imports

export class CorrelationCache {
  constructor() {
    this.cache = new Map();
  }

  set(key, value, correlationId, ttlSeconds) {
    const entry = {
      key,
      value,
      correlationId,
      expiresAt: ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : undefined,
    };
    this.cache.set(key, entry);
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clearByCorrelation(correlationId) {
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
