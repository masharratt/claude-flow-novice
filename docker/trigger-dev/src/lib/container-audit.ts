/**
 * Container Audit Logging System
 *
 * Comprehensive audit logging for container operations with SQLite persistence.
 * Tracks all container lifecycle events (create, start, stop, remove, kill, restart)
 * and failure conditions (OOM, timeout) for debugging and compliance.
 *
 * Features:
 * - Persistent SQLite storage in lib directory
 * - Type-safe audit entry recording
 * - Flexible querying by task, agent, container, action, or result
 * - Aggregated statistics and historical analysis
 * - Container-specific operation timeline
 * - Automatic cleanup of old entries
 *
 * @module container-audit
 * @version 1.0.0
 */

// better-sqlite3 lacks type definitions, but is a well-known stable library
// eslint-disable-next-line @typescript-eslint/no-var-requires
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// Type alias for better-sqlite3 instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BetterSqlite3Database = any;

// =============================================
// Type Definitions
// =============================================

/**
 * Container operation audit entry
 *
 * @typedef {Object} AuditEntry
 * @property {number} [id] - Database primary key (auto-generated)
 * @property {Date} timestamp - Operation timestamp
 * @property {'create' | 'start' | 'stop' | 'remove' | 'kill' | 'restart' | 'oom' | 'timeout'} action - Operation type
 * @property {string} containerId - Docker container ID or name
 * @property {string} taskId - CFN Loop task ID for correlation
 * @property {string} agentId - Unique agent identifier
 * @property {string} agentType - Agent specialization (typescript-specialist, etc.)
 * @property {'success' | 'failed' | 'timeout' | 'oom_killed'} result - Operation outcome
 * @property {number} [durationMs] - Operation duration in milliseconds
 * @property {number} [exitCode] - Container exit code (0 = success, null = still running)
 * @property {Record<string, any>} metadata - Additional context (signal, error message, etc.)
 */
export interface AuditEntry {
  id?: number;
  timestamp: Date;
  action: 'create' | 'start' | 'stop' | 'remove' | 'kill' | 'restart' | 'oom' | 'timeout';
  containerId: string;
  taskId: string;
  agentId: string;
  agentType: string;
  result: 'success' | 'failed' | 'timeout' | 'oom_killed';
  durationMs?: number;
  exitCode?: number;
  metadata: Record<string, any>;
}

/**
 * Query parameters for searching audit log
 *
 * @typedef {Object} AuditQuery
 * @property {string} [taskId] - Filter by task ID
 * @property {string} [agentId] - Filter by agent ID
 * @property {string} [containerId] - Filter by container ID
 * @property {AuditEntry['action']} [action] - Filter by action type
 * @property {AuditEntry['result']} [result] - Filter by result
 * @property {Date} [since] - Start of time range (inclusive)
 * @property {Date} [until] - End of time range (inclusive)
 * @property {number} [limit] - Maximum number of results to return
 */
export interface AuditQuery {
  taskId?: string;
  agentId?: string;
  containerId?: string;
  action?: AuditEntry['action'];
  result?: AuditEntry['result'];
  since?: Date;
  until?: Date;
  limit?: number;
}

/**
 * Aggregated audit statistics
 *
 * @typedef {Object} AuditSummary
 * @property {number} totalOperations - Total number of operations logged
 * @property {number} successRate - Success rate as decimal (0.0-1.0)
 * @property {Record<string, number>} failuresByType - Failure count by action type
 * @property {number} avgDurationMs - Average operation duration
 * @property {Record<string, number>} actionCounts - Count of operations by action type
 */
export interface AuditSummary {
  totalOperations: number;
  successRate: number;
  failuresByType: Record<string, number>;
  avgDurationMs: number;
  actionCounts: Record<string, number>;
}

/**
 * Convenient audit logger instance with pre-filled context
 *
 * @typedef {Object} AuditLogger
 * @property {(action: string, result: string, metadata?: any, durationMs?: number) => Promise<void>} log - Log audit entry
 * @property {(query: AuditQuery) => Promise<AuditEntry[]>} query - Search audit log
 * @property {() => Promise<AuditSummary>} summary - Get aggregated statistics
 * @property {() => Promise<AuditEntry[]>} history - Get container history
 */
export interface AuditLogger {
  log(
    action: AuditEntry['action'],
    result: AuditEntry['result'],
    metadata?: Record<string, any>,
    durationMs?: number,
    exitCode?: number
  ): Promise<void>;
  query(query: AuditQuery): Promise<AuditEntry[]>;
  summary(since?: Date): Promise<AuditSummary>;
  history(): Promise<AuditEntry[]>;
}

// =============================================
// Database Initialization
// =============================================

/**
 * Get or create SQLite database connection
 *
 * Creates database in same directory as container-metrics.ts
 * with proper schema and indexes for efficient querying.
 *
 * @returns {BetterSqlite3Database} Connected SQLite database instance
 *
 * @example
 * const db = getDatabase();
 * // Database is now ready for operations
 */
function getDatabase(): BetterSqlite3Database {
  // Use same directory as container-metrics.ts for consistency
  const dbPath = path.join(__dirname, 'container-audit.db');

  // Create or open database
  const db = new Database(dbPath);

  // Enable foreign keys for data integrity
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema if needed
  initializeSchema(db);

  return db;
}

/**
 * Initialize database schema with tables and indexes
 *
 * Creates the container_audit_log table and optimized indexes
 * for common query patterns.
 *
 * @param {BetterSqlite3Database} db - SQLite database connection
 * @internal
 */
function initializeSchema(db: BetterSqlite3Database): void {
  // Create main audit log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS container_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      container_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      result TEXT NOT NULL,
      duration_ms INTEGER,
      exit_code INTEGER,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create optimized indexes for common query patterns
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_task
      ON container_audit_log(task_id);

    CREATE INDEX IF NOT EXISTS idx_audit_container
      ON container_audit_log(container_id);

    CREATE INDEX IF NOT EXISTS idx_audit_timestamp
      ON container_audit_log(timestamp);

    CREATE INDEX IF NOT EXISTS idx_audit_action
      ON container_audit_log(action);

    CREATE INDEX IF NOT EXISTS idx_audit_agent_id
      ON container_audit_log(agent_id);

    CREATE INDEX IF NOT EXISTS idx_audit_result
      ON container_audit_log(result);

    CREATE INDEX IF NOT EXISTS idx_audit_task_action
      ON container_audit_log(task_id, action);
  `);
}

// =============================================
// Core Audit Operations
// =============================================

/**
 * Record a container operation in the audit log
 *
 * Persists a single audit entry to SQLite with all context.
 * Automatically converts dates to ISO strings for storage.
 *
 * @param {Omit<AuditEntry, 'id' | 'timestamp'>} entry - Audit entry to record (timestamp added automatically)
 * @returns {Promise<void>}
 *
 * @example
 * await logAuditEntry({
 *   action: 'start',
 *   containerId: 'abc123def456',
 *   taskId: 'task-001',
 *   agentId: 'agent-001',
 *   agentType: 'typescript-specialist',
 *   result: 'success',
 *   durationMs: 245,
 *   metadata: { signal: null, waiterCount: 0 }
 * });
 */
export async function logAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
  const db = getDatabase();

  try {
    const stmt = db.prepare(`
      INSERT INTO container_audit_log (
        timestamp, action, container_id, task_id, agent_id, agent_type,
        result, duration_ms, exit_code, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      new Date().toISOString(),
      entry.action,
      entry.containerId,
      entry.taskId,
      entry.agentId,
      entry.agentType,
      entry.result,
      entry.durationMs ?? null,
      entry.exitCode ?? null,
      JSON.stringify(entry.metadata)
    );
  } finally {
    db.close();
  }
}

/**
 * Query the audit log with flexible filtering
 *
 * Searches audit entries based on task, agent, container, action, or result.
 * Results are ordered by timestamp (newest first).
 *
 * @param {AuditQuery} query - Query parameters
 * @returns {Promise<AuditEntry[]>} Matching audit entries
 *
 * @example
 * // Get all operations for a specific task
 * const entries = await queryAuditLog({
 *   taskId: 'task-001',
 *   limit: 100
 * });
 *
 * // Get failed operations in time range
 * const failures = await queryAuditLog({
 *   result: 'failed',
 *   since: new Date(Date.now() - 3600000),
 *   until: new Date()
 * });
 *
 * // Get OOM events for an agent
 * const oomEvents = await queryAuditLog({
 *   agentId: 'agent-001',
 *   result: 'oom_killed'
 * });
 */
export async function queryAuditLog(query: AuditQuery): Promise<AuditEntry[]> {
  const db = getDatabase();

  try {
    let sql = 'SELECT * FROM container_audit_log WHERE 1=1';
    const params: any[] = [];

    // Build dynamic WHERE clause
    if (query.taskId) {
      sql += ' AND task_id = ?';
      params.push(query.taskId);
    }
    if (query.agentId) {
      sql += ' AND agent_id = ?';
      params.push(query.agentId);
    }
    if (query.containerId) {
      sql += ' AND container_id = ?';
      params.push(query.containerId);
    }
    if (query.action) {
      sql += ' AND action = ?';
      params.push(query.action);
    }
    if (query.result) {
      sql += ' AND result = ?';
      params.push(query.result);
    }
    if (query.since) {
      sql += ' AND timestamp >= ?';
      params.push(query.since.toISOString());
    }
    if (query.until) {
      sql += ' AND timestamp <= ?';
      params.push(query.until.toISOString());
    }

    // Order by timestamp descending (newest first)
    sql += ' ORDER BY timestamp DESC';

    // Apply limit
    if (query.limit && query.limit > 0) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    // Convert to AuditEntry objects with proper types
    return rows.map(row => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      action: row.action,
      containerId: row.container_id,
      taskId: row.task_id,
      agentId: row.agent_id,
      agentType: row.agent_type,
      result: row.result,
      durationMs: row.duration_ms ?? undefined,
      exitCode: row.exit_code ?? undefined,
      metadata: JSON.parse(row.metadata || '{}')
    }));
  } finally {
    db.close();
  }
}

/**
 * Get aggregated audit statistics for a time period
 *
 * Computes success rate, failure breakdown, and average duration
 * across all operations in the specified period.
 *
 * @param {Date} [since] - Start of period (default: 24 hours ago)
 * @returns {Promise<AuditSummary>} Aggregated statistics
 *
 * @example
 * const summary = await getAuditSummary(new Date(Date.now() - 86400000));
 * console.log(`Success rate: ${(summary.successRate * 100).toFixed(1)}%`);
 * console.log(`Failures by type:`, summary.failuresByType);
 */
export async function getAuditSummary(since?: Date): Promise<AuditSummary> {
  const db = getDatabase();

  try {
    const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: 24h ago

    // Get total operations
    const totalStmt = db.prepare(`
      SELECT COUNT(*) as count FROM container_audit_log
      WHERE timestamp >= ?
    `);
    const { count: totalOperations } = totalStmt.get(sinceDate.toISOString()) as any;

    // Get success count
    const successStmt = db.prepare(`
      SELECT COUNT(*) as count FROM container_audit_log
      WHERE timestamp >= ? AND result = 'success'
    `);
    const { count: successCount } = successStmt.get(sinceDate.toISOString()) as any;

    // Get failure count by type
    const failureStmt = db.prepare(`
      SELECT result, COUNT(*) as count FROM container_audit_log
      WHERE timestamp >= ? AND result != 'success'
      GROUP BY result
    `);
    const failureRows = failureStmt.all(sinceDate.toISOString()) as any[];
    const failuresByType: Record<string, number> = {};
    for (const row of failureRows) {
      failuresByType[row.result] = row.count;
    }

    // Get average duration
    const durationStmt = db.prepare(`
      SELECT AVG(duration_ms) as avg FROM container_audit_log
      WHERE timestamp >= ? AND duration_ms IS NOT NULL
    `);
    const { avg: avgDuration } = durationStmt.get(sinceDate.toISOString()) as any;

    // Get action counts
    const actionStmt = db.prepare(`
      SELECT action, COUNT(*) as count FROM container_audit_log
      WHERE timestamp >= ?
      GROUP BY action
    `);
    const actionRows = actionStmt.all(sinceDate.toISOString()) as any[];
    const actionCounts: Record<string, number> = {};
    for (const row of actionRows) {
      actionCounts[row.action] = row.count;
    }

    return {
      totalOperations,
      successRate: totalOperations > 0 ? successCount / totalOperations : 0,
      failuresByType,
      avgDurationMs: avgDuration ?? 0,
      actionCounts
    };
  } finally {
    db.close();
  }
}

/**
 * Get complete operation history for a specific container
 *
 * Returns all audit entries for a container ordered chronologically,
 * useful for debugging container lifecycle issues.
 *
 * @param {string} containerId - Container ID or name to query
 * @returns {Promise<AuditEntry[]>} Chronological operation timeline
 *
 * @example
 * const timeline = await getContainerHistory('my-container-abc123');
 * for (const entry of timeline) {
 *   console.log(`${entry.timestamp}: ${entry.action} -> ${entry.result}`);
 * }
 */
export async function getContainerHistory(containerId: string): Promise<AuditEntry[]> {
  return queryAuditLog({
    containerId,
    limit: undefined // No limit for full history
  });
}

/**
 * Remove audit entries older than a specified date
 *
 * Cleans up old entries to prevent unbounded database growth.
 * Typically called periodically (e.g., daily) to archive old logs.
 *
 * @param {Date} olderThan - Remove entries with timestamp before this date
 * @returns {Promise<number>} Number of entries deleted
 *
 * @example
 * // Delete entries older than 30 days
 * const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
 * const deleted = await cleanupOldEntries(thirtyDaysAgo);
 * console.log(`Deleted ${deleted} old audit entries`);
 */
export async function cleanupOldEntries(olderThan: Date): Promise<number> {
  const db = getDatabase();

  try {
    const stmt = db.prepare(`
      DELETE FROM container_audit_log
      WHERE timestamp < ?
    `);

    const info = stmt.run(olderThan.toISOString());
    return info.changes;
  } finally {
    db.close();
  }
}

// =============================================
// Audit Logger Factory
// =============================================

/**
 * Create a convenient audit logger with pre-filled context
 *
 * Returns an object with bound logging methods that automatically
 * include task, agent, and container context. Useful for agents
 * that need to log multiple operations without repeating context.
 *
 * @param {string} taskId - CFN Loop task ID
 * @param {string} agentId - Unique agent identifier
 * @param {string} agentType - Agent specialization type
 * @param {string} [containerId] - Optional default container ID
 * @returns {AuditLogger} Audit logger instance with pre-filled context
 *
 * @example
 * const logger = createAuditLogger('task-001', 'agent-001', 'typescript-specialist', 'container-abc123');
 *
 * // Log container start
 * await logger.log('start', 'success', { signal: null }, 125);
 *
 * // Log container stop with exit code
 * await logger.log('stop', 'success', {}, 45, 0);
 *
 * // Query agent's operations
 * const history = await logger.history();
 *
 * // Get summary for this agent
 * const summary = await logger.summary();
 */
export function createAuditLogger(
  taskId: string,
  agentId: string,
  agentType: string,
  containerId?: string
): AuditLogger {
  return {
    async log(
      action: AuditEntry['action'],
      result: AuditEntry['result'],
      metadata?: Record<string, any>,
      durationMs?: number,
      exitCode?: number
    ): Promise<void> {
      if (!containerId) {
        throw new Error('Container ID must be set before logging');
      }

      await logAuditEntry({
        action,
        containerId,
        taskId,
        agentId,
        agentType,
        result,
        durationMs,
        exitCode,
        metadata: metadata || {}
      });
    },

    async query(query: AuditQuery): Promise<AuditEntry[]> {
      return queryAuditLog({
        ...query,
        taskId: query.taskId || taskId,
        agentId: query.agentId || agentId
      });
    },

    async summary(since?: Date): Promise<AuditSummary> {
      return getAuditSummary(since);
    },

    async history(): Promise<AuditEntry[]> {
      if (!containerId) {
        throw new Error('Container ID must be set to retrieve history');
      }
      return getContainerHistory(containerId);
    }
  };
}

// =============================================
// Utility Functions
// =============================================

/**
 * Get formatted audit log as human-readable string
 *
 * Useful for debugging and logging to console or files.
 *
 * @param {AuditEntry[]} entries - Entries to format
 * @returns {string} Human-readable audit log
 *
 * @example
 * const entries = await queryAuditLog({ taskId: 'task-001', limit: 10 });
 * console.log(formatAuditLog(entries));
 */
export function formatAuditLog(entries: AuditEntry[]): string {
  if (entries.length === 0) {
    return 'No audit entries';
  }

  const lines = [
    'Container Audit Log',
    '='.repeat(80),
    ''
  ];

  for (const entry of entries) {
    const timeStr = entry.timestamp.toISOString();
    const durationStr = entry.durationMs ? ` (${entry.durationMs}ms)` : '';
    const exitCodeStr = entry.exitCode !== undefined ? ` [exit: ${entry.exitCode}]` : '';

    lines.push(
      `${timeStr} | ${entry.action.padEnd(8)} | ${entry.result.padEnd(12)} | ${entry.containerId}${durationStr}${exitCodeStr}`
    );
    lines.push(
      `  Task: ${entry.taskId} | Agent: ${entry.agentId} (${entry.agentType})`
    );

    if (Object.keys(entry.metadata).length > 0) {
      lines.push(
        `  Metadata: ${JSON.stringify(entry.metadata)}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Export audit log entries to JSON format
 *
 * Useful for external analysis or archival.
 *
 * @param {AuditEntry[]} entries - Entries to export
 * @returns {string} JSON string representation
 *
 * @example
 * const entries = await queryAuditLog({ taskId: 'task-001' });
 * const json = exportAuditLogAsJson(entries);
 * fs.writeFileSync('audit-export.json', json);
 */
export function exportAuditLogAsJson(entries: AuditEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

/**
 * Export audit log entries to CSV format
 *
 * Useful for spreadsheet analysis and reporting.
 *
 * @param {AuditEntry[]} entries - Entries to export
 * @returns {string} CSV string representation
 *
 * @example
 * const entries = await queryAuditLog({ taskId: 'task-001' });
 * const csv = exportAuditLogAsCsv(entries);
 * fs.writeFileSync('audit-export.csv', csv);
 */
export function exportAuditLogAsCsv(entries: AuditEntry[]): string {
  if (entries.length === 0) {
    return 'timestamp,action,container_id,task_id,agent_id,agent_type,result,duration_ms,exit_code,metadata\n';
  }

  const headers = [
    'timestamp',
    'action',
    'container_id',
    'task_id',
    'agent_id',
    'agent_type',
    'result',
    'duration_ms',
    'exit_code',
    'metadata'
  ];

  const rows = entries.map(entry => [
    entry.timestamp.toISOString(),
    entry.action,
    entry.containerId,
    entry.taskId,
    entry.agentId,
    entry.agentType,
    entry.result,
    entry.durationMs ?? '',
    entry.exitCode ?? '',
    JSON.stringify(entry.metadata)
  ]);

  // CSV escape: wrap in quotes if contains comma or quote
  const escapeCsv = (val: string | number): string => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = rows.map(row => row.map((val: string | number) => escapeCsv(val)).join(','));
  return [headers.join(','), ...csvRows].join('\n');
}
