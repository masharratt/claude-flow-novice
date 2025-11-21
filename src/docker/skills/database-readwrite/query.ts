/**
 * Database Read-Write Query Module
 * Migrated from: docker/skills/database-readwrite/query.sh
 *
 * Executes read-write queries against PostgreSQL with audit logging
 * Logs all operations with timestamps and context for compliance
 * Warns on dangerous operations (DROP, TRUNCATE, DELETE without WHERE)
 * SECURITY: Password passed via environment variable (ADMIN_DB_PASSWORD)
 */

import { spawnSync } from 'child_process';

/**
 * Database configuration for read-write access (admin)
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Audit context for logging
 */
export interface AuditContext {
  teamId: string;
  agentId: string;
  timestamp: Date;
  queryLength: number;
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
  auditContext: AuditContext;
}

/**
 * Dangerous operation patterns
 * Matches: DROP, TRUNCATE, DELETE without WHERE
 */
const DANGEROUS_OPERATION_PATTERN = /DROP|TRUNCATE|DELETE\s+FROM\s+\w+\s*;/i;

/**
 * Read-write database query executor with audit logging
 * Logs all operations for compliance and debugging
 */
export class ReadWriteQueryExecutor {
  private config: DatabaseConfig;
  private auditContext: AuditContext;

  constructor(config?: Partial<DatabaseConfig>) {
    this.config = {
      host: config?.host || process.env.POSTGRES_HOST || 'cfn-postgres',
      port: config?.port || parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: config?.database || process.env.POSTGRES_DB || 'cfn_corporate',
      user: config?.user || 'admin_user',
      password: config?.password || process.env.ADMIN_DB_PASSWORD || 'admin_password'
    };

    this.auditContext = {
      teamId: process.env.TEAM_ID || 'unknown',
      agentId: process.env.AGENT_ID || 'unknown',
      timestamp: new Date(),
      queryLength: 0
    };
  }

  /**
   * Format timestamp in ISO 8601 UTC format
   */
  private formatTimestamp(date: Date): string {
    return date.toISOString();
  }

  /**
   * Log audit message to stderr (not stdout)
   */
  private logAudit(message: string): void {
    console.error(message);
  }

  /**
   * Check if query contains dangerous operations
   */
  private isDangerousOperation(query: string): boolean {
    return DANGEROUS_OPERATION_PATTERN.test(query);
  }

  /**
   * Validate query and warn on dangerous operations
   */
  private validateQuery(query: string): void {
    if (!query || query.trim().length === 0) {
      throw new Error('Query is required');
    }

    if (this.isDangerousOperation(query)) {
      this.logAudit('WARNING: Potentially destructive operation detected');
      this.logAudit(`Query: ${query}`);
    }
  }

  /**
   * Execute a read-write query with audit logging
   * SECURITY: Password is passed via PGPASSWORD environment variable
   */
  async executeQuery(query: string): Promise<QueryResult> {
    return new Promise((resolve) => {
      try {
        this.validateQuery(query);
        const timestamp = new Date();
        const auditContext: AuditContext = {
          teamId: this.auditContext.teamId,
          agentId: this.auditContext.agentId,
          timestamp,
          queryLength: query.length
        };

        // Log query start
        const startLog = `[${this.formatTimestamp(timestamp)}] [AUDIT] team=${auditContext.teamId} agent=${auditContext.agentId} query_length=${auditContext.queryLength}`;
        this.logAudit(startLog);

        // Execute query
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

        const success = result.status === 0;
        const resultTime = new Date();

        // Log query result
        if (success) {
          this.logAudit(`[${this.formatTimestamp(resultTime)}] [AUDIT] Query succeeded`);
        } else {
          this.logAudit(`[${this.formatTimestamp(resultTime)}] [AUDIT] Query failed with code ${result.status}`);
        }

        resolve({
          success,
          message: result.stdout || undefined,
          error: result.stderr || undefined,
          exitCode: result.status || 1,
          timestamp: resultTime,
          auditContext
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const timestamp = new Date();

        this.logAudit(`[${this.formatTimestamp(timestamp)}] [AUDIT] Query failed with error: ${error}`);

        resolve({
          success: false,
          error,
          exitCode: 1,
          timestamp,
          auditContext: {
            teamId: this.auditContext.teamId,
            agentId: this.auditContext.agentId,
            timestamp,
            queryLength: 0
          }
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
      const timestamp = new Date();
      const auditContext: AuditContext = {
        teamId: this.auditContext.teamId,
        agentId: this.auditContext.agentId,
        timestamp,
        queryLength: query.length
      };

      // Log query start
      const startLog = `[${this.formatTimestamp(timestamp)}] [AUDIT] team=${auditContext.teamId} agent=${auditContext.agentId} query_length=${auditContext.queryLength}`;
      this.logAudit(startLog);

      // Execute query
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

      const success = result.status === 0;
      const resultTime = new Date();

      // Log query result
      if (success) {
        this.logAudit(`[${this.formatTimestamp(resultTime)}] [AUDIT] Query succeeded`);
      } else {
        this.logAudit(`[${this.formatTimestamp(resultTime)}] [AUDIT] Query failed with code ${result.status}`);
      }

      return {
        success,
        message: result.stdout || undefined,
        error: result.stderr || undefined,
        exitCode: result.status || 1,
        timestamp: resultTime,
        auditContext
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const timestamp = new Date();

      this.logAudit(`[${this.formatTimestamp(timestamp)}] [AUDIT] Query failed with error: ${error}`);

      return {
        success: false,
        error,
        exitCode: 1,
        timestamp,
        auditContext: {
          teamId: this.auditContext.teamId,
          agentId: this.auditContext.agentId,
          timestamp,
          queryLength: 0
        }
      };
    }
  }
}

/**
 * Convenience function for one-off queries
 */
export async function executeReadWriteQuery(query: string): Promise<number> {
  const executor = new ReadWriteQueryExecutor();
  const result = await executor.executeQuery(query);
  return result.exitCode;
}

/**
 * Convenience function for synchronous query execution
 */
export function executeReadWriteQuerySync(query: string): number {
  const executor = new ReadWriteQueryExecutor();
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

  const executor = new ReadWriteQueryExecutor();
  const result = executor.executeQuerySync(query);

  if (!result.success && result.error) {
    console.error(result.error);
  }

  process.exit(result.exitCode);
}
