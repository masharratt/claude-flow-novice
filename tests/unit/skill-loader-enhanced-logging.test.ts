/**
 * SkillLoader Enhanced Logging Tests - Phase 6.1
 *
 * Tests enhanced usage logging with approval metadata:
 * - Approval level tracking per skill
 * - Phase 4 generated flag tracking
 * - Backward compatibility
 * - Analytics queries
 *
 * Target Coverage: 100% of new functionality
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import path from 'path';
import { SkillLoader, Skill, TaskContext, SkillUsageLog } from '../../src/cli/skill-loader.js';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DB_PATH = './tests/unit/test-skills-enhanced.db';
const TEST_BOOTSTRAP_PATH = './tests/unit/test-bootstrap-enhanced';

let testDb: Database.Database;
let skillLoader: SkillLoader;

beforeAll(() => {
  // Create test database
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }

  testDb = new Database(TEST_DB_PATH);

  // Create schema (including new approval metadata columns)
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
      status TEXT DEFAULT 'active',
      approval_level TEXT DEFAULT 'auto',
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
      priority INTEGER DEFAULT 50,
      required BOOLEAN DEFAULT 0,
      conditions TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
      execution_time_ms INTEGER,
      confidence_before REAL,
      confidence_after REAL,
      success_indicator BOOLEAN,
      test_suite_executed BOOLEAN,
      test_pass_rate REAL,
      notes TEXT,

      -- NEW Phase 6.1: Approval metadata
      approval_level TEXT,
      phase4_generated INTEGER DEFAULT 0,

      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_usage_agent_type ON skill_usage_log(agent_type);
    CREATE INDEX idx_usage_skill ON skill_usage_log(skill_id);
    CREATE INDEX idx_usage_task ON skill_usage_log(task_id);
    CREATE INDEX idx_usage_timestamp ON skill_usage_log(loaded_at);
    CREATE INDEX idx_usage_approval_level ON skill_usage_log(approval_level);
    CREATE INDEX idx_usage_phase4_generated ON skill_usage_log(phase4_generated);
  `);

  // Create test bootstrap directory
  if (!existsSync(TEST_BOOTSTRAP_PATH)) {
    mkdirSync(TEST_BOOTSTRAP_PATH, { recursive: true });
  }

  // Create test skill files
  writeFileSync(
    path.join(TEST_BOOTSTRAP_PATH, 'test-skill-1.md'),
    '# Test Skill 1\n\nThis is a test skill for approval metadata tracking.'
  );

  // Insert test skills with different approval levels
  testDb.exec(`
    INSERT INTO skills (name, category, team, content_path, content_hash, version, status, approval_level, owner, phase4_pattern_id, generated_by)
    VALUES
      ('test-skill-auto', 'coordination', 'cfn-dev-team', '${TEST_BOOTSTRAP_PATH}/test-skill-1.md', 'hash1', '1.0.0', 'active', 'auto', 'system', NULL, NULL),
      ('test-skill-human', 'testing', 'cfn-dev-team', '${TEST_BOOTSTRAP_PATH}/test-skill-1.md', 'hash2', '1.0.0', 'active', 'human', 'system', 42, 'phase4-cli'),
      ('test-skill-escalate', 'infrastructure', 'cfn-dev-team', '${TEST_BOOTSTRAP_PATH}/test-skill-1.md', 'hash3', '1.0.0', 'active', 'escalate', 'system', NULL, NULL);

    INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required)
    VALUES
      ('backend-developer', 1, 100, 1),
      ('backend-developer', 2, 90, 0),
      ('backend-developer', 3, 80, 0);
  `);

  // Initialize SkillLoader
  skillLoader = new SkillLoader(TEST_DB_PATH, TEST_BOOTSTRAP_PATH);
});

afterAll(() => {
  // Cleanup
  testDb.close();
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
  if (existsSync(TEST_BOOTSTRAP_PATH)) {
    rmSync(TEST_BOOTSTRAP_PATH, { recursive: true, force: true });
  }
});

beforeEach(() => {
  // Clear usage log before each test
  testDb.exec('DELETE FROM skill_usage_log');
});

// ============================================================================
// Test Suite: Enhanced Logging with Approval Metadata
// ============================================================================

describe('SkillLoader - Enhanced Logging (Phase 6.1)', () => {

  test('should log skill usage with approval metadata', async () => {
    const usage: SkillUsageLog = {
      agentId: 'backend-test-001',
      agentType: 'backend-developer',
      skillIds: [1, 2, 3],
      taskId: 'task-123',
      phase: 'loop3',
      loadedAt: new Date(),
      confidenceBefore: 0.70,
      confidenceAfter: 0.85,
      executionTimeMs: 1500,
      approvalLevels: ['auto', 'human', 'escalate'],
      phase4Generated: [false, true, false]
    };

    await skillLoader.logSkillUsage(usage);

    // Verify logs were created
    const logs = testDb.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ? ORDER BY skill_id').all('backend-test-001');

    expect(logs).toHaveLength(3);

    // Verify skill 1 (auto, not generated)
    expect(logs[0].skill_id).toBe(1);
    expect(logs[0].approval_level).toBe('auto');
    expect(logs[0].phase4_generated).toBe(0);

    // Verify skill 2 (human, phase4 generated)
    expect(logs[1].skill_id).toBe(2);
    expect(logs[1].approval_level).toBe('human');
    expect(logs[1].phase4_generated).toBe(1);

    // Verify skill 3 (escalate, not generated)
    expect(logs[2].skill_id).toBe(3);
    expect(logs[2].approval_level).toBe('escalate');
    expect(logs[2].phase4_generated).toBe(0);

    // Verify common fields
    logs.forEach(log => {
      expect(log.agent_type).toBe('backend-developer');
      expect(log.task_id).toBe('task-123');
      expect(log.phase).toBe('loop3');
      expect(log.confidence_before).toBe(0.70);
      expect(log.confidence_after).toBe(0.85);
      expect(log.execution_time_ms).toBe(1500);
    });
  });

  test('should maintain backward compatibility when approval metadata is not provided', async () => {
    const usage: SkillUsageLog = {
      agentId: 'backend-test-002',
      agentType: 'backend-developer',
      skillIds: [1, 2],
      taskId: 'task-456',
      loadedAt: new Date(),
      executionTimeMs: 1000
    };

    await skillLoader.logSkillUsage(usage);

    const logs = testDb.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').all('backend-test-002');

    expect(logs).toHaveLength(2);

    // Verify NULL values for missing approval metadata
    logs.forEach(log => {
      expect(log.approval_level).toBeNull();
      expect(log.phase4_generated).toBe(0); // Default value
    });
  });

  test('should handle partial approval metadata arrays', async () => {
    const usage: SkillUsageLog = {
      agentId: 'backend-test-003',
      agentType: 'backend-developer',
      skillIds: [1, 2, 3],
      taskId: 'task-789',
      loadedAt: new Date(),
      executionTimeMs: 1200,
      approvalLevels: ['auto', 'human'], // Only 2 values for 3 skills
      phase4Generated: [false] // Only 1 value for 3 skills
    };

    await skillLoader.logSkillUsage(usage);

    const logs = testDb.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ? ORDER BY skill_id').all('backend-test-003');

    expect(logs).toHaveLength(3);

    // Verify values assigned correctly with array bounds checking
    expect(logs[0].approval_level).toBe('auto');
    expect(logs[0].phase4_generated).toBe(0); // false -> 0

    expect(logs[1].approval_level).toBe('human');
    expect(logs[1].phase4_generated).toBeNull(); // Out of bounds -> NULL

    expect(logs[2].approval_level).toBeNull(); // Out of bounds -> NULL
    expect(logs[2].phase4_generated).toBeNull();
  });

  test('should track phase4_generated boolean correctly', async () => {
    const usage: SkillUsageLog = {
      agentId: 'backend-test-004',
      agentType: 'backend-developer',
      skillIds: [1, 2],
      loadedAt: new Date(),
      executionTimeMs: 800,
      phase4Generated: [true, false]
    };

    await skillLoader.logSkillUsage(usage);

    const logs = testDb.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ? ORDER BY skill_id').all('backend-test-004');

    expect(logs[0].phase4_generated).toBe(1); // true -> 1
    expect(logs[1].phase4_generated).toBe(0); // false -> 0
  });

  test('should support approval analytics queries', async () => {
    // Log multiple usage entries with different approval levels
    await skillLoader.logSkillUsage({
      agentId: 'agent-001',
      agentType: 'backend-developer',
      skillIds: [1],
      loadedAt: new Date(),
      executionTimeMs: 1000,
      approvalLevels: ['auto'],
      phase4Generated: [false]
    });

    await skillLoader.logSkillUsage({
      agentId: 'agent-002',
      agentType: 'frontend-developer',
      skillIds: [2],
      loadedAt: new Date(),
      executionTimeMs: 1200,
      approvalLevels: ['human'],
      phase4Generated: [true]
    });

    await skillLoader.logSkillUsage({
      agentId: 'agent-003',
      agentType: 'backend-developer',
      skillIds: [2],
      loadedAt: new Date(),
      executionTimeMs: 1100,
      approvalLevels: ['human'],
      phase4Generated: [true]
    });

    // Query: Count by approval level
    const approvalCounts = testDb.prepare(`
      SELECT approval_level, COUNT(*) as count
      FROM skill_usage_log
      WHERE approval_level IS NOT NULL
      GROUP BY approval_level
      ORDER BY approval_level
    `).all();

    expect(approvalCounts).toHaveLength(2);
    expect(approvalCounts[0].approval_level).toBe('auto');
    expect(approvalCounts[0].count).toBe(1);
    expect(approvalCounts[1].approval_level).toBe('human');
    expect(approvalCounts[1].count).toBe(2);

    // Query: Count phase4 generated skills
    const phase4Count = testDb.prepare(`
      SELECT COUNT(*) as count
      FROM skill_usage_log
      WHERE phase4_generated = 1
    `).get();

    expect(phase4Count.count).toBe(2);

    // Query: Human-approved phase4-generated skills
    const humanPhase4 = testDb.prepare(`
      SELECT COUNT(*) as count
      FROM skill_usage_log
      WHERE approval_level = 'human' AND phase4_generated = 1
    `).get();

    expect(humanPhase4.count).toBe(2);
  });

  test('should handle empty approval metadata arrays', async () => {
    const usage: SkillUsageLog = {
      agentId: 'backend-test-005',
      agentType: 'backend-developer',
      skillIds: [1, 2],
      loadedAt: new Date(),
      executionTimeMs: 900,
      approvalLevels: [],
      phase4Generated: []
    };

    await skillLoader.logSkillUsage(usage);

    const logs = testDb.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').all('backend-test-005');

    expect(logs).toHaveLength(2);

    logs.forEach(log => {
      expect(log.approval_level).toBeNull();
      expect(log.phase4_generated).toBeNull();
    });
  });

  test('should log approval metadata for single skill', async () => {
    const usage: SkillUsageLog = {
      agentId: 'backend-test-006',
      agentType: 'backend-developer',
      skillIds: [2],
      loadedAt: new Date(),
      executionTimeMs: 500,
      approvalLevels: ['human'],
      phase4Generated: [true]
    };

    await skillLoader.logSkillUsage(usage);

    const log = testDb.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').get('backend-test-006');

    expect(log).toBeDefined();
    expect(log.skill_id).toBe(2);
    expect(log.approval_level).toBe('human');
    expect(log.phase4_generated).toBe(1);
  });
});
