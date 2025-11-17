/**
 * Database Migration Manager with Rollback Support
 *
 * Provides comprehensive database migration management with:
 * - Forward (up) and backward (down) migrations
 * - Migration versioning and history tracking
 * - Rollback to specific versions
 * - Transaction support for atomic operations
 * - Dry-run mode for testing
 * - Idempotent rollback operations
 * - Detailed logging with timestamps
 *
 * @module migration-manager
 * @version 1.0.0
 */

import { Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

// ============================================================================
// Type Definitions
// ============================================================================

export interface MigrationFile {
  version: string;
  name: string;
  upPath: string;
  downPath: string;
}

export interface MigrationRecord {
  id: number;
  version: string;
  name: string;
  applied_at: string;
  checksum: string;
  execution_time_ms: number;
}

export interface RollbackRecord {
  id: number;
  version: string;
  name: string;
  rolled_back_at: string;
  reason: string;
  execution_time_ms: number;
  rolled_back_by: string;
}

export interface MigrationResult {
  success: boolean;
  version: string;
  name: string;
  executionTimeMs: number;
  error?: string;
  dryRun?: boolean;
}

export interface MigrationManagerConfig {
  databasePath: string;
  migrationsDir: string;
  dryRun?: boolean;
  verbose?: boolean;
  operator?: string; // Who is performing the migration/rollback
}

// ============================================================================
// Migration Manager Class
// ============================================================================

export class MigrationManager {
  private db: Database | null = null;
  private config: MigrationManagerConfig;

  constructor(config: MigrationManagerConfig) {
    this.config = {
      dryRun: false,
      verbose: false,
      operator: 'system',
      ...config,
    };
  }

  // ==========================================================================
  // Initialization & Connection
  // ==========================================================================

  /**
   * Initialize database connection and create migration tracking tables
   */
  async initialize(): Promise<void> {
    try {
      this.db = await open({
        filename: this.config.databasePath,
        driver: sqlite3.Database,
      });

      await this.createMigrationTables();
      this.log('Migration manager initialized');
    } catch (error) {
      throw new Error(
        `Failed to initialize migration manager: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create migration tracking tables if they don't exist
   */
  private async createMigrationTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Schema migrations table (tracks applied migrations)
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL,
        execution_time_ms INTEGER NOT NULL,
        applied_by TEXT DEFAULT 'system'
      );

      CREATE INDEX IF NOT EXISTS idx_schema_migrations_version
        ON schema_migrations(version);

      CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
        ON schema_migrations(applied_at DESC);
    `);

    // Rollback history table (tracks all rollback operations)
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS migration_rollback_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        name TEXT NOT NULL,
        rolled_back_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reason TEXT,
        execution_time_ms INTEGER NOT NULL,
        rolled_back_by TEXT DEFAULT 'system',
        success BOOLEAN NOT NULL DEFAULT 1,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_rollback_history_version
        ON migration_rollback_history(version);

      CREATE INDEX IF NOT EXISTS idx_rollback_history_rolled_back_at
        ON migration_rollback_history(rolled_back_at DESC);
    `);
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.log('Migration manager closed');
    }
  }

  // ==========================================================================
  // Migration Discovery
  // ==========================================================================

  /**
   * Discover all migration files (both up and down)
   */
  async discoverMigrations(): Promise<MigrationFile[]> {
    const upMigrationsDir = path.join(this.config.migrationsDir, 'up');
    const downMigrationsDir = path.join(this.config.migrationsDir, 'down');

    // Get all up migration files
    const upFiles = await this.getMigrationFiles(upMigrationsDir);

    // Match with down migration files
    const migrations: MigrationFile[] = [];

    for (const upFile of upFiles) {
      const parsed = this.parseMigrationFilename(upFile);
      if (!parsed) continue;

      const downPath = path.join(downMigrationsDir, upFile);

      migrations.push({
        version: parsed.version,
        name: parsed.name,
        upPath: path.join(upMigrationsDir, upFile),
        downPath,
      });
    }

    // Sort by version
    migrations.sort((a, b) => this.compareVersions(a.version, b.version));

    return migrations;
  }

  /**
   * Get all SQL migration files from a directory
   */
  private async getMigrationFiles(dir: string): Promise<string[]> {
    try {
      const files = await fs.readdir(dir);
      return files.filter((f) => f.endsWith('.sql')).sort();
    } catch (error) {
      // Directory doesn't exist yet
      return [];
    }
  }

  /**
   * Parse migration filename to extract version and name
   * Format: 001-migration-name.sql
   */
  private parseMigrationFilename(filename: string): { version: string; name: string } | null {
    const match = filename.match(/^(\d+)-(.+)\.sql$/);
    if (!match) return null;

    return {
      version: match[1],
      name: match[2],
    };
  }

  /**
   * Compare two version strings (numeric comparison)
   */
  private compareVersions(a: string, b: string): number {
    return parseInt(a, 10) - parseInt(b, 10);
  }

  // ==========================================================================
  // Migration Application
  // ==========================================================================

  /**
   * Apply all pending migrations
   */
  async migrateUp(): Promise<MigrationResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const migrations = await this.discoverMigrations();
    const applied = await this.getAppliedMigrations();
    const appliedVersions = new Set(applied.map((m) => m.version));

    const pending = migrations.filter((m) => !appliedVersions.has(m.version));

    if (pending.length === 0) {
      this.log('No pending migrations');
      return [];
    }

    this.log(`Found ${pending.length} pending migration(s)`);

    const results: MigrationResult[] = [];

    for (const migration of pending) {
      const result = await this.applyMigration(migration);
      results.push(result);

      if (!result.success) {
        this.log(`Migration failed: ${migration.version} - ${migration.name}`, 'error');
        break; // Stop on first failure
      }
    }

    return results;
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(migration: MigrationFile): Promise<MigrationResult> {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = Date.now();

    try {
      // Read migration SQL
      const sql = await fs.readFile(migration.upPath, 'utf-8');
      const checksum = this.calculateChecksum(sql);

      if (this.config.dryRun) {
        this.log(`[DRY RUN] Would apply migration: ${migration.version} - ${migration.name}`);
        return {
          success: true,
          version: migration.version,
          name: migration.name,
          executionTimeMs: Date.now() - startTime,
          dryRun: true,
        };
      }

      // Execute migration in transaction
      await this.db.exec('BEGIN TRANSACTION');

      try {
        // Execute migration SQL
        await this.db.exec(sql);

        // Record migration
        await this.db.run(
          `INSERT INTO schema_migrations (version, name, checksum, execution_time_ms, applied_by)
           VALUES (?, ?, ?, ?, ?)`,
          [migration.version, migration.name, checksum, Date.now() - startTime, this.config.operator]
        );

        await this.db.exec('COMMIT');

        this.log(`Applied migration: ${migration.version} - ${migration.name}`);

        return {
          success: true,
          version: migration.version,
          name: migration.name,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        await this.db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      return {
        success: false,
        version: migration.version,
        name: migration.name,
        executionTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ==========================================================================
  // Migration Rollback
  // ==========================================================================

  /**
   * Rollback the last N migrations
   */
  async rollbackLast(count: number = 1, reason?: string): Promise<MigrationResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const applied = await this.getAppliedMigrations();

    if (applied.length === 0) {
      this.log('No migrations to rollback');
      return [];
    }

    const toRollback = applied.slice(-count).reverse();

    this.log(`Rolling back ${toRollback.length} migration(s)`);

    const results: MigrationResult[] = [];

    for (const migration of toRollback) {
      const result = await this.rollbackMigration(migration, reason);
      results.push(result);

      if (!result.success) {
        this.log(`Rollback failed: ${migration.version} - ${migration.name}`, 'error');
        break; // Stop on first failure
      }
    }

    return results;
  }

  /**
   * Rollback to a specific version (exclusive)
   * All migrations after the target version will be rolled back
   */
  async rollbackTo(targetVersion: string, reason?: string): Promise<MigrationResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const applied = await this.getAppliedMigrations();
    const targetIndex = applied.findIndex((m) => m.version === targetVersion);

    if (targetIndex === -1) {
      throw new Error(`Target version ${targetVersion} not found in applied migrations`);
    }

    // Rollback all migrations after target (in reverse order)
    const toRollback = applied.slice(targetIndex + 1).reverse();

    if (toRollback.length === 0) {
      this.log(`Already at version ${targetVersion}`);
      return [];
    }

    this.log(`Rolling back ${toRollback.length} migration(s) to version ${targetVersion}`);

    const results: MigrationResult[] = [];

    for (const migration of toRollback) {
      const result = await this.rollbackMigration(migration, reason);
      results.push(result);

      if (!result.success) {
        this.log(`Rollback failed: ${migration.version} - ${migration.name}`, 'error');
        break; // Stop on first failure
      }
    }

    return results;
  }

  /**
   * Rollback all migrations (reset database to initial state)
   */
  async rollbackAll(reason?: string): Promise<MigrationResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const applied = await this.getAppliedMigrations();

    if (applied.length === 0) {
      this.log('No migrations to rollback');
      return [];
    }

    this.log(`Rolling back all ${applied.length} migration(s)`);

    const results: MigrationResult[] = [];

    // Rollback in reverse order
    for (const migration of applied.reverse()) {
      const result = await this.rollbackMigration(migration, reason);
      results.push(result);

      if (!result.success) {
        this.log(`Rollback failed: ${migration.version} - ${migration.name}`, 'error');
        break; // Stop on first failure
      }
    }

    return results;
  }

  /**
   * Rollback a single migration (idempotent)
   */
  private async rollbackMigration(
    migration: MigrationRecord,
    reason?: string
  ): Promise<MigrationResult> {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = Date.now();

    try {
      // Find the migration file
      const migrations = await this.discoverMigrations();
      const migrationFile = migrations.find((m) => m.version === migration.version);

      if (!migrationFile) {
        throw new Error(`Migration file not found for version ${migration.version}`);
      }

      // Check if down migration exists
      try {
        await fs.access(migrationFile.downPath);
      } catch {
        throw new Error(`Down migration not found: ${migrationFile.downPath}`);
      }

      // Read rollback SQL
      const sql = await fs.readFile(migrationFile.downPath, 'utf-8');

      if (this.config.dryRun) {
        this.log(`[DRY RUN] Would rollback migration: ${migration.version} - ${migration.name}`);
        return {
          success: true,
          version: migration.version,
          name: migration.name,
          executionTimeMs: Date.now() - startTime,
          dryRun: true,
        };
      }

      // Execute rollback in transaction
      await this.db.exec('BEGIN TRANSACTION');

      try {
        // Execute rollback SQL
        await this.db.exec(sql);

        // Remove migration record
        await this.db.run(`DELETE FROM schema_migrations WHERE version = ?`, [migration.version]);

        // Record rollback in history
        await this.db.run(
          `INSERT INTO migration_rollback_history
           (version, name, reason, execution_time_ms, rolled_back_by, success)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [
            migration.version,
            migration.name,
            reason || 'Manual rollback',
            Date.now() - startTime,
            this.config.operator,
          ]
        );

        await this.db.exec('COMMIT');

        this.log(`Rolled back migration: ${migration.version} - ${migration.name}`);

        return {
          success: true,
          version: migration.version,
          name: migration.name,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        await this.db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      // Record failed rollback
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (!this.config.dryRun) {
        await this.db.run(
          `INSERT INTO migration_rollback_history
           (version, name, reason, execution_time_ms, rolled_back_by, success, error_message)
           VALUES (?, ?, ?, ?, ?, 0, ?)`,
          [
            migration.version,
            migration.name,
            reason || 'Manual rollback',
            Date.now() - startTime,
            this.config.operator,
            errorMessage,
          ]
        );
      }

      return {
        success: false,
        version: migration.version,
        name: migration.name,
        executionTimeMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get all applied migrations (ordered by version)
   */
  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    return this.db.all<MigrationRecord[]>(
      `SELECT * FROM schema_migrations ORDER BY version ASC`
    );
  }

  /**
   * Get rollback history (most recent first)
   */
  async getRollbackHistory(): Promise<RollbackRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    return this.db.all<RollbackRecord[]>(
      `SELECT * FROM migration_rollback_history ORDER BY rolled_back_at DESC`
    );
  }

  /**
   * Get current database version (latest applied migration)
   */
  async getCurrentVersion(): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.get<{ version: string }>(
      `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`
    );

    return result?.version || null;
  }

  /**
   * Check if a specific migration is applied
   */
  async isMigrationApplied(version: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM schema_migrations WHERE version = ?`,
      [version]
    );

    return (result?.count || 0) > 0;
  }

  /**
   * Validate migration integrity (check checksums)
   */
  async validateMigrations(): Promise<{ valid: boolean; errors: string[] }> {
    if (!this.db) throw new Error('Database not initialized');

    const applied = await this.getAppliedMigrations();
    const migrations = await this.discoverMigrations();

    const errors: string[] = [];

    for (const appliedMigration of applied) {
      const migrationFile = migrations.find((m) => m.version === appliedMigration.version);

      if (!migrationFile) {
        errors.push(`Migration file not found for version ${appliedMigration.version}`);
        continue;
      }

      // Verify checksum
      const sql = await fs.readFile(migrationFile.upPath, 'utf-8');
      const checksum = this.calculateChecksum(sql);

      if (checksum !== appliedMigration.checksum) {
        errors.push(
          `Checksum mismatch for version ${appliedMigration.version}: ` +
            `expected ${appliedMigration.checksum}, got ${checksum}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Calculate SHA256 checksum of SQL content
   */
  private calculateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Log message (if verbose mode enabled)
   */
  private log(message: string, level: 'info' | 'error' = 'info'): void {
    if (this.config.verbose || level === 'error') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [MigrationManager] ${message}`);
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create and initialize a migration manager
 */
export async function createMigrationManager(
  config: MigrationManagerConfig
): Promise<MigrationManager> {
  const manager = new MigrationManager(config);
  await manager.initialize();
  return manager;
}
