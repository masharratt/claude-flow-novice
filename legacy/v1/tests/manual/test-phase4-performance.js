#!/usr/bin/env node

/**
 * Phase 4 Performance Optimization Test Runner
 * Tests and validates the 30% latency reduction target
 */

import Phase4Coordinator from '../../src/performance/phase4-coordinator.js';

async function runPhase4Test() {
  console.log('🚀 Starting Phase 4 Performance Optimization Test');
  console.log('=' .repeat(60));

  const coordinator = new Phase4Coordinator({
    targets: {
      latencyReduction: 30,
      throughputImprovement: 50,
      realTimeMonitoringInterval: 1000
    }
  });

  try {
    // Initialize coordinator
    await coordinator.initialize();

    // Monitor progress
    coordinator.on('phase_status', (status) => {
      console.log(`📊 Phase ${status.phase}: ${status.status}`);
    });

    coordinator.on('componentAlert', (alert) => {
      console.log(`🚨 Alert from ${alert.component}: ${alert.alert.message}`);
    });

    // Wait for completion
    await new Promise((resolve) => {
      coordinator.on('completion', () => {
        resolve();
      });
    });

    // Get final results
    const results = coordinator.getStatus();
    console.log('\n🎯 FINAL RESULTS:');
    console.log(`Status: ${results.results?.overall?.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`Score: ${results.results?.overall?.score} (${results.results?.overall?.grade})`);
    console.log(`Latency Improvement: ${results.results?.improvements?.latency?.improvement?.toFixed(1)}%`);
    console.log(`Throughput Improvement: ${results.results?.improvements?.throughput?.improvement?.toFixed(1)}%`);

    // Shutdown
    await coordinator.shutdown();

    process.exit(results.results?.overall?.passed ? 0 : 1);

  } catch (error) {
    console.error('❌ Phase 4 test failed:', error.message);
    await coordinator.shutdown();
    process.exit(1);
  }
}

// Run test
runPhase4Test().catch(console.error);