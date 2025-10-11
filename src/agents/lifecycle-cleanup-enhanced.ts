/**
 * Enhanced Lifecycle Cleanup Manager
 * Sprint 3.1: Memory Leak Prevention - Enhanced Lifecycle Cleanup
 *
 * Features:
 * - Redis-synchronized cleanup for cross-process coordination
 * - Orphan detection (agents idle >2min)
 * - Force cleanup with distributed lock acquisition
 * - Memory leak detection and monitoring
 * - Automatic cleanup of stale agent state
 *
 * Epic: memory-leak-prevention
 * Sprint: 3.1 - Enhanced Lifecycle Cleanup
 *
 * @module agents/lifecycle-cleanup-enhanced
 */

import { EventEmitter } from 'events';
import type { Redis } from 'ioredis';
import { Logger } from '../core/logger.js';
import type { LoggingConfig } from '../utils/types.js';
import type { AgentLifecycleContext, AgentLifecycleState } from './lifecycle-manager.js';

// ===== TYPE DEFINITIONS =====

/**
 * Orphan detection configuration
 */
export interface OrphanDetectionConfig {
  /** Idle threshold in milliseconds (default: 120000 = 2 minutes) */
  idleThreshold: number;
  /** Check interval in milliseconds (default: 30000 = 30 seconds) */
  checkInterval: number;
  /** Enable automatic cleanup of detected orphans */
  autoCleanup: boolean;
}

/**
 * Cleanup lock configuration
 */
export interface CleanupLockConfig {
  /** Lock timeout in seconds (default: 30) */
  lockTimeout: number;
  /** Lock retry attempts (default: 3) */
  retryAttempts: number;
  /** Retry delay in milliseconds (default: 1000) */
  retryDelay: number;
}

/**
 * Enhanced lifecycle cleanup configuration
 */
export interface EnhancedLifecycleCleanupConfig {
  /** Redis client instance */
  redisClient: Redis;
  /** Redis key prefix for cleanup coordination */
  redisKeyPrefix?: string;
  /** Orphan detection configuration */
  orphanDetection: OrphanDetectionConfig;
  /** Cleanup lock configuration */
  cleanupLock?: CleanupLockConfig;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Orphan agent information
 */
export interface OrphanAgent {
  agentId: string;
  agentName: string;
  agentType: string;
  state: AgentLifecycleState;
  lastActivity: Date;
  idleDuration: number; // milliseconds
  swarmId?: string;
  taskId?: string;
  reason: string;
}

/**
 * Cleanup result
 */
export interface CleanupResult {
  success: boolean;
  agentId: string;
  cleanupTime: number; // milliseconds
  redisKeysRemoved: number;
  memoryFreed: number; // bytes estimate
  error?: Error;
}

/**
 * Memory leak metrics
 */
export interface MemoryLeakMetrics {
  totalAgents: number;
  activeAgents: number;
  orphanedAgents: number;
  zombieAgents: number; // Agents in error/stopped state but not cleaned up
  averageIdleTime: number; // milliseconds
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  redisKeys: {
    total: number;
    stale: number;
  };
}

// ===== ENHANCED LIFECYCLE CLEANUP MANAGER =====

/**
 * Enhanced lifecycle cleanup manager with Redis coordination
 */
export class EnhancedLifecycleCleanupManager extends EventEmitter {
  private redis: Redis;
  private redisKeyPrefix: string;
  private orphanDetectionConfig: OrphanDetectionConfig;
  private cleanupLockConfig: CleanupLockConfig;
  private logger: Logger;
  private debug: boolean;

  // Monitoring state
  private orphanCheckInterval?: NodeJS.Timeout;
  private isMonitoring: boolean = false;

  // Metrics
  private metrics = {
    orphansDetected: 0,
    orphansCleaned: 0,
    forceCleanupsExecuted: 0,
    cleanupFailures: 0,
    redisKeysRemoved: 0,
    memoryFreed: 0, // bytes estimate
    lastOrphanCheckTime: 0,
  };

  constructor(config: EnhancedLifecycleCleanupConfig) {
    super();

    this.redis = config.redisClient;
    this.redisKeyPrefix = config.redisKeyPrefix || 'lifecycle:cleanup';
    this.orphanDetectionConfig = config.orphanDetection;
    this.cleanupLockConfig = config.cleanupLock || {
      lockTimeout: 30,
      retryAttempts: 3,
      retryDelay: 1000,
    };
    this.debug = config.debug || false;

    // Initialize logger
    const loggingConfig: LoggingConfig = {
      level: this.debug ? 'debug' : 'info',
      format: 'json',
      outputDir: './logs',
    };
    this.logger = new Logger('lifecycle-cleanup-enhanced', loggingConfig);

    this.logger.info('Enhanced lifecycle cleanup manager initialized', {
      redisKeyPrefix: this.redisKeyPrefix,
      idleThreshold: this.orphanDetectionConfig.idleThreshold,
      checkInterval: this.orphanDetectionConfig.checkInterval,
    });
  }

  /**
   * Start orphan detection monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      this.logger.warn('Orphan detection monitoring already running');
      return;
    }

    this.logger.info('Starting orphan detection monitoring', {
      checkInterval: this.orphanDetectionConfig.checkInterval,
    });

    this.orphanCheckInterval = setInterval(
      () => this.detectAndCleanupOrphans(),
      this.orphanDetectionConfig.checkInterval
    );

    this.isMonitoring = true;
    this.emit('monitoring:started');
  }

  /**
   * Stop orphan detection monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.logger.info('Stopping orphan detection monitoring');

    if (this.orphanCheckInterval) {
      clearInterval(this.orphanCheckInterval);
      this.orphanCheckInterval = undefined;
    }

    this.isMonitoring = false;
    this.emit('monitoring:stopped');
  }

  /**
   * Detect orphaned agents
   */
  async detectOrphans(agents: AgentLifecycleContext[]): Promise<OrphanAgent[]> {
    const now = Date.now();
    const orphans: OrphanAgent[] = [];

    for (const agent of agents) {
      const idleDuration = agent.lastActivity
        ? now - agent.lastActivity.getTime()
        : now - (agent.startTime?.getTime() || now);

      // Check if agent is orphaned (idle beyond threshold)
      if (idleDuration > this.orphanDetectionConfig.idleThreshold) {
        const isOrphan = await this.isAgentOrphaned(agent, idleDuration);

        if (isOrphan) {
          orphans.push({
            agentId: agent.agentId,
            agentName: agent.agentDefinition.name,
            agentType: agent.agentDefinition.role || 'unknown',
            state: agent.state,
            lastActivity: agent.lastActivity || agent.startTime || new Date(),
            idleDuration,
            swarmId: process.env.SWARM_ID,
            taskId: agent.taskId,
            reason: this.getOrphanReason(agent, idleDuration),
          });
        }
      }
    }

    if (orphans.length > 0) {
      this.logger.warn('Detected orphaned agents', {
        count: orphans.length,
        orphans: orphans.map((o) => ({
          agentId: o.agentId,
          idleDuration: Math.round(o.idleDuration / 1000) + 's',
          reason: o.reason,
        })),
      });

      this.metrics.orphansDetected += orphans.length;
      this.emit('orphans:detected', { orphans, count: orphans.length });
    }

    return orphans;
  }

  /**
   * Check if agent is truly orphaned (cross-check with Redis)
   */
  private async isAgentOrphaned(
    agent: AgentLifecycleContext,
    idleDuration: number
  ): Promise<boolean> {
    try {
      // Check Redis for recent activity
      const heartbeatKey = `${this.redisKeyPrefix}:heartbeat:${agent.agentId}`;
      const lastHeartbeat = await this.redis.get(heartbeatKey);

      if (lastHeartbeat) {
        const heartbeatTime = parseInt(lastHeartbeat, 10);
        const timeSinceHeartbeat = Date.now() - heartbeatTime;

        // If recent heartbeat exists, not an orphan
        if (timeSinceHeartbeat < this.orphanDetectionConfig.idleThreshold) {
          return false;
        }
      }

      // Check if agent is in terminal state without cleanup
      const isTerminalState = ['stopped', 'error', 'cleanup'].includes(agent.state);
      const isStuckInTerminalState =
        isTerminalState && idleDuration > this.orphanDetectionConfig.idleThreshold;

      // Agent is orphaned if:
      // 1. No recent heartbeat AND idle beyond threshold
      // 2. Stuck in terminal state without cleanup
      return !lastHeartbeat || isStuckInTerminalState;
    } catch (error) {
      this.logger.error('Error checking agent orphan status', {
        agentId: agent.agentId,
        error,
      });
      return false; // Conservative: don't mark as orphan on error
    }
  }

  /**
   * Get reason for orphan classification
   */
  private getOrphanReason(agent: AgentLifecycleContext, idleDuration: number): string {
    const idleMinutes = Math.round(idleDuration / 60000);

    if (agent.state === 'error') {
      return `Error state for ${idleMinutes} minutes without cleanup`;
    } else if (agent.state === 'stopped') {
      return `Stopped state for ${idleMinutes} minutes without cleanup`;
    } else if (agent.state === 'cleanup') {
      return `Stuck in cleanup state for ${idleMinutes} minutes`;
    } else {
      return `No activity for ${idleMinutes} minutes in ${agent.state} state`;
    }
  }

  /**
   * Detect and cleanup orphans (automatic monitoring cycle)
   */
  private async detectAndCleanupOrphans(): Promise<void> {
    this.metrics.lastOrphanCheckTime = Date.now();

    try {
      // Get all agents from Redis coordination
      const agentKeys = await this.redis.keys(`${this.redisKeyPrefix}:agent:*`);

      const agents: AgentLifecycleContext[] = [];
      for (const key of agentKeys) {
        const agentDataStr = await this.redis.get(key);
        if (agentDataStr) {
          try {
            const agentData = JSON.parse(agentDataStr);
            agents.push(agentData);
          } catch (parseError) {
            this.logger.warn('Failed to parse agent data from Redis', { key, parseError });
          }
        }
      }

      // Detect orphans
      const orphans = await this.detectOrphans(agents);

      // Auto-cleanup if enabled
      if (this.orphanDetectionConfig.autoCleanup && orphans.length > 0) {
        this.logger.info('Auto-cleanup enabled, cleaning orphaned agents', {
          count: orphans.length,
        });

        for (const orphan of orphans) {
          try {
            await this.forceCleanupAgent(orphan.agentId, `Auto-cleanup: ${orphan.reason}`);
          } catch (cleanupError) {
            this.logger.error('Failed to auto-cleanup orphaned agent', {
              agentId: orphan.agentId,
              error: cleanupError,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Error in orphan detection cycle', { error });
      this.emit('error', error);
    }
  }

  /**
   * Force cleanup agent with distributed lock
   */
  async forceCleanupAgent(agentId: string, reason: string): Promise<CleanupResult> {
    const startTime = Date.now();
    const lockKey = `${this.redisKeyPrefix}:lock:${agentId}`;

    this.logger.info('Starting force cleanup', { agentId, reason });

    try {
      // Acquire distributed lock
      const lockAcquired = await this.acquireCleanupLock(lockKey, agentId);

      if (!lockAcquired) {
        throw new Error('Failed to acquire cleanup lock');
      }

      // Execute cleanup with lock held
      const result = await this.executeCleanup(agentId, reason);

      // Release lock
      await this.releaseCleanupLock(lockKey);

      this.metrics.forceCleanupsExecuted++;
      this.metrics.orphansCleaned++;
      this.metrics.redisKeysRemoved += result.redisKeysRemoved;
      this.metrics.memoryFreed += result.memoryFreed;

      this.logger.info('Force cleanup completed successfully', {
        agentId,
        duration: result.cleanupTime,
        redisKeysRemoved: result.redisKeysRemoved,
      });

      this.emit('cleanup:success', result);

      return result;
    } catch (error) {
      this.metrics.cleanupFailures++;

      const errorResult: CleanupResult = {
        success: false,
        agentId,
        cleanupTime: Date.now() - startTime,
        redisKeysRemoved: 0,
        memoryFreed: 0,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      this.logger.error('Force cleanup failed', {
        agentId,
        error,
      });

      this.emit('cleanup:failure', errorResult);

      // Ensure lock is released even on failure
      await this.releaseCleanupLock(lockKey).catch(() => {});

      return errorResult;
    }
  }

  /**
   * Acquire distributed cleanup lock
   */
  private async acquireCleanupLock(lockKey: string, agentId: string): Promise<boolean> {
    const lockValue = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    for (let attempt = 1; attempt <= this.cleanupLockConfig.retryAttempts; attempt++) {
      try {
        // Try to acquire lock with SET NX EX
        const acquired = await this.redis.set(
          lockKey,
          lockValue,
          'EX',
          this.cleanupLockConfig.lockTimeout,
          'NX'
        );

        if (acquired === 'OK') {
          this.logger.debug('Cleanup lock acquired', { lockKey, agentId, attempt });
          return true;
        }

        // Lock not acquired, check if stale
        const existingLock = await this.redis.get(lockKey);
        if (!existingLock) {
          // Lock was released between attempts, retry
          continue;
        }

        // Wait before retry
        if (attempt < this.cleanupLockConfig.retryAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.cleanupLockConfig.retryDelay)
          );
        }
      } catch (error) {
        this.logger.error('Error acquiring cleanup lock', {
          lockKey,
          agentId,
          attempt,
          error,
        });

        if (attempt === this.cleanupLockConfig.retryAttempts) {
          return false;
        }
      }
    }

    this.logger.warn('Failed to acquire cleanup lock after retries', {
      lockKey,
      agentId,
      attempts: this.cleanupLockConfig.retryAttempts,
    });

    return false;
  }

  /**
   * Release distributed cleanup lock
   */
  private async releaseCleanupLock(lockKey: string): Promise<void> {
    try {
      await this.redis.del(lockKey);
      this.logger.debug('Cleanup lock released', { lockKey });
    } catch (error) {
      this.logger.error('Error releasing cleanup lock', { lockKey, error });
    }
  }

  /**
   * Execute agent cleanup
   */
  private async executeCleanup(agentId: string, reason: string): Promise<CleanupResult> {
    const startTime = Date.now();
    let redisKeysRemoved = 0;

    try {
      // 1. Remove agent record
      const agentKey = `${this.redisKeyPrefix}:agent:${agentId}`;
      await this.redis.del(agentKey);
      redisKeysRemoved++;

      // 2. Remove heartbeat
      const heartbeatKey = `${this.redisKeyPrefix}:heartbeat:${agentId}`;
      await this.redis.del(heartbeatKey);
      redisKeysRemoved++;

      // 3. Remove memory entries
      const memoryKeys = await this.redis.keys(`memory:agent:${agentId}:*`);
      if (memoryKeys.length > 0) {
        await this.redis.del(...memoryKeys);
        redisKeysRemoved += memoryKeys.length;
      }

      // 4. Remove swarm coordination entries
      const swarmKeys = await this.redis.keys(`swarm:*:agent:${agentId}`);
      if (swarmKeys.length > 0) {
        await this.redis.del(...swarmKeys);
        redisKeysRemoved += swarmKeys.length;
      }

      // 5. Publish cleanup event
      await this.redis.publish(
        'lifecycle:cleanup',
        JSON.stringify({
          type: 'agent.cleaned',
          agentId,
          reason,
          timestamp: Date.now(),
          redisKeysRemoved,
        })
      );

      // Estimate memory freed (rough estimate: 1KB per Redis key)
      const memoryFreed = redisKeysRemoved * 1024;

      return {
        success: true,
        agentId,
        cleanupTime: Date.now() - startTime,
        redisKeysRemoved,
        memoryFreed,
      };
    } catch (error) {
      throw new Error(`Cleanup execution failed: ${error}`);
    }
  }

  /**
   * Get memory leak metrics
   */
  async getMemoryLeakMetrics(): Promise<MemoryLeakMetrics> {
    try {
      // Get all agent keys
      const agentKeys = await this.redis.keys(`${this.redisKeyPrefix}:agent:*`);

      const agents: AgentLifecycleContext[] = [];
      for (const key of agentKeys) {
        const agentDataStr = await this.redis.get(key);
        if (agentDataStr) {
          try {
            agents.push(JSON.parse(agentDataStr));
          } catch {
            // Skip malformed data
          }
        }
      }

      const now = Date.now();
      const activeAgents = agents.filter((a) => ['running', 'idle'].includes(a.state));
      const orphanedAgents = await this.detectOrphans(agents);
      const zombieAgents = agents.filter((a) =>
        ['stopped', 'error', 'cleanup'].includes(a.state)
      );

      const idleTimes = agents
        .map((a) =>
          a.lastActivity ? now - a.lastActivity.getTime() : now - (a.startTime?.getTime() || now)
        )
        .filter((t) => t > 0);

      const averageIdleTime =
        idleTimes.length > 0 ? idleTimes.reduce((sum, t) => sum + t, 0) / idleTimes.length : 0;

      // Get Redis key counts
      const allRedisKeys = await this.redis.keys('*');
      const staleKeys = await this.findStaleRedisKeys();

      // Get process memory usage
      const memUsage = process.memoryUsage();

      return {
        totalAgents: agents.length,
        activeAgents: activeAgents.length,
        orphanedAgents: orphanedAgents.length,
        zombieAgents: zombieAgents.length,
        averageIdleTime,
        memoryUsage: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers,
        },
        redisKeys: {
          total: allRedisKeys.length,
          stale: staleKeys.length,
        },
      };
    } catch (error) {
      this.logger.error('Error getting memory leak metrics', { error });
      throw error;
    }
  }

  /**
   * Find stale Redis keys (keys without TTL or expired content)
   */
  private async findStaleRedisKeys(): Promise<string[]> {
    try {
      const allKeys = await this.redis.keys('*');
      const staleKeys: string[] = [];

      for (const key of allKeys) {
        const ttl = await this.redis.ttl(key);

        // Keys without TTL (TTL = -1) or with negative TTL are stale
        if (ttl === -1 || ttl < 0) {
          staleKeys.push(key);
        }
      }

      return staleKeys;
    } catch (error) {
      this.logger.error('Error finding stale Redis keys', { error });
      return [];
    }
  }

  /**
   * Cleanup stale Redis keys
   */
  async cleanupStaleRedisKeys(): Promise<number> {
    try {
      const staleKeys = await this.findStaleRedisKeys();

      if (staleKeys.length > 0) {
        this.logger.info('Cleaning up stale Redis keys', { count: staleKeys.length });

        await this.redis.del(...staleKeys);
        this.metrics.redisKeysRemoved += staleKeys.length;

        this.emit('stale-keys:cleaned', { count: staleKeys.length });
      }

      return staleKeys.length;
    } catch (error) {
      this.logger.error('Error cleaning stale Redis keys', { error });
      throw error;
    }
  }

  /**
   * Get cleanup metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      isMonitoring: this.isMonitoring,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down enhanced lifecycle cleanup manager');
    this.stopMonitoring();
    this.emit('shutdown');
  }
}

/**
 * Create enhanced lifecycle cleanup manager
 */
export function createEnhancedLifecycleCleanupManager(
  config: EnhancedLifecycleCleanupConfig
): EnhancedLifecycleCleanupManager {
  return new EnhancedLifecycleCleanupManager(config);
}

export default EnhancedLifecycleCleanupManager;
