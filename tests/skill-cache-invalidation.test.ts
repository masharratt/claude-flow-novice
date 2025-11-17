/**
 * Skill Cache Invalidation Tests
 *
 * Tests for hash-based cache invalidation functionality in SkillLoader and SkillCacheValidator.
 *
 * Coverage targets:
 * - Bulk hash query performance (<100ms for 100 skills)
 * - Cache invalidation on hash mismatch
 * - Atomic cache updates
 * - Graceful degradation
 * - Metrics tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SkillCacheValidator } from '../src/cli/skill-cache-validator';
import { SkillLoader } from '../src/cli/skill-loader';
import { DatabaseService } from '../src/lib/database-service';
import { createLogger } from '../src/lib/logging';

describe('SkillCacheValidator - Bulk Hash Operations', () => {
  let validator: SkillCacheValidator;
  let mockDbService: any;
  let logger: any;

  beforeEach(() => {
    logger = createLogger('test');
    mockDbService = {
      getAdapter: vi.fn().mockReturnValue({
        raw: vi.fn(),
      }),
    };
    validator = new SkillCacheValidator(logger, mockDbService);
  });

  describe('querySkillHashes', () => {
    it('should query hashes in bulk with WHERE IN clause', async () => {
      const skillIds = ['skill-1', 'skill-2', 'skill-3'];
      const mockHashes = [
        { id: 'skill-1', content_hash: 'hash1' },
        { id: 'skill-2', content_hash: 'hash2' },
        { id: 'skill-3', content_hash: 'hash3' },
      ];

      const mockSqlite = mockDbService.getAdapter('sqlite');
      mockSqlite.raw.mockResolvedValue(mockHashes);

      const result = await validator.querySkillHashes(skillIds);

      expect(result.size).toBe(3);
      expect(result.get('skill-1')).toBe('hash1');
      expect(result.get('skill-2')).toBe('hash2');
      expect(result.get('skill-3')).toBe('hash3');

      // Verify single query with WHERE IN
      expect(mockSqlite.raw).toHaveBeenCalledOnce();
      const [sql, params] = mockSqlite.raw.mock.calls[0];
      expect(sql).toContain('WHERE id IN');
      expect(params).toEqual(skillIds);
    });

    it('should complete in <100ms for 100 skills', async () => {
      const skillIds = Array.from({ length: 100 }, (_, i) => `skill-${i}`);
      const mockHashes = skillIds.map((id) => ({
        id,
        content_hash: `hash-${id}`,
      }));

      const mockSqlite = mockDbService.getAdapter('sqlite');
      mockSqlite.raw.mockResolvedValue(mockHashes);

      const startTime = Date.now();
      const result = await validator.querySkillHashes(skillIds);
      const duration = Date.now() - startTime;

      expect(result.size).toBe(100);
      expect(duration).toBeLessThan(100);
    });

    it('should handle empty skill ID array', async () => {
      const result = await validator.querySkillHashes([]);

      expect(result.size).toBe(0);
      expect(mockDbService.getAdapter).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const mockSqlite = mockDbService.getAdapter('sqlite');
      mockSqlite.raw.mockRejectedValue(new Error('Database error'));

      const result = await validator.querySkillHashes(['skill-1']);

      expect(result.size).toBe(0);
    });

    it('should return empty map when database service not configured', async () => {
      const validatorNoDB = new SkillCacheValidator(logger);
      const result = await validatorNoDB.querySkillHashes(['skill-1']);

      expect(result.size).toBe(0);
    });
  });

  describe('validateCachedSkills', () => {
    it('should validate all cached skills against database hashes', async () => {
      const cachedSkills = [
        {
          skillId: 'skill-1',
          content: 'content-1',
          contentHash: 'hash1',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
        {
          skillId: 'skill-2',
          content: 'content-2',
          contentHash: 'hash2',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
      ];

      const mockHashes = [
        { id: 'skill-1', content_hash: 'hash1' },
        { id: 'skill-2', content_hash: 'hash2' },
      ];

      const mockSqlite = mockDbService.getAdapter('sqlite');
      mockSqlite.raw.mockResolvedValue(mockHashes);

      const result = await validator.validateCachedSkills(cachedSkills);

      expect(result.isValid).toBe(true);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(0);
      expect(result.invalidSkillIds).toEqual([]);
    });

    it('should identify skills with hash mismatches', async () => {
      const cachedSkills = [
        {
          skillId: 'skill-1',
          content: 'content-1',
          contentHash: 'old-hash1',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
        {
          skillId: 'skill-2',
          content: 'content-2',
          contentHash: 'hash2',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
      ];

      const mockHashes = [
        { id: 'skill-1', content_hash: 'new-hash1' }, // Hash changed
        { id: 'skill-2', content_hash: 'hash2' },
      ];

      const mockSqlite = mockDbService.getAdapter('sqlite');
      mockSqlite.raw.mockResolvedValue(mockHashes);

      const result = await validator.validateCachedSkills(cachedSkills);

      expect(result.isValid).toBe(false);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(1);
      expect(result.invalidSkillIds).toEqual(['skill-1']);
    });

    it('should identify skills not found in database', async () => {
      const cachedSkills = [
        {
          skillId: 'skill-1',
          content: 'content-1',
          contentHash: 'hash1',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
        {
          skillId: 'skill-2',
          content: 'content-2',
          contentHash: 'hash2',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
      ];

      const mockHashes = [
        { id: 'skill-1', content_hash: 'hash1' },
        // skill-2 not in database
      ];

      const mockSqlite = mockDbService.getAdapter('sqlite');
      mockSqlite.raw.mockResolvedValue(mockHashes);

      const result = await validator.validateCachedSkills(cachedSkills);

      expect(result.isValid).toBe(false);
      expect(result.invalidSkillIds).toContain('skill-2');
    });

    it('should complete in <100ms for 100 skills', async () => {
      const cachedSkills = Array.from({ length: 100 }, (_, i) => ({
        skillId: `skill-${i}`,
        content: `content-${i}`,
        contentHash: `hash-${i}`,
        cachedAt: new Date(),
        validUntil: new Date(Date.now() + 60000),
      }));

      const mockHashes = cachedSkills.map((skill) => ({
        id: skill.skillId,
        content_hash: skill.contentHash,
      }));

      const mockSqlite = mockDbService.getAdapter('sqlite');
      mockSqlite.raw.mockResolvedValue(mockHashes);

      const startTime = Date.now();
      const result = await validator.validateCachedSkills(cachedSkills);
      const duration = Date.now() - startTime;

      expect(result.isValid).toBe(true);
      expect(result.validCount).toBe(100);
      expect(duration).toBeLessThan(100);
    });

    it('should handle empty cached skills array', async () => {
      const result = await validator.validateCachedSkills([]);

      expect(result.isValid).toBe(true);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(0);
      expect(result.durationMs).toBe(0);
    });
  });
});

describe('SkillLoader - Cache Invalidation Integration', () => {
  let loader: SkillLoader;
  let mockDbService: any;
  let logger: any;

  beforeEach(() => {
    logger = createLogger('test');
    mockDbService = {
      getAdapter: vi.fn().mockReturnValue({
        raw: vi.fn(),
      }),
    };
    loader = new SkillLoader(mockDbService, logger, '/tmp/test-skills');
  });

  describe('loadContextualSkills', () => {
    it('should validate cache before loading skills', async () => {
      const mockSqlite = mockDbService.getAdapter('sqlite');

      // Mock hash query (for cache validation)
      mockSqlite.raw
        .mockResolvedValueOnce([]) // Hash query returns empty (no cached skills initially)
        .mockResolvedValueOnce([]); // Agent skills query returns empty

      const result = await loader.loadContextualSkills({
        agentType: 'test-agent',
        includeBootstrap: false,
      });

      expect(result.cacheInvalidationCount).toBe(0);
    });

    it('should invalidate cache entries with hash mismatches', async () => {
      // Pre-populate cache with a skill
      (loader as any).cache.set('skill-1', {
        data: {
          skillId: 'skill-1',
          content: 'content-1',
          contentHash: 'old-hash1',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
        lastAccessed: new Date(),
      });

      const mockSqlite = mockDbService.getAdapter('sqlite');

      // Mock hash query (skill-1 has new hash)
      mockSqlite.raw
        .mockResolvedValueOnce([
          { id: 'skill-1', content_hash: 'new-hash1' },
        ])
        .mockResolvedValueOnce([]); // Agent skills query returns empty

      const result = await loader.loadContextualSkills({
        agentType: 'test-agent',
        includeBootstrap: false,
      });

      expect(result.cacheInvalidationCount).toBe(1);

      // Verify cache entry was removed
      expect((loader as any).cache.has('skill-1')).toBe(false);
    });

    it('should preserve valid cache entries', async () => {
      // Pre-populate cache with a skill
      (loader as any).cache.set('skill-1', {
        data: {
          skillId: 'skill-1',
          content: 'content-1',
          contentHash: 'hash1',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
        lastAccessed: new Date(),
      });

      const mockSqlite = mockDbService.getAdapter('sqlite');

      // Mock hash query (skill-1 has same hash)
      mockSqlite.raw
        .mockResolvedValueOnce([
          { id: 'skill-1', content_hash: 'hash1' },
        ])
        .mockResolvedValueOnce([]); // Agent skills query returns empty

      const result = await loader.loadContextualSkills({
        agentType: 'test-agent',
        includeBootstrap: false,
      });

      expect(result.cacheInvalidationCount).toBe(0);

      // Verify cache entry was preserved
      expect((loader as any).cache.has('skill-1')).toBe(true);
    });
  });

  describe('validateCache', () => {
    it('should validate all cached entries and remove invalid ones', async () => {
      // Pre-populate cache
      (loader as any).cache.set('skill-1', {
        data: {
          skillId: 'skill-1',
          content: 'content-1',
          contentHash: 'old-hash1',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
        lastAccessed: new Date(),
      });

      (loader as any).cache.set('skill-2', {
        data: {
          skillId: 'skill-2',
          content: 'content-2',
          contentHash: 'hash2',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
        lastAccessed: new Date(),
      });

      const mockSqlite = mockDbService.getAdapter('sqlite');
      mockSqlite.raw.mockResolvedValue([
        { id: 'skill-1', content_hash: 'new-hash1' }, // Changed hash
        { id: 'skill-2', content_hash: 'hash2' }, // Same hash
      ]);

      const result = await loader.validateCache();

      expect(result.isValid).toBe(false);
      expect(result.invalidCount).toBe(1);
      expect(result.invalidSkillIds).toEqual(['skill-1']);

      // Verify invalid entry was removed
      expect((loader as any).cache.has('skill-1')).toBe(false);
      expect((loader as any).cache.has('skill-2')).toBe(true);
    });

    it('should handle database service not configured', async () => {
      const loaderNoDB = new SkillLoader(undefined, logger);

      const result = await loaderNoDB.validateCache();

      expect(result.isValid).toBe(true);
      expect(result.invalidCount).toBe(0);
    });
  });

  describe('Atomic Cache Updates', () => {
    it('should not leave cache in inconsistent state on error', async () => {
      const mockSqlite = mockDbService.getAdapter('sqlite');
      mockSqlite.raw.mockRejectedValue(new Error('Database error'));

      // Pre-populate cache
      (loader as any).cache.set('skill-1', {
        data: {
          skillId: 'skill-1',
          content: 'content-1',
          contentHash: 'hash1',
          cachedAt: new Date(),
          validUntil: new Date(Date.now() + 60000),
        },
        lastAccessed: new Date(),
      });

      const cacheStateBefore = (loader as any).cache.size;

      try {
        await loader.validateCache();
      } catch (error) {
        // Error is expected
      }

      const cacheStateAfter = (loader as any).cache.size;

      // Cache should remain unchanged on error
      expect(cacheStateBefore).toBe(cacheStateAfter);
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue loading skills when cache validation fails', async () => {
      const mockSqlite = mockDbService.getAdapter('sqlite');
      mockSqlite.raw
        .mockRejectedValueOnce(new Error('Validation error'))
        .mockResolvedValueOnce([]); // Agent skills query succeeds

      const result = await loader.loadContextualSkills({
        agentType: 'test-agent',
        includeBootstrap: false,
      });

      // Should complete successfully despite validation error
      expect(result.totalSkills).toBe(0);
      expect(result.cacheInvalidationCount).toBe(0);
    });

    it('should handle database service unavailable during validation', async () => {
      const loaderNoDB = new SkillLoader(undefined, logger);

      const result = await loaderNoDB.loadContextualSkills({
        agentType: 'test-agent',
        includeBootstrap: false,
      });

      // Should complete successfully without validation
      expect(result.cacheInvalidationCount).toBe(0);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track cache invalidation count in load result', async () => {
      // Pre-populate cache with 3 skills
      for (let i = 1; i <= 3; i++) {
        (loader as any).cache.set(`skill-${i}`, {
          data: {
            skillId: `skill-${i}`,
            content: `content-${i}`,
            contentHash: `old-hash${i}`,
            cachedAt: new Date(),
            validUntil: new Date(Date.now() + 60000),
          },
          lastAccessed: new Date(),
        });
      }

      const mockSqlite = mockDbService.getAdapter('sqlite');

      // Mock: all skills have new hashes
      mockSqlite.raw
        .mockResolvedValueOnce([
          { id: 'skill-1', content_hash: 'new-hash1' },
          { id: 'skill-2', content_hash: 'new-hash2' },
          { id: 'skill-3', content_hash: 'new-hash3' },
        ])
        .mockResolvedValueOnce([]); // Agent skills query

      const result = await loader.loadContextualSkills({
        agentType: 'test-agent',
        includeBootstrap: false,
      });

      expect(result.cacheInvalidationCount).toBe(3);
    });
  });
});

describe('Performance Benchmarks', () => {
  it('should query 100 skill hashes in <100ms', async () => {
    const logger = createLogger('test');
    const mockDbService = {
      getAdapter: vi.fn().mockReturnValue({
        raw: vi.fn().mockResolvedValue(
          Array.from({ length: 100 }, (_, i) => ({
            id: `skill-${i}`,
            content_hash: `hash-${i}`,
          }))
        ),
      }),
    };

    const validator = new SkillCacheValidator(logger, mockDbService);
    const skillIds = Array.from({ length: 100 }, (_, i) => `skill-${i}`);

    const startTime = Date.now();
    await validator.querySkillHashes(skillIds);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(100);
  });

  it('should validate 100 cached skills in <100ms', async () => {
    const logger = createLogger('test');
    const mockDbService = {
      getAdapter: vi.fn().mockReturnValue({
        raw: vi.fn().mockResolvedValue(
          Array.from({ length: 100 }, (_, i) => ({
            id: `skill-${i}`,
            content_hash: `hash-${i}`,
          }))
        ),
      }),
    };

    const validator = new SkillCacheValidator(logger, mockDbService);
    const cachedSkills = Array.from({ length: 100 }, (_, i) => ({
      skillId: `skill-${i}`,
      content: `content-${i}`,
      contentHash: `hash-${i}`,
      cachedAt: new Date(),
      validUntil: new Date(Date.now() + 60000),
    }));

    const startTime = Date.now();
    await validator.validateCachedSkills(cachedSkills);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(100);
  });
});
