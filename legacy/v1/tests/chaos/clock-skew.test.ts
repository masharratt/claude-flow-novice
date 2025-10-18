/**
 * Chaos Test: Clock Skew Simulation
 *
 * Sprint 3.4: Validates timeout calculations use Redis TIME command
 * instead of local system clock to handle clock skew gracefully.
 *
 * Test Scenario:
 * - Skew coordinator clocks by ±5 minutes using faketime/offset
 * - Verify timeout calculations use Redis TIME command
 * - Verify heartbeat validation handles skew gracefully
 * - Verify no premature timeouts due to clock drift
 * - Success Criteria: All timeouts trigger at correct Redis time
 *
 * Epic: production-blocking-coordination
 * Sprint: 3.4 - Chaos Engineering Tests
 *
 * @module tests/chaos/clock-skew
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import {
  spawnCoordinator,
  killAllCoordinators,
  captureState,
  cleanupRedis,
  sleep,
  DEFAULT_REDIS_CONFIG,
  type CoordinatorInstance,
} from './utils/chaos-helpers.js';

// ===== TEST CONFIGURATION =====

const TEST_CONFIG = {
  CLOCK_SKEW_AHEAD: '+5m', // 5 minutes ahead
  CLOCK_SKEW_BEHIND: '-5m', // 5 minutes behind
  COORDINATOR_TIMEOUT: 10 * 60 * 1000, // 10 minutes
  REDIS_TIME_TOLERANCE: 5000, // 5 seconds tolerance
};

// ===== TEST SUITE =====

describe('Chaos: Clock Skew', () => {
  let coordinators: CoordinatorInstance[] = [];
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis(DEFAULT_REDIS_CONFIG);
    await cleanupRedis();
  });

  afterEach(async () => {
    killAllCoordinators(coordinators);
    await cleanupRedis();
    await redis.quit();
    coordinators = [];
  });

  it(
    'should handle +5 minute clock skew using Redis TIME',
    async () => {
      // Coordinator A: +5 minutes ahead
      const coordA = await spawnCoordinator({
        coordinatorId: 'coord-skew-ahead',
        timeout: TEST_CONFIG.COORDINATOR_TIMEOUT,
        clockSkew: TEST_CONFIG.CLOCK_SKEW_AHEAD,
      });

      coordinators.push(coordA);

      // Wait for coordinator to start
      await sleep(5000);

      // Get Redis TIME
      const redisTime = await redis.time();
      const redisTimestamp = parseInt(redisTime[0]) * 1000 + Math.floor(parseInt(redisTime[1]) / 1000);

      // Get coordinator's local time from heartbeat
      const state = await captureState([coordA]);
      const coordState = state.get(coordA.id);

      expect(coordState).toBeDefined();

      const coordTimestamp = coordState!.heartbeatTimestamp;
      const timeDiff = Math.abs(coordTimestamp - redisTimestamp);

      console.log('\n=== CLOCK SKEW AHEAD TEST ===');
      console.log(`Redis Time: ${redisTimestamp}`);
      console.log(`Coordinator Time: ${coordTimestamp}`);
      console.log(`Time Difference: ${timeDiff}ms (${timeDiff / 60000} minutes)`);

      // Coordinator's clock should be ~5 minutes ahead (but recorded in heartbeat)
      // Skew is 5 minutes = 300000ms
      expect(timeDiff).toBeGreaterThan(4 * 60 * 1000); // At least 4 minutes
      expect(timeDiff).toBeLessThan(6 * 60 * 1000); // At most 6 minutes

      // Verify timeout still uses Redis TIME (coordinator won't timeout prematurely)
      // Wait half the timeout period
      await sleep(5 * 60 * 1000); // 5 minutes

      const stateAfter = await captureState([coordA]);
      const coordStateAfter = stateAfter.get(coordA.id);

      // Coordinator should still be waiting (not timed out)
      expect(coordStateAfter!.status).toBe('waiting');
    },
    15 * 60 * 1000 // 15 minute test timeout
  );

  it(
    'should handle -5 minute clock skew using Redis TIME',
    async () => {
      // Coordinator B: -5 minutes behind
      const coordB = await spawnCoordinator({
        coordinatorId: 'coord-skew-behind',
        timeout: TEST_CONFIG.COORDINATOR_TIMEOUT,
        clockSkew: TEST_CONFIG.CLOCK_SKEW_BEHIND,
      });

      coordinators.push(coordB);

      await sleep(5000);

      // Get Redis TIME
      const redisTime = await redis.time();
      const redisTimestamp = parseInt(redisTime[0]) * 1000 + Math.floor(parseInt(redisTime[1]) / 1000);

      // Get coordinator's local time
      const state = await captureState([coordB]);
      const coordState = state.get(coordB.id);

      expect(coordState).toBeDefined();

      const coordTimestamp = coordState!.heartbeatTimestamp;
      const timeDiff = Math.abs(coordTimestamp - redisTimestamp);

      console.log('\n=== CLOCK SKEW BEHIND TEST ===');
      console.log(`Redis Time: ${redisTimestamp}`);
      console.log(`Coordinator Time: ${coordTimestamp}`);
      console.log(`Time Difference: ${timeDiff}ms (${timeDiff / 60000} minutes)`);

      // Coordinator's clock should be ~5 minutes behind
      expect(timeDiff).toBeGreaterThan(4 * 60 * 1000); // At least 4 minutes
      expect(timeDiff).toBeLessThan(6 * 60 * 1000); // At most 6 minutes

      // Verify timeout still uses Redis TIME (coordinator won't timeout early)
      await sleep(5 * 60 * 1000); // 5 minutes

      const stateAfter = await captureState([coordB]);
      const coordStateAfter = stateAfter.get(coordB.id);

      expect(coordStateAfter!.status).toBe('waiting');
    },
    15 * 60 * 1000
  );

  it(
    'should timeout at correct Redis time despite clock skew',
    async () => {
      const SHORT_TIMEOUT = 2 * 60 * 1000; // 2 minutes

      // Coordinator with +5 minute skew and 2-minute timeout
      const coord = await spawnCoordinator({
        coordinatorId: 'coord-skew-timeout',
        timeout: SHORT_TIMEOUT,
        clockSkew: TEST_CONFIG.CLOCK_SKEW_AHEAD,
      });

      coordinators.push(coord);

      const startTime = Date.now();
      await sleep(3000);

      // Wait for timeout
      await sleep(SHORT_TIMEOUT + 10000); // 2 min + 10 sec buffer

      const state = await captureState([coord]);
      const coordState = state.get(coord.id);

      const elapsedTime = Date.now() - startTime;

      console.log('\n=== TIMEOUT WITH CLOCK SKEW TEST ===');
      console.log(`Elapsed Time: ${elapsedTime}ms`);
      console.log(`Coordinator Status: ${coordState?.status || 'unknown'}`);

      // Coordinator should have timed out at ~2 minutes (Redis time)
      // NOT at ~2 minutes + 5 minute skew = 7 minutes (local time)
      expect(coordState?.status).toBe('timeout');
      expect(elapsedTime).toBeGreaterThan(SHORT_TIMEOUT - 10000); // At least 1:50
      expect(elapsedTime).toBeLessThan(SHORT_TIMEOUT + 60000); // At most 3:00
    },
    5 * 60 * 1000
  );

  it(
    'should handle mixed clock skews across multiple coordinators',
    async () => {
      // Coordinator A: +5 minutes ahead
      const coordA = await spawnCoordinator({
        coordinatorId: 'coord-mixed-a',
        timeout: 10 * 60 * 1000,
        clockSkew: '+5m',
      });

      // Coordinator B: -5 minutes behind
      const coordB = await spawnCoordinator({
        coordinatorId: 'coord-mixed-b',
        timeout: 10 * 60 * 1000,
        clockSkew: '-5m',
      });

      // Coordinator C: No skew
      const coordC = await spawnCoordinator({
        coordinatorId: 'coord-mixed-c',
        timeout: 10 * 60 * 1000,
      });

      coordinators.push(coordA, coordB, coordC);

      await sleep(5000);

      // Get Redis TIME
      const redisTime = await redis.time();
      const redisTimestamp = parseInt(redisTime[0]) * 1000 + Math.floor(parseInt(redisTime[1]) / 1000);

      // Capture all coordinator states
      const states = await captureState(coordinators);

      const stateA = states.get(coordA.id);
      const stateB = states.get(coordB.id);
      const stateC = states.get(coordC.id);

      console.log('\n=== MIXED CLOCK SKEW TEST ===');
      console.log(`Redis Time: ${redisTimestamp}`);
      console.log(`Coordinator A Time: ${stateA?.heartbeatTimestamp} (${TEST_CONFIG.CLOCK_SKEW_AHEAD})`);
      console.log(`Coordinator B Time: ${stateB?.heartbeatTimestamp} (${TEST_CONFIG.CLOCK_SKEW_BEHIND})`);
      console.log(`Coordinator C Time: ${stateC?.heartbeatTimestamp} (no skew)`);

      // All coordinators should be waiting (no premature timeouts)
      expect(stateA?.status).toBe('waiting');
      expect(stateB?.status).toBe('waiting');
      expect(stateC?.status).toBe('waiting');

      // Coordinator C (no skew) should be close to Redis time
      const diffC = Math.abs((stateC?.heartbeatTimestamp || 0) - redisTimestamp);
      expect(diffC).toBeLessThan(TEST_CONFIG.REDIS_TIME_TOLERANCE);

      // Coordinator A (ahead) should be ~5 min ahead
      const diffA = Math.abs((stateA?.heartbeatTimestamp || 0) - redisTimestamp);
      expect(diffA).toBeGreaterThan(4 * 60 * 1000);

      // Coordinator B (behind) should be ~5 min behind
      const diffB = Math.abs((stateB?.heartbeatTimestamp || 0) - redisTimestamp);
      expect(diffB).toBeGreaterThan(4 * 60 * 1000);
    },
    2 * 60 * 1000
  );
});
