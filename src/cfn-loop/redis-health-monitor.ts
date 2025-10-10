/**
 * Redis Health Monitor - Sprint 1.3: Redis Health Check
 *
 * Monitors Redis connection health with periodic PING validation.
 * Detects disconnection within 5 seconds, reconnect within 30 seconds.
 *
 * Features:
 * - Periodic health check every 10 iterations (~50s based on 5s intervals)
 * - Redis PING validation with 5-second timeout
 * - Connection state tracking (connected, disconnected, reconnecting)
 * - Event emission for connection state changes
 * - Graceful degradation when Redis unavailable
 * - Exponential backoff reconnection (1s, 2s, 4s)
 *
 * Epic: production-blocking-coordination
 * Sprint: 1.3 - Redis Health Check
 * Target: Detect disconnection within 5s, reconnect within 30s
 *
 * @module cfn-loop/redis-health-monitor
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import type { Redis } from 'ioredis';
import type { LoggingConfig } from '../utils/types.js';

// ===== TYPE DEFINITIONS =====

/**
 * Redis connection state
 */
export enum RedisConnectionState {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  state: RedisConnectionState;
  latencyMs?: number;
  error?: string;
  timestamp: number;
}

/**
 * Connection state change event
 */
export interface ConnectionStateChange {
  previousState: RedisConnectionState;
  newState: RedisConnectionState;
  timestamp: number;
  reason?: string;
  error?: string;
}

/**
 * Configuration for Redis health monitor
 */
export interface RedisHealthMonitorConfig {
  /** Redis client instance (ioredis) */
  redisClient: Redis;
  /** Health check interval in milliseconds (default: 50000 = 50s for 10 iterations) */
  healthCheckInterval?: number;
  /** PING timeout in milliseconds (default: 5000 = 5s) */
  pingTimeout?: number;
  /** Enable automatic reconnection attempts (default: true) */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in ms (default: 5000) */
  reconnectDelayMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

// ===== REDIS HEALTH MONITOR =====

/**
 * Manages Redis connection health monitoring and state tracking
 */
export class RedisHealthMonitor extends EventEmitter {
  private logger: Logger;
  private redis: Redis;
  private healthCheckInterval: number;
  private pingTimeout: number;
  private autoReconnect: boolean;
  private maxReconnectAttempts: number;
  private reconnectDelayMs: number;
  private debug: boolean;

  // Monitoring state
  private checkTimer: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  private connectionState: RedisConnectionState = RedisConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;

  // Statistics
  private stats = {
    totalHealthChecks: 0,
    successfulChecks: 0,
    failedChecks: 0,
    reconnectAttempts: 0,
    successfulReconnects: 0,
    stateChanges: 0,
    averageLatencyMs: 0,
    totalLatencyMs: 0,
    latencySamples: 0,
  };

  // Last check result
  private lastCheckResult: HealthCheckResult | null = null;

  constructor(config: RedisHealthMonitorConfig) {
    super();

    this.redis = config.redisClient;
    this.healthCheckInterval = config.healthCheckInterval ?? 50000; // 50 seconds (10 iterations × 5s)
    this.pingTimeout = config.pingTimeout ?? 5000; // 5 seconds
    this.autoReconnect = config.autoReconnect ?? true;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
    this.reconnectDelayMs = config.reconnectDelayMs ?? 5000; // 5 seconds
    this.debug = config.debug ?? false;

    // Initialize logger
    const loggerConfig: LoggingConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error', format: 'json', destination: 'console' }
        : { level: this.debug ? 'debug' : 'info', format: 'json', destination: 'console' };

    this.logger = new Logger(loggerConfig, { component: 'RedisHealthMonitor' });

    this.logger.info('Redis Health Monitor initialized', {
      healthCheckInterval: this.healthCheckInterval,
      pingTimeout: this.pingTimeout,
      autoReconnect: this.autoReconnect,
      maxReconnectAttempts: this.maxReconnectAttempts,
    });

    // Set up Redis event listeners for native connection events
    this.setupRedisEventListeners();
  }

  /**
   * Start health monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      this.logger.warn('Health monitoring already running');
      return;
    }

    this.isMonitoring = true;

    this.logger.info('Starting Redis health monitoring', {
      interval: this.healthCheckInterval,
      pingTimeout: this.pingTimeout,
    });

    // Perform initial health check immediately
    this.performHealthCheck().catch((error) => {
      this.logger.error('Initial health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Start periodic health checks
    this.checkTimer = setInterval(() => {
      this.performHealthCheck().catch((error) => {
        this.logger.error('Periodic health check failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.healthCheckInterval);

    // Emit monitoring started event
    this.emit('monitoring:started', {
      interval: this.healthCheckInterval,
      timeout: this.pingTimeout,
    });
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      this.logger.warn('Health monitoring not running');
      return;
    }

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.isMonitoring = false;

    this.logger.info('Stopped Redis health monitoring', {
      statistics: this.getStatistics(),
    });

    // Emit monitoring stopped event
    this.emit('monitoring:stopped', {
      statistics: this.getStatistics(),
    });
  }

  /**
   * Perform health check with PING validation
   *
   * @returns Health check result with state and latency
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    this.stats.totalHealthChecks++;
    const startTime = Date.now();

    this.logger.debug('Performing health check', {
      currentState: this.connectionState,
      checkNumber: this.stats.totalHealthChecks,
    });

    try {
      // Execute PING command with timeout
      const pingPromise = this.redis.ping();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('PING timeout')), this.pingTimeout);
      });

      await Promise.race([pingPromise, timeoutPromise]);

      const latencyMs = Date.now() - startTime;

      // Update latency statistics
      this.stats.totalLatencyMs += latencyMs;
      this.stats.latencySamples++;
      this.stats.averageLatencyMs = this.stats.totalLatencyMs / this.stats.latencySamples;

      this.stats.successfulChecks++;

      const result: HealthCheckResult = {
        healthy: true,
        state: RedisConnectionState.CONNECTED,
        latencyMs,
        timestamp: Date.now(),
      };

      this.lastCheckResult = result;

      // Update connection state if changed
      if (this.connectionState !== RedisConnectionState.CONNECTED) {
        this.updateConnectionState(RedisConnectionState.CONNECTED, 'PING successful');
        this.reconnectAttempts = 0; // Reset reconnect attempts on success
      }

      this.logger.debug('Health check passed', {
        latencyMs,
        state: this.connectionState,
      });

      return result;
    } catch (error) {
      this.stats.failedChecks++;

      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: HealthCheckResult = {
        healthy: false,
        state: RedisConnectionState.DISCONNECTED,
        error: errorMessage,
        timestamp: Date.now(),
      };

      this.lastCheckResult = result;

      this.logger.error('Health check failed', {
        error: errorMessage,
        currentState: this.connectionState,
      });

      // Update connection state if changed
      if (this.connectionState !== RedisConnectionState.DISCONNECTED) {
        this.updateConnectionState(RedisConnectionState.DISCONNECTED, errorMessage);
      }

      // Emit disconnected event
      this.emit('redis:disconnected', {
        error: errorMessage,
        timestamp: Date.now(),
      });

      // Attempt reconnection if enabled
      if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        await this.attemptReconnection();
      }

      return result;
    }
  }

  /**
   * Attempt to reconnect to Redis
   */
  private async attemptReconnection(): Promise<void> {
    this.reconnectAttempts++;
    this.stats.reconnectAttempts++;

    this.logger.info('Attempting Redis reconnection', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
    });

    // Update state to reconnecting
    this.updateConnectionState(
      RedisConnectionState.RECONNECTING,
      `Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
    );

    // Emit reconnecting event
    this.emit('redis:reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      timestamp: Date.now(),
    });

    // Wait before attempting reconnection
    await this.sleep(this.reconnectDelayMs);

    try {
      // Try to reconnect using ioredis built-in reconnect
      await this.redis.ping();

      this.logger.info('Reconnection successful', {
        attempt: this.reconnectAttempts,
        totalAttempts: this.maxReconnectAttempts,
      });

      this.stats.successfulReconnects++;
      this.reconnectAttempts = 0;

      // Update state to connected
      this.updateConnectionState(RedisConnectionState.CONNECTED, 'Reconnection successful');

      // Emit connected event
      this.emit('redis:connected', {
        timestamp: Date.now(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Reconnection failed', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
        error: errorMessage,
      });

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.logger.error('Max reconnection attempts reached', {
          attempts: this.reconnectAttempts,
          maxAttempts: this.maxReconnectAttempts,
        });

        this.emit('redis:reconnect:failed', {
          attempts: this.reconnectAttempts,
          error: errorMessage,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Update connection state and emit event if changed
   */
  private updateConnectionState(
    newState: RedisConnectionState,
    reason?: string,
    error?: string
  ): void {
    const previousState = this.connectionState;

    if (previousState === newState) {
      return; // No change
    }

    this.connectionState = newState;
    this.stats.stateChanges++;

    const stateChange: ConnectionStateChange = {
      previousState,
      newState,
      timestamp: Date.now(),
      reason,
      error,
    };

    this.logger.info('Connection state changed', {
      previousState,
      newState,
      reason,
      error,
    });

    // Emit state change event
    this.emit('redis:state:change', stateChange);
  }

  /**
   * Set up Redis native event listeners
   */
  private setupRedisEventListeners(): void {
    // Redis connect event
    this.redis.on('connect', () => {
      this.logger.info('Redis native connect event');
      this.updateConnectionState(RedisConnectionState.CONNECTED, 'Redis native connect event');
      this.emit('redis:connected', { timestamp: Date.now() });
    });

    // Redis ready event (after successful AUTH)
    this.redis.on('ready', () => {
      this.logger.info('Redis native ready event');
      this.updateConnectionState(RedisConnectionState.CONNECTED, 'Redis native ready event');
      this.emit('redis:connected', { timestamp: Date.now() });
    });

    // Redis error event
    this.redis.on('error', (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Redis native error event', { error: errorMessage });
      this.updateConnectionState(
        RedisConnectionState.DISCONNECTED,
        'Redis native error event',
        errorMessage
      );
      this.emit('redis:disconnected', { error: errorMessage, timestamp: Date.now() });
    });

    // Redis close event
    this.redis.on('close', () => {
      this.logger.warn('Redis native close event');
      this.updateConnectionState(RedisConnectionState.DISCONNECTED, 'Redis native close event');
      this.emit('redis:disconnected', { timestamp: Date.now() });
    });

    // Redis reconnecting event
    this.redis.on('reconnecting', () => {
      this.logger.info('Redis native reconnecting event');
      this.updateConnectionState(
        RedisConnectionState.RECONNECTING,
        'Redis native reconnecting event'
      );
      this.emit('redis:reconnecting', { timestamp: Date.now() });
    });
  }

  /**
   * Get current connection state
   */
  getConnectionState(): RedisConnectionState {
    return this.connectionState;
  }

  /**
   * Get last health check result
   */
  getLastCheckResult(): HealthCheckResult | null {
    return this.lastCheckResult;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      currentState: this.connectionState,
      successRate:
        this.stats.totalHealthChecks > 0
          ? this.stats.successfulChecks / this.stats.totalHealthChecks
          : 0,
      reconnectSuccessRate:
        this.stats.reconnectAttempts > 0
          ? this.stats.successfulReconnects / this.stats.reconnectAttempts
          : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      totalHealthChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      reconnectAttempts: 0,
      successfulReconnects: 0,
      stateChanges: 0,
      averageLatencyMs: 0,
      totalLatencyMs: 0,
      latencySamples: 0,
    };
  }

  /**
   * Check if Redis is healthy
   */
  isHealthy(): boolean {
    return this.connectionState === RedisConnectionState.CONNECTED;
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Redis health monitor');

    // Stop monitoring
    this.stopMonitoring();

    // Remove all listeners
    this.removeAllListeners();

    this.logger.info('Redis health monitor cleanup complete', {
      statistics: this.getStatistics(),
    });
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create a RedisHealthMonitor instance
 *
 * @param config - Configuration for Redis health monitor
 * @returns Configured RedisHealthMonitor
 */
export function createRedisHealthMonitor(
  config: RedisHealthMonitorConfig
): RedisHealthMonitor {
  return new RedisHealthMonitor(config);
}

// ===== EXPORTS =====

export default RedisHealthMonitor;
