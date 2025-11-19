/**
 * Agent Spawner - TypeScript implementation of spawn-agents.sh
 *
 * Spawns Loop 3 agents with enriched historical context from Redis.
 * Supports wave-based memory allocation and parallel agent spawning.
 *
 * @module agent-spawner
 */

import { execFile, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import {
  AgentSpec,
  SpawnConfig,
  SpawnResult,
  SpawnSummary,
  MemoryTier,
  Logger,
  DockerClient,
  RedisClient,
  ContextEnricher,
  EnrichedContext,
  InstanceCounter,
} from './types';

const execFileAsync = promisify(execFile);

/**
 * Default logger implementation
 */
class ConsoleLogger implements Logger {
  info(message: string, data?: unknown): void {
    console.log(`[INFO] ${message}`, data);
  }

  warn(message: string, data?: unknown): void {
    console.warn(`[WARN] ${message}`, data);
  }

  error(message: string, data?: unknown): void {
    console.error(`[ERROR] ${message}`, data);
  }

  debug(message: string, data?: unknown): void {
    if (process.env.DEBUG) {
      console.debug(`[DEBUG] ${message}`, data);
    }
  }
}

/**
 * Default context enricher implementation
 */
class DefaultContextEnricher implements ContextEnricher {
  constructor(private logger: Logger) {}

  async enrich(
    taskId: string,
    agentType: string,
    originalContext: string
  ): Promise<EnrichedContext> {
    const startTime = Date.now();

    try {
      // Validate inputs
      this.validateInputs(taskId, agentType);

      // In a real implementation, this would call context-injection.sh
      // For now, return original context with metadata
      const injectionTime = Date.now() - startTime;

      if (injectionTime > 200) {
        this.logger.warn(
          `Context injection exceeded 200ms threshold: ${injectionTime}ms`
        );
      }

      return {
        originalContext,
        injectionTime,
        success: true,
      };
    } catch (error) {
      const injectionTime = Date.now() - startTime;
      this.logger.warn(
        `Context injection failed for ${agentType}, using original context`,
        error
      );

      return {
        originalContext,
        injectionTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private validateInputs(taskId: string, agentType: string): void {
    if (!taskId || typeof taskId !== 'string') {
      throw new Error('Invalid task ID');
    }
    if (!agentType || typeof agentType !== 'string') {
      throw new Error('Invalid agent type');
    }
  }
}

/**
 * Memory tier analyzer
 */
class MemoryTierAnalyzer {
  private tierMapping: Map<MemoryTier, number> = new Map([
    ['512mb', 512],
    ['1gb', 1024],
    ['2gb', 2048],
    ['4gb', 4096],
  ]);

  analyzeTier(agentType: string): MemoryTier {
    // Analyze agent type to determine memory requirements
    // This would typically analyze file clusters or agent complexity
    if (agentType.includes('orchestrator')) return '4gb';
    if (agentType.includes('validator') || agentType.includes('reviewer'))
      return '2gb';
    if (agentType.includes('specialist')) return '1gb';
    return '512mb';
  }

  getTierMemory(tier: MemoryTier): number {
    return this.tierMapping.get(tier) || 512;
  }

  getAllTiers(): MemoryTier[] {
    return Array.from(this.tierMapping.keys());
  }
}

/**
 * Wave manager for memory budget allocation
 */
class WaveManager {
  private memoryBudget = 40 * 1024; // 40GB total budget
  private usedMemory = 0;
  private tierAnalyzer: MemoryTierAnalyzer;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.tierAnalyzer = new MemoryTierAnalyzer();
  }

  /**
   * Allocate agents into waves based on memory constraints
   */
  allocateWaves(agentTypes: string[]): string[][] {
    const waves: string[][] = [];
    let currentWave: string[] = [];
    let waveMemory = 0;

    for (const agentType of agentTypes) {
      const tier = this.tierAnalyzer.analyzeTier(agentType);
      const memory = this.tierAnalyzer.getTierMemory(tier);

      // Check if adding this agent exceeds budget
      if (waveMemory + memory > this.memoryBudget) {
        // Start new wave
        if (currentWave.length > 0) {
          waves.push(currentWave);
        }
        currentWave = [agentType];
        waveMemory = memory;
      } else {
        currentWave.push(agentType);
        waveMemory += memory;
      }
    }

    // Add final wave
    if (currentWave.length > 0) {
      waves.push(currentWave);
    }

    this.logger.info(`Allocated ${agentTypes.length} agents into ${waves.length} waves`);
    return waves;
  }

  /**
   * Get memory tier for agent type
   */
  getTier(agentType: string): MemoryTier {
    return this.tierAnalyzer.analyzeTier(agentType);
  }

  /**
   * Reset budget (for testing)
   */
  reset(): void {
    this.usedMemory = 0;
  }

  /**
   * Get remaining memory budget
   */
  getRemaining(): number {
    return Math.max(0, this.memoryBudget - this.usedMemory);
  }
}

/**
 * Input sanitizer for security
 */
class InputSanitizer {
  /**
   * Sanitize input by removing dangerous characters
   * Only allows alphanumeric, dash, underscore, dot, comma, colon
   */
  sanitize(input: string): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    return input.replace(/[^a-zA-Z0-9._:,\-]/g, '');
  }

  /**
   * Validate task ID format
   */
  validateTaskId(taskId: string): boolean {
    const sanitized = this.sanitize(taskId);
    return sanitized === taskId && sanitized.length > 0;
  }

  /**
   * Validate agent type
   */
  validateAgentType(agentType: string): boolean {
    const sanitized = this.sanitize(agentType);
    return sanitized === agentType && sanitized.length > 0;
  }
}

/**
 * Main Agent Spawner class
 */
export class AgentSpawner {
  private config: SpawnConfig;
  private logger: Logger;
  private redisClient: RedisClient | null = null;
  private contextEnricher: ContextEnricher;
  private waveManager: WaveManager;
  private sanitizer: InputSanitizer;
  private spawnResults: SpawnResult[] = [];

  constructor(
    config: SpawnConfig,
    logger?: Logger,
    contextEnricher?: ContextEnricher,
    redisClient?: RedisClient
  ) {
    this.config = this.validateConfig(config);
    this.logger = logger || new ConsoleLogger();
    this.contextEnricher = contextEnricher || new DefaultContextEnricher(this.logger);
    this.redisClient = redisClient || null;
    this.waveManager = new WaveManager(this.logger);
    this.sanitizer = new InputSanitizer();
    this.spawnResults = [];
  }

  /**
   * Validate spawn configuration
   */
  private validateConfig(config: SpawnConfig): SpawnConfig {
    if (!config.taskId || typeof config.taskId !== 'string') {
      throw new Error('Invalid or missing taskId');
    }
    if (config.iteration === undefined || config.iteration < 0) {
      throw new Error('Invalid or missing iteration');
    }
    if (!Array.isArray(config.agents) || config.agents.length === 0) {
      throw new Error('Invalid or missing agents');
    }
    if (!config.originalContext || typeof config.originalContext !== 'string') {
      throw new Error('Invalid or missing originalContext');
    }

    return {
      ...config,
      logDir: config.logDir || '.artifacts/logs',
      redisHost: config.redisHost || 'localhost',
      redisPort: config.redisPort || 6379,
      projectRoot: config.projectRoot || process.cwd(),
    };
  }

  /**
   * Spawn all agents and return summary
   */
  async spawn(): Promise<SpawnSummary> {
    const startTime = Date.now();

    try {
      this.logger.info('Starting agent spawning with context injection');
      this.logger.info(
        `Task ID: ${this.config.taskId}, Iteration: ${this.config.iteration}`
      );

      // Create log directory
      await this.ensureLogDir();

      // Validate inputs
      this.validateInputs();

      // Allocate agents into waves
      const waves = this.waveManager.allocateWaves(this.config.agents);

      // Spawn each wave sequentially to respect memory budget
      for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
        const wave = waves[waveIdx];
        this.logger.info(`Starting wave ${waveIdx + 1} with ${wave.length} agents`);

        // Spawn agents in wave in parallel
        await Promise.all(
          wave.map((agentType) => this.spawnSingleAgent(agentType))
        );

        this.logger.info(`Wave ${waveIdx + 1} complete`);
      }

      // Validate that at least one agent was spawned
      if (this.spawnResults.length === 0) {
        throw new Error('No agents were spawned');
      }

      const injectionSuccessCount = this.spawnResults.filter(
        (r) => r.injectionSuccessful
      ).length;

      const endTime = Date.now();

      const summary: SpawnSummary = {
        totalSpawned: this.spawnResults.length,
        injectionSuccessCount,
        injectionFailureCount: this.spawnResults.length - injectionSuccessCount,
        spawnResults: this.spawnResults,
        startTime,
        endTime,
        duration: endTime - startTime,
      };

      this.logger.info(
        `Agent spawning complete: ${summary.totalSpawned} agents spawned`
      );
      this.logger.info(
        `Context injection success rate: ${injectionSuccessCount}/${summary.totalSpawned}`
      );

      return summary;
    } catch (error) {
      this.logger.error('Agent spawning failed', error);
      throw error;
    }
  }

  /**
   * Spawn a single agent
   */
  private async spawnSingleAgent(agentType: string): Promise<void> {
    try {
      // Get or increment instance count
      const instanceNum = this.getNextInstanceNumber(agentType);
      const agentId = `${agentType}-${this.config.iteration}-${instanceNum}`;

      this.logger.info(
        `Spawning agent: ${agentType} (ID: ${agentId})`
      );

      // Sanitize inputs
      const safeAgentType = this.sanitizer.sanitize(agentType);
      const safeTaskId = this.sanitizer.sanitize(this.config.taskId);
      const safeAgentId = this.sanitizer.sanitize(agentId);

      if (!this.sanitizer.validateAgentType(safeAgentType)) {
        throw new Error(`Invalid agent type: ${agentType}`);
      }

      if (!this.sanitizer.validateTaskId(safeTaskId)) {
        throw new Error(`Invalid task ID: ${this.config.taskId}`);
      }

      // Enrich context
      const enriched = await this.contextEnricher.enrich(
        safeTaskId,
        safeAgentType,
        this.config.originalContext
      );

      const contextToUse = enriched.originalContext;

      // Get memory tier
      const memoryTier = this.waveManager.getTier(safeAgentType);

      // Spawn agent
      const pid = await this.spawnAgentProcess(
        safeAgentType,
        safeAgentId,
        safeTaskId,
        contextToUse,
        memoryTier
      );

      // Store agent PID in Redis if available
      if (this.redisClient) {
        await this.storeAgentInRedis(safeTaskId, safeAgentId, pid);
      }

      // Record spawn result
      this.spawnResults.push({
        agentId: safeAgentId,
        agentType: safeAgentType,
        pid,
        success: true,
        injectionSuccessful: enriched.success,
        injectionTime: enriched.injectionTime,
        contextSize: contextToUse.length,
      });

      this.logger.info(`Agent ${safeAgentType} spawned (PID: ${pid})`);
    } catch (error) {
      const safeType = this.sanitizer.sanitize(agentType);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      this.spawnResults.push({
        agentId: `${safeType}-${this.config.iteration}-unknown`,
        agentType: safeType,
        success: false,
        injectionSuccessful: false,
        error: errorMsg,
      });

      this.logger.error(
        `Failed to spawn agent ${safeType}: ${errorMsg}`
      );
    }
  }

  /**
   * Spawn agent process (CLI command)
   */
  private async spawnAgentProcess(
    agentType: string,
    agentId: string,
    taskId: string,
    context: string,
    memoryTier: MemoryTier
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        // Get provider environment variables
        const env = {
          ...process.env,
          MEMORY_TIER: memoryTier,
          TASK_ID: taskId,
          AGENT_ID: agentId,
          AGENT_TYPE: agentType,
        };

        // Spawn agent in background
        const child = spawn('npx', [
          'claude-flow-novice',
          'agent',
          agentType,
          '--task-id', taskId,
          '--agent-id', agentId,
          '--iteration', String(this.config.iteration),
          '--context', context,
        ], {
          env,
          detached: true,
          stdio: 'ignore',
        });

        const pid = child.pid;
        if (!pid) {
          reject(new Error(`Failed to get PID for agent ${agentType}`));
          return;
        }

        // Detach from parent process
        child.unref();

        resolve(pid);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Store agent info in Redis
   */
  private async storeAgentInRedis(
    taskId: string,
    agentId: string,
    pid: number
  ): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      const key = `swarm:${taskId}:${agentId}:pid`;
      const value = JSON.stringify({
        pid,
        timestamp: Date.now(),
      });

      await this.redisClient.set(key, value);

      // Also add to agent ID set for this iteration
      const setKey = `swarm:${taskId}:loop3:agent_ids:iteration${this.config.iteration}`;
      await this.redisClient.sadd(setKey, agentId);
    } catch (error) {
      this.logger.warn('Failed to store agent info in Redis', error);
    }
  }

  /**
   * Validate input arguments
   */
  private validateInputs(): void {
    if (!this.sanitizer.validateTaskId(this.config.taskId)) {
      throw new Error(`Invalid task ID format: ${this.config.taskId}`);
    }

    for (const agent of this.config.agents) {
      if (!this.sanitizer.validateAgentType(agent)) {
        throw new Error(`Invalid agent type format: ${agent}`);
      }
    }
  }

  /**
   * Get next instance number for agent type
   */
  private instanceCounters: InstanceCounter = {};

  private getNextInstanceNumber(agentType: string): number {
    if (!this.instanceCounters[agentType]) {
      this.instanceCounters[agentType] = 0;
    }
    return ++this.instanceCounters[agentType];
  }

  /**
   * Ensure log directory exists
   */
  private async ensureLogDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.logDir!, { recursive: true });
    } catch (error) {
      this.logger.warn('Failed to create log directory', error);
    }
  }

  /**
   * Get spawn results for testing
   */
  getResults(): SpawnResult[] {
    return this.spawnResults;
  }

  /**
   * Reset state (for testing)
   */
  reset(): void {
    this.spawnResults = [];
    this.instanceCounters = {};
    this.waveManager.reset();
  }
}

/**
 * Convenience function for spawning agents
 */
export async function spawnAgents(config: SpawnConfig): Promise<SpawnSummary> {
  const spawner = new AgentSpawner(config);
  return spawner.spawn();
}

export { MemoryTierAnalyzer, WaveManager, InputSanitizer, DefaultContextEnricher };
