#!/usr/bin/env node

/**
 * CFN v3 Confidence Score Test
 *
 * Tests confidence score passing, retrieval, and gate-check validation.
 * Validates:
 * - cfnConfidenceScoresPassed
 * - cfnConfidenceScoresRetrieved
 * - cfnGateCheckPassed
 * - cfnGateCheckFailed
 * - cfnAverageConfidence
 */

import { CfnTestHarness } from '../lib/cfn-test-harness.js';

const TEST_CONFIG = {
  workerCount: parseInt(process.env.CFN_TEST_WORKERS) || 5,
  taskCount: parseInt(process.env.CFN_TEST_TASKS) || 10,
  coordinatorId: 'test-coordinator-confidence',
  gateThreshold: 0.85, // Gate-check threshold
  timeout: 30000,
};

// Simulate confidence scores for different scenarios
const CONFIDENCE_SCENARIOS = [
  { taskId: 'task-001', confidence: 0.95, expectedGate: 'pass' },
  { taskId: 'task-002', confidence: 0.88, expectedGate: 'pass' },
  { taskId: 'task-003', confidence: 0.75, expectedGate: 'fail' },
  { taskId: 'task-004', confidence: 0.92, expectedGate: 'pass' },
  { taskId: 'task-005', confidence: 0.68, expectedGate: 'fail' },
  { taskId: 'task-006', confidence: 0.89, expectedGate: 'pass' },
  { taskId: 'task-007', confidence: 0.77, expectedGate: 'fail' },
  { taskId: 'task-008', confidence: 0.93, expectedGate: 'pass' },
  { taskId: 'task-009', confidence: 0.86, expectedGate: 'pass' },
  { taskId: 'task-010', confidence: 0.81, expectedGate: 'fail' },
];

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('CFN v3 Confidence Score Test');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const harness = new CfnTestHarness({
    verbose: process.env.CFN_TEST_VERBOSE === 'true',
    debug: process.env.CFN_TEST_DEBUG === 'true',
  });

  let testsPassed = 0;
  let testsFailed = 0;

  // Tracking metrics
  let cfnConfidenceScoresPassed = 0;
  let cfnConfidenceScoresRetrieved = 0;
  let cfnGateCheckPassed = 0;
  let cfnGateCheckFailed = 0;
  const confidenceScores = [];

  try {
    // Initialize harness
    console.log('[1/6] Initializing test harness...');
    await harness.init();
    console.log('✅ Test harness initialized\n');

    // Spawn coordinator
    console.log('[2/6] Spawning coordinator...');
    await harness.spawnCoordinator(TEST_CONFIG.coordinatorId);
    console.log('✅ Coordinator spawned\n');

    // Test 1: Store confidence scores in Redis
    console.log('[3/6] Storing confidence scores in Redis...');
    for (const scenario of CONFIDENCE_SCENARIOS) {
      const { taskId, confidence } = scenario;

      try {
        // Store confidence score (simulating worker output)
        await harness.redis.hSet(`task:${taskId}`, {
          confidence: confidence.toString(),
          status: 'completed',
          timestamp: Date.now().toString(),
        });

        cfnConfidenceScoresPassed++;
        confidenceScores.push(confidence);

        harness.debug(`  ├─ Stored confidence for ${taskId}: ${confidence}`);
      } catch (error) {
        console.error(`  ├─ ❌ Failed to store ${taskId}: ${error.message}`);
        testsFailed++;
      }
    }
    console.log(`✅ Stored ${cfnConfidenceScoresPassed}/${CONFIDENCE_SCENARIOS.length} confidence scores\n`);

    // Test 2: Retrieve confidence scores
    console.log('[4/6] Retrieving confidence scores from Redis...');
    for (const scenario of CONFIDENCE_SCENARIOS) {
      const { taskId, confidence } = scenario;

      try {
        const stored = await harness.redis.hGet(`task:${taskId}`, 'confidence');
        const retrievedConfidence = parseFloat(stored);

        if (Math.abs(retrievedConfidence - confidence) < 0.001) {
          cfnConfidenceScoresRetrieved++;
          harness.debug(`  ├─ Retrieved ${taskId}: ${retrievedConfidence} (expected ${confidence})`);
        } else {
          console.error(`  ├─ ❌ Mismatch for ${taskId}: got ${retrievedConfidence}, expected ${confidence}`);
          testsFailed++;
        }
      } catch (error) {
        console.error(`  ├─ ❌ Failed to retrieve ${taskId}: ${error.message}`);
        testsFailed++;
      }
    }
    console.log(`✅ Retrieved ${cfnConfidenceScoresRetrieved}/${CONFIDENCE_SCENARIOS.length} confidence scores\n`);

    // Test 3: Gate-check validation
    console.log('[5/6] Validating gate-check logic...');
    for (const scenario of CONFIDENCE_SCENARIOS) {
      const { taskId, confidence, expectedGate } = scenario;

      try {
        const gateResult = confidence >= TEST_CONFIG.gateThreshold ? 'pass' : 'fail';

        // Store gate result
        await harness.redis.hSet(`gate:${taskId}`, {
          result: gateResult,
          confidence: confidence.toString(),
          threshold: TEST_CONFIG.gateThreshold.toString(),
          timestamp: Date.now().toString(),
        });

        if (gateResult === expectedGate) {
          if (gateResult === 'pass') {
            cfnGateCheckPassed++;
            harness.debug(`  ├─ ✅ Gate PASS: ${taskId} (${confidence} >= ${TEST_CONFIG.gateThreshold})`);
          } else {
            cfnGateCheckFailed++;
            harness.debug(`  ├─ ⚠️  Gate FAIL: ${taskId} (${confidence} < ${TEST_CONFIG.gateThreshold})`);
          }
        } else {
          console.error(`  ├─ ❌ Gate mismatch for ${taskId}: got ${gateResult}, expected ${expectedGate}`);
          testsFailed++;
        }
      } catch (error) {
        console.error(`  ├─ ❌ Gate-check error for ${taskId}: ${error.message}`);
        testsFailed++;
      }
    }
    console.log(`✅ Gate checks: ${cfnGateCheckPassed} passed, ${cfnGateCheckFailed} failed\n`);

    // Validation
    console.log('[6/6] Validating confidence score metrics...');

    // Test 1: All confidence scores stored
    if (cfnConfidenceScoresPassed === CONFIDENCE_SCENARIOS.length) {
      console.log(`  ✅ All confidence scores stored: ${cfnConfidenceScoresPassed}/${CONFIDENCE_SCENARIOS.length}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Confidence storage incomplete: ${cfnConfidenceScoresPassed}/${CONFIDENCE_SCENARIOS.length}`);
      testsFailed++;
    }

    // Test 2: All confidence scores retrieved
    if (cfnConfidenceScoresRetrieved === CONFIDENCE_SCENARIOS.length) {
      console.log(`  ✅ All confidence scores retrieved: ${cfnConfidenceScoresRetrieved}/${CONFIDENCE_SCENARIOS.length}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Confidence retrieval incomplete: ${cfnConfidenceScoresRetrieved}/${CONFIDENCE_SCENARIOS.length}`);
      testsFailed++;
    }

    // Test 3: Gate-check counts correct
    const expectedPassed = CONFIDENCE_SCENARIOS.filter(s => s.expectedGate === 'pass').length;
    const expectedFailed = CONFIDENCE_SCENARIOS.filter(s => s.expectedGate === 'fail').length;

    if (cfnGateCheckPassed === expectedPassed) {
      console.log(`  ✅ Gate-check passed count correct: ${cfnGateCheckPassed}/${expectedPassed}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Gate-check passed count mismatch: ${cfnGateCheckPassed}/${expectedPassed}`);
      testsFailed++;
    }

    if (cfnGateCheckFailed === expectedFailed) {
      console.log(`  ✅ Gate-check failed count correct: ${cfnGateCheckFailed}/${expectedFailed}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Gate-check failed count mismatch: ${cfnGateCheckFailed}/${expectedFailed}`);
      testsFailed++;
    }

    // Test 4: Average confidence calculation
    const cfnAverageConfidence = confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;
    const expectedAvg = 0.844; // Pre-calculated from scenarios

    if (Math.abs(cfnAverageConfidence - expectedAvg) < 0.01) {
      console.log(`  ✅ Average confidence correct: ${cfnAverageConfidence.toFixed(3)} (expected ~${expectedAvg})`);
      testsPassed++;
    } else {
      console.log(`  ❌ Average confidence mismatch: ${cfnAverageConfidence.toFixed(3)} (expected ~${expectedAvg})`);
      testsFailed++;
    }

    // Test 5: Confidence score persistence in Redis
    let persistedScores = 0;
    for (const scenario of CONFIDENCE_SCENARIOS) {
      const exists = await harness.redis.exists(`task:${scenario.taskId}`);
      if (exists) persistedScores++;
    }

    if (persistedScores === CONFIDENCE_SCENARIOS.length) {
      console.log(`  ✅ All confidence scores persisted in Redis: ${persistedScores}/${CONFIDENCE_SCENARIOS.length}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Confidence persistence incomplete: ${persistedScores}/${CONFIDENCE_SCENARIOS.length}`);
      testsFailed++;
    }

    // Test 6: Gate results persistence
    let persistedGates = 0;
    for (const scenario of CONFIDENCE_SCENARIOS) {
      const exists = await harness.redis.exists(`gate:${scenario.taskId}`);
      if (exists) persistedGates++;
    }

    if (persistedGates === CONFIDENCE_SCENARIOS.length) {
      console.log(`  ✅ All gate results persisted in Redis: ${persistedGates}/${CONFIDENCE_SCENARIOS.length}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Gate persistence incomplete: ${persistedGates}/${CONFIDENCE_SCENARIOS.length}`);
      testsFailed++;
    }

    // Print final metrics
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Confidence Score Metrics');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`cfnConfidenceScoresPassed:    ${cfnConfidenceScoresPassed}`);
    console.log(`cfnConfidenceScoresRetrieved: ${cfnConfidenceScoresRetrieved}`);
    console.log(`cfnGateCheckPassed:           ${cfnGateCheckPassed}`);
    console.log(`cfnGateCheckFailed:           ${cfnGateCheckFailed}`);
    console.log(`cfnAverageConfidence:         ${cfnAverageConfidence.toFixed(3)}`);
    console.log(`Gate Threshold:               ${TEST_CONFIG.gateThreshold}`);
    console.log(`\nConfidence Distribution:`);
    console.log(`  Min:  ${Math.min(...confidenceScores).toFixed(2)}`);
    console.log(`  Max:  ${Math.max(...confidenceScores).toFixed(2)}`);
    console.log(`  Avg:  ${cfnAverageConfidence.toFixed(3)}`);

    // Cleanup
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Cleanup');
    console.log('═══════════════════════════════════════════════════════════════════');
    await harness.shutdown();

    // Test summary
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Test Summary');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`Tests Passed: ${testsPassed}/7`);
    console.log(`Tests Failed: ${testsFailed}/7`);

    if (testsFailed === 0) {
      console.log('\n✅ ALL CONFIDENCE SCORE TESTS PASSED');
      console.log('═══════════════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log('\n❌ SOME CONFIDENCE SCORE TESTS FAILED');
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
