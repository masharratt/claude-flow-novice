/**
 * Database Read-Only Query Module
 * Migrated from: docker/skills/database-readonly/query.sh
 *
 * Executes read-only queries against PostgreSQL with validation
 * Prevents write operations through pattern matching
 * SECURITY: Password passed via environment variable (READONLY_DB_PASSWORD)
 */

import { spawnSync } from 'child_process';

/**
 * Database configuration for read-only access
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Query execution result
 */
export interface QueryResult {
  success: boolean;
  message?: string;
  error?: string;
  exitCode: number;
  timestamp: Date;
}

/**
 * Pattern for detecting write operations
 * Blocks: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE
 */
const WRITE_OPERATION_PATTERN = /INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE/i;

/**
 * Read-only database query executor
 * Validates queries before execution to prevent accidental writes
 */
export class ReadOnlyQueryExecutor {
  private config: DatabaseConfig;

  constructor(config?: Partial<DatabaseConfig>) {
    this.config = {
      host: config?.host || process.env.POSTGRES_HOST || 'cfn-postgres',
      port: config?.port || parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: config?.database || process.env.POSTGRES_DB || 'cfn_corporate',
      user: config?.user || 'readonly_user',
      password: config?.password || process.env.READONLY_DB_PASSWORD || 'readonly_password'
    };
  }

  /**
   * Validate query to ensure it's read-only
   * Throws error if write operations detected
   */
  private validateQuery(query: string): void {
    if (!query || query.trim().length === 0) {
      throw new Error('Query is required');
    }

    if (WRITE_OPERATION_PATTERN.test(query)) {
      const error = [
        'ERROR: Write operations are not allowed with read-only access',
        'Blocked operations: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE'
      ];
      throw new Error(error.join('\n'));
    }
  }

  /**
   * Execute a read-only query
   * SECURITY: Password is passed via PGPASSWORD environment variable
   */
  async executeQuery(query: string): Promise<QueryResult> {
    return new Promise((resolve) => {
      try {
        this.validateQuery(query);

        // Execute psql with password via environment variable (not command-line)
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

        resolve({
          success: result.status === 0,
          message: result.stdout || undefined,
          error: result.stderr || undefined,
          exitCode: result.status || 1,
          timestamp: new Date()
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        resolve({
          success: false,
          error,
          exitCode: 1,
          timestamp: new Date()
        });
      }
    });
  }

  /**
   * Synchronous version for backwards compatibility
   * SECURITY: Password is passed via PGPASSWORD environment variable
   */
  executeQuerySync(query: string): QueryResult {
    try {
      this.validateQuery(query);

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
        message: result.stdout || undefined,
        error: result.stderr || undefined,
        exitCode: result.status || 1,
        timestamp: new Date()
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error,
        exitCode: 1,
        timestamp: new Date()
      };
    }
  }
}

/**
 * Convenience function for one-off queries
 * Returns exit code (0 for success, 1 for error)
 */
export async function executeReadOnlyQuery(query: string): Promise<number> {
  const executor = new ReadOnlyQueryExecutor();
  const result = await executor.executeQuery(query);
  return result.exitCode;
}

/**
 * Convenience function for synchronous query execution
 * Returns exit code (0 for success, 1 for error)
 */
export function executeReadOnlyQuerySync(query: string): number {
  const executor = new ReadOnlyQueryExecutor();
  const result = executor.executeQuerySync(query);
  return result.exitCode;
}

/**
 * Main entry point for CLI usage
 * Usage: npx ts-node query.ts "SELECT * FROM users"
 */
if (require.main === module) {
  const query = process.argv[2];

  if (!query) {
    console.error('ERROR: Query is required');
    console.error('Usage: query <query>');
    process.exit(1);
  }

  const executor = new ReadOnlyQueryExecutor();
  const result = executor.executeQuerySync(query);

  if (!result.success && result.error) {
    console.error(result.error);
  }

  process.exit(result.exitCode);
}
