#!/usr/bin/env node

/**
 * Intelligent Test Runner
 *
 * Categorizes and runs tests based on type:
 * - unit: Fast, isolated tests (run first)
 * - integration: Component integration tests
 * - e2e: End-to-end workflow tests
 * - performance: Benchmark tests (skip in CI)
 * - chaos: Chaos engineering tests (skip in quick runs)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CATEGORIES = {
  unit: {
    pattern: 'tests/unit/**/*.test.{ts,js}',
    timeout: 30000,
    priority: 1,
    description: 'Unit tests (fast, isolated)'
  },
  integration: {
    pattern: 'tests/integration/**/*.test.{ts,js}',
    timeout: 60000,
    priority: 2,
    description: 'Integration tests'
  },
  e2e: {
    pattern: 'tests/**/e2e/**/*.test.{ts,js}',
    timeout: 120000,
    priority: 3,
    description: 'End-to-end tests'
  },
  uncategorized: {
    pattern: 'tests/*.test.{ts,js}',
    timeout: 30000,
    priority: 4,
    description: 'Uncategorized tests'
  }
};

const SKIP_CATEGORIES = {
  chaos: 'tests/chaos/**/*.test.{ts,js}',
  benchmark: 'tests/benchmarks/**/*.test.{ts,js}',
  archived: 'tests/archived/**/*.test.{ts,js}',
  performance: 'tests/performance/**/*.test.{ts,js}'
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    category: 'all',
    coverage: false,
    watch: false,
    verbose: false,
    quick: false
  };

  for (const arg of args) {
    if (arg === '--coverage') options.coverage = true;
    else if (arg === '--watch') options.watch = true;
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--quick') options.quick = true;
    else if (arg.startsWith('--category=')) {
      options.category = arg.split('=')[1];
    }
  }

  return options;
}

function runTests(category, pattern, timeout, options) {
  console.log(`\n🧪 Running ${category} tests...`);

  try {
    // Convert glob pattern to regex for Jest
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\{ts,js\}/g, '(ts|js)');

    const jestArgs = [
      `--config=config/jest/jest.config.js`,
      `--testPathPatterns="${regexPattern}"`,
      `--testTimeout=${timeout}`,
      `--maxWorkers=2`,
      '--bail',
      options.coverage ? '--coverage' : '',
      options.watch ? '--watch' : '',
      options.verbose ? '--verbose' : ''
    ].filter(Boolean).join(' ');

    const cmd = `NODE_OPTIONS='--experimental-vm-modules --max-old-space-size=8192' jest ${jestArgs}`;

    execSync(cmd, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });

    console.log(`✅ ${category} tests passed\n`);
    return true;
  } catch (error) {
    console.error(`❌ ${category} tests failed\n`);
    return false;
  }
}

function main() {
  const options = parseArgs();

  console.log('🎯 Claude Flow Test Runner');
  console.log('━'.repeat(50));

  if (options.quick) {
    console.log('⚡ Quick mode: Running unit tests only');
    const success = runTests('unit', CATEGORIES.unit.pattern, CATEGORIES.unit.timeout, options);
    process.exit(success ? 0 : 1);
  }

  if (options.category !== 'all') {
    const cat = CATEGORIES[options.category];
    if (!cat) {
      console.error(`❌ Unknown category: ${options.category}`);
      console.log('Available categories:', Object.keys(CATEGORIES).join(', '));
      process.exit(1);
    }

    const success = runTests(options.category, cat.pattern, cat.timeout, options);
    process.exit(success ? 0 : 1);
  }

  // Run all categories in order of priority
  const sortedCategories = Object.entries(CATEGORIES)
    .sort(([, a], [, b]) => a.priority - b.priority);

  let allPassed = true;
  for (const [name, config] of sortedCategories) {
    const success = runTests(name, config.pattern, config.timeout, options);
    if (!success) allPassed = false;
  }

  if (allPassed) {
    console.log('\n✅ All test categories passed!');
  } else {
    console.log('\n❌ Some tests failed');
  }

  process.exit(allPassed ? 0 : 1);
}

main();
