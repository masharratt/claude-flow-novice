/**
 * Extended Timeout Testing - Sprint 1.4
 *
 * Configurable timeout tests for blocking coordination system.
 * Validates timeout behavior at multiple intervals from 3-minute baseline to production 30-minute.
 *
 * Epic: production-blocking-coordination
 * Sprint: 1.4 - Extended Timeout Testing
 *
 * Test Coverage Requirements:
 * - 3-minute baseline with signal at 2:30 (coordinator unblocks)
 * - 5-minute timeout without signal (coordinator times out)
 * - Timeout trigger validation at configured time
 * - State cleanup after timeout
 * - Production 30-minute timeout verification (optional long test)
 *
 * Test Categories:
 * 1. Baseline Tests (3 minutes) - Fast validation
 * 2. Extended Tests (5 minutes) - Timeout trigger validation
 * 3. Production Tests (30 minutes) - Optional slow tests
 *
 * @module cfn-loop/__tests__/extended-timeout-testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import {
  BlockingCoordinationSignals,
  SignalType,
  type SignalPayload,
} from '../blocking-coordination-signals.js';

// ===== TEST CONFIGURATION =====

const REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '15'), // Use test database
  retryStrategy: (times: number) => {
    if (times > 3) return null; // Stop retrying after 3 attempts
    return Math.min(times * 50, 500);
  },
};

// Timeout durations (milliseconds)
const TIMEOUTS = {
  BASELINE: 3 * 60 * 1000, // 3 minutes
  EXTENDED: 5 * 60 * 1000, // 5 minutes
  PRODUCTION: 30 * 60 * 1000, // 30 minutes (optional)
  SIGNAL_DELAY: 2.5 * 60 * 1000, // 2:30 - signal before baseline timeout
  TEST_BUFFER: 20 * 1000, // 20 seconds buffer for test timeout
};

// Test timeout values (test timeout = operation timeout + buffer)
const TEST_TIMEOUTS = {
  BASELINE: TIMEOUTS.BASELINE + TIMEOUTS.TEST_BUFFER, // 3:20
  EXTENDED: TIMEOUTS.EXTENDED + TIMEOUTS.TEST_BUFFER, // 5:20
  PRODUCTION: TIMEOUTS.PRODUCTION + TIMEOUTS.TEST_BUFFER, // 30:20
};

// ===== TEST UTILITIES =====

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cleanup Redis test keys
 */
async function cleanupRedis(redis: Redis): Promise<void> {
  try {
    const patterns = [
      'blocking:signal:*',
      'blocking:ack:*',
      'blocking:timeout:*',
      'blocking:idempotency:*',
    ];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (error) {
    console.error('Redis cleanup failed:', error);
  }
}

/**
 * Blocking coordinator with configurable timeout
 */
class BlockingCoordinator {
  private signals: BlockingCoordinationSignals;
  private coordinatorId: string;
  private timeoutMs: number;
  private state: 'waiting' | 'completed' | 'timeout' = 'waiting';
  private timeoutTimer: NodeJS.Timeout | null = null;
  private stateCleanedUp: boolean = false;

  constructor(
    signals: BlockingCoordinationSignals,
    coordinatorId: string,
    timeoutMs: number
  ) {
    this.signals = signals;
    this.coordinatorId = coordinatorId;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Wait for signal with configurable timeout
   */
  async waitForSignal(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set timeout
      this.timeoutTimer = setTimeout(() => {
        this.state = 'timeout';
        this.cleanupState();
        reject(new Error(`Timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      // Poll for signal
      const checkInterval = setInterval(async () => {
        try {
          const result = await this.signals.receiveSignal(this.coordinatorId);

          if (result.exists && result.signal) {
            // Signal received
            clearInterval(checkInterval);
            if (this.timeoutTimer) clearTimeout(this.timeoutTimer);

            this.state = 'completed';
            this.cleanupState();
            resolve();
          }
        } catch (error) {
          clearInterval(checkInterval);
          if (this.timeoutTimer) clearTimeout(this.timeoutTimer);

          this.state = 'timeout';
          this.cleanupState();
          reject(error);
        }
      }, 500); // Check every 500ms
    });
  }

  /**
   * Send signal to another coordinator
   */
  async sendSignal(targetCoordinator: string, signalType: SignalType = SignalType.COMPLETION): Promise<void> {
    await this.signals.sendSignal(
      this.coordinatorId,
      targetCoordinator,
      signalType,
      1,
      { timestamp: Date.now() }
    );
  }

  /**
   * Get current state
   */
  getState(): string {
    return this.state;
  }

  /**
   * Check if state was cleaned up
   */
  isStateCleaned(): boolean {
    return this.stateCleanedUp;
  }

  /**
   * Cleanup coordinator state
   */
  private cleanupState(): void {
    // Mark state as cleaned up
    this.stateCleanedUp = true;

    // Clear any pending timers
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Manual cleanup (for test teardown)
   */
  async cleanup(): Promise<void> {
    this.cleanupState();
    await this.signals.deleteSignal(this.coordinatorId);
  }
}

// ===== TEST SUITE =====

describe('Extended Timeout Testing - Sprint 1.4', () => {
  let redis: Redis;
  let signals: BlockingCoordinationSignals;

  beforeEach(async () => {
    // Initialize Redis client
    redis = new Redis(REDIS_CONFIG);

    // Wait for Redis connection
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });

    // Clean up any existing test data
    await cleanupRedis(redis);

    // Initialize blocking coordination signals
    signals = new BlockingCoordinationSignals({
      redisHost: REDIS_CONFIG.host as string,
      redisPort: REDIS_CONFIG.port as number,
      redisDatabase: REDIS_CONFIG.db as number,
      signalTTL: 86400, // 24 hours
      enableIdempotency: true,
    });

    await signals.connect();
  });

  afterEach(async () => {
    // Cleanup
    await cleanupRedis(redis);
    await signals.disconnect();
    await redis.quit();
  });

  // ===== 1. BASELINE TESTS (3 MINUTES) =====

  describe('3-Minute Baseline Tests', () => {
    it(
      'should unblock coordinator when signal received at 2:30 (before 3-minute timeout)',
      async () => {
        const coordinator = new BlockingCoordinator(
          signals,
          'coordinator-baseline',
          TIMEOUTS.BASELINE
        );

        // Schedule signal at 2:30
        const signalTimer = setTimeout(async () => {
          await coordinator.sendSignal('coordinator-baseline', SignalType.COMPLETION);
        }, TIMEOUTS.SIGNAL_DELAY);

        try {
          // Wait for signal (should complete before timeout)
          await coordinator.waitForSignal();

          // Verify coordinator completed successfully
          expect(coordinator.getState()).toBe('completed');
          expect(coordinator.isStateCleaned()).toBe(true);

          clearTimeout(signalTimer);
        } finally {
          await coordinator.cleanup();
        }
      },
      TEST_TIMEOUTS.BASELINE // 3:20 test timeout
    );

    it(
      'should track elapsed time accurately (signal at 2:30)',
      async () => {
        const coordinator = new BlockingCoordinator(
          signals,
          'coordinator-timing',
          TIMEOUTS.BASELINE
        );

        const startTime = Date.now();

        // Schedule signal at 2:30
        const signalTimer = setTimeout(async () => {
          await coordinator.sendSignal('coordinator-timing', SignalType.COMPLETION);
        }, TIMEOUTS.SIGNAL_DELAY);

        try {
          await coordinator.waitForSignal();

          const elapsedTime = Date.now() - startTime;

          // Verify elapsed time is approximately 2:30 (±5 seconds)
          expect(elapsedTime).toBeGreaterThanOrEqual(TIMEOUTS.SIGNAL_DELAY - 5000);
          expect(elapsedTime).toBeLessThan(TIMEOUTS.BASELINE);

          clearTimeout(signalTimer);
        } finally {
          await coordinator.cleanup();
        }
      },
      TEST_TIMEOUTS.BASELINE
    );

    it(
      'should cleanup state after successful completion (baseline)',
      async () => {
        const coordinator = new BlockingCoordinator(
          signals,
          'coordinator-cleanup-success',
          TIMEOUTS.BASELINE
        );

        // Send signal immediately
        await coordinator.sendSignal('coordinator-cleanup-success', SignalType.COMPLETION);

        try {
          await coordinator.waitForSignal();

          // Verify state cleanup
          expect(coordinator.isStateCleaned()).toBe(true);
          expect(coordinator.getState()).toBe('completed');
        } finally {
          await coordinator.cleanup();
        }
      },
      TEST_TIMEOUTS.BASELINE
    );
  });

  // ===== 2. EXTENDED TESTS (5 MINUTES) =====

  describe('5-Minute Timeout Tests', () => {
    it(
      'should timeout after 5 minutes when no signal received',
      async () => {
        const coordinator = new BlockingCoordinator(
          signals,
          'coordinator-timeout',
          TIMEOUTS.EXTENDED
        );

        const startTime = Date.now();

        try {
          // Wait for signal (no signal sent - should timeout)
          await coordinator.waitForSignal();

          // Should not reach here
          expect.fail('Coordinator should have timed out');
        } catch (error) {
          const elapsedTime = Date.now() - startTime;

          // Verify timeout occurred
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('Timeout');

          // Verify timeout occurred at approximately 5 minutes (±5 seconds)
          expect(elapsedTime).toBeGreaterThanOrEqual(TIMEOUTS.EXTENDED - 5000);
          expect(elapsedTime).toBeLessThan(TIMEOUTS.EXTENDED + 10000);

          // Verify coordinator state
          expect(coordinator.getState()).toBe('timeout');
        } finally {
          await coordinator.cleanup();
        }
      },
      TEST_TIMEOUTS.EXTENDED // 5:20 test timeout
    );

    it(
      'should cleanup state after timeout (5-minute)',
      async () => {
        const coordinator = new BlockingCoordinator(
          signals,
          'coordinator-cleanup-timeout',
          TIMEOUTS.EXTENDED
        );

        try {
          await coordinator.waitForSignal();
          expect.fail('Should have timed out');
        } catch (error) {
          // Verify state cleanup after timeout
          expect(coordinator.isStateCleaned()).toBe(true);
          expect(coordinator.getState()).toBe('timeout');

          // Verify signal was removed from Redis
          const exists = await signals.signalExists('coordinator-cleanup-timeout');
          expect(exists).toBe(false);
        } finally {
          await coordinator.cleanup();
        }
      },
      TEST_TIMEOUTS.EXTENDED
    );

    it(
      'should trigger timeout at exactly configured time (5 minutes)',
      async () => {
        const coordinator = new BlockingCoordinator(
          signals,
          'coordinator-exact-timeout',
          TIMEOUTS.EXTENDED
        );

        const startTime = Date.now();
        let timeoutTriggeredAt = 0;

        try {
          await coordinator.waitForSignal();
          expect.fail('Should have timed out');
        } catch (error) {
          timeoutTriggeredAt = Date.now();

          const timeoutDuration = timeoutTriggeredAt - startTime;

          // Verify timeout triggered within 5 seconds of configured time
          expect(timeoutDuration).toBeGreaterThanOrEqual(TIMEOUTS.EXTENDED - 5000);
          expect(timeoutDuration).toBeLessThan(TIMEOUTS.EXTENDED + 5000);
        } finally {
          await coordinator.cleanup();
        }
      },
      TEST_TIMEOUTS.EXTENDED
    );
  });

  // ===== 3. CONFIGURABLE TIMEOUT TESTS =====

  describe('Configurable Timeout Tests', () => {
    it('should accept custom timeout parameter (1 minute)', async () => {
      const customTimeout = 1 * 60 * 1000; // 1 minute
      const coordinator = new BlockingCoordinator(
        signals,
        'coordinator-custom-1min',
        customTimeout
      );

      const startTime = Date.now();

      try {
        await coordinator.waitForSignal();
        expect.fail('Should have timed out');
      } catch (error) {
        const elapsedTime = Date.now() - startTime;

        // Verify timeout at 1 minute
        expect(elapsedTime).toBeGreaterThanOrEqual(customTimeout - 5000);
        expect(elapsedTime).toBeLessThan(customTimeout + 5000);
      } finally {
        await coordinator.cleanup();
      }
    }, 80000); // 1:20 test timeout

    it('should handle very short timeout (10 seconds)', async () => {
      const shortTimeout = 10 * 1000; // 10 seconds
      const coordinator = new BlockingCoordinator(
        signals,
        'coordinator-short',
        shortTimeout
      );

      const startTime = Date.now();

      try {
        await coordinator.waitForSignal();
        expect.fail('Should have timed out');
      } catch (error) {
        const elapsedTime = Date.now() - startTime;

        // Verify timeout at 10 seconds
        expect(elapsedTime).toBeGreaterThanOrEqual(shortTimeout - 1000);
        expect(elapsedTime).toBeLessThan(shortTimeout + 2000);
      } finally {
        await coordinator.cleanup();
      }
    }, 15000); // 15 second test timeout
  });

  // ===== 4. MULTIPLE COORDINATOR TESTS =====

  describe('Multiple Coordinator Timeout Tests', () => {
    it('should handle different timeout configurations per coordinator', async () => {
      const coordinator1 = new BlockingCoordinator(
        signals,
        'coordinator-multi-1',
        1 * 60 * 1000 // 1 minute
      );

      const coordinator2 = new BlockingCoordinator(
        signals,
        'coordinator-multi-2',
        2 * 60 * 1000 // 2 minutes
      );

      const startTime = Date.now();
      let coord1Timeout = 0;
      let coord2Timeout = 0;

      // Run both coordinators in parallel
      const [result1, result2] = await Promise.allSettled([
        coordinator1.waitForSignal().catch((error) => {
          coord1Timeout = Date.now() - startTime;
          throw error;
        }),
        coordinator2.waitForSignal().catch((error) => {
          coord2Timeout = Date.now() - startTime;
          throw error;
        }),
      ]);

      try {
        // Both should timeout
        expect(result1.status).toBe('rejected');
        expect(result2.status).toBe('rejected');

        // Coordinator 1 should timeout at ~1 minute
        expect(coord1Timeout).toBeGreaterThanOrEqual(55000); // 55s
        expect(coord1Timeout).toBeLessThan(65000); // 1:05

        // Coordinator 2 should timeout at ~2 minutes
        expect(coord2Timeout).toBeGreaterThanOrEqual(115000); // 1:55
        expect(coord2Timeout).toBeLessThan(125000); // 2:05
      } finally {
        await coordinator1.cleanup();
        await coordinator2.cleanup();
      }
    }, 150000); // 2:30 test timeout
  });

  // ===== 5. PRODUCTION TIMEOUT TESTS (OPTIONAL - SLOW) =====

  describe.skip('Production Timeout Tests (30 minutes) - Optional Slow Tests', () => {
    it(
      'should handle production 30-minute timeout',
      async () => {
        const coordinator = new BlockingCoordinator(
          signals,
          'coordinator-production',
          TIMEOUTS.PRODUCTION
        );

        const startTime = Date.now();

        try {
          await coordinator.waitForSignal();
          expect.fail('Should have timed out');
        } catch (error) {
          const elapsedTime = Date.now() - startTime;

          // Verify timeout at 30 minutes
          expect(elapsedTime).toBeGreaterThanOrEqual(TIMEOUTS.PRODUCTION - 10000);
          expect(elapsedTime).toBeLessThan(TIMEOUTS.PRODUCTION + 30000);

          expect(coordinator.getState()).toBe('timeout');
        } finally {
          await coordinator.cleanup();
        }
      },
      TEST_TIMEOUTS.PRODUCTION // 30:20 test timeout
    );

    it(
      'should unblock production coordinator when signal received at 29:30',
      async () => {
        const coordinator = new BlockingCoordinator(
          signals,
          'coordinator-production-signal',
          TIMEOUTS.PRODUCTION
        );

        // Schedule signal at 29:30
        const signalDelay = 29.5 * 60 * 1000; // 29:30
        const signalTimer = setTimeout(async () => {
          await coordinator.sendSignal(
            'coordinator-production-signal',
            SignalType.COMPLETION
          );
        }, signalDelay);

        try {
          await coordinator.waitForSignal();

          // Verify coordinator completed successfully
          expect(coordinator.getState()).toBe('completed');
          expect(coordinator.isStateCleaned()).toBe(true);

          clearTimeout(signalTimer);
        } finally {
          await coordinator.cleanup();
        }
      },
      TEST_TIMEOUTS.PRODUCTION
    );
  });

  // ===== 6. EDGE CASES =====

  describe('Edge Cases', () => {
    it('should handle immediate signal (0ms delay)', async () => {
      const coordinator = new BlockingCoordinator(
        signals,
        'coordinator-immediate',
        TIMEOUTS.BASELINE
      );

      // Send signal immediately (before waiting)
      await coordinator.sendSignal('coordinator-immediate', SignalType.COMPLETION);

      try {
        await coordinator.waitForSignal();

        // Should complete immediately
        expect(coordinator.getState()).toBe('completed');
      } finally {
        await coordinator.cleanup();
      }
    });

    it('should handle multiple signals (last one wins)', async () => {
      const coordinator = new BlockingCoordinator(
        signals,
        'coordinator-multiple-signals',
        TIMEOUTS.BASELINE
      );

      // Send multiple signals
      await coordinator.sendSignal('coordinator-multiple-signals', SignalType.RETRY_REQUEST);
      await sleep(100);
      await coordinator.sendSignal('coordinator-multiple-signals', SignalType.COMPLETION);

      try {
        await coordinator.waitForSignal();

        // Should complete with last signal
        expect(coordinator.getState()).toBe('completed');

        const signal = await signals.receiveSignal('coordinator-multiple-signals');
        expect(signal.signal?.type).toBe(SignalType.COMPLETION);
      } finally {
        await coordinator.cleanup();
      }
    });

    it('should handle coordinator restart after timeout', async () => {
      const coordinator1 = new BlockingCoordinator(
        signals,
        'coordinator-restart',
        10000 // 10 seconds
      );

      try {
        await coordinator1.waitForSignal();
        expect.fail('Should have timed out');
      } catch (error) {
        // First timeout
        expect(coordinator1.getState()).toBe('timeout');
      } finally {
        await coordinator1.cleanup();
      }

      // Restart coordinator with new timeout
      const coordinator2 = new BlockingCoordinator(
        signals,
        'coordinator-restart',
        TIMEOUTS.BASELINE
      );

      // Send signal after restart
      await coordinator2.sendSignal('coordinator-restart', SignalType.COMPLETION);

      try {
        await coordinator2.waitForSignal();

        // Should complete successfully
        expect(coordinator2.getState()).toBe('completed');
      } finally {
        await coordinator2.cleanup();
      }
    }, 20000);
  });
});
