#!/usr/bin/env node

/**
 * CFN v3 Worker Connection Test
 *
 * Tests coordinator → worker connection establishment and tracking.
 * Validates cfnConnectionCount, cfnWorkerSpawnCount metrics.
 */

import { CfnTestHarness } from '../lib/cfn-test-harness.js';

const TEST_CONFIG = {
  workerCount: parseInt(process.env.CFN_TEST_WORKERS) || 5,
  coordinatorId: 'test-coordinator-001',
  taskId: `test-task-${Date.now()}`,
  timeout: 30000,
};

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('CFN v3 Worker Connection Test');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const harness = new CfnTestHarness({
    verbose: process.env.CFN_TEST_VERBOSE === 'true',
    debug: process.env.CFN_TEST_DEBUG === 'true',
  });

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Initialize harness
    console.log('[1/4] Initializing test harness...');
    await harness.init();
    console.log('✅ Test harness initialized\n');

    // Spawn coordinator
    console.log('[2/4] Spawning coordinator...');
    const coordinator = await harness.spawnCoordinator(TEST_CONFIG.coordinatorId, {
      taskId: TEST_CONFIG.taskId,
    });
    console.log(`✅ Coordinator spawned (PID: ${coordinator.pid})\n`);

    // Spawn workers
    console.log(`[3/4] Spawning ${TEST_CONFIG.workerCount} workers...`);
    const workers = [];
    const connectionTimes = [];

    for (let i = 1; i <= TEST_CONFIG.workerCount; i++) {
      const workerId = `test-worker-${String(i).padStart(3, '0')}`;
      const startTime = Date.now();

      try {
        const worker = await harness.spawnWorker(workerId, TEST_CONFIG.coordinatorId);
        const connectionTime = Date.now() - startTime;

        workers.push(worker);
        connectionTimes.push(connectionTime);

        console.log(`  ├─ Worker ${i}/${TEST_CONFIG.workerCount}: ${workerId} (${connectionTime}ms)`);
      } catch (error) {
        console.error(`  ├─ ❌ Worker ${i} failed: ${error.message}`);
        testsFailed++;
      }
    }

    console.log(`✅ All workers spawned\n`);

    // Validate connections
    console.log('[4/4] Validating connections...');

    // Test 1: Worker spawn count
    const spawnValidation = harness.validateConnections(TEST_CONFIG.workerCount);
    console.log(`  ${spawnValidation.message}`);
    if (spawnValidation.passed) testsPassed++;
    else testsFailed++;

    // Test 2: Connection count matches worker count
    const metrics = harness.getMetrics();
    const connectionCountMatch = metrics.cfnConnectionCount === metrics.cfnWorkerSpawnCount;
    if (connectionCountMatch) {
      console.log(`  ✅ Connection count matches spawn count: ${metrics.cfnConnectionCount}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Connection count mismatch: connections=${metrics.cfnConnectionCount}, spawns=${metrics.cfnWorkerSpawnCount}`);
      testsFailed++;
    }

    // Test 3: All workers registered in Redis
    let redisRegistrations = 0;
    for (const worker of workers) {
      const exists = await harness.redis.exists(`worker:${worker.id}:status`);
      if (exists) redisRegistrations++;
    }

    if (redisRegistrations === workers.length) {
      console.log(`  ✅ All workers registered in Redis: ${redisRegistrations}/${workers.length}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Redis registration incomplete: ${redisRegistrations}/${workers.length}`);
      testsFailed++;
    }

    // Test 4: Connection time thresholds
    const avgConnectionTime = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
    const maxConnectionTime = Math.max(...connectionTimes);
    const connectionTimeThreshold = 2000; // 2 seconds max

    console.log(`  ├─ Avg connection time: ${avgConnectionTime.toFixed(0)}ms`);
    console.log(`  ├─ Max connection time: ${maxConnectionTime}ms`);

    if (maxConnectionTime < connectionTimeThreshold) {
      console.log(`  ✅ Connection times within threshold (< ${connectionTimeThreshold}ms)`);
      testsPassed++;
    } else {
      console.log(`  ❌ Connection time exceeded threshold: ${maxConnectionTime}ms > ${connectionTimeThreshold}ms`);
      testsFailed++;
    }

    // Test 5: No duplicate worker IDs
    const workerIds = new Set(workers.map(w => w.id));
    if (workerIds.size === workers.length) {
      console.log(`  ✅ No duplicate worker IDs: ${workerIds.size} unique workers`);
      testsPassed++;
    } else {
      console.log(`  ❌ Duplicate worker IDs detected: ${workers.length - workerIds.size} duplicates`);
      testsFailed++;
    }

    // Print final metrics
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Connection Metrics');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`cfnConnectionCount:        ${metrics.cfnConnectionCount}`);
    console.log(`cfnWorkerSpawnCount:       ${metrics.cfnWorkerSpawnCount}`);
    console.log(`cfnCoordinatorConnections: ${metrics.cfnCoordinatorConnections}`);
    console.log(`Avg Connection Time:       ${avgConnectionTime.toFixed(0)}ms`);
    console.log(`Max Connection Time:       ${maxConnectionTime}ms`);
    console.log(`Min Connection Time:       ${Math.min(...connectionTimes)}ms`);

    // Cleanup
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Cleanup');
    console.log('═══════════════════════════════════════════════════════════════════');
    await harness.shutdown();

    const cleanShutdown = harness.validateCleanShutdown();
    console.log(cleanShutdown.message);
    if (cleanShutdown.passed) testsPassed++;
    else testsFailed++;

    // Test summary
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Test Summary');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`Tests Passed: ${testsPassed}/6`);
    console.log(`Tests Failed: ${testsFailed}/6`);

    if (testsFailed === 0) {
      console.log('\n✅ ALL WORKER CONNECTION TESTS PASSED');
      console.log('═══════════════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log('\n❌ SOME WORKER CONNECTION TESTS FAILED');
      console.log('═══════════════════════════════════════════════════════════════════\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);

    // Emergency cleanup
    try {
      await harness.shutdown();
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError.message);
    }

    process.exit(1);
  }
}

// Run test
runTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
