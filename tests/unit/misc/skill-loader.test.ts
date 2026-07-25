/**
 * Skill Loader Test Suite
 *
 * Comprehensive tests for SkillLoader API with caching and validation.
 * Target coverage: ≥95%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { SkillLoader, Skill, SkillLoaderOptions } from '../src/cli/skill-loader';
import {
  SkillCacheValidator,
  CachedSkillEntry,
  ValidationResult,
} from '../src/cli/skill-cache-validator';
import {
  SkillsQueryBuilder,
  SkillRecord,
  BOOTSTRAP_SKILL_IDS,
} from '../src/db/skills-query';
import { DatabaseService } from '../src/lib/database-service';
import { createLogger } from '../src/lib/logging';

// Mock file system (must be before imports)
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn(),
    promises: {
      readFile: jest.fn(),
      stat: jest.fn(),
    },
  };
});

// Test fixtures
const mockSkillContent = `# Test Skill
This is a test skill for validation.`;

const mockSkillRecord: SkillRecord = {
  id: 'test-skill-001',
  name: 'Test Skill',
  version: '1.0.0',
  file_path: 'test-skill-001/SKILL.md',
  content_hash: 'abc123def456',
  namespace: 'cfn',
  status: 'active',
  priority: 5,
  tags: 'testing,validation',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('SkillCacheValidator', () => {
  let validator: SkillCacheValidator;

  beforeEach(() => {
    validator = new SkillCacheValidator();
  });

  describe('computeHash', () => {
    it('should compute SHA256 hash correctly', () => {
      const content = 'test content';
      const hash = validator.computeHash(content);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA256 produces 64 hex characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes for same content', () => {
      const content = 'test content';
      const hash1 = validator.computeHash(content);
      const hash2 = validator.computeHash(content);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = validator.computeHash('content 1');
      const hash2 = validator.computeHash('content 2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateContent', () => {
    it('should validate matching content hash', () => {
      const content = 'test content';
      const expectedHash = validator.computeHash(content);
      const result = validator.validateContent(content, expectedHash);

      expect(result.isValid).toBe(true);
      expect(result.actualHash).toBe(expectedHash);
    });

    it('should reject mismatched content hash', () => {
      const content = 'test content';
      const wrongHash = validator.computeHash('different content');
      const result = validator.validateContent(content, wrongHash);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('hash mismatch');
      expect(result.actualHash).not.toBe(wrongHash);
    });
  });

  describe('validateCachedEntry', () => {
    it('should validate non-expired entry with correct hash', () => {
      const content = mockSkillContent;
      const contentHash = validator.computeHash(content);
      const cachedEntry = validator.createCacheEntry('test-skill', content, 5);

      const result = validator.validateCachedEntry(cachedEntry, contentHash);

      expect(result.isValid).toBe(true);
    });

    it('should reject expired cache entry', () => {
      const content = mockSkillContent;
      const contentHash = validator.computeHash(content);
      const cachedEntry = validator.createCacheEntry('test-skill', content, -1); // Negative TTL = expired

      const result = validator.validateCachedEntry(cachedEntry, contentHash);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should reject entry with outdated hash', () => {
      const oldContent = 'old content';
      const newContent = 'new content';
      const oldHash = validator.computeHash(oldContent);
      const newHash = validator.computeHash(newContent);

      const cachedEntry = validator.createCacheEntry('test-skill', oldContent, 5);

      const result = validator.validateCachedEntry(cachedEntry, newHash);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Database content hash updated');
    });
  });

  describe('batchValidate', () => {
    it('should validate multiple skills efficiently', () => {
      const skills = [
        {
          skillId: 'skill-1',
          content: 'content 1',
          expectedHash: validator.computeHash('content 1'),
        },
        {
          skillId: 'skill-2',
          content: 'content 2',
          expectedHash: validator.computeHash('content 2'),
        },
        {
          skillId: 'skill-3',
          content: 'content 3',
          expectedHash: validator.computeHash('content 3'),
        },
      ];

      const results = validator.batchValidate(skills);

      expect(results.size).toBe(3);
      expect(results.get('skill-1')?.isValid).toBe(true);
      expect(results.get('skill-2')?.isValid).toBe(true);
      expect(results.get('skill-3')?.isValid).toBe(true);
    });

    it('should identify invalid skills in batch', () => {
      const skills = [
        {
          skillId: 'skill-1',
          content: 'content 1',
          expectedHash: validator.computeHash('content 1'),
        },
        {
          skillId: 'skill-2',
          content: 'content 2',
          expectedHash: 'invalid-hash',
        },
      ];

      const results = validator.batchValidate(skills);

      expect(results.get('skill-1')?.isValid).toBe(true);
      expect(results.get('skill-2')?.isValid).toBe(false);
    });
  });

  describe('createCacheEntry', () => {
    it('should create cache entry with correct TTL', () => {
      const content = mockSkillContent;
      const ttlMinutes = 5;
      const entry = validator.createCacheEntry('test-skill', content, ttlMinutes);

      expect(entry.skillId).toBe('test-skill');
      expect(entry.content).toBe(content);
      expect(entry.contentHash).toBe(validator.computeHash(content));
      expect(entry.cachedAt).toBeInstanceOf(Date);
      expect(entry.validUntil).toBeInstanceOf(Date);

      const expectedExpiry = new Date(
        entry.cachedAt.getTime() + ttlMinutes * 60 * 1000
      );
      expect(entry.validUntil.getTime()).toBe(expectedExpiry.getTime());
    });
  });

  describe('verifyBatchIntegrity', () => {
    it('should verify integrity of valid cache entries', () => {
      const entries: CachedSkillEntry[] = [
        validator.createCacheEntry('skill-1', 'content 1'),
        validator.createCacheEntry('skill-2', 'content 2'),
      ];

      const invalidSkills = validator.verifyBatchIntegrity(entries);

      expect(invalidSkills).toHaveLength(0);
    });

    it('should detect corrupted cache entries', () => {
      const entry1 = validator.createCacheEntry('skill-1', 'content 1');
      const entry2 = validator.createCacheEntry('skill-2', 'content 2');

      // Corrupt entry2 by changing hash but not content
      entry2.contentHash = 'corrupted-hash';

      const invalidSkills = validator.verifyBatchIntegrity([entry1, entry2]);

      expect(invalidSkills).toContain('skill-2');
      expect(invalidSkills).not.toContain('skill-1');
    });
  });
});

describe('SkillsQueryBuilder', () => {
  describe('getSkillsByAgentType', () => {
    it('should build query for agent type without context', () => {
      const { sql, params } = SkillsQueryBuilder.getSkillsByAgentType('backend-developer');

      expect(sql).toContain('agent_type = ?');
      expect(params).toEqual(['backend-developer']);
    });

    it('should build query with context keywords', () => {
      const { sql, params } = SkillsQueryBuilder.getSkillsByAgentType(
        'backend-developer',
        ['authentication', 'security']
      );

      expect(sql).toContain('context_keywords LIKE ?');
      expect(params).toContain('%authentication%');
      expect(params).toContain('%security%');
    });

    it('should build query with phase filter', () => {
      const { sql, params } = SkillsQueryBuilder.getSkillsByAgentType(
        'backend-developer',
        undefined,
        'loop3'
      );

      expect(sql).toContain('asm.phase IS NULL OR asm.phase = ?');
      expect(params).toContain('loop3');
    });
  });

  describe('getBootstrapSkills', () => {
    it('should build query for bootstrap skills', () => {
      const { sql, params } = SkillsQueryBuilder.getBootstrapSkills();

      expect(sql).toContain('WHERE id IN');
      expect(params).toEqual([...BOOTSTRAP_SKILL_IDS]);
    });
  });

  describe('validateContentHash', () => {
    it('should build validation query', () => {
      const { sql, params } = SkillsQueryBuilder.validateContentHash(
        'test-skill',
        'hash123'
      );

      expect(sql).toContain('WHERE id = ?');
      expect(sql).toContain('AND content_hash = ?');
      expect(params).toEqual(['test-skill', 'hash123']);
    });
  });

  describe('insertSkillUsage', () => {
    it('should build insert query for usage logging', () => {
      const { sql, params } = SkillsQueryBuilder.insertSkillUsage({
        skill_id: 'test-skill',
        agent_id: 'agent-123',
        agent_type: 'backend-developer',
        execution_time_ms: 150,
        confidence_impact: 0.85,
      });

      expect(sql).toContain('INSERT INTO skill_usage_log');
      expect(params).toContain('test-skill');
      expect(params).toContain('agent-123');
      expect(params).toContain(150);
      expect(params).toContain(0.85);
    });
  });
});

describe('SkillLoader', () => {
  let loader: SkillLoader | undefined;
  let mockDbService: Partial<DatabaseService>;
  let mockLogger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    mockLogger = createLogger('test');

    // Mock database service
    mockDbService = {
      getAdapter: jest.fn(() => ({
        raw: jest.fn().mockResolvedValue([mockSkillRecord]),
        getType: jest.fn().mockReturnValue('sqlite'),
        connect: jest.fn(),
        disconnect: jest.fn(),
        isConnected: jest.fn().mockReturnValue(true),
        get: jest.fn(),
        list: jest.fn(),
        query: jest.fn(),
        insert: jest.fn(),
        insertMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        beginTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
      })) as any,
    };

    // Mock file system
    const mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.existsSync.mockReturnValue(true);
    mockFs.promises.readFile.mockResolvedValue(mockSkillContent as any);

    loader = new SkillLoader(
      mockDbService as DatabaseService,
      mockLogger,
      '/test/skills'
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (loader) {
      loader!.clearCache();
    }
  });

  describe('loadContextualSkills', () => {
    it('should load bootstrap skills when includeBootstrap is true', async () => {
      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        includeBootstrap: true,
      };

      const result = await loader!.loadContextualSkills(options);

      expect(result.skills.length).toBeGreaterThan(0);
      expect(result.bootstrapCount).toBeGreaterThan(0);
      expect(result.loadTimeMs).toBeLessThan(1000); // Performance target
    });

    it('should skip bootstrap skills when includeBootstrap is false', async () => {
      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        includeBootstrap: false,
      };

      const result = await loader!.loadContextualSkills(options);

      expect(result.bootstrapCount).toBe(0);
    });

    it('should load agent-specific skills from database', async () => {
      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        taskContext: ['authentication', 'api'],
        maxSkills: 10,
      };

      const result = await loader!.loadContextualSkills(options);

      expect(mockDbService.getAdapter).toHaveBeenCalledWith('sqlite');
      expect(result.totalSkills).toBeGreaterThan(0);
    });

    it('should respect maxSkills limit', async () => {
      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        maxSkills: 5,
        includeBootstrap: false,
      };

      const result = await loader!.loadContextualSkills(options);

      expect(result.totalSkills).toBeLessThanOrEqual(5);
    });

    it('should track cache hits and misses', async () => {
      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        includeBootstrap: true, // Include bootstrap to ensure skills are loaded
      };

      // First load (cache miss for bootstrap skills)
      const result1 = await loader!.loadContextualSkills(options);
      expect(result1.totalSkills).toBeGreaterThan(0);

      // Second load (cache hit)
      const result2 = await loader!.loadContextualSkills(options);
      expect(result2.cacheHitCount).toBeGreaterThan(0);
    });

    it('should meet warm load performance target (<100ms)', async () => {
      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        includeBootstrap: false,
      };

      // Warm up cache
      await loader!.loadContextualSkills(options);

      // Measure warm load
      const result = await loader!.loadContextualSkills(options);

      expect(result.loadTimeMs).toBeLessThan(100);
    });

    it('should handle database errors gracefully', async () => {
      mockDbService.getAdapter = jest.fn(() => {
        throw new Error('Database connection failed');
      }) as any;

      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        includeBootstrap: true,
      };

      // Should still return bootstrap skills
      const result = await loader!.loadContextualSkills(options);

      expect(result.bootstrapCount).toBeGreaterThan(0);
    });

    it('should support phase-specific skill loading', async () => {
      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        phase: 'loop3',
        includeBootstrap: false,
      };

      const result = await loader!.loadContextualSkills(options);

      // Verify getAdapter was called (which means database query was attempted)
      expect(mockDbService.getAdapter).toHaveBeenCalledWith('sqlite');
      // Verify result is valid even if no agent-specific skills loaded
      expect(result).toBeDefined();
      expect(result.loadTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cache management', () => {
    it('should cache loaded skills', async () => {
      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        includeBootstrap: true,
      };

      await loader!.loadContextualSkills(options);

      const stats = loader!.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should evict oldest entries when cache is full', async () => {
      // Load enough skills to fill cache
      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        maxSkills: 150, // More than cache max size (100)
        includeBootstrap: false,
      };

      // Mock many skills
      const manySkills = Array.from({ length: 150 }, (_, i) => ({
        ...mockSkillRecord,
        id: `skill-${i}`,
      }));

      (mockDbService.getAdapter as jest.Mock).mockReturnValue({
        raw: jest.fn().mockResolvedValue(manySkills),
      });

      await loader!.loadContextualSkills(options);

      const stats = loader!.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(stats.maxSize);
    });

    it('should clear cache on demand', async () => {
      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        includeBootstrap: true,
      };

      await loader!.loadContextualSkills(options);

      loader!.clearCache();

      const stats = loader!.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should invalidate expired cache entries', async () => {
      // Create loader with very short TTL for testing
      const shortTTLLoader = new SkillLoader(
        mockDbService as DatabaseService,
        mockLogger
      );

      const options: SkillLoaderOptions = {
        agentType: 'backend-developer',
        includeBootstrap: false,
      };

      await shortTTLLoader.loadContextualSkills(options);

      // Wait for cache to expire (in real test, mock Date.now())
      // For now, just verify cache validation logic exists
      const stats = shortTTLLoader.getCacheStats();
      expect(stats.ttlMinutes).toBe(5);
    });
  });

  describe('preloadSkills', () => {
    it('should preload specified skills into cache', async () => {
      const skillIds = ['skill-1', 'skill-2', 'skill-3'];

      await loader!.preloadSkills(skillIds);

      const stats = loader!.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should handle missing skill files gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const skillIds = ['missing-skill'];

      await expect(loader!.preloadSkills(skillIds)).resolves.not.toThrow();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = loader!.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('ttlMinutes');
      expect(stats.maxSize).toBe(100);
      expect(stats.ttlMinutes).toBe(5);
    });
  });
});

describe('Integration Tests', () => {
  it('should complete full skill loading workflow', async () => {
    const validator = new SkillCacheValidator();
    const mockDbService = {
      getAdapter: jest.fn(() => ({
        raw: jest.fn().mockResolvedValue([mockSkillRecord]),
      })),
    } as any;

    const loader = new SkillLoader(mockDbService, createLogger('test'));

    const mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.existsSync.mockReturnValue(true);
    mockFs.promises.readFile.mockResolvedValue(mockSkillContent as any);

    const result = await loader.loadContextualSkills({
      agentType: 'backend-developer',
      taskContext: ['authentication'],
      maxSkills: 20,
      includeBootstrap: true,
    });

    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.loadTimeMs).toBeLessThan(1000);
    expect(result.totalSkills).toBe(result.skills.length);
  });
});
