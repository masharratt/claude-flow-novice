/**
 * Query Optimizer
 *
 * Implements database query optimizations including:
 * - Index management for agents table
 * - Materialized views for cost aggregation
 * - Query pattern optimization
 * - Expected: 10-20x query speedup
 *
 * Features:
 * - Automated index creation
 * - Materialized view management
 * - Query rewriting for optimal execution
 * - Performance monitoring
 */

import { Pool, PoolClient } from 'pg';

export interface QueryOptimizerConfig {
  pool: Pool;
  refreshInterval?: number; // Materialized view refresh interval in ms (default: 1 hour)
}

export interface CostByTeam {
  team_id: string;
  agent_count: number;
  completed_count: number;
  failed_count: number;
  avg_confidence: number | null;
  total_cost: number;
  first_spawn: Date;
  last_spawn: Date;
}

export interface CostByAgentType {
  agent_type: string;
  agent_count: number;
  completed_count: number;
  failed_count: number;
  avg_confidence: number | null;
  total_cost: number;
  avg_duration_seconds: number | null;
}

export interface DailyCostSummary {
  date: Date;
  total_agents: number;
  completed_count: number;
  failed_count: number;
  total_cost: number;
  avg_confidence: number | null;
}

export interface AgentRecord {
  id: string;
  team_id: string | null;
  type: string;
  status: string;
  spawned_at: Date;
  completed_at: Date | null;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
}

export interface IndexUsageStats {
  schemaname: string;
  tablename: string;
  indexname: string;
  index_scans: number;
  tuples_read: number;
  tuples_fetched: number;
}

export interface QueryPlan {
  'Plan': Record<string, unknown>;
  'Planning Time': number;
  'Execution Time': number;
}

export class QueryOptimizer {
  private pool: Pool;
  private refreshInterval: number;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(config: QueryOptimizerConfig) {
    this.pool = config.pool;
    this.refreshInterval = config.refreshInterval || 3600000; // 1 hour default
  }

  /**
   * Initialize all query optimizations
   */
  async initialize(): Promise<void> {
    console.log('Initializing query optimizer...');

    await this.createIndexes();
    await this.createMaterializedViews();
    await this.startMaterializedViewRefresh();

    console.log('Query optimizer initialized successfully');
  }

  /**
   * Create indexes on agents table for performance
   * Indexes: team_id, status, spawned_at
   */
  async createIndexes(): Promise<void> {
    const indexes = [
      {
        name: 'idx_agents_team_id',
        table: 'agents',
        columns: ['team_id'],
        description: 'Index for team-based queries',
      },
      {
        name: 'idx_agents_status',
        table: 'agents',
        columns: ['status'],
        description: 'Index for status filtering',
      },
      {
        name: 'idx_agents_spawned_at',
        table: 'agents',
        columns: ['spawned_at'],
        description: 'Index for time-based queries',
      },
      {
        name: 'idx_agents_team_status',
        table: 'agents',
        columns: ['team_id', 'status'],
        description: 'Composite index for team + status queries',
      },
      {
        name: 'idx_agents_status_spawned',
        table: 'agents',
        columns: ['status', 'spawned_at'],
        description: 'Composite index for status + time queries',
      },
      {
        name: 'idx_agents_cost_query',
        table: 'agents',
        columns: ['team_id', 'spawned_at', 'status'],
        description: 'Composite index for cost aggregation queries',
      },
    ];

    const client = await this.pool.connect();
    try {
      for (const index of indexes) {
        const query = `
          CREATE INDEX IF NOT EXISTS ${index.name}
          ON ${index.table} (${index.columns.join(', ')})
        `;

        await client.query(query);
        console.log(`Created index: ${index.name} - ${index.description}`);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Create materialized views for cost aggregation queries
   */
  async createMaterializedViews(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Drop existing views if they exist
      await client.query('DROP MATERIALIZED VIEW IF EXISTS mv_cost_by_team CASCADE');
      await client.query('DROP MATERIALIZED VIEW IF EXISTS mv_cost_by_agent_type CASCADE');
      await client.query('DROP MATERIALIZED VIEW IF EXISTS mv_daily_cost_summary CASCADE');

      // Create materialized view for cost by team
      await client.query(`
        CREATE MATERIALIZED VIEW mv_cost_by_team AS
        SELECT
          team_id,
          COUNT(*) as agent_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
          AVG(confidence) as avg_confidence,
          SUM(COALESCE(metadata::json->>'cost', '0')::numeric) as total_cost,
          MIN(spawned_at) as first_spawn,
          MAX(spawned_at) as last_spawn
        FROM agents
        WHERE team_id IS NOT NULL
        GROUP BY team_id
      `);
      console.log('Created materialized view: mv_cost_by_team');

      // Create materialized view for cost by agent type
      await client.query(`
        CREATE MATERIALIZED VIEW mv_cost_by_agent_type AS
        SELECT
          type as agent_type,
          COUNT(*) as agent_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
          AVG(confidence) as avg_confidence,
          SUM(COALESCE(metadata::json->>'cost', '0')::numeric) as total_cost,
          AVG(EXTRACT(EPOCH FROM (completed_at - spawned_at))) as avg_duration_seconds
        FROM agents
        WHERE type IS NOT NULL
        GROUP BY type
      `);
      console.log('Created materialized view: mv_cost_by_agent_type');

      // Create materialized view for daily cost summary
      await client.query(`
        CREATE MATERIALIZED VIEW mv_daily_cost_summary AS
        SELECT
          DATE(spawned_at) as date,
          COUNT(*) as total_agents,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
          SUM(COALESCE(metadata::json->>'cost', '0')::numeric) as total_cost,
          AVG(confidence) as avg_confidence
        FROM agents
        WHERE spawned_at IS NOT NULL
        GROUP BY DATE(spawned_at)
        ORDER BY date DESC
      `);
      console.log('Created materialized view: mv_daily_cost_summary');

      // Create UNIQUE indexes on materialized views (required for CONCURRENT refresh)
      await client.query('CREATE UNIQUE INDEX idx_mv_cost_by_team_team_id ON mv_cost_by_team (team_id)');
      await client.query('CREATE UNIQUE INDEX idx_mv_cost_by_agent_type_type ON mv_cost_by_agent_type (agent_type)');
      await client.query('CREATE UNIQUE INDEX idx_mv_daily_cost_summary_date ON mv_daily_cost_summary (date)');

      console.log('Created UNIQUE indexes on materialized views for concurrent refresh');
    } finally {
      client.release();
    }
  }

  /**
   * Refresh materialized views
   */
  async refreshMaterializedViews(): Promise<void> {
    const client = await this.pool.connect();
    try {
      console.log('Refreshing materialized views...');

      await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_cost_by_team');
      await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_cost_by_agent_type');
      await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_cost_summary');

      console.log('Materialized views refreshed successfully');
    } catch (err) {
      console.error('Error refreshing materialized views:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Start automatic materialized view refresh
   */
  startMaterializedViewRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    // Initial refresh
    this.refreshMaterializedViews().catch(console.error);

    // Schedule periodic refresh
    this.refreshTimer = setInterval(() => {
      this.refreshMaterializedViews().catch(console.error);
    }, this.refreshInterval);

    console.log(
      `Started materialized view auto-refresh (interval: ${this.refreshInterval / 1000}s)`
    );
  }

  /**
   * Stop automatic materialized view refresh
   */
  stopMaterializedViewRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      console.log('Stopped materialized view auto-refresh');
    }
  }

  /**
   * Optimized query: Get cost by team
   */
  async getCostByTeam(teamId?: string): Promise<CostByTeam[]> {
    const client = await this.pool.connect();
    try {
      let query = 'SELECT * FROM mv_cost_by_team';
      const params: unknown[] = [];

      if (teamId) {
        query += ' WHERE team_id = $1';
        params.push(teamId);
      }

      query += ' ORDER BY total_cost DESC';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Optimized query: Get cost by agent type
   */
  async getCostByAgentType(agentType?: string): Promise<CostByAgentType[]> {
    const client = await this.pool.connect();
    try {
      let query = 'SELECT * FROM mv_cost_by_agent_type';
      const params: unknown[] = [];

      if (agentType) {
        query += ' WHERE agent_type = $1';
        params.push(agentType);
      }

      query += ' ORDER BY total_cost DESC';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Optimized query: Get daily cost summary
   */
  async getDailyCostSummary(
    startDate?: Date,
    endDate?: Date
  ): Promise<DailyCostSummary[]> {
    const client = await this.pool.connect();
    try {
      let query = 'SELECT * FROM mv_daily_cost_summary';
      const params: unknown[] = [];

      const conditions: string[] = [];
      if (startDate) {
        params.push(startDate);
        conditions.push(`date >= $${params.length}`);
      }
      if (endDate) {
        params.push(endDate);
        conditions.push(`date <= $${params.length}`);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY date DESC';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Optimized query: Get agents by team and status
   * Uses composite index idx_agents_team_status
   */
  async getAgentsByTeamAndStatus(
    teamId: string,
    status: string
  ): Promise<AgentRecord[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT *
        FROM agents
        WHERE team_id = $1 AND status = $2
        ORDER BY spawned_at DESC
      `;

      const result = await client.query(query, [teamId, status]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Optimized query: Get agents by status and time range
   * Uses composite index idx_agents_status_spawned
   */
  async getAgentsByStatusAndTimeRange(
    status: string,
    startDate: Date,
    endDate: Date
  ): Promise<AgentRecord[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT *
        FROM agents
        WHERE status = $1
          AND spawned_at >= $2
          AND spawned_at <= $3
        ORDER BY spawned_at DESC
      `;

      const result = await client.query(query, [status, startDate, endDate]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Analyze query performance
   */
  async analyzeQuery(query: string, params?: unknown[]): Promise<QueryPlan> {
    const client = await this.pool.connect();
    try {
      const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
      const result = await client.query(explainQuery, params);
      return result.rows[0]['QUERY PLAN'][0] as QueryPlan;
    } finally {
      client.release();
    }
  }

  /**
   * Get index usage statistics
   */
  async getIndexUsageStats(): Promise<IndexUsageStats[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT
          schemaname,
          tablename,
          indexname,
          idx_scan as index_scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
      `;

      const result = await client.query(query);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Shutdown query optimizer
   */
  async shutdown(): Promise<void> {
    this.stopMaterializedViewRefresh();
    console.log('Query optimizer shutdown complete');
  }
}

// Singleton instance
let queryOptimizerInstance: QueryOptimizer | null = null;

/**
 * Initialize singleton query optimizer
 */
export async function initQueryOptimizer(
  config: QueryOptimizerConfig
): Promise<QueryOptimizer> {
  if (!queryOptimizerInstance) {
    queryOptimizerInstance = new QueryOptimizer(config);
    await queryOptimizerInstance.initialize();
  }

  return queryOptimizerInstance;
}

/**
 * Get singleton query optimizer instance
 */
export function getQueryOptimizer(): QueryOptimizer {
  if (!queryOptimizerInstance) {
    throw new Error(
      'Query optimizer not initialized. Call initQueryOptimizer first.'
    );
  }
  return queryOptimizerInstance;
}

/**
 * Shutdown singleton query optimizer
 */
export async function shutdownQueryOptimizer(): Promise<void> {
  if (queryOptimizerInstance) {
    await queryOptimizerInstance.shutdown();
    queryOptimizerInstance = null;
  }
}
