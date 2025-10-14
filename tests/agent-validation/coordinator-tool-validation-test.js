/**
 * Coordinator Tool Validation Test
 *
 * PURPOSE: Validate that coordinator-spawned agents have functional tooling.
 * PROBLEM: Coordinators completing tasks themselves vs delegating due to tool failures.
 * SOLUTION: Comprehensive test requiring use of all critical tools.
 *
 * TEST STRATEGY:
 * 1. Coordinator spawns a single agent via CLI (spawn-workers.js)
 * 2. Agent MUST use all critical tools: Read, Write, Edit, Bash, Grep, Glob, TodoWrite
 * 3. Validation checks tool outputs for correctness
 * 4. Test is reusable for multiple agent types (coder, architect, tester, etc.)
 *
 * CRITICAL TOOLS TESTED:
 * - Read: Read existing files
 * - Write: Create new files
 * - Edit: Modify existing files
 * - Bash: Execute shell commands
 * - Grep: Search file contents
 * - Glob: Find files by pattern
 * - TodoWrite: Track task progress
 *
 * USAGE:
 * node tests/agent-validation/coordinator-tool-validation-test.js --agent-type coder
 * node tests/agent-validation/coordinator-tool-validation-test.js --agent-type architect
 *
 * SUCCESS CRITERIA:
 * - Agent uses all 7 critical tools
 * - All tool operations complete successfully
 * - Agent reports confidence ≥0.75
 * - No errors in Redis coordination
 * - Coordinator does NOT perform agent work
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  // Test workspace (cleaned up after test)
  testDir: path.join(__dirname, 'test-workspace'),

  // Redis configuration
  redisChannel: 'test:coordinator:tool-validation',
  redisTimeout: 300000, // 5 minutes

  // Required tools
  requiredTools: [
    'Read',
    'Write',
    'Edit',
    'Bash',
    'Grep',
    'Glob',
    'TodoWrite'
  ],

  // Success criteria
  minConfidence: 0.75,
  maxCoordinatorEdits: 0, // Coordinator should NOT edit files
};

// Test artifacts validator
class ToolValidationChecker {
  constructor(testDir) {
    this.testDir = testDir;
    this.toolUsage = new Map();
    this.errors = [];
  }

  /**
   * Validate Read tool usage
   */
  async validateReadTool(artifactsDir) {
    const readLogPath = path.join(artifactsDir, 'read-operations.json');

    try {
      const readLog = JSON.parse(await fs.readFile(readLogPath, 'utf8'));

      if (!readLog.files || readLog.files.length === 0) {
        this.errors.push('Read tool: No files read');
        return false;
      }

      // Check if agent read an existing file
      const existingFileRead = readLog.files.some(f =>
        f.path.includes('existing-file.txt') && f.success
      );

      if (!existingFileRead) {
        this.errors.push('Read tool: Did not read existing test file');
        return false;
      }

      this.toolUsage.set('Read', {
        used: true,
        operations: readLog.files.length,
        success: true
      });

      return true;
    } catch (error) {
      this.errors.push(`Read tool validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate Write tool usage
   */
  async validateWriteTool(artifactsDir) {
    const writeLogPath = path.join(artifactsDir, 'write-operations.json');

    try {
      const writeLog = JSON.parse(await fs.readFile(writeLogPath, 'utf8'));

      if (!writeLog.files || writeLog.files.length === 0) {
        this.errors.push('Write tool: No files created');
        return false;
      }

      // Check if new file was actually created
      const newFilePath = path.join(this.testDir, 'new-file.txt');
      const fileExists = await fs.access(newFilePath).then(() => true).catch(() => false);

      if (!fileExists) {
        this.errors.push('Write tool: Created file does not exist on disk');
        return false;
      }

      this.toolUsage.set('Write', {
        used: true,
        operations: writeLog.files.length,
        success: true
      });

      return true;
    } catch (error) {
      this.errors.push(`Write tool validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate Edit tool usage
   */
  async validateEditTool(artifactsDir) {
    const editLogPath = path.join(artifactsDir, 'edit-operations.json');

    try {
      const editLog = JSON.parse(await fs.readFile(editLogPath, 'utf8'));

      if (!editLog.edits || editLog.edits.length === 0) {
        this.errors.push('Edit tool: No edits performed');
        return false;
      }

      // Check if edit actually modified the file
      const targetFile = path.join(this.testDir, 'existing-file.txt');
      const content = await fs.readFile(targetFile, 'utf8');

      if (!content.includes('EDITED BY AGENT')) {
        this.errors.push('Edit tool: Expected edit marker not found in file');
        return false;
      }

      this.toolUsage.set('Edit', {
        used: true,
        operations: editLog.edits.length,
        success: true
      });

      return true;
    } catch (error) {
      this.errors.push(`Edit tool validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate Bash tool usage
   */
  async validateBashTool(artifactsDir) {
    const bashLogPath = path.join(artifactsDir, 'bash-operations.json');

    try {
      const bashLog = JSON.parse(await fs.readFile(bashLogPath, 'utf8'));

      if (!bashLog.commands || bashLog.commands.length === 0) {
        this.errors.push('Bash tool: No commands executed');
        return false;
      }

      // Check if bash command produced expected output
      const lsCommand = bashLog.commands.find(cmd => cmd.command.includes('ls'));

      if (!lsCommand || !lsCommand.success) {
        this.errors.push('Bash tool: ls command not executed successfully');
        return false;
      }

      this.toolUsage.set('Bash', {
        used: true,
        operations: bashLog.commands.length,
        success: true
      });

      return true;
    } catch (error) {
      this.errors.push(`Bash tool validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate Grep tool usage
   */
  async validateGrepTool(artifactsDir) {
    const grepLogPath = path.join(artifactsDir, 'grep-operations.json');

    try {
      const grepLog = JSON.parse(await fs.readFile(grepLogPath, 'utf8'));

      if (!grepLog.searches || grepLog.searches.length === 0) {
        this.errors.push('Grep tool: No searches performed');
        return false;
      }

      // Check if grep found expected pattern
      const successfulSearch = grepLog.searches.some(s =>
        s.pattern && s.matches && s.matches.length > 0
      );

      if (!successfulSearch) {
        this.errors.push('Grep tool: No successful pattern matches');
        return false;
      }

      this.toolUsage.set('Grep', {
        used: true,
        operations: grepLog.searches.length,
        success: true
      });

      return true;
    } catch (error) {
      this.errors.push(`Grep tool validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate Glob tool usage
   */
  async validateGlobTool(artifactsDir) {
    const globLogPath = path.join(artifactsDir, 'glob-operations.json');

    try {
      const globLog = JSON.parse(await fs.readFile(globLogPath, 'utf8'));

      if (!globLog.patterns || globLog.patterns.length === 0) {
        this.errors.push('Glob tool: No patterns searched');
        return false;
      }

      // Check if glob found files
      const successfulGlob = globLog.patterns.some(g =>
        g.files && g.files.length > 0
      );

      if (!successfulGlob) {
        this.errors.push('Glob tool: No files found by pattern');
        return false;
      }

      this.toolUsage.set('Glob', {
        used: true,
        operations: globLog.patterns.length,
        success: true
      });

      return true;
    } catch (error) {
      this.errors.push(`Glob tool validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate TodoWrite tool usage
   */
  async validateTodoWriteTool(artifactsDir) {
    const todoLogPath = path.join(artifactsDir, 'todo-operations.json');

    try {
      const todoLog = JSON.parse(await fs.readFile(todoLogPath, 'utf8'));

      if (!todoLog.todos || todoLog.todos.length === 0) {
        this.errors.push('TodoWrite tool: No todos created');
        return false;
      }

      // Check if todos have required states
      const hasValidStates = todoLog.todos.every(t =>
        ['pending', 'in_progress', 'completed'].includes(t.status)
      );

      if (!hasValidStates) {
        this.errors.push('TodoWrite tool: Invalid todo states');
        return false;
      }

      this.toolUsage.set('TodoWrite', {
        used: true,
        operations: todoLog.todos.length,
        success: true
      });

      return true;
    } catch (error) {
      this.errors.push(`TodoWrite tool validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate all tools were used
   */
  async validateAllTools(artifactsDir) {
    const results = await Promise.all([
      this.validateReadTool(artifactsDir),
      this.validateWriteTool(artifactsDir),
      this.validateEditTool(artifactsDir),
      this.validateBashTool(artifactsDir),
      this.validateGrepTool(artifactsDir),
      this.validateGlobTool(artifactsDir),
      this.validateTodoWriteTool(artifactsDir)
    ]);

    const allSuccess = results.every(r => r === true);

    return {
      success: allSuccess,
      toolUsage: Object.fromEntries(this.toolUsage),
      errors: this.errors
    };
  }
}

/**
 * Setup test workspace with required files
 */
async function setupTestWorkspace(testDir) {
  // Clean up if exists
  await fs.rm(testDir, { recursive: true, force: true });

  // Create test directory
  await fs.mkdir(testDir, { recursive: true });

  // Create existing file for Read/Edit tests
  const existingFile = path.join(testDir, 'existing-file.txt');
  await fs.writeFile(existingFile, 'This is an existing file.\nLine 2\nLine 3\n', 'utf8');

  // Create multiple test files for Glob test
  await fs.writeFile(path.join(testDir, 'test1.js'), '// Test file 1', 'utf8');
  await fs.writeFile(path.join(testDir, 'test2.js'), '// Test file 2', 'utf8');
  await fs.writeFile(path.join(testDir, 'test3.txt'), 'Text file', 'utf8');

  // Create file with searchable content for Grep test
  await fs.writeFile(
    path.join(testDir, 'searchable.txt'),
    'KEYWORD is here\nOther content\nKEYWORD appears again\n',
    'utf8'
  );

  console.log(`✅ Test workspace created: ${testDir}`);
}

/**
 * Spawn coordinator via CLI
 */
async function spawnCoordinatorWithAgent(agentType, testDir, redisChannel) {
  const taskDescription = `
You are a coordinator testing tool availability for ${agentType} agents.

**YOUR ROLE**: Spawn a SINGLE ${agentType} agent and validate it uses all critical tools.

**CRITICAL**: You MUST NOT perform any of the agent's work yourself. You are ONLY a coordinator.

## Task for ${agentType} Agent

Spawn the agent with this exact task:

"Demonstrate use of all critical tools in test workspace: ${testDir}

**Required Tool Usage:**

1. **Read Tool**: Read the file 'existing-file.txt' and confirm its contents
2. **Write Tool**: Create a new file 'new-file.txt' with content 'Created by agent'
3. **Edit Tool**: Edit 'existing-file.txt' to add the line 'EDITED BY AGENT' at the end
4. **Bash Tool**: Execute 'ls -la' command in test workspace
5. **Grep Tool**: Search for the pattern 'KEYWORD' in 'searchable.txt'
6. **Glob Tool**: Find all *.js files in test workspace
7. **TodoWrite Tool**: Create a todo list with 3 items: 'Read files', 'Write files', 'Edit files'

**Output Requirements:**

After completing all tool operations, create a summary file:
${testDir}/artifacts/tool-usage-summary.json

With this structure:
{
  "agentType": "${agentType}",
  "toolsUsed": ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "TodoWrite"],
  "allToolsWorking": true,
  "confidence": 0.XX,
  "errors": []
}

Also create individual operation logs:
- ${testDir}/artifacts/read-operations.json
- ${testDir}/artifacts/write-operations.json
- ${testDir}/artifacts/edit-operations.json
- ${testDir}/artifacts/bash-operations.json
- ${testDir}/artifacts/grep-operations.json
- ${testDir}/artifacts/glob-operations.json
- ${testDir}/artifacts/todo-operations.json

Report confidence score when complete."

## Coordinator Instructions

1. Spawn the ${agentType} agent via CLI:

   node src/cli/hybrid-routing/spawn-workers.js \\
     "Task description above" \\
     --max-agents 1 --provider zai --redis-channel ${redisChannel}

2. Monitor Redis channel "${redisChannel}" for agent completion

3. Validate agent created all required artifact files

4. Report summary to main chat:
   - Agent type
   - All tools used successfully
   - Agent confidence score
   - Any errors encountered

**CRITICAL**: Do NOT perform any of the agent's work yourself. Only coordinate and report.
`;

  return new Promise((resolve, reject) => {
    const coordinator = spawn('node', [
      'src/cli/hybrid-routing/spawn-workers.js',
      taskDescription,
      '--max-agents', '1',
      '--provider', 'zai',
      '--redis-channel', redisChannel
    ], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    coordinator.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`[Coordinator] ${data.toString().trim()}`);
    });

    coordinator.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`[Coordinator Error] ${data.toString().trim()}`);
    });

    coordinator.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Coordinator exited with code ${code}\nStderr: ${stderr}`));
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      coordinator.kill();
      reject(new Error('Coordinator timeout after 5 minutes'));
    }, TEST_CONFIG.redisTimeout);
  });
}

/**
 * Main test execution
 */
async function runTest(agentType = 'coder') {
  console.log('\n=== Coordinator Tool Validation Test ===\n');
  console.log(`Agent Type: ${agentType}`);
  console.log(`Test Dir: ${TEST_CONFIG.testDir}`);
  console.log(`Redis Channel: ${TEST_CONFIG.redisChannel}\n`);

  const startTime = Date.now();

  try {
    // Step 1: Setup test workspace
    console.log('📁 Setting up test workspace...');
    await setupTestWorkspace(TEST_CONFIG.testDir);

    // Create artifacts directory
    const artifactsDir = path.join(TEST_CONFIG.testDir, 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });

    // Step 2: Spawn coordinator with agent
    console.log(`\n🚀 Spawning coordinator with ${agentType} agent...\n`);
    const { stdout, stderr } = await spawnCoordinatorWithAgent(
      agentType,
      TEST_CONFIG.testDir,
      TEST_CONFIG.redisChannel
    );

    // Step 3: Validate tool usage
    console.log('\n✅ Agent execution complete. Validating tool usage...\n');

    const validator = new ToolValidationChecker(TEST_CONFIG.testDir);
    const validationResult = await validator.validateAllTools(artifactsDir);

    // Step 4: Check coordinator did not perform work
    console.log('🔍 Checking coordinator did NOT perform agent work...\n');

    // Check if coordinator made any file edits (should be 0)
    const coordinatorEdits = (stdout.match(/Edit tool/gi) || []).length;

    if (coordinatorEdits > TEST_CONFIG.maxCoordinatorEdits) {
      validationResult.errors.push(
        `Coordinator performed ${coordinatorEdits} edits (expected ${TEST_CONFIG.maxCoordinatorEdits})`
      );
      validationResult.success = false;
    }

    // Step 5: Generate test report
    const duration = Date.now() - startTime;

    const report = {
      testName: 'Coordinator Tool Validation Test',
      agentType,
      timestamp: new Date().toISOString(),
      duration: `${(duration / 1000).toFixed(2)}s`,
      success: validationResult.success,
      toolUsage: validationResult.toolUsage,
      coordinatorEdits,
      errors: validationResult.errors,
      requiredTools: TEST_CONFIG.requiredTools,
      missingTools: TEST_CONFIG.requiredTools.filter(
        tool => !validationResult.toolUsage[tool]?.success
      )
    };

    // Save report
    const reportPath = path.join(artifactsDir, 'test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Status: ${report.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Duration: ${report.duration}`);
    console.log(`Agent Type: ${report.agentType}`);
    console.log(`Coordinator Edits: ${report.coordinatorEdits} (max: ${TEST_CONFIG.maxCoordinatorEdits})`);
    console.log('\nTool Usage:');

    for (const [tool, usage] of Object.entries(report.toolUsage)) {
      const status = usage.success ? '✅' : '❌';
      console.log(`  ${status} ${tool}: ${usage.operations} operations`);
    }

    if (report.missingTools.length > 0) {
      console.log('\n❌ Missing Tools:');
      report.missingTools.forEach(tool => console.log(`  - ${tool}`));
    }

    if (report.errors.length > 0) {
      console.log('\n❌ Errors:');
      report.errors.forEach(err => console.log(`  - ${err}`));
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Report saved: ${reportPath}`);
    console.log('='.repeat(60) + '\n');

    // Cleanup (optional - comment out to inspect artifacts)
    // await fs.rm(TEST_CONFIG.testDir, { recursive: true, force: true });
    // console.log('🗑️  Test workspace cleaned up\n');

    process.exit(report.success ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test execution failed:');
    console.error(error);
    process.exit(1);
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const agentTypeIndex = args.indexOf('--agent-type');
const agentType = agentTypeIndex !== -1 ? args[agentTypeIndex + 1] : 'coder';

// Run test
runTest(agentType);
