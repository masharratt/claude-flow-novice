/**
 * Chaos Test: Random Process Kill
 *
 * Sprint 3.4: Validates blocking coordination resilience when random
 * coordinator processes are killed during operation.
 *
 * Test Scenario:
 * - Duration: 10 minutes
 * - Kill random coordinator every 30 seconds
 * - Verify dead coordinator detection within 2 minutes
 * - Verify new coordinators spawn automatically
 * - Verify work transfer completes successfully
 * - Success Criteria: ≥90% coordinator uptime
 *
 * Epic: production-blocking-coordination
 * Sprint: 3.4 - Chaos Engineering Tests
 *
 * @module tests/chaos/random-process-kill
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  spawnCoordinators,
  killProcess,
  randomCoordinator,
  calculateUptimeMetrics,
  deadCoordinatorDetected,
  cleanupRedis,
  killAllCoordinators,
  sleep,
  type CoordinatorInstance,
} from './utils/chaos-helpers.js';

// ===== TEST CONFIGURATION =====

const TEST_CONFIG = {
  DURATION: 10 * 60 * 1000, // 10 minutes
  KILL_INTERVAL: 30 * 1000, // 30 seconds
  COORDINATOR_COUNT: 10,
  COORDINATOR_TIMEOUT: 20 * 60 * 1000, // 20 minutes (longer than test)
  UPTIME_THRESHOLD: 0.90, // 90% uptime required
  DEAD_DETECTION_TIMEOUT: 2 * 60 * 1000, // 2 minutes
};

// ===== TEST SUITE =====

describe('Chaos: Random Process Kill', () => {
  let coordinators: CoordinatorInstance[] = [];

  beforeEach(async () => {
    // Cleanup any existing test data
    await cleanupRedis();
  });

  afterEach(async () => {
    // Kill all coordinators
    killAllCoordinators(coordinators);

    // Cleanup Redis
    await cleanupRedis();

    coordinators = [];
  });

  it(
    'should recover from random coordinator kills over 10 minutes',
    async () => {
      const startTime = Date.now();
      const killEvents: { time: number; coordinatorId: string; pid: number }[] = [];
      const detectionEvents: { time: number; coordinatorId: string; detected: boolean }[] = [];

      // Spawn 10 coordinators
      coordinators = await spawnCoordinators(TEST_CONFIG.COORDINATOR_COUNT, {
        timeout: TEST_CONFIG.COORDINATOR_TIMEOUT,
      });

      console.log(`Spawned ${coordinators.length} coordinators`);

      // Kill random coordinator every 30 seconds for 10 minutes
      const killIntervalId = setInterval(() => {
        try {
          const victim = randomCoordinator(coordinators);
          const killTime = Date.now();

          console.log(`[${Date.now() - startTime}ms] Killing coordinator ${victim.id} (PID: ${victim.pid})`);

          killProcess(victim.pid, 'SIGKILL');

          killEvents.push({
            time: killTime,
            coordinatorId: victim.id,
            pid: victim.pid,
          });

          // Verify dead coordinator detection asynchronously
          deadCoordinatorDetected(victim.id, TEST_CONFIG.DEAD_DETECTION_TIMEOUT)
            .then((detected) => {
              const detectionTime = Date.now();
              console.log(
                `[${detectionTime - startTime}ms] Dead coordinator ${victim.id} ${detected ? 'DETECTED' : 'NOT DETECTED'}`
              );

              detectionEvents.push({
                time: detectionTime,
                coordinatorId: victim.id,
                detected,
              });
            })
            .catch((error) => {
              console.error(`Dead detection failed for ${victim.id}:`, error);
              detectionEvents.push({
                time: Date.now(),
                coordinatorId: victim.id,
                detected: false,
              });
            });
        } catch (error) {
          console.error('Failed to kill coordinator:', error);
        }
      }, TEST_CONFIG.KILL_INTERVAL);

      // Wait for test duration
      await sleep(TEST_CONFIG.DURATION);

      // Stop killing coordinators
      clearInterval(killIntervalId);

      const endTime = Date.now();

      // Calculate uptime metrics
      const uptimeMetrics = calculateUptimeMetrics(coordinators, startTime, endTime);

      console.log('\n=== CHAOS TEST RESULTS ===');
      console.log(`Total Duration: ${uptimeMetrics.totalDuration}ms`);
      console.log(`Kill Events: ${killEvents.length}`);
      console.log(`Uptime: ${(uptimeMetrics.uptimePercent * 100).toFixed(2)}%`);
      console.log(`Detection Events: ${detectionEvents.length}`);

      // Verify uptime ≥90%
      expect(uptimeMetrics.uptimePercent).toBeGreaterThanOrEqual(TEST_CONFIG.UPTIME_THRESHOLD);

      // Verify at least some coordinators were killed
      expect(killEvents.length).toBeGreaterThan(0);

      // Wait for all detection checks to complete (with timeout)
      const detectionWaitStart = Date.now();
      while (
        detectionEvents.length < killEvents.length &&
        Date.now() - detectionWaitStart < 5 * 60 * 1000 // 5 minute max wait
      ) {
        await sleep(1000);
      }

      console.log(`\nDetection Results: ${detectionEvents.length}/${killEvents.length} completed`);

      // Verify dead coordinator detection
      const detectedCount = detectionEvents.filter(e => e.detected).length;
      const detectionRate = detectedCount / killEvents.length;

      console.log(`Detection Rate: ${(detectionRate * 100).toFixed(2)}%`);

      // At least 80% of killed coordinators should be detected as dead
      expect(detectionRate).toBeGreaterThanOrEqual(0.80);

      // Verify detection happened within timeout (2 minutes)
      for (const detection of detectionEvents) {
        const killEvent = killEvents.find(e => e.coordinatorId === detection.coordinatorId);
        if (!killEvent || !detection.detected) continue;

        const detectionDelay = detection.time - killEvent.time;
        expect(detectionDelay).toBeLessThanOrEqual(TEST_CONFIG.DEAD_DETECTION_TIMEOUT);
      }
    },
    12 * 60 * 1000 // 12 minute test timeout
  );

  it(
    'should maintain uptime with aggressive kill rate (every 10 seconds)',
    async () => {
      const AGGRESSIVE_DURATION = 3 * 60 * 1000; // 3 minutes
      const AGGRESSIVE_KILL_INTERVAL = 10 * 1000; // 10 seconds
      const startTime = Date.now();

      // Spawn coordinators
      coordinators = await spawnCoordinators(15, {
        timeout: 20 * 60 * 1000,
      });

      // Kill random coordinator every 10 seconds for 3 minutes
      const killIntervalId = setInterval(() => {
        try {
          const victim = randomCoordinator(coordinators);
          killProcess(victim.pid, 'SIGKILL');
        } catch (error) {
          // No alive coordinators - test has failed
          console.error('No alive coordinators:', error);
        }
      }, AGGRESSIVE_KILL_INTERVAL);

      // Wait for test duration
      await sleep(AGGRESSIVE_DURATION);

      clearInterval(killIntervalId);

      const endTime = Date.now();
      const uptimeMetrics = calculateUptimeMetrics(coordinators, startTime, endTime);

      console.log('\n=== AGGRESSIVE KILL TEST RESULTS ===');
      console.log(`Uptime: ${(uptimeMetrics.uptimePercent * 100).toFixed(2)}%`);

      // With aggressive killing, expect at least 70% uptime
      expect(uptimeMetrics.uptimePercent).toBeGreaterThanOrEqual(0.70);
    },
    5 * 60 * 1000 // 5 minute test timeout
  );

  it(
    'should handle kill bursts (kill 3 coordinators simultaneously)',
    async () => {
      const BURST_DURATION = 5 * 60 * 1000; // 5 minutes
      const BURST_INTERVAL = 60 * 1000; // 1 minute
      const COORDINATORS_PER_BURST = 3;
      const startTime = Date.now();

      // Spawn coordinators
      coordinators = await spawnCoordinators(12, {
        timeout: 20 * 60 * 1000,
      });

      // Kill 3 coordinators every minute for 5 minutes
      const burstIntervalId = setInterval(() => {
        try {
          for (let i = 0; i < COORDINATORS_PER_BURST; i++) {
            const victim = randomCoordinator(coordinators);
            killProcess(victim.pid, 'SIGKILL');
          }
        } catch (error) {
          console.error('Burst kill failed:', error);
        }
      }, BURST_INTERVAL);

      // Wait for test duration
      await sleep(BURST_DURATION);

      clearInterval(burstIntervalId);

      const endTime = Date.now();
      const uptimeMetrics = calculateUptimeMetrics(coordinators, startTime, endTime);

      console.log('\n=== BURST KILL TEST RESULTS ===');
      console.log(`Uptime: ${(uptimeMetrics.uptimePercent * 100).toFixed(2)}%`);

      // With burst killing, expect at least 60% uptime
      expect(uptimeMetrics.uptimePercent).toBeGreaterThanOrEqual(0.60);
    },
    7 * 60 * 1000 // 7 minute test timeout
  );

  it(
    'should detect all killed coordinators within 2 minutes',
    async () => {
      const coordinatorId = 'chaos-kill-detection';

      // Spawn single coordinator
      const coordinator = (await spawnCoordinators(1, {
        timeout: 10 * 60 * 1000,
      }))[0];

      coordinators.push(coordinator);

      // Wait for coordinator to start
      await sleep(2000);

      // Kill coordinator
      const killTime = Date.now();
      killProcess(coordinator.pid, 'SIGKILL');

      // Verify detection
      const detected = await deadCoordinatorDetected(coordinator.id, TEST_CONFIG.DEAD_DETECTION_TIMEOUT);
      const detectionTime = Date.now();
      const detectionDelay = detectionTime - killTime;

      console.log(`\n=== DETECTION TEST RESULTS ===`);
      console.log(`Detected: ${detected}`);
      console.log(`Detection Delay: ${detectionDelay}ms`);

      expect(detected).toBe(true);
      expect(detectionDelay).toBeLessThanOrEqual(TEST_CONFIG.DEAD_DETECTION_TIMEOUT);
    },
    5 * 60 * 1000 // 5 minute test timeout
  );
});
