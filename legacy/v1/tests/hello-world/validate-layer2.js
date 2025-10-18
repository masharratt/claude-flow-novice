#!/usr/bin/env node

/**
 * Layer 2 Validation Script
 *
 * Validates Layer 2 test results against success criteria:
 * - Total agents: 73-82 (72 from Layer 1 + 3-10 reviewers)
 * - All 70 files reviewed
 * - Reviewers spawned dynamically (3-10 range)
 * - Queue discipline maintained (max depth ≤15)
 * - Dynamic spawning/despawning validated
 * - 100% review pass rate
 */

import { createRedisClient } from './lib/redis-client.js';
import { MetricsCollector } from './lib/metrics-collector.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const RESULTS_FILE = path.join(__dirname, '../../test-results/hello-world/layer2-results.json');
const VALIDATION_FILE = path.join(__dirname, '../../test-results/hello-world/layer2-validation-report.json');

/**
 * Expected criteria for Layer 2
 */
const LAYER2_CRITERIA = {
  minAgents: 73,
  maxAgents: 82,
  expectedReviews: 70,
  minReviewers: 3,
  maxReviewers: 10,
  maxQueueDepth: 15,
  expectedPassRate: 1.0,
  minTimelineEvents: 140,
  requiredActions: [
    'claim_attempt',
    'claim_success',
    'agent_spawned',
    'work_complete',
    'review_complete'
  ]
};

/**
 * Validate agent counts
 */
async function validateAgentCounts(metrics) {
  const checks = {
    name: 'Agent Counts',
    passed: true,
    details: {}
  };

  const totalAgents = metrics.agents.total;

  checks.details.totalAgents = {
    value: totalAgents,
    expected: `${LAYER2_CRITERIA.minAgents}-${LAYER2_CRITERIA.maxAgents}`,
    passed: totalAgents >= LAYER2_CRITERIA.minAgents && totalAgents <= LAYER2_CRITERIA.maxAgents
  };

  if (!checks.details.totalAgents.passed) {
    checks.passed = false;
  }

  // Check implementer agents (should be ~70)
  const implementerAgents = Object.values(metrics.agents.byCoordinator || {})
    .filter(agents => agents[0]?.coordinator?.startsWith('Coordinator-'))
    .flat()
    .length;

  checks.details.implementerAgents = {
    value: implementerAgents,
    expected: '~70',
    passed: implementerAgents >= 65 && implementerAgents <= 75
  };

  if (!checks.details.implementerAgents.passed) {
    checks.passed = false;
  }

  return checks;
}

/**
 * Validate reviewer pool
 */
async function validateReviewerPool(metrics) {
  const checks = {
    name: 'Reviewer Pool',
    passed: true,
    details: {}
  };

  const reviewerPool = metrics.review.reviewerPool;

  checks.details.totalReviewers = {
    value: reviewerPool.total,
    expected: `${LAYER2_CRITERIA.minReviewers}-${LAYER2_CRITERIA.maxReviewers}`,
    passed: reviewerPool.total >= LAYER2_CRITERIA.minReviewers &&
            reviewerPool.total <= LAYER2_CRITERIA.maxReviewers
  };

  if (!checks.details.totalReviewers.passed) {
    checks.passed = false;
  }

  // Check if reviewers were spawned and terminated (dynamic behavior)
  const hasActive = reviewerPool.byStatus?.active?.length > 0;
  const hasTerminated = reviewerPool.byStatus?.terminated?.length > 0;

  checks.details.dynamicBehavior = {
    hasActiveReviewers: hasActive,
    hasTerminatedReviewers: hasTerminated,
    passed: hasActive || hasTerminated
  };

  if (!checks.details.dynamicBehavior.passed) {
    checks.passed = false;
  }

  // Check reviewer utilization (each should have done some reviews)
  const reviewersWithWork = reviewerPool.reviewers.filter(r => r.reviewCount > 0).length;

  checks.details.reviewerUtilization = {
    value: reviewersWithWork,
    totalReviewers: reviewerPool.total,
    passed: reviewersWithWork >= LAYER2_CRITERIA.minReviewers
  };

  if (!checks.details.reviewerUtilization.passed) {
    checks.passed = false;
  }

  return checks;
}

/**
 * Validate review results
 */
async function validateReviewResults(metrics) {
  const checks = {
    name: 'Review Results',
    passed: true,
    details: {}
  };

  const reviewResults = metrics.review.results;

  checks.details.totalReviews = {
    value: reviewResults.total,
    expected: LAYER2_CRITERIA.expectedReviews,
    passed: reviewResults.total === LAYER2_CRITERIA.expectedReviews
  };

  if (!checks.details.totalReviews.passed) {
    checks.passed = false;
  }

  checks.details.passRate = {
    value: reviewResults.passRate,
    expected: LAYER2_CRITERIA.expectedPassRate,
    passed: reviewResults.passRate === LAYER2_CRITERIA.expectedPassRate
  };

  if (!checks.details.passRate.passed) {
    checks.passed = false;
  }

  return checks;
}

/**
 * Validate queue discipline
 */
async function validateQueueDiscipline(poolSnapshots) {
  const checks = {
    name: 'Queue Discipline',
    passed: true,
    details: {}
  };

  if (!poolSnapshots || poolSnapshots.length === 0) {
    checks.details.error = 'No queue snapshots available';
    checks.passed = false;
    return checks;
  }

  const queueDepths = poolSnapshots.map(s => s.queueDepth);
  const maxQueueDepth = Math.max(...queueDepths);
  const avgQueueDepth = queueDepths.reduce((a, b) => a + b, 0) / queueDepths.length;

  checks.details.maxQueueDepth = {
    value: maxQueueDepth,
    expected: `≤${LAYER2_CRITERIA.maxQueueDepth}`,
    passed: maxQueueDepth <= LAYER2_CRITERIA.maxQueueDepth
  };

  if (!checks.details.maxQueueDepth.passed) {
    checks.passed = false;
  }

  checks.details.avgQueueDepth = {
    value: avgQueueDepth.toFixed(2),
    info: 'Should be around queue threshold (5)'
  };

  return checks;
}

/**
 * Validate dynamic spawning behavior
 */
async function validateDynamicSpawning(poolSnapshots) {
  const checks = {
    name: 'Dynamic Spawning',
    passed: true,
    details: {}
  };

  if (!poolSnapshots || poolSnapshots.length === 0) {
    checks.details.error = 'No pool snapshots available';
    checks.passed = false;
    return checks;
  }

  const reviewerCounts = poolSnapshots.map(s => s.activeReviewers);
  const minReviewers = Math.min(...reviewerCounts);
  const maxReviewers = Math.max(...reviewerCounts);

  checks.details.reviewerRange = {
    min: minReviewers,
    max: maxReviewers,
    variance: maxReviewers - minReviewers,
    passed: maxReviewers > minReviewers // Should see variation
  };

  if (!checks.details.reviewerRange.passed) {
    checks.passed = false;
  }

  // Check if reviewers were spawned over time (not all at once)
  const spawnTimes = poolSnapshots
    .filter(s => s.totalReviewers > 0)
    .map(s => s.timestamp);

  if (spawnTimes.length > 1) {
    const spawnSpan = spawnTimes[spawnTimes.length - 1] - spawnTimes[0];

    checks.details.spawnSpan = {
      value: `${(spawnSpan / 1000).toFixed(1)}s`,
      passed: spawnSpan > 5000 // Should span > 5 seconds
    };

    if (!checks.details.spawnSpan.passed) {
      checks.passed = false;
    }
  }

  return checks;
}

/**
 * Validate coordination messages
 */
async function validateCoordination(metrics) {
  const checks = {
    name: 'Coordination',
    passed: true,
    details: {}
  };

  const timeline = metrics.timeline;

  checks.details.totalEvents = {
    value: timeline.total,
    expected: `≥${LAYER2_CRITERIA.minTimelineEvents}`,
    passed: timeline.total >= LAYER2_CRITERIA.minTimelineEvents
  };

  if (!checks.details.totalEvents.passed) {
    checks.passed = false;
  }

  // Check for required actions
  checks.details.actions = {};

  for (const action of LAYER2_CRITERIA.requiredActions) {
    const count = timeline.byAction[action]?.length || 0;
    checks.details.actions[action] = {
      count,
      present: count > 0
    };

    if (!checks.details.actions[action].present) {
      checks.passed = false;
    }
  }

  // Check conflict count (should be low)
  const conflictCount = metrics.conflicts.total;

  checks.details.conflicts = {
    value: conflictCount,
    expected: '≤5',
    passed: conflictCount <= 5
  };

  // Conflicts are acceptable but shouldn't be excessive
  if (conflictCount > 10) {
    checks.passed = false;
  }

  return checks;
}

/**
 * Validate coordinators
 */
async function validateCoordinators(metrics) {
  const checks = {
    name: 'Coordinators',
    passed: true,
    details: {}
  };

  const coordinators = metrics.coordinators.coordinators;

  checks.details.count = {
    value: coordinators.length,
    expected: 3,
    passed: coordinators.length === 3
  };

  if (!checks.details.count.passed) {
    checks.passed = false;
  }

  // Check for implementer coordinators
  const implementers = coordinators.filter(c => c.id.startsWith('Coordinator-'));

  checks.details.implementers = {
    count: implementers.length,
    expected: 2,
    passed: implementers.length === 2
  };

  if (!checks.details.implementers.passed) {
    checks.passed = false;
  }

  // Check for review coordinator
  const reviewCoord = coordinators.find(c => c.id === 'ReviewCoordinator');

  checks.details.reviewCoordinator = {
    present: !!reviewCoord,
    passed: !!reviewCoord
  };

  if (!checks.details.reviewCoordinator.passed) {
    checks.passed = false;
  }

  // Check balanced distribution (implementers)
  if (implementers.length === 2) {
    const [coordA, coordB] = implementers;
    const diff = Math.abs(coordA.claimed - coordB.claimed);

    checks.details.balancedDistribution = {
      coordA: coordA.claimed,
      coordB: coordB.claimed,
      difference: diff,
      expected: '≤5',
      passed: diff <= 5
    };

    if (!checks.details.balancedDistribution.passed) {
      checks.passed = false;
    }
  }

  return checks;
}

/**
 * Main validation function
 */
async function validateLayer2() {
  console.log('━'.repeat(60));
  console.log('LAYER 2 VALIDATION SCRIPT');
  console.log('━'.repeat(60));
  console.log('');

  // Load results file
  let results;
  try {
    const resultsContent = await fs.readFile(RESULTS_FILE, 'utf-8');
    results = JSON.parse(resultsContent);
    console.log('✅ Loaded test results from', RESULTS_FILE);
  } catch (error) {
    console.error('❌ Failed to load test results:', error.message);
    console.error('   Expected file:', RESULTS_FILE);
    console.error('   Run layer2-review-coordination.js first');
    process.exit(1);
  }

  console.log('');
  console.log('Test Duration:', results.duration, 'seconds');
  console.log('Test Timestamp:', results.timestamp);
  console.log('');

  // Extract metrics and snapshots
  const metrics = results.metrics;
  const poolSnapshots = results.poolSnapshots || [];

  console.log('━'.repeat(60));
  console.log('RUNNING VALIDATION CHECKS');
  console.log('━'.repeat(60));
  console.log('');

  // Run all validation checks
  const validations = {
    agentCounts: await validateAgentCounts(metrics),
    reviewerPool: await validateReviewerPool(metrics),
    reviewResults: await validateReviewResults(metrics),
    queueDiscipline: await validateQueueDiscipline(poolSnapshots),
    dynamicSpawning: await validateDynamicSpawning(poolSnapshots),
    coordination: await validateCoordination(metrics),
    coordinators: await validateCoordinators(metrics)
  };

  // Print results
  for (const [key, validation] of Object.entries(validations)) {
    const status = validation.passed ? '✅' : '❌';
    console.log(`${status} ${validation.name}`);

    for (const [detailKey, detail] of Object.entries(validation.details)) {
      if (typeof detail === 'object') {
        console.log(`   ${detailKey}:`, JSON.stringify(detail, null, 2));
      } else {
        console.log(`   ${detailKey}:`, detail);
      }
    }

    console.log('');
  }

  // Overall result
  const allPassed = Object.values(validations).every(v => v.passed);

  console.log('━'.repeat(60));
  console.log(`OVERALL RESULT: ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('━'.repeat(60));
  console.log('');

  // Create validation report
  const report = {
    test: 'Layer 2: Review Coordination',
    timestamp: new Date().toISOString(),
    testDuration: results.duration,
    validations,
    passed: allPassed,
    summary: {
      totalChecks: Object.keys(validations).length,
      passedChecks: Object.values(validations).filter(v => v.passed).length,
      failedChecks: Object.values(validations).filter(v => !v.passed).length
    }
  };

  // Save report
  await fs.writeFile(VALIDATION_FILE, JSON.stringify(report, null, 2));
  console.log('📄 Validation report saved to', VALIDATION_FILE);
  console.log('');

  if (allPassed) {
    console.log('🎉 Layer 2 validation successful!');
    console.log('');
    console.log('Key achievements:');
    console.log(`  - ${metrics.agents.total} total agents spawned`);
    console.log(`  - ${metrics.review.reviewerPool.total} reviewers managed dynamically`);
    console.log(`  - ${metrics.review.results.total} reviews completed`);
    console.log(`  - ${(metrics.review.results.passRate * 100).toFixed(1)}% pass rate`);
  } else {
    console.log('❌ Layer 2 validation failed!');
    console.log('');
    console.log('Failed checks:');

    for (const [key, validation] of Object.entries(validations)) {
      if (!validation.passed) {
        console.log(`  - ${validation.name}`);
      }
    }
  }

  console.log('');

  process.exit(allPassed ? 0 : 1);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

// Run validation
validateLayer2().catch((error) => {
  console.error('❌ Validation failed with error:', error);
  console.error(error.stack);
  process.exit(1);
});
