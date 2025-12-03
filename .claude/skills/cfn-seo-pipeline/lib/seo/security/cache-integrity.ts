/**
 * Cache Integrity and HMAC Signing Module
 *
 * Provides cryptographic signing of cache entries to ensure:
 * - Cache data has not been tampered with (integrity)
 * - Cache entries are from trusted source
 * - Stale cache entries are rejected based on timestamp
 *
 * Addresses SEC-1.4: Unencrypted Cache Storage
 *
 * Uses HMAC-SHA256 for cache signing with configurable TTL
 *
 * @module seo/security/cache-integrity
 */

import * as crypto from 'crypto';

/**
 * Signed cache entry with integrity verification
 */
export interface SignedCacheEntry<T> {
  data: T;
  signature: string;
  timestamp: number;
  version: string;
  ttlSeconds?: number;
}

/**
 * Configuration for cache integrity
 */
export interface CacheIntegrityConfig {
  secret?: string;
  defaultTTL?: number; // TTL in seconds
  version?: string;
  allowClockSkew?: number; // Allow time skew in seconds (default: 300)
}

/**
 * Cache integrity manager
 */
export class CacheIntegrityManager {
  private secret: string;
  private defaultTTL: number;
  private version: string;
  private allowClockSkew: number;

  /**
   * Initialize cache integrity manager
   *
   * @param config - Configuration object
   * @throws Error if secret is not provided or invalid
   */
  constructor(config: CacheIntegrityConfig = {}) {
    // Load secret from environment or config
    this.secret = config.secret || process.env.CACHE_INTEGRITY_SECRET || '';

    if (!this.secret) {
      throw new Error('CACHE_INTEGRITY_SECRET environment variable or config.secret required for cache signing');
    }

    if (this.secret.length < 32) {
      throw new Error('CACHE_INTEGRITY_SECRET must be at least 32 characters');
    }

    this.defaultTTL = config.defaultTTL || 14 * 24 * 60 * 60; // 14 days default
    this.version = config.version || '1.0.0';
    this.allowClockSkew = config.allowClockSkew || 300; // 5 minutes default
  }

  /**
   * Sign and wrap a cache entry
   *
   * Creates HMAC-SHA256 signature over data, timestamp, and version
   * Signature includes all data needed for verification
   *
   * @param data - Data to sign (will be JSON serialized)
   * @param ttlSeconds - Optional TTL override (defaults to defaultTTL)
   * @returns Signed cache entry with signature
   */
  signCacheEntry<T>(data: T, ttlSeconds?: number): SignedCacheEntry<T> {
    const timestamp = Math.floor(Date.now() / 1000);
    const ttl = ttlSeconds || this.defaultTTL;

    // Step 1: Serialize data to canonical JSON
    const dataJson = JSON.stringify(this.canonicalizeData(data));

    // Step 2: Create signature over: data || timestamp || version || ttl
    const signatureInput = `${dataJson}|${timestamp}|${this.version}|${ttl}`;
    const signature = this.createSignature(signatureInput);

    // Step 3: Return signed entry
    return {
      data,
      signature,
      timestamp,
      version: this.version,
      ttlSeconds: ttl,
    };
  }

  /**
   * Verify and extract data from signed cache entry
   *
   * Checks:
   * - HMAC-SHA256 signature matches
   * - Timestamp is recent (within TTL + clock skew)
   * - Version matches or is compatible
   *
   * @param entry - Signed cache entry to verify
   * @returns Extracted data or null if verification fails
   */
  verifyCacheEntry<T>(entry: SignedCacheEntry<T>): T | null {
    try {
      // Step 1: Check basic structure
      if (!entry || !entry.signature || !entry.timestamp || !entry.version) {
        return null;
      }

      // Step 2: Check version compatibility
      if (entry.version !== this.version) {
        // Could implement version migration here if needed
        // For now, reject mismatched versions
        return null;
      }

      // Step 3: Check TTL
      const ttl = entry.ttlSeconds || this.defaultTTL;
      const now = Math.floor(Date.now() / 1000);
      const age = now - entry.timestamp;

      // Allow for clock skew
      if (age > ttl + this.allowClockSkew) {
        return null; // Entry is expired
      }

      if (age < -this.allowClockSkew) {
        return null; // Entry timestamp is in the future (clock issue)
      }

      // Step 4: Verify signature
      const dataJson = JSON.stringify(this.canonicalizeData(entry.data));
      const signatureInput = `${dataJson}|${entry.timestamp}|${entry.version}|${ttl}`;
      const expectedSignature = this.createSignature(signatureInput);

      // Use constant-time comparison to prevent timing attacks
      if (!this.constantTimeCompare(entry.signature, expectedSignature)) {
        return null; // Signature mismatch - data was tampered with
      }

      // Step 5: Return verified data
      return entry.data;
    } catch (error) {
      // Any error in verification means reject the entry
      return null;
    }
  }

  /**
   * Create HMAC-SHA256 signature
   *
   * @param input - Input string to sign
   * @returns Signature as hex string
   */
  private createSignature(input: string): string {
    return crypto.createHmac('sha256', this.secret).update(input).digest('hex');
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   *
   * @param a - First string
   * @param b - Second string
   * @returns true if strings match
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Canonicalize data for consistent hashing
   *
   * Ensures object properties are in consistent order
   * Removes undefined values and functions
   *
   * @param data - Data to canonicalize
   * @returns Canonical representation
   */
  private canonicalizeData(data: unknown): unknown {
    if (data === null || data === undefined) {
      return null;
    }

    if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.canonicalizeData(item));
    }

    if (typeof data === 'object') {
      const canonical: Record<string, unknown> = {};
      // Sort keys for consistent ordering
      const keys = Object.keys(data).sort();

      for (const key of keys) {
        const value = (data as Record<string, unknown>)[key];
        // Skip undefined and functions
        if (value !== undefined && typeof value !== 'function') {
          canonical[key] = this.canonicalizeData(value);
        }
      }
      return canonical;
    }

    return data;
  }

  /**
   * Get cache entry age in seconds
   *
   * @param entry - Cache entry to check
   * @returns Age in seconds
   */
  getEntryAge<T>(entry: SignedCacheEntry<T>): number {
    const now = Math.floor(Date.now() / 1000);
    return now - entry.timestamp;
  }

  /**
   * Check if cache entry is expired
   *
   * @param entry - Cache entry to check
   * @returns true if entry is expired
   */
  isEntryExpired<T>(entry: SignedCacheEntry<T>): boolean {
    const ttl = entry.ttlSeconds || this.defaultTTL;
    const age = this.getEntryAge(entry);
    return age > ttl + this.allowClockSkew;
  }

  /**
   * Get freshness score (0-1) where 1.0 is fresh and 0.0 is expired
   *
   * @param entry - Cache entry to check
   * @returns Freshness score
   */
  getFreshnessScore<T>(entry: SignedCacheEntry<T>): number {
    const ttl = entry.ttlSeconds || this.defaultTTL;
    const age = this.getEntryAge(entry);

    if (age < 0) {
      return 1.0; // Future timestamp (clock skew)
    }

    return Math.max(0, 1.0 - age / ttl);
  }
}

/**
 * Singleton instance of cache integrity manager
 * Initialized on first access with environment variables
 */
let cacheIntegrityInstance: CacheIntegrityManager | null = null;

/**
 * Get or create singleton cache integrity manager
 *
 * @param config - Optional config override
 * @returns Cache integrity manager instance
 */
export function getCacheIntegrityManager(config?: CacheIntegrityConfig): CacheIntegrityManager {
  if (!cacheIntegrityInstance) {
    cacheIntegrityInstance = new CacheIntegrityManager(config);
  }
  return cacheIntegrityInstance;
}

/**
 * Sign a cache entry using singleton manager
 *
 * @param data - Data to sign
 * @param ttlSeconds - Optional TTL override
 * @returns Signed cache entry
 */
export function signCacheEntry<T>(data: T, ttlSeconds?: number): SignedCacheEntry<T> {
  const manager = getCacheIntegrityManager();
  return manager.signCacheEntry(data, ttlSeconds);
}

/**
 * Verify a signed cache entry using singleton manager
 *
 * @param entry - Entry to verify
 * @returns Verified data or null
 */
export function verifyCacheEntry<T>(entry: SignedCacheEntry<T>): T | null {
  const manager = getCacheIntegrityManager();
  return manager.verifyCacheEntry(entry);
}

/**
 * Wrap a cached value with signature before storing in Redis/database
 *
 * Usage:
 * ```typescript
 * const cachedData = { keywords: [...] };
 * const signed = wrapCacheValue(cachedData, 7 * 24 * 60 * 60); // 7 days
 * await redis.set('key', JSON.stringify(signed));
 * ```
 *
 * @param value - Value to wrap
 * @param ttlSeconds - TTL in seconds
 * @returns Wrapped value ready for storage
 */
export function wrapCacheValue<T>(value: T, ttlSeconds?: number): SignedCacheEntry<T> {
  return signCacheEntry(value, ttlSeconds);
}

/**
 * Unwrap and verify a cached value from storage
 *
 * Usage:
 * ```typescript
 * const stored = await redis.get('key');
 * const data = unwrapCacheValue(JSON.parse(stored));
 * if (!data) {
 *   // Cache entry was tampered with or expired
 * }
 * ```
 *
 * @param wrapped - Wrapped value from storage
 * @returns Unwrapped data or null if verification fails
 */
export function unwrapCacheValue<T>(wrapped: SignedCacheEntry<T>): T | null {
  return verifyCacheEntry(wrapped);
}

/**
 * Create a cache wrapper for automatic signing/verification
 *
 * Useful for wrapping Redis or database operations
 *
 * @param readFn - Function that reads from cache
 * @param writeFn - Function that writes to cache
 * @returns Wrapped functions with automatic signing
 */
export function createCacheWrapper<T>(
  readFn: (key: string) => Promise<string | null>,
  writeFn: (key: string, value: string) => Promise<void>,
) {
  return {
    /**
     * Read and verify from cache
     */
    read: async (key: string): Promise<T | null> => {
      try {
        const stored = await readFn(key);
        if (!stored) {
          return null;
        }

        const wrapped = JSON.parse(stored) as SignedCacheEntry<T>;
        return verifyCacheEntry(wrapped);
      } catch (error) {
        return null;
      }
    },

    /**
     * Sign and write to cache
     */
    write: async (key: string, data: T, ttlSeconds?: number): Promise<void> => {
      const signed = signCacheEntry(data, ttlSeconds);
      await writeFn(key, JSON.stringify(signed));
    },
  };
}
