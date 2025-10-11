/**
 * Redis Pub/Sub Helper Functions for Coordinator Communication
 *
 * Provides standardized Redis pub/sub patterns for coordinator communication
 * as defined in COORDINATOR_COMMUNICATION_REQUIREMENTS.md
 *
 * Features:
 * - Sprint lifecycle event publishing
 * - Agent lifecycle tracking
 * - Interface signal publishing/subscription
 * - Claim/confirmation protocol
 * - Test coordination lock protocol
 * - Dependency waiting patterns
 *
 * @module cfn-loop/redis-pubsub-helpers
 */

import type { Redis } from 'ioredis';
import { Logger } from '../core/logger.js';
import type { LoggingConfig } from '../utils/types.js';

// ===== SECURITY ERROR CLASS =====

/**
 * Security error for pub/sub payload validation failures
 */
export class SecurityError extends Error {
  constructor(
    message: string,
    public details: {
      channel?: string;
      size?: number;
      limit?: number;
      pattern?: string;
      current?: number;
    }
  ) {
    super(message);
    this.name = 'SecurityError';
    Error.captureStackTrace(this, SecurityError);
  }
}

// ===== TYPE DEFINITIONS =====

/**
 * Sprint lifecycle event types
 */
export type SprintLifecycleEventType =
  | 'sprint:start'
  | 'sprint:complete'
  | 'sprint:failed';

/**
 * Agent lifecycle event types
 */
export type AgentLifecycleEventType =
  | 'agent:spawned'
  | 'agent:completed'
  | 'agent:failed';

/**
 * Interface event types
 */
export type InterfaceEventType = 'interface:published' | 'interface:consumed';

/**
 * Sprint lifecycle event
 */
export interface SprintLifecycleEvent {
  type: SprintLifecycleEventType;
  sprintId: string;
  coordinatorId: string;
  dependencies?: string[];
  consensus?: number;
  decision?: 'PROCEED' | 'DEFER' | 'ESCALATE';
  timestamp: number;
}

/**
 * Agent lifecycle event
 */
export interface AgentLifecycleEvent {
  type: AgentLifecycleEventType;
  agentId: string;
  coordinatorId: string;
  sprintId: string;
  role?: string;
  confidence?: number;
  deliverables?: string[];
  error?: string;
  timestamp: number;
}

/**
 * Interface signal event
 */
export interface InterfaceEvent {
  type: InterfaceEventType;
  sprintId: string;
  interfaceId: string;
  interface: {
    exports: string[];
    redisKeys?: string[];
    types?: any;
  };
  timestamp: number;
}

/**
 * Claim/confirmation event
 */
export interface ClaimEvent {
  coordinator: string;
  combo: string;
  action: 'claim' | 'confirmed' | 'conflict';
  timestamp: number;
}

/**
 * Redis pub/sub channels
 */
export const REDIS_CHANNELS = {
  SPRINT_COORDINATION: 'sprint:coordination',
  AGENT_LIFECYCLE: 'agent:lifecycle',
  INTERFACE_READY: 'interface:ready',
  COORDINATION_CLAIMS: 'coordination:claims:channel',
  TEST_COORDINATION: 'test:coordination',
  CONFLICT_DETECTED: 'conflict:detected',
} as const;

/**
 * Redis key prefixes
 */
export const REDIS_KEY_PREFIXES = {
  DEPENDENCY: 'cfn:dependency',
  TEST_LOCK: 'cfn:test:execution:lock',
  TEST_QUEUE: 'cfn:test:queue',
  SPRINT_STATE: 'cfn:sprint:state',
  INTERFACE: 'cfn:interface',
  CLAIM: 'coordination:claims:confirmed',
  CONFLICT_LOG: 'coordination:conflicts:log',
} as const;

// ===== REDIS PUB/SUB HELPER CLASS =====

/**
 * Redis Pub/Sub Helper for coordinator communication
 */
export class RedisPubSubHelper {
  private redis: Redis;
  private logger: Logger;
  private subscriptions: Map<string, Set<(message: string) => void>> = new Map();

  constructor(redis: Redis, loggerConfig?: LoggingConfig) {
    this.redis = redis;

    const config: LoggingConfig = loggerConfig || {
      level: process.env.CLAUDE_FLOW_ENV === 'test' ? 'error' : 'info',
      format: 'json',
      destination: 'console',
    };

    this.logger = new Logger(config, { component: 'RedisPubSubHelper' });
  }

  // ===== SPRINT LIFECYCLE EVENTS =====

  /**
   * Publish sprint start event
   */
  async publishSprintStart(
    sprintId: string,
    coordinatorId: string,
    dependencies: string[] = []
  ): Promise<void> {
    const event: SprintLifecycleEvent = {
      type: 'sprint:start',
      sprintId,
      coordinatorId,
      dependencies,
      timestamp: Date.now(),
    };

    await this.publishEvent(REDIS_CHANNELS.SPRINT_COORDINATION, event);

    this.logger.info('Sprint start event published', {
      sprintId,
      coordinatorId,
      dependencies,
    });
  }

  /**
   * Publish sprint complete event
   */
  async publishSprintComplete(
    sprintId: string,
    consensus: number,
    decision: 'PROCEED' | 'DEFER' | 'ESCALATE'
  ): Promise<void> {
    const event: SprintLifecycleEvent = {
      type: 'sprint:complete',
      sprintId,
      coordinatorId: sprintId, // Can be overridden
      consensus,
      decision,
      timestamp: Date.now(),
    };

    await this.publishEvent(REDIS_CHANNELS.SPRINT_COORDINATION, event);

    this.logger.info('Sprint complete event published', {
      sprintId,
      consensus,
      decision,
    });
  }

  /**
   * Publish sprint failed event
   */
  async publishSprintFailed(sprintId: string, error: string): Promise<void> {
    const event = {
      type: 'sprint:failed',
      sprintId,
      error,
      timestamp: Date.now(),
    };

    await this.publishEvent(REDIS_CHANNELS.SPRINT_COORDINATION, event);

    this.logger.error('Sprint failed event published', {
      sprintId,
      error,
    });
  }

  // ===== AGENT LIFECYCLE EVENTS =====

  /**
   * Publish agent spawned event
   */
  async publishAgentSpawned(
    agentId: string,
    coordinatorId: string,
    sprintId: string,
    role: string
  ): Promise<void> {
    const event: AgentLifecycleEvent = {
      type: 'agent:spawned',
      agentId,
      coordinatorId,
      sprintId,
      role,
      timestamp: Date.now(),
    };

    await this.publishEvent(REDIS_CHANNELS.AGENT_LIFECYCLE, event);

    this.logger.debug('Agent spawned event published', {
      agentId,
      coordinatorId,
      sprintId,
      role,
    });
  }

  /**
   * Publish agent completed event
   */
  async publishAgentCompleted(
    agentId: string,
    confidence: number,
    deliverables: string[]
  ): Promise<void> {
    const event = {
      type: 'agent:completed',
      agentId,
      confidence,
      deliverables,
      timestamp: Date.now(),
    };

    await this.publishEvent(REDIS_CHANNELS.AGENT_LIFECYCLE, event);

    this.logger.info('Agent completed event published', {
      agentId,
      confidence,
      deliverables,
    });
  }

  /**
   * Publish agent failed event
   */
  async publishAgentFailed(agentId: string, error: string): Promise<void> {
    const event = {
      type: 'agent:failed',
      agentId,
      error,
      timestamp: Date.now(),
    };

    await this.publishEvent(REDIS_CHANNELS.AGENT_LIFECYCLE, event);

    this.logger.error('Agent failed event published', {
      agentId,
      error,
    });
  }

  // ===== INTERFACE EVENTS =====

  /**
   * Publish interface ready event
   */
  async publishInterfaceReady(
    sprintId: string,
    interfaceId: string,
    interfaceDefinition: { exports: string[]; redisKeys?: string[]; types?: any }
  ): Promise<void> {
    const event: InterfaceEvent = {
      type: 'interface:published',
      sprintId,
      interfaceId,
      interface: interfaceDefinition,
      timestamp: Date.now(),
    };

    // Publish to both channels for compatibility
    await this.publishEvent(REDIS_CHANNELS.SPRINT_COORDINATION, event);
    await this.publishEvent(REDIS_CHANNELS.INTERFACE_READY, event);

    // Store interface in Redis for retrieval
    const key = `${REDIS_KEY_PREFIXES.INTERFACE}:${interfaceId}`;
    await this.redis.setex(key, 3600, JSON.stringify(interfaceDefinition));

    this.logger.info('Interface ready event published', {
      sprintId,
      interfaceId,
      exports: interfaceDefinition.exports,
    });
  }

  // ===== SUBSCRIPTION HELPERS =====

  /**
   * Subscribe to sprint coordination events
   */
  async subscribeToSprintCoordination(
    handler: (event: SprintLifecycleEvent) => void | Promise<void>
  ): Promise<void> {
    await this.subscribe(REDIS_CHANNELS.SPRINT_COORDINATION, async (message) => {
      try {
        const event = JSON.parse(message) as SprintLifecycleEvent;
        await handler(event);
      } catch (error) {
        this.logger.error('Error handling sprint coordination event', {
          error: error instanceof Error ? error.message : String(error),
          message,
        });
      }
    });

    this.logger.info('Subscribed to sprint coordination channel');
  }

  /**
   * Subscribe to agent lifecycle events
   */
  async subscribeToAgentLifecycle(
    handler: (event: AgentLifecycleEvent) => void | Promise<void>
  ): Promise<void> {
    await this.subscribe(REDIS_CHANNELS.AGENT_LIFECYCLE, async (message) => {
      try {
        const event = JSON.parse(message) as AgentLifecycleEvent;
        await handler(event);
      } catch (error) {
        this.logger.error('Error handling agent lifecycle event', {
          error: error instanceof Error ? error.message : String(error),
          message,
        });
      }
    });

    this.logger.info('Subscribed to agent lifecycle channel');
  }

  /**
   * Subscribe to interface ready events
   */
  async subscribeToInterfaceReady(
    handler: (event: InterfaceEvent) => void | Promise<void>
  ): Promise<void> {
    await this.subscribe(REDIS_CHANNELS.INTERFACE_READY, async (message) => {
      try {
        const event = JSON.parse(message) as InterfaceEvent;
        await handler(event);
      } catch (error) {
        this.logger.error('Error handling interface ready event', {
          error: error instanceof Error ? error.message : String(error),
          message,
        });
      }
    });

    this.logger.info('Subscribed to interface ready channel');
  }

  // ===== DEPENDENCY WAITING PATTERN =====

  /**
   * Wait for dependencies with timeout
   *
   * Returns immediately when all dependencies are satisfied or throws on timeout.
   *
   * @param dependencies - Array of sprint IDs to wait for
   * @param timeoutMs - Timeout in milliseconds (default: 300000 = 5 minutes)
   * @returns Promise that resolves when all dependencies are satisfied
   */
  async waitForDependencies(
    dependencies: string[],
    timeoutMs: number = 300000
  ): Promise<void> {
    if (dependencies.length === 0) {
      return;
    }

    this.logger.info('Waiting for dependencies', {
      dependencies,
      timeout: timeoutMs,
    });

    const unsatisfied = new Set(dependencies);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Dependency timeout: waiting for ${Array.from(unsatisfied).join(', ')}`
          )
        );
      }, timeoutMs);

      // Subscribe to sprint coordination events
      this.subscribeToSprintCoordination(async (event) => {
        if (
          event.type === 'interface:published' &&
          unsatisfied.has(event.sprintId)
        ) {
          unsatisfied.delete(event.sprintId);

          this.logger.info('Dependency satisfied', {
            sprintId: event.sprintId,
            remaining: Array.from(unsatisfied),
          });

          if (unsatisfied.size === 0) {
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      // Check for already-published interfaces
      this.checkExistingInterfaces(dependencies).then((satisfied) => {
        for (const dep of satisfied) {
          unsatisfied.delete(dep);
        }

        if (unsatisfied.size === 0) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  }

  /**
   * Check for existing interfaces in Redis
   */
  private async checkExistingInterfaces(
    interfaceIds: string[]
  ): Promise<string[]> {
    const satisfied: string[] = [];

    for (const interfaceId of interfaceIds) {
      const key = `${REDIS_KEY_PREFIXES.INTERFACE}:${interfaceId}`;
      const exists = await this.redis.exists(key);

      if (exists) {
        satisfied.push(interfaceId);
        this.logger.debug('Interface already exists', { interfaceId });
      }
    }

    return satisfied;
  }

  // ===== TEST COORDINATION LOCK =====

  /**
   * Acquire test execution lock
   *
   * @param coordinatorId - Coordinator requesting the lock
   * @param ttlMs - Lock TTL in milliseconds (default: 900000 = 15 minutes)
   * @returns True if lock acquired, false otherwise
   */
  async acquireTestLock(
    coordinatorId: string,
    ttlMs: number = 900000
  ): Promise<boolean> {
    const lockData = JSON.stringify({
      coordinatorId,
      timestamp: Date.now(),
      pid: process.pid,
    });

    const acquired = await this.redis.set(
      REDIS_KEY_PREFIXES.TEST_LOCK,
      lockData,
      'NX',
      'PX',
      ttlMs
    );

    if (acquired) {
      this.logger.info('Test lock acquired', {
        coordinatorId,
        ttl: ttlMs,
      });
      return true;
    }

    this.logger.debug('Test lock already held', { coordinatorId });
    return false;
  }

  /**
   * Release test execution lock
   */
  async releaseTestLock(): Promise<void> {
    await this.redis.del(REDIS_KEY_PREFIXES.TEST_LOCK);
    this.logger.info('Test lock released');
  }

  /**
   * Join test execution queue
   *
   * @param coordinatorId - Coordinator joining the queue
   * @returns Queue position (0-based)
   */
  async joinTestQueue(coordinatorId: string): Promise<number> {
    const score = Date.now();
    await this.redis.zadd(REDIS_KEY_PREFIXES.TEST_QUEUE, score, coordinatorId);

    // Get position in queue
    const rank = await this.redis.zrank(REDIS_KEY_PREFIXES.TEST_QUEUE, coordinatorId);

    this.logger.info('Joined test queue', {
      coordinatorId,
      position: rank || 0,
    });

    return rank || 0;
  }

  // ===== LOW-LEVEL PUB/SUB =====

  /**
   * Publish event to Redis channel with P0 security validation
   *
   * Security validations (HIGH severity P0 requirements):
   * 1. Payload size validation (max 1MB)
   * 2. Script injection pattern detection
   * 3. Rate limiting (100 events/sec per channel)
   * 4. Security event logging
   */
  private async publishEvent(channel: string, event: any): Promise<void> {
    const message = JSON.stringify(event);
    const now = Date.now();

    // 1. PAYLOAD SIZE VALIDATION (max 1MB = 1048576 bytes)
    if (message.length > 1048576) {
      this.logger.error('Pub/sub payload exceeds 1MB limit', {
        channel,
        size: message.length,
        limit: 1048576,
      });

      throw new SecurityError('Pub/sub payload exceeds 1MB limit', {
        channel,
        size: message.length,
        limit: 1048576,
      });
    }

    // 2. SCRIPT INJECTION DETECTION (defense-in-depth)
    const maliciousPatterns =
      /<script|javascript:|onerror=|onclick=|onload=|data:text\/html|eval\(|Function\(/i;

    if (maliciousPatterns.test(message)) {
      this.logger.error('Potentially malicious content detected in pub/sub payload', {
        channel,
        pattern: 'script_injection_attempt',
      });

      throw new SecurityError('Potentially malicious content detected', {
        channel,
        pattern: 'script_injection_attempt',
      });
    }

    // 3. RATE LIMITING (100 events/sec per channel)
    const rateLimitKey = `ratelimit:pubsub:${channel}`;
    const count = await this.redis.incr(rateLimitKey);

    // Set expiry on first increment
    if (count === 1) {
      await this.redis.expire(rateLimitKey, 1); // 1 second window
    }

    if (count > 100) {
      this.logger.error('Rate limit exceeded for pub/sub channel', {
        channel,
        limit: 100,
        current: count,
        window: '1s',
      });

      throw new SecurityError('Rate limit exceeded for channel', {
        channel,
        limit: 100,
        current: count,
      });
    }

    // 4. PUBLISH WITH SECURITY EVENT LOGGING
    await this.redis.publish(channel, message);

    this.logger.debug('Event published with validation', {
      channel,
      eventType: event.type,
      size: message.length,
      rateLimit: count,
      timestamp: now,
    });
  }

  /**
   * Subscribe to Redis channel
   */
  private async subscribe(
    channel: string,
    handler: (message: string) => void | Promise<void>
  ): Promise<void> {
    // Store handler
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(handler);

    // Note: In production, this would use a dedicated subscriber Redis client
    // For now, this is a simplified implementation
    this.logger.debug('Subscribed to channel', { channel });
  }

  /**
   * Unsubscribe from all channels
   */
  async unsubscribeAll(): Promise<void> {
    this.subscriptions.clear();
    this.logger.info('Unsubscribed from all channels');
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create Redis Pub/Sub Helper instance
 */
export function createRedisPubSubHelper(
  redis: Redis,
  loggerConfig?: LoggingConfig
): RedisPubSubHelper {
  return new RedisPubSubHelper(redis, loggerConfig);
}

// ===== EXPORTS =====

export default RedisPubSubHelper;
