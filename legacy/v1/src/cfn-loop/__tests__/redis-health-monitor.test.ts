/**
 * Redis Health Monitor Test Suite - Sprint 1.3
 *
 * Tests Redis health check detection and auto-reconnection capabilities.
 * Validates health monitoring, reconnection attempts, and graceful degradation.
 *
 * Epic: production-blocking-coordination
 * Sprint: 1.3 - Redis Health Check
 * Target: Detection within 5s, Reconnection within 30s
 *
 * Test Coverage Requirements:
 * - Health check detection (PING succeeds/fails within 5s timeout)
 * - Connection recovery (PING succeeds after reconnection)
 * - Auto-reconnect with exponential backoff (1s, 2s, 4s delays)
 * - Max reconnect attempts (3 attempts, emit redis:failed)
 * - Event emission (connected, disconnected, reconnecting, reconnected)
 * - Graceful degradation (operations fail safely without crash)
 * - Metrics tracking during disconnection
 *
 * @module cfn-loop/__tests__/redis-health-monitor
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { EventEmitter } from 'events';

// ===== TEST CONFIGURATION =====

const REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '1'), // Use separate DB for tests
  retryStrategy: (times: number) => {
    if (times > 3) return null; // Stop retrying after 3 attempts
    return Math.min(times * 50, 500);
  },
  enableReadyCheck: true,
  lazyConnect: false,
  connectTimeout: 5000, // 5 second connection timeout
};

const TEST_TIMEOUT = 60000; // 60 seconds for all tests (some need time for retries)
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds for health check detection
const RECONNECT_TIMEOUT = 30000; // 30 seconds for reconnection

// ===== REDIS HEALTH MONITOR MOCK =====

/**
 * Redis Health Monitor
 *
 * Monitors Redis connection health with PING checks and auto-reconnection.
 * Implements exponential backoff for reconnection attempts.
 */
class RedisHealthMonitor extends EventEmitter {
  private redis: Redis;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private isHealthy = false;
  private isReconnecting = false;
  private metrics = {
    healthChecks: 0,
    healthCheckFailures: 0,
    reconnectAttempts: 0,
    reconnectSuccesses: 0,
    reconnectFailures: 0,
  };

  constructor(redis: Redis) {
    super();
    this.redis = redis;

    // Wire up Redis events
    this.redis.on('ready', () => this.handleConnected());
    this.redis.on('close', () => this.handleDisconnected());
    this.redis.on('error', (error) => this.handleError(error));
  }

  /**
   * Start health check monitoring
   */
  startMonitoring(intervalMs: number = 5000): void {
    if (this.healthCheckInterval) {
      return; // Already monitoring
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);

    this.emit('monitoring:started', { interval: intervalMs });
  }

  /**
   * Stop health check monitoring
   */
  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.emit('monitoring:stopped');
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Perform health check with PING command
   */
  async performHealthCheck(): Promise<boolean> {
    this.metrics.healthChecks++;

    try {
      // PING with 5 second timeout
      const pingPromise = this.redis.ping();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_TIMEOUT)
      );

      const result = await Promise.race([pingPromise, timeoutPromise]);

      if (result === 'PONG') {
        this.isHealthy = true;
        return true;
      } else {
        throw new Error('Invalid PING response');
      }
    } catch (error) {
      this.metrics.healthCheckFailures++;
      this.isHealthy = false;

      this.emit('health:check:failed', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });

      // Trigger reconnection if not already reconnecting
      if (!this.isReconnecting) {
        this.initiateReconnection();
      }

      return false;
    }
  }

  /**
   * Initiate reconnection with exponential backoff
   */
  private initiateReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('redis:failed', {
        reason: 'Max reconnect attempts reached',
        attempts: this.reconnectAttempts,
        timestamp: Date.now(),
      });
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    this.metrics.reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, this.reconnectAttempts - 1) * 1000;

    this.emit('redis:reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay,
      timestamp: Date.now(),
    });

    this.reconnectTimeout = setTimeout(() => {
      this.attemptReconnection();
    }, delay);
  }

  /**
   * Attempt to reconnect to Redis
   */
  private async attemptReconnection(): Promise<void> {
    try {
      // Disconnect if connected
      if (this.redis.status === 'ready' || this.redis.status === 'connecting') {
        await this.redis.disconnect();
      }

      // Reconnect
      await this.redis.connect();

      // Verify connection with PING
      const result = await this.redis.ping();
      if (result === 'PONG') {
        this.isHealthy = true;
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.metrics.reconnectSuccesses++;

        this.emit('redis:reconnected', {
          timestamp: Date.now(),
        });
      } else {
        throw new Error('PING failed after reconnection');
      }
    } catch (error) {
      this.metrics.reconnectFailures++;
      this.isReconnecting = false;

      // Retry with next backoff
      this.initiateReconnection();
    }
  }

  /**
   * Handle Redis connected event
   */
  private handleConnected(): void {
    this.isHealthy = true;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    this.emit('redis:connected', {
      timestamp: Date.now(),
    });
  }

  /**
   * Handle Redis disconnected event
   */
  private handleDisconnected(): void {
    this.isHealthy = false;

    this.emit('redis:disconnected', {
      timestamp: Date.now(),
    });

    // Initiate reconnection if not already reconnecting
    if (!this.isReconnecting) {
      this.initiateReconnection();
    }
  }

  /**
   * Handle Redis error event
   */
  private handleError(error: Error): void {
    this.emit('redis:error', {
      error: error.message,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if Redis is healthy
   */
  isRedisHealthy(): boolean {
    return this.isHealthy;
  }

  /**
   * Get monitoring metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      healthChecks: 0,
      healthCheckFailures: 0,
      reconnectAttempts: 0,
      reconnectSuccesses: 0,
      reconnectFailures: 0,
    };
  }
}

// ===== TEST UTILITIES =====

async function cleanupRedis(redis: Redis): Promise<void> {
  try {
    // Clean up all test keys
    const patterns = [
      'test:*',
      'blocking:*',
    ];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    }
  } catch (error) {
    console.error('Redis cleanup failed:', error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== TEST SUITE =====

describe('Redis Health Monitor - Sprint 1.3', () => {
  let redis: Redis;
  let healthMonitor: RedisHealthMonitor;

  beforeEach(async () => {
    // Initialize Redis client
    redis = new Redis(REDIS_CONFIG);

    // Wait for Redis connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, 5000);

      redis.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      redis.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Clean up any existing test data
    await cleanupRedis(redis);
  }, TEST_TIMEOUT);

  afterEach(async () => {
    // Stop monitoring if running
    if (healthMonitor) {
      healthMonitor.stopMonitoring();
      healthMonitor.removeAllListeners();
    }

    // Clean up test data
    await cleanupRedis(redis);

    // Disconnect Redis
    await redis.quit();
  }, TEST_TIMEOUT);

  // ===== HEALTH CHECK DETECTION TESTS =====

  describe('Health Check Detection', () => {
    it('should detect healthy connection when PING succeeds', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      const result = await healthMonitor.performHealthCheck();

      expect(result).toBe(true);
      expect(healthMonitor.isRedisHealthy()).toBe(true);

      const metrics = healthMonitor.getMetrics();
      expect(metrics.healthChecks).toBe(1);
      expect(metrics.healthCheckFailures).toBe(0);
    });

    it('should detect connection loss when PING fails within 5s timeout', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      // Set up failure listener
      const failures: any[] = [];
      healthMonitor.on('health:check:failed', (event) => {
        failures.push(event);
      });

      // Disconnect Redis to simulate failure
      await redis.disconnect();

      // Wait a moment for disconnection to register
      await sleep(100);

      // Perform health check (should fail within 5s)
      const startTime = Date.now();
      const result = await healthMonitor.performHealthCheck();
      const duration = Date.now() - startTime;

      expect(result).toBe(false);
      expect(healthMonitor.isRedisHealthy()).toBe(false);
      expect(duration).toBeLessThan(HEALTH_CHECK_TIMEOUT + 100); // Within 5s + buffer
      expect(failures.length).toBeGreaterThan(0);

      const metrics = healthMonitor.getMetrics();
      expect(metrics.healthCheckFailures).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('should restore health when connection recovers and PING succeeds', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      // Disconnect
      await redis.disconnect();
      await sleep(100);

      // Health check should fail
      let result = await healthMonitor.performHealthCheck();
      expect(result).toBe(false);
      expect(healthMonitor.isRedisHealthy()).toBe(false);

      // Reconnect
      await redis.connect();
      await sleep(100);

      // Health check should succeed
      result = await healthMonitor.performHealthCheck();
      expect(result).toBe(true);
      expect(healthMonitor.isRedisHealthy()).toBe(true);
    }, TEST_TIMEOUT);
  });

  // ===== AUTO-RECONNECT TESTS =====

  describe('Auto-Reconnect', () => {
    it('should attempt reconnect with 1s delay on first attempt', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      const reconnectEvents: any[] = [];
      healthMonitor.on('redis:reconnecting', (event) => {
        reconnectEvents.push(event);
      });

      // Disconnect to trigger reconnection
      await redis.disconnect();
      await sleep(100);

      // Perform health check to trigger reconnection
      await healthMonitor.performHealthCheck();

      // Wait for first reconnect attempt
      await sleep(1500);

      expect(reconnectEvents.length).toBeGreaterThan(0);
      expect(reconnectEvents[0].attempt).toBe(1);
      expect(reconnectEvents[0].delay).toBe(1000); // 1 second
    }, TEST_TIMEOUT);

    it('should attempt reconnect with 2s delay on second attempt', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      const reconnectEvents: any[] = [];
      healthMonitor.on('redis:reconnecting', (event) => {
        reconnectEvents.push(event);
      });

      // Simulate first failed reconnect
      await redis.disconnect();
      await healthMonitor.performHealthCheck();
      await sleep(1500); // Wait for first attempt

      // Simulate second failed reconnect
      await healthMonitor.performHealthCheck();
      await sleep(2500); // Wait for second attempt

      const secondAttempt = reconnectEvents.find(e => e.attempt === 2);
      expect(secondAttempt).toBeDefined();
      expect(secondAttempt.delay).toBe(2000); // 2 seconds
    }, TEST_TIMEOUT);

    it('should attempt reconnect with 4s delay on third attempt', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      const reconnectEvents: any[] = [];
      healthMonitor.on('redis:reconnecting', (event) => {
        reconnectEvents.push(event);
      });

      // Simulate first failed reconnect
      await redis.disconnect();
      await healthMonitor.performHealthCheck();
      await sleep(1500);

      // Simulate second failed reconnect
      await healthMonitor.performHealthCheck();
      await sleep(2500);

      // Simulate third failed reconnect
      await healthMonitor.performHealthCheck();
      await sleep(4500);

      const thirdAttempt = reconnectEvents.find(e => e.attempt === 3);
      expect(thirdAttempt).toBeDefined();
      expect(thirdAttempt.delay).toBe(4000); // 4 seconds
    }, TEST_TIMEOUT);

    it('should emit redis:failed after 3 max attempts', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      const failedEvents: any[] = [];
      healthMonitor.on('redis:failed', (event) => {
        failedEvents.push(event);
      });

      // Disconnect permanently
      await redis.disconnect();

      // Trigger health check to start reconnection
      await healthMonitor.performHealthCheck();

      // Wait for all 3 attempts to complete (1s + 2s + 4s = 7s + buffers)
      await sleep(10000);

      expect(failedEvents.length).toBeGreaterThan(0);
      expect(failedEvents[0].reason).toContain('Max reconnect attempts');
      expect(failedEvents[0].attempts).toBe(3);
    }, TEST_TIMEOUT);
  });

  // ===== EVENT EMISSION TESTS =====

  describe('Event Emission', () => {
    it('should emit redis:connected on initial connection', async () => {
      const connectedEvents: any[] = [];

      // Create new Redis instance to capture initial connection
      const newRedis = new Redis(REDIS_CONFIG);
      healthMonitor = new RedisHealthMonitor(newRedis);

      healthMonitor.on('redis:connected', (event) => {
        connectedEvents.push(event);
      });

      // Wait for connection
      await new Promise<void>((resolve) => {
        newRedis.once('ready', resolve);
      });

      await sleep(100);

      expect(connectedEvents.length).toBeGreaterThan(0);
      expect(connectedEvents[0].timestamp).toBeGreaterThan(0);

      // Cleanup
      await newRedis.quit();
    }, TEST_TIMEOUT);

    it('should emit redis:disconnected on connection loss', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      const disconnectedEvents: any[] = [];
      healthMonitor.on('redis:disconnected', (event) => {
        disconnectedEvents.push(event);
      });

      // Disconnect
      await redis.disconnect();
      await sleep(100);

      expect(disconnectedEvents.length).toBeGreaterThan(0);
      expect(disconnectedEvents[0].timestamp).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('should emit redis:reconnecting during reconnect attempts', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      const reconnectingEvents: any[] = [];
      healthMonitor.on('redis:reconnecting', (event) => {
        reconnectingEvents.push(event);
      });

      // Disconnect and trigger reconnection
      await redis.disconnect();
      await healthMonitor.performHealthCheck();

      await sleep(1500);

      expect(reconnectingEvents.length).toBeGreaterThan(0);
      expect(reconnectingEvents[0].attempt).toBeGreaterThan(0);
      expect(reconnectingEvents[0].delay).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('should emit redis:reconnected on successful reconnect', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      const reconnectedEvents: any[] = [];
      healthMonitor.on('redis:reconnected', (event) => {
        reconnectedEvents.push(event);
      });

      // Disconnect
      await redis.disconnect();
      await sleep(100);

      // Trigger health check to initiate reconnection
      await healthMonitor.performHealthCheck();

      // Wait for reconnection (should succeed within 2s)
      await sleep(2500);

      expect(reconnectedEvents.length).toBeGreaterThan(0);
      expect(reconnectedEvents[0].timestamp).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  });

  // ===== GRACEFUL DEGRADATION TESTS =====

  describe('Graceful Degradation', () => {
    it('should fail operations gracefully when Redis is down (no crash)', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      // Disconnect Redis
      await redis.disconnect();
      await sleep(100);

      // Attempt operations - should not crash
      let errorThrown = false;
      try {
        await redis.set('test:key', 'value');
      } catch (error) {
        errorThrown = true;
        expect(error).toBeDefined();
      }

      expect(errorThrown).toBe(true);
      expect(healthMonitor.isRedisHealthy()).toBe(false);

      // Health monitor should still be functional
      const metrics = healthMonitor.getMetrics();
      expect(metrics).toBeDefined();
    }, TEST_TIMEOUT);

    it('should continue tracking metrics during disconnection', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      // Perform health check while connected
      await healthMonitor.performHealthCheck();
      let metrics = healthMonitor.getMetrics();
      const initialHealthChecks = metrics.healthChecks;

      // Disconnect
      await redis.disconnect();
      await sleep(100);

      // Perform health checks while disconnected
      await healthMonitor.performHealthCheck();
      await healthMonitor.performHealthCheck();

      metrics = healthMonitor.getMetrics();

      expect(metrics.healthChecks).toBe(initialHealthChecks + 2);
      expect(metrics.healthCheckFailures).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  });

  // ===== MONITORING LIFECYCLE TESTS =====

  describe('Monitoring Lifecycle', () => {
    it('should start and stop monitoring', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      const startEvents: any[] = [];
      const stopEvents: any[] = [];

      healthMonitor.on('monitoring:started', (event) => {
        startEvents.push(event);
      });

      healthMonitor.on('monitoring:stopped', (event) => {
        stopEvents.push(event);
      });

      // Start monitoring
      healthMonitor.startMonitoring(1000); // 1 second interval

      expect(startEvents.length).toBe(1);
      expect(startEvents[0].interval).toBe(1000);

      await sleep(100);

      // Stop monitoring
      healthMonitor.stopMonitoring();

      expect(stopEvents.length).toBe(1);
    });

    it('should perform periodic health checks when monitoring', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      healthMonitor.resetMetrics();

      // Start monitoring with 500ms interval
      healthMonitor.startMonitoring(500);

      // Wait for 3 health checks (1.5 seconds + buffer)
      await sleep(2000);

      healthMonitor.stopMonitoring();

      const metrics = healthMonitor.getMetrics();
      expect(metrics.healthChecks).toBeGreaterThanOrEqual(3);
    }, TEST_TIMEOUT);
  });

  // ===== METRICS TESTS =====

  describe('Metrics Tracking', () => {
    it('should track health check metrics', async () => {
      healthMonitor = new RedisHealthMonitor(redis);
      healthMonitor.resetMetrics();

      // Perform successful health check
      await healthMonitor.performHealthCheck();

      const metrics = healthMonitor.getMetrics();

      expect(metrics.healthChecks).toBe(1);
      expect(metrics.healthCheckFailures).toBe(0);
    });

    it('should track reconnection metrics', async () => {
      healthMonitor = new RedisHealthMonitor(redis);
      healthMonitor.resetMetrics();

      // Disconnect and trigger reconnection
      await redis.disconnect();
      await healthMonitor.performHealthCheck();

      await sleep(2000);

      const metrics = healthMonitor.getMetrics();

      expect(metrics.reconnectAttempts).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('should reset metrics', async () => {
      healthMonitor = new RedisHealthMonitor(redis);

      await healthMonitor.performHealthCheck();

      let metrics = healthMonitor.getMetrics();
      expect(metrics.healthChecks).toBeGreaterThan(0);

      healthMonitor.resetMetrics();

      metrics = healthMonitor.getMetrics();
      expect(metrics.healthChecks).toBe(0);
      expect(metrics.healthCheckFailures).toBe(0);
    });
  });
});
