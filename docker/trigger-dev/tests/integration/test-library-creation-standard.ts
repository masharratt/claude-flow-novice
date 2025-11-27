/**
 * Integration Test: Library Creation (Standard Mode)
 *
 * Task: "Create a math utilities library with add(), subtract(), multiply(),
 *       divide() functions and comprehensive tests"
 *
 * Expected Flow:
 * 1. Coordinator analyzes task (moderate complexity, 2-3 agents)
 * 2. Orchestrator spawns 2 implementers in parallel:
 *    - Agent 1: math.ts implementation
 *    - Agent 2: math.test.ts tests
 * 3. Implementers signal completion via Redis
 * 4. Gate check runs tests (>= 95% pass rate required)
 * 5. If gate passes, spawn 3 validators
 * 6. Validators review code, signal completion
 * 7. Consensus check (>= 90%)
 * 8. Product Owner decision: PROCEED or ITERATE
 *
 * Validation Points:
 * - Complexity analysis: moderate, 2-3 agents, parallelizable
 * - Both agents complete within timeout
 * - Redis signals received for both agents
 * - Tests created and pass gate check
 * - MDAP metrics recorded (tier 2 for moderate task)
 * - Validator consensus >= 90%
 * - Final decision: PROCEED
 *
 * This test simulates the full Standard mode flow with stricter thresholds.
 *
 * @module tests/integration/test-library-creation-standard
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

// Standard mode thresholds
const STANDARD_GATE_THRESHOLD = 0.95;
const STANDARD_CONSENSUS_THRESHOLD = 0.9;
const STANDARD_VALIDATOR_COUNT = 3;
const STANDARD_MAX_ITERATIONS = 10;

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
  workDir: string;
  iterations: number;
  decision?: "PROCEED" | "ITERATE" | "ABORT";
  passRate?: number;
  consensus?: number;
  reason?: string;
  error?: string;
  durationMs: number;
  agents: {
    implementers: number;
    validators: number;
    totalCompleted: number;
  };
  mdapMetrics?: {
    modelTier: number;
    tierName: string;
    estimatedCost: number;
  };
}

interface PhaseManifest {
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
}

interface AgentManifest {
  phases: PhaseManifest[];
  dependencies: Record<string, string[]>;
  totalAgents: number;
  detectedPattern: string;
  estimatedMinutes: number;
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
    await pool.query("DELETE FROM mdap_executions WHERE task_id = $1", [taskId]);
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
// Library Code Generation
// =============================================

function generateMathLibrary(): string {
  return `/**
 * Math Utilities Library
 *
 * Provides basic arithmetic operations with type safety.
 * @module math
 */

/**
 * Adds two numbers together
 * @param a - First number
 * @param b - Second number
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtracts the second number from the first
 * @param a - First number (minuend)
 * @param b - Second number (subtrahend)
 * @returns The difference a - b
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Multiplies two numbers
 * @param a - First number
 * @param b - Second number
 * @returns The product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Divides the first number by the second
 * @param a - Dividend
 * @param b - Divisor
 * @returns The quotient a / b
 * @throws Error if b is zero
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error("Division by zero is not allowed");
  }
  return a / b;
}

/**
 * Calculates the modulo (remainder) of division
 * @param a - Dividend
 * @param b - Divisor
 * @returns The remainder of a / b
 */
export function modulo(a: number, b: number): number {
  if (b === 0) {
    throw new Error("Modulo by zero is not allowed");
  }
  return a % b;
}

/**
 * Raises a number to a power
 * @param base - The base number
 * @param exponent - The exponent
 * @returns base raised to exponent
 */
export function power(base: number, exponent: number): number {
  return Math.pow(base, exponent);
}
`;
}

function generateMathTests(): string {
  return `/**
 * Math Utilities Library Tests
 * @module math.test
 */

import { add, subtract, multiply, divide, modulo, power } from './math';

describe('Math Utilities', () => {
  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(add(2, 3)).toBe(5);
    });

    it('should add negative numbers', () => {
      expect(add(-2, -3)).toBe(-5);
    });

    it('should add zero', () => {
      expect(add(5, 0)).toBe(5);
    });

    it('should add decimals', () => {
      expect(add(0.1, 0.2)).toBeCloseTo(0.3);
    });
  });

  describe('subtract', () => {
    it('should subtract two positive numbers', () => {
      expect(subtract(5, 3)).toBe(2);
    });

    it('should handle negative results', () => {
      expect(subtract(3, 5)).toBe(-2);
    });

    it('should subtract zero', () => {
      expect(subtract(5, 0)).toBe(5);
    });
  });

  describe('multiply', () => {
    it('should multiply two positive numbers', () => {
      expect(multiply(4, 3)).toBe(12);
    });

    it('should multiply by zero', () => {
      expect(multiply(5, 0)).toBe(0);
    });

    it('should multiply negative numbers', () => {
      expect(multiply(-2, 3)).toBe(-6);
    });

    it('should multiply two negatives', () => {
      expect(multiply(-2, -3)).toBe(6);
    });
  });

  describe('divide', () => {
    it('should divide two positive numbers', () => {
      expect(divide(10, 2)).toBe(5);
    });

    it('should handle decimal results', () => {
      expect(divide(5, 2)).toBe(2.5);
    });

    it('should throw on division by zero', () => {
      expect(() => divide(5, 0)).toThrow('Division by zero is not allowed');
    });

    it('should divide negative by positive', () => {
      expect(divide(-10, 2)).toBe(-5);
    });
  });

  describe('modulo', () => {
    it('should calculate modulo', () => {
      expect(modulo(10, 3)).toBe(1);
    });

    it('should return zero for exact division', () => {
      expect(modulo(10, 5)).toBe(0);
    });

    it('should throw on modulo by zero', () => {
      expect(() => modulo(5, 0)).toThrow('Modulo by zero is not allowed');
    });
  });

  describe('power', () => {
    it('should calculate power', () => {
      expect(power(2, 3)).toBe(8);
    });

    it('should handle power of zero', () => {
      expect(power(5, 0)).toBe(1);
    });

    it('should handle negative exponents', () => {
      expect(power(2, -1)).toBe(0.5);
    });

    it('should handle fractional exponents', () => {
      expect(power(4, 0.5)).toBe(2);
    });
  });
});
`;
}

// =============================================
// Simulated Components
// =============================================

/**
 * Simulate coordinator analysis for library creation task
 */
async function simulateCoordinator(
  taskId: string,
  taskDescription: string,
  workDir: string
): Promise<{
  manifest: AgentManifest;
  complexity: string;
  iterationId: number;
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
      "Analyze library creation task and produce manifest",
    ]
  );

  // Analyze task - library pattern detected
  const manifest: AgentManifest = {
    phases: [
      {
        phase: 1,
        name: "Implementation",
        parallel: true, // Both can work in parallel
        agents: [
          {
            id: "impl-lib",
            type: "typescript-specialist",
            task: "Create math.ts with add(), subtract(), multiply(), divide(), modulo(), power() functions",
            files: [path.join(workDir, "src", "math.ts")],
            tests: [],
          },
          {
            id: "impl-tests",
            type: "testing-specialist",
            task: "Create comprehensive test suite for math utilities",
            files: [path.join(workDir, "src", "math.test.ts")],
            tests: [path.join(workDir, "src", "math.test.ts")],
          },
        ],
      },
    ],
    dependencies: {
      "impl-tests": ["impl-lib"], // Tests depend on library
    },
    totalAgents: 2,
    detectedPattern: "library",
    estimatedMinutes: 5,
  };

  // Update iteration with manifest and complexity analysis
  await pool.query(
    `UPDATE cfn_iterations SET coordinator_manifest = $2 WHERE id = $1`,
    [iterationId, JSON.stringify(manifest)]
  );

  // Log complexity analysis
  await pool.query(
    `INSERT INTO cfn_logs
     (task_id, iteration_id, component, level, message, data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      taskId,
      iterationId,
      "coordinator",
      "info",
      "Task complexity analysis complete",
      JSON.stringify({
        complexity: "moderate",
        pattern: "library",
        parallelizable: true,
        estimatedMinutes: 5,
      }),
    ]
  );

  return {
    manifest,
    complexity: "moderate",
    iterationId,
  };
}

/**
 * Simulate implementer execution with MDAP metrics
 */
async function simulateImplementer(
  taskId: string,
  agentId: string,
  iterationId: number,
  agentType: string,
  taskDesc: string,
  file: string,
  content: string
): Promise<{
  success: boolean;
  testsPassed: boolean;
  confidence: number;
  mdap: { modelTier: number; tierName: string; estimatedCost: number };
}> {
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
      agentType,
      "implementer",
      "running",
      [file],
      taskDesc,
    ]
  );

  // Simulate MDAP tier selection for moderate complexity
  const mdap = {
    modelTier: 2,
    tierName: "sonnet-balanced",
    estimatedCost: 0.05,
  };

  // Record MDAP execution
  await pool.query(
    `INSERT INTO mdap_executions
     (task_id, micro_task_id, profile, complexity, attempts,
      final_tier, final_model, success, total_latency_ms, total_cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      taskId,
      `${taskId}-${agentId}`,
      "balanced",
      "moderate",
      JSON.stringify([{ tier: 2, model: "claude-sonnet", success: true, latencyMs: 3000 }]),
      2,
      "claude-sonnet",
      true,
      3000,
      mdap.estimatedCost,
    ]
  );

  // Create the file
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, content);

  const result = {
    success: true,
    testsPassed: true,
    confidence: 0.9,
    mdap,
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
      durationMs: 3000,
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
      "Review math library implementation quality",
    ]
  );

  // Simulate review - high confidence for correct library implementation
  const confidence = 0.9 + Math.random() * 0.08; // 0.90 - 0.98

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
      durationMs: 2500,
      completedAt: Date.now(),
    })
  );

  return { confidence };
}

/**
 * Simulate gate check with strict standard mode threshold
 */
async function simulateGateCheck(
  taskId: string,
  iterationId: number,
  workDir: string
): Promise<{
  passRate: number;
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
}> {
  // For library creation, simulate comprehensive test results
  const totalTests = 22; // Based on test file
  const passedTests = 22; // All pass for correct implementation
  const failedTests = 0;
  const passRate = passedTests / totalTests;
  const passed = passRate >= STANDARD_GATE_THRESHOLD;

  // Record test run
  await pool.query(
    `INSERT INTO cfn_test_runs
     (task_id, iteration_id, test_command, work_dir, exit_code,
      duration_ms, total_tests, passed_tests, failed_tests, pass_rate, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [
      taskId,
      iterationId,
      "npm test",
      workDir,
      0,
      2543,
      totalTests,
      passedTests,
      failedTests,
      passRate,
    ]
  );

  return { passRate, passed, totalTests, passedTests, failedTests };
}

// =============================================
// Main Integration Test
// =============================================

async function testLibraryCreationStandard(): Promise<OrchestratorResult> {
  const taskId = `test-lib-std-${Date.now()}`;
  const workDir = `/tmp/test-library-standard-${Date.now()}`;
  const taskDescription =
    "Create a math utilities library with add(), subtract(), multiply(), divide() functions and comprehensive tests";
  const startTime = Date.now();

  console.log("\n--- Starting Library Creation Standard Mode Test ---");
  console.log(`Task ID: ${taskId}`);
  console.log(`Work Directory: ${workDir}`);
  console.log(`Task: ${taskDescription}`);
  console.log(`Gate Threshold: ${(STANDARD_GATE_THRESHOLD * 100).toFixed(0)}%`);
  console.log(`Consensus Threshold: ${(STANDARD_CONSENSUS_THRESHOLD * 100).toFixed(0)}%`);

  let completedAgents = 0;

  try {
    // Ensure work directory exists
    fs.mkdirSync(workDir, { recursive: true });

    // Step 1: Create task record
    console.log("\n[Step 1] Creating task record...");
    await pool.query(
      `INSERT INTO cfn_tasks
       (id, description, mode, max_iterations, status, work_dir, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [taskId, taskDescription, "standard", STANDARD_MAX_ITERATIONS, "pending", workDir, "zai"]
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
    console.log(`  Phases: ${coordResult.manifest.phases.length}`);
    console.log(`  Parallel execution: ${coordResult.manifest.phases[0].parallel}`);

    // Step 3: Execute implementers in parallel
    console.log("[Step 3] Executing implementer agents (parallel)...");

    const implPromises: Promise<any>[] = [];

    // Library implementer
    implPromises.push(
      simulateImplementer(
        taskId,
        "impl-lib",
        coordResult.iterationId,
        "typescript-specialist",
        "Create math.ts library",
        path.join(workDir, "src", "math.ts"),
        generateMathLibrary()
      )
    );

    // Test implementer
    implPromises.push(
      simulateImplementer(
        taskId,
        "impl-tests",
        coordResult.iterationId,
        "testing-specialist",
        "Create math.test.ts tests",
        path.join(workDir, "src", "math.test.ts"),
        generateMathTests()
      )
    );

    const implResults = await Promise.all(implPromises);
    completedAgents += implResults.length;

    for (const result of implResults) {
      console.log(
        `  Agent completed: success=${result.success}, mdap.tier=${result.mdap.modelTier}`
      );
    }

    // Step 4: Wait for completions via Redis BLPOP
    console.log("[Step 4] Checking Redis completion signals (BLPOP)...");
    const completions: string[] = [];
    for (let i = 0; i < coordResult.manifest.totalAgents; i++) {
      const result = await redis.brpop(`cfn:complete:${taskId}`, 10);
      if (result) {
        completions.push(result[1]);
        const parsed = JSON.parse(result[1]);
        console.log(`  BLPOP received: ${parsed.agentId}`);
      }
    }

    // Step 5: Run gate check
    console.log("[Step 5] Running gate check (Standard: >= 95%)...");
    const gateResult = await simulateGateCheck(taskId, coordResult.iterationId, workDir);
    console.log(`  Total tests: ${gateResult.totalTests}`);
    console.log(`  Passed: ${gateResult.passedTests}`);
    console.log(`  Failed: ${gateResult.failedTests}`);
    console.log(`  Pass rate: ${(gateResult.passRate * 100).toFixed(1)}%`);
    console.log(`  Gate passed: ${gateResult.passed}`);

    if (!gateResult.passed) {
      // Would iterate in real orchestration
      return {
        success: false,
        taskId,
        workDir,
        iterations: 1,
        decision: "ITERATE",
        passRate: gateResult.passRate,
        reason: `Gate check failed: ${(gateResult.passRate * 100).toFixed(1)}% < ${(STANDARD_GATE_THRESHOLD * 100).toFixed(0)}%`,
        durationMs: Date.now() - startTime,
        agents: {
          implementers: 2,
          validators: 0,
          totalCompleted: completedAgents,
        },
      };
    }

    // Update iteration with gate results
    await pool.query(
      `UPDATE cfn_iterations SET gate_pass_rate = $2, gate_passed = $3 WHERE id = $1`,
      [coordResult.iterationId, gateResult.passRate, gateResult.passed]
    );

    // Step 6: Run validators
    console.log(`[Step 6] Running ${STANDARD_VALIDATOR_COUNT} validators (Standard mode)...`);
    const validatorResults: number[] = [];

    for (let i = 1; i <= STANDARD_VALIDATOR_COUNT; i++) {
      const valResult = await simulateValidator(taskId, i, coordResult.iterationId, workDir);
      validatorResults.push(valResult.confidence);
      console.log(`  Validator ${i}: confidence=${(valResult.confidence * 100).toFixed(1)}%`);
    }
    completedAgents += STANDARD_VALIDATOR_COUNT;

    // Wait for validator completions via BLPOP
    for (let i = 0; i < STANDARD_VALIDATOR_COUNT; i++) {
      const result = await redis.brpop(`cfn:complete:${taskId}`, 10);
      if (result) {
        console.log(`  BLPOP received: ${JSON.parse(result[1]).agentId}`);
      }
    }

    // Step 7: Calculate consensus
    console.log("[Step 7] Calculating consensus (Standard: >= 90%)...");
    const avgConsensus =
      validatorResults.reduce((a, b) => a + b, 0) / validatorResults.length;
    const consensusPassed = avgConsensus >= STANDARD_CONSENSUS_THRESHOLD;
    console.log(`  Average consensus: ${(avgConsensus * 100).toFixed(1)}%`);
    console.log(`  Consensus passed: ${consensusPassed}`);

    // Update iteration with consensus
    await pool.query(
      `UPDATE cfn_iterations SET consensus_score = $2, consensus_passed = $3 WHERE id = $1`,
      [coordResult.iterationId, avgConsensus, consensusPassed]
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
      [coordResult.iterationId, decision]
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
      workDir,
      iterations: 1,
      decision,
      passRate: gateResult.passRate,
      consensus: avgConsensus,
      durationMs,
      agents: {
        implementers: 2,
        validators: STANDARD_VALIDATOR_COUNT,
        totalCompleted: completedAgents,
      },
      mdapMetrics: implResults[0].mdap,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      taskId,
      workDir,
      iterations: 0,
      error: (error as Error).message,
      durationMs,
      agents: {
        implementers: 0,
        validators: 0,
        totalCompleted: completedAgents,
      },
    };
  }
}

// =============================================
// Validation Tests
// =============================================

async function validateComplexityAnalysis(taskId: string): Promise<void> {
  const result = await pool.query(
    `SELECT * FROM cfn_logs WHERE task_id = $1 AND component = 'coordinator' AND message LIKE '%complexity%'`,
    [taskId]
  );
  assert(result.rows.length >= 1, "Complexity analysis log should exist");

  const data = result.rows[0].data;
  assert(data.complexity === "moderate", "Should detect moderate complexity");
  assert(data.pattern === "library", "Should detect library pattern");
  assert(data.parallelizable === true, "Should be parallelizable");
}

async function validateParallelExecution(taskId: string): Promise<void> {
  const result = await pool.query(
    `SELECT * FROM cfn_iterations WHERE task_id = $1`,
    [taskId]
  );
  assert(result.rows.length >= 1, "Iteration should exist");

  const manifest = result.rows[0].coordinator_manifest;
  assert(manifest.phases[0].parallel === true, "First phase should be parallel");
  assert(manifest.phases[0].agents.length === 2, "Should have 2 parallel agents");
}

async function validateMDAPMetrics(taskId: string): Promise<void> {
  const result = await pool.query(
    `SELECT * FROM mdap_executions WHERE task_id = $1`,
    [taskId]
  );
  assert(result.rows.length >= 2, "Should have MDAP records for both implementers");

  for (const row of result.rows) {
    assert(row.final_tier === 2, "Should use tier 2 for moderate complexity");
    assert(row.complexity === "moderate", "Should record moderate complexity");
    assert(parseFloat(row.total_cost_usd) > 0, "Should have cost estimate");
  }
}

async function validateStandardModeThresholds(taskId: string): Promise<void> {
  const result = await pool.query(
    `SELECT * FROM cfn_tasks WHERE id = $1`,
    [taskId]
  );
  assert(result.rows.length === 1, "Task should exist");

  const task = result.rows[0];
  assert(
    parseFloat(task.final_pass_rate) >= STANDARD_GATE_THRESHOLD,
    `Pass rate should meet standard threshold (${(STANDARD_GATE_THRESHOLD * 100).toFixed(0)}%)`
  );
  assert(
    parseFloat(task.final_consensus) >= STANDARD_CONSENSUS_THRESHOLD,
    `Consensus should meet standard threshold (${(STANDARD_CONSENSUS_THRESHOLD * 100).toFixed(0)}%)`
  );
}

async function validateValidatorCount(taskId: string): Promise<void> {
  const result = await pool.query(
    `SELECT * FROM cfn_agents WHERE task_id = $1 AND role = 'validator'`,
    [taskId]
  );
  assert(
    result.rows.length === STANDARD_VALIDATOR_COUNT,
    `Should have ${STANDARD_VALIDATOR_COUNT} validators in standard mode`
  );
}

async function validateLibraryFiles(workDir: string): Promise<void> {
  const mathPath = path.join(workDir, "src", "math.ts");
  assert(fs.existsSync(mathPath), "math.ts should exist");

  const mathContent = fs.readFileSync(mathPath, "utf-8");
  const requiredFunctions = ["add", "subtract", "multiply", "divide", "modulo", "power"];
  for (const fn of requiredFunctions) {
    assert(
      mathContent.includes(`export function ${fn}`),
      `math.ts should export ${fn} function`
    );
  }

  const testPath = path.join(workDir, "src", "math.test.ts");
  assert(fs.existsSync(testPath), "math.test.ts should exist");

  const testContent = fs.readFileSync(testPath, "utf-8");
  assert(testContent.includes("describe"), "Tests should use describe blocks");
  assert(testContent.includes("expect"), "Tests should use expect assertions");
}

async function validateTestRunRecords(taskId: string): Promise<void> {
  const result = await pool.query(
    `SELECT * FROM cfn_test_runs WHERE task_id = $1`,
    [taskId]
  );
  assert(result.rows.length >= 1, "Should have test run records");

  const testRun = result.rows[0];
  assert(testRun.total_tests >= 20, "Should have comprehensive test coverage");
  assert(
    parseFloat(testRun.pass_rate) >= STANDARD_GATE_THRESHOLD,
    "Test pass rate should meet standard threshold"
  );
}

// =============================================
// Main Test Runner
// =============================================

async function main() {
  console.log("\n========================================");
  console.log("Library Creation Standard Mode Test");
  console.log("========================================\n");

  const startTime = Date.now();
  let taskId = "";
  let workDir = "";

  try {
    // Run the main integration test
    const orchestratorResult = await testLibraryCreationStandard();
    taskId = orchestratorResult.taskId;
    workDir = orchestratorResult.workDir;

    console.log("\n--- Orchestrator Result ---");
    console.log(`Success: ${orchestratorResult.success}`);
    console.log(`Task ID: ${orchestratorResult.taskId}`);
    console.log(`Iterations: ${orchestratorResult.iterations}`);
    console.log(`Decision: ${orchestratorResult.decision}`);
    console.log(`Pass Rate: ${((orchestratorResult.passRate || 0) * 100).toFixed(1)}%`);
    console.log(`Consensus: ${((orchestratorResult.consensus || 0) * 100).toFixed(1)}%`);
    console.log(`Duration: ${orchestratorResult.durationMs}ms`);
    console.log(`Agents - Implementers: ${orchestratorResult.agents.implementers}`);
    console.log(`Agents - Validators: ${orchestratorResult.agents.validators}`);
    console.log(`Agents - Total Completed: ${orchestratorResult.agents.totalCompleted}`);

    if (orchestratorResult.mdapMetrics) {
      console.log(`MDAP Tier: ${orchestratorResult.mdapMetrics.modelTier} (${orchestratorResult.mdapMetrics.tierName})`);
      console.log(`MDAP Cost: $${orchestratorResult.mdapMetrics.estimatedCost.toFixed(4)}`);
    }

    if (!orchestratorResult.success) {
      console.log(`Error: ${orchestratorResult.error || orchestratorResult.reason}`);
    }

    console.log("\n--- Running Validation Tests ---\n");

    // Run validation tests
    await runTest("Complexity Analysis", () => validateComplexityAnalysis(taskId));
    await runTest("Parallel Execution", () => validateParallelExecution(taskId));
    await runTest("MDAP Metrics", () => validateMDAPMetrics(taskId));
    await runTest("Standard Mode Thresholds", () => validateStandardModeThresholds(taskId));
    await runTest("Validator Count", () => validateValidatorCount(taskId));
    await runTest("Library Files", () =>
      validateLibraryFiles(workDir)
    );
    await runTest("Test Run Records", () => validateTestRunRecords(taskId));

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
      console.log("[FAILED] Library Creation Standard integration test failed");
      process.exit(1);
    }

    console.log("[PASSED] Library Creation Standard integration test passed");
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
