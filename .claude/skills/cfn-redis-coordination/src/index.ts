/**
 * CFN Redis Coordination - TypeScript Entry Point
 *
 * Complete Redis coordination layer with Task Mode graceful fallback
 */

// Core types
export * from './types';

// Mode detection
export { detectMode, ConsoleLogger } from './mode-detector';

// Redis client
export { RedisCoordinator } from './redis-client';

// Coordination modules
export { ContextManager } from './context-manager';
export type { SuccessCriteria } from './context-manager';

export { CompletionReporter } from './completion-reporter';
export type { CompletionReportOptions } from './completion-reporter';

export { ResultCollector } from './result-collector';
export type { CollectionResult, AggregatedScores } from './result-collector';

export { WaitingCoordinator } from './waiting-coordinator';
export type { WaitResult, SignalResult } from './waiting-coordinator';

export { SwarmManager } from './swarm-manager';
export type { SwarmMetadata, CancellationSignal } from './swarm-manager';

export { AgentRecoveryManager } from './agent-recovery';
export type { AgentHealth } from './agent-recovery';

export { AgentLogger, storeAgentLog, getAgentLogs, getTaskLogs, clearLogs } from './agent-logger';
export type { LogLevel, LogEntry } from './agent-logger';

export { TaskAnalyzer } from './task-analyzer';
export type { ComplexityAnalysis, DifficultyLevel } from './task-analyzer';

export { TaskExecutor } from './task-executor';
export type { ExecutionConfig, ExecutionResult, ExecutionProgress } from './task-executor';

/**
 * Factory function to initialize all coordination modules
 *
 * Lazy-loaded to avoid circular dependencies
 */
export async function initializeCoordination() {
  // Dynamic imports to avoid circular dep issues
  const { RedisCoordinator } = await import('./redis-client');
  const { ConsoleLogger } = await import('./mode-detector');
  const { ContextManager: CM } = await import('./context-manager');
  const { CompletionReporter: CR } = await import('./completion-reporter');
  const { ResultCollector: RC } = await import('./result-collector');
  const { WaitingCoordinator: WC } = await import('./waiting-coordinator');
  const { SwarmManager: SM } = await import('./swarm-manager');
  const { AgentRecoveryManager: ARM } = await import('./agent-recovery');
  const { TaskAnalyzer: TA } = await import('./task-analyzer');
  const { TaskExecutor: TE } = await import('./task-executor');

  const redis = new RedisCoordinator();
  await redis.initialize();

  const logger = new ConsoleLogger('[CFN-Coord]');

  return {
    redis,
    logger,
    context: new CM(redis, logger),
    completion: new CR(redis, logger),
    results: new RC(redis, logger),
    waiting: new WC(redis, logger),
    swarm: new SM(redis, logger),
    recovery: new ARM(redis, logger),
    analyzer: new TA(redis, logger),
    executor: new TE(redis, logger)
  };
}

// Re-export mode detection for convenience
export { detectMode as default } from './mode-detector';
