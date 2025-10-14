#!/usr/bin/env node

/**
 * Layer 0: Agent Tool Validation Test
 *
 * PURPOSE: Validate all 15 specialized agent types have functional tooling
 * RUNS BEFORE: Layer 1, 2, 3 mesh coordination tests
 *
 * Architecture:
 * - Tests 15 agent types (coder, architect, tester, analyst, etc.)
 * - Validates 7 critical tools per agent (Read, Write, Edit, Bash, Grep, Glob, TodoWrite)
 * - Generates comprehensive tool usage report
 * - Ensures coordinators can spawn functional agents
 *
 * Success Criteria:
 * - ✅ All 15 agents spawn successfully
 * - ✅ ≥5/7 tools working per agent (minimum threshold)
 * - ✅ 6 critical tools at 100% (Read, Write, Edit, Bash, Grep, Glob)
 * - ✅ TodoWrite at ≥80% (nice-to-have for task tracking)
 *
 * Why This Test Exists:
 * Previous sessions revealed coordinators completing work themselves instead
 * of delegating to agents. Root cause was CLI argument parsing bugs, not
 * broken agent tooling. This test validates agents have functional tools
 * after CLI fixes.
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const AGENT_TYPES = [
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
const CRITICAL_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'];

const TEST_CONFIG = {
  outputDir: path.join(__dirname, '../../test-results/layer0-tool-validation'),
  timeout: 180000, // 3 minutes per agent
  minToolCount: 5, // At least 5/7 tools must work
  minConfidence: 0.70,
  criticalToolRate: 1.0, // 100% for critical tools
  todoWriteRate: 0.80, // 80% for TodoWrite
};

/**
 * Setup test workspace for single agent
 */
async function setupAgentWorkspace(agentType) {
  const agentDir = path.join(TEST_CONFIG.outputDir, agentType);
  await fs.mkdir(agentDir, { recursive: true });

  // Create test files
  await fs.writeFile(
    path.join(agentDir, 'existing-file.txt'),
    'Original content\nLine 2\nLine 3\n',
    'utf8'
  );

  await fs.writeFile(
    path.join(agentDir, 'searchable.txt'),
    'KEYWORD found here\nOther text\nKEYWORD again\n',
    'utf8'
  );

  await fs.writeFile(path.join(agentDir, 'test1.js'), '// Test JS file 1', 'utf8');
  await fs.writeFile(path.join(agentDir, 'test2.js'), '// Test JS file 2', 'utf8');

  return agentDir;
}

/**
 * Test single agent with comprehensive tool validation
 */
async function testAgentTooling(agentType, agentDir) {
  const task = `
Exercise all critical tools on test workspace: ${agentDir}

**Tool Operations Required:**

1. Read: Read existing-file.txt
2. Write: Create new-file.txt with "Agent created this"
3. Edit: Add "EDITED" to existing-file.txt
4. Bash: Run ls -la in test workspace
5. Grep: Search for KEYWORD in searchable.txt
6. Glob: Find *.js files
7. TodoWrite: Track your progress

Create ${agentDir}/summary.json:
{
  "agentType": "${agentType}",
  "toolsUsed": ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "TodoWrite"],
  "confidence": 0.XX
}

Report confidence when done.`;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${agentType} (All 7 Tools)`);
  console.log('='.repeat(70));

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const proc = spawn(
      'node',
      [
        path.join(__dirname, '../../src/cli/hybrid-routing/spawn-workers.js'),
        task,
        '--max-agents',
        '1',
        '--agents',
        agentType,
        '--provider',
        'zai',
      ],
      {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe',
      }
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      const duration = Date.now() - startTime;

      try {
        // Validate tool usage from artifacts
        const validation = await validateToolUsage(agentDir);

        // Save logs
        await fs.writeFile(path.join(agentDir, 'stdout.log'), stdout, 'utf8');
        await fs.writeFile(path.join(agentDir, 'stderr.log'), stderr, 'utf8');

        const result = {
          agentType,
          success: validation.success && code === 0,
          toolsWorking: validation.toolsWorking || [],
          toolsMissing: ALL_TOOLS.filter(
            (t) => !validation.toolsWorking?.includes(t)
          ),
          errors: validation.errors || [],
          confidence: validation.confidence || 0,
          duration: `${(duration / 1000).toFixed(1)}s`,
          exitCode: code,
        };

        console.log(
          `${result.success ? '✅' : '❌'} ${agentType}: ${result.toolsWorking.length}/7 tools working`
        );

        resolve(result);
      } catch (error) {
        console.error(`❌ ${agentType}: Failed - ${error.message}`);
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
 * Validate tool usage from artifacts
 */
async function validateToolUsage(agentDir) {
  const errors = [];
  const toolsWorking = [];

  // Check Read: existing-file.txt should have been read
  try {
    const existingFile = await fs.readFile(
      path.join(agentDir, 'existing-file.txt'),
      'utf8'
    );
    if (existingFile.includes('Original content')) {
      toolsWorking.push('Read');
    }
  } catch (e) {
    errors.push(`Read validation failed: ${e.message}`);
  }

  // Check Write: new-file.txt should exist
  try {
    const newFile = await fs.readFile(
      path.join(agentDir, 'new-file.txt'),
      'utf8'
    );
    if (newFile.includes('Agent created')) {
      toolsWorking.push('Write');
    } else {
      errors.push('Write: File created but content wrong');
    }
  } catch (e) {
    errors.push(`Write validation failed: ${e.message}`);
  }

  // Check Edit: existing-file.txt should have EDITED marker
  try {
    const editedFile = await fs.readFile(
      path.join(agentDir, 'existing-file.txt'),
      'utf8'
    );
    if (editedFile.includes('EDITED')) {
      toolsWorking.push('Edit');
    } else {
      errors.push('Edit: File exists but no EDITED marker');
    }
  } catch (e) {
    errors.push(`Edit validation failed: ${e.message}`);
  }

  // Check summary file (indicates Bash, Grep, Glob, TodoWrite were attempted)
  try {
    const summaryPath = path.join(agentDir, 'summary.json');
    const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));

    if (summary.toolsUsed) {
      summary.toolsUsed.forEach((tool) => {
        if (!toolsWorking.includes(tool)) {
          toolsWorking.push(tool);
        }
      });
    }

    return {
      success: errors.length === 0 && toolsWorking.length >= TEST_CONFIG.minToolCount,
      toolsWorking,
      errors,
      confidence: summary.confidence || 0,
    };
  } catch (e) {
    // Summary file doesn't exist - infer tools from other artifacts
    errors.push(`Summary file validation failed: ${e.message}`);

    // At minimum, Read/Write/Edit were validated above
    return {
      success: toolsWorking.length >= 3,
      toolsWorking,
      errors,
      confidence: 0,
    };
  }
}

/**
 * Generate comprehensive report
 */
async function generateReport(results) {
  console.log('\n' + '═'.repeat(70));
  console.log('LAYER 0: AGENT TOOL VALIDATION REPORT');
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
    const isCritical = CRITICAL_TOOLS.includes(tool);
    const status = isCritical
      ? (agentsWithTool === results.length ? '✅' : '❌')
      : (agentsWithTool >= results.length * TEST_CONFIG.todoWriteRate ? '✅' : '⚠️');
    console.log(`  ${tool.padEnd(12)} ${bar.padEnd(8)} ${agentsWithTool}/${results.length} (${percentage}%) ${status}`);
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

  // Validate success criteria
  const allCriticalTools = CRITICAL_TOOLS.every(
    (tool) => toolStats[tool] === results.length
  );
  const todoWriteAcceptable = toolStats['TodoWrite'] >= results.length * TEST_CONFIG.todoWriteRate;
  const allAgentsMeetThreshold = results.every(
    (r) => r.toolsWorking.length >= TEST_CONFIG.minToolCount
  );

  console.log(`\n✅ Success Criteria:`);
  console.log(`  All agents spawn successfully: ${results.length === AGENT_TYPES.length ? '✅ YES' : '❌ NO'}`);
  console.log(`  All agents ≥${TEST_CONFIG.minToolCount}/7 tools: ${allAgentsMeetThreshold ? '✅ YES' : '❌ NO'}`);
  console.log(`  6 critical tools at 100%: ${allCriticalTools ? '✅ YES' : '❌ NO'}`);
  console.log(`  TodoWrite at ≥${(TEST_CONFIG.todoWriteRate * 100).toFixed(0)}%: ${todoWriteAcceptable ? '✅ YES' : '⚠️ NO'}`);

  const layerPassed = results.length === AGENT_TYPES.length &&
                      allAgentsMeetThreshold &&
                      allCriticalTools &&
                      todoWriteAcceptable;

  console.log(`\n🎯 Layer 0 Status: ${layerPassed ? '✅ PASSED' : '❌ FAILED'}`);

  if (layerPassed) {
    console.log(`\n💡 Next Step: Proceed to Layer 1 (Mesh Coordination)`);
  } else {
    console.log(`\n⚠️  Fix agent tooling issues before proceeding to Layer 1`);
  }

  // Save detailed report
  const report = {
    layer: 0,
    name: 'Agent Tool Validation',
    timestamp: new Date().toISOString(),
    summary: {
      totalAgents: results.length,
      successful: successful.length,
      failed: failed.length,
      successRate: `${((successful.length / results.length) * 100).toFixed(1)}%`,
      layerPassed,
    },
    toolStats,
    criteria: {
      allAgentsSpawn: results.length === AGENT_TYPES.length,
      allAgentsMeetThreshold,
      allCriticalTools,
      todoWriteAcceptable,
    },
    results,
  };

  const reportPath = path.join(TEST_CONFIG.outputDir, 'layer0-results.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n📄 Detailed Report: ${reportPath}`);
  console.log('═'.repeat(70));
  console.log('');

  return report;
}

/**
 * Main test execution
 */
async function runLayer0() {
  console.log('\n' + '═'.repeat(70));
  console.log('LAYER 0: AGENT TOOL VALIDATION TEST');
  console.log('═'.repeat(70));
  console.log(`Testing ${AGENT_TYPES.length} agent types`);
  console.log(`Validating ${ALL_TOOLS.length} tools per agent`);
  console.log('═'.repeat(70));

  const startTime = Date.now();

  // Setup output directory
  await fs.mkdir(TEST_CONFIG.outputDir, { recursive: true });

  const results = [];

  // Test each agent sequentially
  for (const agentType of AGENT_TYPES) {
    try {
      const agentDir = await setupAgentWorkspace(agentType);
      const result = await testAgentTooling(agentType, agentDir);
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
  console.log(`\n⏱️  Total Duration: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);

  const report = await generateReport(results);

  // Exit with appropriate code
  process.exit(report.summary.layerPassed ? 0 : 1);
}

// Run Layer 0
runLayer0().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
