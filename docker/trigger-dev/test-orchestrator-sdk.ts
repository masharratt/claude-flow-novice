/**
 * Test CFN Orchestrator via Trigger.dev SDK
 *
 * Tests the full CFN Loop: Loop 3 (implementers) -> Gate Check -> Loop 2 (validators) -> Decision
 *
 * Run with: TRIGGER_SECRET_KEY=tr_dev_ffR3mLELFuaaA0txq0lO npx tsx test-orchestrator-sdk.ts
 */

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";
import * as fs from "fs";

// Configure with Secret Key
const secretKey = process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO";
const apiUrl = process.env.TRIGGER_API_URL || "http://localhost:8030";

console.log("=".repeat(70));
console.log("CFN Orchestrator Test via Trigger.dev SDK");
console.log("=".repeat(70));
console.log(`API URL: ${apiUrl}`);
console.log(`Secret Key: ${secretKey.substring(0, 10)}...`);
console.log("");

// Configure SDK
configure({
  secretKey,
  baseURL: apiUrl,
});

async function testOrchestrator(): Promise<void> {
  const workDir = "/tmp/cfn-orchestrator-test";
  const taskId = `orch-test-${Date.now()}`;

  // Create work directory
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }

  // Create a simple package.json for test command
  fs.writeFileSync(`${workDir}/package.json`, JSON.stringify({
    name: "cfn-test",
    version: "1.0.0",
    scripts: {
      test: "echo 'All tests pass' && exit 0"
    }
  }, null, 2));

  console.log(`[1/4] Triggering cfn-orchestrator task...`);
  console.log(`  Task ID: ${taskId}`);
  console.log(`  Work Dir: ${workDir}`);
  console.log(`  Mode: mvp (fastest, lowest thresholds)`);
  console.log("");

  const payload = {
    taskDescription: `Create a simple TypeScript utility file at ${workDir}/hello-cfn.ts that exports a function returning "Hello from CFN Loop". Use minimal code.`,
    workDir,
    mode: "mvp" as const,
    testCommand: "npm test",
    // Use only 1 implementer and 1 validator to reduce time
    implementerAgents: ["typescript-specialist"],
    validatorAgents: ["code-reviewer"],
    provider: "zai" as const,
  };

  console.log(`Payload:`);
  console.log(JSON.stringify(payload, null, 2));
  console.log("");

  try {
    // Trigger the orchestrator
    const handle = await tasks.trigger("cfn-orchestrator", payload);

    console.log(`[2/4] Orchestrator triggered successfully!`);
    console.log(`  Run ID: ${handle.id}`);
    console.log("");

    console.log(`[3/4] Polling for completion...`);
    console.log(`  This may take 5-10 minutes (Loop 3 + Gate + Loop 2 + Decision)`);
    console.log(`  Polling every 10 seconds...`);
    console.log("");

    const startTime = Date.now();
    let lastLog = startTime;

    // Poll for completion with progress updates
    const result = await runs.poll(handle.id, {
      pollIntervalMs: 10000,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[4/4] Orchestrator completed!`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Total Duration: ${duration}s`);
    console.log("");

    if (result.status === "COMPLETED" && result.output) {
      const output = result.output as Record<string, unknown>;
      console.log("=".repeat(70));
      console.log("ORCHESTRATOR RESULT:");
      console.log("=".repeat(70));
      console.log(`  Decision: ${output.decision}`);
      console.log(`  Iterations: ${output.iterations}`);
      console.log(`  Mode: ${output.mode}`);
      console.log(`  Final Pass Rate: ${((output.finalPassRate as number) * 100).toFixed(2)}%`);
      console.log(`  Final Consensus: ${((output.finalConsensus as number) * 100).toFixed(2)}%`);
      console.log(`  Files Modified: ${(output.filesModified as string[])?.length || 0}`);
      console.log(`  Duration: ${output.duration}ms`);

      if (output.error) {
        console.log(`  Error: ${output.error}`);
      }

      // Show iteration logs
      if (output.iterationLogs && Array.isArray(output.iterationLogs)) {
        console.log("");
        console.log("Iteration Logs (last 20):");
        console.log("-".repeat(50));
        const logs = output.iterationLogs as string[];
        logs.slice(-20).forEach(log => console.log(`  ${log}`));
      }

      // Check if files were created
      console.log("");
      console.log("Files in work directory:");
      console.log("-".repeat(50));
      if (fs.existsSync(workDir)) {
        const files = fs.readdirSync(workDir);
        files.forEach(f => {
          const stat = fs.statSync(`${workDir}/${f}`);
          console.log(`  ${f} (${stat.size} bytes)`);
        });
      }

    } else if (result.status === "FAILED") {
      console.log("=".repeat(70));
      console.log("ORCHESTRATOR FAILED:");
      console.log("=".repeat(70));
      console.log(`  Error: ${JSON.stringify(result.error, null, 2)}`);
    }

    // Summary
    console.log("");
    console.log("=".repeat(70));
    const decision = (result.output as any)?.decision;
    if (result.status === "COMPLETED" && decision === "PROCEED") {
      console.log("✅ TEST PASSED: CFN Loop completed with PROCEED decision");
    } else if (result.status === "COMPLETED" && decision === "ITERATE") {
      console.log("⚠️ TEST PARTIAL: CFN Loop completed but needs more iterations");
    } else if (result.status === "COMPLETED" && decision === "ABORT") {
      console.log("❌ TEST FAILED: CFN Loop aborted after max iterations");
    } else {
      console.log("❌ TEST FAILED: See details above");
    }
    console.log("=".repeat(70));

  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
}

// Run test
testOrchestrator().catch(console.error);
