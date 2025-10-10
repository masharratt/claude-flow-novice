/**
 * Redis Health Monitor Tests
 *
 * Tests for Sprint 1.3: Auto-reconnect with exponential backoff
 *
 * Coverage:
 * - Connection lifecycle
 * - Health checks
 * - Auto-reconnection with exponential backoff
 * - Event emission
 * - Metrics collection
 * - Error handling and recovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedisHealthMonitor, ConnectionStatus } from '../../redis/RedisHealthMonitor';
import { EventEmitter } from 'events';

// Mock Redis client
const mockRedisClient = {
  connect: vi.fn(),
  ping: vi.fn(),
  quit: vi.fn(),
  on: vi.fn(),
  isOpen: true
};

// Mock createClient
vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient)
}));

describe('RedisHealthMonitor', () => {
  let healthMonitor: RedisHealthMonitor;
  const config = {
    redis: {
      host: 'localhost',
      port: 6379
    },
    health: {
      checkInterval: 100, // Fast for testing
      checkTimeout: 50,
      failureThreshold: 3
    },
    reconnect: {
      maxAttempts: 3,
      delays: [10, 20, 40], // Fast delays for testing
      resetOnSuccess: true
    },
    monitoring: {
      enabled: true,
      metricsInterval: 100
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockRedisClient.quit.mockResolvedValue('OK');
  });

  afterEach(async () => {
    if (healthMonitor) {
      await healthMonitor.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should initialize with disconnected status', () => {
      healthMonitor = new RedisHealthMonitor(config);
      expect(healthMonitor.getStatus()).toBe(ConnectionStatus.DISCONNECTED);
      expect(healthMonitor.isConnected()).toBe(false);
    });

    it('should connect to Redis successfully', async () => {
      healthMonitor = new RedisHealthMonitor(config);

      const connectedSpy = vi.fn();
      healthMonitor.on('redis:connected', connectedSpy);

      await healthMonitor.connect();

      expect(healthMonitor.getStatus()).toBe(ConnectionStatus.CONNECTED);
      expect(healthMonitor.isConnected()).toBe(true);
      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.ping).toHaveBeenCalled();
      expect(connectedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6379
        })
      );
    });

    it('should emit status change events', async () => {
      healthMonitor = new RedisHealthMonitor(config);

      const statusChangeSpy = vi.fn();
      healthMonitor.on('redis:status:changed', statusChangeSpy);

      await healthMonitor.connect();

      expect(statusChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          previousStatus: ConnectionStatus.DISCONNECTED,
          currentStatus: ConnectionStatus.CONNECTING
        })
      );

      expect(statusChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          previousStatus: ConnectionStatus.CONNECTING,
          currentStatus: ConnectionStatus.CONNECTED
        })
      );
    });

    it('should handle connection failure', async () => {
      mockRedisClient.connect.mockRejectedValue(new Error('Connection refused'));

      healthMonitor = new RedisHealthMonitor(config);

      const failedSpy = vi.fn();
      healthMonitor.on('redis:connection:failed', failedSpy);

      await expect(healthMonitor.connect()).rejects.toThrow('Redis connection failed');
      expect(healthMonitor.getStatus()).toBe(ConnectionStatus.FAILED);
      expect(failedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Connection refused'
        })
      );
    });

    it('should disconnect gracefully', async () => {
      healthMonitor = new RedisHealthMonitor(config);
      await healthMonitor.connect();

      const disconnectedSpy = vi.fn();
      healthMonitor.on('redis:disconnected', disconnectedSpy);

      await healthMonitor.disconnect();

      expect(healthMonitor.getStatus()).toBe(ConnectionStatus.DISCONNECTED);
      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(disconnectedSpy).toHaveBeenCalled();
    });
  });

  describe('Health Checks', () => {
    beforeEach(async () => {
      healthMonitor = new RedisHealthMonitor(config);
      await healthMonitor.connect();
    });

    it('should perform successful health check', async () => {
      const result = await healthMonitor.performHealthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latency).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('should emit health check events', async () => {
      const healthCheckSpy = vi.fn();
      healthMonitor.on('redis:health:check', healthCheckSpy);

      await healthMonitor.performHealthCheck();

      expect(healthCheckSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          healthy: true,
          latency: expect.any(Number)
        })
      );
    });

    it('should detect health check failure', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Timeout'));

      const result = await healthMonitor.performHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.latency).toBe(-1);
      expect(result.error).toBe('Timeout');
    });

    it('should handle health check timeout', async () => {
      // Simulate slow response
      mockRedisClient.ping.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 1000))
      );

      const result = await healthMonitor.performHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should track consecutive failures', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection lost'));

      // Perform multiple failed checks
      await healthMonitor.performHealthCheck();
      await healthMonitor.performHealthCheck();
      await healthMonitor.performHealthCheck();

      const metrics = healthMonitor.getMetrics();
      expect(metrics.consecutiveFailures).toBe(3);
      expect(metrics.totalFailures).toBe(3);
    });

    it('should reset consecutive failures on success', async () => {
      // Fail once
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Temporary failure'));
      await healthMonitor.performHealthCheck();

      const metricsAfterFailure = healthMonitor.getMetrics();
      expect(metricsAfterFailure.consecutiveFailures).toBe(1);

      // Succeed
      mockRedisClient.ping.mockResolvedValueOnce('PONG');
      await healthMonitor.performHealthCheck();

      const metricsAfterSuccess = healthMonitor.getMetrics();
      expect(metricsAfterSuccess.consecutiveFailures).toBe(0);
      expect(metricsAfterSuccess.totalFailures).toBe(1); // Total should not reset
    });
  });

  describe('Auto-Reconnection', () => {
    it('should trigger reconnection after failure threshold', async () => {
      healthMonitor = new RedisHealthMonitor(config);
      await healthMonitor.connect();

      const reconnectingSpy = vi.fn();
      healthMonitor.on('redis:reconnecting', reconnectingSpy);

      // Simulate connection loss
      mockRedisClient.ping.mockRejectedValue(new Error('Connection lost'));

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        await healthMonitor.performHealthCheck();
      }

      // Wait for reconnection attempts
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(reconnectingSpy).toHaveBeenCalled();
    });

    it('should use exponential backoff delays', async () => {
      healthMonitor = new RedisHealthMonitor(config);

      const reconnectingSpy = vi.fn();
      healthMonitor.on('redis:reconnecting', reconnectingSpy);

      // Fail initial connection
      mockRedisClient.connect.mockRejectedValueOnce(new Error('Connection refused'));

      try {
        await healthMonitor.connect();
      } catch (error) {
        // Expected to fail
      }

      // Manually trigger reconnection
      await (healthMonitor as any).attemptReconnect();

      // Check that delays are used
      expect(reconnectingSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          delay: 10
        })
      );
    });

    it('should succeed on reconnection attempt', async () => {
      healthMonitor = new RedisHealthMonitor(config);

      const reconnectedSpy = vi.fn();
      healthMonitor.on('redis:reconnected', reconnectedSpy);

      // Fail first connection, succeed on retry
      mockRedisClient.connect
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValue(undefined);

      try {
        await healthMonitor.connect();
      } catch (error) {
        // Expected to fail initially
      }

      // Attempt reconnection
      const success = await (healthMonitor as any).attemptReconnect();

      expect(success).toBe(true);
      expect(reconnectedSpy).toHaveBeenCalled();
      expect(healthMonitor.getStatus()).toBe(ConnectionStatus.CONNECTED);
    });

    it('should emit failed event after max attempts', async () => {
      healthMonitor = new RedisHealthMonitor(config);

      const failedSpy = vi.fn();
      healthMonitor.on('redis:failed', failedSpy);

      // Fail all connection attempts
      mockRedisClient.connect.mockRejectedValue(new Error('Connection refused'));

      try {
        await healthMonitor.connect();
      } catch (error) {
        // Expected to fail
      }

      // Attempt reconnection (will fail all 3 attempts)
      const success = await (healthMonitor as any).attemptReconnect();

      expect(success).toBe(false);
      expect(failedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: expect.any(String)
        })
      );
      expect(healthMonitor.getStatus()).toBe(ConnectionStatus.FAILED);
    });

    it('should reset reconnect attempts on success', async () => {
      healthMonitor = new RedisHealthMonitor(config);

      // Fail first attempt, succeed second
      mockRedisClient.connect
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue(undefined);

      try {
        await healthMonitor.connect();
      } catch (error) {
        // Expected to fail
      }

      // First reconnect attempt should succeed
      await (healthMonitor as any).attemptReconnect();

      const metrics = healthMonitor.getMetrics();
      expect(metrics.reconnectSuccess).toBe(1);
      expect((healthMonitor as any).reconnectAttempts).toBe(0); // Should reset
    });

    it('should track reconnection metrics', async () => {
      healthMonitor = new RedisHealthMonitor(config);

      // Fail all attempts
      mockRedisClient.connect.mockRejectedValue(new Error('Connection refused'));

      try {
        await healthMonitor.connect();
      } catch (error) {
        // Expected to fail
      }

      await (healthMonitor as any).attemptReconnect();

      const metrics = healthMonitor.getMetrics();
      expect(metrics.reconnectAttempts).toBeGreaterThan(0);
      expect(metrics.reconnectFailures).toBe(1);
    });
  });

  describe('Metrics Collection', () => {
    beforeEach(async () => {
      healthMonitor = new RedisHealthMonitor(config);
      await healthMonitor.connect();
    });

    it('should collect and return metrics', () => {
      const metrics = healthMonitor.getMetrics();

      expect(metrics).toMatchObject({
        status: ConnectionStatus.CONNECTED,
        consecutiveFailures: 0,
        totalChecks: expect.any(Number),
        totalFailures: 0,
        reconnectAttempts: 0,
        reconnectSuccess: 0,
        reconnectFailures: 0,
        averageLatency: expect.any(Number),
        uptime: expect.any(Number)
      });
    });

    it('should emit metrics periodically', async () => {
      const metricsSpy = vi.fn();
      healthMonitor.on('redis:metrics', metricsSpy);

      // Wait for metrics interval
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(metricsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ConnectionStatus.CONNECTED,
          uptime: expect.any(Number)
        })
      );
    });

    it('should calculate average latency', async () => {
      // Perform multiple health checks
      await healthMonitor.performHealthCheck();
      await healthMonitor.performHealthCheck();
      await healthMonitor.performHealthCheck();

      const metrics = healthMonitor.getMetrics();
      expect(metrics.averageLatency).toBeGreaterThan(0);
    });

    it('should track uptime', async () => {
      const initialMetrics = healthMonitor.getMetrics();
      const initialUptime = initialMetrics.uptime;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const laterMetrics = healthMonitor.getMetrics();
      expect(laterMetrics.uptime).toBeGreaterThan(initialUptime);
    });
  });

  describe('Event Emission', () => {
    it('should emit all connection lifecycle events', async () => {
      healthMonitor = new RedisHealthMonitor(config);

      const events: string[] = [];
      healthMonitor.on('redis:connected', () => events.push('connected'));
      healthMonitor.on('redis:disconnected', () => events.push('disconnected'));
      healthMonitor.on('redis:status:changed', () => events.push('status_changed'));

      await healthMonitor.connect();
      await healthMonitor.disconnect();

      expect(events).toContain('connected');
      expect(events).toContain('disconnected');
      expect(events).toContain('status_changed');
    });

    it('should emit connection lost event', async () => {
      healthMonitor = new RedisHealthMonitor(config);
      await healthMonitor.connect();

      const connectionLostSpy = vi.fn();
      healthMonitor.on('redis:connection:lost', connectionLostSpy);

      // Simulate connection loss
      mockRedisClient.ping.mockRejectedValue(new Error('Connection lost'));

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        await healthMonitor.performHealthCheck();
      }

      expect(connectionLostSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          consecutiveFailures: expect.any(Number)
        })
      );
    });

    it('should emit error events', async () => {
      healthMonitor = new RedisHealthMonitor(config);
      await healthMonitor.connect();

      const errorSpy = vi.fn();
      healthMonitor.on('redis:error', errorSpy);

      // Trigger error handler
      const errorHandler = mockRedisClient.on.mock.calls.find(
        call => call[0] === 'error'
      )?.[1];

      if (errorHandler) {
        errorHandler(new Error('Test error'));
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Test error'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle ping errors gracefully', async () => {
      healthMonitor = new RedisHealthMonitor(config);
      await healthMonitor.connect();

      mockRedisClient.ping.mockRejectedValue(new Error('Network error'));

      const result = await healthMonitor.performHealthCheck();
      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Network error');

      const metrics = healthMonitor.getMetrics();
      expect(metrics.lastError).toBe('Network error');
    });

    it('should handle disconnect errors gracefully', async () => {
      healthMonitor = new RedisHealthMonitor(config);
      await healthMonitor.connect();

      mockRedisClient.quit.mockRejectedValue(new Error('Quit failed'));

      // Should not throw
      await expect(healthMonitor.disconnect()).resolves.not.toThrow();
    });

    it('should prevent duplicate reconnection attempts', async () => {
      healthMonitor = new RedisHealthMonitor(config);

      mockRedisClient.connect.mockRejectedValue(new Error('Connection refused'));

      try {
        await healthMonitor.connect();
      } catch (error) {
        // Expected
      }

      // Start first reconnection
      const firstReconnect = (healthMonitor as any).attemptReconnect();

      // Try to start second reconnection (should be ignored)
      const secondReconnect = (healthMonitor as any).attemptReconnect();

      const [first, second] = await Promise.all([firstReconnect, secondReconnect]);

      expect(first).toBe(false); // Failed (connection refused)
      expect(second).toBe(false); // Ignored (already reconnecting)
    });
  });

  describe('Configuration', () => {
    it('should use default configuration values', () => {
      healthMonitor = new RedisHealthMonitor({
        redis: { host: 'localhost', port: 6379 }
      });

      const metrics = healthMonitor.getMetrics();
      expect(metrics).toBeDefined();
    });

    it('should allow custom health check interval', async () => {
      const customConfig = {
        ...config,
        health: {
          ...config.health,
          checkInterval: 200
        }
      };

      healthMonitor = new RedisHealthMonitor(customConfig);
      await healthMonitor.connect();

      // Verify health checks run at custom interval
      const healthCheckSpy = vi.fn();
      healthMonitor.on('redis:health:check', healthCheckSpy);

      await new Promise(resolve => setTimeout(resolve, 250));

      expect(healthCheckSpy).toHaveBeenCalled();
    });

    it('should allow custom reconnection delays', () => {
      const customConfig = {
        ...config,
        reconnect: {
          maxAttempts: 5,
          delays: [100, 200, 400, 800, 1600],
          resetOnSuccess: true
        }
      };

      healthMonitor = new RedisHealthMonitor(customConfig);
      expect(healthMonitor).toBeDefined();
    });
  });
});
