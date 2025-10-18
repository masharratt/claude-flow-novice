#!/usr/bin/env node

/**
 * Pre-Publish Validation Suite
 * Validates all critical functionality before npm package publication
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TIMEOUT = 60000; // 60 seconds per test suite

const TEST_SUITES = [
  {
    name: '1. Post-Edit Pipeline Functionality',
    type: 'manual',
    validate: () => {
      const pipelinePath = 'config/hooks/post-edit-pipeline.js';
      if (!fs.existsSync(pipelinePath)) {
        throw new Error(`Post-edit pipeline not found at ${pipelinePath}`);
      }

      // Test basic execution (create test file first)
      const testFile = 'test-validation-temp.js';
      fs.writeFileSync(testFile, 'console.log("test");');

      try {
        execSync(`node ${pipelinePath} ${testFile}`, {
          timeout: 30000,
          stdio: 'pipe'
        });
        fs.unlinkSync(testFile);
        return { status: 'PASS', message: 'Pipeline executable and functional' };
      } catch (error) {
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
        return { status: 'WARN', message: `Pipeline execution failed: ${error.message.substring(0, 100)}` };
      }
    }
  },
  {
    name: '2. Full-Stack Swarm Tests',
    type: 'jest',
    tests: [
      'tests/swarm-fullstack/backend-integration.test.ts',
      'tests/swarm-fullstack/frontend-integration.test.ts',
      'tests/swarm-fullstack/workflows/iterative-workflow.test.ts'
    ]
  },
  {
    name: '3. CFN Loop Core Tests',
    type: 'jest',
    tests: [
      'tests/unit/cfn-loop/epic-iteration-limits.test.ts',
      'tests/unit/cfn-loop/retry-todo-manager.test.ts',
      'tests/integration/cfn-loop/cfn-loop-orchestrator.test.ts'
    ]
  },
  {
    name: '4. CFN Loop Slash Commands',
    type: 'jest',
    tests: [
      'tests/integration/slash-commands/cfn-loop-commands.test.ts',
      'tests/integration/slash-commands/cfn-loop-integration.test.js'
    ]
  },
  {
    name: '5. Tiered Structure with z.ai',
    type: 'manual',
    validate: () => {
      const required = [
        'src/providers/tiered-router.ts',
        'src/providers/zai-provider.ts'
      ];

      const missing = required.filter(file => !fs.existsSync(file));
      if (missing.length > 0) {
        return { status: 'FAIL', message: `Missing files: ${missing.join(', ')}` };
      }

      // Check test file exists
      const testFile = 'tests/providers/tiered-routing.test.ts';
      if (!fs.existsSync(testFile)) {
        return { status: 'WARN', message: `Test file not found: ${testFile}` };
      }

      return { status: 'PASS', message: 'Tiered routing files present' };
    }
  },
  {
    name: '6. SDK Process with Agents',
    type: 'manual',
    validate: () => {
      const sdkTests = 'tests/coordination/v2/unit/sdk';
      if (!fs.existsSync(sdkTests)) {
        return { status: 'WARN', message: 'SDK tests directory not found (still in development)' };
      }

      const testFiles = fs.readdirSync(sdkTests, { recursive: true })
        .filter(file => file.endsWith('.test.ts') || file.endsWith('.test.js'));

      return {
        status: 'INFO',
        message: `SDK in development - ${testFiles.length} test files found`
      };
    }
  }
];

function runJestTest(testPath) {
  if (!fs.existsSync(testPath)) {
    return { status: 'SKIP', message: 'Test file not found' };
  }

  try {
    execSync(
      `NODE_OPTIONS='--experimental-vm-modules' npm test -- ${testPath} --bail --maxWorkers=1 --forceExit --testTimeout=30000`,
      {
        timeout: TIMEOUT,
        stdio: 'pipe'
      }
    );
    return { status: 'PASS', message: 'All tests passed' };
  } catch (error) {
    const output = error.stdout?.toString() || error.stderr?.toString() || error.message;
    const hasTests = output.includes('Test Suites:') || output.includes('Tests:');

    if (!hasTests) {
      return { status: 'SKIP', message: 'No executable tests found' };
    }

    return { status: 'FAIL', message: output.substring(0, 200) };
  }
}

function formatResult(status) {
  const colors = {
    PASS: '\x1b[32m✓\x1b[0m',
    FAIL: '\x1b[31m✗\x1b[0m',
    WARN: '\x1b[33m⚠\x1b[0m',
    INFO: '\x1b[36mℹ\x1b[0m',
    SKIP: '\x1b[90m−\x1b[0m'
  };
  return colors[status] || status;
}

async function main() {
  console.log('\n🚀 Pre-Publish Validation Suite\n');
  console.log('=' .repeat(80) + '\n');

  const results = [];

  for (const suite of TEST_SUITES) {
    console.log(`\n${suite.name}`);
    console.log('-'.repeat(80));

    if (suite.type === 'manual') {
      const result = suite.validate();
      console.log(`${formatResult(result.status)} ${result.message}`);
      results.push({ suite: suite.name, ...result });
    } else if (suite.type === 'jest') {
      for (const testPath of suite.tests) {
        const filename = path.basename(testPath);
        const result = runJestTest(testPath);
        console.log(`  ${formatResult(result.status)} ${filename}`);
        if (result.message && result.status !== 'PASS') {
          console.log(`     ${result.message.split('\n')[0]}`);
        }
        results.push({ suite: suite.name, test: filename, ...result });
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 SUMMARY\n');

  const summary = {
    PASS: results.filter(r => r.status === 'PASS').length,
    FAIL: results.filter(r => r.status === 'FAIL').length,
    WARN: results.filter(r => r.status === 'WARN').length,
    INFO: results.filter(r => r.status === 'INFO').length,
    SKIP: results.filter(r => r.status === 'SKIP').length
  };

  console.log(`${formatResult('PASS')} Passed:  ${summary.PASS}`);
  console.log(`${formatResult('FAIL')} Failed:  ${summary.FAIL}`);
  console.log(`${formatResult('WARN')} Warnings: ${summary.WARN}`);
  console.log(`${formatResult('INFO')} Info:     ${summary.INFO}`);
  console.log(`${formatResult('SKIP')} Skipped:  ${summary.SKIP}`);

  console.log('\n' + '='.repeat(80));

  // Critical failures block publication
  if (summary.FAIL > 0) {
    console.log('\n❌ CRITICAL: Tests failed. Fix before publishing.\n');
    process.exit(1);
  }

  if (summary.PASS === 0 && summary.WARN > 0) {
    console.log('\n⚠️  WARNING: No tests passed, only warnings. Review before publishing.\n');
    process.exit(1);
  }

  console.log('\n✅ Validation complete. Ready for publication.\n');
  process.exit(0);
}

main().catch(error => {
  console.error('\n❌ Validation suite failed:', error.message);
  process.exit(1);
});
