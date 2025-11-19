/**
 * CFN Docker Redis Coordination Module
 *
 * Exports type-safe Redis coordinator and all types
 *
 * @module cfn-docker-redis-coordination
 */

export { RedisCoordinator, default } from './coordinator';

export type {
  ExecutionMode,
  TaskContext,
  AgentInfo,
  AgentStatus,
  StatusHistoryEntry,
  ConfidenceResult,
  ConsensusResult,
  RedisConfig,
  CoordinatorConfig,
  ModeThresholds,
  WaitLoopParams,
  WaitLoopResult,
  CollectConsensusParams,
  CollectConsensusResult,
  ILogger,
  IRedisClient,
} from './types';

export {
  CoordinationError,
  ValidationError,
  SecurityError,
  TimeoutError,
  RedisConnectionError,
  isValidExecutionMode,
  isValidAgentStatus,
  isValidConfidence,
  isValidTaskId,
  isValidAgentId,
  isValidRedisConfig,
} from './types';
