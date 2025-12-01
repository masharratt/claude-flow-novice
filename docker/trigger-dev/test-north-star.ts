/**
 * North Star Multi-Iteration Test
 *
 * Tests the full CFN Loop iteration cycle with gate checks and product owner decisions.
 * This validates that Trigger.dev can handle complex multi-iteration scenarios with real AI agents.
 *
 * Expected Flow:
 * 1. Iteration 1: Loop 3 implements → TDD gate check → FAIL (tests don't pass or missing) → ITERATE
 * 2. Iteration 2: Loop 3 fixes tests → TDD gate check → PASS → Loop 2 validators catch issues → Product Owner → ITERATE
 * 3. Iteration 3: Loop 3 fixes issues → TDD gate check → PASS → Loop 2 validates → Product Owner → PROCEED
 */

import { configure, tasks } from "@trigger.dev/sdk/v3";

configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("NORTH STAR MULTI-ITERATION TEST");
  console.log("=".repeat(80));
  console.log("Task: Create TypeScript validation library with TDD");
  console.log("Working Directory: /tmp/trigger-north-star-test/");
  console.log("Mode: standard (gate: 95%, consensus: 90%)");
  console.log("Max Iterations: 5");
  console.log("Provider: Z.ai");
  console.log("=".repeat(80) + "\n");

  const startTime = Date.now();

  try {
    console.log("[1/3] Triggering CFN Orchestrator...");
    const handle = await tasks.trigger("cfn-orchestrator", {
      taskDescription:
        "Create a TypeScript validation library with strict type safety, comprehensive error handling, JSDoc documentation, and 100% test coverage using Jest. Include input validation, custom error types, and async validators.",
      workDir: "/tmp/trigger-north-star-test",
      mode: "standard",
      testCommand: "npm test",
      implementerAgents: ["typescript-specialist"],
      validatorAgents: ["code-reviewer"],
      maxIterations: 5,
      provider: "zai",
      _env: {
        ZAI_API_KEY: process.env.ZAI_API_KEY || "22f735783ea54c69a8e5d79b731eb4f4.gDXkwrMNlYcqE8mF",
        ZAI_BASE_URL: "https://api.z.ai/api/anthropic",
      },
    });

    console.log(`\n✅ Orchestrator triggered successfully!`);
    console.log(`Run ID: ${handle.id}`);
    console.log(`\nMonitor execution at: http://localhost:8030/runs/${handle.id}`);
    console.log(`\nThis test uses REAL AI agents and will take several minutes to complete.`);
    console.log(`Watch the Trigger.dev UI for real-time progress.`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️  Trigger time: ${duration}s`);
    console.log("\n" + "=".repeat(80));
    console.log("TEST INITIATED - Monitor progress in Trigger.dev UI");
    console.log("=".repeat(80) + "\n");

    console.log("\nNext Steps:");
    console.log("1. Open http://localhost:8030/runs/" + handle.id);
    console.log("2. Watch for multiple iterations (expected: 2-3 iterations)");
    console.log("3. Verify gate checks between Loop 3 and Loop 2");
    console.log("4. Check final decision: PROCEED (success) or ABORT (failure)");
    console.log("5. Inspect files created in /tmp/trigger-north-star-test/");
    console.log("\nExpected Outcomes:");
    console.log("- Iteration 1: Gate FAIL → ITERATE (missing tests)");
    console.log("- Iteration 2: Gate PASS → Loop 2 → ITERATE (quality issues)");
    console.log("- Iteration 3: Gate PASS → Loop 2 → PROCEED (success)");
  } catch (error) {
    console.error("\n❌ Test failed to start:");
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
