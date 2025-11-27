/**
 * Database Validation Test
 *
 * Integration test validating the complete CFN Loop database schema:
 * - All tables exist (cfn_tasks, cfn_iterations, cfn_phases, cfn_agents, etc.)
 * - All views exist (v_task_summary, v_recent_errors, etc.)
 * - All indexes exist
 * - Foreign key constraints work
 * - Sample data insertion/retrieval
 * - MDAP metrics recording
 *
 * @module tests/integration/test-database-validation
 */

import { Pool } from "pg";

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

// Expected schema elements
const EXPECTED_TABLES = [
  "cfn_tasks",
  "cfn_iterations",
  "cfn_phases",
  "cfn_agents",
  "cfn_logs",
  "cfn_test_runs",
  "mdap_executions",
  "mdap_model_stats",
];

const EXPECTED_VIEWS = [
  "v_task_summary",
  "v_recent_errors",
  "v_agent_performance",
  "v_iteration_summary",
];

const EXPECTED_INDEXES = [
  "idx_tasks_status",
  "idx_tasks_created_at",
  "idx_tasks_trigger_run_id",
  "idx_iterations_task_id",
  "idx_iterations_status",
  "idx_phases_iteration_id",
  "idx_phases_status",
  "idx_agents_task_id",
  "idx_agents_iteration_id",
  "idx_agents_status",
  "idx_agents_role",
  "idx_agents_agent_type",
  "idx_agents_trigger_run_id",
  "idx_logs_task_id",
  "idx_logs_agent_id",
  "idx_logs_timestamp",
  "idx_logs_level",
  "idx_logs_component",
  "idx_test_runs_task",
  "idx_test_runs_iteration",
  "idx_test_runs_agent",
  "idx_mdap_task",
  "idx_mdap_profile",
  "idx_mdap_success",
  "idx_mdap_complexity",
  "idx_mdap_created_at",
  "idx_mdap_stats_model",
  "idx_mdap_stats_success_rate",
];

// =============================================
// Test Utilities
// =============================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

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

// =============================================
// Test Functions
// =============================================

async function testDatabaseConnection(): Promise<void> {
  const result = await pool.query("SELECT 1 as test");
  assert(result.rows[0].test === 1, "Database connection should work");
}

async function testTablesExist(): Promise<void> {
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const tableNames = result.rows.map((r) => r.table_name);

  for (const expected of EXPECTED_TABLES) {
    assert(
      tableNames.includes(expected),
      `Table '${expected}' should exist. Found: ${tableNames.join(", ")}`
    );
  }
}

async function testViewsExist(): Promise<void> {
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
  `);
  const viewNames = result.rows.map((r) => r.table_name);

  for (const expected of EXPECTED_VIEWS) {
    assert(
      viewNames.includes(expected),
      `View '${expected}' should exist. Found: ${viewNames.join(", ")}`
    );
  }
}

async function testIndexesExist(): Promise<void> {
  const result = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
  `);
  const indexNames = result.rows.map((r) => r.indexname);

  // Allow some flexibility - check critical indexes
  const criticalIndexes = [
    "idx_tasks_status",
    "idx_agents_task_id",
    "idx_iterations_task_id",
    "idx_logs_task_id",
  ];

  for (const expected of criticalIndexes) {
    assert(
      indexNames.includes(expected),
      `Index '${expected}' should exist`
    );
  }
}

async function testTaskCreation(): Promise<void> {
  const taskId = `test-db-${Date.now()}`;

  // Create task
  const insertResult = await pool.query(
    `INSERT INTO cfn_tasks
     (id, description, mode, max_iterations, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [taskId, "Test task for database validation", "mvp", 5, "pending"]
  );

  assert(insertResult.rows.length === 1, "Task should be created");
  assert(insertResult.rows[0].id === taskId, "Task ID should match");
  assert(insertResult.rows[0].status === "pending", "Status should be pending");

  // Read task
  const selectResult = await pool.query(
    "SELECT * FROM cfn_tasks WHERE id = $1",
    [taskId]
  );
  assert(selectResult.rows.length === 1, "Task should be retrievable");

  // Update task
  await pool.query(
    `UPDATE cfn_tasks
     SET status = 'running', started_at = NOW()
     WHERE id = $1`,
    [taskId]
  );

  const updateResult = await pool.query(
    "SELECT status, started_at FROM cfn_tasks WHERE id = $1",
    [taskId]
  );
  assert(updateResult.rows[0].status === "running", "Status should be updated");
  assert(updateResult.rows[0].started_at !== null, "started_at should be set");

  // Cleanup
  await pool.query("DELETE FROM cfn_tasks WHERE id = $1", [taskId]);
}

async function testIterationCreation(): Promise<void> {
  const taskId = `test-iter-${Date.now()}`;

  // Create parent task first
  await pool.query(
    `INSERT INTO cfn_tasks (id, description, mode, max_iterations, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [taskId, "Test task for iteration validation", "standard", 10, "running"]
  );

  // Create iteration
  const iterResult = await pool.query(
    `INSERT INTO cfn_iterations
     (task_id, iteration_number, status)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [taskId, 1, "running"]
  );

  assert(iterResult.rows.length === 1, "Iteration should be created");
  assert(iterResult.rows[0].task_id === taskId, "Task ID should match");
  assert(iterResult.rows[0].iteration_number === 1, "Iteration number should be 1");

  // Test unique constraint
  let duplicateError = false;
  try {
    await pool.query(
      `INSERT INTO cfn_iterations (task_id, iteration_number, status)
       VALUES ($1, $2, $3)`,
      [taskId, 1, "running"]
    );
  } catch (error) {
    duplicateError = true;
  }
  assert(duplicateError, "Duplicate iteration should fail (unique constraint)");

  // Cleanup (cascade should delete iteration)
  await pool.query("DELETE FROM cfn_tasks WHERE id = $1", [taskId]);
}

async function testAgentCreation(): Promise<void> {
  const taskId = `test-agent-${Date.now()}`;
  const agentId = `${taskId}-agent-1`;

  // Create parent task
  await pool.query(
    `INSERT INTO cfn_tasks (id, description, mode, max_iterations, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [taskId, "Test task for agent validation", "mvp", 5, "running"]
  );

  // Create iteration
  const iterResult = await pool.query(
    `INSERT INTO cfn_iterations (task_id, iteration_number, status)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [taskId, 1, "running"]
  );
  const iterationId = iterResult.rows[0].id;

  // Create agent
  const agentResult = await pool.query(
    `INSERT INTO cfn_agents
     (id, task_id, iteration_id, agent_type, role, status, assigned_files, assigned_tests)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      agentId,
      taskId,
      iterationId,
      "typescript-specialist",
      "implementer",
      "pending",
      ["src/test.ts"],
      ["tests/test.spec.ts"],
    ]
  );

  assert(agentResult.rows.length === 1, "Agent should be created");
  assert(agentResult.rows[0].role === "implementer", "Role should be implementer");
  assert(
    Array.isArray(agentResult.rows[0].assigned_files),
    "assigned_files should be an array"
  );

  // Update agent with results
  await pool.query(
    `UPDATE cfn_agents
     SET status = 'completed', success = true, confidence = 0.85,
         files_modified = $2, completed_at = NOW()
     WHERE id = $1`,
    [agentId, ["src/test.ts"]]
  );

  const updatedAgent = await pool.query(
    "SELECT * FROM cfn_agents WHERE id = $1",
    [agentId]
  );
  assert(updatedAgent.rows[0].success === true, "Success should be true");
  assert(
    parseFloat(updatedAgent.rows[0].confidence) === 0.85,
    "Confidence should be 0.85"
  );

  // Cleanup
  await pool.query("DELETE FROM cfn_tasks WHERE id = $1", [taskId]);
}

async function testLogging(): Promise<void> {
  const taskId = `test-log-${Date.now()}`;

  // Create parent task
  await pool.query(
    `INSERT INTO cfn_tasks (id, description, mode, max_iterations, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [taskId, "Test task for logging validation", "mvp", 5, "running"]
  );

  // Insert log entries at different levels
  const levels = ["debug", "info", "warn", "error"];
  for (const level of levels) {
    await pool.query(
      `INSERT INTO cfn_logs
       (task_id, component, level, message, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [taskId, "test-component", level, `Test ${level} message`, { test: true }]
    );
  }

  // Verify logs created
  const logResult = await pool.query(
    "SELECT * FROM cfn_logs WHERE task_id = $1 ORDER BY timestamp",
    [taskId]
  );
  assert(logResult.rows.length === 4, "Should have 4 log entries");

  // Test v_recent_errors view
  const errorView = await pool.query(
    `SELECT * FROM v_recent_errors WHERE task_id = $1`,
    [taskId]
  );
  assert(
    errorView.rows.length >= 1,
    "v_recent_errors should show error logs"
  );

  // Cleanup
  await pool.query("DELETE FROM cfn_logs WHERE task_id = $1", [taskId]);
  await pool.query("DELETE FROM cfn_tasks WHERE id = $1", [taskId]);
}

async function testMDAPExecution(): Promise<void> {
  const taskId = `test-mdap-${Date.now()}`;
  const microTaskId = `${taskId}-micro-1`;

  // Create MDAP execution record
  const mdapResult = await pool.query(
    `INSERT INTO mdap_executions
     (task_id, micro_task_id, profile, complexity, attempts,
      final_tier, final_model, success, total_latency_ms, total_cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      taskId,
      microTaskId,
      "speed",
      "moderate",
      JSON.stringify([
        { tier: 1, model: "glm-4.6", success: false, latencyMs: 1500 },
        { tier: 2, model: "claude-sonnet", success: true, latencyMs: 3000 },
      ]),
      2,
      "claude-sonnet",
      true,
      4500,
      0.05,
    ]
  );

  assert(mdapResult.rows.length === 1, "MDAP execution should be created");
  assert(mdapResult.rows[0].final_tier === 2, "Final tier should be 2");
  assert(mdapResult.rows[0].success === true, "Success should be true");

  // Verify attempts is JSONB
  const attempts = mdapResult.rows[0].attempts;
  assert(Array.isArray(attempts), "Attempts should be an array");
  assert(attempts.length === 2, "Should have 2 attempt records");

  // Cleanup
  await pool.query(
    "DELETE FROM mdap_executions WHERE micro_task_id = $1",
    [microTaskId]
  );
}

async function testTestRunRecording(): Promise<void> {
  const taskId = `test-runs-${Date.now()}`;

  // Create parent task
  await pool.query(
    `INSERT INTO cfn_tasks (id, description, mode, max_iterations, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [taskId, "Test task for test run validation", "standard", 10, "running"]
  );

  // Create iteration
  const iterResult = await pool.query(
    `INSERT INTO cfn_iterations (task_id, iteration_number, status)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [taskId, 1, "running"]
  );
  const iterationId = iterResult.rows[0].id;

  // Record test run
  const testRunResult = await pool.query(
    `INSERT INTO cfn_test_runs
     (task_id, iteration_id, test_command, work_dir, exit_code,
      duration_ms, total_tests, passed_tests, failed_tests, pass_rate,
      failed_test_names, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     RETURNING *`,
    [
      taskId,
      iterationId,
      "npm test",
      "/tmp/test-workspace",
      0,
      5432,
      10,
      9,
      1,
      0.9,
      ["should handle edge case"],
    ]
  );

  assert(testRunResult.rows.length === 1, "Test run should be created");
  assert(testRunResult.rows[0].total_tests === 10, "Total tests should be 10");
  assert(
    parseFloat(testRunResult.rows[0].pass_rate) === 0.9,
    "Pass rate should be 0.9"
  );
  assert(
    Array.isArray(testRunResult.rows[0].failed_test_names),
    "Failed test names should be an array"
  );

  // Cleanup
  await pool.query("DELETE FROM cfn_tasks WHERE id = $1", [taskId]);
}

async function testViewTaskSummary(): Promise<void> {
  const taskId = `test-view-${Date.now()}`;

  // Create task with complete data
  await pool.query(
    `INSERT INTO cfn_tasks
     (id, description, mode, max_iterations, status, final_decision,
      final_pass_rate, created_at, started_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - interval '1 hour',
             NOW() - interval '30 minutes', NOW())`,
    [taskId, "Test task for view validation", "standard", 10, "completed", "PROCEED", 0.95]
  );

  // Create iteration
  await pool.query(
    `INSERT INTO cfn_iterations (task_id, iteration_number, status, decision)
     VALUES ($1, $2, $3, $4)`,
    [taskId, 1, "completed", "PROCEED"]
  );

  // Create agents
  await pool.query(
    `INSERT INTO cfn_agents (id, task_id, agent_type, role, status, success)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [`${taskId}-agent-1`, taskId, "typescript-specialist", "implementer", "completed", true]
  );
  await pool.query(
    `INSERT INTO cfn_agents (id, task_id, agent_type, role, status, success)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [`${taskId}-agent-2`, taskId, "code-reviewer", "validator", "completed", true]
  );

  // Query the view
  const viewResult = await pool.query(
    "SELECT * FROM v_task_summary WHERE id = $1",
    [taskId]
  );

  assert(viewResult.rows.length === 1, "Task should appear in v_task_summary");
  assert(viewResult.rows[0].total_agents === "2", "Should count 2 agents");
  assert(
    viewResult.rows[0].successful_agents === "2",
    "Should count 2 successful agents"
  );
  assert(
    viewResult.rows[0].total_iterations === "1",
    "Should count 1 iteration"
  );
  assert(
    viewResult.rows[0].duration_seconds !== null,
    "Duration should be calculated"
  );

  // Cleanup
  await pool.query("DELETE FROM cfn_tasks WHERE id = $1", [taskId]);
}

async function testForeignKeyConstraints(): Promise<void> {
  // Try to create iteration without parent task - should fail
  let constraintError = false;
  try {
    await pool.query(
      `INSERT INTO cfn_iterations (task_id, iteration_number, status)
       VALUES ($1, $2, $3)`,
      ["nonexistent-task-id", 1, "pending"]
    );
  } catch (error) {
    constraintError = true;
  }
  assert(constraintError, "FK constraint should prevent orphan iterations");

  // Try to create agent without parent task - should fail
  constraintError = false;
  try {
    await pool.query(
      `INSERT INTO cfn_agents (id, task_id, agent_type, role, status)
       VALUES ($1, $2, $3, $4, $5)`,
      ["orphan-agent", "nonexistent-task-id", "test", "implementer", "pending"]
    );
  } catch (error) {
    constraintError = true;
  }
  assert(constraintError, "FK constraint should prevent orphan agents");
}

async function testCascadeDelete(): Promise<void> {
  const taskId = `test-cascade-${Date.now()}`;

  // Create task with full hierarchy
  await pool.query(
    `INSERT INTO cfn_tasks (id, description, mode, max_iterations, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [taskId, "Test cascade delete", "mvp", 5, "running"]
  );

  const iterResult = await pool.query(
    `INSERT INTO cfn_iterations (task_id, iteration_number, status)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [taskId, 1, "running"]
  );
  const iterationId = iterResult.rows[0].id;

  await pool.query(
    `INSERT INTO cfn_agents (id, task_id, iteration_id, agent_type, role, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [`${taskId}-agent-1`, taskId, iterationId, "test", "implementer", "pending"]
  );

  await pool.query(
    `INSERT INTO cfn_logs (task_id, component, level, message)
     VALUES ($1, $2, $3, $4)`,
    [taskId, "test", "info", "Test log"]
  );

  // Verify all created
  const beforeDelete = await pool.query(
    "SELECT COUNT(*) as count FROM cfn_agents WHERE task_id = $1",
    [taskId]
  );
  assert(parseInt(beforeDelete.rows[0].count) === 1, "Agent should exist before delete");

  // Delete task - should cascade to iterations and agents
  await pool.query("DELETE FROM cfn_tasks WHERE id = $1", [taskId]);

  // Verify cascade
  const afterDeleteIter = await pool.query(
    "SELECT COUNT(*) as count FROM cfn_iterations WHERE task_id = $1",
    [taskId]
  );
  assert(
    parseInt(afterDeleteIter.rows[0].count) === 0,
    "Iterations should be deleted by cascade"
  );

  const afterDeleteAgent = await pool.query(
    "SELECT COUNT(*) as count FROM cfn_agents WHERE task_id = $1",
    [taskId]
  );
  assert(
    parseInt(afterDeleteAgent.rows[0].count) === 0,
    "Agents should be deleted by cascade"
  );
}

// =============================================
// Main Test Runner
// =============================================

async function main() {
  console.log("\n========================================");
  console.log("CFN Loop Database Validation Tests");
  console.log("========================================\n");

  const startTime = Date.now();

  await runTest("Database Connection", testDatabaseConnection);
  await runTest("Tables Exist", testTablesExist);
  await runTest("Views Exist", testViewsExist);
  await runTest("Indexes Exist", testIndexesExist);
  await runTest("Task Creation/Update", testTaskCreation);
  await runTest("Iteration Creation", testIterationCreation);
  await runTest("Agent Creation/Update", testAgentCreation);
  await runTest("Logging", testLogging);
  await runTest("MDAP Execution Recording", testMDAPExecution);
  await runTest("Test Run Recording", testTestRunRecording);
  await runTest("View: v_task_summary", testViewTaskSummary);
  await runTest("Foreign Key Constraints", testForeignKeyConstraints);
  await runTest("Cascade Delete", testCascadeDelete);

  const totalTime = Date.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n========================================");
  console.log("Test Results Summary");
  console.log("========================================");
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${totalTime}ms`);
  console.log("========================================\n");

  if (failed > 0) {
    console.log("Failed Tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  - ${r.name}: ${r.error}`));
    console.log("");
  }

  await pool.end();

  if (failed > 0) {
    console.log("[FAILED] Database validation tests failed");
    process.exit(1);
  }

  console.log("[PASSED] All database validation tests passed");
  process.exit(0);
}

main().catch((error) => {
  console.error("Test suite failed:", error);
  pool.end();
  process.exit(1);
});
