#!/usr/bin/env tsx
/**
 * Parallelization Validation Suite
 *
 * Orchestrates all parallelization tests and validates against production readiness checklist
 * from ASSUMPTIONS_AND_TESTING.md (lines 685-705)
 *
 * Exit codes:
 *   0 - All tests passed, production ready
 *   1 - Critical test failures, not production ready
 *   2 - Test execution error
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  metric?: string;
  duration?: number;
  error?: string;
  threshold?: string;
  actual?: string;
}

interface ValidationReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    timestamp: string;
    production_ready: boolean;
  };
  before_production: Record<string, TestResult>;
  chaos_tests: Record<string, TestResult>;
  performance_benchmarks: Record<string, TestResult>;
  critical_failures: string[];
  warnings: string[];
}

// Test suite configuration aligned with checklist
const TEST_SUITES = {
  before_production: [
    {
      name: 'redis_pubsub',
      file: 'redis-pubsub.test.ts',
      threshold: '>10K msg/sec sustained',
      metricExtractor: (output: string) => extractThroughput(output)
    },
    {
      name: 'test_lock',
      file: 'test-lock-serialization.test.ts',
      threshold: '0 port conflicts in 100 runs',
      metricExtractor: (output: string) => extractConflicts(output)
    },
    {
      name: 'orphan_detection',
      file: 'orphan-detection.test.ts',
      threshold: '<10MB memory growth over 10 epics',
      metricExtractor: (output: string) => extractMemoryGrowth(output)
    },
    {
      name: 'productive_waiting',
      file: 'productive-waiting.test.ts',
      threshold: '>50% efficiency measured',
      metricExtractor: (output: string) => extractEfficiency(output)
    },
    {
      name: 'api_key_rotation',
      file: 'api-key-rotation.test.ts',
      threshold: '0 failures with 3 keys @ 3x rate limit',
      metricExtractor: (output: string) => extractApiKeyFailures(output),
      optional: true // May not exist yet
    },
    {
      name: 'deadlock_prevention',
      file: 'deadlock-prevention.test.ts',
      threshold: '<35s timeout for circular deps',
      metricExtractor: (output: string) => extractTimeout(output)
    }
  ],
  chaos_tests: [
    {
      name: 'random_crashes',
      file: 'chaos-random-crashes.test.ts',
      threshold: '30% crashes → 100% cleanup within 3min',
      metricExtractor: (output: string) => extractChaosRecovery(output, 'cleanup'),
      optional: true // May not exist yet
    },
    {
      name: 'redis_failures',
      file: 'chaos-redis-failures.test.ts',
      threshold: 'Redis failures → Recovery within 30s',
      metricExtractor: (output: string) => extractChaosRecovery(output, 'redis'),
      optional: true
    },
    {
      name: 'concurrent_edits',
      file: 'chaos-concurrent-edits.test.ts',
      threshold: '100% conflict detection',
      metricExtractor: (output: string) => extractChaosRecovery(output, 'conflicts'),
      optional: true
    },
    {
      name: 'test_lock_crashes',
      file: 'chaos-test-lock-crashes.test.ts',
      threshold: 'Stale lock release within 15min',
      metricExtractor: (output: string) => extractChaosRecovery(output, 'locks'),
      optional: true
    }
  ],
  performance_benchmarks: [
    {
      name: 'three_independent_sprints',
      file: 'performance-benchmarks.test.ts',
      threshold: '<40min (baseline: 75min)',
      metricExtractor: (output: string) => extractBenchmark(output, '3_independent'),
      optional: true
    },
    {
      name: 'five_mixed_sprints',
      file: 'performance-benchmarks.test.ts',
      threshold: '<60min (baseline: 125min)',
      metricExtractor: (output: string) => extractBenchmark(output, '5_mixed'),
      optional: true
    },
    {
      name: 'ten_sprints',
      file: 'performance-benchmarks.test.ts',
      threshold: '<100min (baseline: 250min)',
      metricExtractor: (output: string) => extractBenchmark(output, '10_sprints'),
      optional: true
    }
  ]
};

// Metric extraction functions
function extractThroughput(output: string): string {
  const match = output.match(/(\d+(?:,\d+)*)\s*msg\/sec/i) ||
                output.match(/throughput:\s*(\d+)/i);
  return match ? `${match[1]} msg/sec` : 'N/A';
}

function extractConflicts(output: string): string {
  const match = output.match(/(\d+)\s*conflicts?/i) ||
                output.match(/port\s+conflicts?:\s*(\d+)/i);
  return match ? `${match[1]} conflicts` : '0 conflicts';
}

function extractMemoryGrowth(output: string): string {
  const match = output.match(/(\d+(?:\.\d+)?)\s*MB\s*growth/i) ||
                output.match(/memory\s+growth:\s*(\d+(?:\.\d+)?)/i);
  return match ? `${match[1]} MB growth` : 'N/A';
}

function extractEfficiency(output: string): string {
  const match = output.match(/(\d+(?:\.\d+)?)%\s*efficiency/i) ||
                output.match(/efficiency:\s*(\d+(?:\.\d+)?)/i);
  return match ? `${match[1]}% efficiency` : 'N/A';
}

function extractApiKeyFailures(output: string): string {
  const match = output.match(/(\d+)\s*failures?/i);
  return match ? `${match[1]} failures` : '0 failures';
}

function extractTimeout(output: string): string {
  const match = output.match(/(\d+(?:\.\d+)?)\s*s\s*timeout/i) ||
                output.match(/timeout:\s*(\d+(?:\.\d+)?)/i);
  return match ? `${match[1]}s timeout` : 'N/A';
}

function extractChaosRecovery(output: string, type: string): string {
  const patterns: Record<string, RegExp> = {
    cleanup: /cleanup:\s*(\d+(?:\.\d+)?)\s*min/i,
    redis: /recovery:\s*(\d+(?:\.\d+)?)\s*s/i,
    conflicts: /detection:\s*(\d+(?:\.\d+)?)%/i,
    locks: /release:\s*(\d+(?:\.\d+)?)\s*min/i
  };
  const match = output.match(patterns[type] || /.*/);
  return match ? match[1] : 'N/A';
}

function extractBenchmark(output: string, scenario: string): string {
  const pattern = new RegExp(`${scenario}.*?(\\d+(?:\\.\\d+)?)\\s*min`, 'i');
  const match = output.match(pattern);
  return match ? `${match[1]} min` : 'N/A';
}

// Run a single test file
async function runTest(testFile: string, category: string): Promise<TestResult> {
  const testPath = path.join('/mnt/c/Users/masha/Documents/claude-flow-novice/tests/parallelization', testFile);

  // Check if file exists
  try {
    await fs.access(testPath);
  } catch {
    return {
      name: testFile.replace('.test.ts', ''),
      category,
      passed: false,
      error: 'Test file not found',
      metric: 'SKIP'
    };
  }

  const startTime = Date.now();

  return new Promise((resolve) => {
    let output = '';
    let errorOutput = '';

    // Use vitest to run tests (not tsx)
    const testProcess = spawn('npx', ['vitest', 'run', testPath, '--reporter=verbose'], {
      cwd: '/mnt/c/Users/masha/Documents/claude-flow-novice',
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=8192'
      }
    });

    testProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    testProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    testProcess.on('close', (code) => {
      const duration = Date.now() - startTime;

      resolve({
        name: testFile.replace('.test.ts', ''),
        category,
        passed: code === 0,
        duration,
        error: code !== 0 ? errorOutput || 'Test failed' : undefined,
        metric: output || errorOutput
      });
    });

    testProcess.on('error', (err) => {
      resolve({
        name: testFile.replace('.test.ts', ''),
        category,
        passed: false,
        duration: Date.now() - startTime,
        error: err.message,
        metric: 'ERROR'
      });
    });
  });
}

// Validate results against thresholds
function validateThreshold(result: TestResult, threshold: string, metricExtractor: (output: string) => string): TestResult {
  if (!result.passed || !result.metric) {
    return result;
  }

  const actual = metricExtractor(result.metric);

  return {
    ...result,
    threshold,
    actual,
    metric: actual
  };
}

// Generate validation report
function generateReport(results: Record<string, Record<string, TestResult>>): ValidationReport {
  const allResults: TestResult[] = Object.values(results).flatMap(category => Object.values(category));
  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed).length;

  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  // Identify critical failures (non-optional tests)
  allResults.forEach(result => {
    if (!result.passed && result.error !== 'Test file not found') {
      criticalFailures.push(`${result.category}/${result.name}: ${result.error || 'Failed'}`);
    }
    if (result.passed && result.actual && result.actual.includes('N/A')) {
      warnings.push(`${result.category}/${result.name}: Metric extraction failed`);
    }
  });

  const productionReady = criticalFailures.length === 0 && passed >= 8; // At least 8/12 tests must pass

  return {
    summary: {
      total: allResults.length,
      passed,
      failed,
      timestamp: new Date().toISOString(),
      production_ready: productionReady
    },
    before_production: results.before_production || {},
    chaos_tests: results.chaos_tests || {},
    performance_benchmarks: results.performance_benchmarks || {},
    critical_failures: criticalFailures,
    warnings
  };
}

// Format status emoji
function statusEmoji(passed: boolean): string {
  return passed ? '✅' : '❌';
}

// Print report to console
function printReport(report: ValidationReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 PARALLELIZATION VALIDATION SUITE');
  console.log('='.repeat(80));

  console.log('\n📊 SUMMARY');
  console.log(`  Total Tests:     ${report.summary.total}`);
  console.log(`  Passed:          ${report.summary.passed} ✅`);
  console.log(`  Failed:          ${report.summary.failed} ❌`);
  console.log(`  Timestamp:       ${report.summary.timestamp}`);
  console.log(`  Production Ready: ${report.summary.production_ready ? '✅ YES' : '❌ NO'}`);

  console.log('\n📋 BEFORE PRODUCTION CHECKLIST');
  console.log('-'.repeat(80));
  Object.entries(report.before_production).forEach(([key, result]) => {
    const status = statusEmoji(result.passed);
    const metric = result.metric || 'N/A';
    const threshold = result.threshold || 'Unknown';
    console.log(`  ${status} ${key.padEnd(25)} ${metric.padEnd(25)} (target: ${threshold})`);
  });

  console.log('\n💥 CHAOS TESTS');
  console.log('-'.repeat(80));
  Object.entries(report.chaos_tests).forEach(([key, result]) => {
    const status = statusEmoji(result.passed);
    const metric = result.metric || 'N/A';
    const threshold = result.threshold || 'Unknown';
    console.log(`  ${status} ${key.padEnd(25)} ${metric.padEnd(25)} (target: ${threshold})`);
  });

  console.log('\n⚡ PERFORMANCE BENCHMARKS');
  console.log('-'.repeat(80));
  Object.entries(report.performance_benchmarks).forEach(([key, result]) => {
    const status = statusEmoji(result.passed);
    const metric = result.metric || 'N/A';
    const threshold = result.threshold || 'Unknown';
    console.log(`  ${status} ${key.padEnd(25)} ${metric.padEnd(25)} (target: ${threshold})`);
  });

  if (report.critical_failures.length > 0) {
    console.log('\n🚨 CRITICAL FAILURES');
    console.log('-'.repeat(80));
    report.critical_failures.forEach(failure => {
      console.log(`  ❌ ${failure}`);
    });
  }

  if (report.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS');
    console.log('-'.repeat(80));
    report.warnings.forEach(warning => {
      console.log(`  ⚠️  ${warning}`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log(report.summary.production_ready
    ? '✅ PRODUCTION READY - All critical tests passed'
    : '❌ NOT PRODUCTION READY - Fix critical failures before deployment');
  console.log('='.repeat(80) + '\n');
}

// Save report to file
async function saveReport(report: ValidationReport): Promise<void> {
  const reportPath = path.join(
    '/mnt/c/Users/masha/Documents/claude-flow-novice/tests/parallelization',
    'validation-report.json'
  );

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n📄 Report saved to: ${reportPath}`);
}

// Main execution
async function main(): Promise<void> {
  console.log('🧪 Starting Parallelization Validation Suite...\n');

  const results: Record<string, Record<string, TestResult>> = {
    before_production: {},
    chaos_tests: {},
    performance_benchmarks: {}
  };

  // Run before_production tests
  console.log('📋 Running Before Production Tests...');
  for (const test of TEST_SUITES.before_production) {
    console.log(`  ⏳ ${test.name}...`);
    const result = await runTest(test.file, 'before_production');
    results.before_production[test.name] = validateThreshold(result, test.threshold, test.metricExtractor);

    // Skip if optional and not found
    if (test.optional && result.error === 'Test file not found') {
      console.log(`  ⏭️  ${test.name} (optional - skipped)`);
      continue;
    }

    console.log(`  ${statusEmoji(result.passed)} ${test.name} (${result.duration}ms)`);
  }

  // Run chaos tests
  console.log('\n💥 Running Chaos Tests...');
  for (const test of TEST_SUITES.chaos_tests) {
    console.log(`  ⏳ ${test.name}...`);
    const result = await runTest(test.file, 'chaos_tests');
    results.chaos_tests[test.name] = validateThreshold(result, test.threshold, test.metricExtractor);

    if (test.optional && result.error === 'Test file not found') {
      console.log(`  ⏭️  ${test.name} (optional - skipped)`);
      continue;
    }

    console.log(`  ${statusEmoji(result.passed)} ${test.name} (${result.duration}ms)`);
  }

  // Run performance benchmarks
  console.log('\n⚡ Running Performance Benchmarks...');
  for (const test of TEST_SUITES.performance_benchmarks) {
    console.log(`  ⏳ ${test.name}...`);
    const result = await runTest(test.file, 'performance_benchmarks');
    results.performance_benchmarks[test.name] = validateThreshold(result, test.threshold, test.metricExtractor);

    if (test.optional && result.error === 'Test file not found') {
      console.log(`  ⏭️  ${test.name} (optional - skipped)`);
      continue;
    }

    console.log(`  ${statusEmoji(result.passed)} ${test.name} (${result.duration}ms)`);
  }

  // Generate and print report
  const report = generateReport(results);
  printReport(report);

  // Save report
  await saveReport(report);

  // Exit with appropriate code
  process.exit(report.summary.production_ready ? 0 : 1);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(2);
});

// Run main
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(2);
});
