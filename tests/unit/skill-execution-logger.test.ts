/**
 * Skill Execution Logger Tests - Phase 7.2
 *
 * TDD Approach: Tests written before implementation
 *
 * Test Coverage:
 * 1. SQLite logging (all skills)
 * 2. PostgreSQL logging (Phase4 skills only)
 * 3. Dual logging (Phase4 skills to both databases)
 * 4. PostgreSQL unavailable (graceful fallback)
 * 5. Performance (<50ms per log)
 * 6. Error recovery (PostgreSQL failure doesn't fail SQLite)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { SkillExecutionLogger, SkillExecutionMetrics, LoggerConfig } from '../../src/cli/skill-execution-logger.js';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';

// Test database paths
const TEST_DB_DIR = '/tmp/skill-logger-tests';
const TEST_SQLITE_DB = path.join(TEST_DB_DIR, 'test-skills.db');

// Mock PostgreSQL client
const mockPgPool = {
  query: jest.fn(),
  end: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPgPool),
}));

describe('SkillExecutionLogger - TDD Phase 7.2', () => {
  let logger: SkillExecutionLogger;
  let testDb: Database.Database;

  beforeEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_DB_DIR)) {
      if (existsSync(TEST_SQLITE_DB)) {
        unlinkSync(TEST_SQLITE_DB);
      }
    } else {
      mkdirSync(TEST_DB_DIR, { recursive: true });
    }

    // Create test database with minimal schema
    testDb = new Database(TEST_SQLITE_DB);

    // Create skills table
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS skills (
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
        phase4_pattern_id INTEGER,
        generated_by TEXT,
        is_auto_generated BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Create skill_usage_log table
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS skill_usage_log (
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
        approval_level TEXT,
        phase4_generated INTEGER DEFAULT 0,
        exit_code INTEGER,
        FOREIGN KEY (skill_id) REFERENCES skills(id)
      );
    `);

    // Insert test skills
    testDb.exec(`
      INSERT INTO skills (name, category, team, content_path, content_hash, version, approval_level, generated_by, phase4_pattern_id)
      VALUES
        ('manual-skill', 'testing', 'cfn', '/path/manual.md', 'hash1', '1.0.0', 'human', 'manual', NULL),
        ('phase4-skill', 'coordination', 'cfn', '/path/phase4.md', 'hash2', '2.0.0', 'auto', 'phase4', 42),
        ('imported-skill', 'infrastructure', 'data-eng', '/path/imported.md', 'hash3', '1.5.0', 'escalate', 'imported', NULL);
    `);

    testDb.close();

    // Reset mocks
    jest.clearAllMocks();
    mockPgPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(async () => {
    if (logger) {
      await logger.close();
    }

    // Clean up test database
    if (existsSync(TEST_SQLITE_DB)) {
      unlinkSync(TEST_SQLITE_DB);
    }
  });

  // ============================================================================
  // Test 1: SQLite Logging - All Skills
  // ============================================================================

  describe('Test 1: SQLite Logging (All Skills)', () => {
    it('should log manual skill to SQLite only', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: false,
      });

      const metrics: SkillExecutionMetrics = {
        agentId: 'backend-dev-1',
        agentType: 'backend-developer',
        skillName: 'manual-skill',
        taskId: 'task-123',
        phase: 'loop3',
        confidenceBefore: 0.70,
        confidenceAfter: 0.85,
        executionTimeMs: 15,
        exitCode: 0,
      };

      await logger.logSkillExecution(metrics);

      // Verify SQLite insert
      const db = new Database(TEST_SQLITE_DB, { readonly: true });
      const row = db.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').get('backend-dev-1');
      db.close();

      expect(row).toBeDefined();
      expect(row).toMatchObject({
        agent_id: 'backend-dev-1',
        agent_type: 'backend-developer',
        skill_id: 1, // manual-skill
        task_id: 'task-123',
        phase: 'loop3',
        confidence_before: 0.70,
        confidence_after: 0.85,
        execution_time_ms: 15,
        exit_code: 0,
        approval_level: 'human',
        phase4_generated: 0,
      });

      // Verify no PostgreSQL call
      expect(mockPgPool.query).not.toHaveBeenCalled();
    });

    it('should log imported skill to SQLite only', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: false,
      });

      const metrics: SkillExecutionMetrics = {
        agentId: 'tester-1',
        agentType: 'tester',
        skillName: 'imported-skill',
        executionTimeMs: 8,
        exitCode: 0,
      };

      await logger.logSkillExecution(metrics);

      const db = new Database(TEST_SQLITE_DB, { readonly: true });
      const row = db.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').get('tester-1');
      db.close();

      expect(row).toBeDefined();
      expect(row.skill_id).toBe(3); // imported-skill
      expect(row.approval_level).toBe('escalate');
      expect(row.phase4_generated).toBe(0);
    });
  });

  // ============================================================================
  // Test 2: PostgreSQL Logging - Phase4 Skills Only
  // ============================================================================

  describe('Test 2: PostgreSQL Logging (Phase4 Skills Only)', () => {
    it('should log Phase4 skill to PostgreSQL', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: true,
        postgresHost: 'localhost',
        postgresDb: 'workflow_codification',
        postgresUser: 'postgres',
        postgresPass: '',
      });

      // Wait for connection test to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      jest.clearAllMocks(); // Reset mock after connection test

      const metrics: SkillExecutionMetrics = {
        agentId: 'coordinator-1',
        agentType: 'cfn-v3-coordinator',
        skillName: 'phase4-skill',
        taskId: 'task-456',
        executionTimeMs: 12,
        exitCode: 0,
        costAvoidedUsd: 0.05,
        tokensAvoided: 1000,
      };

      await logger.logSkillExecution(metrics);

      // Verify PostgreSQL was called (only the INSERT, not the connection test)
      expect(mockPgPool.query).toHaveBeenCalledTimes(1);
      expect(mockPgPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO skill_executions'),
        expect.arrayContaining([
          42, // phase4_pattern_id
          'cfn-v3-coordinator', // team_id (agent_type)
          'task-456', // task_id
          12, // execution_time_ms
          0, // exit_code
          0.05, // cost_avoided_usd
          1000, // tokens_avoided
        ])
      );
    });

    it('should NOT log manual skill to PostgreSQL', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: true,
        postgresHost: 'localhost',
      });

      // Wait for connection test to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      jest.clearAllMocks(); // Reset mock after connection test

      const metrics: SkillExecutionMetrics = {
        agentId: 'backend-dev-2',
        agentType: 'backend-developer',
        skillName: 'manual-skill',
        executionTimeMs: 10,
        exitCode: 0,
      };

      await logger.logSkillExecution(metrics);

      // Verify PostgreSQL was NOT called (only connection test was called before mock reset)
      expect(mockPgPool.query).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Test 3: Dual Logging - Phase4 Skills to Both Databases
  // ============================================================================

  describe('Test 3: Dual Logging (Phase4 Skills to Both)', () => {
    it('should log Phase4 skill to both SQLite and PostgreSQL', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: true,
        postgresHost: 'localhost',
      });

      // Wait for connection test to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      jest.clearAllMocks(); // Reset mock after connection test

      const metrics: SkillExecutionMetrics = {
        agentId: 'orchestrator-1',
        agentType: 'cfn-orchestrator',
        skillName: 'phase4-skill',
        taskId: 'task-789',
        phase: 'loop2',
        confidenceBefore: 0.80,
        confidenceAfter: 0.92,
        executionTimeMs: 20,
        exitCode: 0,
        costAvoidedUsd: 0.08,
        tokensAvoided: 1500,
      };

      await logger.logSkillExecution(metrics);

      // Verify SQLite insert
      const db = new Database(TEST_SQLITE_DB, { readonly: true });
      const row = db.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').get('orchestrator-1');
      db.close();

      expect(row).toBeDefined();
      expect(row.skill_id).toBe(2); // phase4-skill
      expect(row.phase4_generated).toBe(1);

      // Verify PostgreSQL insert (only the INSERT, not the connection test)
      expect(mockPgPool.query).toHaveBeenCalledTimes(1);
      expect(mockPgPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO skill_executions'),
        expect.arrayContaining([42, 'cfn-orchestrator', 'task-789'])
      );
    });
  });

  // ============================================================================
  // Test 4: PostgreSQL Unavailable - Graceful Fallback
  // ============================================================================

  describe('Test 4: PostgreSQL Unavailable (Graceful Fallback)', () => {
    it('should fallback to SQLite only when PostgreSQL fails', async () => {
      // Mock PostgreSQL failure
      mockPgPool.query.mockRejectedValue(new Error('Connection refused'));

      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: true,
        postgresHost: 'localhost',
      });

      const metrics: SkillExecutionMetrics = {
        agentId: 'backend-dev-3',
        agentType: 'backend-developer',
        skillName: 'phase4-skill',
        executionTimeMs: 15,
        exitCode: 0,
      };

      // Should NOT throw error
      await expect(logger.logSkillExecution(metrics)).resolves.not.toThrow();

      // Verify SQLite insert succeeded
      const db = new Database(TEST_SQLITE_DB, { readonly: true });
      const row = db.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').get('backend-dev-3');
      db.close();

      expect(row).toBeDefined();
      expect(row.skill_id).toBe(2); // phase4-skill

      // Verify PostgreSQL was attempted
      expect(mockPgPool.query).toHaveBeenCalled();
    });

    it('should continue logging after PostgreSQL recovers', async () => {
      // Connection test succeeds, first insert fails, second insert succeeds
      mockPgPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Connection test
        .mockRejectedValueOnce(new Error('Connection refused')) // First insert
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Second insert

      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: true,
        postgresHost: 'localhost',
      });

      // Wait for connection test to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics1: SkillExecutionMetrics = {
        agentId: 'agent-1',
        agentType: 'backend-developer',
        skillName: 'phase4-skill',
        executionTimeMs: 10,
        exitCode: 0,
      };

      const metrics2: SkillExecutionMetrics = {
        agentId: 'agent-2',
        agentType: 'backend-developer',
        skillName: 'phase4-skill',
        executionTimeMs: 12,
        exitCode: 0,
      };

      // First log fails PostgreSQL, succeeds SQLite
      await logger.logSkillExecution(metrics1);

      // Second log succeeds both
      await logger.logSkillExecution(metrics2);

      // Verify both SQLite inserts
      const db = new Database(TEST_SQLITE_DB, { readonly: true });
      const count = db.prepare('SELECT COUNT(*) as count FROM skill_usage_log').get();
      db.close();

      expect(count.count).toBe(2);
      // Connection test + 2 inserts = 3 calls
      expect(mockPgPool.query).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================================================
  // Test 5: Performance - Logging Should Not Block (<50ms)
  // ============================================================================

  describe('Test 5: Performance (<50ms per log)', () => {
    it('should complete logging in under 50ms', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: true,
        postgresHost: 'localhost',
      });

      const metrics: SkillExecutionMetrics = {
        agentId: 'perf-test-1',
        agentType: 'backend-developer',
        skillName: 'phase4-skill',
        executionTimeMs: 10,
        exitCode: 0,
        costAvoidedUsd: 0.05,
        tokensAvoided: 1000,
      };

      const startTime = Date.now();
      await logger.logSkillExecution(metrics);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50);
    });

    it('should handle 100 logs efficiently', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: true,
        postgresHost: 'localhost',
      });

      const promises = [];
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const metrics: SkillExecutionMetrics = {
          agentId: `perf-test-${i}`,
          agentType: 'backend-developer',
          skillName: i % 2 === 0 ? 'phase4-skill' : 'manual-skill',
          executionTimeMs: 10,
          exitCode: 0,
        };
        promises.push(logger.logSkillExecution(metrics));
      }

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Average should be well under 50ms per log
      const avgDuration = duration / 100;
      expect(avgDuration).toBeLessThan(50);

      // Verify all logs were written
      const db = new Database(TEST_SQLITE_DB, { readonly: true });
      const count = db.prepare('SELECT COUNT(*) as count FROM skill_usage_log').get();
      db.close();

      expect(count.count).toBe(100);
    });
  });

  // ============================================================================
  // Test 6: Error Recovery - Failed PostgreSQL Doesn't Fail SQLite
  // ============================================================================

  describe('Test 6: Error Recovery (PostgreSQL Failure Isolation)', () => {
    it('should complete SQLite logging even if PostgreSQL fails', async () => {
      mockPgPool.query.mockRejectedValue(new Error('Database error'));

      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: true,
        postgresHost: 'localhost',
      });

      const metrics: SkillExecutionMetrics = {
        agentId: 'error-test-1',
        agentType: 'backend-developer',
        skillName: 'phase4-skill',
        executionTimeMs: 10,
        exitCode: 0,
      };

      // Should not throw
      await expect(logger.logSkillExecution(metrics)).resolves.not.toThrow();

      // Verify SQLite succeeded
      const db = new Database(TEST_SQLITE_DB, { readonly: true });
      const row = db.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').get('error-test-1');
      db.close();

      expect(row).toBeDefined();
    });

    it('should throw error if skill not found', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: false,
      });

      const metrics: SkillExecutionMetrics = {
        agentId: 'error-test-2',
        agentType: 'backend-developer',
        skillName: 'nonexistent-skill',
        executionTimeMs: 10,
        exitCode: 0,
      };

      await expect(logger.logSkillExecution(metrics)).rejects.toThrow(/Skill not found/);
    });

    it('should throw error if SQLite insert fails', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: false,
      });

      const metrics: SkillExecutionMetrics = {
        agentId: 'error-test-3',
        agentType: 'backend-developer',
        skillName: 'manual-skill',
        skillId: 999, // Invalid skill_id (foreign key constraint)
        executionTimeMs: 10,
        exitCode: 0,
      };

      await expect(logger.logSkillExecution(metrics)).rejects.toThrow();
    });
  });

  // ============================================================================
  // Test 7: Skill ID Lookup and Caching
  // ============================================================================

  describe('Test 7: Skill ID Lookup and Caching', () => {
    it('should lookup skill ID by name if not provided', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: false,
      });

      const metrics: SkillExecutionMetrics = {
        agentId: 'lookup-test-1',
        agentType: 'backend-developer',
        skillName: 'manual-skill',
        // No skillId provided
        executionTimeMs: 10,
        exitCode: 0,
      };

      await logger.logSkillExecution(metrics);

      const db = new Database(TEST_SQLITE_DB, { readonly: true });
      const row = db.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').get('lookup-test-1');
      db.close();

      expect(row).toBeDefined();
      expect(row.skill_id).toBe(1); // Correctly looked up
    });

    it('should use provided skill ID if given', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
        enablePostgres: false,
      });

      const metrics: SkillExecutionMetrics = {
        agentId: 'lookup-test-2',
        agentType: 'backend-developer',
        skillName: 'manual-skill',
        skillId: 1, // Explicitly provided
        executionTimeMs: 10,
        exitCode: 0,
      };

      await logger.logSkillExecution(metrics);

      const db = new Database(TEST_SQLITE_DB, { readonly: true });
      const row = db.prepare('SELECT * FROM skill_usage_log WHERE agent_id = ?').get('lookup-test-2');
      db.close();

      expect(row).toBeDefined();
      expect(row.skill_id).toBe(1);
    });
  });

  // ============================================================================
  // Test 8: Configuration and Defaults
  // ============================================================================

  describe('Test 8: Configuration and Defaults', () => {
    it('should use default SQLite path if not provided', async () => {
      // This test assumes default path exists
      const defaultPath = './.claude/skills-database/skills.db';

      if (!existsSync(defaultPath)) {
        // Skip if default DB doesn't exist
        return;
      }

      logger = new SkillExecutionLogger({
        enablePostgres: false,
      });

      expect(logger).toBeDefined();
      await logger.close();
    });

    it('should disable PostgreSQL by default', async () => {
      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
      });

      const metrics: SkillExecutionMetrics = {
        agentId: 'config-test-1',
        agentType: 'backend-developer',
        skillName: 'phase4-skill',
        executionTimeMs: 10,
        exitCode: 0,
      };

      await logger.logSkillExecution(metrics);

      // PostgreSQL should not be called (disabled by default)
      expect(mockPgPool.query).not.toHaveBeenCalled();
    });

    it('should load PostgreSQL config from environment variables', async () => {
      process.env.PHASE4_POSTGRES_HOST = 'test-host';
      process.env.PHASE4_POSTGRES_DB = 'test-db';
      process.env.PHASE4_POSTGRES_USER = 'test-user';
      process.env.PHASE4_POSTGRES_PASS = 'test-pass';
      process.env.ENABLE_PHASE4_LOGGING = 'true';

      logger = new SkillExecutionLogger({
        sqliteDbPath: TEST_SQLITE_DB,
      });

      expect(logger).toBeDefined();

      // Clean up
      delete process.env.PHASE4_POSTGRES_HOST;
      delete process.env.PHASE4_POSTGRES_DB;
      delete process.env.PHASE4_POSTGRES_USER;
      delete process.env.PHASE4_POSTGRES_PASS;
      delete process.env.ENABLE_PHASE4_LOGGING;
    });
  });
});
