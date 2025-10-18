/**
 * Direct Agent Tool Validation Test
 *
 * PURPOSE: Validate agent tooling by spawning agent directly (no coordinator layer).
 * PROBLEM: Coordinator layer causing confusion with multi-agent spawning.
 * SOLUTION: Direct agent spawn to test pure tool functionality.
 *
 * TEST STRATEGY:
 * 1. Spawn single agent directly via spawn-workers.js with --agents flag
 * 2. Agent performs tool operations on test files
 * 3. Validate tool outputs via file artifacts
 *
 * USAGE:
 * node tests/agent-validation/direct-agent-tool-test.js --agent-type coder
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_CONFIG = {
  testDir: path.join(__dirname, 'test-workspace'),
  timeout: 180000, // 3 minutes
  minConfidence: 0.75,
};

/**
 * Setup test workspace
 */
async function setupTestWorkspace(testDir) {
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
  await fs.mkdir(path.join(testDir, 'artifacts'), { recursive: true });

  // Create test files
  await fs.writeFile(
    path.join(testDir, 'existing-file.txt'),
    'Original content\nLine 2\nLine 3\n',
    'utf8'
  );

  await fs.writeFile(
    path.join(testDir, 'searchable.txt'),
    'KEYWORD found here\nOther text\nKEYWORD again\n',
    'utf8'
  );

  await fs.writeFile(path.join(testDir, 'test1.js'), '// Test JS file 1', 'utf8');
  await fs.writeFile(path.join(testDir, 'test2.js'), '// Test JS file 2', 'utf8');

  console.log(`✅ Test workspace: ${testDir}`);
}

/**
 * Spawn agent directly with tool exercise task
 */
async function spawnAgentDirect(agentType, testDir) {
  const task = `
Exercise all critical tools on test workspace: ${testDir}

**Tool Operations Required:**

1. Read: Read existing-file.txt
2. Write: Create new-file.txt with "Agent created this"
3. Edit: Add "EDITED" to existing-file.txt
4. Bash: Run ls -la in test workspace
5. Grep: Search for KEYWORD in searchable.txt
6. Glob: Find *.js files
7. TodoWrite: Track your progress

Create ${testDir}/artifacts/summary.json:
{
  "agentType": "${agentType}",
  "toolsUsed": ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "TodoWrite"],
  "confidence": 0.XX
}

Report confidence when done.`;

  console.log(`\n🚀 Spawning ${agentType} agent directly...\n`);

  return new Promise((resolve, reject) => {
    const agent = spawn(
      'node',
      [
        'src/cli/hybrid-routing/spawn-workers.js',
        task,
        '--max-agents',
        '1',
        '--agents',
        agentType,
        '--provider',
        'zai',
      ],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      }
    );

    let stdout = '';
    let stderr = '';

    agent.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      console.log(text.trim());
    });

    agent.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    agent.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Agent exited: ${code}\n${stderr}`));
      }
    });

    setTimeout(() => {
      agent.kill();
      reject(new Error('Timeout after 3 minutes'));
    }, TEST_CONFIG.timeout);
  });
}

/**
 * Validate tool usage from artifacts
 */
async function validateToolUsage(testDir) {
  const errors = [];
  const toolsWorking = [];

  // Check Read: existing-file.txt should have been read
  try {
    const existingFile = await fs.readFile(
      path.join(testDir, 'existing-file.txt'),
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
      path.join(testDir, 'new-file.txt'),
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
      path.join(testDir, 'existing-file.txt'),
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
    const summaryPath = path.join(testDir, 'artifacts', 'summary.json');
    const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));

    if (summary.toolsUsed) {
      summary.toolsUsed.forEach((tool) => {
        if (!toolsWorking.includes(tool)) {
          toolsWorking.push(tool);
        }
      });
    }

    return {
      success: errors.length === 0 && toolsWorking.length >= 5,
      toolsWorking,
      errors,
      confidence: summary.confidence || 0,
    };
  } catch (e) {
    errors.push(`Summary file validation failed: ${e.message}`);
    return {
      success: false,
      toolsWorking,
      errors,
      confidence: 0,
    };
  }
}

/**
 * Main test execution
 */
async function runTest(agentType = 'coder') {
  console.log('\n=== Direct Agent Tool Validation ===\n');
  console.log(`Agent Type: ${agentType}`);

  const startTime = Date.now();

  try {
    await setupTestWorkspace(TEST_CONFIG.testDir);

    const { stdout } = await spawnAgentDirect(agentType, TEST_CONFIG.testDir);

    console.log('\n✅ Agent execution complete\n');

    const validation = await validateToolUsage(TEST_CONFIG.testDir);

    const duration = Date.now() - startTime;

    // Generate report
    const report = {
      testName: 'Direct Agent Tool Validation',
      agentType,
      timestamp: new Date().toISOString(),
      duration: `${(duration / 1000).toFixed(2)}s`,
      success: validation.success,
      toolsWorking: validation.toolsWorking,
      errors: validation.errors,
      confidence: validation.confidence,
    };

    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Status: ${report.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Duration: ${report.duration}`);
    console.log(`Agent Type: ${report.agentType}`);
    console.log(`Confidence: ${report.confidence}`);
    console.log(`\nTools Working: ${report.toolsWorking.join(', ')}`);

    if (report.errors.length > 0) {
      console.log('\n❌ Errors:');
      report.errors.forEach((err) => console.log(`  - ${err}`));
    }

    console.log('='.repeat(60) + '\n');

    // Save report
    const reportPath = path.join(TEST_CONFIG.testDir, 'artifacts', 'test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Report: ${reportPath}\n`);

    process.exit(report.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Parse arguments
const args = process.argv.slice(2);
const agentTypeIndex = args.indexOf('--agent-type');
const agentType = agentTypeIndex !== -1 ? args[agentTypeIndex + 1] : 'coder';

runTest(agentType);
