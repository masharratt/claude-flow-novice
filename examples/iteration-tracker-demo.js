#!/usr/bin/env node

/**
 * IterationTracker Demo
 *
 * Demonstrates complete CFN Loop integration with iteration tracking,
 * limit enforcement, and escalation handling.
 */

import { createIterationTracker, ESCALATION_STRATEGIES } from '../src/coordination/iteration-tracker.js';

// Simulated work functions
async function simulateSwarmExecution(successRate = 0.7) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return Math.random() < successRate;
}

async function simulateConsensusValidation(threshold = 0.9) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return Math.random() < threshold;
}

/**
 * Demo 1: Basic Loop Tracking
 */
async function demoBasicTracking() {
  console.log('\n=== Demo 1: Basic Loop Tracking ===\n');

  const tracker = createIterationTracker({
    phaseId: 'demo-basic',
    swarmId: 'demo-swarm',
  });

  await tracker.initialize();

  // Simulate a few iterations
  for (let i = 0; i < 3; i++) {
    const result = await tracker.incrementLoop2();
    console.log(
      `Loop 2 Iteration ${result.counter}: ${result.remaining} remaining, escalate: ${result.escalate}`,
    );

    // Simulate inner loop
    for (let j = 0; j < 2; j++) {
      const swarmResult = await tracker.incrementLoop3();
      console.log(
        `  Loop 3 Iteration ${swarmResult.counter}: ${swarmResult.remaining} remaining`,
      );
    }

    await tracker.resetLoop3('gate_pass');
    console.log('  ✅ Gate passed, Loop 3 reset\n');
  }

  const stats = tracker.getStatistics();
  console.log('Final Statistics:');
  console.log(`  Loop 2 Iterations: ${stats.totals.loop2Iterations}`);
  console.log(`  Loop 3 Iterations: ${stats.totals.loop3Iterations}`);
  console.log(`  Gate Passes: ${stats.totals.successfulGatePasses}`);
  console.log(`  Success Rate: ${stats.efficiency.successRate.toFixed(1)}%`);
}

/**
 * Demo 2: Escalation Handling
 */
async function demoEscalationHandling() {
  console.log('\n=== Demo 2: Escalation Handling ===\n');

  const tracker = createIterationTracker({
    phaseId: 'demo-escalation',
    loop2Max: 3, // Lower limit for demo
  });

  await tracker.initialize();

  let phaseComplete = false;

  while (!phaseComplete) {
    const phaseResult = await tracker.incrementLoop2();
    console.log(`Phase iteration ${phaseResult.counter}/${phaseResult.max}`);

    if (phaseResult.escalate) {
      console.log('❌ Phase limit exceeded!');
      console.log(`   Reason: ${phaseResult.status}`);

      await tracker.recordEscalation({
        type: 'phase_exceeded',
        reason: 'Maximum phase iterations reached',
        action: 'Escalate to human with full context',
      });

      console.log('   Escalation recorded\n');
      break;
    }

    // Simulate work
    const success = Math.random() > 0.5;
    if (success) {
      console.log('✅ Phase completed successfully\n');
      phaseComplete = true;
    }
  }

  const history = tracker.getEscalationHistory();
  if (history.length > 0) {
    console.log('Escalation History:');
    history.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.type} - ${e.reason}`);
    });
  }
}

/**
 * Demo 3: Realistic CFN Loop Simulation
 */
async function demoRealisticCFNLoop() {
  console.log('\n=== Demo 3: Realistic CFN Loop Simulation ===\n');

  const tracker = createIterationTracker({
    phaseId: 'feature-authentication',
    swarmId: 'fullstack-swarm',
  });

  await tracker.initialize();

  let featureComplete = false;
  let consecutiveFails = 0;

  while (!featureComplete) {
    // Loop 2: Phase-level iteration
    const phaseResult = await tracker.incrementLoop2();
    console.log(`\n--- Phase Iteration ${phaseResult.counter}/${phaseResult.max} ---`);

    if (phaseResult.escalate) {
      console.log('❌ ESCALATION: Phase exceeded retry limit');
      await tracker.recordEscalation({
        type: 'phase_exceeded',
        reason: 'Feature implementation failed after maximum retries',
        action: 'Human review required - check requirements and approach',
        consecutiveFails,
      });
      break;
    }

    // Inner swarm execution loop
    let swarmSuccess = false;

    while (!swarmSuccess) {
      // Loop 3: Swarm-level iteration
      const swarmResult = await tracker.incrementLoop3();
      console.log(`  Swarm execution ${swarmResult.counter}/${swarmResult.max}`);

      if (swarmResult.escalate) {
        console.log('  ⚠️  Swarm stuck - trying new approach');
        await tracker.resetLoop3('stuck');
        consecutiveFails++;
        break;
      }

      // Simulate swarm work
      const workSuccess = await simulateSwarmExecution(0.6);
      console.log(`    Work completed: ${workSuccess ? '✅' : '❌'}`);

      if (workSuccess) {
        // Simulate consensus validation
        const consensusPassed = await simulateConsensusValidation(0.8);
        console.log(`    Consensus validation: ${consensusPassed ? '✅ PASS' : '❌ FAIL'}`);

        if (consensusPassed) {
          console.log('    🎉 Gate passed!');
          await tracker.resetLoop3('gate_pass');
          swarmSuccess = true;
          consecutiveFails = 0;
        }
      }
    }

    // Check if feature is complete (need 2 successful gate passes for demo)
    const stats = tracker.getStatistics();
    if (stats.totals.successfulGatePasses >= 2) {
      featureComplete = true;
      console.log('\n✨ Feature implementation complete!');
    }
  }

  // Final report
  const finalStats = tracker.getStatistics();
  console.log('\n--- Final Report ---');
  console.log(`Phase iterations: ${finalStats.totals.loop2Iterations}`);
  console.log(`Total swarm executions: ${finalStats.totals.loop3Iterations}`);
  console.log(`Successful gate passes: ${finalStats.totals.successfulGatePasses}`);
  console.log(`Success rate: ${finalStats.efficiency.successRate.toFixed(1)}%`);
  console.log(`Average swarm attempts per phase: ${finalStats.efficiency.averageLoop3PerLoop2.toFixed(1)}`);
  console.log(
    `Phase utilization: ${finalStats.utilization.loop2.toFixed(1)}% (${finalStats.current.loop2}/${finalStats.limits.loop2Max})`,
  );
}

/**
 * Demo 4: State Persistence and Recovery
 */
async function demoStatePersistence() {
  console.log('\n=== Demo 4: State Persistence and Recovery ===\n');

  const phaseId = 'persistent-task-' + Date.now();

  // Session 1: Start work
  console.log('Session 1: Starting work...');
  const tracker1 = createIterationTracker({ phaseId });
  await tracker1.initialize();

  await tracker1.incrementLoop2();
  await tracker1.incrementLoop3();
  await tracker1.incrementLoop3();

  console.log('  Loop 2: 1, Loop 3: 2');
  await tracker1.persistState();
  console.log('  ✅ State persisted');

  // Session 2: Resume work
  console.log('\nSession 2: Resuming work...');
  const tracker2 = createIterationTracker({ phaseId });
  const loaded = await tracker2.loadState(phaseId);

  if (loaded) {
    const state = tracker2.getState();
    console.log('  ✅ State loaded successfully');
    console.log(`  Resumed at Loop 2: ${state.counters.loop2}, Loop 3: ${state.counters.loop3}`);

    // Continue work
    await tracker2.incrementLoop3();
    console.log(`  Continued to Loop 3: ${tracker2.loop3Counter}`);
  } else {
    console.log('  ℹ️  No previous state found (fresh start)');
  }
}

/**
 * Demo 5: Custom Limits and Monitoring
 */
async function demoCustomLimits() {
  console.log('\n=== Demo 5: Custom Limits and Monitoring ===\n');

  const tracker = createIterationTracker({
    phaseId: 'strict-validation',
    loop2Max: 2, // Very strict limit
    loop3Max: 5,
  });

  await tracker.initialize();

  console.log(`Custom limits - Loop 2: ${tracker.loop2Max}, Loop 3: ${tracker.loop3Max}\n`);

  // Monitoring interval
  const monitorInterval = setInterval(() => {
    const stats = tracker.getStatistics();
    console.log(
      `[Monitor] Loop 2: ${stats.utilization.loop2.toFixed(0)}%, Loop 3: ${stats.utilization.loop3.toFixed(0)}%`,
    );
  }, 500);

  try {
    for (let i = 0; i < 3; i++) {
      const result = await tracker.incrementLoop2();

      if (result.escalate) {
        console.log(`\n❌ Hit strict limit at iteration ${result.counter}`);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  } finally {
    clearInterval(monitorInterval);
  }

  console.log('\nFinal utilization:');
  const stats = tracker.getStatistics();
  console.log(`  Loop 2: ${stats.utilization.loop2.toFixed(1)}%`);
  console.log(`  Loop 3: ${stats.utilization.loop3.toFixed(1)}%`);
}

/**
 * Demo 6: Export and Analysis
 */
async function demoExportAnalysis() {
  console.log('\n=== Demo 6: Export and Analysis ===\n');

  const tracker = createIterationTracker({ phaseId: 'export-demo' });
  await tracker.initialize();

  // Generate some activity
  await tracker.incrementLoop2();
  await tracker.incrementLoop3();
  await tracker.incrementLoop3();
  await tracker.resetLoop3('gate_pass');
  await tracker.recordEscalation({
    type: 'warning',
    reason: 'High iteration count',
    action: 'Monitor closely',
  });

  // Export complete state
  const exported = tracker.export();

  console.log('Exported Data:');
  console.log(`  Phase ID: ${exported.state.phaseId}`);
  console.log(`  Counters: Loop 2=${exported.state.counters.loop2}, Loop 3=${exported.state.counters.loop3}`);
  console.log(`  Statistics: ${JSON.stringify(exported.statistics.totals, null, 2)}`);
  console.log(`  Escalations: ${exported.escalationHistory.length} recorded`);
  console.log(`  Memory Namespace: ${exported.memoryNamespace}`);
  console.log(`  Exported At: ${exported.exportedAt}`);
}

/**
 * Main demo runner
 */
async function main() {
  console.log('🚀 IterationTracker Demo Suite\n');
  console.log('Demonstrating CFN Loop iteration tracking, limits, and escalation\n');

  try {
    await demoBasicTracking();
    await demoEscalationHandling();
    await demoRealisticCFNLoop();
    await demoStatePersistence();
    await demoCustomLimits();
    await demoExportAnalysis();

    console.log('\n✨ All demos completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run demos if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
