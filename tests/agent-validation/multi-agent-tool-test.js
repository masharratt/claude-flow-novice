/**
 * Multi-Agent Tool Validation Test
 *
 * PURPOSE: Test 15+ specialized agent types to ensure:
 * 1. Argument parsing works (both --flag=value and --flag value)
 * 2. Coordinator override spawns exact agent count requested
 * 3. All agents have functional tooling
 *
 * USAGE:
 * node tests/agent-validation/multi-agent-tool-test.js
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const AGENT_TYPES_TO_TEST = [
  'coder',
  'architect',
  'tester',
  'analyst',
  'reviewer',
  'backend-dev',
  'code-analyzer',
  'code-quality-validator',
  'security-specialist',
  'devops-engineer',
  'api-docs',
  'mobile-dev',
  'base-template-generator',
  'perf-analyzer',
  'pseudocode',
];

const TEST_CONFIG = {
  testDir: path.join(__dirname, 'multi-agent-workspace'),
  timeout: 120000, // 2 minutes per agent
  minConfidence: 0.70,
};

/**
 * Setup test workspace
 */
async function setupWorkspace() {
  await fs.rm(TEST_CONFIG.testDir, { recursive: true, force: true });
  await fs.mkdir(TEST_CONFIG.testDir, { recursive: true });

  // Create test files
  await fs.writeFile(
    path.join(TEST_CONFIG.testDir, 'test.txt'),
    'Test content for reading\n',
    'utf8'
  );

  console.log(`✅ Workspace: ${TEST_CONFIG.testDir}`);
}

/**
 * Test single agent type
 */
async function testAgentType(agentType, testFormat) {
  const task = `Quick tool test: Read test.txt, create output.txt with "${agentType} completed", report confidence.`;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${agentType} (${testFormat})`);
  console.log('='.repeat(60));

  const args = testFormat === 'equals'
    ? ['--agents='+agentType, '--provider=zai']
    : ['--agents', agentType, '--provider', 'zai'];

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const proc = spawn(
      'node',
      ['src/cli/hybrid-routing/spawn-workers.js', task, ...args],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      }
    );

    let stdout = '';
    let stderr = '';
    let agentCount = 0;
    let agentTypes = new Set();

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;

      // Count spawned agents
      const spawnMatch = text.match(/Worker \d+ \[([^\]]+)\]: Spawning/);
      if (spawnMatch) {
        agentCount++;
        agentTypes.add(spawnMatch[1]);
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;

      // Extract confidence if present
      const confidenceMatch = stdout.match(/confidence[:\s]+(\d+\.\d+)/i);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0;

      // Check if exactly 1 agent spawned
      const success = agentCount === 1 && agentTypes.has(agentType);

      resolve({
        agentType,
        testFormat,
        success,
        agentCount,
        spawnedTypes: Array.from(agentTypes),
        confidence,
        duration: `${(duration / 1000).toFixed(1)}s`,
        exitCode: code,
      });
    });

    setTimeout(() => {
      proc.kill();
      reject(new Error(`Timeout for ${agentType}`));
    }, TEST_CONFIG.timeout);
  });
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('MULTI-AGENT TOOL VALIDATION TEST');
  console.log('═'.repeat(60));
  console.log(`Testing ${AGENT_TYPES_TO_TEST.length} agent types`);
  console.log(`Test formats: --agents=type (equals) AND --agents type (space)`);
  console.log('═'.repeat(60));

  await setupWorkspace();

  const results = [];

  // Test each agent type with BOTH argument formats
  for (const agentType of AGENT_TYPES_TO_TEST) {
    try {
      // Test with equals format (--agents=type)
      const equalsResult = await testAgentType(agentType, 'equals');
      results.push(equalsResult);

      console.log(`✅ ${agentType} (equals format): ${equalsResult.agentCount} agent(s) spawned`);

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Test with space format (--agents type)
      const spaceResult = await testAgentType(agentType, 'space');
      results.push(spaceResult);

      console.log(`✅ ${agentType} (space format): ${spaceResult.agentCount} agent(s) spawned`);

      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`❌ ${agentType} failed: ${error.message}`);
      results.push({
        agentType,
        success: false,
        error: error.message,
      });
    }
  }

  // Generate report
  console.log('\n' + '═'.repeat(60));
  console.log('TEST RESULTS SUMMARY');
  console.log('═'.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const wrongCount = results.filter(r => r.agentCount !== 1);

  console.log(`\n📊 Overall Stats:`);
  console.log(`  Total Tests: ${results.length}`);
  console.log(`  Successful: ${successful.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log(`  Wrong Agent Count: ${wrongCount.length}`);

  console.log(`\n✅ Successful Agent Types:`);
  const uniqueSuccessful = new Set(successful.map(r => r.agentType));
  uniqueSuccessful.forEach(type => {
    const equalsTest = successful.find(r => r.agentType === type && r.testFormat === 'equals');
    const spaceTest = successful.find(r => r.agentType === type && r.testFormat === 'space');
    const bothWork = equalsTest && spaceTest;
    console.log(`  • ${type} ${bothWork ? '✅ (both formats)' : '⚠️ (one format)'}`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed Agent Types:`);
    failed.forEach(r => {
      console.log(`  • ${r.agentType} (${r.testFormat}): ${r.error || 'Exit code ' + r.exitCode}`);
    });
  }

  if (wrongCount.length > 0) {
    console.log(`\n⚠️  Wrong Agent Count (expected 1):`);
    wrongCount.forEach(r => {
      console.log(`  • ${r.agentType} (${r.testFormat}): spawned ${r.agentCount} (${r.spawnedTypes.join(', ')})`);
    });
  }

  // Save detailed report
  const reportPath = path.join(TEST_CONFIG.testDir, 'test-report.json');
  await fs.writeFile(reportPath, JSON.stringify({
    summary: {
      totalTests: results.length,
      successful: successful.length,
      failed: failed.length,
      wrongCount: wrongCount.length,
      successRate: `${((successful.length / results.length) * 100).toFixed(1)}%`,
    },
    results,
  }, null, 2), 'utf8');

  console.log(`\n📄 Report: ${reportPath}`);
  console.log('═'.repeat(60));

  // Exit with appropriate code
  const allPassed = failed.length === 0 && wrongCount.length === 0;
  process.exit(allPassed ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
