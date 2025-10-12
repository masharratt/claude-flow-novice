#!/usr/bin/env node

/**
 * Layer 3 Validation Script
 *
 * Validates Layer 3 test results against success criteria:
 * - 50% error injection rate (±10% tolerance)
 * - Error distribution matches expected probabilities (±15% tolerance)
 * - All 70 files pass after retries
 * - Max retries per file ≤10
 * - Avg retries per file ≤4
 * - Fresh agents spawned for each retry
 * - 100% final success rate
 */

import { createRedisClient } from './lib/redis-client.js';
import { MetricsCollector } from './lib/metrics-collector.js';
import { ERROR_TYPES } from './lib/error-injector.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const RESULTS_FILE = path.join(__dirname, '../../test-results/hello-world/layer3-results.json');
const VALIDATION_FILE = path.join(__dirname, '../../test-results/hello-world/layer3-validation-report.json');

/**
 * Expected criteria for Layer 3
 */
const LAYER3_CRITERIA = {
  expectedErrorRate: 0.5,
  errorRateTolerance: 0.1,
  errorDistribution: {
    SyntaxError: 0.35,
    LogicError: 0.35,
    TranslationError: 0.20,
    MixedError: 0.10
  },
  errorDistributionTolerance: 0.15,
  expectedReviews: 70,
  expectedPassRate: 1.0,
  maxRetriesPerFile: 10,
  maxAvgRetries: 4,
  minTimelineEvents: 200
};

/**
 * Validate error injection rate
 */
async function validateErrorInjection(metrics) {
  const checks = {
    name: 'Error Injection',
    passed: true,
    details: {}
  };

  const errorRate = metrics.errors.rate;

  checks.details.errorRate = {
    value: errorRate,
    percentage: `${(errorRate * 100).toFixed(1)}%`,
    expected: `${LAYER3_CRITERIA.expectedErrorRate * 100}% ±${LAYER3_CRITERIA.errorRateTolerance * 100}%`,
    passed: Math.abs(errorRate - LAYER3_CRITERIA.expectedErrorRate) <= LAYER3_CRITERIA.errorRateTolerance
  };

  if (!checks.details.errorRate.passed) {
    checks.passed = false;
  }

  checks.details.totalErrors = {
    value: metrics.errors.total,
    expected: '~35 (50% of 70)',
    passed: metrics.errors.total >= 25 && metrics.errors.total <= 45
  };

  if (!checks.details.totalErrors.passed) {
    checks.passed = false;
  }

  return checks;
}

/**
 * Validate error distribution
 */
async function validateErrorDistribution(metrics) {
  const checks = {
    name: 'Error Distribution',
    passed: true,
    details: {}
  };

  if (!metrics.errors.byType || metrics.errors.total === 0) {
    checks.details.error = 'No error distribution data available';
    checks.passed = false;
    return checks;
  }

  const total = metrics.errors.total;
  const tolerance = LAYER3_CRITERIA.errorDistributionTolerance;

  checks.details.distribution = {};

  for (const [errorType, expectedRate] of Object.entries(LAYER3_CRITERIA.errorDistribution)) {
    const actualCount = metrics.errors.byType[errorType]?.length || 0;
    const actualRate = actualCount / total;

    const passed = Math.abs(actualRate - expectedRate) <= tolerance;

    checks.details.distribution[errorType] = {
      count: actualCount,
      percentage: `${(actualRate * 100).toFixed(1)}%`,
      expected: `${(expectedRate * 100).toFixed(1)}% ±${(tolerance * 100).toFixed(1)}%`,
      passed
    };

    if (!passed) {
      checks.passed = false;
    }
  }

  return checks;
}

/**
 * Validate retry behavior
 */
async function validateRetryBehavior(metrics, retryStats) {
  const checks = {
    name: 'Retry Behavior',
    passed: true,
    details: {}
  };

  checks.details.totalRetries = {
    value: retryStats.total,
    info: 'Total retry attempts across all files'
  };

  checks.details.filesWithRetries = {
    value: metrics.retries.counts.length,
    expected: `~${metrics.errors.total} (files with errors)`,
    passed: metrics.retries.counts.length > 0
  };

  if (!checks.details.filesWithRetries.passed) {
    checks.passed = false;
  }

  checks.details.maxRetriesPerFile = {
    value: retryStats.max,
    expected: `≤${LAYER3_CRITERIA.maxRetriesPerFile}`,
    passed: retryStats.max <= LAYER3_CRITERIA.maxRetriesPerFile
  };

  if (!checks.details.maxRetriesPerFile.passed) {
    checks.passed = false;
  }

  checks.details.avgRetriesPerFile = {
    value: retryStats.avg.toFixed(2),
    expected: `≤${LAYER3_CRITERIA.maxAvgRetries}`,
    passed: retryStats.avg <= LAYER3_CRITERIA.maxAvgRetries
  };

  if (!checks.details.avgRetriesPerFile.passed) {
    checks.passed = false;
  }

  return checks;
}

/**
 * Validate fresh agent spawning
 */
async function validateFreshAgents(metrics) {
  const checks = {
    name: 'Fresh Agent Spawning',
    passed: true,
    details: {}
  };

  // Count fresh agent spawns in timeline
  const freshSpawns = metrics.timeline.entries.filter(e =>
    e.action === 'agent_spawned' && e.metadata?.agentId?.includes('retry')
  );

  checks.details.freshAgentSpawns = {
    value: freshSpawns.length,
    info: 'Fresh agents spawned for retries'
  };

  // Should have fresh agents spawned (at least some retries)
  checks.details.hasFreshAgents = {
    value: freshSpawns.length > 0,
    passed: freshSpawns.length > 0
  };

  if (!checks.details.hasFreshAgents.passed) {
    checks.passed = false;
  }

  // Check if retry agent IDs follow pattern
  const retryAgents = metrics.agents.agents.filter(a => a.id?.includes('retry'));

  checks.details.retryAgentPattern = {
    count: retryAgents.length,
    expected: '> 0',
    passed: retryAgents.length > 0
  };

  if (!checks.details.retryAgentPattern.passed) {
    checks.passed = false;
  }

  return checks;
}

/**
 * Validate final success rate
 */
async function validateFinalSuccess(metrics) {
  const checks = {
    name: 'Final Success Rate',
    passed: true,
    details: {}
  };

  const reviewResults = metrics.review.results;

  checks.details.totalReviews = {
    value: reviewResults.total,
    expected: LAYER3_CRITERIA.expectedReviews,
    passed: reviewResults.total === LAYER3_CRITERIA.expectedReviews
  };

  if (!checks.details.totalReviews.passed) {
    checks.passed = false;
  }

  checks.details.passRate = {
    value: reviewResults.passRate,
    percentage: `${(reviewResults.passRate * 100).toFixed(1)}%`,
    expected: `${LAYER3_CRITERIA.expectedPassRate * 100}%`,
    passed: reviewResults.passRate === LAYER3_CRITERIA.expectedPassRate
  };

  if (!checks.details.passRate.passed) {
    checks.passed = false;
  }

  // Check completed claims
  const completedClaims = metrics.claims.byStatus?.completed?.length || 0;

  checks.details.completedClaims = {
    value: completedClaims,
    expected: LAYER3_CRITERIA.expectedReviews,
    passed: completedClaims === LAYER3_CRITERIA.expectedReviews
  };

  if (!checks.details.completedClaims.passed) {
    checks.passed = false;
  }

  return checks;
}

/**
 * Validate coordination integrity
 */
async function validateCoordination(metrics) {
  const checks = {
    name: 'Coordination Integrity',
    passed: true,
    details: {}
  };

  const timeline = metrics.timeline;

  checks.details.totalEvents = {
    value: timeline.total,
    expected: `≥${LAYER3_CRITERIA.minTimelineEvents}`,
    passed: timeline.total >= LAYER3_CRITERIA.minTimelineEvents
  };

  if (!checks.details.totalEvents.passed) {
    checks.passed = false;
  }

  // Check for claim releases (retries should release claims)
  const claimReleases = timeline.entries.filter(e => e.action === 'claim_release');

  checks.details.claimReleases = {
    value: claimReleases.length,
    expected: '> 0 (retries should release claims)',
    passed: claimReleases.length > 0
  };

  if (!checks.details.claimReleases.passed) {
    checks.passed = false;
  }

  // Check coordinators
  const coordinatorCount = metrics.coordinators.count;

  checks.details.coordinatorCount = {
    value: coordinatorCount,
    expected: 3,
    passed: coordinatorCount === 3
  };

  if (!checks.details.coordinatorCount.passed) {
    checks.passed = false;
  }

  return checks;
}

/**
 * Validate retry patterns
 */
async function validateRetryPatterns(metrics) {
  const checks = {
    name: 'Retry Patterns',
    passed: true,
    details: {}
  };

  const retryLog = metrics.retries.log || [];

  if (retryLog.length === 0) {
    checks.details.error = 'No retry log available';
    checks.passed = false;
    return checks;
  }

  // Group retries by attempt number
  const byAttempt = retryLog.reduce((acc, entry) => {
    acc[entry.attempt] = (acc[entry.attempt] || 0) + 1;
    return acc;
  }, {});

  checks.details.retriesByAttempt = byAttempt;

  // Verify exponential backoff pattern (fewer retries at higher attempts)
  const attempts = Object.keys(byAttempt).map(Number).sort((a, b) => a - b);

  if (attempts.length > 1) {
    const firstAttemptCount = byAttempt[attempts[0]];
    const lastAttemptCount = byAttempt[attempts[attempts.length - 1]];

    checks.details.exponentialPattern = {
      firstAttemptCount,
      lastAttemptCount,
      info: 'First attempt should have more retries than later attempts',
      passed: firstAttemptCount >= lastAttemptCount
    };

    if (!checks.details.exponentialPattern.passed) {
      checks.passed = false;
    }
  }

  // Check error types in retries
  const errorTypes = new Set(retryLog.map(e => e.errorType).filter(Boolean));

  checks.details.errorTypesInRetries = {
    types: Array.from(errorTypes),
    count: errorTypes.size,
    expected: '> 0',
    passed: errorTypes.size > 0
  };

  if (!checks.details.errorTypesInRetries.passed) {
    checks.passed = false;
  }

  return checks;
}

/**
 * Main validation function
 */
async function validateLayer3() {
  console.log('━'.repeat(60));
  console.log('LAYER 3 VALIDATION SCRIPT');
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
    console.error('   Run layer3-error-retry.js first');
    process.exit(1);
  }

  console.log('');
  console.log('Test Duration:', results.duration, 'seconds');
  console.log('Test Timestamp:', results.timestamp);
  console.log('Test Config:', JSON.stringify(results.config, null, 2));
  console.log('');

  // Extract metrics
  const metrics = results.metrics;
  const retryStats = results.validation.retryStats;

  console.log('━'.repeat(60));
  console.log('RUNNING VALIDATION CHECKS');
  console.log('━'.repeat(60));
  console.log('');

  // Run all validation checks
  const validations = {
    errorInjection: await validateErrorInjection(metrics),
    errorDistribution: await validateErrorDistribution(metrics),
    retryBehavior: await validateRetryBehavior(metrics, retryStats),
    freshAgents: await validateFreshAgents(metrics),
    finalSuccess: await validateFinalSuccess(metrics),
    coordination: await validateCoordination(metrics),
    retryPatterns: await validateRetryPatterns(metrics)
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
    test: 'Layer 3: Error Handling & Retry Coordination',
    timestamp: new Date().toISOString(),
    testDuration: results.duration,
    config: results.config,
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
    console.log('🎉 Layer 3 validation successful!');
    console.log('');
    console.log('Key achievements:');
    console.log(`  - ${metrics.errors.total} errors injected (${(metrics.errors.rate * 100).toFixed(1)}% rate)`);
    console.log(`  - ${retryStats.total} retries executed`);
    console.log(`  - Max ${retryStats.max} retries per file`);
    console.log(`  - Avg ${retryStats.avg.toFixed(2)} retries per file`);
    console.log(`  - ${metrics.review.results.total} reviews completed`);
    console.log(`  - ${(metrics.review.results.passRate * 100).toFixed(1)}% final success rate`);
  } else {
    console.log('❌ Layer 3 validation failed!');
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
validateLayer3().catch((error) => {
  console.error('❌ Validation failed with error:', error);
  console.error(error.stack);
  process.exit(1);
});
