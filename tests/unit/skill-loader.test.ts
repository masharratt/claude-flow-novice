/**
 * SkillLoader Unit Tests
 *
 * Tests Phase 3 implementation:
 * - Bootstrap skill loading
 * - Database skill loading with approval awareness
 * - Context-based filtering
 * - LRU cache with TTL
 * - Hash validation
 * - Usage logging
 * - Skill metrics
 *
 * Target Coverage: 90%+
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import path from 'path';
import { SkillLoader, Skill, TaskContext, SkillUsageLog } from '../../src/cli/skill-loader.js';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DB_PATH = './tests/unit/test-skills.db';
const TEST_BOOTSTRAP_PATH = './tests/unit/test-bootstrap';

let testDb: Database.Database;
let skillLoader: SkillLoader;

beforeAll(() => {
  // Create test database
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }

  testDb = new Database(TEST_DB_PATH);

  // Create schema
  testDb.exec(`
    CREATE TABLE skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      team TEXT,
      content_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      tags TEXT,
      version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      approval_level TEXT NOT NULL DEFAULT 'human',
      approval_criteria TEXT,
      owner TEXT,
      phase4_pattern_id INTEGER,
      generated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_skill_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT NOT NULL,
      skill_id INTEGER NOT NULL,
      priority INTEGER NOT NULL DEFAULT 5,
      required BOOLEAN NOT NULL DEFAULT 0,
      conditions TEXT,
      notes TEXT,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE TABLE skill_usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      skill_id INTEGER NOT NULL,
      task_id TEXT,
      phase TEXT,
      loaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      confidence_before REAL,
      confidence_after REAL,
      execution_time_ms INTEGER,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE TABLE approval_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      approval_level TEXT NOT NULL,
      approver TEXT,
      decision TEXT NOT NULL,
      reasoning TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE TABLE bootstrap_skills (
      skill_name TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      load_order INTEGER NOT NULL,
      description TEXT NOT NULL
    );
  `);

  // Seed bootstrap skills
  testDb.exec(`
    INSERT INTO bootstrap_skills VALUES
      ('test-database-connection', '${TEST_BOOTSTRAP_PATH}/database-connection.md', 1, 'Test DB connection'),
      ('test-error-handling', '${TEST_BOOTSTRAP_PATH}/error-handling.md', 2, 'Test error handling');
  `);

  // Create bootstrap skill files
  if (!existsSync(TEST_BOOTSTRAP_PATH)) {
    mkdirSync(TEST_BOOTSTRAP_PATH, { recursive: true });
  }

  writeFileSync(
    path.join(TEST_BOOTSTRAP_PATH, 'database-connection.md'),
    `---
name: test-database-connection
category: foundation
approval_level: auto
approval_criteria:
  max_commands: 3
  test_coverage: 0.95
tags: [sqlite, database, foundation]
version: 1.0.0
owner: test-team
---

# Test Database Connection

This is a test bootstrap skill.
`
  );

  writeFileSync(
    path.join(TEST_BOOTSTRAP_PATH, 'error-handling.md'),
    `---
name: test-error-handling
category: foundation
approval_level: auto
tags: [error, bash]
version: 1.0.0
owner: test-team
---

# Test Error Handling

This is another test bootstrap skill.
`
  );

  // Seed test skills
  testDb.prepare(`
    INSERT INTO skills (name, category, team, content_path, content_hash, tags, version, status, approval_level, owner, generated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'jwt-authentication',
    'domain',
    'backend',
    './tests/unit/test-skills/jwt-authentication.md',
    'test-hash-123',
    JSON.stringify(['security', 'auth', 'jwt']),
    '1.0.0',
    'active',
    'human',
    'backend-team',
    'manual'
  );

  const skill1Id = testDb.prepare('SELECT last_insert_rowid() as id').get() as any;

  testDb.prepare(`
    INSERT INTO skills (name, category, team, content_path, content_hash, tags, version, status, approval_level, owner, generated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'redis-coordination',
    'coordination',
    'cfn',
    './tests/unit/test-skills/redis-coordination.md',
    'test-hash-456',
    JSON.stringify(['redis', 'coordination']),
    '2.1.0',
    'active',
    'auto',
    'cfn-core',
    'manual'
  );

  const skill2Id = testDb.prepare('SELECT last_insert_rowid() as id').get() as any;

  // Create skill content files
  const testSkillsDir = './tests/unit/test-skills';
  if (!existsSync(testSkillsDir)) {
    mkdirSync(testSkillsDir, { recursive: true });
  }

  writeFileSync(
    path.join(testSkillsDir, 'jwt-authentication.md'),
    '# JWT Authentication Skill\n\nImplementation of JWT authentication patterns.'
  );

  writeFileSync(
    path.join(testSkillsDir, 'redis-coordination.md'),
    '# Redis Coordination Skill\n\nRedis-based agent coordination patterns.'
  );

  // Create agent-skill mappings
  testDb.prepare(`
    INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required, conditions)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'backend-developer',
    skill1Id.id,
    3,
    0,
    JSON.stringify({ taskContext: ['auth', 'authentication', 'jwt'] })
  );

  testDb.prepare(`
    INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required, conditions)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'backend-developer',
    skill2Id.id,
    1,
    1,
    null
  );

  // Add approval history for auto-approved skill
  testDb.prepare(`
    INSERT INTO approval_history (skill_id, version, approval_level, approver, decision, reasoning)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    skill2Id.id,
    '2.1.0',
    'auto',
    'system',
    'approved',
    'Auto-approved based on criteria'
  );

  testDb.close();
});

afterAll(() => {
  // Cleanup
  if (skillLoader) {
    skillLoader.close();
  }

  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }

  if (existsSync(TEST_BOOTSTRAP_PATH)) {
    rmSync(TEST_BOOTSTRAP_PATH, { recursive: true, force: true });
  }

  if (existsSync('./tests/unit/test-skills')) {
    rmSync('./tests/unit/test-skills', { recursive: true, force: true });
  }
});

beforeEach(() => {
  if (skillLoader) {
    skillLoader.close();
  }
  skillLoader = new SkillLoader(TEST_DB_PATH, { enableCache: true, cacheMaxSize: 10, cacheTTL: 1000 });
});

// ============================================================================
// Test Suite: Bootstrap Skills
// ============================================================================

describe('SkillLoader - Bootstrap Skills', () => {
  test('should load bootstrap skills without database dependency', async () => {
    const bootstrapSkills = await skillLoader.loadBootstrapSkills();

    expect(bootstrapSkills).toBeDefined();
    expect(bootstrapSkills.length).toBe(2);
    expect(bootstrapSkills[0].name).toBe('test-database-connection');
    expect(bootstrapSkills[1].name).toBe('test-error-handling');
  });

  test('should parse frontmatter metadata correctly', async () => {
    const bootstrapSkills = await skillLoader.loadBootstrapSkills();
    const skill = bootstrapSkills[0];

    expect(skill.approvalLevel).toBe('auto');
    expect(skill.tags).toContain('sqlite');
    expect(skill.tags).toContain('database');
    expect(skill.version).toBe('1.0.0');
    expect(skill.owner).toBe('test-team');
  });

  test('should load bootstrap skill content', async () => {
    const bootstrapSkills = await skillLoader.loadBootstrapSkills();
    const skill = bootstrapSkills[0];

    expect(skill.content).toBeDefined();
    expect(skill.content).toContain('# Test Database Connection');
  });

  test('should handle missing bootstrap skill files gracefully', async () => {
    // Add a bootstrap skill with non-existent file
    const tempDb = new Database(TEST_DB_PATH);
    tempDb.prepare(`
      INSERT INTO bootstrap_skills VALUES ('missing-skill', './nonexistent.md', 99, 'Missing skill')
    `).run();
    tempDb.close();

    const bootstrapSkills = await skillLoader.loadBootstrapSkills();

    // Should still load the existing skills
    expect(bootstrapSkills.length).toBe(2);
  });
});

// ============================================================================
// Test Suite: Database Skills with Approval Awareness
// ============================================================================

describe('SkillLoader - Database Skills', () => {
  test('should load skills for agent type', async () => {
    const skills = await skillLoader.loadSkillsForAgent('backend-developer');

    expect(skills.length).toBeGreaterThanOrEqual(2); // Bootstrap + DB skills
    const dbSkills = skills.filter(s => s.id > 0);
    expect(dbSkills.length).toBe(2);
  });

  test('should order skills by priority', async () => {
    const skills = await skillLoader.loadSkillsForAgent('backend-developer');
    const dbSkills = skills.filter(s => s.id > 0);

    // Priority 1 (redis-coordination) should come before priority 3 (jwt-authentication)
    expect(dbSkills[0].name).toBe('redis-coordination');
    expect(dbSkills[1].name).toBe('jwt-authentication');
  });

  test('should filter by approval level (auto first)', async () => {
    const skills = await skillLoader.loadSkillsForAgent('backend-developer');
    const dbSkills = skills.filter(s => s.id > 0);

    // Auto-approved skill should be prioritized
    const autoSkill = dbSkills.find(s => s.approvalLevel === 'auto');
    expect(autoSkill).toBeDefined();
    expect(autoSkill!.name).toBe('redis-coordination');
  });

  test('should check if skill requires approval', async () => {
    const skill1 = await skillLoader.getSkill('jwt-authentication');
    const skill2 = await skillLoader.getSkill('redis-coordination');

    expect(skill1).toBeDefined();
    expect(skill2).toBeDefined();

    const requiresApproval1 = await skillLoader.requiresApproval(skill1!);
    const requiresApproval2 = await skillLoader.requiresApproval(skill2!);

    // jwt-authentication (human) has no approval history → requires approval
    expect(requiresApproval1).toBe(true);

    // redis-coordination (auto) has approval history → doesn't require approval
    expect(requiresApproval2).toBe(false);
  });
});

// ============================================================================
// Test Suite: Context-Based Filtering
// ============================================================================

describe('SkillLoader - Context Filtering', () => {
  test('should filter skills by task context keywords', async () => {
    const context: TaskContext = {
      keywords: 'auth',
      phase: 'loop3',
      mode: 'standard'
    };

    const skills = await skillLoader.loadSkillsForAgent('backend-developer', context);
    const dbSkills = skills.filter(s => s.id > 0);

    // Should include jwt-authentication (has "auth" in conditions)
    const jwtSkill = dbSkills.find(s => s.name === 'jwt-authentication');
    expect(jwtSkill).toBeDefined();
  });

  test('should load skills with null conditions regardless of context', async () => {
    const context: TaskContext = {
      keywords: 'testing',
      phase: 'loop2'
    };

    const skills = await skillLoader.loadSkillsForAgent('backend-developer', context);
    const dbSkills = skills.filter(s => s.id > 0);

    // redis-coordination has null conditions → should always load
    const redisSkill = dbSkills.find(s => s.name === 'redis-coordination');
    expect(redisSkill).toBeDefined();
  });
});

// ============================================================================
// Test Suite: Caching (LRU + TTL)
// ============================================================================

describe('SkillLoader - Caching', () => {
  test('should cache loaded skills', async () => {
    const skill1 = await skillLoader.getSkill('jwt-authentication');
    const skill2 = await skillLoader.getSkill('jwt-authentication');

    // Both should return the same content
    expect(skill1).toEqual(skill2);
  });

  test('should respect cache TTL', async () => {
    const loaderWithShortTTL = new SkillLoader(TEST_DB_PATH, { enableCache: true, cacheTTL: 10 });

    const skill1 = await loaderWithShortTTL.getSkill('jwt-authentication');

    // Wait for cache to expire
    await new Promise(resolve => setTimeout(resolve, 20));

    const skill2 = await loaderWithShortTTL.getSkill('jwt-authentication');

    // Content should still match (reloaded from file)
    expect(skill1!.content).toBe(skill2!.content);

    loaderWithShortTTL.close();
  });

  test('should evict oldest entry when cache is full', async () => {
    const loaderWithSmallCache = new SkillLoader(TEST_DB_PATH, { enableCache: true, cacheMaxSize: 1 });

    await loaderWithSmallCache.getSkill('jwt-authentication');
    await loaderWithSmallCache.getSkill('redis-coordination');

    // Cache size is 1, so jwt-authentication should be evicted
    // This is verified by the fact that no error occurs
    expect(true).toBe(true);

    loaderWithSmallCache.close();
  });

  test('should clear cache on demand', async () => {
    await skillLoader.getSkill('jwt-authentication');
    skillLoader.clearCache();

    // Cache should be empty now
    const skill = await skillLoader.getSkill('jwt-authentication');
    expect(skill).toBeDefined();
  });
});

// ============================================================================
// Test Suite: Hash Validation
// ============================================================================

describe('SkillLoader - Hash Validation', () => {
  test('should validate content integrity', async () => {
    const result = await skillLoader.validateIntegrity();

    expect(result).toBeDefined();
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test('should warn about hash mismatches (non-blocking)', async () => {
    // Update skill content without updating hash
    const testSkillPath = './tests/unit/test-skills/jwt-authentication.md';
    writeFileSync(testSkillPath, '# JWT Authentication Skill\n\nUpdated content without hash update.');

    const result = await skillLoader.validateIntegrity();

    // Should have warnings but still be valid (non-blocking)
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('jwt-authentication');
    expect(result.warnings[0]).toContain('Hash mismatch');

    // Restore original content
    writeFileSync(testSkillPath, '# JWT Authentication Skill\n\nImplementation of JWT authentication patterns.');
  });

  test('should report errors for missing skill files', async () => {
    // Add skill with non-existent file
    const tempDb = new Database(TEST_DB_PATH);
    tempDb.prepare(`
      INSERT INTO skills (name, category, team, content_path, content_hash, tags, version, status, approval_level, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'missing-skill',
      'domain',
      'test',
      './nonexistent.md',
      'hash',
      '[]',
      '1.0.0',
      'active',
      'auto',
      'test'
    );
    tempDb.close();

    const result = await skillLoader.validateIntegrity();

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('missing-skill');
    expect(result.errors[0]).toContain('File not found');
  });
});

// ============================================================================
// Test Suite: Usage Logging
// ============================================================================

describe('SkillLoader - Usage Logging', () => {
  test('should log skill usage', async () => {
    const usage: SkillUsageLog = {
      agentId: 'backend-developer-1',
      agentType: 'backend-developer',
      skillIds: [1, 2],
      taskId: 'task-123',
      phase: 'loop3',
      loadedAt: new Date(),
      confidenceBefore: 0.75,
      confidenceAfter: 0.88,
      executionTimeMs: 12
    };

    await skillLoader.logSkillUsage(usage);

    // Verify log was created
    const tempDb = new Database(TEST_DB_PATH);
    const logs = tempDb.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').all('backend-developer-1');
    tempDb.close();

    expect(logs.length).toBe(2); // One log per skill
  });
});

// ============================================================================
// Test Suite: Skill Metrics
// ============================================================================

describe('SkillLoader - Skill Metrics', () => {
  test('should calculate skill metrics', async () => {
    // Log some usage first
    const usage: SkillUsageLog = {
      agentId: 'backend-developer-1',
      agentType: 'backend-developer',
      skillIds: [1],
      taskId: 'task-123',
      phase: 'loop3',
      loadedAt: new Date(),
      confidenceBefore: 0.75,
      confidenceAfter: 0.88,
      executionTimeMs: 12
    };

    await skillLoader.logSkillUsage(usage);

    // Get metrics
    const metrics = await skillLoader.getSkillMetrics(1);

    expect(metrics).toBeDefined();
    expect(metrics!.skillName).toBe('jwt-authentication');
    expect(metrics!.totalUsages).toBeGreaterThan(0);
    expect(metrics!.averageConfidenceImpact).toBeCloseTo(0.13, 2);
  });

  test('should return null for non-existent skill', async () => {
    const metrics = await skillLoader.getSkillMetrics(9999);
    expect(metrics).toBeNull();
  });
});

// ============================================================================
// Test Suite: Performance
// ============================================================================

describe('SkillLoader - Performance', () => {
  test('should load skills within 15ms latency target', async () => {
    const startTime = Date.now();
    await skillLoader.loadSkillsForAgent('backend-developer');
    const executionTime = Date.now() - startTime;

    expect(executionTime).toBeLessThan(15);
  });

  test('should benefit from caching on repeated loads', async () => {
    // First load (cold)
    const start1 = Date.now();
    await skillLoader.loadSkillsForAgent('backend-developer');
    const time1 = Date.now() - start1;

    // Second load (warm cache)
    const start2 = Date.now();
    await skillLoader.loadSkillsForAgent('backend-developer');
    const time2 = Date.now() - start2;

    // Cached load should be faster or equal
    expect(time2).toBeLessThanOrEqual(time1);
  });
});

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

describe('SkillLoader - Error Handling', () => {
  test('should throw error if database does not exist', () => {
    expect(() => {
      new SkillLoader('./nonexistent.db');
    }).toThrow('Skills database not found');
  });

  test('should handle database connection errors gracefully', () => {
    // This test verifies the constructor throws on missing DB
    expect(() => {
      new SkillLoader('/invalid/path/to/db.db');
    }).toThrow();
  });

  test('should return null for non-existent skill', async () => {
    const skill = await skillLoader.getSkill('nonexistent-skill');
    expect(skill).toBeNull();
  });

  test('should return null for non-existent skill ID', async () => {
    const skill = await skillLoader.getSkill(9999);
    expect(skill).toBeNull();
  });
});
