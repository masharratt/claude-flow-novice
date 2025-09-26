/**
 * Memory Schema Implementation for Agent Lifecycle Management
 *
 * This module provides the concrete implementation of memory storage schemas
 * for agent lifecycle data, including SQLite schemas, indexing strategies,
 * and query optimization.
 */

import { Database } from 'better-sqlite3';
import type {
  AgentLifecycleRecord,
  AgentStateHistoryEntry,
  LifecycleMetrics,
  LifecycleMemoryManager,
  AgentLifecycleState,
  LifecycleSystemConfig
} from '../types/agent-lifecycle-types.js';
import type { ILogger } from '../utils/types.js';

// ============================================================================
// SQLite Schema Definitions
// ============================================================================

/**
 * SQL DDL for creating lifecycle management tables
 */
export const LIFECYCLE_SCHEMA_DDL = `
-- Agent lifecycle records table
CREATE TABLE IF NOT EXISTS agent_lifecycle_records (
  agent_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  current_state TEXT NOT NULL,
  previous_state TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  configuration_json TEXT NOT NULL DEFAULT '{}',
  resources_json TEXT NOT NULL DEFAULT '{}',
  performance_json TEXT NOT NULL DEFAULT '{}',

  -- Indexing for performance
  INDEX idx_agent_lifecycle_session (session_id),
  INDEX idx_agent_lifecycle_state (current_state),
  INDEX idx_agent_lifecycle_updated (updated_at),
  INDEX idx_agent_lifecycle_version (version)
);

-- State history table for audit trail
CREATE TABLE IF NOT EXISTS agent_state_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  error_code TEXT,
  metadata_json TEXT DEFAULT '{}',
  hooks_executed_json TEXT DEFAULT '[]',
  hook_results_json TEXT DEFAULT '[]',
  conditions_json TEXT DEFAULT '[]',
  actions_json TEXT DEFAULT '[]',

  -- Foreign key and indexing
  FOREIGN KEY (agent_id) REFERENCES agent_lifecycle_records(agent_id) ON DELETE CASCADE,
  INDEX idx_state_history_agent (agent_id),
  INDEX idx_state_history_timestamp (timestamp),
  INDEX idx_state_history_states (from_state, to_state),
  INDEX idx_state_history_trigger (trigger_type),
  INDEX idx_state_history_success (success)
);

-- Metrics time series table
CREATE TABLE IF NOT EXISTS lifecycle_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  state TEXT NOT NULL,
  state_enter_time DATETIME NOT NULL,
  state_duration INTEGER NOT NULL DEFAULT 0,
  memory_usage INTEGER DEFAULT 0,
  cpu_usage REAL DEFAULT 0.0,
  task_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  custom_metrics_json TEXT DEFAULT '{}',
  tags_json TEXT DEFAULT '{}',

  -- Foreign key and indexing for time series queries
  FOREIGN KEY (agent_id) REFERENCES agent_lifecycle_records(agent_id) ON DELETE CASCADE,
  INDEX idx_metrics_agent_time (agent_id, timestamp),
  INDEX idx_metrics_state (state),
  INDEX idx_metrics_timestamp (timestamp)
);

-- Hook execution log table
CREATE TABLE IF NOT EXISTS hook_execution_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  hook_name TEXT NOT NULL,
  hook_type TEXT NOT NULL,
  execution_timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  result_data_json TEXT DEFAULT '{}',
  error_message TEXT,
  context_json TEXT DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,

  -- Indexing for performance analysis
  FOREIGN KEY (agent_id) REFERENCES agent_lifecycle_records(agent_id) ON DELETE CASCADE,
  INDEX idx_hook_log_agent (agent_id),
  INDEX idx_hook_log_hook (hook_name),
  INDEX idx_hook_log_type (hook_type),
  INDEX idx_hook_log_timestamp (execution_timestamp),
  INDEX idx_hook_log_success (success)
);

-- Resource usage tracking table
CREATE TABLE IF NOT EXISTS resource_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  memory_current INTEGER DEFAULT 0,
  memory_peak INTEGER DEFAULT 0,
  memory_average INTEGER DEFAULT 0,
  memory_limit INTEGER,
  cpu_current REAL DEFAULT 0.0,
  cpu_average REAL DEFAULT 0.0,
  cpu_limit REAL,
  disk_used INTEGER DEFAULT 0,
  disk_limit INTEGER,
  network_bytes_in INTEGER DEFAULT 0,
  network_bytes_out INTEGER DEFAULT 0,
  network_connections INTEGER DEFAULT 0,
  handles_files INTEGER DEFAULT 0,
  handles_sockets INTEGER DEFAULT 0,
  handles_timers INTEGER DEFAULT 0,

  -- Time series indexing
  FOREIGN KEY (agent_id) REFERENCES agent_lifecycle_records(agent_id) ON DELETE CASCADE,
  INDEX idx_resource_log_agent_time (agent_id, timestamp),
  INDEX idx_resource_log_timestamp (timestamp)
);

-- Agent configuration changes log
CREATE TABLE IF NOT EXISTS configuration_changes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  change_type TEXT NOT NULL, -- 'create', 'update', 'delete'
  field_path TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  changed_by TEXT,
  reason TEXT,

  -- Audit trail indexing
  FOREIGN KEY (agent_id) REFERENCES agent_lifecycle_records(agent_id) ON DELETE CASCADE,
  INDEX idx_config_changes_agent (agent_id),
  INDEX idx_config_changes_timestamp (timestamp),
  INDEX idx_config_changes_type (change_type),
  INDEX idx_config_changes_field (field_path)
);

-- Event correlation table for debugging
CREATE TABLE IF NOT EXISTS event_correlation (
  correlation_id TEXT PRIMARY KEY,
  root_agent_id TEXT NOT NULL,
  related_agent_ids_json TEXT NOT NULL DEFAULT '[]',
  event_chain_json TEXT NOT NULL DEFAULT '[]',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'

  -- Correlation tracking
  INDEX idx_correlation_root_agent (root_agent_id),
  INDEX idx_correlation_started (started_at),
  INDEX idx_correlation_status (status)
);

-- Views for common queries
CREATE VIEW IF NOT EXISTS agent_current_status AS
SELECT
  alr.agent_id,
  alr.session_id,
  alr.current_state,
  alr.previous_state,
  alr.created_at,
  alr.updated_at,
  json_extract(alr.metadata_json, '$.totalStateTransitions') as total_transitions,
  json_extract(alr.metadata_json, '$.totalUptime') as total_uptime,
  json_extract(alr.metadata_json, '$.errorCount') as error_count,
  json_extract(alr.performance_json, '$.tasksCompleted') as tasks_completed,
  json_extract(alr.performance_json, '$.availability') as availability
FROM agent_lifecycle_records alr;

CREATE VIEW IF NOT EXISTS agent_state_summary AS
SELECT
  agent_id,
  from_state,
  to_state,
  COUNT(*) as transition_count,
  AVG(duration) as avg_duration,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_transitions,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_transitions
FROM agent_state_history
GROUP BY agent_id, from_state, to_state;

-- Triggers for automatic updates
CREATE TRIGGER IF NOT EXISTS update_agent_lifecycle_timestamp
  AFTER UPDATE ON agent_lifecycle_records
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE agent_lifecycle_records
  SET updated_at = CURRENT_TIMESTAMP
  WHERE agent_id = NEW.agent_id;
END;

CREATE TRIGGER IF NOT EXISTS increment_agent_version
  AFTER UPDATE ON agent_lifecycle_records
  WHEN NEW.version = OLD.version
BEGIN
  UPDATE agent_lifecycle_records
  SET version = OLD.version + 1
  WHERE agent_id = NEW.agent_id;
END;
`;

// ============================================================================
// Memory Storage Implementation
// ============================================================================

/**
 * SQLite-based implementation of the lifecycle memory manager
 */
export class SQLiteLifecycleMemoryManager implements LifecycleMemoryManager {
  private db: Database;
  private logger: ILogger;
  private config: LifecycleSystemConfig['memory'];
  private cache: Map<string, { data: AgentLifecycleRecord; timestamp: number }>;
  private cacheTimeout: number = 300000; // 5 minutes

  constructor(
    database: Database,
    logger: ILogger,
    config: LifecycleSystemConfig['memory']
  ) {
    this.db = database;
    this.logger = logger;
    this.config = config;
    this.cache = new Map();

    this.initializeSchema();
    this.setupCleanupSchedule();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    try {
      this.db.exec(LIFECYCLE_SCHEMA_DDL);
      this.logger.info('Lifecycle memory schema initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize lifecycle memory schema', error);
      throw error;
    }
  }

  /**
   * Setup automatic cleanup schedule
   */
  private setupCleanupSchedule(): void {
    if (this.config.retentionDays > 0) {
      setInterval(() => {
        this.cleanup(this.config.retentionDays).catch(error => {
          this.logger.error('Automatic cleanup failed', error);
        });
      }, 24 * 60 * 60 * 1000); // Daily cleanup
    }
  }

  /**
   * Store complete agent lifecycle record
   */
  async storeLifecycleRecord(record: AgentLifecycleRecord): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agent_lifecycle_records (
        agent_id, session_id, current_state, previous_state,
        created_at, updated_at, version,
        metadata_json, configuration_json, resources_json, performance_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        record.agentId,
        record.sessionId,
        record.currentState,
        record.previousState || null,
        record.createdAt.toISOString(),
        record.updatedAt.toISOString(),
        record.version,
        JSON.stringify(record.metadata),
        JSON.stringify(record.configuration),
        JSON.stringify(record.resources),
        JSON.stringify(record.performance)
      );

      // Update cache
      this.cache.set(record.agentId, {
        data: record,
        timestamp: Date.now()
      });

      this.logger.debug(`Stored lifecycle record for agent ${record.agentId}`);
    } catch (error) {
      this.logger.error(`Failed to store lifecycle record for agent ${record.agentId}`, error);
      throw error;
    }
  }

  /**
   * Retrieve agent lifecycle record
   */
  async getLifecycleRecord(agentId: string): Promise<AgentLifecycleRecord | null> {
    // Check cache first
    const cached = this.cache.get(agentId);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const stmt = this.db.prepare(`
      SELECT * FROM agent_lifecycle_records WHERE agent_id = ?
    `);

    try {
      const row = stmt.get(agentId) as any;
      if (!row) return null;

      // Get state history
      const historyStmt = this.db.prepare(`
        SELECT * FROM agent_state_history
        WHERE agent_id = ?
        ORDER BY timestamp DESC
      `);

      const historyRows = historyStmt.all(agentId) as any[];

      const record: AgentLifecycleRecord = {
        agentId: row.agent_id,
        sessionId: row.session_id,
        currentState: row.current_state as AgentLifecycleState,
        previousState: row.previous_state as AgentLifecycleState | undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        version: row.version,
        metadata: JSON.parse(row.metadata_json),
        configuration: JSON.parse(row.configuration_json),
        resources: JSON.parse(row.resources_json),
        performance: JSON.parse(row.performance_json),
        stateHistory: historyRows.map(historyRow => ({
          id: historyRow.id,
          fromState: historyRow.from_state,
          toState: historyRow.to_state,
          trigger: historyRow.trigger_type,
          timestamp: new Date(historyRow.timestamp),
          duration: historyRow.duration,
          success: Boolean(historyRow.success),
          error: historyRow.error_message,
          errorCode: historyRow.error_code,
          metadata: JSON.parse(historyRow.metadata_json || '{}'),
          hooksExecuted: JSON.parse(historyRow.hooks_executed_json || '[]'),
          hookResults: JSON.parse(historyRow.hook_results_json || '[]'),
          conditions: JSON.parse(historyRow.conditions_json || '[]'),
          actions: JSON.parse(historyRow.actions_json || '[]')
        }))
      };

      // Update cache
      this.cache.set(agentId, {
        data: record,
        timestamp: Date.now()
      });

      return record;
    } catch (error) {
      this.logger.error(`Failed to retrieve lifecycle record for agent ${agentId}`, error);
      throw error;
    }
  }

  /**
   * Update agent state and add history entry
   */
  async updateState(
    agentId: string,
    newState: AgentLifecycleState,
    transition: AgentStateHistoryEntry
  ): Promise<void> {
    const transaction = this.db.transaction(() => {
      // Update main record
      const updateStmt = this.db.prepare(`
        UPDATE agent_lifecycle_records
        SET current_state = ?, previous_state = ?, updated_at = ?
        WHERE agent_id = ?
      `);

      const record = this.getLifecycleRecordSync(agentId);
      if (!record) {
        throw new Error(`Agent lifecycle record not found: ${agentId}`);
      }

      updateStmt.run(
        newState,
        record.currentState,
        new Date().toISOString(),
        agentId
      );

      // Insert history entry
      const historyStmt = this.db.prepare(`
        INSERT INTO agent_state_history (
          id, agent_id, from_state, to_state, trigger_type,
          timestamp, duration, success, error_message, error_code,
          metadata_json, hooks_executed_json, hook_results_json,
          conditions_json, actions_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      historyStmt.run(
        transition.id,
        agentId,
        transition.fromState,
        transition.toState,
        transition.trigger,
        transition.timestamp.toISOString(),
        transition.duration,
        transition.success,
        transition.error || null,
        transition.errorCode || null,
        JSON.stringify(transition.metadata || {}),
        JSON.stringify(transition.hooksExecuted),
        JSON.stringify(transition.hookResults),
        JSON.stringify(transition.conditions),
        JSON.stringify(transition.actions)
      );
    });

    try {
      transaction();

      // Invalidate cache
      this.cache.delete(agentId);

      this.logger.debug(`Updated state for agent ${agentId}: ${transition.fromState} -> ${newState}`);
    } catch (error) {
      this.logger.error(`Failed to update state for agent ${agentId}`, error);
      throw error;
    }
  }

  /**
   * Store lifecycle metrics
   */
  async storeMetrics(metrics: LifecycleMetrics): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO lifecycle_metrics (
        agent_id, timestamp, state, state_enter_time, state_duration,
        memory_usage, cpu_usage, task_count, message_count, error_count,
        custom_metrics_json, tags_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        metrics.agentId,
        metrics.timestamp.toISOString(),
        metrics.state,
        metrics.stateEnterTime.toISOString(),
        metrics.stateDuration,
        metrics.metrics.memoryUsage,
        metrics.metrics.cpuUsage,
        metrics.metrics.taskCount,
        metrics.metrics.messageCount,
        metrics.metrics.errorCount,
        JSON.stringify(metrics.metrics.customMetrics || {}),
        JSON.stringify(metrics.tags || {})
      );
    } catch (error) {
      this.logger.error(`Failed to store metrics for agent ${metrics.agentId}`, error);
      throw error;
    }
  }

  /**
   * Query metrics within time range
   */
  async queryMetrics(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<LifecycleMetrics[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM lifecycle_metrics
      WHERE agent_id = ? AND timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `);

    try {
      const rows = stmt.all(
        agentId,
        timeRange.start.toISOString(),
        timeRange.end.toISOString()
      ) as any[];

      return rows.map(row => ({
        agentId: row.agent_id,
        timestamp: new Date(row.timestamp),
        state: row.state,
        stateEnterTime: new Date(row.state_enter_time),
        stateDuration: row.state_duration,
        metrics: {
          memoryUsage: row.memory_usage,
          cpuUsage: row.cpu_usage,
          taskCount: row.task_count,
          messageCount: row.message_count,
          errorCount: row.error_count,
          customMetrics: JSON.parse(row.custom_metrics_json || '{}')
        },
        tags: JSON.parse(row.tags_json || '{}')
      }));
    } catch (error) {
      this.logger.error(`Failed to query metrics for agent ${agentId}`, error);
      throw error;
    }
  }

  /**
   * Bulk store multiple records
   */
  async bulkStore(records: AgentLifecycleRecord[]): Promise<void> {
    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO agent_lifecycle_records (
          agent_id, session_id, current_state, previous_state,
          created_at, updated_at, version,
          metadata_json, configuration_json, resources_json, performance_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const record of records) {
        stmt.run(
          record.agentId,
          record.sessionId,
          record.currentState,
          record.previousState || null,
          record.createdAt.toISOString(),
          record.updatedAt.toISOString(),
          record.version,
          JSON.stringify(record.metadata),
          JSON.stringify(record.configuration),
          JSON.stringify(record.resources),
          JSON.stringify(record.performance)
        );
      }
    });

    try {
      transaction();
      this.logger.info(`Bulk stored ${records.length} lifecycle records`);
    } catch (error) {
      this.logger.error('Failed to bulk store lifecycle records', error);
      throw error;
    }
  }

  /**
   * Bulk query multiple agents
   */
  async bulkQuery(agentIds: string[]): Promise<AgentLifecycleRecord[]> {
    if (agentIds.length === 0) return [];

    const placeholders = agentIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT * FROM agent_lifecycle_records
      WHERE agent_id IN (${placeholders})
    `);

    try {
      const rows = stmt.all(...agentIds) as any[];
      const records: AgentLifecycleRecord[] = [];

      for (const row of rows) {
        const record = await this.getLifecycleRecord(row.agent_id);
        if (record) records.push(record);
      }

      return records;
    } catch (error) {
      this.logger.error('Failed to bulk query lifecycle records', error);
      throw error;
    }
  }

  /**
   * Cleanup old records based on retention policy
   */
  async cleanup(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const transaction = this.db.transaction(() => {
      // Clean up old metrics
      const metricsStmt = this.db.prepare(`
        DELETE FROM lifecycle_metrics
        WHERE timestamp < ?
      `);
      const metricsDeleted = metricsStmt.run(cutoffDate.toISOString()).changes;

      // Clean up old history entries
      const historyStmt = this.db.prepare(`
        DELETE FROM agent_state_history
        WHERE timestamp < ?
      `);
      const historyDeleted = historyStmt.run(cutoffDate.toISOString()).changes;

      // Clean up old hook logs
      const hooksStmt = this.db.prepare(`
        DELETE FROM hook_execution_log
        WHERE execution_timestamp < ?
      `);
      const hooksDeleted = hooksStmt.run(cutoffDate.toISOString()).changes;

      return metricsDeleted + historyDeleted + hooksDeleted;
    });

    try {
      const totalDeleted = transaction();
      this.logger.info(`Cleanup completed: ${totalDeleted} old records deleted`);
      return totalDeleted;
    } catch (error) {
      this.logger.error('Failed to cleanup old records', error);
      throw error;
    }
  }

  /**
   * Vacuum database to reclaim space
   */
  async vacuum(): Promise<void> {
    try {
      this.db.exec('VACUUM');
      this.logger.info('Database vacuum completed');
    } catch (error) {
      this.logger.error('Failed to vacuum database', error);
      throw error;
    }
  }

  /**
   * Synchronous version of getLifecycleRecord for transactions
   */
  private getLifecycleRecordSync(agentId: string): AgentLifecycleRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_lifecycle_records WHERE agent_id = ?
    `);

    const row = stmt.get(agentId) as any;
    if (!row) return null;

    return {
      agentId: row.agent_id,
      sessionId: row.session_id,
      currentState: row.current_state,
      previousState: row.previous_state,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      version: row.version,
      metadata: JSON.parse(row.metadata_json),
      configuration: JSON.parse(row.configuration_json),
      resources: JSON.parse(row.resources_json),
      performance: JSON.parse(row.performance_json),
      stateHistory: [] // Don't load history for sync operations
    };
  }
}

// ============================================================================
// Memory Schema Utilities
// ============================================================================

/**
 * Schema migration utilities
 */
export class LifecycleSchemaManager {
  private db: Database;
  private logger: ILogger;

  constructor(database: Database, logger: ILogger) {
    this.db = database;
    this.logger = logger;
  }

  /**
   * Get current schema version
   */
  getSchemaVersion(): number {
    try {
      const stmt = this.db.prepare(`
        SELECT value FROM pragma_user_version
      `);
      const result = stmt.get() as any;
      return result?.user_version || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Set schema version
   */
  setSchemaVersion(version: number): void {
    this.db.exec(`PRAGMA user_version = ${version}`);
  }

  /**
   * Migrate schema to latest version
   */
  async migrateSchema(): Promise<void> {
    const currentVersion = this.getSchemaVersion();
    const targetVersion = 1; // Current schema version

    if (currentVersion >= targetVersion) {
      this.logger.info(`Schema is up to date (version ${currentVersion})`);
      return;
    }

    this.logger.info(`Migrating schema from version ${currentVersion} to ${targetVersion}`);

    // Apply migration scripts based on current version
    if (currentVersion === 0) {
      this.db.exec(LIFECYCLE_SCHEMA_DDL);
      this.setSchemaVersion(1);
    }

    this.logger.info('Schema migration completed successfully');
  }

  /**
   * Validate schema integrity
   */
  async validateSchema(): Promise<boolean> {
    try {
      // Check if all required tables exist
      const requiredTables = [
        'agent_lifecycle_records',
        'agent_state_history',
        'lifecycle_metrics',
        'hook_execution_log',
        'resource_usage_log',
        'configuration_changes_log',
        'event_correlation'
      ];

      const stmt = this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name IN (${requiredTables.map(() => '?').join(',')})
      `);

      const existingTables = stmt.all(...requiredTables) as any[];

      if (existingTables.length !== requiredTables.length) {
        this.logger.error('Schema validation failed: missing tables');
        return false;
      }

      // Validate foreign key constraints
      this.db.exec('PRAGMA foreign_key_check');

      this.logger.info('Schema validation passed');
      return true;
    } catch (error) {
      this.logger.error('Schema validation failed', error);
      return false;
    }
  }
}