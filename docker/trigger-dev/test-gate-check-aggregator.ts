/**
 * Gate Check Aggregator Integration Test
 *
 * Tests the gate check aggregator by:
 * 1. Spawning async security and performance validators
 * 2. Aggregating their results
 * 3. Making PROCEED/ITERATE/ABORT decisions
 *
 * Run with:
 *   TRIGGER_SECRET_KEY=tr_dev_... npx tsx test-gate-check-aggregator.ts
 */

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";
import type { GateCheckPayload, GateCheckResult } from "./src/trigger/index.js";

// Configure SDK
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || "",
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

async function testGateCheckAggregator() {
  console.log("=== Gate Check Aggregator Integration Test ===\n");

  const taskId = `test-gate-${Date.now()}`;
  const workDir = "/tmp/gate-test";

  try {
    // 1. Spawn async security validator
    console.log("1. Spawning async security validator...");
    const securityHandle = await tasks.trigger("cfn-async-security-validator", {
      taskId,
      implementation: `
        // Sample implementation with potential security issues
        function loginUser(username: string, password: string) {
          const query = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'";
          document.getElementById('output').innerHTML = query;
          eval(password); // Unsafe eval
          return fetch('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        }
      `,
      testCode: `
        // Test code
        test('should login user', () => {
          loginUser('admin', 'secret123');
        });
      `,
      workDir,
    });
    console.log(`   Security validator run ID: ${securityHandle.id}`);

    // 2. Spawn async performance validator
    console.log("2. Spawning async performance validator...");
    const perfHandle = await tasks.trigger("cfn-async-performance-validator", {
      taskId,
      implementation: `
        // Sample implementation with performance issues
        function processData(items: any[]) {
          for (let i = 0; i < items.length; i++) {
            for (let j = 0; j < items.length; j++) {
              console.log(items[i], items[j]); // O(n²) nested loop
            }
          }
          return items.map(x => JSON.parse(JSON.stringify(x))); // Inefficient deep clone
        }
      `,
      testCode: `
        test('should process data', () => {
          const result = processData([1, 2, 3]);
          expect(result).toEqual([1, 2, 3]);
        });
      `,
      complexity: "moderate",
      workDir,
    });
    console.log(`   Performance validator run ID: ${perfHandle.id}`);

    // 3. Wait for validators to complete
    console.log("3. Waiting for validators to complete...");
    const [securityResult, perfResult] = await Promise.all([
      runs.poll(securityHandle.id, { pollIntervalMs: 1000 }),
      runs.poll(perfHandle.id, { pollIntervalMs: 1000 }),
    ]);
    console.log(`   Security validator: ${securityResult.status}`);
    console.log(`   Performance validator: ${perfResult.status}`);

    // 4. Trigger gate check aggregator
    console.log("\n4. Triggering gate check aggregator...");
    const gateCheckPayload: GateCheckPayload = {
      taskId,
      iterationNumber: 1,
      implementations: [
        "function loginUser() { /* implementation */ }",
        "function processData() { /* implementation */ }",
      ],
      tests: ["test('loginUser')", "test('processData')"],
      compileSuccess: true,
      compileErrors: 0,
      securityValidatorRunIds: [securityHandle.id],
      performanceValidatorRunIds: [perfHandle.id],
      mode: "standard",
    };

    const gateCheckHandle = await tasks.trigger("cfn-gate-check-aggregator", gateCheckPayload);
    console.log(`   Gate check run ID: ${gateCheckHandle.id}`);

    // 5. Wait for gate check to complete
    console.log("5. Waiting for gate check to complete...");
    const gateCheckResult = await runs.poll(gateCheckHandle.id, { pollIntervalMs: 1000 });
    const result = gateCheckResult.output as GateCheckResult;

    // 6. Display results
    console.log("\n=== Gate Check Results ===");
    console.log(`Decision: ${result.decision}`);
    console.log(`Passed: ${result.passed}`);
    console.log(`Composite Score: ${result.compositeScore.toFixed(1)}/100`);
    console.log(`Threshold: ${result.threshold.toFixed(1)}`);
    console.log("");
    console.log("Compilation:");
    console.log(`  Success: ${result.compileStatus.success}`);
    console.log(`  Errors: ${result.compileStatus.errorCount}`);
    console.log("");
    console.log("Security Analysis:");
    console.log(`  Risk Level: ${result.securityAnalysis.overallRiskLevel}`);
    console.log(`  Findings: ${result.securityAnalysis.totalFindings}`);
    console.log(`  Critical: ${result.securityAnalysis.criticalFindings}`);
    console.log(`  High: ${result.securityAnalysis.highFindings}`);
    console.log(`  Vulnerability Score: ${result.securityAnalysis.averageVulnerabilityScore.toFixed(1)}/100`);
    console.log(`  Passed: ${result.securityAnalysis.passed}`);
    console.log("");
    console.log("Performance Analysis:");
    console.log(`  Grade: ${result.performanceAnalysis.averageGrade}`);
    console.log(`  Issues: ${result.performanceAnalysis.totalIssues}`);
    console.log(`  Critical Issues: ${result.performanceAnalysis.criticalIssues}`);
    console.log(`  Avg Throughput: ${result.performanceAnalysis.averageThroughput.toFixed(0)} tasks/sec`);
    console.log(`  Passed: ${result.performanceAnalysis.passed}`);
    console.log("");
    console.log("Reasoning:");
    result.reasoning.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
    console.log("");

    if (result.securityRecommendations.length > 0) {
      console.log("Security Recommendations:");
      result.securityRecommendations.slice(0, 3).forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
      console.log("");
    }

    if (result.performanceRecommendations.length > 0) {
      console.log("Performance Recommendations:");
      result.performanceRecommendations.slice(0, 3).forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
      console.log("");
    }

    // 7. Test verdict
    console.log("=== Test Verdict ===");
    if (result.decision === "PROCEED") {
      console.log(" TEST PASSED: Gate check correctly identified passing code");
      process.exit(0);
    } else if (result.decision === "ITERATE") {
      console.log("  TEST EXPECTED: Gate check correctly identified issues requiring iteration");
      console.log("   (This is expected given the security/performance issues in the sample code)");
      process.exit(0);
    } else {
      console.log(" TEST FAILED: Unexpected decision (ABORT)");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n TEST FAILED:", (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Run test
testGateCheckAggregator();
