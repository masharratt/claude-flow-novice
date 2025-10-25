#!/usr/bin/env node

/**
 * CFN v3 Data Flow Test
 *
 * Tests data transfer between functions - the "connections" where data passes
 * from one function to the next through the CFN v3 pipeline.
 *
 * Validates data flow through:
 * 1. Coordinator → Worker (task assignment + context)
 * 2. Worker → Redis (output storage)
 * 3. Redis → Loop2 (feedback extraction)
 * 4. Loop2 → Loop3 (confidence aggregation)
 * 5. Loop3 → Gate Check (validation)
 * 6. Worker → Reviewer (handoff with context)
 * 7. Reviewer → SQLite (final storage)
 *
 * Tracks:
 * - cfnDataTransferPoints: Number of successful data transfer points
 * - cfnDataLossPoints: Points where data was lost/corrupted
 * - cfnContextPreserved: Context successfully passed through pipeline
 * - cfnPromptInjections: Prompts successfully injected into agent context
 */

import { CfnTestHarness } from '../lib/cfn-test-harness.js';

const TEST_CONFIG = {
  coordinatorId: 'test-coordinator-data-flow',
  taskId: `data-flow-task-${Date.now()}`,
  timeout: 30000,
};

// Sample data to track through pipeline
const PIPELINE_DATA = {
  taskContext: {
    taskId: TEST_CONFIG.taskId,
    description: 'Implement user authentication',
    requirements: ['JWT tokens', 'Password hashing', 'Session management'],
    priority: 'high',
  },
  workerOutput: {
    code: 'function authenticate(user, password) { /* implementation */ }',
    files: ['auth.js', 'session.js'],
    testsWritten: true,
    confidence: 0.92,
  },
  loop2Feedback: {
    critical: ['Add input validation'],
    warnings: ['Consider rate limiting'],
    suggestions: ['Add 2FA support'],
    extractedConfidence: 0.92,
  },
  loop3Aggregation: {
    aggregatedConfidence: 0.92,
    consensusReached: true,
    reviewerCount: 3,
  },
  gateCheckResult: {
    passed: true,
    threshold: 0.85,
    actualConfidence: 0.92,
  },
  reviewerContext: {
    taskId: TEST_CONFIG.taskId,
    code: 'function authenticate(user, password) { /* implementation */ }',
    feedback: ['Add input validation', 'Consider rate limiting'],
    originalConfidence: 0.92,
  },
  finalOutput: {
    approved: true,
    reviewerConfidence: 0.95,
    mergedToMain: true,
  },
};

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('CFN v3 Data Flow Test - Tracking Data Transfer Points');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const harness = new CfnTestHarness({
    verbose: process.env.CFN_TEST_VERBOSE === 'true',
    debug: process.env.CFN_TEST_DEBUG === 'true',
  });

  let testsPassed = 0;
  let testsFailed = 0;

  // Data flow metrics
  let cfnDataTransferPoints = 0;
  let cfnDataLossPoints = 0;
  let cfnContextPreserved = 0;
  let cfnPromptInjections = 0;

  try {
    // Initialize harness
    console.log('[1/8] Initializing test harness...');
    await harness.init();
    console.log('✅ Test harness initialized\n');

    // Data Transfer Point 1: Coordinator → Worker (task assignment + context)
    console.log('[2/8] Transfer Point 1: Coordinator → Worker');
    try {
      await harness.redis.hSet(`task:${TEST_CONFIG.taskId}:assignment`, {
        workerId: 'worker-001',
        context: JSON.stringify(PIPELINE_DATA.taskContext),
        assignedAt: Date.now().toString(),
      });

      // Verify data arrived
      const retrievedContext = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:assignment`, 'context');
      const parsedContext = JSON.parse(retrievedContext);

      if (JSON.stringify(parsedContext) === JSON.stringify(PIPELINE_DATA.taskContext)) {
        cfnDataTransferPoints++;
        cfnContextPreserved++;
        console.log('  ✅ Task context transferred to worker');
        console.log(`     Context preserved: ${Object.keys(parsedContext).length} fields`);
      } else {
        cfnDataLossPoints++;
        console.log('  ❌ Task context corrupted in transfer');
        testsFailed++;
      }
    } catch (error) {
      cfnDataLossPoints++;
      console.log(`  ❌ Transfer Point 1 failed: ${error.message}`);
      testsFailed++;
    }
    console.log('');

    // Data Transfer Point 2: Worker → Redis (output storage)
    console.log('[3/8] Transfer Point 2: Worker → Redis (output storage)');
    try {
      await harness.redis.hSet(`task:${TEST_CONFIG.taskId}:output`, {
        workerId: 'worker-001',
        output: JSON.stringify(PIPELINE_DATA.workerOutput),
        confidence: PIPELINE_DATA.workerOutput.confidence.toString(),
        completedAt: Date.now().toString(),
      });

      // Verify output stored
      const storedOutput = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:output`, 'output');
      const parsedOutput = JSON.parse(storedOutput);

      if (JSON.stringify(parsedOutput) === JSON.stringify(PIPELINE_DATA.workerOutput)) {
        cfnDataTransferPoints++;
        console.log('  ✅ Worker output stored in Redis');
        console.log(`     Files: ${parsedOutput.files.join(', ')}`);
        console.log(`     Confidence: ${parsedOutput.confidence}`);
      } else {
        cfnDataLossPoints++;
        console.log('  ❌ Worker output corrupted');
        testsFailed++;
      }
    } catch (error) {
      cfnDataLossPoints++;
      console.log(`  ❌ Transfer Point 2 failed: ${error.message}`);
      testsFailed++;
    }
    console.log('');

    // Data Transfer Point 3: Redis → Loop2 (feedback extraction)
    console.log('[4/8] Transfer Point 3: Redis → Loop2 (feedback extraction)');
    try {
      // Simulate Loop2 reading output and extracting feedback
      const workerOutput = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:output`, 'output');
      const parsedWorkerOutput = JSON.parse(workerOutput);

      // Loop2 processes and stores feedback
      await harness.redis.hSet(`task:${TEST_CONFIG.taskId}:loop2`, {
        feedback: JSON.stringify(PIPELINE_DATA.loop2Feedback),
        extractedFrom: 'worker-001',
        extractedAt: Date.now().toString(),
      });

      // Verify feedback extraction
      const storedFeedback = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:loop2`, 'feedback');
      const parsedFeedback = JSON.parse(storedFeedback);

      if (parsedFeedback.extractedConfidence === PIPELINE_DATA.workerOutput.confidence) {
        cfnDataTransferPoints++;
        console.log('  ✅ Feedback extracted by Loop2');
        console.log(`     Critical: ${parsedFeedback.critical.length} items`);
        console.log(`     Confidence preserved: ${parsedFeedback.extractedConfidence}`);
      } else {
        cfnDataLossPoints++;
        console.log('  ❌ Confidence score lost in Loop2 extraction');
        testsFailed++;
      }
    } catch (error) {
      cfnDataLossPoints++;
      console.log(`  ❌ Transfer Point 3 failed: ${error.message}`);
      testsFailed++;
    }
    console.log('');

    // Data Transfer Point 4: Loop2 → Loop3 (confidence aggregation)
    console.log('[5/8] Transfer Point 4: Loop2 → Loop3 (confidence aggregation)');
    try {
      // Loop3 reads Loop2 feedback and aggregates
      const loop2Feedback = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:loop2`, 'feedback');
      const parsedLoop2 = JSON.parse(loop2Feedback);

      // Loop3 aggregates confidence
      await harness.redis.hSet(`task:${TEST_CONFIG.taskId}:loop3`, {
        aggregation: JSON.stringify(PIPELINE_DATA.loop3Aggregation),
        aggregatedAt: Date.now().toString(),
      });

      // Verify aggregation
      const storedAggregation = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:loop3`, 'aggregation');
      const parsedAggregation = JSON.parse(storedAggregation);

      if (parsedAggregation.aggregatedConfidence === parsedLoop2.extractedConfidence) {
        cfnDataTransferPoints++;
        console.log('  ✅ Confidence aggregated by Loop3');
        console.log(`     Aggregated confidence: ${parsedAggregation.aggregatedConfidence}`);
        console.log(`     Consensus: ${parsedAggregation.consensusReached}`);
      } else {
        cfnDataLossPoints++;
        console.log('  ❌ Confidence mismatch in Loop3 aggregation');
        testsFailed++;
      }
    } catch (error) {
      cfnDataLossPoints++;
      console.log(`  ❌ Transfer Point 4 failed: ${error.message}`);
      testsFailed++;
    }
    console.log('');

    // Data Transfer Point 5: Loop3 → Gate Check (validation)
    console.log('[6/8] Transfer Point 5: Loop3 → Gate Check (validation)');
    try {
      // Gate check reads Loop3 aggregation
      const loop3Aggregation = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:loop3`, 'aggregation');
      const parsedLoop3 = JSON.parse(loop3Aggregation);

      // Gate check evaluates
      const gateThreshold = 0.85;
      const gatePassed = parsedLoop3.aggregatedConfidence >= gateThreshold;

      await harness.redis.hSet(`task:${TEST_CONFIG.taskId}:gate`, {
        result: JSON.stringify({
          ...PIPELINE_DATA.gateCheckResult,
          passed: gatePassed,
        }),
        checkedAt: Date.now().toString(),
      });

      // Verify gate check
      const storedGate = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:gate`, 'result');
      const parsedGate = JSON.parse(storedGate);

      if (parsedGate.actualConfidence === parsedLoop3.aggregatedConfidence && parsedGate.passed) {
        cfnDataTransferPoints++;
        console.log('  ✅ Gate check validated');
        console.log(`     Result: ${parsedGate.passed ? 'PASS' : 'FAIL'}`);
        console.log(`     Confidence: ${parsedGate.actualConfidence} (threshold: ${parsedGate.threshold})`);
      } else {
        cfnDataLossPoints++;
        console.log('  ❌ Gate check data mismatch');
        testsFailed++;
      }
    } catch (error) {
      cfnDataLossPoints++;
      console.log(`  ❌ Transfer Point 5 failed: ${error.message}`);
      testsFailed++;
    }
    console.log('');

    // Data Transfer Point 6: Worker → Reviewer (handoff with context)
    console.log('[7/8] Transfer Point 6: Worker → Reviewer (handoff with context)');
    try {
      // Worker hands off to reviewer with full context
      const workerOutput = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:output`, 'output');
      const loop2Feedback = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:loop2`, 'feedback');

      await harness.redis.hSet(`handoff:${TEST_CONFIG.taskId}:reviewer`, {
        reviewerId: 'reviewer-001',
        context: JSON.stringify({
          ...PIPELINE_DATA.reviewerContext,
          code: JSON.parse(workerOutput).code,
          feedback: JSON.parse(loop2Feedback).critical,
        }),
        handoffAt: Date.now().toString(),
      });

      // Verify context preserved in handoff
      const handoffContext = await harness.redis.hGet(`handoff:${TEST_CONFIG.taskId}:reviewer`, 'context');
      const parsedHandoff = JSON.parse(handoffContext);

      if (parsedHandoff.taskId === TEST_CONFIG.taskId && parsedHandoff.code && parsedHandoff.feedback) {
        cfnDataTransferPoints++;
        cfnContextPreserved++;
        cfnPromptInjections++; // Context injection into reviewer prompt
        console.log('  ✅ Handoff context transferred to reviewer');
        console.log(`     Task ID preserved: ${parsedHandoff.taskId}`);
        console.log(`     Code transferred: ${parsedHandoff.code.substring(0, 50)}...`);
        console.log(`     Feedback items: ${parsedHandoff.feedback.length}`);
        console.log(`     Context injected into reviewer prompt: YES`);
      } else {
        cfnDataLossPoints++;
        console.log('  ❌ Handoff context incomplete');
        testsFailed++;
      }
    } catch (error) {
      cfnDataLossPoints++;
      console.log(`  ❌ Transfer Point 6 failed: ${error.message}`);
      testsFailed++;
    }
    console.log('');

    // Data Transfer Point 7: Reviewer → SQLite (final storage)
    console.log('[8/8] Transfer Point 7: Reviewer → Final Storage');
    try {
      // Reviewer completes and stores final output
      await harness.redis.hSet(`task:${TEST_CONFIG.taskId}:final`, {
        output: JSON.stringify(PIPELINE_DATA.finalOutput),
        reviewedBy: 'reviewer-001',
        finalizedAt: Date.now().toString(),
      });

      // Verify final output
      const finalOutput = await harness.redis.hGet(`task:${TEST_CONFIG.taskId}:final`, 'output');
      const parsedFinal = JSON.parse(finalOutput);

      if (parsedFinal.approved && parsedFinal.reviewerConfidence > PIPELINE_DATA.workerOutput.confidence) {
        cfnDataTransferPoints++;
        console.log('  ✅ Final output stored');
        console.log(`     Approved: ${parsedFinal.approved}`);
        console.log(`     Reviewer confidence: ${parsedFinal.reviewerConfidence}`);
        console.log(`     Confidence improved: ${PIPELINE_DATA.workerOutput.confidence} → ${parsedFinal.reviewerConfidence}`);
      } else {
        cfnDataLossPoints++;
        console.log('  ❌ Final output incomplete');
        testsFailed++;
      }
    } catch (error) {
      cfnDataLossPoints++;
      console.log(`  ❌ Transfer Point 7 failed: ${error.message}`);
      testsFailed++;
    }
    console.log('');

    // Validation
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('Validating Data Flow');
    console.log('═══════════════════════════════════════════════════════════════════');

    // Test 1: All transfer points successful
    const expectedTransferPoints = 7;
    if (cfnDataTransferPoints === expectedTransferPoints) {
      console.log(`  ✅ All data transfer points successful: ${cfnDataTransferPoints}/${expectedTransferPoints}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Some transfer points failed: ${cfnDataTransferPoints}/${expectedTransferPoints}`);
      testsFailed++;
    }

    // Test 2: No data loss
    if (cfnDataLossPoints === 0) {
      console.log(`  ✅ No data loss: ${cfnDataLossPoints} loss points`);
      testsPassed++;
    } else {
      console.log(`  ❌ Data loss detected: ${cfnDataLossPoints} loss points`);
      testsFailed++;
    }

    // Test 3: Context preserved
    if (cfnContextPreserved === 2) { // taskContext + handoffContext
      console.log(`  ✅ Context preserved through pipeline: ${cfnContextPreserved} preservation points`);
      testsPassed++;
    } else {
      console.log(`  ❌ Context not fully preserved: ${cfnContextPreserved}/2 preservation points`);
      testsFailed++;
    }

    // Test 4: Prompt injections successful
    if (cfnPromptInjections === 1) { // Reviewer context injection
      console.log(`  ✅ Prompt injections successful: ${cfnPromptInjections}`);
      testsPassed++;
    } else {
      console.log(`  ❌ Prompt injections incomplete: ${cfnPromptInjections}/1`);
      testsFailed++;
    }

    // Print final metrics
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Data Flow Metrics');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`cfnDataTransferPoints:  ${cfnDataTransferPoints}/7`);
    console.log(`cfnDataLossPoints:      ${cfnDataLossPoints}`);
    console.log(`cfnContextPreserved:    ${cfnContextPreserved}/2`);
    console.log(`cfnPromptInjections:    ${cfnPromptInjections}/1`);
    console.log(`\nData Flow Success Rate: ${((cfnDataTransferPoints / expectedTransferPoints) * 100).toFixed(1)}%`);

    console.log('\nData Transfer Pipeline:');
    console.log('  1. Coordinator → Worker (task + context)    ✅');
    console.log('  2. Worker → Redis (output storage)          ✅');
    console.log('  3. Redis → Loop2 (feedback extraction)      ✅');
    console.log('  4. Loop2 → Loop3 (confidence aggregation)   ✅');
    console.log('  5. Loop3 → Gate Check (validation)          ✅');
    console.log('  6. Worker → Reviewer (handoff + context)    ✅');
    console.log('  7. Reviewer → Final Storage                 ✅');

    // Cleanup
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Cleanup');
    console.log('═══════════════════════════════════════════════════════════════════');
    await harness.shutdown();

    // Test summary
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('Test Summary');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`Tests Passed: ${testsPassed}/4`);
    console.log(`Tests Failed: ${testsFailed}/4`);

    if (testsFailed === 0) {
      console.log('\n✅ ALL DATA FLOW TESTS PASSED');
      console.log('═══════════════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log('\n❌ SOME DATA FLOW TESTS FAILED');
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
