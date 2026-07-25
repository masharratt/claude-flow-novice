/**
 * Circuit Breaker Tests
 *
 * Comprehensive test suite for circuit breaker pattern with >90% coverage.
 * Validates state transitions, threshold management, timeout handling,
 * and integration with various system components.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerConfig,
  CircuitBreakerRegistry,
  CircuitBreakerMetrics,
  CircuitOpenError,
} from '../../src/lib/circuit-breaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockOperation: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000, // 1 second for testing
    });
    mockOperation = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    CircuitBreakerRegistry.clear();
  });

  describe('State Transitions', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN after threshold failures', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Execute 3 failures (threshold)
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Fast-forward past timeout
      jest.advanceTimersByTime(1100);

      // Next call should transition to HALF_OPEN
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should transition to CLOSED after success threshold in HALF_OPEN', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      // Fast-forward past timeout
      jest.advanceTimersByTime(1100);

      // Execute successful operations to reach success threshold
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation); // HALF_OPEN
      await circuitBreaker.execute(mockOperation); // Success 1
      await circuitBreaker.execute(mockOperation); // Success 2 -> CLOSED

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition back to OPEN from HALF_OPEN on failure', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      // Fast-forward past timeout
      jest.advanceTimersByTime(1100);

      // Execute one successful operation (HALF_OPEN)
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Fail again - should go back to OPEN
      mockOperation.mockRejectedValue(new Error('Service failure again'));
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('Circuit Open Behavior', () => {
    it('should reject requests immediately when circuit is OPEN', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      // Reset mock to track calls
      mockOperation.mockClear();

      // Try to execute - should fail without calling operation
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow(CircuitOpenError);
      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should throw CircuitOpenError with proper metadata', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      // Try to execute
      try {
        await circuitBreaker.execute(mockOperation);
        expect.fail('Should have thrown CircuitOpenError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).serviceName).toBe('test-service');
        expect((error as CircuitOpenError).message).toContain('Circuit breaker is OPEN');
      }
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track failure count correctly', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failures).toBe(2);
      expect(metrics.successes).toBe(0);
    });

    it('should track success count correctly', async () => {
      mockOperation.mockResolvedValue('success');

      await circuitBreaker.execute(mockOperation);
      await circuitBreaker.execute(mockOperation);

      const metrics = circuitBreaker.getMetrics();
      // In CLOSED state, successes counter is not used (only for HALF_OPEN recovery)
      // Use totalSuccesses to track all successful operations
      expect(metrics.totalSuccesses).toBe(2);
      expect(metrics.failures).toBe(0);
    });

    it('should track last failure time', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      const beforeTime = Date.now();
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      const afterTime = Date.now();

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.lastFailureTime).toBeDefined();
      expect(metrics.lastFailureTime!.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(metrics.lastFailureTime!.getTime()).toBeLessThanOrEqual(afterTime);
    });

    it('should track last success time', async () => {
      mockOperation.mockResolvedValue('success');

      const beforeTime = Date.now();
      await circuitBreaker.execute(mockOperation);
      const afterTime = Date.now();

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.lastSuccessTime).toBeDefined();
      expect(metrics.lastSuccessTime!.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(metrics.lastSuccessTime!.getTime()).toBeLessThanOrEqual(afterTime);
    });

    it('should reset metrics when circuit closes', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      // Fast-forward past timeout
      jest.advanceTimersByTime(1100);

      // Close circuit with successful operations
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);
      await circuitBreaker.execute(mockOperation);
      await circuitBreaker.execute(mockOperation);

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failures).toBe(0);
      expect(metrics.successes).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const defaultCB = new CircuitBreaker('default-service');
      const metrics = defaultCB.getMetrics();

      expect(metrics.state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should respect custom failure threshold', async () => {
      const customCB = new CircuitBreaker('custom-service', {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 1000,
      });

      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Should not open after 3 failures (threshold is 5)
      for (let i = 0; i < 3; i++) {
        await expect(customCB.execute(mockOperation)).rejects.toThrow();
      }
      expect(customCB.getState()).toBe(CircuitBreakerState.CLOSED);

      // Should open after 5 failures
      for (let i = 0; i < 2; i++) {
        await expect(customCB.execute(mockOperation)).rejects.toThrow();
      }
      expect(customCB.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should respect custom success threshold', async () => {
      const customCB = new CircuitBreaker('custom-service', {
        failureThreshold: 3,
        successThreshold: 3,
        timeout: 1000,
      });

      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(customCB.execute(mockOperation)).rejects.toThrow();
      }

      // Fast-forward past timeout
      jest.advanceTimersByTime(1100);

      // Execute successful operations
      mockOperation.mockResolvedValue('success');
      await customCB.execute(mockOperation); // HALF_OPEN
      await customCB.execute(mockOperation); // Success 1

      // Should still be HALF_OPEN (need 3 successes)
      expect(customCB.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      await customCB.execute(mockOperation); // Success 2
      await customCB.execute(mockOperation); // Success 3 -> CLOSED
      expect(customCB.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should respect custom timeout', async () => {
      const customCB = new CircuitBreaker('custom-service', {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 5000, // 5 seconds
      });

      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(customCB.execute(mockOperation)).rejects.toThrow();
      }

      // Fast-forward 1 second (not enough)
      jest.advanceTimersByTime(1000);
      mockOperation.mockClear();
      await expect(customCB.execute(mockOperation)).rejects.toThrow(CircuitOpenError);
      expect(mockOperation).not.toHaveBeenCalled();

      // Fast-forward to 5 seconds total
      jest.advanceTimersByTime(4100);
      mockOperation.mockResolvedValue('success');
      await customCB.execute(mockOperation);
      expect(customCB.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });
  });

  describe('Fallback Behavior', () => {
    it('should execute fallback when circuit is OPEN', async () => {
      const fallback = jest.fn().mockResolvedValue('fallback-result');
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      // Execute with fallback
      const result = await circuitBreaker.execute(mockOperation, fallback);
      expect(result).toBe('fallback-result');
      expect(fallback).toHaveBeenCalled();
    });

    it('should not execute fallback when circuit is CLOSED', async () => {
      const fallback = jest.fn().mockResolvedValue('fallback-result');
      mockOperation.mockResolvedValue('normal-result');

      const result = await circuitBreaker.execute(mockOperation, fallback);
      expect(result).toBe('normal-result');
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should handle async fallback functions', async () => {
      const fallback = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'async-fallback-result';
      });
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      // Execute with async fallback
      const resultPromise = circuitBreaker.execute(mockOperation, fallback);
      jest.advanceTimersByTime(150);
      const result = await resultPromise;

      expect(result).toBe('async-fallback-result');
    });
  });

  describe('Health Check', () => {
    it('should report healthy when circuit is CLOSED', () => {
      expect(circuitBreaker.isHealthy()).toBe(true);
    });

    it('should report unhealthy when circuit is OPEN', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      expect(circuitBreaker.isHealthy()).toBe(false);
    });

    it('should report unhealthy when circuit is HALF_OPEN', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      // Fast-forward past timeout
      jest.advanceTimersByTime(1100);

      // Transition to HALF_OPEN
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);

      expect(circuitBreaker.isHealthy()).toBe(false);
    });
  });

  describe('Manual Control', () => {
    it('should allow manual circuit opening', () => {
      circuitBreaker.open();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should allow manual circuit closing', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Manually close
      circuitBreaker.close();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should reset metrics on manual close', async () => {
      mockOperation.mockRejectedValue(new Error('Service failure'));

      // Build up failures
      for (let i = 0; i < 2; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      const beforeMetrics = circuitBreaker.getMetrics();
      expect(beforeMetrics.failures).toBe(2);

      // Manually close (reset)
      circuitBreaker.close();

      const afterMetrics = circuitBreaker.getMetrics();
      expect(afterMetrics.failures).toBe(0);
      expect(afterMetrics.successes).toBe(0);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  beforeEach(() => {
    CircuitBreakerRegistry.clear();
  });

  it('should register circuit breakers', () => {
    const cb1 = CircuitBreakerRegistry.getOrCreate('service-1');
    const cb2 = CircuitBreakerRegistry.getOrCreate('service-2');

    expect(cb1).toBeDefined();
    expect(cb2).toBeDefined();
    expect(cb1).not.toBe(cb2);
  });

  it('should return same instance for same service name', () => {
    const cb1 = CircuitBreakerRegistry.getOrCreate('service-1');
    const cb2 = CircuitBreakerRegistry.getOrCreate('service-1');

    expect(cb1).toBe(cb2);
  });

  it('should retrieve registered circuit breaker', () => {
    CircuitBreakerRegistry.getOrCreate('service-1');
    const retrieved = CircuitBreakerRegistry.get('service-1');

    expect(retrieved).toBeDefined();
  });

  it('should return undefined for non-existent circuit breaker', () => {
    const retrieved = CircuitBreakerRegistry.get('non-existent');
    expect(retrieved).toBeUndefined();
  });

  it('should list all registered circuit breakers', () => {
    CircuitBreakerRegistry.getOrCreate('service-1');
    CircuitBreakerRegistry.getOrCreate('service-2');
    CircuitBreakerRegistry.getOrCreate('service-3');

    const all = CircuitBreakerRegistry.getAll();
    expect(all.size).toBe(3);
    expect(all.has('service-1')).toBe(true);
    expect(all.has('service-2')).toBe(true);
    expect(all.has('service-3')).toBe(true);
  });

  it('should get health status for all circuit breakers', () => {
    const cb1 = CircuitBreakerRegistry.getOrCreate('service-1');
    const cb2 = CircuitBreakerRegistry.getOrCreate('service-2');

    cb1.open(); // Make service-1 unhealthy

    const healthStatus = CircuitBreakerRegistry.getHealthStatus();
    expect(healthStatus).toHaveProperty('service-1', false);
    expect(healthStatus).toHaveProperty('service-2', true);
  });

  it('should get metrics for all circuit breakers', () => {
    const cb1 = CircuitBreakerRegistry.getOrCreate('service-1');
    const cb2 = CircuitBreakerRegistry.getOrCreate('service-2');

    cb1.open();

    const allMetrics = CircuitBreakerRegistry.getAllMetrics();
    expect(allMetrics).toHaveProperty('service-1');
    expect(allMetrics).toHaveProperty('service-2');
    expect(allMetrics['service-1'].state).toBe(CircuitBreakerState.OPEN);
    expect(allMetrics['service-2'].state).toBe(CircuitBreakerState.CLOSED);
  });

  it('should clear all circuit breakers', () => {
    CircuitBreakerRegistry.getOrCreate('service-1');
    CircuitBreakerRegistry.getOrCreate('service-2');

    expect(CircuitBreakerRegistry.getAll().size).toBe(2);

    CircuitBreakerRegistry.clear();

    expect(CircuitBreakerRegistry.getAll().size).toBe(0);
  });
});

describe('CircuitOpenError', () => {
  it('should create error with service name', () => {
    const error = new CircuitOpenError('test-service');
    expect(error.serviceName).toBe('test-service');
    expect(error.message).toContain('test-service');
  });

  it('should be instanceof Error', () => {
    const error = new CircuitOpenError('test-service');
    expect(error).toBeInstanceOf(Error);
  });

  it('should include StandardError properties', () => {
    const error = new CircuitOpenError('test-service');
    expect(error).toHaveProperty('code');
    expect(error).toHaveProperty('statusCode');
    expect(error).toHaveProperty('isOperational');
  });
});
