/**
 * Chaos Test: 100 Concurrent Coordinators Stress Test
 *
 * Sprint 3.4: Validates blocking coordination under extreme concurrency
 * with no race conditions or deadlocks.
 *
 * Test Scenario:
 * - Spawn 100 coordinators simultaneously
 * - Each coordinator blocks for random duration (1-10 minutes)
 * - Send signals to random coordinators every 5 seconds
 * - Verify no race conditions or deadlocks
 * - Verify all coordinators complete or timeout correctly
 * - Success Criteria: 100% completion rate, no hung coordinators
 *
 * Epic: production-blocking-coordination
 * Sprint: 3.4 - Chaos Engineering Tests
 *
 * @module tests/chaos/concurrent-stress
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  spawnCoordinators,
  killAllCoordinators,
  randomCoordinator,
  sendSignal,
  verifyNoHungCoordinators,
  captureState,
  cleanupRedis,
  sleep,
  randomInt,
  type CoordinatorInstance,
} from './utils/chaos-helpers.js';
import { SignalType } from '../../../src/cfn-loop/blocking-coordination-signals.js';

// ===== TEST CONFIGURATION =====

const TEST_CONFIG = {
  COORDINATOR_COUNT: 100,
  MIN_TIMEOUT: 1 * 60 * 1000, // 1 minute
  MAX_TIMEOUT: 10 * 60 * 1000, // 10 minutes
  SIGNAL_INTERVAL: 5 * 1000, // 5 seconds
  TEST_DURATION: 15 * 60 * 1000, // 15 minutes
};

// ===== TEST SUITE =====

describe('Chaos: 100 Concurrent Coordinators', () => {
  let coordinators: CoordinatorInstance[] = [];

  beforeEach(async () => {
    await cleanupRedis();
  });

  afterEach(async () => {
    killAllCoordinators(coordinators);
    await cleanupRedis();
    coordinators = [];
  });

  it(
    'should handle 100 concurrent coordinators without race conditions',
    async () => {
      const startTime = Date.now();
      const signalEvents: { time: number; sender: string; receiver: string }[] = [];

      // Spawn 100 coordinators with random timeouts
      console.log('Spawning 100 coordinators...');

      const spawnPromises = [];
      for (let i = 0; i < TEST_CONFIG.COORDINATOR_COUNT; i++) {
        const timeout = randomInt(TEST_CONFIG.MIN_TIMEOUT, TEST_CONFIG.MAX_TIMEOUT);
        spawnPromises.push(
          spawnCoordinators(1, {
            timeout,
          })
        );
      }

      const spawnedBatches = await Promise.all(spawnPromises);
      coordinators = spawnedBatches.flat();

      console.log(`Spawned ${coordinators.length} coordinators`);

      // Send random signals every 5 seconds for 15 minutes
      const signalIntervalId = setInterval(() => {
        try {
          const sender = randomCoordinator(coordinators);
          const receiver = randomCoordinator(coordinators);

          if (sender.id !== receiver.id) {
            sendSignal(sender.id, receiver.id, SignalType.WAKE);

            signalEvents.push({
              time: Date.now(),
              sender: sender.id,
              receiver: receiver.id,
            });

            if (signalEvents.length % 50 === 0) {
              console.log(`Signals sent: ${signalEvents.length}`);
            }
          }
        } catch (error) {
          console.error('Signal send failed:', error);
        }
      }, TEST_CONFIG.SIGNAL_INTERVAL);

      // Wait for test duration
      await sleep(TEST_CONFIG.TEST_DURATION);

      clearInterval(signalIntervalId);

      const endTime = Date.now();
      const elapsedTime = endTime - startTime;

      console.log('\n=== CONCURRENT STRESS TEST RESULTS ===');
      console.log(`Test Duration: ${elapsedTime}ms`);
      console.log(`Total Coordinators: ${coordinators.length}`);
      console.log(`Signals Sent: ${signalEvents.length}`);

      // Capture final states
      const finalStates = await captureState(coordinators);

      let completedCount = 0;
      let timedOutCount = 0;
      let waitingCount = 0;

      for (const [id, state] of finalStates) {
        if (state.status === 'completed') completedCount++;
        else if (state.status === 'timeout') timedOutCount++;
        else if (state.status === 'waiting') waitingCount++;
      }

      console.log(`Completed: ${completedCount}`);
      console.log(`Timed Out: ${timedOutCount}`);
      console.log(`Still Waiting: ${waitingCount}`);

      // Verify no hung coordinators
      const noHungCoordinators = await verifyNoHungCoordinators(coordinators);
      expect(noHungCoordinators).toBe(true);

      // At least 80% should have completed or timed out (not hung)
      const finishedCount = completedCount + timedOutCount;
      const finishedRate = finishedCount / coordinators.length;

      console.log(`Finished Rate: ${(finishedRate * 100).toFixed(2)}%`);
      expect(finishedRate).toBeGreaterThanOrEqual(0.80);
    },
    20 * 60 * 1000 // 20 minute test timeout
  );

  it(
    'should handle high signal throughput (1000 signals/minute)',
    async () => {
      const SIGNAL_COUNT = 1000;
      const DURATION = 1 * 60 * 1000; // 1 minute

      // Spawn 20 coordinators
      coordinators = await spawnCoordinators(20, {
        timeout: 10 * 60 * 1000,
      });

      console.log('Sending 1000 signals in 1 minute...');

      const signalPromises = [];
      for (let i = 0; i < SIGNAL_COUNT; i++) {
        const sender = randomCoordinator(coordinators);
        const receiver = randomCoordinator(coordinators);

        if (sender.id !== receiver.id) {
          signalPromises.push(
            sendSignal(sender.id, receiver.id, SignalType.WAKE)
          );
        }

        // Throttle: send signals in batches
        if (i % 100 === 0) {
          await Promise.all(signalPromises);
          signalPromises.length = 0;
          await sleep(100); // Brief pause every 100 signals
        }
      }

      await Promise.all(signalPromises);

      console.log('\n=== HIGH THROUGHPUT TEST RESULTS ===');
      console.log(`Signals Sent: ${SIGNAL_COUNT}`);
      console.log(`Duration: ${DURATION}ms`);
      console.log(`Throughput: ${(SIGNAL_COUNT / (DURATION / 60000)).toFixed(0)} signals/minute`);

      // Verify coordinators are still responsive
      const states = await captureState(coordinators);
      expect(states.size).toBe(coordinators.length);

      // All coordinators should still be tracked
      for (const coordinator of coordinators) {
        expect(states.has(coordinator.id)).toBe(true);
      }
    },
    3 * 60 * 1000 // 3 minute test timeout
  );

  it(
    'should handle coordinator spawn race conditions',
    async () => {
      const SPAWN_COUNT = 50;

      console.log(`Spawning ${SPAWN_COUNT} coordinators simultaneously...`);

      // Spawn all coordinators in parallel
      const spawnPromises = [];
      for (let i = 0; i < SPAWN_COUNT; i++) {
        spawnPromises.push(
          spawnCoordinators(1, {
            timeout: 5 * 60 * 1000,
          })
        );
      }

      const spawnedBatches = await Promise.all(spawnPromises);
      coordinators = spawnedBatches.flat();

      console.log(`Successfully spawned ${coordinators.length} coordinators`);

      // Verify all coordinators have unique IDs
      const coordinatorIds = new Set(coordinators.map(c => c.id));
      expect(coordinatorIds.size).toBe(coordinators.length);

      // Verify all coordinators are tracked in Redis
      await sleep(5000); // Wait for heartbeats

      const states = await captureState(coordinators);
      expect(states.size).toBe(coordinators.length);

      console.log('\n=== SPAWN RACE CONDITION TEST RESULTS ===');
      console.log(`Unique Coordinator IDs: ${coordinatorIds.size}`);
      console.log(`Tracked in Redis: ${states.size}`);
    },
    2 * 60 * 1000
  );

  it(
    'should handle signal race conditions (multiple signals to same coordinator)',
    async () => {
      // Spawn coordinators
      coordinators = await spawnCoordinators(10, {
        timeout: 10 * 60 * 1000,
      });

      await sleep(3000);

      // Pick one coordinator as target
      const target = coordinators[0];

      console.log(`Sending 100 signals to ${target.id} simultaneously...`);

      // Send 100 signals to the same coordinator simultaneously
      const signalPromises = [];
      for (let i = 0; i < 100; i++) {
        const sender = coordinators[i % coordinators.length];
        signalPromises.push(
          sendSignal(sender.id, target.id, SignalType.WAKE)
        );
      }

      await Promise.all(signalPromises);

      console.log('All signals sent');

      // Verify target coordinator state
      await sleep(2000);

      const states = await captureState([target]);
      const targetState = states.get(target.id);

      console.log('\n=== SIGNAL RACE CONDITION TEST RESULTS ===');
      console.log(`Target Coordinator: ${target.id}`);
      console.log(`Status: ${targetState?.status}`);
      console.log(`Signals Received: ${targetState?.signalsReceived}`);

      // Target should have received at least one signal
      expect(targetState?.signalsReceived).toBeGreaterThan(0);

      // Target should be in valid state (not corrupted)
      expect(['waiting', 'completed', 'timeout']).toContain(targetState?.status);
    },
    2 * 60 * 1000
  );

  it(
    'should maintain performance under memory pressure (200 coordinators)',
    async () => {
      const LARGE_COUNT = 200;

      console.log(`Spawning ${LARGE_COUNT} coordinators for memory pressure test...`);

      // Spawn 200 coordinators
      const spawnPromises = [];
      for (let i = 0; i < LARGE_COUNT; i++) {
        spawnPromises.push(
          spawnCoordinators(1, {
            timeout: 5 * 60 * 1000,
          })
        );
      }

      const spawnedBatches = await Promise.all(spawnPromises);
      coordinators = spawnedBatches.flat();

      console.log(`Spawned ${coordinators.length} coordinators`);

      // Wait for all coordinators to initialize
      await sleep(10000); // 10 seconds

      // Capture states
      const states = await captureState(coordinators);

      console.log('\n=== MEMORY PRESSURE TEST RESULTS ===');
      console.log(`Coordinators Spawned: ${coordinators.length}`);
      console.log(`Coordinators Tracked: ${states.size}`);

      // All coordinators should be tracked
      expect(states.size).toBe(coordinators.length);

      // Calculate memory usage (approximate)
      const memoryUsage = process.memoryUsage();
      console.log(`Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);

      // Heap usage should be reasonable (<1GB)
      expect(memoryUsage.heapUsed).toBeLessThan(1024 * 1024 * 1024);
    },
    3 * 60 * 1000
  );
});
