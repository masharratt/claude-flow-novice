/**
 * 100 Agent Stress Test with Inline Environment Variables
 *
 * This bypasses the need for environment variable setup in the database
 * by passing the API keys directly in the task payload.
 */

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

// Configure SDK
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

const ZAI_API_KEY = process.env.ZAI_API_KEY;
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/anthropic";

if (!ZAI_API_KEY) {
  console.error("ERROR: ZAI_API_KEY environment variable is required");
  process.exit(1);
}

async function runStressTest() {
  const agentCount = parseInt(process.env.AGENT_COUNT || "100");
  const outputDir = process.env.OUTPUT_DIR || "/tmp/stress-test-100";

  console.log(`Starting stress test with ${agentCount} agents`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Using Z.ai API: ${ZAI_BASE_URL}`);

  const startTime = Date.now();

  // Build task payloads with env vars embedded
  const taskPayloads: Array<{ payload: any }> = [];
  for (let i = 1; i <= agentCount; i++) {
    taskPayloads.push({
      payload: {
        testId: `agent-${i}`,
        outputDir: outputDir,
        taskDescription: `Create a TypeScript file named agent-${i}.ts with a function that returns "Agent ${i} completed"`,
        // Pass env vars in payload to bypass container env issue
        _env: {
          ZAI_API_KEY: ZAI_API_KEY,
          ZAI_BASE_URL: ZAI_BASE_URL,
        },
      },
    });
  }

  console.log(`Triggering ${taskPayloads.length} test-zai-agent tasks...`);

  try {
    const batchHandle = await tasks.batchTrigger("test-zai-agent", taskPayloads);
    const runHandles = batchHandle.runs ?? [];

    console.log(`Batch ID: ${batchHandle.batchId}`);
    console.log(`Tasks triggered: ${runHandles.length}`);

    // Track completion
    let completed = 0;
    let failed = 0;

    console.log("Waiting for completion (polling every 5s)...");

    for (const runHandle of runHandles) {
      try {
        const result = await runs.poll(runHandle.id, { pollIntervalMs: 5000 });

        const output = result.output as { success?: boolean; error?: string } | undefined;
        if (output?.success) {
          completed++;
        } else {
          failed++;
          console.log(`[FAIL] ${runHandle.id}: ${output?.error || "Unknown error"}`);
        }

        // Progress every 10
        if ((completed + failed) % 10 === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`[Progress] ${completed + failed}/${agentCount} (OK:${completed} FAIL:${failed}) - ${elapsed}s elapsed`);
        }
      } catch (error) {
        failed++;
        console.error(`[ERROR] ${runHandle.id}:`, error);
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log("");
    console.log("=".repeat(60));
    console.log("STRESS TEST COMPLETE");
    console.log("=".repeat(60));
    console.log(`Total agents: ${agentCount}`);
    console.log(`Triggered: ${runHandles.length}`);
    console.log(`Completed: ${completed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success rate: ${Math.round(completed / agentCount * 100)}%`);
    console.log(`Duration: ${duration}s`);
    console.log(`Throughput: ${(agentCount / duration).toFixed(2)} agents/sec`);
    console.log("=".repeat(60));

  } catch (error) {
    console.error("Batch trigger failed:", error);
    process.exit(1);
  }
}

runStressTest();
