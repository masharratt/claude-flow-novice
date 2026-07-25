#!/usr/bin/env node

/**
 * CFN v3 Handoff Coordination Test
 *
 * Tests worker → reviewer handoff tracking and coordination.
 * Validates cfnHandoffCount, cfnReviewerAssignments, cfnHandoffFailures metrics.
 */

import { CfnTestHarness } from '../lib/cfn-test-harness.js';

const TEST_CONFIG = {
  workerCount: parseInt(process.env.CFN_TEST_WORKERS) || 5,
  reviewerCount: parseInt(process.env.CFN_TEST_REVIEWERS) || 3,
  taskCount: parseInt(process.env.CFN_TEST_TASKS) || 10,
  coordinatorId: 'test-coordinator-handoff',
  taskIdPrefix: `handoff-task-${Date.now()}`,
  timeout: 30000,
};

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('CFN v3 Handoff Coordination Test');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const harness = new CfnTestHarness({
    verbose: process.env.CFN_TEST_VERBOSE === 'true',
    debug: process.env.CFN_TEST_DEBUG === 'true',
  });

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Initialize harness
    console.log('[1/6] Initializing test harness...');
    await harness.init();
    console.log('✅ Test harness initialized\n');

    // Spawn coordinator
    console.log('[2/6] Spawning coordinator...');
    await harness.spawnCoordinator(TEST_CONFIG.coordinatorId);
    console.log('✅ Coordinator spawned\n');

    // Spawn workers
    console.log(`[3/6] Spawning ${TEST_CONFIG.workerCount} workers...`);
    const workers = [];
    for (let i = 1; i <= TEST_CONFIG.workerCount; i++) {
      const workerId = `handoff-worker-${String(i).padStart(3, '0')}`;
      const worker = await harness.spawnWorker(workerId, TEST_CONFIG.coordinatorId);
      workers.push(worker);
      console.log(`  ├─ Worker ${i}/${TEST_CONFIG.workerCount}: ${workerId}`);
    }
    console.log('✅ All workers spawned\n');

    // Spawn reviewers
    console.log(`[4/6] Spawning ${TEST_CONFIG.reviewerCount} reviewers...`);
    const reviewers = [];
    for (let i = 1; i <= TEST_CONFIG.reviewerCount; i++) {
      const reviewerId = `handoff-reviewer-${String(i).padStart(3, '0')}`;

      // Reviewers are also workers, just with a different role
      const reviewer = await harness.spawnWorker(reviewerId, TEST_CONFIG.coordinatorId, {
        env: { WORKER_ROLE: 'reviewer' },
      });

      reviewers.push(reviewer);
      console.log(`  ├─ Reviewer ${i}/${TEST_CONFIG.reviewerCount}: ${reviewerId}`);
    }
    console.log('✅ All reviewers spawned\n');

    // Execute handoffs
    console.log(`[5/6] Executing ${TEST_CONFIG.taskCount} handoffs...`);
    const handoffTimes = [];
    const reviewerAssignments = new Map();

    for (let i = 1; i <= TEST_CONFIG.taskCount; i++) {
      const taskId = `${TEST_CONFIG.taskIdPrefix}-${String(i).padStart(3, '0')}`;
      const worker = workers[i % workers.length];
      const reviewer = reviewers[i % reviewers.length];

      const startTime = Date.now();

      try {
        const result = await harness.trackHandoff(taskId, worker.id, reviewer.id, {
          timeout: 5000,
        });

        if (result.success) {
          handoffTimes.push(result.duration);

          // Track reviewer assignments
          const count = reviewerAssignments.get(reviewer.id) || 0;
          reviewerAssignments.set(reviewer.id, count + 1);

          console.log(`  ├─ Handoff ${i}/${TEST_CONFIG.taskCount}: ${taskId} → ${reviewer.id} (${result.duration}ms)`);
        } else {
          console.error(`  ├─ ❌ Handoff ${i} failed: ${result.error}`);
          testsFailed++;
        }
      } catch (error) {
        console.error(`  ├─ ❌ Handoff ${i} exception: ${error.message}`);
        testsFailed++;
      }
    }

    console.log('✅ All handoffs completed\n');

    // Validate handoffs
    console.log('[6/6] Validating handoffs...');

    // Test 1: Handoff count
    const handoffValidation = harness.validateHandoffs(TEST_CONFIG.taskCount);
    console.log(`  ${handoffValidation.message}`);
    if (handoffValidation.passed) testsPassed++;
    else testsFailed++;

    // Test 2: Handoff success rate
    const metrics = harness.getMetrics();
    const successRate = (metrics.cfnHandoffCount / TEST_CONFIG.taskCount) * 100;

    if (successRate === 100) {
      console.log(`  ✅ Handoff success rate: ${successRate.toFixed(1)}%`);
      testsPassed++;
    } else {
      console.log(`  ❌ Handoff success rate below 100%: ${successRate.toFixed(1)}%`);
      testsFailed++;
    }

    // Test 3: No handoff failures
    if (metrics.cfnHandoffFailures === 0) {
      console.log(`  ✅ No handoff failures: ${metrics.cfnHandoffFailures}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Handoff failures detected: ${metrics.cfnHandoffFailures}`);
      testsFailed++;
    }

    // Test 4: Handoff time thresholds
    const avgHandoffTime = handoffTimes.reduce((a, b) => a + b, 0) / handoffTimes.length;
    const maxHandoffTime = Math.max(...handoffTimes);
    const handoffTimeThreshold = 1000; // 1 second max

    console.log(`  ├─ Avg handoff time: ${avgHandoffTime.toFixed(0)}ms`);
    console.log(`  ├─ Max handoff time: ${maxHandoffTime}ms`);

    if (maxHandoffTime < handoffTimeThreshold) {
      console.log(`  ✅ Handoff times within threshold (< ${handoffTimeThreshold}ms)`);
      testsPassed++;
    } else {
      console.log(`  ❌ Handoff time exceeded threshold: ${maxHandoffTime}ms > ${handoffTimeThreshold}ms`);
      testsFailed++;
    }

    // Test 5: Reviewer load distribution
    const assignmentCounts = Array.from(reviewerAssignments.values());
    const maxAssignments = Math.max(...assignmentCounts);
    const minAssignments = Math.min(...assignmentCounts);
    const loadImbalance = maxAssignments - minAssignments;

    console.log('  ├─ Reviewer assignments:');
    for (const [reviewerId, count] of reviewerAssignments) {
      console.log(`  │  └─ ${reviewerId}: ${count} tasks`);
    }

    // Allow some imbalance due to round-robin distribution
    const maxImbalance = Math.ceil(TEST_CONFIG.taskCount / TEST_CONFIG.reviewerCount) + 1;

    if (loadImbalance <= maxImbalance) {
      console.log(`  ✅ Reviewer load balanced (imbalance: ${loadImbalance})`);
      testsPassed++;
    } else {
      console.log(`  ❌ Reviewer load imbalanced (imbalance: ${loadImbalance} > ${maxImbalance})`);
      testsFailed++;
    }

    // Test 6: Handoff state persisted in Redis
    let persistedHandoffs = 0;
    for (let i = 1; i <= TEST_CONFIG.taskCount; i++) {
      const taskId = `${TEST_CONFIG.taskIdPrefix}-${String(i).padStart(3, '0')}`;
      const exists = await harness.redis.exists(`handoff:${taskId}`);
      if (exists) persistedHandoffs++;
    }

    if (persistedHandoffs === TEST_CONFIG.taskCount) {
      console.log(`  ✅ All handoffs persisted in Redis: ${persistedHandoffs}/${TEST_CONFIG.taskCount}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Handoff persistence incomplete: ${persistedHandoffs}/${TEST_CONFIG.taskCount}`);
      testsFailed++;
    }

    // Print final metrics
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Handoff Metrics');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`cfnHandoffCount:         ${metrics.cfnHandoffCount}`);
    console.log(`cfnReviewerAssignments:  ${reviewerAssignments.size}`);
    console.log(`cfnHandoffFailures:      ${metrics.cfnHandoffFailures}`);
    console.log(`Avg Handoff Time:        ${avgHandoffTime.toFixed(0)}ms`);
    console.log(`Max Handoff Time:        ${maxHandoffTime}ms`);
    console.log(`Min Handoff Time:        ${Math.min(...handoffTimes)}ms`);
    console.log(`Success Rate:            ${successRate.toFixed(1)}%`);

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
    console.log(`Tests Passed: ${testsPassed}/7`);
    console.log(`Tests Failed: ${testsFailed}/7`);

    if (testsFailed === 0) {
      console.log('\n✅ ALL HANDOFF COORDINATION TESTS PASSED');
      console.log('═══════════════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log('\n❌ SOME HANDOFF COORDINATION TESTS FAILED');
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
