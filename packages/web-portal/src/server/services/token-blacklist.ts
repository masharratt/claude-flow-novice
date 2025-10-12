/**
 * JWT Token Blacklist Service
 *
 * MED-002 Fix: Redis-backed token revocation with O(1) lookup
 *
 * Features:
 * - Redis SET-based storage with automatic TTL expiration
 * - O(1) token revocation and lookup performance
 * - Automatic cleanup of expired tokens via Redis TTL
 * - Thread-safe operations with Redis atomic commands
 * - Graceful fallback for Redis connection failures
 */

import { createClient, RedisClientType } from 'redis';

/**
 * Token Blacklist Configuration
 */
interface TokenBlacklistConfig {
  redisUrl?: string;
  keyPrefix?: string;
  enableLogging?: boolean;
}

/**
 * Token metadata for audit trail
 */
interface TokenMetadata {
  tokenId: string;
  userId?: string;
  reason: 'logout' | 'refresh' | 'revoke' | 'security';
  timestamp: number;
  expiresAt: number;
}

/**
 * Token Blacklist Service
 *
 * Redis-backed token revocation with automatic expiration
 */
export class TokenBlacklistService {
  private client: RedisClientType | null = null;
  private keyPrefix: string;
  private enableLogging: boolean;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: TokenBlacklistConfig = {}) {
    this.keyPrefix = config.keyPrefix || 'token:blacklist:';
    this.enableLogging = config.enableLogging ?? true;

    // Initialize Redis client
    const redisUrl = config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = createClient({ url: redisUrl });

    // Error handling
    this.client.on('error', (err) => {
      console.error('[TokenBlacklist] Redis error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      if (this.enableLogging) {
        console.log('[TokenBlacklist] Connected to Redis');
      }
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      if (this.enableLogging) {
        console.warn('[TokenBlacklist] Disconnected from Redis');
      }
      this.isConnected = false;
    });
  }

  /**
   * Connect to Redis (lazy initialization)
   */
  private async ensureConnected(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.client!.connect()
      .then(() => {
        this.connectionPromise = null;
      })
      .catch((err) => {
        this.connectionPromise = null;
        throw err;
      });

    return this.connectionPromise;
  }

  /**
   * Add token to blacklist with automatic TTL expiration
   *
   * @param tokenId - JWT token ID (jti claim)
   * @param expiresAt - Token expiration timestamp (Unix epoch ms)
   * @param metadata - Optional metadata for audit trail
   * @returns true if added successfully, false on failure
   */
  async addToBlacklist(
    tokenId: string,
    expiresAt: number,
    metadata?: Partial<TokenMetadata>
  ): Promise<boolean> {
    try {
      await this.ensureConnected();

      const now = Date.now();
      const ttlSeconds = Math.max(1, Math.floor((expiresAt - now) / 1000));

      // Token already expired, no need to blacklist
      if (ttlSeconds <= 0) {
        if (this.enableLogging) {
          console.log('[TokenBlacklist] Token already expired, skipping blacklist:', tokenId);
        }
        return true;
      }

      const key = this.keyPrefix + tokenId;
      const value: TokenMetadata = {
        tokenId,
        userId: metadata?.userId,
        reason: metadata?.reason || 'revoke',
        timestamp: now,
        expiresAt,
      };

      // Store in Redis with TTL (automatic cleanup)
      await this.client!.set(key, JSON.stringify(value), { EX: ttlSeconds });

      if (this.enableLogging) {
        console.log('[TokenBlacklist] Token blacklisted:', {
          tokenId,
          ttl: ttlSeconds,
          reason: value.reason,
        });
      }

      // Audit log for security events
      this.logSecurityEvent('TOKEN_BLACKLISTED', value);

      return true;
    } catch (error) {
      console.error('[TokenBlacklist] Failed to blacklist token:', error);
      return false;
    }
  }

  /**
   * Check if token is blacklisted (O(1) lookup)
   *
   * @param tokenId - JWT token ID (jti claim)
   * @returns true if blacklisted, false otherwise
   */
  async isBlacklisted(tokenId: string): Promise<boolean> {
    try {
      await this.ensureConnected();

      const key = this.keyPrefix + tokenId;
      const value = await this.client!.get(key);

      return value !== null;
    } catch (error) {
      console.error('[TokenBlacklist] Failed to check blacklist:', error);
      // Fail open (allow token) on Redis errors to avoid breaking authentication
      // Production: Consider fail-closed approach with circuit breaker
      return false;
    }
  }

  /**
   * Remove token from blacklist (early revocation cancellation)
   *
   * @param tokenId - JWT token ID (jti claim)
   * @returns true if removed, false otherwise
   */
  async removeFromBlacklist(tokenId: string): Promise<boolean> {
    try {
      await this.ensureConnected();

      const key = this.keyPrefix + tokenId;
      const result = await this.client!.del(key);

      if (this.enableLogging && result > 0) {
        console.log('[TokenBlacklist] Token removed from blacklist:', tokenId);
      }

      return result > 0;
    } catch (error) {
      console.error('[TokenBlacklist] Failed to remove token from blacklist:', error);
      return false;
    }
  }

  /**
   * Get blacklist statistics
   *
   * @returns Blacklist statistics
   */
  async getStats(): Promise<{ count: number; isConnected: boolean }> {
    try {
      await this.ensureConnected();

      // Count keys matching blacklist prefix
      const keys = await this.client!.keys(this.keyPrefix + '*');

      return {
        count: keys.length,
        isConnected: this.isConnected,
      };
    } catch (error) {
      console.error('[TokenBlacklist] Failed to get stats:', error);
      return {
        count: 0,
        isConnected: false,
      };
    }
  }

  /**
   * Clear all blacklisted tokens (for testing only)
   *
   * WARNING: This will remove all blacklisted tokens!
   */
  async clearAll(): Promise<void> {
    try {
      await this.ensureConnected();

      const keys = await this.client!.keys(this.keyPrefix + '*');

      if (keys.length > 0) {
        await this.client!.del(keys);

        if (this.enableLogging) {
          console.log(`[TokenBlacklist] Cleared ${keys.length} blacklisted tokens`);
        }
      }
    } catch (error) {
      console.error('[TokenBlacklist] Failed to clear blacklist:', error);
    }
  }

  /**
   * Log security event to audit trail
   *
   * In production: Send to centralized logging (Splunk, Datadog, CloudWatch)
   */
  private logSecurityEvent(event: string, metadata: TokenMetadata): void {
    if (!this.enableLogging) {
      return;
    }

    console.log('[SECURITY_AUDIT]', {
      event,
      timestamp: new Date(metadata.timestamp).toISOString(),
      tokenId: metadata.tokenId,
      userId: metadata.userId,
      reason: metadata.reason,
      expiresAt: new Date(metadata.expiresAt).toISOString(),
    });
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;

      if (this.enableLogging) {
        console.log('[TokenBlacklist] Redis connection closed');
      }
    }
  }
}

/**
 * Singleton instance for application-wide use
 */
export const tokenBlacklistService = new TokenBlacklistService({
  redisUrl: process.env.REDIS_URL,
  keyPrefix: 'token:blacklist:',
  enableLogging: process.env.NODE_ENV !== 'production',
});
