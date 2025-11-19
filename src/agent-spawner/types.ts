/**
 * Agent Spawner Type Definitions
 *
 * Defines types for agent spawning, memory management, and context injection.
 *
 * @module agent-spawner/types
 */

/**
 * Memory tier levels for agent spawning
 * Used to categorize agents by resource requirements
 */
export type MemoryTier = '512mb' | '1gb' | '2gb' | '4gb';

/**
 * Agent specification for spawning
 */
export interface AgentSpec {
  type: string;
  id: string;
  taskId: string;
  iteration: number;
  instanceNum: number;
  context: string;
  memoryTier?: MemoryTier;
}

/**
 * Configuration for agent spawning
 */
export interface SpawnConfig {
  taskId: string;
  iteration: number;
  agents: string[];
  originalContext: string;
  logDir?: string;
  redisHost?: string;
  redisPort?: number;
  projectRoot?: string;
}

/**
 * Result of spawning a single agent
 */
export interface SpawnResult {
  agentId: string;
  agentType: string;
  pid?: number;
  success: boolean;
  error?: string;
  injectionSuccessful: boolean;
  injectionTime?: number;
  contextSize?: number;
}

/**
 * Summary of spawning operation
 */
export interface SpawnSummary {
  totalSpawned: number;
  injectionSuccessCount: number;
  injectionFailureCount: number;
  spawnResults: SpawnResult[];
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Memory budget allocation for a wave of agents
 */
export interface MemoryBudget {
  totalBudget: number;
  allocations: Map<MemoryTier, number>;
  remaining: number;
}

/**
 * Context enrichment result
 */
export interface EnrichedContext {
  originalContext: string;
  historicalContext?: Record<string, unknown>;
  injectionTime: number;
  success: boolean;
  error?: string;
}

/**
 * Agent instance count tracking
 */
export interface InstanceCounter {
  [agentType: string]: number;
}

/**
 * Docker spawn options
 */
export interface DockerSpawnOptions {
  image: string;
  agentType: string;
  agentId: string;
  taskId: string;
  context: string;
  memoryLimit?: string;
  environment?: Record<string, string>;
}

/**
 * Spawn error with detailed information
 */
export interface SpawnError extends Error {
  agentType: string;
  agentId: string;
  taskId: string;
  code?: string;
  stderr?: string;
  stdout?: string;
}

/**
 * Redis coordination payload
 */
export interface RedisPayload {
  pid: number;
  timestamp: number;
  status: 'spawned' | 'completed' | 'failed';
  error?: string;
}

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
}

/**
 * Docker client interface for dependency injection
 */
export interface DockerClient {
  createContainer(options: Record<string, unknown>): Promise<{ id: string }>;
  startContainer(id: string): Promise<void>;
  inspectContainer(id: string): Promise<Record<string, unknown>>;
}

/**
 * Redis client interface for dependency injection
 */
export interface RedisClient {
  set(key: string, value: string): Promise<string | null>;
  sadd(key: string, value: string): Promise<number>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

/**
 * Context enrichment provider interface
 */
export interface ContextEnricher {
  enrich(
    taskId: string,
    agentType: string,
    originalContext: string
  ): Promise<EnrichedContext>;
}
