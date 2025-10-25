#!/usr/bin/env node

/**
 * CFN v3 Graceful Shutdown Test
 *
 * Tests graceful shutdown of coordinator, workers, and reviewers.
 * Validates cfnShutdownTime, cfnOrphanedProcesses metrics.
 */

import { CfnTestHarness } from '../lib/cfn-test-harness.js';

const TEST_CONFIG = {
  workerCount: parseInt(process.env.CFN_TEST_WORKERS) || 5,
  coordinatorId: 'test-coordinator-shutdown',
  shutdownTimeThreshold: 5000, // 5 seconds max
  timeout: 30000,
};

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('CFN v3 Graceful Shutdown Test');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const harness = new CfnTestHarness({
    verbose: process.env.CFN_TEST_VERBOSE === 'true',
    debug: process.env.CFN_TEST_DEBUG === 'true',
  });

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Initialize harness
    console.log('[1/5] Initializing test harness...');
    await harness.init();
    console.log('✅ Test harness initialized\n');

    // Spawn coordinator
    console.log('[2/5] Spawning coordinator...');
    await harness.spawnCoordinator(TEST_CONFIG.coordinatorId);
    console.log('✅ Coordinator spawned\n');

    // Spawn workers
    console.log(`[3/5] Spawning ${TEST_CONFIG.workerCount} workers...`);
    const workers = [];
    for (let i = 1; i <= TEST_CONFIG.workerCount; i++) {
      const workerId = `shutdown-worker-${String(i).padStart(3, '0')}`;
      const worker = await harness.spawnWorker(workerId, TEST_CONFIG.coordinatorId);
      workers.push(worker);
      console.log(`  ├─ Worker ${i}/${TEST_CONFIG.workerCount}: ${workerId}`);
    }
    console.log('✅ All workers spawned\n');

    // Let processes run for a bit
    console.log('[4/5] Letting processes run...');
    await harness.sleep(2000);
    console.log('✅ Processes running\n');

    // Execute shutdown
    console.log('[5/5] Executing graceful shutdown...');
    const shutdownStartTime = Date.now();

    const shutdownResult = await harness.shutdown();
    const shutdownDuration = shutdownResult.duration;

    console.log(`✅ Shutdown completed in ${shutdownDuration}ms\n`);

    // Validate shutdown
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('Validating Shutdown');
    console.log('═══════════════════════════════════════════════════════════════════');

    // Test 1: Shutdown time within threshold
    if (shutdownDuration < TEST_CONFIG.shutdownTimeThreshold) {
      console.log(`✅ Shutdown time within threshold: ${shutdownDuration}ms < ${TEST_CONFIG.shutdownTimeThreshold}ms`);
      testsPassed++;
    } else {
      console.log(`❌ Shutdown time exceeded threshold: ${shutdownDuration}ms >= ${TEST_CONFIG.shutdownTimeThreshold}ms`);
      testsFailed++;
    }

    // Test 2: No orphaned processes
    const cleanShutdown = harness.validateCleanShutdown();
    console.log(cleanShutdown.message);
    if (cleanShutdown.passed) testsPassed++;
    else testsFailed++;

    // Test 3: All processes terminated
    const metrics = harness.getMetrics();
    let runningProcesses = 0;

    for (const proc of metrics.processes) {
      try {
        process.kill(proc.pid, 0);
        runningProcesses++;
        console.log(`❌ Process still running: ${proc.id} (PID: ${proc.pid})`);
      } catch (error) {
        // Process terminated, which is expected
      }
    }

    if (runningProcesses === 0) {
      console.log(`✅ All processes terminated: 0/${metrics.processes.length} running`);
      testsPassed++;
    } else {
      console.log(`❌ ${runningProcesses}/${metrics.processes.length} processes still running`);
      testsFailed++;
    }

    // Test 4: Redis cleanup
    const redisKeys = await harness.redis.keys('*');
    const testKeys = redisKeys.filter(key =>
      key.includes('coordinator') ||
      key.includes('worker') ||
      key.includes('test-')
    );

    if (testKeys.length === 0) {
      console.log(`✅ Redis cleanup complete: 0 test keys remaining`);
      testsPassed++;
    } else {
      console.log(`❌ Redis cleanup incomplete: ${testKeys.length} test keys remaining`);
      console.log(`  Keys: ${testKeys.slice(0, 5).join(', ')}${testKeys.length > 5 ? '...' : ''}`);
      testsFailed++;
    }

    // Test 5: Shutdown metrics recorded
    if (metrics.cfnShutdownTime > 0) {
      console.log(`✅ Shutdown time recorded: ${metrics.cfnShutdownTime}ms`);
      testsPassed++;
    } else {
      console.log(`❌ Shutdown time not recorded: ${metrics.cfnShutdownTime}ms`);
      testsFailed++;
    }

    // Print final metrics
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Shutdown Metrics');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`cfnShutdownTime:        ${metrics.cfnShutdownTime}ms`);
    console.log(`cfnOrphanedProcesses:   ${metrics.cfnOrphanedProcesses}`);
    console.log(`Processes spawned:      ${metrics.processes.length}`);
    console.log(`Processes terminated:   ${metrics.processes.length - runningProcesses}`);
    console.log(`Redis keys remaining:   ${testKeys.length}`);

    // Test summary
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Test Summary');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`Tests Passed: ${testsPassed}/5`);
    console.log(`Tests Failed: ${testsFailed}/5`);

    // Disconnect Redis
    await harness.redis.quit();

    if (testsFailed === 0) {
      console.log('\n✅ ALL GRACEFUL SHUTDOWN TESTS PASSED');
      console.log('═══════════════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log('\n❌ SOME GRACEFUL SHUTDOWN TESTS FAILED');
      console.log('═══════════════════════════════════════════════════════════════════\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);

    // Emergency cleanup
    try {
      await harness.shutdown();
      await harness.redis.quit();
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
