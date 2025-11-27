/**
 * MDAP Database Operations
 *
 * Records and queries Multi-Dimensional Agent Performance metrics.
 * Integrates with existing cfn-db infrastructure for persistent storage.
 *
 * @module mdap-db
 * @version 1.0.0
 */

import { pool } from './cfn-db.js';

// =============================================
// Type Definitions
// =============================================

/**
 * Parameters for recording an MDAP execution
 */
export interface MDAPExecutionParams {
  /** CFN Loop task ID */
  taskId: string;
  /** Unique agent identifier */
  agentId: string;
  /** Model tier used (1-5) */
  modelTier: number;
  /** Model name/identifier */
  modelName: string;
  /** Provider used (zai, kimi, anthropic, etc.) */
  provider: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Confidence score (0.0-1.0) */
  confidence: number;
  /** Execution latency in milliseconds */
  latencyMs: number;
  /** Estimated cost (relative units) */
  estimatedCost: number;
  /** Input token count (optional) */
  inputTokens?: number;
  /** Output token count (optional) */
  outputTokens?: number;
  /** Complexity level of the task (optional) */
  complexityLevel?: string;
  /** Whether model was escalated (optional) */
  wasEscalated?: boolean;
}

/**
 * Parameters for updating model statistics
 */
export interface ModelStatsParams {
  /** CFN Loop task ID */
  taskId: string;
  /** Model tier (1-5) */
  modelTier: number;
  /** Model name/identifier */
  modelName: string;
  /** Average latency in milliseconds */
  avgLatency: number;
  /** Average confidence score */
  avgConfidence: number;
  /** Success rate (0.0-1.0) */
  successRate: number;
  /** Total cost for this model on this task */
  totalCost: number;
  /** Number of executions */
  executionCount: number;
}

/**
 * Escalation recommendation result
 */
export interface EscalationRecommendation {
  /** Whether escalation is recommended */
  shouldEscalate: boolean;
  /** Recommended tier if escalating */
  recommendedTier: number;
  /** Reason for recommendation */
  reason: string;
  /** Historical success rate at current tier */
  currentTierSuccessRate?: number;
  /** Historical success rate at recommended tier */
  recommendedTierSuccessRate?: number;
}

/**
 * MDAP execution record from database
 */
export interface MDAPExecutionRecord {
  id: number;
  taskId: string;
  agentId: string;
  modelTier: number;
  modelName: string;
  provider: string;
  success: boolean;
  confidence: number;
  latencyMs: number;
  estimatedCost: number;
  inputTokens: number | null;
  outputTokens: number | null;
  complexityLevel: string | null;
  wasEscalated: boolean;
  createdAt: Date;
}

/**
 * Model statistics aggregation
 */
export interface ModelStats {
  modelTier: number;
  modelName: string;
  provider: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  avgLatencyMs: number;
  avgConfidence: number;
  totalCost: number;
  avgCostPerExecution: number;
}

// =============================================
// Database Schema Setup
// =============================================

/**
 * Create MDAP tables if they don't exist
 *
 * Called on module initialization to ensure schema exists.
 */
export async function ensureMDAPSchema(): Promise<void> {
  try {
    // MDAP executions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mdap_executions (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(255) NOT NULL,
        agent_id VARCHAR(255) NOT NULL,
        model_tier INTEGER NOT NULL CHECK (model_tier >= 1 AND model_tier <= 5),
        model_name VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        success BOOLEAN NOT NULL,
        confidence DECIMAL(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        latency_ms INTEGER NOT NULL,
        estimated_cost DECIMAL(10,6) NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        complexity_level VARCHAR(50),
        was_escalated BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT mdap_exec_unique UNIQUE (task_id, agent_id)
      )
    `);

    // Model statistics aggregation table (updated periodically)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mdap_model_stats (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(255) NOT NULL,
        model_tier INTEGER NOT NULL,
        model_name VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        total_executions INTEGER DEFAULT 0,
        successful_executions INTEGER DEFAULT 0,
        failed_executions INTEGER DEFAULT 0,
        success_rate DECIMAL(4,3) DEFAULT 0,
        avg_latency_ms INTEGER DEFAULT 0,
        avg_confidence DECIMAL(4,3) DEFAULT 0,
        total_cost DECIMAL(12,6) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT mdap_stats_unique UNIQUE (task_id, model_tier, provider)
      )
    `);

    // Escalation history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mdap_escalations (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(255) NOT NULL,
        agent_id VARCHAR(255) NOT NULL,
        from_tier INTEGER NOT NULL,
        to_tier INTEGER NOT NULL,
        reason TEXT NOT NULL,
        trigger_confidence DECIMAL(4,3),
        trigger_success BOOLEAN,
        trigger_latency_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Indexes for common queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mdap_executions_task
      ON mdap_executions (task_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mdap_executions_tier
      ON mdap_executions (model_tier)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mdap_stats_task
      ON mdap_model_stats (task_id)
    `);

    console.log('[mdap-db] Schema ensured');
  } catch (error) {
    console.error('[mdap-db] Schema setup failed:', (error as Error).message);
    // Don't throw - allow operations to continue, they'll fail individually if schema missing
  }
}

// =============================================
// Core Operations
// =============================================

/**
 * Record an MDAP execution
 *
 * Stores detailed metrics for each agent execution including
 * model tier, latency, confidence, and cost.
 *
 * @param params - Execution parameters
 */
export async function recordMDAPExecution(params: MDAPExecutionParams): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO mdap_executions
       (task_id, agent_id, model_tier, model_name, provider, success,
        confidence, latency_ms, estimated_cost, input_tokens, output_tokens,
        complexity_level, was_escalated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (task_id, agent_id)
       DO UPDATE SET
         model_tier = EXCLUDED.model_tier,
         model_name = EXCLUDED.model_name,
         provider = EXCLUDED.provider,
         success = EXCLUDED.success,
         confidence = EXCLUDED.confidence,
         latency_ms = EXCLUDED.latency_ms,
         estimated_cost = EXCLUDED.estimated_cost,
         input_tokens = EXCLUDED.input_tokens,
         output_tokens = EXCLUDED.output_tokens,
         complexity_level = EXCLUDED.complexity_level,
         was_escalated = EXCLUDED.was_escalated,
         created_at = NOW()`,
      [
        params.taskId,
        params.agentId,
        params.modelTier,
        params.modelName,
        params.provider,
        params.success,
        params.confidence,
        params.latencyMs,
        params.estimatedCost,
        params.inputTokens ?? null,
        params.outputTokens ?? null,
        params.complexityLevel ?? null,
        params.wasEscalated ?? false,
      ]
    );

    console.log(
      `[mdap-db] Recorded execution: agent=${params.agentId} tier=${params.modelTier} ` +
      `success=${params.success} confidence=${params.confidence.toFixed(2)}`
    );
  } catch (error) {
    console.error('[mdap-db] Failed to record execution:', (error as Error).message);
    // Don't throw - MDAP recording is not critical to task execution
  }
}

/**
 * Update aggregated model statistics
 *
 * Should be called periodically or after batch completion to
 * maintain up-to-date statistics for escalation decisions.
 *
 * @param params - Statistics parameters
 */
export async function updateModelStats(params: ModelStatsParams): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO mdap_model_stats
       (task_id, model_tier, model_name, provider, total_executions,
        successful_executions, failed_executions, success_rate,
        avg_latency_ms, avg_confidence, total_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (task_id, model_tier, provider)
       DO UPDATE SET
         model_name = EXCLUDED.model_name,
         total_executions = EXCLUDED.total_executions,
         successful_executions = EXCLUDED.successful_executions,
         failed_executions = EXCLUDED.failed_executions,
         success_rate = EXCLUDED.success_rate,
         avg_latency_ms = EXCLUDED.avg_latency_ms,
         avg_confidence = EXCLUDED.avg_confidence,
         total_cost = EXCLUDED.total_cost,
         updated_at = NOW()`,
      [
        params.taskId,
        params.modelTier,
        params.modelName,
        'default', // Provider aggregated
        params.executionCount,
        Math.round(params.executionCount * params.successRate),
        Math.round(params.executionCount * (1 - params.successRate)),
        params.successRate,
        Math.round(params.avgLatency),
        params.avgConfidence,
        params.totalCost,
      ]
    );

    console.log(
      `[mdap-db] Updated stats: task=${params.taskId} tier=${params.modelTier} ` +
      `successRate=${params.successRate.toFixed(2)} executions=${params.executionCount}`
    );
  } catch (error) {
    console.error('[mdap-db] Failed to update stats:', (error as Error).message);
  }
}

/**
 * Record an escalation event
 *
 * @param params - Escalation event parameters
 */
export async function recordEscalation(params: {
  taskId: string;
  agentId: string;
  fromTier: number;
  toTier: number;
  reason: string;
  triggerConfidence?: number;
  triggerSuccess?: boolean;
  triggerLatencyMs?: number;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO mdap_escalations
       (task_id, agent_id, from_tier, to_tier, reason,
        trigger_confidence, trigger_success, trigger_latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.taskId,
        params.agentId,
        params.fromTier,
        params.toTier,
        params.reason,
        params.triggerConfidence ?? null,
        params.triggerSuccess ?? null,
        params.triggerLatencyMs ?? null,
      ]
    );

    console.log(
      `[mdap-db] Recorded escalation: agent=${params.agentId} ` +
      `T${params.fromTier}->T${params.toTier} reason="${params.reason}"`
    );
  } catch (error) {
    console.error('[mdap-db] Failed to record escalation:', (error as Error).message);
  }
}

/**
 * Get escalation recommendation based on historical performance
 *
 * Analyzes execution history for the task to recommend whether
 * escalation to a higher tier would improve success rate.
 *
 * @param taskId - Task identifier
 * @param currentTier - Current model tier
 * @returns Escalation recommendation
 */
export async function getEscalationRecommendation(
  taskId: string,
  currentTier: number
): Promise<EscalationRecommendation> {
  try {
    // Get success rates by tier for this task
    const result = await pool.query(
      `SELECT model_tier, success_rate, total_executions
       FROM mdap_model_stats
       WHERE task_id = $1
       ORDER BY model_tier`,
      [taskId]
    );

    const stats = result.rows as Array<{
      model_tier: number;
      success_rate: number;
      total_executions: number;
    }>;

    // Find current tier stats
    const currentStats = stats.find(s => s.model_tier === currentTier);

    // No history - recommend staying at current tier
    if (!currentStats || currentStats.total_executions < 3) {
      return {
        shouldEscalate: false,
        recommendedTier: currentTier,
        reason: 'Insufficient execution history for recommendation',
      };
    }

    // Already at max tier
    if (currentTier >= 5) {
      return {
        shouldEscalate: false,
        recommendedTier: 5,
        reason: 'Already at maximum tier',
        currentTierSuccessRate: currentStats.success_rate,
      };
    }

    // Check if current tier has low success rate
    const currentSuccessRate = Number(currentStats.success_rate);

    if (currentSuccessRate >= 0.9) {
      return {
        shouldEscalate: false,
        recommendedTier: currentTier,
        reason: 'Current tier has acceptable success rate (>=90%)',
        currentTierSuccessRate: currentSuccessRate,
      };
    }

    // Recommend next tier
    const nextTier = currentTier + 1;
    const nextStats = stats.find(s => s.model_tier === nextTier);

    return {
      shouldEscalate: true,
      recommendedTier: nextTier,
      reason: `Current tier success rate ${(currentSuccessRate * 100).toFixed(0)}% below threshold`,
      currentTierSuccessRate: currentSuccessRate,
      recommendedTierSuccessRate: nextStats ? Number(nextStats.success_rate) : undefined,
    };
  } catch (error) {
    console.error('[mdap-db] Failed to get escalation recommendation:', (error as Error).message);

    // Default: don't escalate on error
    return {
      shouldEscalate: false,
      recommendedTier: currentTier,
      reason: 'Error retrieving historical data',
    };
  }
}

// =============================================
// Query Operations
// =============================================

/**
 * Get executions for a task
 *
 * @param taskId - Task identifier
 * @param limit - Maximum records to return
 * @returns Array of execution records
 */
export async function getTaskExecutions(
  taskId: string,
  limit: number = 100
): Promise<MDAPExecutionRecord[]> {
  try {
    const result = await pool.query(
      `SELECT id, task_id, agent_id, model_tier, model_name, provider,
              success, confidence, latency_ms, estimated_cost,
              input_tokens, output_tokens, complexity_level,
              was_escalated, created_at
       FROM mdap_executions
       WHERE task_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [taskId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      agentId: row.agent_id,
      modelTier: row.model_tier,
      modelName: row.model_name,
      provider: row.provider,
      success: row.success,
      confidence: Number(row.confidence),
      latencyMs: row.latency_ms,
      estimatedCost: Number(row.estimated_cost),
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      complexityLevel: row.complexity_level,
      wasEscalated: row.was_escalated,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('[mdap-db] Failed to get task executions:', (error as Error).message);
    return [];
  }
}

/**
 * Get model statistics summary
 *
 * @param taskId - Task identifier (optional, all tasks if not specified)
 * @returns Array of model statistics
 */
export async function getModelStatsSummary(taskId?: string): Promise<ModelStats[]> {
  try {
    let query: string;
    let params: string[];

    if (taskId) {
      query = `
        SELECT model_tier, model_name, provider,
               SUM(total_executions) as total_executions,
               SUM(successful_executions) as successful_executions,
               SUM(failed_executions) as failed_executions,
               AVG(success_rate) as success_rate,
               AVG(avg_latency_ms) as avg_latency_ms,
               AVG(avg_confidence) as avg_confidence,
               SUM(total_cost) as total_cost
        FROM mdap_model_stats
        WHERE task_id = $1
        GROUP BY model_tier, model_name, provider
        ORDER BY model_tier
      `;
      params = [taskId];
    } else {
      query = `
        SELECT model_tier, model_name, provider,
               SUM(total_executions) as total_executions,
               SUM(successful_executions) as successful_executions,
               SUM(failed_executions) as failed_executions,
               AVG(success_rate) as success_rate,
               AVG(avg_latency_ms) as avg_latency_ms,
               AVG(avg_confidence) as avg_confidence,
               SUM(total_cost) as total_cost
        FROM mdap_model_stats
        GROUP BY model_tier, model_name, provider
        ORDER BY model_tier
      `;
      params = [];
    }

    const result = await pool.query(query, params);

    return result.rows.map(row => ({
      modelTier: row.model_tier,
      modelName: row.model_name,
      provider: row.provider,
      totalExecutions: Number(row.total_executions),
      successfulExecutions: Number(row.successful_executions),
      failedExecutions: Number(row.failed_executions),
      successRate: Number(row.success_rate),
      avgLatencyMs: Number(row.avg_latency_ms),
      avgConfidence: Number(row.avg_confidence),
      totalCost: Number(row.total_cost),
      avgCostPerExecution: Number(row.total_executions) > 0
        ? Number(row.total_cost) / Number(row.total_executions)
        : 0,
    }));
  } catch (error) {
    console.error('[mdap-db] Failed to get model stats:', (error as Error).message);
    return [];
  }
}

/**
 * Get total MDAP cost for a task
 *
 * @param taskId - Task identifier
 * @returns Total estimated cost
 */
export async function getTaskTotalCost(taskId: string): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(estimated_cost), 0) as total_cost
       FROM mdap_executions
       WHERE task_id = $1`,
      [taskId]
    );

    return Number(result.rows[0]?.total_cost || 0);
  } catch (error) {
    console.error('[mdap-db] Failed to get task cost:', (error as Error).message);
    return 0;
  }
}

/**
 * Calculate and update aggregated statistics for a task
 *
 * Should be called after iteration completion to update
 * mdap_model_stats table with latest aggregations.
 *
 * @param taskId - Task identifier
 */
export async function refreshTaskStats(taskId: string): Promise<void> {
  try {
    // Aggregate executions into stats
    await pool.query(
      `INSERT INTO mdap_model_stats
       (task_id, model_tier, model_name, provider, total_executions,
        successful_executions, failed_executions, success_rate,
        avg_latency_ms, avg_confidence, total_cost)
       SELECT
         task_id,
         model_tier,
         MAX(model_name) as model_name,
         provider,
         COUNT(*) as total_executions,
         COUNT(*) FILTER (WHERE success = true) as successful_executions,
         COUNT(*) FILTER (WHERE success = false) as failed_executions,
         AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) as success_rate,
         AVG(latency_ms)::INTEGER as avg_latency_ms,
         AVG(confidence) as avg_confidence,
         SUM(estimated_cost) as total_cost
       FROM mdap_executions
       WHERE task_id = $1
       GROUP BY task_id, model_tier, provider
       ON CONFLICT (task_id, model_tier, provider)
       DO UPDATE SET
         model_name = EXCLUDED.model_name,
         total_executions = EXCLUDED.total_executions,
         successful_executions = EXCLUDED.successful_executions,
         failed_executions = EXCLUDED.failed_executions,
         success_rate = EXCLUDED.success_rate,
         avg_latency_ms = EXCLUDED.avg_latency_ms,
         avg_confidence = EXCLUDED.avg_confidence,
         total_cost = EXCLUDED.total_cost,
         updated_at = NOW()`,
      [taskId]
    );

    console.log(`[mdap-db] Refreshed stats for task ${taskId}`);
  } catch (error) {
    console.error('[mdap-db] Failed to refresh task stats:', (error as Error).message);
  }
}

// Initialize schema on module load
ensureMDAPSchema().catch(err => {
  console.warn('[mdap-db] Schema initialization deferred:', err.message);
});
