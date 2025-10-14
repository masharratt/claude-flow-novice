/**
 * Comprehensive Multi-Agent Tool Validation Suite
 *
 * PURPOSE: Test all 15 agent types with comprehensive tool validation
 * VALIDATION: All 7 critical tools (Read, Write, Edit, Bash, Grep, Glob, TodoWrite)
 *
 * TEST STRATEGY:
 * 1. Run direct-agent-tool-test.js for each of 15 agent types
 * 2. Each test validates all 7 tools with artifact checking
 * 3. Generate comprehensive report of tool usage across all agents
 *
 * USAGE:
 * node tests/agent-validation/comprehensive-tool-validation-suite.js
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

const ALL_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'TodoWrite'];

const TEST_CONFIG = {
  suiteDir: path.join(__dirname, 'comprehensive-suite-results'),
  timeout: 180000, // 3 minutes per agent
  minToolCount: 5, // At least 5/7 tools must work
  minConfidence: 0.70,
};

/**
 * Setup suite workspace
 */
async function setupSuiteWorkspace() {
  await fs.rm(TEST_CONFIG.suiteDir, { recursive: true, force: true });
  await fs.mkdir(TEST_CONFIG.suiteDir, { recursive: true });
  console.log(`✅ Suite workspace: ${TEST_CONFIG.suiteDir}`);
}

/**
 * Run comprehensive tool test for single agent type
 */
async function testAgentTooling(agentType) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${agentType} (All 7 Tools)`);
  console.log('='.repeat(70));

  const agentDir = path.join(TEST_CONFIG.suiteDir, agentType);
  await fs.mkdir(agentDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // Spawn direct-agent-tool-test.js with specific agent type
    const proc = spawn(
      'node',
      [
        'tests/agent-validation/direct-agent-tool-test.js',
        '--agent-type',
        agentType,
      ],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
        env: {
          ...process.env,
          TEST_WORKSPACE: agentDir, // Override test workspace
        },
      }
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // Don't print to avoid spam, log to file instead
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      const duration = Date.now() - startTime;

      try {
        // Read test report from artifact
        const reportPath = path.join(
          'tests/agent-validation/test-workspace/artifacts/test-report.json'
        );
        let report;

        try {
          const reportContent = await fs.readFile(reportPath, 'utf8');
          report = JSON.parse(reportContent);
        } catch (e) {
          // If report doesn't exist, parse from stdout
          report = parseReportFromStdout(stdout, agentType, duration);
        }

        // Save agent-specific logs
        await fs.writeFile(
          path.join(agentDir, 'stdout.log'),
          stdout,
          'utf8'
        );
        await fs.writeFile(
          path.join(agentDir, 'stderr.log'),
          stderr,
          'utf8'
        );
        await fs.writeFile(
          path.join(agentDir, 'report.json'),
          JSON.stringify(report, null, 2),
          'utf8'
        );

        const result = {
          agentType,
          success: report.success && code === 0,
          toolsWorking: report.toolsWorking || [],
          toolsMissing: ALL_TOOLS.filter(
            (t) => !report.toolsWorking?.includes(t)
          ),
          errors: report.errors || [],
          confidence: report.confidence || 0,
          duration: `${(duration / 1000).toFixed(1)}s`,
          exitCode: code,
        };

        console.log(
          `${result.success ? '✅' : '❌'} ${agentType}: ${result.toolsWorking.length}/7 tools working`
        );

        resolve(result);
      } catch (error) {
        console.error(`❌ ${agentType}: Failed to parse results - ${error.message}`);
        resolve({
          agentType,
          success: false,
          toolsWorking: [],
          toolsMissing: ALL_TOOLS,
          errors: [error.message],
          confidence: 0,
          duration: `${(duration / 1000).toFixed(1)}s`,
          exitCode: code,
        });
      }
    });

    setTimeout(() => {
      proc.kill();
      reject(new Error(`Timeout after 3 minutes for ${agentType}`));
    }, TEST_CONFIG.timeout);
  });
}

/**
 * Parse report from stdout if JSON report file doesn't exist
 */
function parseReportFromStdout(stdout, agentType, duration) {
  const toolsWorking = [];
  const errors = [];

  // Try to extract tools from stdout
  ALL_TOOLS.forEach((tool) => {
    if (stdout.includes(`Tools Working:`)) {
      const match = stdout.match(/Tools Working: (.+)/);
      if (match) {
        const tools = match[1].split(', ');
        toolsWorking.push(...tools);
      }
    }
  });

  // Extract confidence
  const confidenceMatch = stdout.match(/Confidence: (\d+\.\d+)/);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0;

  // Extract success status
  const success = stdout.includes('✅ PASSED');

  return {
    testName: 'Direct Agent Tool Validation',
    agentType,
    timestamp: new Date().toISOString(),
    duration: `${(duration / 1000).toFixed(2)}s`,
    success,
    toolsWorking,
    errors: success ? [] : ['Unknown error - check logs'],
    confidence,
  };
}

/**
 * Generate comprehensive report
 */
async function generateReport(results) {
  console.log('\n' + '═'.repeat(70));
  console.log('COMPREHENSIVE TOOL VALIDATION REPORT');
  console.log('═'.repeat(70));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  // Overall stats
  console.log(`\n📊 Overall Stats:`);
  console.log(`  Total Agents Tested: ${results.length}`);
  console.log(`  Successful: ${successful.length} (${((successful.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`  Failed: ${failed.length}`);

  // Tool usage matrix
  console.log(`\n🔧 Tool Usage Matrix:`);
  const toolStats = {};
  ALL_TOOLS.forEach((tool) => {
    const agentsWithTool = results.filter((r) =>
      r.toolsWorking.includes(tool)
    ).length;
    toolStats[tool] = agentsWithTool;
    const percentage = ((agentsWithTool / results.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(agentsWithTool / 2));
    console.log(`  ${tool.padEnd(12)} ${bar.padEnd(8)} ${agentsWithTool}/${results.length} (${percentage}%)`);
  });

  // Agent-by-agent results
  console.log(`\n📋 Agent Results:`);
  results.forEach((r) => {
    const status = r.success ? '✅' : '❌';
    const toolCount = `${r.toolsWorking.length}/7`;
    const tools = r.toolsWorking.join(', ') || 'none';
    console.log(`  ${status} ${r.agentType.padEnd(25)} ${toolCount.padEnd(6)} [${tools}]`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed Agents (${failed.length}):`);
    failed.forEach((r) => {
      console.log(`  • ${r.agentType}:`);
      console.log(`    - Tools working: ${r.toolsWorking.length}/7`);
      console.log(`    - Missing: ${r.toolsMissing.join(', ')}`);
      if (r.errors.length > 0) {
        console.log(`    - Errors: ${r.errors.slice(0, 2).join('; ')}`);
      }
    });
  }

  // Identify problematic tools
  const problematicTools = ALL_TOOLS.filter(
    (tool) => toolStats[tool] < results.length * 0.8
  );
  if (problematicTools.length > 0) {
    console.log(`\n⚠️  Problematic Tools (<80% success rate):`);
    problematicTools.forEach((tool) => {
      const rate = ((toolStats[tool] / results.length) * 100).toFixed(1);
      console.log(`  • ${tool}: ${toolStats[tool]}/${results.length} (${rate}%)`);
    });
  }

  // Summary
  const allToolsWorking = results.every((r) => r.toolsWorking.length === 7);
  const mostToolsWorking = results.every((r) => r.toolsWorking.length >= 5);

  console.log(`\n📈 Summary:`);
  console.log(`  All agents with 7/7 tools: ${allToolsWorking ? '✅ YES' : '❌ NO'}`);
  console.log(`  All agents with ≥5/7 tools: ${mostToolsWorking ? '✅ YES' : '❌ NO'}`);
  console.log(`  Average tools per agent: ${(results.reduce((sum, r) => sum + r.toolsWorking.length, 0) / results.length).toFixed(1)}/7`);

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalAgents: results.length,
      successful: successful.length,
      failed: failed.length,
      successRate: `${((successful.length / results.length) * 100).toFixed(1)}%`,
      allToolsWorking,
      mostToolsWorking,
    },
    toolStats,
    problematicTools,
    results,
  };

  const reportPath = path.join(TEST_CONFIG.suiteDir, 'comprehensive-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n📄 Detailed Report: ${reportPath}`);
  console.log('═'.repeat(70));
  console.log('');

  return report;
}

/**
 * Main test execution
 */
async function runSuite() {
  console.log('\n' + '═'.repeat(70));
  console.log('COMPREHENSIVE MULTI-AGENT TOOL VALIDATION SUITE');
  console.log('═'.repeat(70));
  console.log(`Testing ${AGENT_TYPES_TO_TEST.length} agent types`);
  console.log(`Validating ${ALL_TOOLS.length} tools per agent`);
  console.log('═'.repeat(70));

  const startTime = Date.now();

  await setupSuiteWorkspace();

  const results = [];

  // Test each agent sequentially to avoid conflicts
  for (const agentType of AGENT_TYPES_TO_TEST) {
    try {
      const result = await testAgentTooling(agentType);
      results.push(result);

      // Small delay between tests
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ ${agentType}: ${error.message}`);
      results.push({
        agentType,
        success: false,
        toolsWorking: [],
        toolsMissing: ALL_TOOLS,
        errors: [error.message],
        confidence: 0,
        duration: '0s',
        exitCode: -1,
      });
    }
  }

  const totalDuration = Date.now() - startTime;
  console.log(`\n⏱️  Total Suite Duration: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);

  const report = await generateReport(results);

  // Exit with appropriate code
  const allPassed = report.summary.mostToolsWorking;
  process.exit(allPassed ? 0 : 1);
}

// Run suite
runSuite().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
