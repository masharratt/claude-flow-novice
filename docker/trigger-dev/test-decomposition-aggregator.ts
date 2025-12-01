/**
 * Test script for cfn-decomposition-aggregator task
 *
 * Tests the 4-way decomposition swarm aggregator by triggering
 * all 4 specialized decomposers and merging their results.
 *
 * Usage:
 *   TRIGGER_SECRET_KEY=tr_dev_... npx tsx test-decomposition-aggregator.ts
 */

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

// Configure SDK (use dev environment secret key)
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY!,
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

async function testDecompositionAggregator() {
  const startTime = Date.now();

  console.log("=== Testing Decomposition Aggregator ===\n");

  const taskDescription = `
Implement a user authentication system with the following requirements:
- JWT-based authentication
- Password hashing with bcrypt
- Login and registration endpoints
- Token refresh mechanism
- Role-based access control (RBAC)
- Rate limiting on auth endpoints
- Secure password reset flow
- Email verification for new users
`.trim();

  console.log("Task Description:");
  console.log(taskDescription);
  console.log();

  try {
    // Trigger the aggregator task
    console.log("Triggering decomposition aggregator...");
    const handle = await tasks.trigger("cfn-decomposition-aggregator", {
      taskId: `test-decomp-${Date.now()}`,
      taskDescription,
      workDir: "/tmp/test-decomposition",
    });

    console.log(`Run ID: ${handle.id}`);
    console.log("Waiting for completion...\n");

    // Poll for completion
    const result = await runs.poll(handle.id, {
      pollIntervalMs: 2000,
    });

    const duration = Date.now() - startTime;

    console.log("\n=== Results ===");
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${duration}ms`);

    if (result.output) {
      const plan = result.output;

      console.log(`\nDecomposition Plan:`);
      console.log(`  Task ID: ${plan.taskId}`);
      console.log(`  Total Micro-Tasks: ${plan.totalEstimatedTasks}`);
      console.log(`  Execution Phases: ${plan.executionPhases.length}`);
      console.log(`  Security Risk Level: ${plan.swarmAnalysis.securityRiskLevel}`);

      console.log(`\nMicro-Tasks by Priority:`);
      const byPriority = {
        critical: plan.microTasks.filter((t) => t.priority === "critical"),
        high: plan.microTasks.filter((t) => t.priority === "high"),
        medium: plan.microTasks.filter((t) => t.priority === "medium"),
        low: plan.microTasks.filter((t) => t.priority === "low"),
      };

      console.log(`  Critical: ${byPriority.critical.length}`);
      console.log(`  High: ${byPriority.high.length}`);
      console.log(`  Medium: ${byPriority.medium.length}`);
      console.log(`  Low: ${byPriority.low.length}`);

      console.log(`\nSample Tasks:`);
      plan.microTasks.slice(0, 3).forEach((task, idx) => {
        console.log(`\n  ${idx + 1}. [${task.priority.toUpperCase()}] ${task.title}`);
        console.log(`     Perspectives: ${task.perspectives.map((p) => p.perspective).join(", ")}`);
        console.log(`     Effort: ${task.estimatedEffort}`);
      });

      console.log(`\nSwarm Analysis Summary:`);
      console.log(`  Architecture Recommendations: ${plan.swarmAnalysis.architectureRecommendations.length}`);
      console.log(`  Security Recommendations: ${plan.swarmAnalysis.securityRecommendations.length}`);
      console.log(`  Performance Recommendations: ${plan.swarmAnalysis.performanceRecommendations.length}`);
      console.log(`  Testing Recommendations: ${plan.swarmAnalysis.testingRecommendations.length}`);
      console.log(`  Coverage Goal: ${plan.swarmAnalysis.coverageGoal}%`);

      console.log(`\nExecution Phases:`);
      plan.executionPhases.forEach((phase) => {
        console.log(`  Phase ${phase.phase}: ${phase.parallelTasks.length} parallel tasks`);
      });

      console.log("\n✓ Test PASSED");
      console.log(`Total time: ${duration}ms`);
    } else {
      console.error("✗ No output from task");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n✗ Test FAILED");
    console.error((error as Error).message);
    process.exit(1);
  }
}

// Run test
testDecompositionAggregator();
