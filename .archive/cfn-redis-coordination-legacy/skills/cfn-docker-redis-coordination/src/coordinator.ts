/**
 * Redis Coordinator Implementation
 *
 * Provides type-safe Redis-based coordination for CFN Loop tasks and agents.
 * Handles task initialization, agent registration, status tracking, consensus
 * collection, and loop synchronization with proper error handling and timeouts.
 *
 * @module cfn-docker-redis-coordination/coordinator
 */

import Redis from 'ioredis';
import {
  RedisConfig,
  CoordinatorConfig,
  IRedisClient,
  ILogger,
  AgentStatus,
  TaskContext,
  WaitLoopParams,
  WaitLoopResult,
  CollectConsensusParams,
  CollectConsensusResult,
  ExecutionMode,
  ValidationError,
  SecurityError,
  TimeoutError,
  RedisConnectionError,
  isValidTaskId,
  isValidAgentId,
  isValidConfidence,
} from './types';

/**
 * Redis Coordinator for CFN Loop task coordination
 *
 * Manages task initialization, agent registration, status tracking,
 * and consensus collection using Redis as the coordination backend.
 */
export class RedisCoordinator {
  private redisClient: IRedisClient;
  private readonly config: CoordinatorConfig;
  private readonly logger: ILogger;
  private readonly mode: ExecutionMode;
  private readonly defaultTimeout: number;
  private readonly defaultTTL: number;

  // Security constraints (CWE prevention)
  private readonly securityLimits = {
    maxTaskIdLength: 256,
    maxAgentIdLength: 256,
    maxContextSize: 1024 * 1024, // 1MB
    maxConfidenceLength: 10,
    timeoutMin: 1,
    timeoutMax: 3600,
    maxIterations: 100,
  };


  // Redis key prefixes
  private readonly keyPrefixes = {
    task: 'cfn_docker:task',
    agent: 'cfn_docker:agent',
    confidence: 'cfn_docker:task',
    consensus: 'cfn_docker:task',
  };

  constructor(
    config: CoordinatorConfig,
    logger: ILogger,
    redisClient?: IRedisClient
  ) {
    this.config = config;
    this.logger = logger;
    this.mode = config.mode || 'standard';
    this.defaultTimeout = config.defaultTimeout || 30;
    this.defaultTTL = config.defaultTTL || 3600;

    // Validate configuration
    if (!isValidTaskId(config.taskId)) {
      throw new ValidationError('Invalid task ID format', {
        taskId: config.taskId,
      });
    }

    // Initialize Redis client
    if (redisClient) {
      this.redisClient = redisClient;
    } else {
      this.redisClient = this.createRedisClient(config.redis);
    }
  }

  /**
   * Create and configure Redis client
   */
  private createRedisClient(config: RedisConfig): IRedisClient {
    const options: Record<string, unknown> = {
      host: config.host,
      port: config.port,
      db: config.db,
      connectTimeout: config.timeout || 5000,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
    };

    if (config.password) {
      options.password = config.password;
    }

    if (config.retryStrategy) {
      options.retryStrategy = config.retryStrategy;
    }

    try {
      const client = new Redis(options);
      return this.wrapRedisClient(client);
    } catch (error) {
      throw new RedisConnectionError(
        `Failed to create Redis client: ${error instanceof Error ? error.message : String(error)}`,
        { config }
      );
    }
  }

  /**
   * Wrap ioredis Redis client to match IRedisClient interface
   */
  private wrapRedisClient(client: Redis): IRedisClient {
    return {
      exists: async (key: string): Promise<boolean> => {
        const result = await (client.exists(key) as unknown as Promise<number>);
        return result > 0;
      },
      del: (key: string) => client.del(key) as unknown as Promise<number>,
      keys: (pattern: string) => client.keys(pattern) as unknown as Promise<string[]>,
      dbsize: () => client.dbsize() as unknown as Promise<number>,
      flushdb: () => client.flushdb() as unknown as Promise<string>,
      get: (key: string) => client.get(key) as unknown as Promise<string | null>,
      set: (key: string, value: string) => client.set(key, value) as unknown as Promise<string>,
      setex: (key: string, seconds: number, value: string) =>
        client.setex(key, seconds, value) as unknown as Promise<string>,
      hget: (key: string, field: string) =>
        client.hget(key, field) as unknown as Promise<string | null>,
      hset: async (key: string, fields: Record<string, string | number | boolean>) => {
        const flatArgs: (string | number)[] = [];
        for (const [field, value] of Object.entries(fields)) {
          flatArgs.push(field, String(value));
        }
        const result = await (client.hset(key, ...flatArgs) as unknown as Promise<number>);
        return result;
      },
      hmset: async (
        key: string,
        fields: Record<string, string | number | boolean>
      ) => {
        const flatArgs: (string | number)[] = [];
        for (const [field, value] of Object.entries(fields)) {
          flatArgs.push(field, String(value));
        }
        const result = await (client.hmset(key, ...flatArgs) as unknown as Promise<string>);
        return result;
      },
      hgetall: (key: string) =>
        client.hgetall(key) as unknown as Promise<Record<string, string>>,
      hkeys: (key: string) => client.hkeys(key) as unknown as Promise<string[]>,
      hvals: (key: string) => client.hvals(key) as unknown as Promise<string[]>,
      lpush: async (key: string, values: string[]) => {
        const result = await (client.lpush(key, ...values) as unknown as Promise<number>);
        return result;
      },
      rpush: async (key: string, values: string[]) => {
        const result = await (client.rpush(key, ...values) as unknown as Promise<number>);
        return result;
      },
      blpop: (keys: string[], timeout: number) =>
        client.blpop(...keys, timeout) as unknown as Promise<[string, string] | null>,
      lrange: (key: string, start: number, stop: number) =>
        client.lrange(key, start, stop) as unknown as Promise<string[]>,
      sadd: async (key: string, members: string[]) => {
        const result = await (client.sadd(key, ...members) as unknown as Promise<number>);
        return result;
      },
      smembers: (key: string) => client.smembers(key) as unknown as Promise<string[]>,
      scard: (key: string) => client.scard(key) as unknown as Promise<number>,
      expire: (key: string, seconds: number) =>
        client.expire(key, seconds) as unknown as Promise<number>,
      pexpire: (key: string, milliseconds: number) =>
        client.pexpire(key, milliseconds) as unknown as Promise<number>,
      ttl: (key: string) => client.ttl(key) as unknown as Promise<number>,
      ping: () => client.ping() as unknown as Promise<string>,
      info: (section?: string) => {
        if (section) {
          return (client.info(section) as unknown) as Promise<string>;
        }
        return (client.info() as unknown) as Promise<string>;
      },
      quit: async () => {
        await (client.quit() as unknown as Promise<void>);
      },
    };
  }

  /**
   * Initialize task coordination
   */
  async initTask(contextFile?: TaskContext): Promise<void> {
    try {
      const taskId = this.config.taskId;
      const now = new Date().toISOString();

      // Store task metadata
      await this.redisClient.hset(
        `${this.keyPrefixes.task}:${taskId}:meta`,
        {
          created_at: now,
          ttl: String(this.defaultTTL),
          created_by: 'cfn-docker-redis-coordination',
          mode: this.mode,
        }
      );

      // Set TTL on metadata
      await this.redisClient.expire(
        `${this.keyPrefixes.task}:${taskId}:meta`,
        this.defaultTTL
      );

      // Store context if provided
      if (contextFile && Object.keys(contextFile).length > 0) {
        const contextKey = `${this.keyPrefixes.task}:${taskId}:context`;
        const contextData: Record<string, string> = {};

        for (const [key, value] of Object.entries(contextFile)) {
          // Security: validate context size
          const stringValue = String(value);
          if (stringValue.length > this.securityLimits.maxContextSize) {
            throw new SecurityError(`Context value too large for key: ${key}`);
          }
          contextData[key] = stringValue;
        }

        await this.redisClient.hset(contextKey, contextData);
        await this.redisClient.expire(contextKey, this.defaultTTL);
      }

      this.logger.log(`Task coordination initialized: ${taskId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize task: ${message}`);
      throw error;
    }
  }

  /**
   * Store or update task context
   */
  async storeContext(context: TaskContext): Promise<void> {
    try {
      const taskId = this.config.taskId;
      const contextKey = `${this.keyPrefixes.task}:${taskId}:context`;

      const contextData: Record<string, string> = {};
      for (const [key, value] of Object.entries(context)) {
        const stringValue = String(value);
        if (stringValue.length > this.securityLimits.maxContextSize) {
          throw new SecurityError(`Context value too large for key: ${key}`);
        }
        contextData[key] = stringValue;
      }

      await this.redisClient.hset(contextKey, contextData);
      await this.redisClient.expire(contextKey, this.defaultTTL);

      this.logger.log(`Context stored for task: ${taskId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to store context: ${message}`);
      throw error;
    }
  }

  /**
   * Get task context
   */
  async getContext(): Promise<TaskContext> {
    try {
      const taskId = this.config.taskId;
      const contextKey = `${this.keyPrefixes.task}:${taskId}:context`;

      const exists = await this.redisClient.exists(contextKey);
      if (!exists) {
        throw new ValidationError(`No context found for task: ${taskId}`);
      }

      const context = await this.redisClient.hgetall(contextKey);
      this.logger.log(`Context retrieved for task: ${taskId}`);
      return context;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get context: ${message}`);
      throw error;
    }
  }

  /**
   * Register new agent
   */
  async registerAgent(
    agentId: string,
    agentType: string,
    containerId?: string
  ): Promise<void> {
    try {
      // Validate inputs
      if (!isValidAgentId(agentId)) {
        throw new ValidationError('Invalid agent ID format', { agentId });
      }

      const now = new Date().toISOString();
      const agentKey = `${this.keyPrefixes.agent}:${agentId}`;

      // Store agent information
      await this.redisClient.hset(agentKey, {
        agent_id: agentId,
        agent_type: agentType,
        container_id: containerId || '',
        task_id: this.config.taskId,
        status: 'spawning',
        iteration: '1',
        created_at: now,
      });

      // Add to status history
      await this.redisClient.lpush(
        `${this.keyPrefixes.agent}:${agentId}:status_history`,
        [JSON.stringify({ status: 'spawning', timestamp: now })]
      );

      // Set TTL
      await this.redisClient.expire(agentKey, this.defaultTTL);
      await this.redisClient.expire(
        `${this.keyPrefixes.agent}:${agentId}:status_history`,
        this.defaultTTL
      );

      this.logger.log(`Agent registered: ${agentId} (type: ${agentType})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to register agent: ${message}`);
      throw error;
    }
  }

  /**
   * Update agent status
   */
  async updateStatus(
    agentId: string,
    status: AgentStatus,
    iteration: number = 1
  ): Promise<void> {
    try {
      // Validate inputs
      if (!isValidAgentId(agentId)) {
        throw new ValidationError('Invalid agent ID format', { agentId });
      }

      if (!['spawning', 'running', 'working', 'completed', 'failed', 'timeout'].includes(status)) {
        throw new ValidationError(`Invalid agent status: ${status}`);
      }

      const now = new Date().toISOString();
      const agentKey = `${this.keyPrefixes.agent}:${agentId}`;

      // Update agent status
      await this.redisClient.hset(agentKey, {
        status,
        iteration: String(iteration),
        updated_at: now,
      });

      // Add to status history
      await this.redisClient.lpush(
        `${this.keyPrefixes.agent}:${agentId}:status_history`,
        [JSON.stringify({ status, timestamp: now })]
      );

      this.logger.log(`Status updated for agent ${agentId}: ${status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to update status: ${message}`);
      throw error;
    }
  }

  /**
   * Signal agent completion with confidence score
   */
  async signalComplete(
    agentId: string,
    confidence: number,
    iteration: number = 1
  ): Promise<void> {
    try {
      // Validate inputs
      if (!isValidAgentId(agentId)) {
        throw new ValidationError('Invalid agent ID format', { agentId });
      }

      if (!isValidConfidence(confidence)) {
        throw new ValidationError('Confidence must be between 0.0 and 1.0', {
          confidence,
        });
      }

      const taskId = this.config.taskId;
      const now = new Date().toISOString();
      const agentKey = `${this.keyPrefixes.agent}:${agentId}`;

      // Signal completion via list
      const statusKey = `${this.keyPrefixes.task}:${taskId}:agent:${agentId}:done`;
      await this.redisClient.lpush(statusKey, ['complete']);
      await this.redisClient.expire(statusKey, this.defaultTTL);

      // Get agent type
      const agentType =
        (await this.redisClient.hget(agentKey, 'agent_type')) || 'unknown';

      // Store confidence result
      const confidenceKey = `${this.keyPrefixes.confidence}:${taskId}:confidence:${agentId}`;
      await this.redisClient.hset(confidenceKey, {
        confidence: String(confidence),
        iteration: String(iteration),
        reported_at: now,
        agent_type: agentType,
      });
      await this.redisClient.expire(confidenceKey, this.defaultTTL);

      // Update agent status
      await this.updateStatus(agentId, 'completed', iteration);

      this.logger.log(
        `Agent ${agentId} completion signaled with confidence: ${confidence}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to signal completion: ${message}`);
      throw error;
    }
  }

  /**
   * Wait for loop completion (all agents)
   */
  async waitLoop(params: WaitLoopParams): Promise<WaitLoopResult> {
    const startTime = Date.now();
    // Hoist progress tracking outside try block so it's available in catch
    let completedAgents = 0;

    try {
      const {
        taskId,
        loopNumber,
        agentCount,
        timeout = this.defaultTimeout,
        verbose = false,
      } = params;

      // Validate inputs
      if (!isValidTaskId(taskId)) {
        throw new ValidationError('Invalid task ID format', { taskId });
      }

      if (loopNumber < 1 || loopNumber > 4) {
        throw new ValidationError('Loop number must be between 1 and 4', {
          loopNumber,
        });
      }

      if (agentCount < 1) {
        throw new ValidationError('Agent count must be >= 1', { agentCount });
      }

      if (timeout < this.securityLimits.timeoutMin ||
          timeout > this.securityLimits.timeoutMax) {
        throw new ValidationError(
          `Timeout must be between ${this.securityLimits.timeoutMin} and ${this.securityLimits.timeoutMax}`,
          { timeout }
        );
      }

      this.logger.log(
        `Waiting for Loop ${loopNumber} completion (${agentCount} agents, timeout: ${timeout}s)`
      );

      const endTime = startTime + timeout * 1000;

      while (Date.now() < endTime) {
        completedAgents = 0;

        // Get all completion status keys for this task
        const completionKeys = await this.redisClient.keys(
          `${this.keyPrefixes.task}:${taskId}:agent:*:done`
        );

        // Count unique agents that have completed
        const uniqueAgents = new Set<string>();
        for (const key of completionKeys) {
          // Extract agent ID from key like: cfn_docker:task:test-task-001:agent:agent-001:done
          const parts = key.split(':');
          if (parts.length >= 5) {
            const agentId = parts[4]; // agent-001
            uniqueAgents.add(agentId);
          }
        }

        completedAgents = uniqueAgents.size;

        if (completedAgents >= agentCount) {
          const executionTime = Date.now() - startTime;
          const message = `Loop ${loopNumber} completed (${completedAgents}/${agentCount} agents)`;
          this.logger.log(message);
          return {
            success: true,
            completedAgents,
            expectedAgents: agentCount,
            executionTime,
            message,
          };
        }

        if (verbose) {
          this.logger.log(
            `Progress: ${completedAgents}/${agentCount} agents completed`
          );
        }

        // Sleep 5 seconds before next check
        await this.sleep(5000);
      }

      throw new TimeoutError(
        `Loop ${loopNumber} timeout: only ${completedAgents}/${agentCount} agents completed`,
        { completedAgents, expectedAgents: agentCount, timeout }
      );
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Wait loop failed: ${message}`);

      if (error instanceof TimeoutError) {
        return {
          success: false,
          completedAgents, // Return last-known value instead of 0
          expectedAgents: params.agentCount,
          executionTime,
          message: error.message,
        };
      }

      throw error;
    }
  }

  /**
   * Collect consensus from validators
   */
  async collectConsensus(
    params: CollectConsensusParams
  ): Promise<CollectConsensusResult> {
    const startTime = Date.now();
    // Hoist progress tracking outside try block so it's available in catch
    let responsesReceived = 0;
    let totalConfidence = 0;
    let totalValidators = 0;

    try {
      const {
        taskId,
        loopNumber,
        requiredConsensus,
        timeout = this.defaultTimeout,
        verbose = false,
      } = params;

      // Validate inputs
      if (!isValidTaskId(taskId)) {
        throw new ValidationError('Invalid task ID format', { taskId });
      }

      if (loopNumber < 1 || loopNumber > 4) {
        throw new ValidationError('Loop number must be between 1 and 4', {
          loopNumber,
        });
      }

      if (!isValidConfidence(requiredConsensus)) {
        throw new ValidationError(
          'Required consensus must be between 0.0 and 1.0',
          { requiredConsensus }
        );
      }

      if (timeout < this.securityLimits.timeoutMin ||
          timeout > this.securityLimits.timeoutMax) {
        throw new ValidationError(
          `Timeout must be between ${this.securityLimits.timeoutMin} and ${this.securityLimits.timeoutMax}`,
          { timeout }
        );
      }

      this.logger.log(
        `Collecting Loop ${loopNumber} consensus (threshold: ${requiredConsensus})`
      );

      const endTime = startTime + timeout * 1000;

      while (Date.now() < endTime) {
        responsesReceived = 0;
        totalConfidence = 0;

        // Get all confidence keys for this task
        const confidenceKeys = await this.redisClient.keys(
          `${this.keyPrefixes.confidence}:${taskId}:confidence:*`
        );

        // Collect validator responses
        for (const confidenceKey of confidenceKeys) {
          const confidence = await this.redisClient.hget(
            confidenceKey,
            'confidence'
          );

          if (confidence !== null && confidence !== undefined) {
            const confidenceValue = parseFloat(confidence);
            if (!isNaN(confidenceValue) && isValidConfidence(confidenceValue)) {
              totalConfidence += confidenceValue;
              responsesReceived++;
            }
          }
        }

        if (responsesReceived > 0) {
          totalValidators = responsesReceived; // Update totalValidators
          const averageConfidence =
            totalConfidence / responsesReceived;

          if (verbose) {
            this.logger.log(
              `Responses: ${responsesReceived}, Average confidence: ${averageConfidence.toFixed(3)}`
            );
          }

          if (averageConfidence >= requiredConsensus) {
            // Determine decision based on confidence
            const decision =
              averageConfidence >= 0.95
                ? 'COMPLETE'
                : 'PROCEED';

            // Store consensus result
            const consensusKey = `${this.keyPrefixes.consensus}:${taskId}:loop:${loopNumber}:consensus`;
            await this.redisClient.hset(consensusKey, {
              total_validators: String(totalValidators),
              responses_received: String(responsesReceived),
              average_confidence: averageConfidence.toFixed(3),
              consensus_reached: 'true',
              decision,
              collected_at: new Date().toISOString(),
            });
            await this.redisClient.expire(consensusKey, this.defaultTTL);

            const executionTime = Date.now() - startTime;
            const message = `Consensus reached: ${averageConfidence.toFixed(3)} >= ${requiredConsensus}`;
            this.logger.log(message);

            return {
              success: true,
              totalValidators,
              responsesReceived,
              averageConfidence,
              consensusReached: true,
              decision,
              executionTime,
              message,
            };
          }
        }

        // Sleep 5 seconds before next check
        await this.sleep(5000);
      }

      throw new TimeoutError(
        `Consensus collection timeout: ${responsesReceived} responses, average: ${
          responsesReceived > 0 ? (totalConfidence / responsesReceived).toFixed(3) : 'N/A'
        }`,
        {
          responsesReceived,
          timeout,
          averageConfidence: responsesReceived > 0 ? totalConfidence / responsesReceived : 0,
        }
      );
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Consensus collection failed: ${message}`);

      if (error instanceof TimeoutError) {
        const averageConfidence = responsesReceived > 0 ? totalConfidence / responsesReceived : 0;
        return {
          success: false,
          totalValidators, // Return last-known value instead of 0
          responsesReceived, // Return last-known value instead of 0
          averageConfidence, // Return last-known value instead of 0
          consensusReached: false,
          decision: 'ABORT',
          executionTime,
          message: error.message,
        };
      }

      throw error;
    }
  }

  /**
   * Health check Redis connection
   */
  async healthCheck(): Promise<void> {
    try {
      // Test ping
      const pong = await this.redisClient.ping();
      if (pong !== 'PONG') {
        throw new Error('Redis ping failed');
      }

      // Get memory info
      const info = await this.redisClient.info('memory');
      if (info) {
        this.logger.log(`Redis health check passed`);
      }

      // Get key count
      const dbSize = await this.redisClient.dbsize();
      this.logger.log(`Total Redis keys: ${dbSize}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Redis health check failed: ${message}`);
      throw error;
    }
  }

  /**
   * Cleanup expired data
   */
  async cleanup(): Promise<void> {
    try {
      const taskId = this.config.taskId;

      // Delete task-related keys
      const taskKeys = await this.redisClient.keys(`${this.keyPrefixes.task}:${taskId}:*`);
      for (const key of taskKeys) {
        await this.redisClient.del(key);
      }

      this.logger.log(`Cleanup completed for task: ${taskId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cleanup failed: ${message}`);
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    try {
      await this.redisClient.quit();
      this.logger.log('Disconnected from Redis');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to disconnect: ${message}`);
      throw error;
    }
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export for use in other modules
export default RedisCoordinator;
