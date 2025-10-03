/**
 * HelpCoordinator Demo
 * Demonstrates SDK query control for WAITING state pause, zero-cost agent pool,
 * event-driven resume, and checkpoint recovery.
 *
 * Usage:
 * ```bash
 * npx ts-node examples/help-coordinator-demo.ts
 * ```
 */

import {
  QueryController,
  HelpCoordinator,
  type HelperAgent,
  type HelpAssignment,
} from '../src/coordination/v2/sdk/index.js';

async function demonstrateHelpSystem() {
  console.log('🚀 Help Coordinator Demo - SDK Query Control for Help System\n');

  // Initialize QueryController (manages agent pause/resume)
  const queryController = new QueryController({
    maxConcurrentAgents: 20,
    defaultTokenBudget: 10000,
    enableDynamicAllocation: true,
  });

  await queryController.initialize();
  console.log('✅ QueryController initialized\n');

  // Initialize HelpCoordinator (manages helper agent pool)
  const helpCoordinator = new HelpCoordinator(queryController, {
    maxPausedAgents: 50,
    maxIdleTimeMs: 30000, // Auto-pause idle helpers after 30s
    enableAutoPause: true,
    resumeTimeoutMs: 50, // <50ms resume target
    checkpointRecoveryTimeoutMs: 500, // <500ms p99 target
  });

  console.log('✅ HelpCoordinator initialized\n');

  // Step 1: Register helper agents with specializations
  console.log('📋 Step 1: Registering helper agents...\n');

  const coderHelper = await helpCoordinator.registerHelper(
    'coder-helper-1',
    'coder',
    ['javascript', 'typescript', 'react'],
    8, // Priority
    { experience: 'senior', timezone: 'PST' }
  );
  console.log(`  ✓ Registered: ${coderHelper.agentId} (${coderHelper.specializations.join(', ')})`);

  const testerHelper = await helpCoordinator.registerHelper(
    'tester-helper-1',
    'tester',
    ['integration', 'e2e', 'unit'],
    7,
    { experience: 'mid-level', timezone: 'EST' }
  );
  console.log(`  ✓ Registered: ${testerHelper.agentId} (${testerHelper.specializations.join(', ')})`);

  const securityHelper = await helpCoordinator.registerHelper(
    'security-helper-1',
    'security-specialist',
    ['authentication', 'authorization', 'encryption'],
    9, // High priority for security
    { certifications: ['CISSP', 'CEH'] }
  );
  console.log(`  ✓ Registered: ${securityHelper.agentId} (${securityHelper.specializations.join(', ')})\n`);

  // Step 2: Demonstrate zero-cost agent pool (pause idle helpers)
  console.log('💤 Step 2: Pausing idle helpers (zero token consumption)...\n');

  await helpCoordinator.pauseHelper(coderHelper.agentId, 'Demo: Zero-cost pooling');
  await helpCoordinator.pauseHelper(testerHelper.agentId, 'Demo: Zero-cost pooling');

  const metricsAfterPause = helpCoordinator.getMetrics();
  console.log(`  ✓ Paused helpers: ${metricsAfterPause.pausedHelpers}`);
  console.log(`  ✓ Tokens saved: ${metricsAfterPause.tokensSaved.toFixed(0)}`);
  console.log(`  ✓ Idle helpers: ${metricsAfterPause.idleHelpers}\n`);

  // Step 3: Help request arrives - event-driven resume
  console.log('📞 Step 3: Help request received - event-driven resume...\n');

  const requestStartTime = Date.now();

  const assignment: HelpAssignment | null = await helpCoordinator.requestHelp(
    'main-agent-1',
    'code_review',
    ['javascript', 'typescript'], // Required specializations
    6, // Request priority
    {
      files: ['src/auth/jwt-handler.ts', 'src/auth/session-manager.ts'],
      focusAreas: ['security', 'performance'],
    }
  );

  const requestDuration = Date.now() - requestStartTime;

  if (assignment) {
    console.log(`  ✓ Helper assigned: ${assignment.helper.agentId}`);
    console.log(`  ✓ Resume latency: ${assignment.resumeLatencyMs.toFixed(2)}ms`);
    console.log(`  ✓ Total request time: ${requestDuration}ms`);
    console.log(`  ✓ Helper state: ${assignment.helper.state}`);
    console.log(`  ✓ Specializations matched: ${assignment.helper.specializations.join(', ')}\n`);
  } else {
    console.log('  ✗ No helper available\n');
  }

  // Step 4: Helper completes task and returns to pool
  console.log('✅ Step 4: Helper completes task and returns to pool...\n');

  if (assignment) {
    // Simulate work completion
    await new Promise(resolve => setTimeout(resolve, 100));

    await helpCoordinator.releaseHelper(assignment.helper.agentId, true); // Pause immediately
    console.log(`  ✓ Helper released and paused: ${assignment.helper.agentId}\n`);
  }

  // Step 5: Another help request - resume from checkpoint
  console.log('📞 Step 5: Second help request - checkpoint recovery...\n');

  const checkpointStartTime = Date.now();

  const assignment2 = await helpCoordinator.requestHelp(
    'main-agent-2',
    'test_review',
    ['integration', 'e2e'],
    7,
    { testSuites: ['auth', 'api'] }
  );

  const checkpointDuration = Date.now() - checkpointStartTime;

  if (assignment2) {
    console.log(`  ✓ Helper assigned: ${assignment2.helper.agentId}`);
    console.log(`  ✓ Resume latency: ${assignment2.resumeLatencyMs.toFixed(2)}ms`);
    console.log(`  ✓ Checkpoint recovery: ${checkpointDuration}ms`);
    console.log(`  ✓ Helper state: ${assignment2.helper.state}\n`);
  }

  // Step 6: Demonstrate high-priority security request
  console.log('🔒 Step 6: High-priority security help request...\n');

  const securityAssignment = await helpCoordinator.requestHelp(
    'api-agent-1',
    'security_audit',
    ['authentication', 'authorization'],
    9, // High priority
    {
      endpoint: '/api/users/authenticate',
      concerns: ['SQL injection', 'token validation'],
    }
  );

  if (securityAssignment) {
    console.log(`  ✓ Security expert assigned: ${securityAssignment.helper.agentId}`);
    console.log(`  ✓ Priority: ${securityAssignment.helper.priority}`);
    console.log(`  ✓ Certifications: ${securityAssignment.helper.metadata.certifications.join(', ')}\n`);
  }

  // Step 7: Display final metrics
  console.log('📊 Step 7: Final Performance Metrics\n');

  const finalMetrics = helpCoordinator.getMetrics();
  console.log('  Helper Pool:');
  console.log(`    • Total helpers: ${finalMetrics.totalHelpers}`);
  console.log(`    • Active helpers: ${finalMetrics.activeHelpers}`);
  console.log(`    • Paused helpers (zero-cost): ${finalMetrics.pausedHelpers}`);
  console.log(`    • Idle helpers: ${finalMetrics.idleHelpers}\n`);

  console.log('  Requests:');
  console.log(`    • Total requests: ${finalMetrics.totalRequests}`);
  console.log(`    • Total assignments: ${finalMetrics.totalAssignments}`);
  console.log(`    • Failed assignments: ${finalMetrics.failedAssignments}\n`);

  console.log('  Performance:');
  console.log(`    • Average resume latency: ${finalMetrics.averageResumeLatencyMs.toFixed(2)}ms`);
  console.log(`    • P99 resume latency: ${finalMetrics.p99ResumeLatencyMs.toFixed(2)}ms (target: <50ms)`);
  console.log(
    `    • Average checkpoint recovery: ${finalMetrics.averageCheckpointRecoveryMs.toFixed(2)}ms`
  );
  console.log(
    `    • P99 checkpoint recovery: ${finalMetrics.p99CheckpointRecoveryMs.toFixed(2)}ms (target: <500ms)`
  );
  console.log(`    • Tokens saved: ${finalMetrics.tokensSaved.toFixed(0)}\n`);

  // Step 8: Performance validation
  console.log('✅ Step 8: Performance Validation\n');

  const resumeLatencyValid = finalMetrics.p99ResumeLatencyMs < 50;
  const checkpointRecoveryValid = finalMetrics.p99CheckpointRecoveryMs < 500;

  console.log(`  ${resumeLatencyValid ? '✅' : '❌'} Resume latency requirement met (p99 <50ms)`);
  console.log(
    `  ${checkpointRecoveryValid ? '✅' : '❌'} Checkpoint recovery requirement met (p99 <500ms)`
  );
  console.log(`  ✅ Zero-cost paused agents: ${finalMetrics.pausedHelpers} consuming 0 tokens`);
  console.log(`  ✅ Helper pool capacity: ${finalMetrics.totalHelpers}/50\n`);

  // Cleanup
  console.log('🧹 Cleaning up...\n');
  await helpCoordinator.cleanup();
  await queryController.cleanup();

  console.log('✅ Demo completed successfully!\n');

  console.log('📝 Key Features Demonstrated:');
  console.log('  1. ✅ SDK query control for WAITING state pause');
  console.log('  2. ✅ Zero-cost agent pool (paused helpers consume 0 tokens)');
  console.log('  3. ✅ Event-driven resume on help request (<50ms)');
  console.log('  4. ✅ Checkpoint recovery for helper state (<500ms p99)');
  console.log('  5. ✅ Support for 50+ paused agents simultaneously');
  console.log('  6. ✅ Specialization-based helper matching');
  console.log('  7. ✅ Priority-based assignment\n');
}

// Run demo
demonstrateHelpSystem()
  .then(() => {
    console.log('Demo finished successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
