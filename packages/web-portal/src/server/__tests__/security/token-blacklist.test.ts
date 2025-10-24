/**
 * Token Blacklist Service Tests
 *
 * MED-002: Verify token revocation with O(1) lookup
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TokenBlacklistService } from '../../services/token-blacklist.js';

describe('Token Blacklist Service (MED-002)', () => {
  let blacklistService: TokenBlacklistService;

  beforeAll(async () => { try {
    // Use test Redis instance
    blacklistService = new TokenBlacklistService({
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix: 'test:token:blacklist:',
      enableLogging: false,
    });
  });

  afterAll(async () => { try {
    await blacklistService.clearAll();
    await blacklistService.close();
  });

  beforeEach(async () => { try {
    await blacklistService.clearAll();
  });

  describe('Token Blacklisting', () => {
    it('should add token to blacklist successfully', async () => { try {
      const tokenId = 'test-token-123';
      const expiresAt = Date.now() + 60000; // 1 minute from now

      const result = await blacklistService.addToBlacklist(tokenId, expiresAt, {
        userId: 'user-123',
        reason: 'logout',
      });

      expect(result).toBe(true);
    });

    it('should detect blacklisted tokens (O(1) lookup)', async () => { try {
      const tokenId = 'test-token-456';
      const expiresAt = Date.now() + 60000;

      await blacklistService.addToBlacklist(tokenId, expiresAt);

      const isBlacklisted = await blacklistService.isBlacklisted(tokenId);
      expect(isBlacklisted).toBe(true);
    });

    it('should return false for non-blacklisted tokens', async () => { try {
      const isBlacklisted = await blacklistService.isBlacklisted('non-existent-token');
      expect(isBlacklisted).toBe(false);
    });

    it('should store token metadata for audit trail', async () => { try {
      const tokenId = 'test-token-789';
      const expiresAt = Date.now() + 60000;

      const result = await blacklistService.addToBlacklist(tokenId, expiresAt, {
        userId: 'user-789',
        reason: 'security',
      });

      expect(result).toBe(true);

      // Token should be blacklisted
      const isBlacklisted = await blacklistService.isBlacklisted(tokenId);
      expect(isBlacklisted).toBe(true);
    });
  });

  describe('Token Expiration', () => {
    it('should not blacklist already expired tokens', async () => { try {
      const tokenId = 'expired-token';
      const expiresAt = Date.now() - 1000; // Already expired

      const result = await blacklistService.addToBlacklist(tokenId, expiresAt);

      // Should return true (success) but not actually store
      expect(result).toBe(true);

      // Token should not be blacklisted (expired)
      const isBlacklisted = await blacklistService.isBlacklisted(tokenId);
      expect(isBlacklisted).toBe(false);
    });

    it('should automatically clean up expired tokens via Redis TTL', async () => { try {
      const tokenId = 'short-lived-token';
      const expiresAt = Date.now() + 2000; // 2 seconds from now

      await blacklistService.addToBlacklist(tokenId, expiresAt);

      // Token should be blacklisted immediately
      let isBlacklisted = await blacklistService.isBlacklisted(tokenId);
      expect(isBlacklisted).toBe(true);

      // Wait for TTL expiration (3 seconds to be safe)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Token should be automatically removed
      isBlacklisted = await blacklistService.isBlacklisted(tokenId);
      expect(isBlacklisted).toBe(false);
    }, 10000); // Increase timeout for this test
  });

  describe('Token Removal', () => {
    it('should remove token from blacklist', async () => { try {
      const tokenId = 'removable-token';
      const expiresAt = Date.now() + 60000;

      await blacklistService.addToBlacklist(tokenId, expiresAt);

      // Verify blacklisted
      let isBlacklisted = await blacklistService.isBlacklisted(tokenId);
      expect(isBlacklisted).toBe(true);

      // Remove from blacklist
      const removed = await blacklistService.removeFromBlacklist(tokenId);
      expect(removed).toBe(true);

      // Verify removed
      isBlacklisted = await blacklistService.isBlacklisted(tokenId);
      expect(isBlacklisted).toBe(false);
    });

    it('should return false when removing non-existent token', async () => { try {
      const removed = await blacklistService.removeFromBlacklist('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Blacklist Statistics', () => {
    it('should return accurate token count', async () => { try {
      const expiresAt = Date.now() + 60000;

      await blacklistService.addToBlacklist('token-1', expiresAt);
      await blacklistService.addToBlacklist('token-2', expiresAt);
      await blacklistService.addToBlacklist('token-3', expiresAt);

      const stats = await blacklistService.getStats();

      expect(stats.count).toBe(3);
      expect(stats.isConnected).toBe(true);
    });

    it('should reflect connection status', async () => { try {
      const stats = await blacklistService.getStats();

      expect(stats.isConnected).toBe(true);
    });
  });

  describe('Race Conditions', () => {
    it('should handle concurrent blacklist operations', async () => { try {
      const expiresAt = Date.now() + 60000;

      // Concurrent blacklisting
      const promises = Array.from({ length: 10 }, (_, i) =>
        blacklistService.addToBlacklist(`concurrent-token-${i}`, expiresAt)
      );

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.every(r => r === true)).toBe(true);

      // All should be blacklisted
      const checkPromises = Array.from({ length: 10 }, (_, i) =>
        blacklistService.isBlacklisted(`concurrent-token-${i}`)
      );

      const checks = await Promise.all(checkPromises);
      expect(checks.every(c => c === true)).toBe(true);
    });

    it('should handle concurrent lookup operations', async () => { try {
      const tokenId = 'lookup-test-token';
      const expiresAt = Date.now() + 60000;

      await blacklistService.addToBlacklist(tokenId, expiresAt);

      // Concurrent lookups
      const promises = Array.from({ length: 50 }, () =>
        blacklistService.isBlacklisted(tokenId)
      );

      const results = await Promise.all(promises);

      // All should return true
      expect(results.every(r => r === true)).toBe(true);
    });
  });

  describe('Audit Logging', () => {
    it('should support different revocation reasons', async () => { try {
      const expiresAt = Date.now() + 60000;

      const reasons: Array<'logout' | 'refresh' | 'revoke' | 'security'> = [
        'logout',
        'refresh',
        'revoke',
        'security',
      ];

      for (const reason of reasons) {
        const result = await blacklistService.addToBlacklist(
          `token-${reason}`,
          expiresAt,
          { userId: 'user-123', reason }
        );

        expect(result).toBe(true);
      }

      // All should be blacklisted
      for (const reason of reasons) {
        const isBlacklisted = await blacklistService.isBlacklisted(`token-${reason}`);
        expect(isBlacklisted).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid expiration timestamps gracefully', async () => { try {
      const tokenId = 'invalid-expiry-token';
      const invalidExpiresAt = -1; // Invalid timestamp

      const result = await blacklistService.addToBlacklist(tokenId, invalidExpiresAt);

      // Should handle gracefully (expired token)
      expect(result).toBe(true);

      const isBlacklisted = await blacklistService.isBlacklisted(tokenId);
      expect(isBlacklisted).toBe(false);
    });

    it('should fail open on Redis connection errors', async () => { try {
      // Create service with invalid Redis URL
      const faultyService = new TokenBlacklistService({
        redisUrl: 'redis://invalid-host:9999',
        keyPrefix: 'test:faulty:',
        enableLogging: false,
      });

      // Should fail open (return false) to avoid breaking authentication
      const isBlacklisted = await faultyService.isBlacklisted('any-token');
      expect(isBlacklisted).toBe(false);

      await faultyService.close();
    });
  });

  describe('Performance', () => {
    it('should perform O(1) lookups', async () => { try {
      const expiresAt = Date.now() + 60000;

      // Add 100 tokens
      const addPromises = Array.from({ length: 100 }, (_, i) =>
        blacklistService.addToBlacklist(`perf-token-${i}`, expiresAt)
      );
      await Promise.all(addPromises);

      // Measure lookup time
      const startTime = Date.now();

      const lookupPromises = Array.from({ length: 100 }, (_, i) =>
        blacklistService.isBlacklisted(`perf-token-${i}`)
      );
      await Promise.all(lookupPromises);

      const duration = Date.now() - startTime;

      // 100 lookups should complete in < 100ms (O(1) performance)
      expect(duration).toBeLessThan(100);
    });
  });
});
