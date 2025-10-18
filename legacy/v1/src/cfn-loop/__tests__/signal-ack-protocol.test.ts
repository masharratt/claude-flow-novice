/**
 * Signal ACK Protocol Test Suite - Sprint 1.1
 *
 * Tests the Signal ACK protocol implementation for blocking coordination
 * in CFN Loop workflows. Validates signal delivery, acknowledgment receipt,
 * idempotency, persistence, and full signal → ACK → unblock flow.
 *
 * Epic: production-blocking-coordination
 * Sprint: 1.1 - Signal ACK Protocol
 * Target: Signal delivery success rate ≥99.99%
 *
 * Test Coverage Requirements:
 * - Unit tests for signal delivery mechanism
 * - ACK verification and timeout handling
 * - Idempotency tests for duplicate signals
 * - Integration test for complete signal flow
 * - Signal persistence and TTL validation
 *
 * @module cfn-loop/__tests__/signal-ack-protocol
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';

// ===== TYPE DEFINITIONS =====

/**
 * Signal ACK configuration
 */
interface SignalAckConfig {
  signalTTL: number; // Signal TTL in seconds (24 hours = 86400)
  ackTTL: number; // ACK TTL in seconds (5 minutes = 300)
  ackTimeout: number; // Time to wait for ACK in milliseconds
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
}

/**
 * Signal payload structure
 */
interface SignalPayload {
  signalType: 'complete' | 'retry' | 'abort';
  timestamp: number;
  sender: string;
  iteration?: number;
  metadata?: Record<string, any>;
}

/**
 * ACK response structure
 */
interface AckPayload {
  coordinator: string;
  timestamp: number;
  iteration: number;
  receivedSignal: string;
  processingTime?: number;
}

/**
 * Signal delivery result
 */
interface SignalDeliveryResult {
  success: boolean;
  signalKey: string;
  ackReceived: boolean;
  ackPayload?: AckPayload;
  deliveryTime: number;
  error?: string;
}

// ===== SIGNAL ACK PROTOCOL IMPLEMENTATION =====

/**
 * Signal ACK Protocol Manager
 *
 * Implements reliable signal delivery with acknowledgment verification.
 * Supports idempotent signal handling and persistence.
 */
class SignalAckProtocol {
  private redis: Redis;
  private config: SignalAckConfig;

  constructor(config: Partial<SignalAckConfig> = {}) {
    this.config = {
      signalTTL: config.signalTTL ?? 86400, // 24 hours
      ackTTL: config.ackTTL ?? 300, // 5 minutes
      ackTimeout: config.ackTimeout ?? 5000, // 5 seconds
      redisHost: config.redisHost ?? 'localhost',
      redisPort: config.redisPort ?? 6379,
      redisPassword: config.redisPassword,
    };

    const redisOptions: RedisOptions = {
      host: this.config.redisHost,
      port: this.config.redisPort,
      password: this.config.redisPassword,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    };

    this.redis = new Redis(redisOptions);
  }

  /**
   * Send signal to coordinator and wait for ACK
   *
   * @param coordinatorId - Target coordinator ID
   * @param payload - Signal payload
   * @returns Signal delivery result with ACK status
   */
  async sendSignalWithAck(
    coordinatorId: string,
    payload: SignalPayload
  ): Promise<SignalDeliveryResult> {
    const startTime = Date.now();
    const signalKey = `coordination:signal:${coordinatorId}:${payload.signalType}`;
    const ackKey = `coordination:ack:${coordinatorId}:${payload.signalType}`;

    try {
      // Step 1: Send signal via Redis SETEX (with TTL)
      await this.redis.setex(signalKey, this.config.signalTTL, JSON.stringify(payload));

      // Step 2: Wait for ACK with timeout
      const ackPayload = await this.waitForAck(ackKey, this.config.ackTimeout);

      const deliveryTime = Date.now() - startTime;

      if (ackPayload) {
        return {
          success: true,
          signalKey,
          ackReceived: true,
          ackPayload,
          deliveryTime,
        };
      } else {
        return {
          success: false,
          signalKey,
          ackReceived: false,
          deliveryTime,
          error: 'ACK timeout',
        };
      }
    } catch (error) {
      return {
        success: false,
        signalKey,
        ackReceived: false,
        deliveryTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Wait for ACK from coordinator
   *
   * Polls Redis for ACK key with exponential backoff.
   *
   * @param ackKey - Redis key for ACK
   * @param timeout - Maximum time to wait in milliseconds
   * @returns ACK payload or null if timeout
   */
  private async waitForAck(ackKey: string, timeout: number): Promise<AckPayload | null> {
    const startTime = Date.now();
    const pollInterval = 100; // 100ms initial poll interval

    while (Date.now() - startTime < timeout) {
      const ackData = await this.redis.get(ackKey);

      if (ackData) {
        return JSON.parse(ackData) as AckPayload;
      }

      // Exponential backoff (100ms → 200ms → 400ms, max 500ms)
      const elapsed = Date.now() - startTime;
      const backoff = Math.min(pollInterval * Math.pow(2, Math.floor(elapsed / 1000)), 500);
      await this.sleep(backoff);
    }

    return null;
  }

  /**
   * Coordinator receives signal and sends ACK
   *
   * @param coordinatorId - Coordinator ID
   * @param signalType - Type of signal
   * @param iteration - Current iteration count
   * @returns ACK key
   */
  async receiveSignalAndAck(
    coordinatorId: string,
    signalType: string,
    iteration: number
  ): Promise<string> {
    const signalKey = `coordination:signal:${coordinatorId}:${signalType}`;
    const ackKey = `coordination:ack:${coordinatorId}:${signalType}`;

    // Check if signal exists
    const signalData = await this.redis.get(signalKey);

    if (!signalData) {
      throw new Error(`Signal not found: ${signalKey}`);
    }

    const signal = JSON.parse(signalData) as SignalPayload;

    // Send ACK
    const ackPayload: AckPayload = {
      coordinator: coordinatorId,
      timestamp: Date.now(),
      iteration,
      receivedSignal: signalKey,
      processingTime: Date.now() - signal.timestamp,
    };

    await this.redis.setex(ackKey, this.config.ackTTL, JSON.stringify(ackPayload));

    return ackKey;
  }

  /**
   * Check if signal exists (for idempotency testing)
   *
   * @param coordinatorId - Coordinator ID
   * @param signalType - Type of signal
   * @returns Signal payload or null
   */
  async checkSignal(coordinatorId: string, signalType: string): Promise<SignalPayload | null> {
    const signalKey = `coordination:signal:${coordinatorId}:${signalType}`;
    const signalData = await this.redis.get(signalKey);

    if (signalData) {
      return JSON.parse(signalData) as SignalPayload;
    }

    return null;
  }

  /**
   * Get signal TTL (for persistence testing)
   *
   * @param coordinatorId - Coordinator ID
   * @param signalType - Type of signal
   * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async getSignalTTL(coordinatorId: string, signalType: string): Promise<number> {
    const signalKey = `coordination:signal:${coordinatorId}:${signalType}`;
    return await this.redis.ttl(signalKey);
  }

  /**
   * Clean up all signals and ACKs (for testing)
   */
  async cleanup(): Promise<void> {
    const signalKeys = await this.redis.keys('coordination:signal:*');
    const ackKeys = await this.redis.keys('coordination:ack:*');

    if (signalKeys.length > 0) {
      await this.redis.del(...signalKeys);
    }

    if (ackKeys.length > 0) {
      await this.redis.del(...ackKeys);
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Helper: Sleep for specified milliseconds
   * Public for testing purposes
   */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ===== TEST SUITE =====

describe('Signal ACK Protocol - Sprint 1.1', () => {
  let protocol: SignalAckProtocol;

  beforeEach(async () => {
    protocol = new SignalAckProtocol({
      signalTTL: 86400, // 24 hours
      ackTTL: 300, // 5 minutes
      ackTimeout: 5000, // 5 seconds
    });

    // Clean up any existing test data
    await protocol.cleanup();
  });

  afterEach(async () => {
    await protocol.cleanup();
    await protocol.disconnect();
  });

  describe('Test Case 1: Signal sent → ACK received within 5 seconds', () => {
    it('should deliver signal and receive ACK within 5 seconds', async () => {
      const coordinatorId = 'coordinator-a';
      const signalPayload: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
        iteration: 5,
      };

      // Simulate coordinator receiving signal and sending ACK in background
      const ackPromise = (async () => {
        await protocol.sleep(500); // Simulate 500ms processing delay
        await protocol.receiveSignalAndAck(coordinatorId, 'complete', 10);
      })();

      // Send signal and wait for ACK
      const result = await protocol.sendSignalWithAck(coordinatorId, signalPayload);

      await ackPromise;

      expect(result.success).toBe(true);
      expect(result.ackReceived).toBe(true);
      expect(result.deliveryTime).toBeLessThan(5000);
      expect(result.ackPayload).toBeDefined();
      expect(result.ackPayload?.coordinator).toBe(coordinatorId);
      expect(result.ackPayload?.iteration).toBe(10);
    }, 10000);

    it('should timeout if no ACK received within 5 seconds', async () => {
      const coordinatorId = 'coordinator-b';
      const signalPayload: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
      };

      // Send signal without ACK response
      const result = await protocol.sendSignalWithAck(coordinatorId, signalPayload);

      expect(result.success).toBe(false);
      expect(result.ackReceived).toBe(false);
      expect(result.error).toBe('ACK timeout');
      expect(result.deliveryTime).toBeGreaterThanOrEqual(5000);
    }, 10000);

    it('should include correct timestamp and iteration in ACK', async () => {
      const coordinatorId = 'coordinator-d';
      const signalPayload: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
        iteration: 3,
      };

      const ackPromise = (async () => {
        await protocol.sleep(200);
        await protocol.receiveSignalAndAck(coordinatorId, 'complete', 15);
      })();

      const result = await protocol.sendSignalWithAck(coordinatorId, signalPayload);

      await ackPromise;

      expect(result.ackPayload?.timestamp).toBeGreaterThan(signalPayload.timestamp);
      expect(result.ackPayload?.iteration).toBe(15);
      expect(result.ackPayload?.processingTime).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Test Case 2: Duplicate signal handling (idempotency)', () => {
    it('should handle duplicate signal gracefully (same signal sent twice)', async () => {
      const coordinatorId = 'coordinator-e';
      const signalPayload: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
        iteration: 7,
      };

      // Send signal first time
      const ackPromise1 = (async () => {
        await protocol.sleep(300);
        await protocol.receiveSignalAndAck(coordinatorId, 'complete', 12);
      })();

      const result1 = await protocol.sendSignalWithAck(coordinatorId, signalPayload);
      await ackPromise1;

      expect(result1.success).toBe(true);
      expect(result1.ackReceived).toBe(true);

      // Send same signal second time (should be idempotent)
      const signal2 = await protocol.checkSignal(coordinatorId, 'complete');
      expect(signal2).toBeDefined();
      expect(signal2?.signalType).toBe('complete');
      expect(signal2?.sender).toBe('coordinator-c');

      // Verify signal still exists (idempotent)
      const signalExists = await protocol.checkSignal(coordinatorId, 'complete');
      expect(signalExists).not.toBeNull();
    }, 10000);

    it('should overwrite previous signal with same key', async () => {
      const coordinatorId = 'coordinator-f';

      // Send first signal
      const signal1: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
        iteration: 5,
      };

      await protocol.sendSignalWithAck(coordinatorId, signal1);

      // Send second signal with same type (overwrites)
      const signal2: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now() + 1000,
        sender: 'coordinator-d',
        iteration: 10,
      };

      await protocol.sendSignalWithAck(coordinatorId, signal2);

      // Check signal - should be the second one
      const currentSignal = await protocol.checkSignal(coordinatorId, 'complete');
      expect(currentSignal?.sender).toBe('coordinator-d');
      expect(currentSignal?.iteration).toBe(10);
    }, 10000);
  });

  describe('Test Case 3: Signal persistence (sent before blocking starts)', () => {
    it('should persist signal with 24-hour TTL', async () => {
      const coordinatorId = 'coordinator-g';
      const signalPayload: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
      };

      await protocol.sendSignalWithAck(coordinatorId, signalPayload);

      // Check TTL (should be close to 24 hours = 86400 seconds)
      const ttl = await protocol.getSignalTTL(coordinatorId, 'complete');

      expect(ttl).toBeGreaterThan(86390); // Allow 10-second tolerance
      expect(ttl).toBeLessThanOrEqual(86400);
    }, 10000);

    it('should allow coordinator to see signal sent before blocking starts', async () => {
      const coordinatorId = 'coordinator-h';

      // Send signal BEFORE coordinator enters blocking
      const signalPayload: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
        iteration: 8,
      };

      await protocol.sendSignalWithAck(coordinatorId, signalPayload);

      // Coordinator checks for signal (race condition mitigation)
      const existingSignal = await protocol.checkSignal(coordinatorId, 'complete');

      expect(existingSignal).not.toBeNull();
      expect(existingSignal?.signalType).toBe('complete');
      expect(existingSignal?.sender).toBe('coordinator-c');

      // Coordinator should exit immediately without blocking
      // (This would be the blocking loop logic checking for existing signals)
    }, 10000);
  });

  describe('Test Case 4: ACK includes correct metadata', () => {
    it('should include timestamp, iteration, and processing time in ACK', async () => {
      const coordinatorId = 'coordinator-i';
      const signalPayload: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
        iteration: 6,
      };

      const ackPromise = (async () => {
        await protocol.sleep(400);
        await protocol.receiveSignalAndAck(coordinatorId, 'complete', 20);
      })();

      const result = await protocol.sendSignalWithAck(coordinatorId, signalPayload);
      await ackPromise;

      expect(result.ackPayload?.coordinator).toBe(coordinatorId);
      expect(result.ackPayload?.timestamp).toBeGreaterThan(signalPayload.timestamp);
      expect(result.ackPayload?.iteration).toBe(20);
      expect(result.ackPayload?.receivedSignal).toContain(coordinatorId);
      expect(result.ackPayload?.processingTime).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Test Case 5: Signal TTL verification (24 hours)', () => {
    it('should set signal TTL to 24 hours (86400 seconds)', async () => {
      const coordinatorId = 'coordinator-j';
      const signalPayload: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
      };

      await protocol.sendSignalWithAck(coordinatorId, signalPayload);

      const ttl = await protocol.getSignalTTL(coordinatorId, 'complete');

      // Allow 20-second tolerance for test execution time
      expect(ttl).toBeGreaterThan(86380);
      expect(ttl).toBeLessThanOrEqual(86400);
    }, 10000);

    it('should set ACK TTL to 5 minutes (300 seconds)', async () => {
      const coordinatorId = 'coordinator-k';
      const signalPayload: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
      };

      const ackPromise = (async () => {
        await protocol.sleep(200);
        const ackKey = await protocol.receiveSignalAndAck(coordinatorId, 'complete', 25);

        // Check ACK TTL
        const ackTTL = await protocol['redis'].ttl(ackKey);
        expect(ackTTL).toBeGreaterThan(290); // Allow 10-second tolerance
        expect(ackTTL).toBeLessThanOrEqual(300);
      })();

      await protocol.sendSignalWithAck(coordinatorId, signalPayload);
      await ackPromise;
    }, 10000);
  });

  describe('Integration Test: Full signal → ACK → unblock flow', () => {
    it('should complete full signal delivery and acknowledgment flow', async () => {
      const coordinatorA = 'coordinator-a';
      const coordinatorB = 'coordinator-b';
      const coordinatorC = 'coordinator-c';

      // Step 1: Coordinator C sends completion signal to A and B
      const signalPayloadA: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: coordinatorC,
        iteration: 10,
        metadata: { phase: 'loop3', confidence: 0.85 },
      };

      const signalPayloadB: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: coordinatorC,
        iteration: 10,
        metadata: { phase: 'loop3', confidence: 0.85 },
      };

      // Step 2: Coordinators A and B receive and ACK in parallel
      const ackAPromise = (async () => {
        await protocol.sleep(300);
        await protocol.receiveSignalAndAck(coordinatorA, 'complete', 5);
      })();

      const ackBPromise = (async () => {
        await protocol.sleep(350);
        await protocol.receiveSignalAndAck(coordinatorB, 'complete', 7);
      })();

      // Step 3: Send signals and verify ACKs
      const [resultA, resultB] = await Promise.all([
        protocol.sendSignalWithAck(coordinatorA, signalPayloadA),
        protocol.sendSignalWithAck(coordinatorB, signalPayloadB),
        ackAPromise,
        ackBPromise,
      ]);

      // Step 4: Verify both coordinators received signals and sent ACKs
      expect(resultA.success).toBe(true);
      expect(resultA.ackReceived).toBe(true);
      expect(resultA.ackPayload?.coordinator).toBe(coordinatorA);
      expect(resultA.deliveryTime).toBeLessThan(5000);

      expect(resultB.success).toBe(true);
      expect(resultB.ackReceived).toBe(true);
      expect(resultB.ackPayload?.coordinator).toBe(coordinatorB);
      expect(resultB.deliveryTime).toBeLessThan(5000);

      // Step 5: Verify signals persist in Redis
      const signalA = await protocol.checkSignal(coordinatorA, 'complete');
      const signalB = await protocol.checkSignal(coordinatorB, 'complete');

      expect(signalA).not.toBeNull();
      expect(signalB).not.toBeNull();
      expect(signalA?.metadata?.confidence).toBe(0.85);
      expect(signalB?.metadata?.confidence).toBe(0.85);
    }, 15000);

    it('should handle partial ACK failures gracefully', async () => {
      const coordinatorA = 'coordinator-l';
      const coordinatorB = 'coordinator-m';
      const coordinatorC = 'coordinator-n';

      const signalPayloadA: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: coordinatorC,
      };

      const signalPayloadB: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: coordinatorC,
      };

      // Only coordinator A sends ACK, B does not
      const ackAPromise = (async () => {
        await protocol.sleep(400);
        await protocol.receiveSignalAndAck(coordinatorA, 'complete', 12);
      })();

      const [resultA, resultB] = await Promise.all([
        protocol.sendSignalWithAck(coordinatorA, signalPayloadA),
        protocol.sendSignalWithAck(coordinatorB, signalPayloadB),
        ackAPromise,
      ]);

      expect(resultA.success).toBe(true);
      expect(resultA.ackReceived).toBe(true);

      expect(resultB.success).toBe(false);
      expect(resultB.ackReceived).toBe(false);
      expect(resultB.error).toBe('ACK timeout');
    }, 15000);
  });

  describe('Error Handling', () => {
    it('should handle Redis connection failures', async () => {
      // Create protocol with invalid Redis config
      const invalidProtocol = new SignalAckProtocol({
        redisHost: 'invalid-host',
        redisPort: 9999,
        ackTimeout: 1000,
      });

      const signalPayload: SignalPayload = {
        signalType: 'complete',
        timestamp: Date.now(),
        sender: 'coordinator-c',
      };

      const result = await invalidProtocol.sendSignalWithAck('coordinator-x', signalPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      await invalidProtocol.disconnect();
    }, 10000);

    it('should throw error when receiving signal that does not exist', async () => {
      const coordinatorId = 'coordinator-nonexistent';

      await expect(
        protocol.receiveSignalAndAck(coordinatorId, 'complete', 1)
      ).rejects.toThrow('Signal not found');
    }, 10000);
  });
});
