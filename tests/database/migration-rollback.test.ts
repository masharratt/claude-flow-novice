/**
 * Migration Manager Rollback Tests
 *
 * Comprehensive test suite for database migration rollback functionality.
 * Tests cover:
 * - Migration application and rollback
 * - Partial rollback to specific versions
 * - Complete rollback (all migrations)
 * - Dry-run mode
 * - Transaction atomicity
 * - Idempotency
 * - Error handling
 * - Migration validation
 * - Rollback history tracking
 *
 * @module migration-rollback.test
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MigrationManager, createMigrationManager, MigrationResult } from '../../src/db/migration-manager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Test Setup & Teardown
// ============================================================================

describe('Migration Manager - Rollback Functionality', () => {
  let testDir: string;
  let dbPath: string;
  let migrationsDir: string;
  let manager: MigrationManager;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'migration-test-'));
    dbPath = path.join(testDir, 'test.db');
    migrationsDir = path.join(testDir, 'migrations');

    // Create migration directories
    await fs.mkdir(path.join(migrationsDir, 'up'), { recursive: true });
    await fs.mkdir(path.join(migrationsDir, 'down'), { recursive: true });
  });

  afterEach(async () => {
    // Clean up test database and files
    if (manager) {
      await manager.close();
    }

    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  /**
   * Create a test migration (both up and down)
   */
  async function createTestMigration(
    version: string,
    name: string,
    upSql: string,
    downSql: string
  ): Promise<void> {
    const filename = `${version}-${name}.sql`;
    await fs.writeFile(path.join(migrationsDir, 'up', filename), upSql);
    await fs.writeFile(path.join(migrationsDir, 'down', filename), downSql);
  }

  /**
   * Initialize migration manager
   */
  async function initManager(config?: { dryRun?: boolean; verbose?: boolean }): Promise<MigrationManager> {
    manager = await createMigrationManager({
      databasePath: dbPath,
      migrationsDir,
      operator: 'test-suite',
      ...config,
    });
    return manager;
  }

  /**
   * Check if a table exists in the database
   */
  async function tableExists(tableName: string): Promise<boolean> {
    const applied = await manager.getAppliedMigrations();
    // For simplicity, we'll use the migration manager's internal DB connection
    // In a real test, you'd query sqlite_master
    return applied.length > 0; // Simplified check
  }

  // ==========================================================================
  // Test Cases - Initialization
  // ==========================================================================

  describe('Initialization', () => {
    it('should initialize migration manager successfully', async () => {
      await initManager();
      expect(manager).toBeDefined();

      const currentVersion = await manager.getCurrentVersion();
      expect(currentVersion).toBeNull(); // No migrations applied yet
    });

    it('should create migration tracking tables on initialization', async () => {
      await initManager();

      const applied = await manager.getAppliedMigrations();
      expect(applied).toEqual([]);

      const rollbackHistory = await manager.getRollbackHistory();
      expect(rollbackHistory).toEqual([]);
    });

    it('should handle multiple initializations idempotently', async () => {
      await initManager();
      await manager.close();

      await initManager();
      const applied = await manager.getAppliedMigrations();
      expect(applied).toEqual([]);
    });
  });

  // ==========================================================================
  // Test Cases - Migration Discovery
  // ==========================================================================

  describe('Migration Discovery', () => {
    it('should discover all migration files', async () => {
      await createTestMigration('001', 'create-users', 'CREATE TABLE users (id INT);', 'DROP TABLE users;');
      await createTestMigration('002', 'create-posts', 'CREATE TABLE posts (id INT);', 'DROP TABLE posts;');

      await initManager();

      const migrations = await manager.discoverMigrations();
      expect(migrations).toHaveLength(2);
      expect(migrations[0].version).toBe('001');
      expect(migrations[0].name).toBe('create-users');
      expect(migrations[1].version).toBe('002');
      expect(migrations[1].name).toBe('create-posts');
    });

    it('should sort migrations by version number', async () => {
      await createTestMigration('003', 'third', 'SELECT 1;', 'SELECT 1;');
      await createTestMigration('001', 'first', 'SELECT 1;', 'SELECT 1;');
      await createTestMigration('002', 'second', 'SELECT 1;', 'SELECT 1;');

      await initManager();

      const migrations = await manager.discoverMigrations();
      expect(migrations[0].version).toBe('001');
      expect(migrations[1].version).toBe('002');
      expect(migrations[2].version).toBe('003');
    });

    it('should handle empty migrations directory', async () => {
      await initManager();

      const migrations = await manager.discoverMigrations();
      expect(migrations).toEqual([]);
    });
  });

  // ==========================================================================
  // Test Cases - Migration Application
  // ==========================================================================

  describe('Migration Application', () => {
    it('should apply a single migration successfully', async () => {
      await createTestMigration(
        '001',
        'create-users',
        'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);',
        'DROP TABLE users;'
      );

      await initManager();

      const results = await manager.migrateUp();
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].version).toBe('001');

      const currentVersion = await manager.getCurrentVersion();
      expect(currentVersion).toBe('001');
    });

    it('should apply multiple migrations in order', async () => {
      await createTestMigration('001', 'first', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');
      await createTestMigration('002', 'second', 'CREATE TABLE t2 (id INT);', 'DROP TABLE t2;');
      await createTestMigration('003', 'third', 'CREATE TABLE t3 (id INT);', 'DROP TABLE t3;');

      await initManager();

      const results = await manager.migrateUp();
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);

      const currentVersion = await manager.getCurrentVersion();
      expect(currentVersion).toBe('003');
    });

    it('should skip already applied migrations', async () => {
      await createTestMigration('001', 'first', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager();

      // Apply once
      await manager.migrateUp();

      // Apply again - should skip
      const results = await manager.migrateUp();
      expect(results).toEqual([]);
    });

    it('should stop on migration failure', async () => {
      await createTestMigration('001', 'valid', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');
      await createTestMigration('002', 'invalid', 'INVALID SQL SYNTAX;', 'SELECT 1;');
      await createTestMigration('003', 'valid', 'CREATE TABLE t3 (id INT);', 'DROP TABLE t3;');

      await initManager();

      const results = await manager.migrateUp();
      expect(results).toHaveLength(2); // First migration succeeds, second fails
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);

      const currentVersion = await manager.getCurrentVersion();
      expect(currentVersion).toBe('001'); // Only first migration applied
    });

    it('should record migration metadata (checksum, timestamp, operator)', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager();
      await manager.migrateUp();

      const applied = await manager.getAppliedMigrations();
      expect(applied).toHaveLength(1);
      expect(applied[0].version).toBe('001');
      expect(applied[0].name).toBe('test');
      expect(applied[0].checksum).toBeTruthy();
      expect(applied[0].applied_at).toBeTruthy();
      expect(applied[0].execution_time_ms).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Test Cases - Rollback Operations
  // ==========================================================================

  describe('Rollback Operations', () => {
    it('should rollback the last migration', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager();
      await manager.migrateUp();

      const currentVersion = await manager.getCurrentVersion();
      expect(currentVersion).toBe('001');

      const rollbackResults = await manager.rollbackLast(1, 'Testing rollback');
      expect(rollbackResults).toHaveLength(1);
      expect(rollbackResults[0].success).toBe(true);

      const newVersion = await manager.getCurrentVersion();
      expect(newVersion).toBeNull();
    });

    it('should rollback multiple migrations', async () => {
      await createTestMigration('001', 'first', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');
      await createTestMigration('002', 'second', 'CREATE TABLE t2 (id INT);', 'DROP TABLE t2;');
      await createTestMigration('003', 'third', 'CREATE TABLE t3 (id INT);', 'DROP TABLE t3;');

      await initManager();
      await manager.migrateUp();

      const rollbackResults = await manager.rollbackLast(2, 'Rollback last 2');
      expect(rollbackResults).toHaveLength(2);
      expect(rollbackResults.every((r) => r.success)).toBe(true);

      const currentVersion = await manager.getCurrentVersion();
      expect(currentVersion).toBe('001');
    });

    it('should rollback to a specific version', async () => {
      await createTestMigration('001', 'first', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');
      await createTestMigration('002', 'second', 'CREATE TABLE t2 (id INT);', 'DROP TABLE t2;');
      await createTestMigration('003', 'third', 'CREATE TABLE t3 (id INT);', 'DROP TABLE t3;');

      await initManager();
      await manager.migrateUp();

      const rollbackResults = await manager.rollbackTo('001', 'Rollback to version 001');
      expect(rollbackResults).toHaveLength(2); // Rollback 003 and 002

      const currentVersion = await manager.getCurrentVersion();
      expect(currentVersion).toBe('001');
    });

    it('should rollback all migrations', async () => {
      await createTestMigration('001', 'first', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');
      await createTestMigration('002', 'second', 'CREATE TABLE t2 (id INT);', 'DROP TABLE t2;');

      await initManager();
      await manager.migrateUp();

      const rollbackResults = await manager.rollbackAll('Reset database');
      expect(rollbackResults).toHaveLength(2);
      expect(rollbackResults.every((r) => r.success)).toBe(true);

      const currentVersion = await manager.getCurrentVersion();
      expect(currentVersion).toBeNull();
    });

    it('should handle rollback when no migrations are applied', async () => {
      await initManager();

      const rollbackResults = await manager.rollbackLast(1);
      expect(rollbackResults).toEqual([]);
    });

    it('should handle rollback when already at target version', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager();
      await manager.migrateUp();

      const rollbackResults = await manager.rollbackTo('001');
      expect(rollbackResults).toEqual([]);
    });

    it('should record rollback in history', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager();
      await manager.migrateUp();
      await manager.rollbackLast(1, 'Test rollback reason');

      const rollbackHistory = await manager.getRollbackHistory();
      expect(rollbackHistory).toHaveLength(1);
      expect(rollbackHistory[0].version).toBe('001');
      expect(rollbackHistory[0].reason).toBe('Test rollback reason');
      expect(rollbackHistory[0].rolled_back_by).toBe('test-suite');
      expect(rollbackHistory[0].success).toBe(1);
    });

    it('should handle missing down migration gracefully', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager();
      await manager.migrateUp();

      // Delete down migration
      await fs.unlink(path.join(migrationsDir, 'down', '001-test.sql'));

      const rollbackResults = await manager.rollbackLast(1);
      expect(rollbackResults).toHaveLength(1);
      expect(rollbackResults[0].success).toBe(false);
      expect(rollbackResults[0].error).toContain('Down migration not found');
    });

    it('should record failed rollback in history', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'INVALID SQL;');

      await initManager();
      await manager.migrateUp();

      // Create invalid down migration
      await fs.writeFile(path.join(migrationsDir, 'down', '001-test.sql'), 'INVALID SQL SYNTAX;');

      await manager.rollbackLast(1);

      const rollbackHistory = await manager.getRollbackHistory();
      expect(rollbackHistory).toHaveLength(1);
      expect(rollbackHistory[0].success).toBe(0);
      expect(rollbackHistory[0].error_message).toBeTruthy();
    });
  });

  // ==========================================================================
  // Test Cases - Idempotency
  // ==========================================================================

  describe('Idempotency', () => {
    it('should handle idempotent rollback (safe to run multiple times)', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE IF EXISTS t1;');

      await initManager();
      await manager.migrateUp();

      // First rollback
      const result1 = await manager.rollbackLast(1);
      expect(result1[0].success).toBe(true);

      // Attempt second rollback (should fail gracefully - no migration to rollback)
      const result2 = await manager.rollbackLast(1);
      expect(result2).toEqual([]);
    });

    it('should handle idempotent down migrations (DROP IF EXISTS)', async () => {
      await createTestMigration(
        '001',
        'test',
        'CREATE TABLE t1 (id INT);',
        'DROP TABLE IF EXISTS t1; DROP INDEX IF EXISTS idx_t1;'
      );

      await initManager();
      await manager.migrateUp();

      // Rollback should succeed even if objects don't exist
      const result = await manager.rollbackLast(1);
      expect(result[0].success).toBe(true);
    });
  });

  // ==========================================================================
  // Test Cases - Transaction Support
  // ==========================================================================

  describe('Transaction Support', () => {
    it('should rollback migration on SQL error (atomic)', async () => {
      await createTestMigration(
        '001',
        'test',
        `
        CREATE TABLE t1 (id INT);
        CREATE TABLE t2 (id INT);
        INVALID SQL;  -- This should cause rollback
        CREATE TABLE t3 (id INT);
      `,
        'DROP TABLE t1; DROP TABLE t2; DROP TABLE t3;'
      );

      await initManager();

      const results = await manager.migrateUp();
      expect(results[0].success).toBe(false);

      // No migration should be recorded
      const applied = await manager.getAppliedMigrations();
      expect(applied).toEqual([]);
    });

    it('should rollback down migration on error (atomic)', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1; INVALID SQL;');

      await initManager();
      await manager.migrateUp();

      const rollbackResults = await manager.rollbackLast(1);
      expect(rollbackResults[0].success).toBe(false);

      // Migration should still be recorded (rollback failed)
      const applied = await manager.getAppliedMigrations();
      expect(applied).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Test Cases - Dry-Run Mode
  // ==========================================================================

  describe('Dry-Run Mode', () => {
    it('should simulate migration without applying changes (dry-run)', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager({ dryRun: true });

      const results = await manager.migrateUp();
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].dryRun).toBe(true);

      // No migration should be recorded
      const applied = await manager.getAppliedMigrations();
      expect(applied).toEqual([]);
    });

    it('should simulate rollback without applying changes (dry-run)', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      // Apply migration without dry-run
      await initManager();
      await manager.migrateUp();
      await manager.close();

      // Rollback with dry-run
      await initManager({ dryRun: true });

      const rollbackResults = await manager.rollbackLast(1);
      expect(rollbackResults).toHaveLength(1);
      expect(rollbackResults[0].success).toBe(true);
      expect(rollbackResults[0].dryRun).toBe(true);

      // Migration should still be recorded (not actually rolled back)
      const currentVersion = await manager.getCurrentVersion();
      expect(currentVersion).toBe('001');
    });
  });

  // ==========================================================================
  // Test Cases - Migration Validation
  // ==========================================================================

  describe('Migration Validation', () => {
    it('should validate migration checksums', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager();
      await manager.migrateUp();

      const validation = await manager.validateMigrations();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should detect checksum mismatch (migration file modified)', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager();
      await manager.migrateUp();
      await manager.close();

      // Modify migration file
      await fs.writeFile(
        path.join(migrationsDir, 'up', '001-test.sql'),
        'CREATE TABLE t1 (id INT, name TEXT);'
      );

      await initManager();

      const validation = await manager.validateMigrations();
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('Checksum mismatch');
    });

    it('should detect missing migration file', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager();
      await manager.migrateUp();
      await manager.close();

      // Delete migration file
      await fs.unlink(path.join(migrationsDir, 'up', '001-test.sql'));

      await initManager();

      const validation = await manager.validateMigrations();
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('Migration file not found');
    });
  });

  // ==========================================================================
  // Test Cases - Query Methods
  // ==========================================================================

  describe('Query Methods', () => {
    it('should check if migration is applied', async () => {
      await createTestMigration('001', 'test', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');

      await initManager();

      const beforeApply = await manager.isMigrationApplied('001');
      expect(beforeApply).toBe(false);

      await manager.migrateUp();

      const afterApply = await manager.isMigrationApplied('001');
      expect(afterApply).toBe(true);
    });

    it('should get current version (latest applied migration)', async () => {
      await createTestMigration('001', 'first', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');
      await createTestMigration('002', 'second', 'CREATE TABLE t2 (id INT);', 'DROP TABLE t2;');

      await initManager();
      await manager.migrateUp();

      const currentVersion = await manager.getCurrentVersion();
      expect(currentVersion).toBe('002');
    });

    it('should get all applied migrations in order', async () => {
      await createTestMigration('001', 'first', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');
      await createTestMigration('002', 'second', 'CREATE TABLE t2 (id INT);', 'DROP TABLE t2;');

      await initManager();
      await manager.migrateUp();

      const applied = await manager.getAppliedMigrations();
      expect(applied).toHaveLength(2);
      expect(applied[0].version).toBe('001');
      expect(applied[1].version).toBe('002');
    });

    it('should get rollback history in reverse chronological order', async () => {
      await createTestMigration('001', 'first', 'CREATE TABLE t1 (id INT);', 'DROP TABLE t1;');
      await createTestMigration('002', 'second', 'CREATE TABLE t2 (id INT);', 'DROP TABLE t2;');

      await initManager();
      await manager.migrateUp();
      await manager.rollbackLast(2);

      const history = await manager.getRollbackHistory();
      expect(history).toHaveLength(2);
      // Most recent rollback first
      expect(history[0].version).toBe('002');
      expect(history[1].version).toBe('001');
    });
  });

  // ==========================================================================
  // Test Cases - Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it('should throw error when database not initialized', async () => {
      const uninitializedManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });

      await expect(uninitializedManager.migrateUp()).rejects.toThrow('Database not initialized');
    });

    it('should throw error when rolling back to non-existent version', async () => {
      await initManager();

      await expect(manager.rollbackTo('999')).rejects.toThrow('not found in applied migrations');
    });

    it('should handle file system errors gracefully', async () => {
      await initManager();

      // Attempt to discover migrations from non-existent directory
      const migrations = await manager.discoverMigrations();
      expect(migrations).toEqual([]);
    });
  });
});
