/**
 * Database Migration Module
 * Migrated from: docker/skills/database-readwrite/migrate.sh
 *
 * Executes database migrations in up/down direction
 * SECURITY: Password passed via environment variable (ADMIN_DB_PASSWORD)
 * NOTE: This is a placeholder. Integrate with migration tool in Phase 2
 *       (e.g., node-pg-migrate, Flyway, Liquibase)
 */

import { spawnSync } from 'child_process';

/**
 * Supported migration directions
 */
export enum MigrationDirection {
  Up = 'up',
  Down = 'down'
}

/**
 * Database configuration for migrations (requires admin access)
 */
export interface MigrationConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  success: boolean;
  message?: string;
  error?: string;
  direction: MigrationDirection | string;
  currentVersion?: string;
  exitCode: number;
  timestamp: Date;
}

/**
 * Database migration executor
 * Validates direction before executing migrations
 */
export class DatabaseMigrator {
  private config: MigrationConfig;

  constructor(config?: Partial<MigrationConfig>) {
    this.config = {
      host: config?.host || process.env.POSTGRES_HOST || 'cfn-postgres',
      port: config?.port || parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: config?.database || process.env.POSTGRES_DB || 'cfn_corporate',
      user: config?.user || 'admin_user',
      password: config?.password || process.env.ADMIN_DB_PASSWORD || 'admin_password'
    };
  }

  /**
   * Validate migration direction
   * Only 'up' and 'down' are valid
   */
  private validateDirection(direction: string): boolean {
    return direction === 'up' || direction === 'down';
  }

  /**
   * Parse and validate direction argument
   * Defaults to 'up' if not provided
   */
  private parseDirection(input?: string): string {
    const direction = input || 'up';

    if (!this.validateDirection(direction.toLowerCase())) {
      throw new Error(`Invalid migration direction: ${direction}\nUsage: migrate {up|down}`);
    }

    return direction.toLowerCase();
  }

  /**
   * Query current migration status
   * Returns the latest applied migration version
   * SECURITY: Password is passed via PGPASSWORD environment variable
   */
  private queryMigrationStatus(): QueryStatusResult {
    const query = 'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;';

    const result = spawnSync('psql', [
      '-h', this.config.host,
      '-p', String(this.config.port),
      '-U', this.config.user,
      '-d', this.config.database,
      '-c', query
    ], {
      env: {
        ...process.env,
        PGPASSWORD: this.config.password
      },
      encoding: 'utf-8'
    });

    return {
      success: result.status === 0,
      output: result.stdout,
      error: result.stderr
    };
  }

  /**
   * Execute database migration
   * Validates direction, logs operation, and queries status
   * SECURITY: Password is passed via PGPASSWORD environment variable
   */
  async migrate(direction?: string): Promise<MigrationResult> {
    return new Promise((resolve) => {
      try {
        const dir = this.parseDirection(direction);
        const timestamp = new Date();

        // Log migration start
        console.log(`Running database migrations (${dir})...`);

        // Query current migration status
        const statusResult = this.queryMigrationStatus();

        if (!statusResult.success) {
          console.error('Failed to query migration status');
        }

        // Extract version from output if available
        const currentVersion = statusResult.output
          ? statusResult.output.split('\n').find(line => /^\d+/.test(line))
          : undefined;

        // TODO: Phase 2 - Integrate with actual migration tool
        // - node-pg-migrate
        // - Flyway
        // - Liquibase
        // For now, this is a placeholder that queries the schema

        resolve({
          success: statusResult.success,
          message: `Placeholder: integrate with migration tool in Phase 2`,
          direction: dir,
          currentVersion,
          exitCode: statusResult.success ? 0 : 1,
          timestamp
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        resolve({
          success: false,
          error,
          direction: 'unknown',
          exitCode: 1,
          timestamp: new Date()
        });
      }
    });
  }

  /**
   * Synchronous version of migrate for CLI usage
   */
  migrateSync(direction?: string): MigrationResult {
    try {
      const dir = this.parseDirection(direction);
      const timestamp = new Date();

      console.log(`Running database migrations (${dir})...`);

      // Query current migration status
      const statusResult = this.queryMigrationStatus();

      if (!statusResult.success) {
        console.error('Failed to query migration status');
      }

      const currentVersion = statusResult.output
        ? statusResult.output.split('\n').find(line => /^\d+/.test(line))
        : undefined;

      return {
        success: statusResult.success,
        message: 'Migration placeholder - integrate with migration tool in Phase 2',
        direction: dir,
        currentVersion,
        exitCode: statusResult.success ? 0 : 1,
        timestamp
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error,
        direction: 'unknown',
        exitCode: 1,
        timestamp: new Date()
      };
    }
  }
}

/**
 * Helper interface for status query results
 */
interface QueryStatusResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Convenience function for one-off migrations
 */
export async function runMigration(direction?: string): Promise<number> {
  const migrator = new DatabaseMigrator();
  const result = await migrator.migrate(direction);
  return result.exitCode;
}

/**
 * Main entry point for CLI usage
 * Usage: npx ts-node migrate.ts [up|down]
 */
if (require.main === module) {
  const direction = process.argv[2];

  if (direction && direction !== 'up' && direction !== 'down') {
    console.error(`Usage: ${process.argv[1]} {up|down}`);
    process.exit(1);
  }

  const migrator = new DatabaseMigrator();
  const result = migrator.migrateSync(direction);

  if (!result.success && result.error) {
    console.error(result.error);
  }

  process.exit(result.exitCode);
}
