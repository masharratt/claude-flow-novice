/**
 * Cleanup Script Integration Tests - Sprint 3.2 Loop 3 Iteration 2/10
 *
 * REC-001: Verify cleanup-blocking-coordination.sh doesn't affect active coordinators
 *
 * Test Coverage:
 * 1. Stale coordinator cleanup success (>10 min old)
 * 2. Active coordinator preservation (<5 min old)
 * 3. Mixed scenario (5 stale + 3 active coordinators)
 * 4. Redis SCAN performance (10k+ coordinator heartbeats)
 * 5. Error handling (Redis connection failure)
 *
 * Acceptance Criteria:
 * - All 5 test scenarios implemented ≥0.85
 * - Tests pass 100% ≥0.90
 * - Error handling comprehensive ≥0.80
 * - Minimum coverage: 80% of cleanup script logic
 *
 * @module cfn-loop/__tests__/cleanup-integration
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ES module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== TEST CONFIGURATION =====

const REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '1'), // Use separate DB for tests
  retryStrategy: (times: number) => {
    if (times > 3) return null;
    return Math.min(times * 50, 500);
  },
};

const CLEANUP_SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/cleanup-blocking-coordination.sh');
const TEST_TIMEOUT = 90000; // 90 seconds for performance tests
const STALE_THRESHOLD_SECONDS = 600; // 10 minutes

// ===== TEST UTILITIES =====

/**
 * Create a coordinator heartbeat in Redis
 */
async function createHeartbeat(
  redis: Redis,
  coordinatorId: string,
  ageSeconds: number = 0
): Promise<void> {
  const timestamp = Date.now() - ageSeconds * 1000;
  const heartbeatKey = `blocking:heartbeat:${coordinatorId}`;
  const heartbeatValue = JSON.stringify({
    coordinatorId,
    timestamp,
    seq: 1,
  });

  await redis.set(heartbeatKey, heartbeatValue);
}

/**
 * Create full coordinator state (heartbeat + ACKs + signals + activity)
 */
async function createCoordinatorState(
  redis: Redis,
  coordinatorId: string,
  ageSeconds: number = 0
): Promise<void> {
  const timestamp = Date.now() - ageSeconds * 1000;

  // 1. Heartbeat
  await redis.set(
    `blocking:heartbeat:${coordinatorId}`,
    JSON.stringify({ coordinatorId, timestamp, seq: 1 })
  );

  // 2. ACKs
  await redis.set(
    `blocking:ack:${coordinatorId}:signal1`,
    JSON.stringify({ ack: 'test' })
  );
  await redis.set(
    `blocking:ack:${coordinatorId}:signal2`,
    JSON.stringify({ ack: 'test' })
  );

  // 3. Signal
  await redis.set(
    `blocking:signal:${coordinatorId}`,
    JSON.stringify({ signal: 'test' })
  );

  // 4. Idempotency
  await redis.set(
    `blocking:idempotency:op1:${coordinatorId}`,
    JSON.stringify({ idempotent: 'test' })
  );

  // 5. Activity tracking
  await redis.set(
    `coordinator:activity:${coordinatorId}`,
    JSON.stringify({ timestamp, activity: 'test' })
  );
}

/**
 * Count coordinator-related keys in Redis
 */
async function countCoordinatorKeys(redis: Redis, coordinatorId: string): Promise<number> {
  const patterns = [
    `blocking:heartbeat:${coordinatorId}`,
    `blocking:ack:${coordinatorId}:*`,
    `blocking:signal:${coordinatorId}`,
    `blocking:idempotency:*${coordinatorId}*`,
    `coordinator:activity:${coordinatorId}`,
  ];

  let totalKeys = 0;
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    totalKeys += keys.length;
  }

  return totalKeys;
}

/**
 * Execute cleanup script and parse output
 */
interface CleanupResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  coordinatorsChecked: number;
  coordinatorsFound: number;
  keysDeleted: number;
  cleanupErrors: number;
}

function executeCleanupScript(dryRun: boolean = false): CleanupResult {
  const env = {
    ...process.env,
    REDIS_HOST: REDIS_CONFIG.host || 'localhost',
    REDIS_PORT: String(REDIS_CONFIG.port || 6379),
    REDIS_DB: String(REDIS_CONFIG.db || 0),
  };

  const args = dryRun ? '--dry-run' : '';
  const command = `bash ${CLEANUP_SCRIPT_PATH} ${args}`;

  let exitCode = 0;
  let stdout = '';
  let stderr = '';

  try {
    stdout = execSync(command, {
      env,
      encoding: 'utf-8',
      timeout: 60000, // 60 second timeout
    });
  } catch (error: any) {
    exitCode = error.status || 1;
    stdout = error.stdout || '';
    stderr = error.stderr || '';
  }

  // Parse output for metrics
  const coordinatorsCheckedMatch = stdout.match(/Total coordinators checked:\s*(\d+)/);
  const coordinatorsFoundMatch = stdout.match(/Stale coordinators found:\s*(\d+)/);
  const keysDeletedMatch = stdout.match(/Keys deleted:\s*(\d+)/);
  const cleanupErrorsMatch = stdout.match(/Cleanup errors:\s*(\d+)/);

  return {
    exitCode,
    stdout,
    stderr,
    coordinatorsChecked: coordinatorsCheckedMatch ? parseInt(coordinatorsCheckedMatch[1], 10) : 0,
    coordinatorsFound: coordinatorsFoundMatch ? parseInt(coordinatorsFoundMatch[1], 10) : 0,
    keysDeleted: keysDeletedMatch ? parseInt(keysDeletedMatch[1], 10) : 0,
    cleanupErrors: cleanupErrorsMatch ? parseInt(cleanupErrorsMatch[1], 10) : 0,
  };
}

/**
 * Clean up all test data
 */
async function cleanupRedis(redis: Redis): Promise<void> {
  try {
    const patterns = [
      'blocking:heartbeat:*',
      'blocking:ack:*',
      'blocking:signal:*',
      'blocking:idempotency:*',
      'coordinator:activity:*',
      'test:*',
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

/**
 * Verify cleanup script exists
 */
function verifyCleanupScriptExists(): void {
  if (!fs.existsSync(CLEANUP_SCRIPT_PATH)) {
    throw new Error(
      `Cleanup script not found at: ${CLEANUP_SCRIPT_PATH}\n` +
        'Ensure scripts/cleanup-blocking-coordination.sh exists'
    );
  }
}

// ===== TEST SUITE =====

describe('Cleanup Script Integration Tests - Sprint 3.2', () => {
  let redis: Redis;

  beforeEach(async () => {
    // Verify cleanup script exists
    verifyCleanupScriptExists();

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
    // Clean up test data
    await cleanupRedis(redis);

    // Disconnect Redis
    await redis.quit();
  }, TEST_TIMEOUT);

  // ===== TEST SCENARIO 1: STALE COORDINATOR CLEANUP SUCCESS =====

  describe('Scenario 1: Stale Coordinator Cleanup Success', () => {
    it('should cleanup coordinator with heartbeat >10 minutes old', async () => {
      const coordinatorId = 'stale-coordinator-1';
      const ageSeconds = 700; // 11 minutes 40 seconds (>10 min threshold)

      // Create stale coordinator state
      await createCoordinatorState(redis, coordinatorId, ageSeconds);

      // Verify state exists before cleanup
      let keyCount = await countCoordinatorKeys(redis, coordinatorId);
      expect(keyCount).toBeGreaterThan(0);

      // Execute cleanup script (dry-run first)
      const dryRunResult = executeCleanupScript(true);
      expect(dryRunResult.exitCode).toBe(0);
      expect(dryRunResult.coordinatorsFound).toBe(1);

      // Verify dry-run didn't delete anything
      keyCount = await countCoordinatorKeys(redis, coordinatorId);
      expect(keyCount).toBeGreaterThan(0);

      // Execute actual cleanup
      const result = executeCleanupScript(false);

      // Assertions
      expect(result.exitCode).toBe(0);
      expect(result.coordinatorsChecked).toBe(1);
      expect(result.coordinatorsFound).toBe(1);
      expect(result.keysDeleted).toBeGreaterThan(0);
      expect(result.cleanupErrors).toBe(0);

      // Verify all state was removed
      keyCount = await countCoordinatorKeys(redis, coordinatorId);
      expect(keyCount).toBe(0);

      // Verify logs mention the coordinator
      expect(result.stdout).toContain(coordinatorId);
      expect(result.stdout).toContain('Cleanup completed successfully');
    });

    it('should cleanup multiple stale coordinators in one execution', async () => {
      const coordinatorIds = ['stale-1', 'stale-2', 'stale-3'];
      const ageSeconds = 650; // 10 minutes 50 seconds

      // Create multiple stale coordinators
      for (const id of coordinatorIds) {
        await createCoordinatorState(redis, id, ageSeconds);
      }

      // Execute cleanup
      const result = executeCleanupScript(false);

      // Assertions
      expect(result.exitCode).toBe(0);
      expect(result.coordinatorsChecked).toBe(3);
      expect(result.coordinatorsFound).toBe(3);
      expect(result.keysDeleted).toBeGreaterThan(0);

      // Verify all coordinators were cleaned up
      for (const id of coordinatorIds) {
        const keyCount = await countCoordinatorKeys(redis, id);
        expect(keyCount).toBe(0);
      }
    });
  });

  // ===== TEST SCENARIO 2: ACTIVE COORDINATOR PRESERVATION =====

  describe('Scenario 2: Active Coordinator Preservation', () => {
    it('should preserve coordinator with heartbeat <5 minutes old', async () => {
      const coordinatorId = 'active-coordinator-1';
      const ageSeconds = 250; // 4 minutes 10 seconds (well within threshold)

      // Create active coordinator state
      await createCoordinatorState(redis, coordinatorId, ageSeconds);

      // Verify state exists
      let keyCount = await countCoordinatorKeys(redis, coordinatorId);
      const initialKeyCount = keyCount;
      expect(keyCount).toBeGreaterThan(0);

      // Execute cleanup
      const result = executeCleanupScript(false);

      // Assertions
      expect(result.exitCode).toBe(0);
      expect(result.coordinatorsChecked).toBe(1);
      expect(result.coordinatorsFound).toBe(0); // Should NOT be flagged as stale
      expect(result.keysDeleted).toBe(0); // Should NOT delete any keys

      // Verify state was preserved
      keyCount = await countCoordinatorKeys(redis, coordinatorId);
      expect(keyCount).toBe(initialKeyCount);

      // Verify logs show coordinator as active
      expect(result.stdout).toContain('Coordinator active');
    });

    it('should preserve multiple active coordinators', async () => {
      const coordinatorIds = ['active-1', 'active-2', 'active-3'];
      const ageSeconds = 120; // 2 minutes

      // Create multiple active coordinators
      for (const id of coordinatorIds) {
        await createCoordinatorState(redis, id, ageSeconds);
      }

      // Execute cleanup
      const result = executeCleanupScript(false);

      // Assertions
      expect(result.exitCode).toBe(0);
      expect(result.coordinatorsChecked).toBe(3);
      expect(result.coordinatorsFound).toBe(0);
      expect(result.keysDeleted).toBe(0);

      // Verify all coordinators were preserved
      for (const id of coordinatorIds) {
        const keyCount = await countCoordinatorKeys(redis, id);
        expect(keyCount).toBeGreaterThan(0);
      }
    });
  });

  // ===== TEST SCENARIO 3: MIXED SCENARIO (STALE + ACTIVE) =====

  describe('Scenario 3: Mixed Scenario (Stale + Active)', () => {
    it('should cleanup 5 stale coordinators and preserve 3 active coordinators', async () => {
      // Create 5 stale coordinators (>10 min old)
      const staleIds = ['stale-1', 'stale-2', 'stale-3', 'stale-4', 'stale-5'];
      const staleAge = 700; // 11 minutes 40 seconds

      for (const id of staleIds) {
        await createCoordinatorState(redis, id, staleAge);
      }

      // Create 3 active coordinators (<5 min old)
      const activeIds = ['active-1', 'active-2', 'active-3'];
      const activeAge = 200; // 3 minutes 20 seconds

      for (const id of activeIds) {
        await createCoordinatorState(redis, id, activeAge);
      }

      // Execute cleanup
      const result = executeCleanupScript(false);

      // Assertions
      expect(result.exitCode).toBe(0);
      expect(result.coordinatorsChecked).toBe(8); // 5 stale + 3 active
      expect(result.coordinatorsFound).toBe(5); // Only stale ones
      expect(result.keysDeleted).toBeGreaterThan(0);
      expect(result.cleanupErrors).toBe(0);

      // Verify stale coordinators were removed
      for (const id of staleIds) {
        const keyCount = await countCoordinatorKeys(redis, id);
        expect(keyCount).toBe(0);
      }

      // Verify active coordinators were preserved
      for (const id of activeIds) {
        const keyCount = await countCoordinatorKeys(redis, id);
        expect(keyCount).toBeGreaterThan(0);
      }

      // Verify logs
      expect(result.stdout).toContain('Stale coordinators found: 5');
      expect(result.stdout).toContain('Cleanup completed successfully');
    });

    it('should handle edge case: coordinator exactly at 10 minute threshold', async () => {
      const coordinatorId = 'edge-case-coordinator';
      const ageSeconds = STALE_THRESHOLD_SECONDS; // Exactly 10 minutes

      // Create coordinator at exact threshold
      await createCoordinatorState(redis, coordinatorId, ageSeconds);

      // Execute cleanup
      const result = executeCleanupScript(false);

      // At exact threshold, coordinator should NOT be cleaned up (> not >=)
      expect(result.exitCode).toBe(0);
      expect(result.coordinatorsFound).toBe(0);

      const keyCount = await countCoordinatorKeys(redis, coordinatorId);
      expect(keyCount).toBeGreaterThan(0); // Should be preserved
    });

    it('should handle edge case: coordinator 1 second past threshold', async () => {
      const coordinatorId = 'just-stale-coordinator';
      const ageSeconds = STALE_THRESHOLD_SECONDS + 1; // 10 minutes 1 second

      // Create coordinator just past threshold
      await createCoordinatorState(redis, coordinatorId, ageSeconds);

      // Execute cleanup
      const result = executeCleanupScript(false);

      // Should be cleaned up
      expect(result.exitCode).toBe(0);
      expect(result.coordinatorsFound).toBe(1);

      const keyCount = await countCoordinatorKeys(redis, coordinatorId);
      expect(keyCount).toBe(0); // Should be removed
    });
  });

  // ===== TEST SCENARIO 4: REDIS SCAN PERFORMANCE (10K+ KEYS) =====

  describe('Scenario 4: Redis SCAN Performance (10k+ Keys)', () => {
    it(
      'should cleanup 8k stale and preserve 2k active coordinators in <60 seconds',
      async () => {
        const totalCoordinators = 10000;
        const staleCount = 8000;
        const activeCount = 2000;

        console.log(`Creating ${totalCoordinators} coordinator heartbeats...`);

        // Create 8k stale coordinators (only heartbeats for performance)
        const staleAge = 700; // 11 minutes 40 seconds
        for (let i = 0; i < staleCount; i++) {
          await createHeartbeat(redis, `stale-${i}`, staleAge);

          // Progress logging every 1000
          if ((i + 1) % 1000 === 0) {
            console.log(`Created ${i + 1}/${staleCount} stale heartbeats`);
          }
        }

        // Create 2k active coordinators
        const activeAge = 200; // 3 minutes 20 seconds
        for (let i = 0; i < activeCount; i++) {
          await createHeartbeat(redis, `active-${i}`, activeAge);

          // Progress logging every 500
          if ((i + 1) % 500 === 0) {
            console.log(`Created ${i + 1}/${activeCount} active heartbeats`);
          }
        }

        console.log('All heartbeats created. Executing cleanup...');

        // Execute cleanup and measure duration
        const startTime = Date.now();
        const result = executeCleanupScript(false);
        const duration = Date.now() - startTime;

        console.log(`Cleanup completed in ${duration}ms (${(duration / 1000).toFixed(2)}s)`);

        // Assertions
        expect(result.exitCode).toBe(0);
        expect(result.coordinatorsChecked).toBe(totalCoordinators);
        expect(result.coordinatorsFound).toBe(staleCount);
        expect(result.cleanupErrors).toBe(0);

        // Performance assertion: Must complete in <60 seconds
        expect(duration).toBeLessThan(60000);

        // Verify cleanup accuracy (sample check)
        const staleKeyCount = await countCoordinatorKeys(redis, 'stale-0');
        expect(staleKeyCount).toBe(0); // Should be removed

        const activeKeyCount = await countCoordinatorKeys(redis, 'active-0');
        expect(activeKeyCount).toBeGreaterThan(0); // Should be preserved

        // Verify total remaining keys
        const remainingHeartbeats = await redis.keys('blocking:heartbeat:*');
        expect(remainingHeartbeats.length).toBe(activeCount);
      },
      TEST_TIMEOUT
    );

    it('should use SCAN (not KEYS) to avoid blocking Redis', async () => {
      // Create some test coordinators
      for (let i = 0; i < 100; i++) {
        await createHeartbeat(redis, `test-${i}`, 700);
      }

      // Execute cleanup
      const result = executeCleanupScript(false);

      // Verify script uses SCAN by checking logs
      // The script should log "Scanning for blocking coordinator heartbeats..."
      expect(result.stdout).toContain('Scanning for blocking coordinator heartbeats');

      // Verify successful completion
      expect(result.exitCode).toBe(0);
    });
  });

  // ===== TEST SCENARIO 5: ERROR HANDLING (REDIS CONNECTION FAILURE) =====

  describe('Scenario 5: Error Handling (Redis Connection Failure)', () => {
    it('should exit with code 1 when Redis connection fails', () => {
      // Override environment to point to invalid Redis
      const env = {
        ...process.env,
        REDIS_HOST: 'invalid-redis-host-12345.local',
        REDIS_PORT: '9999',
        REDIS_DB: '0',
      };

      const command = `bash ${CLEANUP_SCRIPT_PATH}`;

      let exitCode = 0;
      let stdout = '';

      try {
        stdout = execSync(command, {
          env,
          encoding: 'utf-8',
          timeout: 10000,
        });
      } catch (error: any) {
        exitCode = error.status || 1;
        stdout = error.stdout || '';
      }

      // Assertions
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Redis connection failed');
      expect(stdout).toContain('Cleanup aborted');
    });

    it('should handle empty Redis (no coordinators) gracefully', async () => {
      // Ensure Redis is empty
      await cleanupRedis(redis);

      // Execute cleanup
      const result = executeCleanupScript(false);

      // Assertions
      expect(result.exitCode).toBe(0);
      expect(result.coordinatorsChecked).toBe(0);
      expect(result.coordinatorsFound).toBe(0);
      expect(result.keysDeleted).toBe(0);

      // Verify logs
      expect(result.stdout).toContain('No coordinator heartbeats found');
      expect(result.stdout).toContain('Cleanup complete (nothing to do)');
    });

    it('should handle invalid heartbeat data gracefully', async () => {
      const coordinatorId = 'invalid-heartbeat';

      // Create heartbeat with invalid JSON
      await redis.set(`blocking:heartbeat:${coordinatorId}`, 'invalid-json-data');

      // Execute cleanup
      const result = executeCleanupScript(false);

      // Should not crash, should log warning
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Invalid or missing heartbeat');
    });

    it('should log cleanup errors but continue processing', async () => {
      // Create a coordinator with valid heartbeat
      await createHeartbeat(redis, 'coordinator-1', 700);

      // Create a second coordinator with invalid data
      await redis.set('blocking:heartbeat:invalid', 'not-json');

      // Create a third valid coordinator
      await createHeartbeat(redis, 'coordinator-2', 700);

      // Execute cleanup
      const result = executeCleanupScript(false);

      // Should process valid coordinators despite errors
      expect(result.exitCode).toBe(0);
      expect(result.coordinatorsChecked).toBeGreaterThan(0);

      // Should log warnings for invalid data
      expect(result.stdout).toContain('Invalid or missing heartbeat');
    });
  });

  // ===== ADDITIONAL TESTS: DRY-RUN MODE =====

  describe('Dry-Run Mode Validation', () => {
    it('should not delete any keys in dry-run mode', async () => {
      const coordinatorId = 'dry-run-test';
      const ageSeconds = 700; // Stale

      // Create stale coordinator
      await createCoordinatorState(redis, coordinatorId, ageSeconds);

      const initialKeyCount = await countCoordinatorKeys(redis, coordinatorId);
      expect(initialKeyCount).toBeGreaterThan(0);

      // Execute dry-run
      const result = executeCleanupScript(true);

      // Assertions
      expect(result.exitCode).toBe(0);
      expect(result.coordinatorsFound).toBe(1);
      expect(result.stdout).toContain('[DRY-RUN]');

      // Verify no keys were deleted
      const finalKeyCount = await countCoordinatorKeys(redis, coordinatorId);
      expect(finalKeyCount).toBe(initialKeyCount);
    });
  });
});
