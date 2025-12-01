#!/usr/bin/env npx tsx
/**
 * POC Test Runner
 *
 * Triggers the test-claude-poc task via Trigger.dev SDK
 */

import { tasks } from "@trigger.dev/sdk/v3";

interface TestPayload {
  testId: string;
  outputDir: string;
}

async function main() {
  const testId = `poc-${Date.now()}`;
  const outputDir = "/tmp/cfn-poc-test";

  console.log("========================================");
  console.log("CFN Loop Integration POC Test");
  console.log("========================================");
  console.log(`Test ID: ${testId}`);
  console.log(`Output Dir: ${outputDir}`);
  console.log("");

  try {
    console.log("Triggering test-claude-poc task...");

    const handle = await tasks.trigger<{ payload: TestPayload }>(
      "test-claude-poc",
      { testId, outputDir }
    );

    console.log(`Task triggered with run ID: ${handle.id}`);
    console.log("");
    console.log("Waiting for completion...");

    // Poll for result
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;

      try {
        const result = await tasks.retrieve("test-claude-poc", handle.id);

        if (result.status === "COMPLETED") {
          console.log("");
          console.log("========================================");
          console.log("TEST COMPLETED");
          console.log("========================================");
          console.log(JSON.stringify(result.output, null, 2));
          process.exit(0);
        } else if (result.status === "FAILED") {
          console.error("");
          console.error("========================================");
          console.error("TEST FAILED");
          console.error("========================================");
          console.error(result.error);
          process.exit(1);
        }

        console.log(`  Status: ${result.status} (attempt ${attempts}/${maxAttempts})`);
      } catch (pollError) {
        console.log(`  Polling... (attempt ${attempts}/${maxAttempts})`);
      }
    }

    console.error("Timeout waiting for task completion");
    process.exit(1);
  } catch (error) {
    console.error("Error triggering task:", error);
    process.exit(1);
  }
}

main();
