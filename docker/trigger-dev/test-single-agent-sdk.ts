/**
 * Test Single Agent via Trigger.dev SDK
 *
 * Uses the Secret Key (not PAT) to programmatically trigger tasks.
 * Run with: TRIGGER_SECRET_KEY=tr_dev_ffR3mLELFuaaA0txq0lO npx tsx test-single-agent-sdk.ts
 */

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

// Configure with Secret Key
const secretKey = process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO";
const apiUrl = process.env.TRIGGER_API_URL || "http://localhost:8030";

console.log("=".repeat(60));
console.log("Single Agent Test via Trigger.dev SDK");
console.log("=".repeat(60));
console.log(`API URL: ${apiUrl}`);
console.log(`Secret Key: ${secretKey.substring(0, 10)}...`);
console.log("");

// Configure SDK
configure({
  secretKey,
  baseURL: apiUrl,
});

async function testSingleAgent(): Promise<void> {
  const testId = `sdk-test-${Date.now()}`;
  const outputDir = "/tmp/trigger-sdk-test";

  console.log(`[1/4] Triggering test-zai-agent task...`);
  console.log(`  Test ID: ${testId}`);
  console.log(`  Output Dir: ${outputDir}`);
  console.log("");

  try {
    // Trigger the task
    const handle = await tasks.trigger("test-zai-agent", {
      testId,
      outputDir,
    });

    console.log(`[2/4] Task triggered successfully!`);
    console.log(`  Run ID: ${handle.id}`);
    console.log("");

    console.log(`[3/4] Polling for completion (this may take 1-2 minutes)...`);
    const startTime = Date.now();

    // Poll for completion
    const result = await runs.poll(handle.id, {
      pollIntervalMs: 3000,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[4/4] Task completed!`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Duration: ${duration}s`);
    console.log("");

    if (result.status === "COMPLETED" && result.output) {
      const output = result.output as Record<string, unknown>;
      console.log("=".repeat(60));
      console.log("RESULT:");
      console.log("=".repeat(60));
      console.log(`  Success: ${output.success}`);
      console.log(`  File Created: ${output.fileCreated}`);
      console.log(`  File Path: ${output.filePath || "N/A"}`);
      console.log(`  CLI Exit Code: ${output.exitCode}`);
      console.log(`  Task Duration: ${output.duration}ms`);

      if (output.error) {
        console.log(`  Error: ${output.error}`);
      }

      if (output.fileContent) {
        console.log("");
        console.log("File Content (first 500 chars):");
        console.log("-".repeat(40));
        console.log(String(output.fileContent).substring(0, 500));
      }
    } else if (result.status === "FAILED") {
      console.log("=".repeat(60));
      console.log("TASK FAILED:");
      console.log("=".repeat(60));
      console.log(`  Error: ${JSON.stringify(result.error, null, 2)}`);
    }

    // Summary
    console.log("");
    console.log("=".repeat(60));
    if (result.status === "COMPLETED" && (result.output as any)?.success) {
      console.log("✅ TEST PASSED: Single agent executed successfully via Trigger.dev");
    } else {
      console.log("❌ TEST FAILED: See details above");
    }
    console.log("=".repeat(60));

  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
}

// Run test
testSingleAgent().catch(console.error);
