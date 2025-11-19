/**
 * Result Collector
 *
 * Handles collecting results, confidence scores, and consensus from agents.
 *
 * Migrated from:
 * - collect-results.sh (75 lines)
 * - collect-confidence-scores.sh (209 lines)
 */

import type {
  TaskId,
  AgentId,
  Logger,
  ConsensusScore
} from './types';
import {
  CoordinationError,
  CoordinationErrorType,
  isValidTaskId,
  isValidAgentId
} from './types';
import { RedisCoordinator } from './redis-client';

export interface CollectionResult {
  agentId: AgentId;
  confidence: number;
  testPassRate?: number;
  result?: Record<string, unknown>;
}

export interface AggregatedScores {
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
  consensus: number;
  agentCount: number;
  scores: ConsensusScore[];
  timestamp: string;
}

export class ResultCollector {
  constructor(
    private redis: RedisCoordinator,
    private logger: Logger
  ) {}

  /**
   * Collect results from multiple agents
   *
   * In Task Mode: Returns empty array
   * In CLI Mode: Retrieves from Redis
   */
  async collectResults(
    taskId: TaskId,
    agentIds: AgentId[],
    namespace: string = 'swarm'
  ): Promise<CollectionResult[]> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!agentIds || agentIds.length === 0) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        'Agent IDs list cannot be empty'
      );
    }

    // Validate all agent IDs
    for (const agentId of agentIds) {
      if (!isValidAgentId(agentId)) {
        throw new CoordinationError(
          CoordinationErrorType.VALIDATION_ERROR,
          `Invalid agent ID: ${agentId}`
        );
      }
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: No results available in Redis');
      return [];
    }

    // CLI Mode: Collect from Redis
    const results: CollectionResult[] = [];

    try {
      for (const agentId of agentIds) {
        const confidenceKey = `${namespace}:${taskId}:${agentId}:confidence`;
        const resultKey = `${namespace}:${taskId}:${agentId}:result`;
        const testResultsKey = `${namespace}:${taskId}:${agentId}:test-results`;

        // Get confidence score
        const confidenceStr = await this.redis.get(confidenceKey);
        const confidence = confidenceStr ? parseFloat(confidenceStr) : 0;

        // Get test pass rate if available
        const testResultsData = await this.redis.hgetall(testResultsKey);
        const testPassRate = testResultsData?.passRate
          ? parseFloat(testResultsData.passRate)
          : undefined;

        // Get full result
        const resultData = await this.redis.hgetall(resultKey);

        results.push({
          agentId,
          confidence,
          testPassRate,
          result: resultData && Object.keys(resultData).length > 0 ? resultData : undefined
        });
      }

      this.logger.info(`✅ Collected results from ${results.length} agents`);
      return results;
    } catch (error) {
      this.logger.error('Failed to collect results', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to collect results: ${(error as Error).message}`
      );
    }
  }

  /**
   * Collect confidence scores from validator agents
   *
   * In Task Mode: Returns empty array
   * In CLI Mode: Retrieves from Redis and aggregates
   */
  async collectConfidenceScores(
    taskId: TaskId,
    validatorIds: AgentId[],
    namespace: string = 'swarm'
  ): Promise<CollectionResult[]> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!validatorIds || validatorIds.length === 0) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        'Validator IDs list cannot be empty'
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: No confidence scores available in Redis');
      return [];
    }

    // CLI Mode: Collect scores from validators
    try {
      const scores: CollectionResult[] = [];

      for (const validatorId of validatorIds) {
        const scoreKey = `${namespace}:${taskId}:${validatorId}:confidence`;
        const scoreStr = await this.redis.get(scoreKey);
        const confidence = scoreStr ? parseFloat(scoreStr) : 0;

        scores.push({
          agentId: validatorId,
          confidence
        });
      }

      this.logger.info(`✅ Collected confidence scores from ${scores.length} validators`);
      return scores;
    } catch (error) {
      this.logger.error('Failed to collect confidence scores', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to collect confidence scores: ${(error as Error).message}`
      );
    }
  }

  /**
   * Aggregate confidence scores and calculate consensus
   *
   * Calculates average, min, max, and overall consensus score
   */
  aggregateScores(scores: CollectionResult[]): AggregatedScores {
    if (!scores || scores.length === 0) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        'Cannot aggregate empty scores array'
      );
    }

    const confidences = scores.map(s => s.confidence);
    const total = confidences.reduce((a, b) => a + b, 0);
    const avgConfidence = total / confidences.length;

    // Calculate consensus (how close scores are to each other)
    // Use standard deviation normalized to 0-1 range
    const variance = confidences.reduce(
      (sum, conf) => sum + Math.pow(conf - avgConfidence, 2),
      0
    ) / confidences.length;
    const stdDev = Math.sqrt(variance);
    const consensus = Math.max(0, 1 - stdDev);

    // Convert to consensus scores for storage
    const consensusScores: ConsensusScore[] = scores.map(result => ({
      agentId: result.agentId,
      score: result.confidence,
      feedback: `Confidence score: ${(result.confidence * 100).toFixed(1)}%`,
      iteration: 1,
      timestamp: new Date().toISOString()
    }));

    const aggregated: AggregatedScores = {
      avgConfidence,
      minConfidence: Math.min(...confidences),
      maxConfidence: Math.max(...confidences),
      consensus,
      agentCount: scores.length,
      scores: consensusScores,
      timestamp: new Date().toISOString()
    };

    this.logger.info(
      `📊 Aggregated scores: Avg=${(avgConfidence * 100).toFixed(1)}%, ` +
      `Consensus=${(consensus * 100).toFixed(1)}%, Agents=${scores.length}`
    );

    return aggregated;
  }

  /**
   * Store aggregated scores in Redis
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Stores in Redis
   */
  async storeAggregatedScores(
    taskId: TaskId,
    aggregated: AggregatedScores,
    iteration: number = 1,
    namespace: string = 'swarm'
  ): Promise<void> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Aggregated scores not stored (no Redis)');
      return;
    }

    // CLI Mode: Store in Redis
    try {
      const key = `${namespace}:${taskId}:aggregated-scores:iteration-${iteration}`;

      await this.redis.hset(
        key,
        'avgConfidence', String(aggregated.avgConfidence),
        'minConfidence', String(aggregated.minConfidence),
        'maxConfidence', String(aggregated.maxConfidence),
        'consensus', String(aggregated.consensus),
        'agentCount', String(aggregated.agentCount),
        'iteration', String(iteration),
        'timestamp', aggregated.timestamp
      );

      // Set TTL (24 hours)
      await this.redis.expire(key, 86400);

      this.logger.info(
        `✅ Aggregated scores stored: Consensus=${(aggregated.consensus * 100).toFixed(1)}%`
      );
    } catch (error) {
      this.logger.error('Failed to store aggregated scores', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to store aggregated scores: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get aggregated scores for an iteration
   */
  async getAggregatedScores(
    taskId: TaskId,
    iteration: number = 1,
    namespace: string = 'swarm'
  ): Promise<AggregatedScores | null> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: No aggregated scores available in Redis');
      return null;
    }

    // CLI Mode: Retrieve from Redis
    try {
      const key = `${namespace}:${taskId}:aggregated-scores:iteration-${iteration}`;
      const data = await this.redis.hgetall(key);

      if (!data || Object.keys(data).length === 0) {
        this.logger.warn(`No aggregated scores found for iteration ${iteration}`);
        return null;
      }

      const aggregated: AggregatedScores = {
        avgConfidence: parseFloat(data.avgConfidence || '0'),
        minConfidence: parseFloat(data.minConfidence || '0'),
        maxConfidence: parseFloat(data.maxConfidence || '0'),
        consensus: parseFloat(data.consensus || '0'),
        agentCount: parseInt(data.agentCount || '0', 10),
        scores: [],
        timestamp: data.timestamp || new Date().toISOString()
      };

      return aggregated;
    } catch (error) {
      this.logger.error('Failed to get aggregated scores', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to retrieve aggregated scores: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get combined results with confidence and test metrics
   */
  async getCombinedMetrics(
    taskId: TaskId,
    agentIds: AgentId[],
    namespace: string = 'swarm'
  ): Promise<{
    results: CollectionResult[];
    avgConfidence: number;
    overallTestPassRate?: number;
  }> {
    const results = await this.collectResults(taskId, agentIds, namespace);

    const confidences = results.map(r => r.confidence);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    const testPassRates = results
      .filter(r => r.testPassRate !== undefined)
      .map(r => r.testPassRate!);

    const overallTestPassRate = testPassRates.length > 0
      ? testPassRates.reduce((a, b) => a + b, 0) / testPassRates.length
      : undefined;

    return {
      results,
      avgConfidence,
      overallTestPassRate
    };
  }

  /**
   * Clear results for a task
   */
  async clearResults(
    taskId: TaskId,
    agentIds?: AgentId[],
    namespace: string = 'swarm'
  ): Promise<void> {
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Result cleanup skipped');
      return;
    }

    try {
      const keysToDelete: string[] = [];

      if (agentIds && agentIds.length > 0) {
        // Clear specific agents' results
        for (const agentId of agentIds) {
          if (isValidAgentId(agentId)) {
            keysToDelete.push(
              `${namespace}:${taskId}:${agentId}:confidence`,
              `${namespace}:${taskId}:${agentId}:result`,
              `${namespace}:${taskId}:${agentId}:test-results`
            );
          }
        }
      } else {
        // Clear all results for task (pattern scan)
        const pattern = `${namespace}:${taskId}:*:result`;
        // Note: Full pattern scanning would require additional Redis operations
        // For now, we'll require specific agent IDs
      }

      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
        this.logger.info(`✅ Cleared results for ${keysToDelete.length / 3} agents`);
      }
    } catch (error) {
      this.logger.error('Failed to clear results', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to clear results: ${(error as Error).message}`
      );
    }
  }
}
