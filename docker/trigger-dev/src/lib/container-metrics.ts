/**
 * Container Metrics Recording and Analysis
 *
 * Records Docker container execution metrics with MDAP integration.
 * Tracks resource usage, performance, and escalation patterns for intelligent
 * tier assignment decisions.
 *
 * @module container-metrics
 * @version 1.0.0
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// =============================================
// Type Definitions
// =============================================

/**
 * Container execution metrics
 *
 * @typedef {Object} ContainerMetrics
 * @property {string} containerId - Docker container ID (full or short hash)
 * @property {string} taskId - CFN Loop task ID for correlation
 * @property {string} agentId - Unique agent identifier
 * @property {string} agentType - Agent specialization (typescript-specialist, etc.)
 * @property {number} mdapTier - MDAP model tier used (1-5)
 * @property {Date} startedAt - Container start timestamp
 * @property {Date} completedAt - Container completion timestamp
 * @property {number} durationMs - Total execution duration in milliseconds
 * @property {number} memoryLimitBytes - Memory limit in bytes
 * @property {number | null} memoryPeakBytes - Peak memory usage in bytes
 * @property {number | null} memoryUsagePercent - Peak memory as % of limit
 * @property {number | null} cpuTimeMs - Total CPU time in milliseconds
 * @property {number | null} exitCode - Container exit code (0 = success)
 * @property {boolean} success - Whether execution succeeded
 * @property {boolean} oomKilled - Whether killed due to OOM
 * @property {boolean} timedOut - Whether execution timed out
 * @property {boolean} wasEscalated - Whether tier was escalated
 * @property {number | null} previousTier - Tier before escalation
 * @property {string | null} escalationReason - Why escalation occurred
 */
export interface ContainerMetrics {
  containerId: string;
  taskId: string;
  agentId: string;
  agentType: string;
  mdapTier: number;

  // Timing
  startedAt: Date;
  completedAt: Date;
  durationMs: number;

  // Resources
  memoryLimitBytes: number;
  memoryPeakBytes: number | null;
  memoryUsagePercent: number | null;
  cpuTimeMs: number | null;

  // Outcome
  exitCode: number | null;
  success: boolean;
  oomKilled: boolean;
  timedOut: boolean;

  // Escalation
  wasEscalated: boolean;
  previousTier?: number;
  escalationReason?: string;
}

/**
 * Aggregated metrics statistics
 *
 * @typedef {Object} MetricsAggregation
 * @property {number} totalExecutions - Total number of container executions
 * @property {number} successRate - Success rate (0.0-1.0)
 * @property {number} avgDurationMs - Average execution duration
 * @property {number} oomRate - Out-of-memory failure rate
 * @property {number} timeoutRate - Timeout failure rate
 * @property {number} escalationRate - Escalation rate (0.0-1.0)
 * @property {Record<number, number>} tierDistribution - Executions per tier
 */
export interface MetricsAggregation {
  totalExecutions: number;
  successRate: number;
  avgDurationMs: number;
  oomRate: number;
  timeoutRate: number;
  escalationRate: number;
  tierDistribution: Record<number, number>;
}

/**
 * Escalation recommendation based on historical data
 *
 * @typedef {Object} EscalationRecommendation
 * @property {number} recommendedTier - Recommended MDAP tier (1-5)
 * @property {number} confidence - Confidence score (0.0-1.0)
 */
export interface EscalationRecommendation {
  recommendedTier: number;
  confidence: number;
}

/**
 * Options for aggregating metrics
 */
interface AggregationOptions {
  since?: Date;
  agentType?: string;
  minExecutions?: number;
}

/**
 * Docker stats extracted from container
 */
interface DockerStats {
  container_id: string;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  cpu_percent: number;
  cpu_time_ns: number;
}

// =============================================
// Database Initialization
// =============================================

/**
 * Get or create SQLite database instance
 *
 * Stores container metrics in SQLite database with proper schema initialization.
 * Database location: docker/trigger-dev/data/container-metrics.sqlite
 *
 * @returns {Database.Database} SQLite database instance
 */
function getDatabase(): Database.Database {
  const dataDir = path.join(process.cwd(), 'docker', 'trigger-dev', 'data');

  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'container-metrics.sqlite');
  const db = new Database(dbPath);

  // Enable foreign keys and WAL mode for better concurrency
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // Initialize schema
  initializeSchema(db);

  return db;
}

/**
 * Initialize database schema
 *
 * Creates container_metrics table and indexes if they don't exist.
 *
 * @param {Database.Database} db - Database instance
 * @throws {Error} If schema creation fails
 */
function initializeSchema(db: Database.Database): void {
  // Main metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS container_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      container_id TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      mdap_tier INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      memory_limit_bytes INTEGER NOT NULL,
      memory_peak_bytes INTEGER,
      memory_usage_percent REAL,
      cpu_time_ms INTEGER,
      exit_code INTEGER,
      success INTEGER NOT NULL,
      oom_killed INTEGER NOT NULL,
      timed_out INTEGER NOT NULL,
      was_escalated INTEGER NOT NULL,
      previous_tier INTEGER,
      escalation_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_container_metrics_task
      ON container_metrics(task_id);

    CREATE INDEX IF NOT EXISTS idx_container_metrics_agent_type
      ON container_metrics(agent_type);

    CREATE INDEX IF NOT EXISTS idx_container_metrics_tier
      ON container_metrics(mdap_tier);

    CREATE INDEX IF NOT EXISTS idx_container_metrics_started
      ON container_metrics(started_at);

    CREATE INDEX IF NOT EXISTS idx_container_metrics_success
      ON container_metrics(success);
  `);
}

// =============================================
// Recording Functions
// =============================================

/**
 * Record container execution metrics in database
 *
 * Stores comprehensive metrics about container execution including timing,
 * resource usage, outcome, and escalation information.
 *
 * @param {ContainerMetrics} metrics - Metrics to record
 * @returns {Promise<void>}
 * @throws {Error} If database operation fails
 *
 * @example
 * ```typescript
 * await recordContainerMetrics({
 *   containerId: 'abc123def456',
 *   taskId: 'task-123',
 *   agentId: 'agent-456',
 *   agentType: 'typescript-specialist',
 *   mdapTier: 2,
 *   startedAt: new Date('2025-01-15T10:00:00Z'),
 *   completedAt: new Date('2025-01-15T10:05:30Z'),
 *   durationMs: 330000,
 *   memoryLimitBytes: 1024 * 1024 * 512, // 512MB
 *   memoryPeakBytes: 256 * 1024 * 1024,   // 256MB
 *   memoryUsagePercent: 50.0,
 *   cpuTimeMs: 15000,
 *   exitCode: 0,
 *   success: true,
 *   oomKilled: false,
 *   timedOut: false,
 *   wasEscalated: false,
 * });
 * ```
 */
export async function recordContainerMetrics(metrics: ContainerMetrics): Promise<void> {
  const db = getDatabase();

  try {
    const stmt = db.prepare(`
      INSERT INTO container_metrics (
        container_id, task_id, agent_id, agent_type, mdap_tier,
        started_at, completed_at, duration_ms,
        memory_limit_bytes, memory_peak_bytes, memory_usage_percent, cpu_time_ms,
        exit_code, success, oom_killed, timed_out,
        was_escalated, previous_tier, escalation_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      metrics.containerId,
      metrics.taskId,
      metrics.agentId,
      metrics.agentType,
      metrics.mdapTier,
      metrics.startedAt.toISOString(),
      metrics.completedAt.toISOString(),
      metrics.durationMs,
      metrics.memoryLimitBytes,
      metrics.memoryPeakBytes,
      metrics.memoryUsagePercent,
      metrics.cpuTimeMs,
      metrics.exitCode,
      metrics.success ? 1 : 0,
      metrics.oomKilled ? 1 : 0,
      metrics.timedOut ? 1 : 0,
      metrics.wasEscalated ? 1 : 0,
      metrics.previousTier ?? null,
      metrics.escalationReason ?? null
    );
  } finally {
    db.close();
  }
}

// =============================================
// Query Functions
// =============================================

/**
 * Get all container metrics for a specific task
 *
 * Retrieves all recorded metrics for containers that executed as part of
 * a given task, useful for task-level analysis and debugging.
 *
 * @param {string} taskId - Task ID to query
 * @returns {Promise<ContainerMetrics[]>} Array of metrics
 *
 * @example
 * ```typescript
 * const taskMetrics = await getMetricsForTask('task-123');
 * console.log(`Executed ${taskMetrics.length} containers`);
 * console.log(`Success rate: ${(taskMetrics.filter(m => m.success).length / taskMetrics.length * 100).toFixed(1)}%`);
 * ```
 */
export async function getMetricsForTask(taskId: string): Promise<ContainerMetrics[]> {
  const db = getDatabase();

  try {
    const stmt = db.prepare(`
      SELECT * FROM container_metrics
      WHERE task_id = ?
      ORDER BY started_at DESC
    `);

    const rows = stmt.all(taskId) as any[];
    return rows.map(deserializeMetrics);
  } finally {
    db.close();
  }
}

/**
 * Get all metrics for a specific agent
 *
 * Retrieves metrics for all executions of a particular agent instance,
 * useful for agent performance analysis.
 *
 * @param {string} agentId - Agent ID to query
 * @returns {Promise<ContainerMetrics[]>} Array of metrics
 *
 * @example
 * ```typescript
 * const agentMetrics = await getMetricsForAgent('agent-456');
 * const totalTime = agentMetrics.reduce((sum, m) => sum + m.durationMs, 0);
 * console.log(`Total execution time: ${totalTime}ms`);
 * ```
 */
export async function getMetricsForAgent(agentId: string): Promise<ContainerMetrics[]> {
  const db = getDatabase();

  try {
    const stmt = db.prepare(`
      SELECT * FROM container_metrics
      WHERE agent_id = ?
      ORDER BY started_at DESC
    `);

    const rows = stmt.all(agentId) as any[];
    return rows.map(deserializeMetrics);
  } finally {
    db.close();
  }
}

/**
 * Get aggregated metrics statistics
 *
 * Computes high-level statistics across multiple executions. Can filter by
 * time range and agent type. Useful for performance trending and thresholds.
 *
 * @param {AggregationOptions} [options] - Query options
 * @param {Date} [options.since] - Only include metrics after this date
 * @param {string} [options.agentType] - Filter by agent type
 * @param {number} [options.minExecutions=1] - Minimum executions to compute stats
 * @returns {Promise<MetricsAggregation>} Aggregated statistics
 *
 * @example
 * ```typescript
 * // Overall statistics
 * const stats = await getAggregatedMetrics();
 * console.log(`${stats.totalExecutions} total executions`);
 * console.log(`${(stats.successRate * 100).toFixed(1)}% success rate`);
 * console.log(`${(stats.escalationRate * 100).toFixed(1)}% escalation rate`);
 *
 * // Statistics for specific agent type in last 24 hours
 * const lastDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
 * const tsStats = await getAggregatedMetrics({
 *   since: lastDay,
 *   agentType: 'typescript-specialist'
 * });
 * ```
 */
export async function getAggregatedMetrics(
  options?: AggregationOptions
): Promise<MetricsAggregation> {
  const db = getDatabase();
  const minExecutions = options?.minExecutions ?? 1;

  try {
    // Build WHERE clause
    let whereClause = '1=1';
    const params: any[] = [];

    if (options?.since) {
      whereClause += ' AND started_at >= ?';
      params.push(options.since.toISOString());
    }

    if (options?.agentType) {
      whereClause += ' AND agent_type = ?';
      params.push(options.agentType);
    }

    // Get aggregated stats
    const statsStmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(success) as successful,
        AVG(duration_ms) as avg_duration,
        SUM(oom_killed) as oom_count,
        SUM(timed_out) as timeout_count,
        SUM(was_escalated) as escalated_count
      FROM container_metrics
      WHERE ${whereClause}
    `);

    const statsRow = statsStmt.get(...params) as any;

    if (!statsRow || statsRow.total < minExecutions) {
      return {
        totalExecutions: 0,
        successRate: 0,
        avgDurationMs: 0,
        oomRate: 0,
        timeoutRate: 0,
        escalationRate: 0,
        tierDistribution: {},
      };
    }

    // Get tier distribution
    const tierStmt = db.prepare(`
      SELECT mdap_tier, COUNT(*) as count
      FROM container_metrics
      WHERE ${whereClause}
      GROUP BY mdap_tier
      ORDER BY mdap_tier ASC
    `);

    const tierRows = tierStmt.all(...params) as any[];
    const tierDistribution: Record<number, number> = {};

    for (const row of tierRows) {
      tierDistribution[row.mdap_tier] = row.count;
    }

    return {
      totalExecutions: statsRow.total,
      successRate: statsRow.successful / statsRow.total,
      avgDurationMs: Math.round(statsRow.avg_duration || 0),
      oomRate: statsRow.oom_count / statsRow.total,
      timeoutRate: statsRow.timeout_count / statsRow.total,
      escalationRate: statsRow.escalated_count / statsRow.total,
      tierDistribution,
    };
  } finally {
    db.close();
  }
}

// =============================================
// Escalation Recommendation
// =============================================

/**
 * Recommend MDAP tier based on historical execution patterns
 *
 * Analyzes historical metrics for an agent type and complexity level to
 * recommend an optimal tier for future executions. Considers success rate,
 * OOM rate, and timeout rate.
 *
 * Algorithm:
 * 1. Fetch historical executions for agent type and complexity
 * 2. Analyze failure patterns (OOM, timeouts)
 * 3. If OOM rate > 10% or timeout rate > 20%, recommend escalation
 * 4. If success rate < 80%, recommend higher tier
 * 5. Scale recommendation to available tiers (1-5)
 *
 * @param {string} agentType - Agent type to analyze
 * @param {string} complexity - Task complexity level (simple, medium, complex)
 * @returns {Promise<EscalationRecommendation>} Recommended tier and confidence
 *
 * @example
 * ```typescript
 * // Get recommendation for typescript-specialist on complex tasks
 * const rec = await shouldEscalateBasedOnHistory('typescript-specialist', 'complex');
 * if (rec.confidence > 0.8) {
 *   console.log(`Recommend tier ${rec.recommendedTier} (${(rec.confidence * 100).toFixed(0)}% confident)`);
 * }
 * ```
 */
export async function shouldEscalateBasedOnHistory(
  agentType: string,
  complexity: string
): Promise<EscalationRecommendation> {
  const db = getDatabase();

  try {
    // Fetch metrics for this agent type
    const stmt = db.prepare(`
      SELECT
        mdap_tier,
        COUNT(*) as count,
        SUM(success) as successful,
        SUM(oom_killed) as oom_count,
        SUM(timed_out) as timeout_count,
        AVG(duration_ms) as avg_duration
      FROM container_metrics
      WHERE agent_type = ?
      GROUP BY mdap_tier
      ORDER BY mdap_tier ASC
    `);

    const rows = stmt.all(agentType) as any[];

    if (rows.length === 0) {
      // No history: start with tier 2
      return { recommendedTier: 2, confidence: 0.5 };
    }

    // Analyze failure patterns across tiers
    let recommendedTier = rows[rows.length - 1].mdap_tier; // Default to highest observed
    let confidence = 0.5;

    // Find tier with best success rate and no escalation needs
    for (const row of rows) {
      const successRate = row.successful / row.count;
      const oomRate = row.oom_count / row.count;
      const timeoutRate = row.timeout_count / row.count;

      // Check if this tier is reliable
      if (successRate > 0.95 && oomRate < 0.05 && timeoutRate < 0.1) {
        recommendedTier = row.mdap_tier;
        confidence = Math.min(1.0, 0.7 + (successRate - 0.95) * 10);
        break;
      }
    }

    // Escalate if highest tier has failures
    const highestTier = rows[rows.length - 1];
    const successRate = highestTier.successful / highestTier.count;
    const oomRate = highestTier.oom_count / highestTier.count;
    const timeoutRate = highestTier.timeout_count / highestTier.count;

    if (oomRate > 0.1 || timeoutRate > 0.2 || successRate < 0.8) {
      if (recommendedTier < 5) {
        recommendedTier = Math.min(5, recommendedTier + 1);
        confidence = 0.7 + (1 - (successRate || 0)) * 0.3;
      }
    }

    // Apply complexity modifier
    const complexityModifier = getComplexityModifier(complexity);
    const adjustedTier = Math.min(5, Math.round(recommendedTier * complexityModifier));

    return {
      recommendedTier: adjustedTier,
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  } finally {
    db.close();
  }
}

// =============================================
// Helper Functions
// =============================================

/**
 * Extract complexity multiplier from complexity string
 *
 * @param {string} complexity - Complexity level
 * @returns {number} Multiplier (1.0 = simple, 1.5 = complex, 2.0 = very complex)
 */
function getComplexityModifier(complexity: string): number {
  const level = (complexity || 'medium').toLowerCase();
  if (level.includes('simple') || level.includes('small')) return 1.0;
  if (level.includes('very') || level.includes('extreme')) return 2.0;
  if (level.includes('complex') || level.includes('large')) return 1.5;
  return 1.2; // default for medium
}

/**
 * Deserialize database row to ContainerMetrics object
 *
 * Converts database integer flags back to booleans and parses ISO timestamps.
 *
 * @param {any} row - Database row
 * @returns {ContainerMetrics} Deserialized metrics
 */
function deserializeMetrics(row: any): ContainerMetrics {
  return {
    containerId: row.container_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    agentType: row.agent_type,
    mdapTier: row.mdap_tier,
    startedAt: new Date(row.started_at),
    completedAt: new Date(row.completed_at),
    durationMs: row.duration_ms,
    memoryLimitBytes: row.memory_limit_bytes,
    memoryPeakBytes: row.memory_peak_bytes,
    memoryUsagePercent: row.memory_usage_percent,
    cpuTimeMs: row.cpu_time_ms,
    exitCode: row.exit_code,
    success: row.success === 1,
    oomKilled: row.oom_killed === 1,
    timedOut: row.timed_out === 1,
    wasEscalated: row.was_escalated === 1,
    previousTier: row.previous_tier,
    escalationReason: row.escalation_reason,
  };
}

// =============================================
// Docker Stats Helper
// =============================================

/**
 * Extract metrics from Docker container stats
 *
 * Parses Docker stats output to extract CPU, memory, and other metrics.
 * Useful for collecting metrics from `docker stats` output.
 *
 * @param {DockerStats} stats - Docker stats object
 * @param {ContainerMetrics} baseMetrics - Base metrics to augment
 * @returns {ContainerMetrics} Merged metrics with Docker stats
 *
 * @example
 * ```typescript
 * const dockerStats = await docker.getContainerStats('abc123');
 * const mergedMetrics = extractMetricsFromDockerStats(dockerStats, baseMetrics);
 * ```
 */
export function extractMetricsFromDockerStats(
  stats: DockerStats,
  baseMetrics: ContainerMetrics
): ContainerMetrics {
  return {
    ...baseMetrics,
    memoryPeakBytes: stats.memory_usage,
    memoryUsagePercent: stats.memory_percent,
    cpuTimeMs: Math.round(stats.cpu_time_ns / 1_000_000),
  };
}

/**
 * Create metrics from execution result
 *
 * Builds a ContainerMetrics object from typical execution result data.
 * Helper for creating metrics from command execution or child process results.
 *
 * @param {Object} result - Execution result
 * @param {string} result.containerId - Container ID
 * @param {string} result.taskId - Task ID
 * @param {string} result.agentId - Agent ID
 * @param {string} result.agentType - Agent type
 * @param {number} result.mdapTier - MDAP tier used
 * @param {Date} result.startedAt - Start time
 * @param {Date} result.completedAt - Completion time
 * @param {number} result.memoryLimitBytes - Memory limit
 * @param {number} result.exitCode - Exit code
 * @returns {ContainerMetrics} Constructed metrics
 */
export function createMetricsFromResult(result: {
  containerId: string;
  taskId: string;
  agentId: string;
  agentType: string;
  mdapTier: number;
  startedAt: Date;
  completedAt: Date;
  memoryLimitBytes: number;
  memoryPeakBytes?: number;
  cpuTimeMs?: number;
  exitCode?: number;
  oomKilled?: boolean;
  timedOut?: boolean;
  wasEscalated?: boolean;
  previousTier?: number;
  escalationReason?: string;
}): ContainerMetrics {
  const durationMs = result.completedAt.getTime() - result.startedAt.getTime();
  const success = (result.exitCode ?? 0) === 0 && !result.oomKilled && !result.timedOut;
  const memoryUsagePercent = result.memoryPeakBytes
    ? (result.memoryPeakBytes / result.memoryLimitBytes) * 100
    : null;

  return {
    containerId: result.containerId,
    taskId: result.taskId,
    agentId: result.agentId,
    agentType: result.agentType,
    mdapTier: result.mdapTier,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs,
    memoryLimitBytes: result.memoryLimitBytes,
    memoryPeakBytes: result.memoryPeakBytes ?? null,
    memoryUsagePercent,
    cpuTimeMs: result.cpuTimeMs ?? null,
    exitCode: result.exitCode ?? null,
    success,
    oomKilled: result.oomKilled ?? false,
    timedOut: result.timedOut ?? false,
    wasEscalated: result.wasEscalated ?? false,
    previousTier: result.previousTier,
    escalationReason: result.escalationReason,
  };
}
