/**
 * Integration Test: Simple Task (MVP Mode)
 *
 * Task: "Add a hello() function to greet.ts that returns 'Hello, World!'"
 *
 * Expected Flow:
 * 1. Orchestrator spawns coordinator
 * 2. Coordinator analyzes task (simple complexity, 1 agent)
 * 3. Orchestrator spawns 1 implementer
 * 4. Implementer creates greet.ts with hello() function
 * 5. Implementer signals completion via Redis
 * 6. Orchestrator runs gate check (no tests in MVP)
 * 7. Gate passes (>= 70%)
 * 8. Orchestrator spawns 2 validators
 * 9. Validators review code, signal completion via Redis
 * 10. Consensus check (>= 80%)
 * 11. Product Owner decision: PROCEED
 *
 * Validation Points:
 * - Task record created in cfn_tasks
 * - Iteration record created in cfn_iterations
 * - Coordinator logged in cfn_agents
 * - Implementer logged in cfn_agents with MDAP metrics
 * - Validators logged in cfn_agents
 * - Redis completion signals sent/received
 * - File created at expected path
 * - Final status: COMPLETED
 *
 * Note: This test simulates the flow without requiring the full Trigger.dev
 * infrastructure. For full end-to-end testing, use with Trigger.dev dev server.
 *
 * @module tests/integration/test-simple-task-mvp
 */

import { Pool } from "pg";
import { Redis } from "ioredis";
import * as fs from "fs";
import * as path from "path";

// =============================================
// Configuration
// =============================================

const pool = new Pool({
  host: process.env.CFN_POSTGRES_HOST || "localhost",
  port: parseInt(process.env.CFN_POSTGRES_PORT || "5435"),
  database: process.env.CFN_POSTGRES_DB || "cfn_loop",
  user: process.env.CFN_POSTGRES_USER || "cfn",
  password: process.env.CFN_POSTGRES_PASSWORD || "cfn_dev_password",
});

const redis = new Redis(process.env.CFN_REDIS_URL || "redis://localhost:6390");

// =============================================
// Types
// =============================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

interface OrchestratorResult {
  success: boolean;
  taskId: string;
  iterations: number;
  decision?: "PROCEED" | "ITERATE" | "ABORT";
  passRate?: number;
  consensus?: number;
  reason?: string;
  error?: string;
  durationMs: number;
}

// =============================================
// Test Utilities
// =============================================

const results: TestResult[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    const result = { name, passed: true, duration: Date.now() - start };
    results.push(result);
    console.log(`  [PASS] ${name} (${result.duration}ms)`);
    return result;
  } catch (error) {
    const result = {
      name,
      passed: false,
      error: (error as Error).message,
      duration: Date.now() - start,
    };
    results.push(result);
    console.log(`  [FAIL] ${name}: ${result.error} (${result.duration}ms)`);
    return result;
  }
}

async function cleanup(taskId: string, workDir: string): Promise<void> {
  // Clean database
  try {
    await pool.query("DELETE FROM cfn_logs WHERE task_id = $1", [taskId]);
    await pool.query("DELETE FROM cfn_test_runs WHERE task_id = $1", [taskId]);
    await pool.query("DELETE FROM cfn_tasks WHERE id = $1", [taskId]);
  } catch (e) {
    console.log("Database cleanup error (may be expected):", e);
  }

  // Clean Redis
  try {
    const keys = await redis.keys(`cfn:*:${taskId}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (e) {
    console.log("Redis cleanup error (may be expected):", e);
  }

  // Clean workspace
  try {
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.log("Workspace cleanup error (may be expected):", e);
  }
}

// =============================================
// Simulated Components
// =============================================

/**
 * Simulate coordinator analysis for a simple task
 */
async function simulateCoordinator(
  taskId: string,
  taskDescription: string,
  workDir: string
): Promise<{
  manifest: {
    phases: Array<{
      phase: number;
      name: string;
      parallel: boolean;
      agents: Array<{
        id: string;
        type: string;
        task: string;
        files: string[];
        tests: string[];
      }>;
    }>;
    dependencies: Record<string, string[]>;
    totalAgents: number;
    detectedPattern: string;
    estimatedMinutes: number;
  };
  complexity: string;
}> {
  // Create iteration record
  const iterResult = await pool.query(
    `INSERT INTO cfn_iterations (task_id, iteration_number, status)
     VALUES ($1, 1, 'running')
     RETURNING id`,
    [taskId]
  );
  const iterationId = iterResult.rows[0].id;

  // Create coordinator agent record
  await pool.query(
    `INSERT INTO cfn_agents
     (id, task_id, iteration_id, agent_type, role, status, task_description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      `${taskId}-coordinator`,
      taskId,
      iterationId,
      "coordinator",
      "coordinator",
      "completed",
      "Analyze task and produce manifest",
    ]
  );

  // For a simple task, return a simple manifest
  return {
    manifest: {
      phases: [
        {
          phase: 1,
          name: "Implementation",
          parallel: false,
          agents: [
            {
              id: "impl-1",
              type: "typescript-specialist",
              task: "Create greet.ts with hello() function returning 'Hello, World!'",
              files: [path.join(workDir, "greet.ts")],
              tests: [path.join(workDir, "greet.test.ts")],
            },
          ],
        },
      ],
      dependencies: {},
      totalAgents: 1,
      detectedPattern: "feature",
      estimatedMinutes: 2,
    },
    complexity: "simple",
  };
}

/**
 * Simulate implementer execution
 */
async function simulateImplementer(
  taskId: string,
  agentId: string,
  iterationId: number,
  workDir: string,
  file: string
): Promise<{ success: boolean; testsPassed: boolean; confidence: number }> {
  const fullAgentId = `${taskId}-${agentId}`;

  // Create agent record
  await pool.query(
    `INSERT INTO cfn_agents
     (id, task_id, iteration_id, agent_type, role, status, assigned_files, task_description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      fullAgentId,
      taskId,
      iterationId,
      "typescript-specialist",
      "implementer",
      "running",
      [file],
      "Create greet.ts with hello() function",
    ]
  );

  // Simulate file creation
  const fileContent = `/**
 * Greeting module
 * @module greet
 */

/**
 * Returns a friendly greeting
 * @returns {string} The greeting "Hello, World!"
 */
export function hello(): string {
  return "Hello, World!";
}
`;

  // Create the file
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fileContent);

  // Create test file
  const testContent = `import { hello } from './greet';

describe('hello', () => {
  it('should return Hello, World!', () => {
    expect(hello()).toBe('Hello, World!');
  });
});
`;
  fs.writeFileSync(file.replace(".ts", ".test.ts"), testContent);

  const result = {
    success: true,
    testsPassed: true,
    confidence: 0.85,
  };

  // Update agent record
  await pool.query(
    `UPDATE cfn_agents
     SET status = 'completed', success = $2, tests_passed = $3, confidence = $4,
         files_modified = $5, completed_at = NOW()
     WHERE id = $1`,
    [fullAgentId, result.success, result.testsPassed, result.confidence, [file]]
  );

  // Signal completion via Redis
  await redis.lpush(
    `cfn:complete:${taskId}`,
    JSON.stringify({
      agentId: fullAgentId,
      status: "completed",
      success: result.success,
      testsPassed: result.testsPassed,
      confidence: result.confidence,
      filesModified: [file],
      durationMs: 1500,
      completedAt: Date.now(),
    })
  );

  return result;
}

/**
 * Simulate validator execution
 */
async function simulateValidator(
  taskId: string,
  validatorNumber: number,
  iterationId: number,
  workDir: string
): Promise<{ confidence: number }> {
  const agentId = `${taskId}-validator-${validatorNumber}`;

  // Create agent record
  await pool.query(
    `INSERT INTO cfn_agents
     (id, task_id, iteration_id, agent_type, role, status, task_description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      agentId,
      taskId,
      iterationId,
      "code-reviewer",
      "validator",
      "running",
      "Review implementation quality",
    ]
  );

  // Simulate review - high confidence for simple correct implementation
  const confidence = 0.85 + Math.random() * 0.1; // 0.85 - 0.95

  // Update agent record
  await pool.query(
    `UPDATE cfn_agents
     SET status = 'completed', success = true, confidence = $2, completed_at = NOW()
     WHERE id = $1`,
    [agentId, confidence]
  );

  // Signal completion via Redis
  await redis.lpush(
    `cfn:complete:${taskId}`,
    JSON.stringify({
      agentId,
      status: "completed",
      success: true,
      confidence,
      durationMs: 2000,
      completedAt: Date.now(),
    })
  );

  return { confidence };
}

/**
 * Simulate gate check (test execution)
 */
async function simulateGateCheck(
  taskId: string,
  iterationId: number,
  workDir: string
): Promise<{ passRate: number; passed: boolean }> {
  // For MVP mode, simulate passing tests
  const passRate = 1.0; // 100% for simple correct implementation
  const passed = passRate >= 0.7; // MVP threshold

  // Record test run
  await pool.query(
    `INSERT INTO cfn_test_runs
     (task_id, iteration_id, test_command, work_dir, exit_code,
      duration_ms, total_tests, passed_tests, failed_tests, pass_rate, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [taskId, iterationId, "npm test", workDir, 0, 1234, 1, 1, 0, passRate]
  );

  return { passRate, passed };
}

// =============================================
// Main Integration Test
// =============================================

async function testSimpleTaskMVP(): Promise<OrchestratorResult> {
  const taskId = `test-mvp-${Date.now()}`;
  const workDir = `/tmp/test-simple-mvp-${Date.now()}`;
  const taskDescription = "Add a hello() function to greet.ts that returns 'Hello, World!'";
  const startTime = Date.now();

  console.log("\n--- Starting Simple Task MVP Integration Test ---");
  console.log(`Task ID: ${taskId}`);
  console.log(`Work Directory: ${workDir}`);
  console.log(`Task: ${taskDescription}`);

  try {
    // Ensure work directory exists
    fs.mkdirSync(workDir, { recursive: true });

    // Step 1: Create task record
    console.log("\n[Step 1] Creating task record...");
    await pool.query(
      `INSERT INTO cfn_tasks
       (id, description, mode, max_iterations, status, work_dir, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [taskId, taskDescription, "mvp", 5, "pending", workDir, "zai"]
    );

    await pool.query(
      `UPDATE cfn_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId]
    );

    // Step 2: Run coordinator
    console.log("[Step 2] Running coordinator analysis...");
    const coordResult = await simulateCoordinator(taskId, taskDescription, workDir);
    console.log(`  Detected pattern: ${coordResult.manifest.detectedPattern}`);
    console.log(`  Complexity: ${coordResult.complexity}`);
    console.log(`  Agents needed: ${coordResult.manifest.totalAgents}`);

    // Get iteration ID
    const iterResult = await pool.query(
      "SELECT id FROM cfn_iterations WHERE task_id = $1 ORDER BY id DESC LIMIT 1",
      [taskId]
    );
    const iterationId = iterResult.rows[0].id;

    // Update iteration with manifest
    await pool.query(
      `UPDATE cfn_iterations SET coordinator_manifest = $2 WHERE id = $1`,
      [iterationId, JSON.stringify(coordResult.manifest)]
    );

    // Step 3: Execute implementers
    console.log("[Step 3] Executing implementer agents...");
    for (const phase of coordResult.manifest.phases) {
      for (const agent of phase.agents) {
        const implResult = await simulateImplementer(
          taskId,
          agent.id,
          iterationId,
          workDir,
          agent.files[0]
        );
        console.log(`  Agent ${agent.id}: success=${implResult.success}, testsPassed=${implResult.testsPassed}`);
      }
    }

    // Step 4: Wait for completions via Redis
    console.log("[Step 4] Checking Redis completion signals...");
    const completions: string[] = [];
    for (let i = 0; i < coordResult.manifest.totalAgents; i++) {
      const result = await redis.brpop(`cfn:complete:${taskId}`, 5);
      if (result) {
        completions.push(result[1]);
        console.log(`  Received completion signal: ${JSON.parse(result[1]).agentId}`);
      }
    }

    // Step 5: Run gate check
    console.log("[Step 5] Running gate check...");
    const gateResult = await simulateGateCheck(taskId, iterationId, workDir);
    console.log(`  Pass rate: ${(gateResult.passRate * 100).toFixed(1)}%`);
    console.log(`  Gate passed: ${gateResult.passed}`);

    if (!gateResult.passed) {
      return {
        success: false,
        taskId,
        iterations: 1,
        decision: "ITERATE",
        passRate: gateResult.passRate,
        reason: "Gate check failed",
        durationMs: Date.now() - startTime,
      };
    }

    // Update iteration with gate results
    await pool.query(
      `UPDATE cfn_iterations SET gate_pass_rate = $2, gate_passed = $3 WHERE id = $1`,
      [iterationId, gateResult.passRate, gateResult.passed]
    );

    // Step 6: Run validators
    console.log("[Step 6] Running validators...");
    const validatorCount = 2; // MVP mode
    const validatorResults: number[] = [];

    for (let i = 1; i <= validatorCount; i++) {
      const valResult = await simulateValidator(taskId, i, iterationId, workDir);
      validatorResults.push(valResult.confidence);
      console.log(`  Validator ${i}: confidence=${(valResult.confidence * 100).toFixed(1)}%`);
    }

    // Wait for validator completions
    for (let i = 0; i < validatorCount; i++) {
      const result = await redis.brpop(`cfn:complete:${taskId}`, 5);
      if (result) {
        console.log(`  Received validator completion: ${JSON.parse(result[1]).agentId}`);
      }
    }

    // Step 7: Calculate consensus
    console.log("[Step 7] Calculating consensus...");
    const avgConsensus =
      validatorResults.reduce((a, b) => a + b, 0) / validatorResults.length;
    const consensusPassed = avgConsensus >= 0.8; // MVP threshold
    console.log(`  Average consensus: ${(avgConsensus * 100).toFixed(1)}%`);
    console.log(`  Consensus passed: ${consensusPassed}`);

    // Update iteration with consensus
    await pool.query(
      `UPDATE cfn_iterations SET consensus_score = $2, consensus_passed = $3 WHERE id = $1`,
      [iterationId, avgConsensus, consensusPassed]
    );

    // Step 8: Make Product Owner decision
    console.log("[Step 8] Making Product Owner decision...");
    let decision: "PROCEED" | "ITERATE" | "ABORT";

    if (gateResult.passed && consensusPassed) {
      decision = "PROCEED";
    } else {
      decision = "ITERATE";
    }
    console.log(`  Decision: ${decision}`);

    // Update iteration with decision
    await pool.query(
      `UPDATE cfn_iterations SET status = 'completed', decision = $2, completed_at = NOW() WHERE id = $1`,
      [iterationId, decision]
    );

    // Update task status
    const finalStatus = decision === "PROCEED" ? "completed" : "running";
    const completedAt = decision === "PROCEED" ? new Date() : null;
    await pool.query(
      `UPDATE cfn_tasks
       SET status = $2, final_decision = $3, final_pass_rate = $4, final_consensus = $5,
           completed_at = COALESCE($6, completed_at)
       WHERE id = $1`,
      [taskId, finalStatus, decision, gateResult.passRate, avgConsensus, completedAt]
    );

    const durationMs = Date.now() - startTime;

    return {
      success: decision === "PROCEED",
      taskId,
      iterations: 1,
      decision,
      passRate: gateResult.passRate,
      consensus: avgConsensus,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      taskId,
      iterations: 0,
      error: (error as Error).message,
      durationMs,
    };
  }
}

// =============================================
// Validation Tests
// =============================================

async function validateTaskRecord(taskId: string): Promise<void> {
  const result = await pool.query("SELECT * FROM cfn_tasks WHERE id = $1", [
    taskId,
  ]);
  assert(result.rows.length === 1, "Task record should exist");
  assert(result.rows[0].status === "completed", "Task status should be completed");
  assert(result.rows[0].final_decision === "PROCEED", "Final decision should be PROCEED");
  assert(
    parseFloat(result.rows[0].final_pass_rate) >= 0.7,
    "Pass rate should meet MVP threshold (>=70%)"
  );
  assert(
    parseFloat(result.rows[0].final_consensus) >= 0.8,
    "Consensus should meet MVP threshold (>=80%)"
  );
}

async function validateIterationRecord(taskId: string): Promise<void> {
  const result = await pool.query(
    "SELECT * FROM cfn_iterations WHERE task_id = $1",
    [taskId]
  );
  assert(result.rows.length >= 1, "At least one iteration should exist");

  const lastIter = result.rows[result.rows.length - 1];
  assert(lastIter.status === "completed", "Last iteration should be completed");
  assert(lastIter.decision === "PROCEED", "Last iteration decision should be PROCEED");
  assert(lastIter.gate_passed === true, "Gate should have passed");
  assert(lastIter.consensus_passed === true, "Consensus should have passed");
}

async function validateAgentRecords(taskId: string): Promise<void> {
  const result = await pool.query(
    "SELECT * FROM cfn_agents WHERE task_id = $1 ORDER BY created_at",
    [taskId]
  );
  assert(result.rows.length >= 4, "Should have coordinator + 1 implementer + 2 validators");

  const coordinator = result.rows.find((r) => r.role === "coordinator");
  assert(coordinator !== undefined, "Coordinator agent should exist");

  const implementers = result.rows.filter((r) => r.role === "implementer");
  assert(implementers.length >= 1, "At least 1 implementer should exist");
  assert(implementers[0].success === true, "Implementer should have succeeded");

  const validators = result.rows.filter((r) => r.role === "validator");
  assert(validators.length >= 2, "At least 2 validators should exist (MVP mode)");
}

async function validateTestRunRecord(taskId: string): Promise<void> {
  const result = await pool.query(
    "SELECT * FROM cfn_test_runs WHERE task_id = $1",
    [taskId]
  );
  assert(result.rows.length >= 1, "At least one test run should be recorded");
  assert(
    parseFloat(result.rows[0].pass_rate) >= 0.7,
    "Test pass rate should meet MVP threshold"
  );
}

async function validateFileCreation(workDir: string): Promise<void> {
  const greetPath = path.join(workDir, "greet.ts");
  assert(fs.existsSync(greetPath), "greet.ts should exist");

  const content = fs.readFileSync(greetPath, "utf-8");
  assert(content.includes("hello"), "File should contain hello function");
  assert(
    content.includes("Hello, World!"),
    "File should contain 'Hello, World!' string"
  );

  const testPath = path.join(workDir, "greet.test.ts");
  assert(fs.existsSync(testPath), "greet.test.ts should exist");
}

async function validateRedisCleanup(taskId: string): Promise<void> {
  // After test, Redis queue should be empty
  const queueLength = await redis.llen(`cfn:complete:${taskId}`);
  assert(queueLength === 0, "Redis completion queue should be empty after processing");
}

// =============================================
// Main Test Runner
// =============================================

async function main() {
  console.log("\n========================================");
  console.log("Simple Task MVP Integration Test");
  console.log("========================================\n");

  const startTime = Date.now();
  let taskId = "";
  let workDir = "";

  try {
    // Run the main integration test
    const orchestratorResult = await testSimpleTaskMVP();
    taskId = orchestratorResult.taskId;
    workDir = `/tmp/test-simple-mvp-${taskId.split("-").pop()}`;

    console.log("\n--- Orchestrator Result ---");
    console.log(`Success: ${orchestratorResult.success}`);
    console.log(`Task ID: ${orchestratorResult.taskId}`);
    console.log(`Iterations: ${orchestratorResult.iterations}`);
    console.log(`Decision: ${orchestratorResult.decision}`);
    console.log(`Pass Rate: ${((orchestratorResult.passRate || 0) * 100).toFixed(1)}%`);
    console.log(`Consensus: ${((orchestratorResult.consensus || 0) * 100).toFixed(1)}%`);
    console.log(`Duration: ${orchestratorResult.durationMs}ms`);

    if (!orchestratorResult.success) {
      console.log(`Error: ${orchestratorResult.error || orchestratorResult.reason}`);
    }

    console.log("\n--- Running Validation Tests ---\n");

    // Run validation tests
    await runTest("Task Record Validation", () => validateTaskRecord(taskId));
    await runTest("Iteration Record Validation", () => validateIterationRecord(taskId));
    await runTest("Agent Records Validation", () => validateAgentRecords(taskId));
    await runTest("Test Run Record Validation", () => validateTestRunRecord(taskId));
    await runTest("File Creation Validation", () =>
      validateFileCreation(workDir.replace(taskId.split("-").pop()!, taskId.split("-")[2]))
    );
    await runTest("Redis Cleanup Validation", () => validateRedisCleanup(taskId));

    const totalTime = Date.now() - startTime;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    console.log("\n========================================");
    console.log("Test Results Summary");
    console.log("========================================");
    console.log(`Orchestrator: ${orchestratorResult.success ? "PASSED" : "FAILED"}`);
    console.log(`Validation Tests: ${passed} passed, ${failed} failed`);
    console.log(`Total Duration: ${totalTime}ms`);
    console.log("========================================\n");

    if (failed > 0) {
      console.log("Failed Tests:");
      results
        .filter((r) => !r.passed)
        .forEach((r) => console.log(`  - ${r.name}: ${r.error}`));
      console.log("");
    }

    // Cleanup
    console.log("Cleaning up test data...");
    await cleanup(taskId, workDir);

    if (failed > 0 || !orchestratorResult.success) {
      console.log("[FAILED] Simple Task MVP integration test failed");
      process.exit(1);
    }

    console.log("[PASSED] Simple Task MVP integration test passed");
    process.exit(0);
  } catch (error) {
    console.error("Test suite failed:", error);

    // Cleanup on error
    if (taskId) {
      await cleanup(taskId, workDir);
    }

    process.exit(1);
  } finally {
    await pool.end();
    await redis.quit();
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  pool.end();
  redis.quit();
  process.exit(1);
});
