/**
 * Test Task Triggering via SDK
 *
 * Uses the Trigger.dev v4 SDK to trigger the test-zai-agent task.
 *
 * Run with:
 *   npx tsx test-trigger-task.ts
 */

import { tasks } from "@trigger.dev/sdk/v3";
import type { testZaiAgentTask } from "./src/trigger/test-zai-agent.js";

async function main() {
  console.log("Triggering test-zai-agent task...");
  console.log("API URL:", process.env.TRIGGER_API_URL);

  try {
    // Trigger the task
    const handle = await tasks.trigger<typeof testZaiAgentTask>("test-zai-agent", {
      testId: "single-test",
      outputDir: "/tmp/trigger-single-test",
    });

    console.log("\n✅ Task triggered successfully!");
    console.log("Run ID:", handle.id);
    console.log("\nWaiting for completion...");

    // Wait for the task to complete
    const result = await handle.poll();

    console.log("\n=== Task Result ===");
    console.log("Status:", result.status);
    console.log("Success:", result.output?.success);
    console.log("File created:", result.output?.fileCreated);
    console.log("File path:", result.output?.filePath);
    console.log("Duration:", result.output?.duration, "ms");

    if (result.output?.error) {
      console.error("Error:", result.output.error);
    }

    if (result.output?.cliOutput) {
      console.log("\n=== CLI Output (first 500 chars) ===");
      console.log(result.output.cliOutput.substring(0, 500));
    }

  } catch (error) {
    console.error("\n❌ Failed to trigger task:");
    console.error(error);
    process.exit(1);
  }
}

main();
