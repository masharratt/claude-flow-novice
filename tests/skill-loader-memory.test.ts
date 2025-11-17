/**
 * Skill Loader with Memory Budget - Test Suite
 *
 * TDD tests for SkillLoader with memory budget constraints, lazy loading,
 * and LRU eviction. Written FIRST before implementation.
 *
 * Target coverage: >90%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SkillLoader, SkillMetadata, SkillContent } from '../src/services/skill-loader';
import { LRUSkillCache } from '../src/lib/skill-cache';
import { DatabaseService } from '../src/lib/database-service';
import { createLogger } from '../src/lib/logging';

describe('SkillLoader with Memory Budget', () => {
  let loader: SkillLoader;
  let dbService: DatabaseService;
  let testSkillsDir: string;

  beforeEach(async () => {
    // Setup test database
    dbService = new DatabaseService({
      sqlite: {
        type: 'sqlite',
        database: ':memory:',
      },
    });

    // Get SQLite adapter and connect
    const sqliteAdapter = dbService.getAdapter('sqlite');
    await sqliteAdapter.connect();

    // Run migration
    const migrationSQL = await fs.readFile(
      path.join(process.cwd(), 'src/db/migrations/up/007-skill-metadata-schema.sql'),
      'utf-8'
    );
    await sqliteAdapter.raw(migrationSQL);

    // Setup test skills directory
    testSkillsDir = path.join(process.cwd(), '.test-skills');
    await fs.mkdir(testSkillsDir, { recursive: true });

    // Create loader with small memory budget for testing (1MB)
    loader = new SkillLoader({
      dbService,
      maxMemoryBytes: 1024 * 1024, // 1MB
      skillsBasePath: testSkillsDir,
      logger: createLogger('test-skill-loader'),
    });
  });

  afterEach(async () => {
    const sqliteAdapter = dbService.getAdapter('sqlite');
    await sqliteAdapter.disconnect();
    await fs.rm(testSkillsDir, { recursive: true, force: true });
  });

  describe('Lazy Loading', () => {
    it('should load only metadata at startup, not content', async () => {
      // Create test skills
      await createTestSkill(testSkillsDir, 'skill-001', 10000); // 10KB
      await createTestSkill(testSkillsDir, 'skill-002', 10000);

      // Initialize loader (scans metadata only)
      await loader.initialize();

      // Check memory usage is minimal (only metadata, not content)
      const metrics = loader.getMetrics();
      expect(metrics.memoryUsageBytes).toBeLessThan(50000); // <50KB for metadata
      expect(metrics.skillsLoaded).toBe(2);
      expect(metrics.skillContentLoaded).toBe(0); // No content loaded yet
    });

    it('should load content on first access', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await loader.initialize();

      const startMetrics = loader.getMetrics();
      expect(startMetrics.skillContentLoaded).toBe(0);

      // Load skill content (lazy)
      const skill = await loader.loadSkill('skill-001');

      expect(skill.content).toBeDefined();
      expect(skill.content!.markdown).toContain('Test Skill skill-001');

      const endMetrics = loader.getMetrics();
      expect(endMetrics.skillContentLoaded).toBe(1);
      expect(endMetrics.cacheHits).toBe(0); // First load is cache miss
      expect(endMetrics.cacheMisses).toBe(1);
    });

    it('should return cached content on subsequent access', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await loader.initialize();

      // First load
      await loader.loadSkill('skill-001');

      // Second load (should hit cache)
      const startTime = Date.now();
      const skill = await loader.loadSkill('skill-001');
      const loadTime = Date.now() - startTime;

      expect(skill.content).toBeDefined();
      expect(loadTime).toBeLessThan(100); // <100ms for cache hit

      const metrics = loader.getMetrics();
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(1); // Only first load
    });
  });

  describe('Memory Budget Enforcement', () => {
    it('should enforce 100MB memory budget', async () => {
      // Create loader with 100MB budget
      const prodLoader = new SkillLoader({
        dbService,
        maxMemoryBytes: 100 * 1024 * 1024,
        skillsBasePath: testSkillsDir,
      });

      await prodLoader.initialize();

      const config = prodLoader.getConfig();
      expect(config.maxMemoryBytes).toBe(100 * 1024 * 1024);
    });

    it('should track memory usage accurately', async () => {
      // Create skills with known sizes
      await createTestSkill(testSkillsDir, 'skill-001', 50000); // 50KB
      await createTestSkill(testSkillsDir, 'skill-002', 30000); // 30KB
      await loader.initialize();

      // Load both skills
      await loader.loadSkill('skill-001');
      await loader.loadSkill('skill-002');

      const metrics = loader.getMetrics();
      // Should track content + metadata overhead (50KB + 30KB = 80KB)
      expect(metrics.memoryUsageBytes).toBeGreaterThan(75000); // Allow some variance
      expect(metrics.memoryUsageBytes).toBeLessThan(100000);
    });

    it('should evict LRU entry when memory budget exceeded', async () => {
      // Create 5 skills, each 300KB (total 1.5MB > 1MB budget)
      for (let i = 1; i <= 5; i++) {
        await createTestSkill(testSkillsDir, `skill-00${i}`, 300000);
      }
      await loader.initialize();

      // Load all 5 skills (should trigger eviction)
      for (let i = 1; i <= 5; i++) {
        await loader.loadSkill(`skill-00${i}`);
      }

      const metrics = loader.getMetrics();
      expect(metrics.memoryUsageBytes).toBeLessThanOrEqual(1024 * 1024); // <= 1MB
      expect(metrics.evictions).toBeGreaterThan(0);
      expect(metrics.skillContentLoaded).toBeLessThan(5); // Some evicted
    });

    it('should evict oldest accessed skill first (LRU)', async () => {
      // Create 4 skills, each 300KB
      for (let i = 1; i <= 4; i++) {
        await createTestSkill(testSkillsDir, `skill-00${i}`, 300000);
      }
      await loader.initialize();

      // Load skills 1, 2, 3 (in order)
      await loader.loadSkill('skill-001');
      await loader.loadSkill('skill-002');
      await loader.loadSkill('skill-003');

      // Access skill-001 again (make it most recent)
      await loader.loadSkill('skill-001');

      // Load skill-004 (should evict skill-002, the LRU)
      await loader.loadSkill('skill-004');

      const metrics = loader.getMetrics();
      expect(metrics.evictions).toBeGreaterThan(0);

      // Verify skill-001 still in cache (was accessed recently)
      const startTime = Date.now();
      await loader.loadSkill('skill-001');
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(100); // Cache hit
    });
  });

  describe('Hash Validation', () => {
    it('should validate skill hash on load', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await loader.initialize();

      const skill = await loader.loadSkill('skill-001');

      // Hash should be SHA-256
      expect(skill.hash).toHaveLength(64); // SHA-256 hex string
      expect(skill.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should detect hash mismatch and reload', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await loader.initialize();

      // First load
      const skill1 = await loader.loadSkill('skill-001');
      const hash1 = skill1.hash;

      // Modify skill file
      const skillPath = path.join(testSkillsDir, 'skill-001', 'SKILL.md');
      await fs.appendFile(skillPath, '\n\nModified content');

      // Second load (should detect hash mismatch)
      const skill2 = await loader.loadSkill('skill-001');
      const hash2 = skill2.hash;

      expect(hash2).not.toBe(hash1);

      const metrics = loader.getMetrics();
      expect(metrics.hashMismatches).toBeGreaterThan(0);
    });

    it('should cache invalidation on hash mismatch', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await loader.initialize();

      // Load and cache
      await loader.loadSkill('skill-001');

      // Modify file
      const skillPath = path.join(testSkillsDir, 'skill-001', 'SKILL.md');
      await fs.appendFile(skillPath, '\n\nNew content');

      // Load again (should invalidate cache)
      await loader.loadSkill('skill-001');

      const metrics = loader.getMetrics();
      expect(metrics.cacheInvalidations).toBeGreaterThan(0);
    });
  });

  describe('Performance Requirements', () => {
    it('should initialize in <2s for 500 skills', async () => {
      // Create 500 small skills
      const skillPromises = [];
      for (let i = 1; i <= 500; i++) {
        skillPromises.push(createTestSkill(testSkillsDir, `skill-${i.toString().padStart(3, '0')}`, 30000));
      }
      await Promise.all(skillPromises);

      // Measure initialization time
      const startTime = Date.now();
      await loader.initialize();
      const initTime = Date.now() - startTime;

      expect(initTime).toBeLessThan(2000); // <2s

      const metrics = loader.getMetrics();
      expect(metrics.skillsLoaded).toBe(500);
      expect(metrics.skillContentLoaded).toBe(0); // No content loaded at startup
    }, 10000); // 10s timeout for this test

    it('should load from cache in <100ms', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await loader.initialize();

      // First load (cache miss)
      await loader.loadSkill('skill-001');

      // Second load (cache hit)
      const startTime = Date.now();
      await loader.loadSkill('skill-001');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(100); // <100ms
    });

    it('should load from disk in <500ms', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 50000); // 50KB
      await loader.initialize();

      // First load (cache miss, from disk)
      const startTime = Date.now();
      await loader.loadSkill('skill-001');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(500); // <500ms
    });
  });

  describe('Concurrent Loading', () => {
    it('should handle concurrent skill loading', async () => {
      // Create 10 skills
      for (let i = 1; i <= 10; i++) {
        await createTestSkill(testSkillsDir, `skill-00${i}`, 10000);
      }
      await loader.initialize();

      // Load all skills concurrently
      const loadPromises = [];
      for (let i = 1; i <= 10; i++) {
        loadPromises.push(loader.loadSkill(`skill-00${i}`));
      }

      const skills = await Promise.all(loadPromises);

      expect(skills).toHaveLength(10);
      skills.forEach((skill, idx) => {
        expect(skill.id).toBe(`skill-00${idx + 1}`);
        expect(skill.content).toBeDefined();
      });
    });

    it('should prevent duplicate loading of same skill', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await loader.initialize();

      // Load same skill concurrently (should only load once)
      const loadPromises = [
        loader.loadSkill('skill-001'),
        loader.loadSkill('skill-001'),
        loader.loadSkill('skill-001'),
      ];

      const skills = await Promise.all(loadPromises);

      expect(skills).toHaveLength(3);
      // All get the same content (loaded once, then cached)
      expect(skills[0].content.markdown).toBe(skills[1].content.markdown);
      expect(skills[1].content.markdown).toBe(skills[2].content.markdown);

      const metrics = loader.getMetrics();
      expect(metrics.cacheMisses).toBe(1); // Only loaded once from disk
      // Note: Concurrent loads all wait on same promise, so no cache hits yet
      // Cache hits happen on subsequent (non-concurrent) loads
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track comprehensive metrics', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await createTestSkill(testSkillsDir, 'skill-002', 10000);
      await loader.initialize();

      await loader.loadSkill('skill-001');
      await loader.loadSkill('skill-002');
      await loader.loadSkill('skill-001'); // Cache hit

      const metrics = loader.getMetrics();

      expect(metrics).toHaveProperty('skillsLoaded', 2);
      expect(metrics).toHaveProperty('skillContentLoaded');
      expect(metrics).toHaveProperty('memoryUsageBytes');
      expect(metrics).toHaveProperty('cacheHits');
      expect(metrics).toHaveProperty('cacheMisses');
      expect(metrics).toHaveProperty('evictions');
      expect(metrics).toHaveProperty('hashMismatches');
      expect(metrics).toHaveProperty('cacheHitRate');

      expect(metrics.cacheHitRate).toBeCloseTo(0.33, 1); // 1 hit / 3 loads
    });

    it('should reset metrics', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await loader.initialize();
      await loader.loadSkill('skill-001');

      const beforeReset = loader.getMetrics();
      expect(beforeReset.cacheMisses).toBeGreaterThan(0);

      loader.resetMetrics();

      const afterReset = loader.getMetrics();
      expect(afterReset.cacheHits).toBe(0);
      expect(afterReset.cacheMisses).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent skill', async () => {
      await loader.initialize();

      await expect(loader.loadSkill('non-existent')).rejects.toThrow();
    });

    it('should throw error for invalid skill file', async () => {
      // Create invalid skill (empty file)
      const skillDir = path.join(testSkillsDir, 'invalid-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), '');

      await loader.initialize();

      await expect(loader.loadSkill('invalid-skill')).rejects.toThrow();
    });

    it('should handle corrupted skill gracefully', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await loader.initialize();

      // Corrupt the skill file
      const skillPath = path.join(testSkillsDir, 'skill-001', 'SKILL.md');
      await fs.writeFile(skillPath, '\x00\x00\x00'); // Binary corruption

      await expect(loader.loadSkill('skill-001')).rejects.toThrow();
    });
  });

  describe('Cache Statistics', () => {
    it('should provide cache statistics', async () => {
      await createTestSkill(testSkillsDir, 'skill-001', 10000);
      await createTestSkill(testSkillsDir, 'skill-002', 10000);
      await loader.initialize();

      await loader.loadSkill('skill-001');
      await loader.loadSkill('skill-002');
      await loader.loadSkill('skill-001'); // Hit

      const stats = loader.getCacheStatistics();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('memoryUsageBytes');
      expect(stats).toHaveProperty('maxMemoryBytes');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('evictionRate');
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.hitRate).toBeCloseTo(0.33, 1);
    });
  });
});

/**
 * Helper: Create test skill with specified size
 */
async function createTestSkill(
  baseDir: string,
  skillId: string,
  contentSize: number
): Promise<void> {
  const skillDir = path.join(baseDir, skillId);
  await fs.mkdir(skillDir, { recursive: true });

  // Generate content of specified size
  const padding = 'x'.repeat(Math.max(0, contentSize - 200));
  const content = `# Test Skill ${skillId}

## Description
Test skill for skill loader validation.

## Content
${padding}

## Usage
This is a test skill.
`;

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
}
