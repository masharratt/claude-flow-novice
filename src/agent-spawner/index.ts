/**
 * Agent Spawner Module
 *
 * TypeScript implementation of spawn-agents.sh
 * Provides type-safe agent spawning with memory budget management and context injection.
 *
 * @module agent-spawner
 */

export {
  AgentSpawner,
  spawnAgents,
  MemoryTierAnalyzer,
  WaveManager,
  InputSanitizer,
  DefaultContextEnricher,
} from './agent-spawner';

export type {
  AgentSpec,
  SpawnConfig,
  SpawnResult,
  SpawnSummary,
  MemoryTier,
  MemoryBudget,
  EnrichedContext,
  InstanceCounter,
  DockerSpawnOptions,
  SpawnError,
  RedisPayload,
  Logger,
  DockerClient,
  RedisClient,
  ContextEnricher,
} from './types';
