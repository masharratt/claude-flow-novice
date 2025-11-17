/**
 * Migration Manager Tests
 *
 * Comprehensive test suite for migration-manager.ts with target >90% coverage.
 * Tests database migration application, rollback, versioning, and error handling.
 *
 * CRITICAL DATABASE INFRASTRUCTURE - Ensures reliable schema evolution
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import {
  MigrationManager,
  createMigrationManager,
  MigrationManagerConfig,
  MigrationFile,
  MigrationResult,
} from '../../src/db/migration-manager';
import { Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

describe('MigrationManager', () => {
  let testDir: string;
  let dbPath: string;
  let migrationsDir: string;
  let migrationManager: MigrationManager;
  let db: Database | null = null;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(tmpdir(), `migration-test-${Date.now()}-${Math.random()}`);
    await fs.mkdir(testDir, { recursive: true });

    dbPath = path.join(testDir, 'test.db');
    migrationsDir = path.join(testDir, 'migrations');

    // Create migration subdirectories
    await fs.mkdir(path.join(migrationsDir, 'up'), { recursive: true });
    await fs.mkdir(path.join(migrationsDir, 'down'), { recursive: true });
  });

  afterEach(async () => {
    // Close manager
    if (migrationManager) {
      await migrationManager.close();
    }

    // Close database if open
    if (db) {
      await db.close();
      db = null;
    }

    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should initialize with valid configuration', async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });

      await migrationManager.initialize();

      // Verify tables were created
      db = await open({ filename: dbPath, driver: sqlite3.Database });

      const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
      );

      const tableNames = tables.map((t: any) => t.name);
      expect(tableNames).toContain('schema_migrations');
      expect(tableNames).toContain('migration_rollback_history');
    });

    it('should create migration tracking tables with correct schema', async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });

      await migrationManager.initialize();

      db = await open({ filename: dbPath, driver: sqlite3.Database });

      // Check schema_migrations columns
      const migrationColumns = await db.all(`PRAGMA table_info(schema_migrations)`);
      const migrationColumnNames = migrationColumns.map((c: any) => c.name);

      expect(migrationColumnNames).toContain('id');
      expect(migrationColumnNames).toContain('version');
      expect(migrationColumnNames).toContain('name');
      expect(migrationColumnNames).toContain('applied_at');
      expect(migrationColumnNames).toContain('checksum');
      expect(migrationColumnNames).toContain('execution_time_ms');

      // Check rollback_history columns
      const rollbackColumns = await db.all(`PRAGMA table_info(migration_rollback_history)`);
      const rollbackColumnNames = rollbackColumns.map((c: any) => c.name);

      expect(rollbackColumnNames).toContain('id');
      expect(rollbackColumnNames).toContain('version');
      expect(rollbackColumnNames).toContain('rolled_back_at');
      expect(rollbackColumnNames).toContain('reason');
    });

    it('should create indexes on migration tables', async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });

      await migrationManager.initialize();

      db = await open({ filename: dbPath, driver: sqlite3.Database });

      const indexes = await db.all(
        `SELECT name FROM sqlite_master WHERE type='index' ORDER BY name`
      );

      const indexNames = indexes.map((i: any) => i.name);
      expect(indexNames).toContain('idx_schema_migrations_version');
      expect(indexNames).toContain('idx_schema_migrations_applied_at');
    });

    it('should throw error if database path is invalid', async () => {
      migrationManager = new MigrationManager({
        databasePath: '/invalid/path/to/db.db',
        migrationsDir,
      });

      await expect(migrationManager.initialize()).rejects.toThrow(
        'Failed to initialize migration manager'
      );
    });

    it('should support verbose logging', async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
        verbose: true,
      });

      await migrationManager.initialize();
      // Should not throw - verbose is just for logging
    });

    it('should support custom operator', async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
        operator: 'test-user',
      });

      await migrationManager.initialize();
      // Should not throw
    });
  });

  describe('Migration Discovery', () => {
    beforeEach(async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });
      await migrationManager.initialize();
    });

    it('should discover no migrations when directory is empty', async () => {
      const migrations = await migrationManager.discoverMigrations();
      expect(migrations).toHaveLength(0);
    });

    it('should discover single migration', async () => {
      // Create migration files
      await createMigrationFiles('001', 'create-users-table', 'CREATE TABLE users (id INTEGER);', 'DROP TABLE users;');

      const migrations = await migrationManager.discoverMigrations();

      expect(migrations).toHaveLength(1);
      expect(migrations[0].version).toBe('001');
      expect(migrations[0].name).toBe('create-users-table');
    });

    it('should discover multiple migrations', async () => {
      await createMigrationFiles('001', 'create-users', 'CREATE TABLE users (id INTEGER);', 'DROP TABLE users;');
      await createMigrationFiles('002', 'create-posts', 'CREATE TABLE posts (id INTEGER);', 'DROP TABLE posts;');
      await createMigrationFiles('003', 'add-index', 'CREATE INDEX idx_users ON users(id);', 'DROP INDEX idx_users;');

      const migrations = await migrationManager.discoverMigrations();

      expect(migrations).toHaveLength(3);
      expect(migrations[0].version).toBe('001');
      expect(migrations[1].version).toBe('002');
      expect(migrations[2].version).toBe('003');
    });

    it('should sort migrations by version number', async () => {
      // Create out of order
      await createMigrationFiles('003', 'third', 'SELECT 3;', 'SELECT 3;');
      await createMigrationFiles('001', 'first', 'SELECT 1;', 'SELECT 1;');
      await createMigrationFiles('002', 'second', 'SELECT 2;', 'SELECT 2;');

      const migrations = await migrationManager.discoverMigrations();

      expect(migrations[0].version).toBe('001');
      expect(migrations[1].version).toBe('002');
      expect(migrations[2].version).toBe('003');
    });

    it('should handle missing migrations directory gracefully', async () => {
      // Delete migrations directory
      await fs.rm(migrationsDir, { recursive: true, force: true });

      const migrations = await migrationManager.discoverMigrations();
      expect(migrations).toHaveLength(0);
    });
  });

  describe('Migration Application', () => {
    beforeEach(async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });
      await migrationManager.initialize();
    });

    it('should apply single migration successfully', async () => {
      await createMigrationFiles(
        '001',
        'create-users',
        'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);',
        'DROP TABLE users;'
      );

      const results = await migrationManager.migrateUp();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].version).toBe('001');
      expect(results[0].name).toBe('create-users');
      expect(results[0].executionTimeMs).toBeGreaterThan(0);

      // Verify table was created
      db = await open({ filename: dbPath, driver: sqlite3.Database });
      const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
      );
      expect(tables).toHaveLength(1);
    });

    it('should apply multiple migrations in order', async () => {
      await createMigrationFiles('001', 'create-users', 'CREATE TABLE users (id INTEGER);', 'DROP TABLE users;');
      await createMigrationFiles('002', 'create-posts', 'CREATE TABLE posts (id INTEGER);', 'DROP TABLE posts;');

      const results = await migrationManager.migrateUp();

      expect(results).toHaveLength(2);
      expect(results[0].version).toBe('001');
      expect(results[1].version).toBe('002');
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should skip already applied migrations', async () => {
      await createMigrationFiles('001', 'create-users', 'CREATE TABLE users (id INTEGER);', 'DROP TABLE users;');

      // Apply once
      await migrationManager.migrateUp();

      // Try to apply again
      const results = await migrationManager.migrateUp();

      expect(results).toHaveLength(0); // No pending migrations
    });

    it('should record migration metadata', async () => {
      await createMigrationFiles('001', 'test-migration', 'CREATE TABLE test (id INTEGER);', 'DROP TABLE test;');

      await migrationManager.migrateUp();

      const applied = await migrationManager.getAppliedMigrations();

      expect(applied).toHaveLength(1);
      expect(applied[0].version).toBe('001');
      expect(applied[0].name).toBe('test-migration');
      expect(applied[0].checksum).toBeDefined();
      expect(applied[0].execution_time_ms).toBeGreaterThan(0);
      expect(applied[0].applied_at).toBeDefined();
    });

    it('should stop on first migration failure', async () => {
      await createMigrationFiles('001', 'good-migration', 'CREATE TABLE users (id INTEGER);', 'DROP TABLE users;');
      await createMigrationFiles('002', 'bad-migration', 'INVALID SQL SYNTAX', 'SELECT 1;');
      await createMigrationFiles('003', 'never-run', 'CREATE TABLE posts (id INTEGER);', 'DROP TABLE posts;');

      const results = await migrationManager.migrateUp();

      expect(results).toHaveLength(2); // Only first two attempted
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeDefined();
    });

    it('should rollback transaction on migration failure', async () => {
      await createMigrationFiles(
        '001',
        'failing-migration',
        'CREATE TABLE users (id INTEGER); INVALID SQL;',
        'DROP TABLE users;'
      );

      const results = await migrationManager.migrateUp();

      expect(results[0].success).toBe(false);

      // Verify table was NOT created (transaction rolled back)
      db = await open({ filename: dbPath, driver: sqlite3.Database });
      const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
      );
      expect(tables).toHaveLength(0);
    });

    it('should support dry-run mode', async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
        dryRun: true,
      });
      await migrationManager.initialize();

      await createMigrationFiles('001', 'test', 'CREATE TABLE users (id INTEGER);', 'DROP TABLE users;');

      const results = await migrationManager.migrateUp();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].dryRun).toBe(true);

      // Verify table was NOT created (dry run)
      db = await open({ filename: dbPath, driver: sqlite3.Database });
      const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
      );
      expect(tables).toHaveLength(0);
    });
  });

  describe('Migration Rollback', () => {
    beforeEach(async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });
      await migrationManager.initialize();
    });

    it('should rollback single migration', async () => {
      await createMigrationFiles('001', 'create-users', 'CREATE TABLE users (id INTEGER);', 'DROP TABLE users;');

      // Apply migration
      await migrationManager.migrateUp();

      // Rollback
      const results = await migrationManager.rollbackLast();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].version).toBe('001');

      // Verify table was dropped
      db = await open({ filename: dbPath, driver: sqlite3.Database });
      const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
      );
      expect(tables).toHaveLength(0);
    });

    it('should rollback to specific version', async () => {
      await createMigrationFiles('001', 'migration-1', 'CREATE TABLE t1 (id INTEGER);', 'DROP TABLE t1;');
      await createMigrationFiles('002', 'migration-2', 'CREATE TABLE t2 (id INTEGER);', 'DROP TABLE t2;');
      await createMigrationFiles('003', 'migration-3', 'CREATE TABLE t3 (id INTEGER);', 'DROP TABLE t3;');

      // Apply all
      await migrationManager.migrateUp();

      // Rollback to version 001
      const results = await migrationManager.rollbackTo('001');

      expect(results).toHaveLength(2); // Rolled back 002 and 003
      expect(results.every((r) => r.success)).toBe(true);

      // Verify only t1 exists
      db = await open({ filename: dbPath, driver: sqlite3.Database });
      const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 't%' ORDER BY name`
      );
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('t1');
    });

    it('should rollback all migrations', async () => {
      await createMigrationFiles('001', 'migration-1', 'CREATE TABLE t1 (id INTEGER);', 'DROP TABLE t1;');
      await createMigrationFiles('002', 'migration-2', 'CREATE TABLE t2 (id INTEGER);', 'DROP TABLE t2;');

      // Apply all
      await migrationManager.migrateUp();

      // Rollback all
      const results = await migrationManager.rollbackAll();

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);

      // Verify no tables exist
      db = await open({ filename: dbPath, driver: sqlite3.Database });
      const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 't%'`
      );
      expect(tables).toHaveLength(0);
    });

    it('should record rollback in history', async () => {
      await createMigrationFiles('001', 'test', 'CREATE TABLE test (id INTEGER);', 'DROP TABLE test;');

      await migrationManager.migrateUp();
      await migrationManager.rollbackLast('Testing rollback');

      const history = await migrationManager.getRollbackHistory();

      expect(history).toHaveLength(1);
      expect(history[0].version).toBe('001');
      expect(history[0].reason).toBe('Testing rollback');
      expect(history[0].rolled_back_at).toBeDefined();
    });

    it('should throw error if down migration file missing', async () => {
      await createMigrationFiles('001', 'test', 'CREATE TABLE test (id INTEGER);', 'DROP TABLE test;');
      await migrationManager.migrateUp();

      // Delete down migration file
      await fs.unlink(path.join(migrationsDir, 'down', '001-test.sql'));

      const results = await migrationManager.rollbackLast();

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('Down migration not found');
    });

    it('should support dry-run mode for rollback', async () => {
      await createMigrationFiles('001', 'test', 'CREATE TABLE test (id INTEGER);', 'DROP TABLE test;');
      await migrationManager.migrateUp();

      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
        dryRun: true,
      });
      await migrationManager.initialize();

      const results = await migrationManager.rollbackLast();

      expect(results[0].success).toBe(true);
      expect(results[0].dryRun).toBe(true);

      // Verify table still exists (dry run)
      db = await open({ filename: dbPath, driver: sqlite3.Database });
      const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='test'`
      );
      expect(tables).toHaveLength(1);
    });

    it('should handle rollback when no migrations applied', async () => {
      const results = await migrationManager.rollbackLast();
      expect(results).toHaveLength(0);
    });

    it('should handle rollbackTo when already at target version', async () => {
      await createMigrationFiles('001', 'test', 'CREATE TABLE test (id INTEGER);', 'DROP TABLE test;');
      await migrationManager.migrateUp();

      const results = await migrationManager.rollbackTo('001');
      expect(results).toHaveLength(0);
    });

    it('should throw error when rolling back to non-existent version', async () => {
      await createMigrationFiles('001', 'test', 'CREATE TABLE test (id INTEGER);', 'DROP TABLE test;');
      await migrationManager.migrateUp();

      await expect(migrationManager.rollbackTo('999')).rejects.toThrow(
        'Target version 999 not found'
      );
    });
  });

  describe('Query Methods', () => {
    beforeEach(async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });
      await migrationManager.initialize();
    });

    it('should get applied migrations', async () => {
      await createMigrationFiles('001', 'test-1', 'CREATE TABLE t1 (id INTEGER);', 'DROP TABLE t1;');
      await createMigrationFiles('002', 'test-2', 'CREATE TABLE t2 (id INTEGER);', 'DROP TABLE t2;');

      await migrationManager.migrateUp();

      const applied = await migrationManager.getAppliedMigrations();

      expect(applied).toHaveLength(2);
      expect(applied[0].version).toBe('001');
      expect(applied[1].version).toBe('002');
    });

    it('should get current version', async () => {
      await createMigrationFiles('001', 'test-1', 'SELECT 1;', 'SELECT 1;');
      await createMigrationFiles('002', 'test-2', 'SELECT 2;', 'SELECT 2;');

      await migrationManager.migrateUp();

      const version = await migrationManager.getCurrentVersion();
      expect(version).toBe('002');
    });

    it('should return null for current version when no migrations applied', async () => {
      const version = await migrationManager.getCurrentVersion();
      expect(version).toBeNull();
    });

    it('should check if migration is applied', async () => {
      await createMigrationFiles('001', 'test', 'SELECT 1;', 'SELECT 1;');
      await migrationManager.migrateUp();

      const isApplied = await migrationManager.isMigrationApplied('001');
      expect(isApplied).toBe(true);

      const notApplied = await migrationManager.isMigrationApplied('999');
      expect(notApplied).toBe(false);
    });

    it('should get rollback history', async () => {
      await createMigrationFiles('001', 'test', 'CREATE TABLE test (id INTEGER);', 'DROP TABLE test;');

      await migrationManager.migrateUp();
      await migrationManager.rollbackLast(1, 'Test reason'); // count=1, reason='Test reason'

      const history = await migrationManager.getRollbackHistory();

      expect(history).toHaveLength(1);
      expect(history[0].version).toBe('001');
      expect(history[0].reason).toBe('Test reason');
    });
  });

  describe('Migration Validation', () => {
    beforeEach(async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });
      await migrationManager.initialize();
    });

    it('should validate migrations successfully', async () => {
      await createMigrationFiles('001', 'test', 'CREATE TABLE test (id INTEGER);', 'DROP TABLE test;');
      await migrationManager.migrateUp();

      const validation = await migrationManager.validateMigrations();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect checksum mismatch', async () => {
      await createMigrationFiles('001', 'test', 'CREATE TABLE test (id INTEGER);', 'DROP TABLE test;');
      await migrationManager.migrateUp();

      // Modify migration file
      await fs.writeFile(
        path.join(migrationsDir, 'up', '001-test.sql'),
        'CREATE TABLE test (id INTEGER, name TEXT);'
      );

      const validation = await migrationManager.validateMigrations();

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('Checksum mismatch');
    });

    it('should detect missing migration file', async () => {
      await createMigrationFiles('001', 'test', 'CREATE TABLE test (id INTEGER);', 'DROP TABLE test;');
      await migrationManager.migrateUp();

      // Delete migration file
      await fs.unlink(path.join(migrationsDir, 'up', '001-test.sql'));

      const validation = await migrationManager.validateMigrations();

      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('Migration file not found');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when not initialized', async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });

      // Don't initialize

      await expect(migrationManager.migrateUp()).rejects.toThrow('Database not initialized');
    });

    it('should close cleanly even if not initialized', async () => {
      migrationManager = new MigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });

      await expect(migrationManager.close()).resolves.not.toThrow();
    });
  });

  describe('Convenience Functions', () => {
    it('should create and initialize manager with createMigrationManager', async () => {
      const manager = await createMigrationManager({
        databasePath: dbPath,
        migrationsDir,
      });

      expect(manager).toBeInstanceOf(MigrationManager);

      // Verify initialized
      const version = await manager.getCurrentVersion();
      expect(version).toBeNull(); // No migrations yet

      await manager.close();
    });
  });

  // Helper function to create migration files
  async function createMigrationFiles(
    version: string,
    name: string,
    upSql: string,
    downSql: string
  ): Promise<void> {
    const filename = `${version}-${name}.sql`;

    await fs.writeFile(path.join(migrationsDir, 'up', filename), upSql);
    await fs.writeFile(path.join(migrationsDir, 'down', filename), downSql);
  }
});
