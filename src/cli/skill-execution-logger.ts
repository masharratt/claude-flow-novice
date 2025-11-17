/**
 * Skill Execution Logger - Phase 7.2
 *
 * Dual logging system that logs skill executions to:
 * 1. SQLite (Skills DB) - ALL skills
 * 2. PostgreSQL (Phase 4 DB) - ONLY Phase4-generated skills
 *
 * Features:
 * - Automatic skill ID lookup and caching
 * - Phase4 skill detection based on generated_by='phase4' or phase4_pattern_id
 * - Graceful PostgreSQL fallback (non-blocking)
 * - Connection pooling for performance
 * - Environment variable configuration
 * - <50ms logging performance target
 *
 * Usage:
 *   const logger = new SkillExecutionLogger();
 *   await logger.logSkillExecution({
 *     agentId: 'backend-dev-1',
 *     agentType: 'backend-developer',
 *     skillName: 'jwt-authentication',
 *     executionTimeMs: 12,
 *     exitCode: 0
 *   });
 *   await logger.close();
 */

import Database from 'better-sqlite3';
import { Pool, PoolConfig } from 'pg';
import { existsSync } from 'fs';
import path from 'path';

// ============================================================================
// Interfaces
// ============================================================================

export interface SkillExecutionMetrics {
  agentId: string;
  agentType: string;
  skillName: string;
  skillId?: number;          // Optional, will be looked up if not provided
  taskId?: string;
  phase?: string;
  confidenceBefore?: number;
  confidenceAfter?: number;
  executionTimeMs: number;
  exitCode: number;

  // Phase 4 specific (optional)
  costAvoidedUsd?: number;
  tokensAvoided?: number;
  approvalLevel?: string;
  phase4Generated?: boolean;
}

export interface LoggerConfig {
  sqliteDbPath?: string;
  postgresHost?: string;
  postgresPort?: number;
  postgresDb?: string;
  postgresUser?: string;
  postgresPass?: string;
  enablePostgres?: boolean;
}

interface SkillCacheEntry {
  skillId: number;
  approvalLevel: string;
  isPhase4Generated: boolean;
  phase4PatternId: number | null;
}

// ============================================================================
// SkillExecutionLogger Class
// ============================================================================

export class SkillExecutionLogger {
  private sqliteDb: Database.Database;
  private postgresPool?: Pool;
  private config: LoggerConfig;
  private skillCache: Map<string, SkillCacheEntry> = new Map();
  private readonly POSTGRES_TIMEOUT_MS = 5000; // 5s timeout for PostgreSQL operations

  /**
   * Initialize logger with optional configuration
   * Falls back to environment variables if not provided
   */
  constructor(config?: LoggerConfig) {
    // Merge config with environment variables and defaults
    this.config = {
      sqliteDbPath:
        config?.sqliteDbPath ||
        process.env.CFN_SKILLS_DB_PATH ||
        './.claude/skills-database/skills.db',
      postgresHost: config?.postgresHost || process.env.PHASE4_POSTGRES_HOST,
      postgresPort:
        config?.postgresPort ||
        parseInt(process.env.PHASE4_POSTGRES_PORT || '5432', 10),
      postgresDb: config?.postgresDb || process.env.PHASE4_POSTGRES_DB || 'workflow_codification',
      postgresUser: config?.postgresUser || process.env.PHASE4_POSTGRES_USER || 'postgres',
      postgresPass: config?.postgresPass || process.env.PHASE4_POSTGRES_PASS || '',
      enablePostgres:
        config?.enablePostgres !== undefined
          ? config.enablePostgres
          : process.env.ENABLE_PHASE4_LOGGING === 'true',
    };

    // Initialize SQLite connection
    const dbPath = path.resolve(this.config.sqliteDbPath);
    if (!existsSync(dbPath)) {
      throw new Error(`Skills database not found at: ${dbPath}`);
    }
    this.sqliteDb = new Database(dbPath);

    // Initialize PostgreSQL connection pool (if enabled)
    if (this.config.enablePostgres && this.config.postgresHost) {
      try {
        const poolConfig: PoolConfig = {
          host: this.config.postgresHost,
          port: this.config.postgresPort,
          database: this.config.postgresDb,
          user: this.config.postgresUser,
          password: this.config.postgresPass,
          max: 10, // Maximum pool size
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: this.POSTGRES_TIMEOUT_MS,
        };

        this.postgresPool = new Pool(poolConfig);

        // Test connection (don't fail if it doesn't work)
        this.postgresPool
          .query('SELECT 1')
          .then(() => {
            console.log('[SkillExecutionLogger] PostgreSQL connection pool established');
          })
          .catch((err) => {
            console.warn(
              `[SkillExecutionLogger] PostgreSQL connection failed, will fallback to SQLite only:`,
              err.message
            );
          });
      } catch (err) {
        console.warn(
          `[SkillExecutionLogger] Failed to create PostgreSQL pool, using SQLite only:`,
          err instanceof Error ? err.message : String(err)
        );
        this.postgresPool = undefined;
      }
    }
  }

  /**
   * Log skill execution to appropriate databases
   * - SQLite: ALL skills
   * - PostgreSQL: ONLY Phase4-generated skills (if enabled)
   */
  async logSkillExecution(metrics: SkillExecutionMetrics): Promise<void> {
    const startTime = Date.now();

    try {
      // Step 1: Get skill ID and metadata
      const skillId = metrics.skillId || (await this.getSkillIdByName(metrics.skillName));
      if (!skillId) {
        throw new Error(`Skill not found: ${metrics.skillName}`);
      }

      // Step 2: Get skill metadata (with caching)
      const skillMetadata = await this.getSkillMetadata(metrics.skillName, skillId);

      // Step 3: Log to SQLite (always, critical operation)
      await this.logToSQLite(metrics, skillId, skillMetadata);

      // Step 4: Log to PostgreSQL (if Phase4 skill and PostgreSQL enabled)
      if (skillMetadata.isPhase4Generated && this.postgresPool) {
        // Non-blocking PostgreSQL log (don't wait, don't fail)
        this.logToPostgreSQL(metrics, skillId, skillMetadata).catch((err) => {
          console.warn(
            `[SkillExecutionLogger] PostgreSQL logging failed for skill ${metrics.skillName}:`,
            err.message
          );
        });
      }

      const duration = Date.now() - startTime;
      if (duration > 50) {
        console.warn(
          `[SkillExecutionLogger] Logging took ${duration}ms (target: <50ms) for skill ${metrics.skillName}`
        );
      }
    } catch (err) {
      console.error(
        `[SkillExecutionLogger] Failed to log skill execution:`,
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  }

  /**
   * Log execution to SQLite (Skills DB)
   * This is the primary, critical logging operation
   */
  private async logToSQLite(
    metrics: SkillExecutionMetrics,
    skillId: number,
    skillMetadata: SkillCacheEntry
  ): Promise<void> {
    try {
      const stmt = this.sqliteDb.prepare(`
        INSERT INTO skill_usage_log (
          agent_id,
          agent_type,
          skill_id,
          task_id,
          phase,
          loaded_at,
          execution_time_ms,
          confidence_before,
          confidence_after,
          success_indicator,
          approval_level,
          phase4_generated,
          exit_code
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        metrics.agentId,
        metrics.agentType,
        skillId,
        metrics.taskId || null,
        metrics.phase || null,
        metrics.executionTimeMs,
        metrics.confidenceBefore || null,
        metrics.confidenceAfter || null,
        metrics.exitCode === 0 ? 1 : 0, // success_indicator
        skillMetadata.approvalLevel,
        skillMetadata.isPhase4Generated ? 1 : 0,
        metrics.exitCode
      );
    } catch (err) {
      throw new Error(
        `SQLite logging failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Log execution to PostgreSQL (Phase 4 DB)
   * This is a non-critical, best-effort operation
   *
   * PostgreSQL schema:
   *   CREATE TABLE skill_executions (
   *     id SERIAL PRIMARY KEY,
   *     skill_id INTEGER NOT NULL,
   *     team_id VARCHAR(100) NOT NULL,
   *     task_id VARCHAR(100),
   *     execution_time_ms INTEGER,
   *     exit_code INTEGER,
   *     cost_avoided_usd DECIMAL(10,4),
   *     tokens_avoided INTEGER,
   *     timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   *   );
   */
  private async logToPostgreSQL(
    metrics: SkillExecutionMetrics,
    skillId: number,
    skillMetadata: SkillCacheEntry
  ): Promise<void> {
    if (!this.postgresPool) {
      return; // Silently skip if pool not available
    }

    try {
      // Use phase4_pattern_id as the skill_id in PostgreSQL
      const phase4SkillId = skillMetadata.phase4PatternId || skillId;

      const query = `
        INSERT INTO skill_executions (
          skill_id,
          team_id,
          task_id,
          execution_time_ms,
          exit_code,
          cost_avoided_usd,
          tokens_avoided,
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `;

      const values = [
        phase4SkillId,
        metrics.agentType, // Use agent_type as team_id
        metrics.taskId || null,
        metrics.executionTimeMs,
        metrics.exitCode,
        metrics.costAvoidedUsd || null,
        metrics.tokensAvoided || null,
      ];

      // Execute with timeout
      await Promise.race([
        this.postgresPool.query(query, values),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('PostgreSQL query timeout')),
            this.POSTGRES_TIMEOUT_MS
          )
        ),
      ]);
    } catch (err) {
      // Don't throw, just log warning
      console.warn(
        `[SkillExecutionLogger] PostgreSQL insert failed:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * Get skill ID by name with caching
   */
  private async getSkillIdByName(skillName: string): Promise<number | null> {
    // Check cache first
    if (this.skillCache.has(skillName)) {
      return this.skillCache.get(skillName)!.skillId;
    }

    // Query database
    try {
      const row = this.sqliteDb
        .prepare(
          `
        SELECT
          id,
          approval_level,
          generated_by,
          phase4_pattern_id
        FROM skills
        WHERE name = ?
      `
        )
        .get(skillName) as
        | {
            id: number;
            approval_level: string;
            generated_by: string | null;
            phase4_pattern_id: number | null;
          }
        | undefined;

      if (!row) {
        return null;
      }

      // Cache the result
      this.skillCache.set(skillName, {
        skillId: row.id,
        approvalLevel: row.approval_level,
        isPhase4Generated: row.generated_by === 'phase4' || row.phase4_pattern_id !== null,
        phase4PatternId: row.phase4_pattern_id,
      });

      return row.id;
    } catch (err) {
      throw new Error(
        `Failed to lookup skill ID: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Get skill metadata (approval level, Phase4 status) with caching
   */
  private async getSkillMetadata(
    skillName: string,
    skillId: number
  ): Promise<SkillCacheEntry> {
    // Check cache first
    if (this.skillCache.has(skillName)) {
      return this.skillCache.get(skillName)!;
    }

    // Query database
    try {
      const row = this.sqliteDb
        .prepare(
          `
        SELECT
          approval_level,
          generated_by,
          phase4_pattern_id
        FROM skills
        WHERE id = ?
      `
        )
        .get(skillId) as
        | {
            approval_level: string;
            generated_by: string | null;
            phase4_pattern_id: number | null;
          }
        | undefined;

      if (!row) {
        throw new Error(`Skill not found with ID: ${skillId}`);
      }

      // Cache the result
      const metadata: SkillCacheEntry = {
        skillId,
        approvalLevel: row.approval_level,
        isPhase4Generated: row.generated_by === 'phase4' || row.phase4_pattern_id !== null,
        phase4PatternId: row.phase4_pattern_id,
      };

      this.skillCache.set(skillName, metadata);
      return metadata;
    } catch (err) {
      throw new Error(
        `Failed to get skill metadata: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Close database connections and cleanup
   */
  async close(): Promise<void> {
    try {
      // Close SQLite
      if (this.sqliteDb) {
        this.sqliteDb.close();
      }

      // Close PostgreSQL pool
      if (this.postgresPool) {
        await this.postgresPool.end();
      }

      // Clear cache
      this.skillCache.clear();
    } catch (err) {
      console.error(
        `[SkillExecutionLogger] Error during cleanup:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}
