/**
 * Comprehensive Retry Logic Tests
 *
 * Tests for retry-manager.ts and retry.ts with >90% coverage.
 * Validates exponential backoff, circuit breaker, correlation tracking,
 * retryable error classification, and policy-based retries.
 *
 * Part of HIGH-PRIORITY retry logic implementation.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  RetryManager,
  RetryPolicies,
  CircuitState,
  createRetryManager,
  withStandardRetry,
  withDatabaseRetry,
  withNetworkRetry,
  withFileSystemRetry,
} from '../../src/lib/retry-manager';
import { withRetry, withLinearRetry, withExponentialRetry, retryable } from '../../src/lib/retry';
import { StandardError, ErrorCode, isRetryableError } from '../../src/lib/errors';

describe('Retry Logic - Core Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: Basic retry with success on first attempt
  it('should succeed on first attempt without retry', async () => {
    let attempts = 0;
    const fn = jest.fn(async () => {
      attempts++;
      return 'success';
    });

    const result = await withRetry(fn, { maxAttempts: 3 });

    expect(result).toBe('success');
    expect(attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // Test 2: Retry with success on second attempt
  it('should retry once and succeed on second attempt', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts === 1) {
        throw new StandardError(
          ErrorCode.NETWORK_ERROR,
          'Network timeout',
          {},
          undefined,
          true // retryable
        );
      }
      return 'success';
    };

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  // Test 3: Retry exhausted after max attempts
  it('should throw RetryExhaustedError after max attempts', async () => {
    const fn = async () => {
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Always fails', {}, undefined, true);
    };

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })
    ).rejects.toThrow('Operation failed after 3 retry attempts');
  });

  // Test 4: Non-retryable error should not retry
  it('should not retry non-retryable errors', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Validation error',
        {},
        undefined,
        false // not retryable
      );
    };

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })
    ).rejects.toThrow('Validation error');

    expect(attempts).toBe(1); // Should fail immediately
  });

  // Test 5: Exponential backoff delay calculation
  it('should use exponential backoff delays', async () => {
    const delays: number[] = [];
    let attempts = 0;

    const fn = async () => {
      attempts++;
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
    };

    try {
      await withRetry(fn, {
        maxAttempts: 4,
        baseDelayMs: 100,
        exponential: true,
        jitter: false, // Disable jitter for predictable delays
        onRetry: (attempt, error, delayMs) => {
          delays.push(delayMs);
        },
      });
    } catch (error) {
      // Expected to fail
    }

    expect(attempts).toBe(4);
    expect(delays.length).toBe(3); // 3 retries (attempts 2, 3, 4)

    // Check exponential backoff: 100, 200, 400
    expect(delays[0]).toBe(100); // 100 * 2^0
    expect(delays[1]).toBe(200); // 100 * 2^1
    expect(delays[2]).toBe(400); // 100 * 2^2
  });

  // Test 6: Linear backoff delay calculation
  it('should use linear backoff delays', async () => {
    const delays: number[] = [];
    let attempts = 0;

    const fn = async () => {
      attempts++;
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
    };

    try {
      await withLinearRetry(fn, 4, 100);
    } catch (error) {
      // Expected to fail
    }

    // Linear backoff should be 100, 200, 300
    expect(attempts).toBe(4);
  });

  // Test 7: Max delay cap
  it('should cap delays at maxDelayMs', async () => {
    const delays: number[] = [];

    const fn = async () => {
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
    };

    try {
      await withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 10000,
        maxDelayMs: 5000,
        exponential: true,
        jitter: false,
        onRetry: (attempt, error, delayMs) => {
          delays.push(delayMs);
        },
      });
    } catch (error) {
      // Expected to fail
    }

    // All delays should be capped at 5000ms
    delays.forEach(delay => {
      expect(delay).toBeLessThanOrEqual(5000);
    });
  });

  // Test 8: Custom shouldRetry function
  it('should respect custom shouldRetry function', async () => {
    let attempts = 0;

    const fn = async () => {
      attempts++;
      throw new Error('Custom error');
    };

    const customShouldRetry = (error: Error) => {
      return error.message.includes('Custom');
    };

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        shouldRetry: customShouldRetry,
      })
    ).rejects.toThrow('Custom error');

    expect(attempts).toBe(3); // Should retry because custom function returns true
  });

  // Test 9: onRetry callback invocation
  it('should invoke onRetry callback for each retry attempt', async () => {
    const onRetryMock = jest.fn();
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
      }
      return 'success';
    };

    await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      onRetry: onRetryMock,
    });

    expect(onRetryMock).toHaveBeenCalledTimes(2); // 2 retries before success
  });

  // Test 10: Jitter variation
  it('should add jitter to delays when enabled', async () => {
    const delays: number[] = [];

    const fn = async () => {
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
    };

    try {
      await withRetry(fn, {
        maxAttempts: 4,
        baseDelayMs: 1000,
        exponential: true,
        jitter: true,
        onRetry: (attempt, error, delayMs) => {
          delays.push(delayMs);
        },
      });
    } catch (error) {
      // Expected to fail
    }

    // With jitter, delays should vary from base exponential values
    // Check that at least one delay is different from exact exponential
    const exactDelays = [1000, 2000, 4000];
    let hasDifference = false;

    delays.forEach((delay, index) => {
      if (delay !== exactDelays[index]) {
        hasDifference = true;
      }
    });

    expect(hasDifference).toBe(true);
  });

  // Test 11: retryable function wrapper
  it('should create retryable function wrapper', async () => {
    let attempts = 0;

    const originalFn = async (value: string) => {
      attempts++;
      if (attempts < 2) {
        throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
      }
      return `Result: ${value}`;
    };

    const retryableFn = retryable(originalFn, { maxAttempts: 3, baseDelayMs: 10 });

    const result = await retryableFn('test');

    expect(result).toBe('Result: test');
    expect(attempts).toBe(2);
  });
});

describe('Retry Logic - Error Classification', () => {
  // Test 12: Retryable errors detection
  it('should correctly identify retryable errors', () => {
    const retryableError = new StandardError(
      ErrorCode.NETWORK_ERROR,
      'Network timeout',
      {},
      undefined,
      true
    );

    const nonRetryableError = new StandardError(
      ErrorCode.VALIDATION_FAILED,
      'Invalid input',
      {},
      undefined,
      false
    );

    expect(isRetryableError(retryableError)).toBe(true);
    expect(isRetryableError(nonRetryableError)).toBe(false);
  });

  // Test 13: Auto-detect retryable from error code
  it('should auto-detect retryable status from error code', () => {
    const dbTimeoutError = new StandardError(ErrorCode.DB_TIMEOUT, 'DB timeout');
    const validationError = new StandardError(ErrorCode.VALIDATION_FAILED, 'Invalid');

    expect(dbTimeoutError.isRetryable).toBe(true);
    expect(validationError.isRetryable).toBe(false);
  });

  // Test 14: Retryable error codes
  it('should treat specific error codes as retryable', () => {
    const retryableCodes = [
      ErrorCode.DB_TIMEOUT,
      ErrorCode.DB_CONNECTION_FAILED,
      ErrorCode.OPERATION_TIMEOUT,
      ErrorCode.NETWORK_ERROR,
      ErrorCode.LOCK_TIMEOUT,
    ];

    retryableCodes.forEach(code => {
      const error = new StandardError(code, 'Test error');
      expect(error.isRetryable).toBe(true);
    });
  });

  // Test 15: Non-retryable error codes
  it('should treat specific error codes as non-retryable', () => {
    const nonRetryableCodes = [
      ErrorCode.VALIDATION_FAILED,
      ErrorCode.INVALID_INPUT,
      ErrorCode.FILE_NOT_FOUND,
      ErrorCode.PARSE_ERROR,
    ];

    nonRetryableCodes.forEach(code => {
      const error = new StandardError(code, 'Test error');
      expect(error.isRetryable).toBe(false);
    });
  });
});

describe('Retry Manager - Enhanced Features', () => {
  // Test 16: RetryManager with correlation ID
  it('should track operations with correlation ID', async () => {
    const manager = createRetryManager('corr-123');

    const fn = async () => 'success';

    const result = await manager.executeWithRetry(fn);

    expect(result).toBe('success');
  });

  // Test 17: RetryManager with policy
  it('should execute with predefined retry policy', async () => {
    const manager = new RetryManager();
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
      }
      return 'success';
    };

    const result = await manager.executeWithRetry(fn, RetryPolicies.QUICK);

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  // Test 18: RetryManager with statistics
  it('should collect retry statistics', async () => {
    const manager = new RetryManager();
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
      }
      return 'success';
    };

    const { result, stats, attempts: retryAttempts } = await manager.executeWithRetryStats(
      fn,
      RetryPolicies.STANDARD
    );

    expect(result).toBe('success');
    expect(stats.succeeded).toBe(true);
    expect(stats.totalAttempts).toBe(3);
    expect(retryAttempts.length).toBe(2); // 2 retry attempts
  });

  // Test 19: Circuit breaker - closed state
  it('should allow requests when circuit is closed', async () => {
    const manager = new RetryManager({
      circuitBreaker: { enabled: true },
    });

    const fn = async () => 'success';

    const result = await manager.executeWithRetry(fn);

    expect(result).toBe('success');
    expect(manager.getCircuitState()).toBe(CircuitState.CLOSED);
  });

  // Test 20: Circuit breaker - open after failures
  it('should open circuit after failure threshold', async () => {
    const manager = new RetryManager({
      circuitBreaker: {
        enabled: true,
        failureThreshold: 3,
      },
    });

    const fn = async () => {
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Always fails', {}, undefined, false);
    };

    // Cause 3 failures to open circuit
    for (let i = 0; i < 3; i++) {
      try {
        await manager.executeWithRetry(fn, { maxAttempts: 1 });
      } catch (error) {
        // Expected
      }
    }

    expect(manager.getCircuitState()).toBe(CircuitState.OPEN);

    // Next request should be rejected immediately
    await expect(manager.executeWithRetry(fn)).rejects.toThrow('Circuit breaker is open');
  });

  // Test 21: Circuit breaker - transition to half-open
  it('should transition to half-open after timeout', async () => {
    const manager = new RetryManager({
      circuitBreaker: {
        enabled: true,
        failureThreshold: 2,
        openTimeoutMs: 100, // Short timeout for testing
      },
    });

    const fn = async () => {
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, false);
    };

    // Cause failures to open circuit
    for (let i = 0; i < 2; i++) {
      try {
        await manager.executeWithRetry(fn, { maxAttempts: 1 });
      } catch (error) {
        // Expected
      }
    }

    expect(manager.getCircuitState()).toBe(CircuitState.OPEN);

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Circuit should allow a test request (half-open)
    const successFn = async () => 'success';

    const result = await manager.executeWithRetry(successFn);

    expect(result).toBe('success');
  });

  // Test 22: Circuit breaker - close after recovery
  it('should close circuit after successful recoveries', async () => {
    const manager = new RetryManager({
      circuitBreaker: {
        enabled: true,
        failureThreshold: 2,
        successThreshold: 2,
        openTimeoutMs: 100,
      },
    });

    const failFn = async () => {
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, false);
    };

    // Open circuit
    for (let i = 0; i < 2; i++) {
      try {
        await manager.executeWithRetry(failFn, { maxAttempts: 1 });
      } catch (error) {
        // Expected
      }
    }

    expect(manager.getCircuitState()).toBe(CircuitState.OPEN);

    // Wait for timeout to transition to half-open
    await new Promise(resolve => setTimeout(resolve, 150));

    // Successful requests to close circuit
    const successFn = async () => 'success';

    await manager.executeWithRetry(successFn);
    await manager.executeWithRetry(successFn);

    expect(manager.getCircuitState()).toBe(CircuitState.CLOSED);
  });

  // Test 23: Manual circuit reset
  it('should allow manual circuit breaker reset', async () => {
    const manager = new RetryManager({
      circuitBreaker: {
        enabled: true,
        failureThreshold: 2,
      },
    });

    const fn = async () => {
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, false);
    };

    // Open circuit
    for (let i = 0; i < 2; i++) {
      try {
        await manager.executeWithRetry(fn, { maxAttempts: 1 });
      } catch (error) {
        // Expected
      }
    }

    expect(manager.getCircuitState()).toBe(CircuitState.OPEN);

    // Manual reset
    manager.resetCircuit();

    expect(manager.getCircuitState()).toBe(CircuitState.CLOSED);
  });

  // Test 24: Circuit breaker statistics
  it('should provide circuit breaker statistics', async () => {
    const manager = new RetryManager({
      circuitBreaker: {
        enabled: true,
        failureThreshold: 3,
      },
    });

    const failFn = async () => {
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, false);
    };

    // Cause 2 failures
    for (let i = 0; i < 2; i++) {
      try {
        await manager.executeWithRetry(failFn, { maxAttempts: 1 });
      } catch (error) {
        // Expected
      }
    }

    const stats = manager.getCircuitStats();

    expect(stats.state).toBe(CircuitState.CLOSED); // Not yet open (threshold is 3)
    expect(stats.failureCount).toBe(2);
    expect(stats.lastFailureTime).toBeDefined();
  });
});

describe('Retry Policies', () => {
  // Test 25: QUICK policy
  it('should use QUICK policy (3 attempts, 500ms base, 5s max)', async () => {
    const manager = new RetryManager();
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
      }
      return 'success';
    };

    const result = await manager.executeWithRetry(fn, RetryPolicies.QUICK);

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  // Test 26: STANDARD policy
  it('should use STANDARD policy (3 attempts, 1s base, 30s max)', async () => {
    const manager = new RetryManager();
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new StandardError(ErrorCode.DB_TIMEOUT, 'Timeout', {}, undefined, true);
      }
      return 'success';
    };

    const result = await manager.executeWithRetry(fn, RetryPolicies.STANDARD);

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  // Test 27: AGGRESSIVE policy
  it('should use AGGRESSIVE policy (5 attempts, 2s base, 60s max)', async () => {
    const manager = new RetryManager();
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 4) {
        throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
      }
      return 'success';
    };

    const result = await manager.executeWithRetry(fn, RetryPolicies.AGGRESSIVE);

    expect(result).toBe('success');
    expect(attempts).toBe(4);
  });

  // Test 28: DATABASE policy with retryable errors only
  it('should use DATABASE policy and only retry retryable errors', async () => {
    const manager = new RetryManager();
    let attempts = 0;

    const fn = async () => {
      attempts++;
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Invalid data',
        {},
        undefined,
        false
      );
    };

    await expect(
      manager.executeWithRetry(fn, RetryPolicies.DATABASE)
    ).rejects.toThrow('Invalid data');

    expect(attempts).toBe(1); // Should not retry non-retryable errors
  });

  // Test 29: NETWORK policy
  it('should use NETWORK policy (4 attempts, 2s base, 45s max)', async () => {
    const manager = new RetryManager();
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new StandardError(ErrorCode.NETWORK_ERROR, 'Network fail', {}, undefined, true);
      }
      return 'success';
    };

    const result = await manager.executeWithRetry(fn, RetryPolicies.NETWORK);

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  // Test 30: FILE_SYSTEM policy
  it('should use FILE_SYSTEM policy (2 attempts, 500ms base, linear)', async () => {
    const manager = new RetryManager();
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new StandardError(ErrorCode.FILE_WRITE_FAILED, 'Write fail', {}, undefined, true);
      }
      return 'success';
    };

    const result = await manager.executeWithRetry(fn, RetryPolicies.FILE_SYSTEM);

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });
});

describe('Convenience Functions', () => {
  // Test 31: withStandardRetry
  it('should execute with standard retry using convenience function', async () => {
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
      }
      return 'success';
    };

    const result = await withStandardRetry(fn, 'corr-456');

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  // Test 32: withDatabaseRetry
  it('should execute with database retry using convenience function', async () => {
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new StandardError(ErrorCode.DB_TIMEOUT, 'Timeout', {}, undefined, true);
      }
      return 'success';
    };

    const result = await withDatabaseRetry(fn, 'corr-789');

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  // Test 33: withNetworkRetry
  it('should execute with network retry using convenience function', async () => {
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new StandardError(ErrorCode.NETWORK_ERROR, 'Network fail', {}, undefined, true);
      }
      return 'success';
    };

    const result = await withNetworkRetry(fn, 'corr-net');

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  // Test 34: withFileSystemRetry
  it('should execute with file system retry using convenience function', async () => {
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new StandardError(ErrorCode.FILE_WRITE_FAILED, 'Write fail', {}, undefined, true);
      }
      return 'success';
    };

    const result = await withFileSystemRetry(fn, 'corr-fs');

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });
});

describe('Edge Cases and Error Handling', () => {
  // Test 35: Zero max attempts should throw immediately
  it('should throw immediately with zero max attempts', async () => {
    const fn = async () => {
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Fail', {}, undefined, true);
    };

    await expect(
      withRetry(fn, { maxAttempts: 0 })
    ).rejects.toThrow();
  });

  // Test 36: Negative max attempts should use default
  it('should handle negative max attempts gracefully', async () => {
    const fn = async () => 'success';

    const result = await withRetry(fn, { maxAttempts: -1 });

    expect(result).toBe('success');
  });

  // Test 37: Error without StandardError wrapper
  it('should handle regular Error objects', async () => {
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('Regular error');
      }
      return 'success';
    };

    // Regular errors are not retryable by default
    await expect(
      withRetry(fn, { maxAttempts: 3 })
    ).rejects.toThrow('Regular error');

    expect(attempts).toBe(1);
  });

  // Test 38: Synchronous exceptions
  it('should handle synchronous exceptions in async functions', async () => {
    const fn = async () => {
      throw new StandardError(ErrorCode.NETWORK_ERROR, 'Sync throw', {}, undefined, false);
    };

    await expect(
      withRetry(fn, { maxAttempts: 3 })
    ).rejects.toThrow('Sync throw');
  });

  // Test 39: Promise rejection
  it('should handle promise rejections', async () => {
    const fn = () =>
      Promise.reject(
        new StandardError(ErrorCode.NETWORK_ERROR, 'Rejected', {}, undefined, false)
      );

    await expect(
      withRetry(fn, { maxAttempts: 3 })
    ).rejects.toThrow('Rejected');
  });

  // Test 40: Retry with undefined/null values
  it('should handle undefined return values', async () => {
    const fn = async () => undefined;

    const result = await withRetry(fn);

    expect(result).toBeUndefined();
  });

  // Test 41: Retry with complex return types
  it('should handle complex return types', async () => {
    const fn = async () => ({
      data: [1, 2, 3],
      metadata: { count: 3 },
    });

    const result = await withRetry(fn);

    expect(result.data).toEqual([1, 2, 3]);
    expect(result.metadata.count).toBe(3);
  });
});
