/**
 * CFN Test Runner Task - Usage Examples
 *
 * Demonstrates how to use the cfn-test-runner task in various scenarios
 * for CFN Loop gate checks and test orchestration.
 */

import { tasks } from "@trigger.dev/sdk/v3";
import type { TestRunnerPayload, TestRunnerResult } from "../src/trigger/cfn-test-runner";

// ============================================================================
// Example 1: Basic Usage - Run Default npm test
// ============================================================================

async function example1_BasicUsage() {
  console.log("=== Example 1: Basic npm test ===");

  const result = await tasks.trigger<typeof tasks.trigger>(
    "cfn-test-runner",
    {
      workDir: "/home/user/projects/myapp"
      // Uses default "npm test" command
    } as TestRunnerPayload
  );

  console.log(`Pass Rate: ${result.output.passRate}`);
  console.log(`Tests: ${result.output.passedTests}/${result.output.totalTests}`);
  console.log(`Framework: ${result.output.testFramework}`);
}

// ============================================================================
// Example 2: Custom Test Command
// ============================================================================

async function example2_CustomCommand() {
  console.log("=== Example 2: Custom test command ===");

  const commands = [
    { name: "Unit tests only", cmd: "npm run test:unit" },
    { name: "Integration tests", cmd: "npm run test:integration" },
    { name: "E2E tests", cmd: "npm run test:e2e" },
    { name: "TypeScript check", cmd: "npx tsc --noEmit" }
  ];

  for (const { name, cmd } of commands) {
    const result = await tasks.trigger<typeof tasks.trigger>(
      "cfn-test-runner",
      {
        workDir: "/home/user/projects/myapp",
        command: cmd
      } as TestRunnerPayload
    );

    console.log(`${name}: ${result.output.passRate}`);
  }
}

// ============================================================================
// Example 3: CFN Loop Gate Check - Standard Mode (95% threshold)
// ============================================================================

async function example3_StandardModeGateCheck(workDir: string) {
  console.log("=== Example 3: Standard Mode Gate Check ===");

  const STANDARD_MODE_THRESHOLD = 0.95;
  const ITERATE_THRESHOLD = STANDARD_MODE_THRESHOLD - 0.15; // 0.80

  const result = await tasks.trigger<typeof tasks.trigger>(
    "cfn-test-runner",
    {
      workDir,
      command: "npm test"
    } as TestRunnerPayload
  );

  const passRate = result.output.passRate;

  console.log(`Pass Rate: ${(passRate * 100).toFixed(2)}%`);
  console.log(`Threshold: ${(STANDARD_MODE_THRESHOLD * 100).toFixed(0)}%`);

  // Gate decision logic
  let decision: "PROCEED" | "ITERATE" | "ABORT";

  if (passRate >= STANDARD_MODE_THRESHOLD) {
    decision = "PROCEED"; // Go to Loop 2 validators
    console.log("Decision: PROCEED -> Move to Loop 2 validators");
  } else if (passRate >= ITERATE_THRESHOLD) {
    decision = "ITERATE"; // Run Loop 3 again
    console.log("Decision: ITERATE -> Run implementation loop again");
  } else {
    decision = "ABORT"; // Stop, too many failures
    console.log("Decision: ABORT -> Stop, too many failures");
  }

  return { passRate, decision, result };
}

// ============================================================================
// Example 4: Enterprise Mode Gate Check (98% threshold)
// ============================================================================

async function example4_EnterpriseModeGateCheck(workDir: string) {
  console.log("=== Example 4: Enterprise Mode Gate Check ===");

  const ENTERPRISE_THRESHOLD = 0.98;
  const ITERATE_THRESHOLD = ENTERPRISE_THRESHOLD - 0.13; // 0.85

  const result = await tasks.trigger<typeof tasks.trigger>(
    "cfn-test-runner",
    {
      workDir,
      command: "npm test"
    } as TestRunnerPayload
  );

  const passRate = result.output.passRate;

  if (passRate >= ENTERPRISE_THRESHOLD) {
    console.log("PROCEED: Enterprise-grade quality achieved");
    return "PROCEED";
  } else if (passRate >= ITERATE_THRESHOLD) {
    console.log("ITERATE: Very close to enterprise threshold");
    return "ITERATE";
  } else {
    console.log("ABORT: Below iteration threshold");
    return "ABORT";
  }
}

// ============================================================================
// Example 5: Multi-Phase Testing - Unit -> Integration -> E2E
// ============================================================================

async function example5_MultiPhaseGateCheck(workDir: string) {
  console.log("=== Example 5: Multi-Phase Testing ===");

  const phases = [
    { name: "Unit Tests", command: "npm run test:unit", required: true },
    { name: "Integration Tests", command: "npm run test:integration", required: true },
    { name: "E2E Tests", command: "npm run test:e2e", required: false }
  ];

  const results: Record<string, TestRunnerResult["output"]> = {};
  let allRequiredPassed = true;

  for (const phase of phases) {
    console.log(`\nRunning ${phase.name}...`);

    const result = await tasks.trigger<typeof tasks.trigger>(
      "cfn-test-runner",
      {
        workDir,
        command: phase.command
      } as TestRunnerPayload
    );

    results[phase.name] = result.output;

    const passRate = result.output.passRate;
    const status = passRate >= 0.95 ? "PASS" : "FAIL";

    console.log(`${phase.name}: ${(passRate * 100).toFixed(1)}% - ${status}`);

    if (phase.required && passRate < 0.95) {
      allRequiredPassed = false;
    }
  }

  // Summary report
  console.log("\n=== Phase Summary ===");
  for (const [phase, result] of Object.entries(results)) {
    console.log(
      `${phase}: ${result.passedTests}/${result.totalTests} ` +
      `(${(result.passRate * 100).toFixed(1)}%)`
    );
  }

  return allRequiredPassed ? "PROCEED" : "ITERATE";
}

// ============================================================================
// Example 6: TypeScript Compilation Check (tsc --noEmit)
// ============================================================================

async function example6_TypeScriptCheck(workDir: string) {
  console.log("=== Example 6: TypeScript Type Check ===");

  const result = await tasks.trigger<typeof tasks.trigger>(
    "cfn-test-runner",
    {
      workDir,
      command: "npx tsc --noEmit"
    } as TestRunnerPayload
  );

  if (result.output.passRate === 1.0) {
    console.log("Type Safety: PASS - No TypeScript errors");
    return true;
  } else {
    console.log("Type Safety: FAIL - TypeScript compilation errors present");
    // Show sample errors from output
    const lines = result.output.output.split("\n").slice(0, 5);
    console.log("Sample errors:");
    lines.forEach(line => console.log(`  ${line}`));
    return false;
  }
}

// ============================================================================
// Example 7: Framework Auto-Detection
// ============================================================================

async function example7_FrameworkDetection(workDir: string) {
  console.log("=== Example 7: Framework Auto-Detection ===");

  const result = await tasks.trigger<typeof tasks.trigger>(
    "cfn-test-runner",
    {
      workDir
      // No command specified - uses "npm test"
    } as TestRunnerPayload
  );

  console.log(`Detected Framework: ${result.output.testFramework}`);
  console.log(`Tests: ${result.output.passedTests}/${result.output.totalTests}`);

  if (result.output.metadata) {
    if (result.output.metadata.suites) {
      console.log(`Test Suites: ${result.output.metadata.suites}`);
    }
    if (result.output.metadata.skipped) {
      console.log(`Skipped: ${result.output.metadata.skipped}`);
    }
    if (result.output.metadata.pending) {
      console.log(`Pending: ${result.output.metadata.pending}`);
    }
  }

  return result.output;
}

// ============================================================================
// Example 8: Batch Testing Multiple Repositories
// ============================================================================

async function example8_BatchTesting(repositories: string[]) {
  console.log("=== Example 8: Batch Testing Multiple Repos ===");

  const results = await Promise.all(
    repositories.map((repo) =>
      tasks.trigger<typeof tasks.trigger>(
        "cfn-test-runner",
        {
          workDir: repo,
          command: "npm test"
        } as TestRunnerPayload
      )
    )
  );

  // Summary
  const summary = results.map((r, idx) => ({
    repo: repositories[idx],
    passRate: r.output.passRate,
    tests: r.output.totalTests,
    framework: r.output.testFramework
  }));

  console.table(summary);

  // Aggregate metrics
  const totalTests = summary.reduce((sum, s) => sum + s.tests, 0);
  const totalPass = summary.reduce((sum, s) => sum + s.tests * s.passRate, 0);
  const overallRate = totalPass / totalTests;

  console.log(`\nOverall Pass Rate: ${(overallRate * 100).toFixed(2)}%`);

  return summary;
}

// ============================================================================
// Example 9: Error Handling and Recovery
// ============================================================================

async function example9_ErrorHandling(workDir: string) {
  console.log("=== Example 9: Error Handling ===");

  try {
    const result = await tasks.trigger<typeof tasks.trigger>(
      "cfn-test-runner",
      {
        workDir,
        command: "npm test"
      } as TestRunnerPayload
    );

    if (!result.output.success) {
      console.log("Execution failed:");
      console.log(`  Error: ${result.output.error}`);
      console.log(`  Tests Found: ${result.output.totalTests}`);

      // Fallback: try alternative command
      if (result.output.totalTests === 0) {
        console.log("  No tests found, trying yarn...");

        const fallback = await tasks.trigger<typeof tasks.trigger>(
          "cfn-test-runner",
          {
            workDir,
            command: "yarn test"
          } as TestRunnerPayload
        );

        return fallback.output;
      }
    } else {
      console.log(`Success: ${result.output.passRate * 100}% pass rate`);
      return result.output;
    }
  } catch (error) {
    console.error("Fatal error:", error);
    // Re-throw or handle appropriately
    throw error;
  }
}

// ============================================================================
// Example 10: Reporting and Metrics
// ============================================================================

async function example10_Reporting(workDir: string) {
  console.log("=== Example 10: Test Reporting ===");

  const result = await tasks.trigger<typeof tasks.trigger>(
    "cfn-test-runner",
    {
      workDir,
      command: "npm test"
    } as TestRunnerPayload
  );

  const r = result.output;

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    workDir,
    framework: r.testFramework,
    executionTimeMs: r.duration,
    executionTimeSec: Math.round(r.duration / 1000),
    successRate: (r.passRate * 100).toFixed(2) + "%",
    statistics: {
      total: r.totalTests,
      passed: r.passedTests,
      failed: r.failedTests
    },
    metadata: r.metadata,
    gateStatus: r.passRate >= 0.95 ? "PASS" : "FAIL"
  };

  console.log("=== Test Report ===");
  console.log(JSON.stringify(report, null, 2));

  // Store or upload report
  return report;
}

// ============================================================================
// Example 11: Orchestration Pattern - Full CFN Loop
// ============================================================================

async function example11_FullOrchestration(workDir: string, maxIterations: number = 3) {
  console.log("=== Example 11: Full CFN Loop Orchestration ===");

  let iteration = 0;
  let passRate = 0;
  let decision: "PROCEED" | "ITERATE" | "ABORT" = "ITERATE";

  while (iteration < maxIterations && decision === "ITERATE") {
    iteration++;
    console.log(`\nIteration ${iteration}:`);

    // Run tests (Loop 3 would run implementation here)
    const result = await tasks.trigger<typeof tasks.trigger>(
      "cfn-test-runner",
      {
        workDir,
        command: "npm test"
      } as TestRunnerPayload
    );

    passRate = result.output.passRate;
    console.log(`  Pass Rate: ${(passRate * 100).toFixed(2)}%`);

    // Gate check (Standard mode: 95% threshold)
    const THRESHOLD = 0.95;
    const ITERATE_THRESHOLD = 0.80;

    if (passRate >= THRESHOLD) {
      decision = "PROCEED";
      console.log(`  Decision: PROCEED (>= ${(THRESHOLD * 100).toFixed(0)}%)`);
    } else if (passRate >= ITERATE_THRESHOLD) {
      decision = "ITERATE";
      console.log(`  Decision: ITERATE (${(ITERATE_THRESHOLD * 100).toFixed(0)}% - ${(THRESHOLD * 100).toFixed(0)}%)`);
    } else {
      decision = "ABORT";
      console.log(`  Decision: ABORT (< ${(ITERATE_THRESHOLD * 100).toFixed(0)}%)`);
    }
  }

  // Final result
  console.log("\n=== Orchestration Complete ===");
  console.log(`Total Iterations: ${iteration}`);
  console.log(`Final Pass Rate: ${(passRate * 100).toFixed(2)}%`);
  console.log(`Final Decision: ${decision}`);

  return { iteration, passRate, decision };
}

// ============================================================================
// Example 12: Performance Baseline
// ============================================================================

async function example12_PerformanceBaseline(workDir: string) {
  console.log("=== Example 12: Performance Baseline ===");

  const runs: number[] = [];

  for (let i = 1; i <= 3; i++) {
    console.log(`Run ${i}...`);

    const result = await tasks.trigger<typeof tasks.trigger>(
      "cfn-test-runner",
      {
        workDir,
        command: "npm test"
      } as TestRunnerPayload
    );

    runs.push(result.output.duration);
    console.log(`  Duration: ${result.output.duration}ms`);
  }

  // Calculate metrics
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  const min = Math.min(...runs);
  const max = Math.max(...runs);

  console.log("\n=== Performance Metrics ===");
  console.log(`Average: ${Math.round(avg)}ms`);
  console.log(`Min: ${min}ms`);
  console.log(`Max: ${max}ms`);
  console.log(`Variation: ${Math.round(((max - min) / avg) * 100)}%`);

  return { avg, min, max };
}

// ============================================================================
// Export all examples
// ============================================================================

export {
  example1_BasicUsage,
  example2_CustomCommand,
  example3_StandardModeGateCheck,
  example4_EnterpriseModeGateCheck,
  example5_MultiPhaseGateCheck,
  example6_TypeScriptCheck,
  example7_FrameworkDetection,
  example8_BatchTesting,
  example9_ErrorHandling,
  example10_Reporting,
  example11_FullOrchestration,
  example12_PerformanceBaseline
};

// ============================================================================
// Quick Reference
// ============================================================================

/**
 * QUICK START EXAMPLES
 *
 * 1. Basic usage:
 *    const result = await tasks.trigger("cfn-test-runner", {
 *      workDir: "/path/to/project"
 *    });
 *
 * 2. Custom command:
 *    const result = await tasks.trigger("cfn-test-runner", {
 *      workDir: "/path/to/project",
 *      command: "npm run test:integration"
 *    });
 *
 * 3. Gate check (95% threshold):
 *    if (result.output.passRate >= 0.95) {
 *      // PROCEED to validators
 *    } else {
 *      // ITERATE implementation
 *    }
 *
 * 4. TypeScript check:
 *    const result = await tasks.trigger("cfn-test-runner", {
 *      workDir: "/path/to/project",
 *      command: "npx tsc --noEmit"
 *    });
 */
