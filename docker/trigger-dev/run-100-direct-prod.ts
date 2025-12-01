/**
 * 100 AI Agents - Direct Batch Trigger (Production)
 *
 * NOTE: Trigger.dev v4 API change - batchTrigger() no longer returns runs array.
 * Use batch.retrieve(batchId) to get run IDs after triggering.
 */
import { configure, tasks, runs, batch } from "@trigger.dev/sdk/v3";

async function run100DirectProductionTest() {
  console.log("=".repeat(70));
  console.log("100 AI AGENTS - DIRECT BATCH TRIGGER (PRODUCTION)");
  console.log("Each agent runs in its own Docker container");
  console.log("=".repeat(70));
  console.log("");

  // Configure with PRODUCTION Secret Key
  configure({
    secretKey: process.env.TRIGGER_SECRET_KEY || "tr_prod_UzJVaNMHDC3Y1pZ82lUd",
    baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
  });

  const outputDir = "/tmp/prod-direct-100";
  console.log(`Output directory: ${outputDir}`);
  console.log(`Environment: PRODUCTION (container-per-task)`);
  console.log(`Provider: Z.ai`);
  console.log("");

  // Create payloads for 100 agents
  const payloads = [];
  for (let i = 1; i <= 100; i++) {
    payloads.push({
      payload: {
        testId: `agent-${i}`,
        outputDir,
      },
    });
  }

  const startTime = Date.now();

  console.log(`Triggering ${payloads.length} test-zai-agent tasks in batch...`);
  const batchHandle = await tasks.batchTrigger("test-zai-agent", payloads);

  console.log(`Batch triggered: ${batchHandle.batchId}`);
  console.log(`Run count: ${batchHandle.runCount}`);

  // v4 API: Retrieve batch to get run IDs
  const batchDetails = await batch.retrieve(batchHandle.batchId);
  const runIds = batchDetails.runs; // Array<string> of run IDs

  console.log(`Retrieved ${runIds.length} run IDs`);
  console.log(`Monitor at: http://localhost:8030`);
  console.log(`Watch containers: watch -n 1 "docker ps | grep runner- | wc -l"`);
  console.log("");
  console.log("Waiting for all tasks to complete...");
  console.log("");

  // Poll all runs
  let completed = 0;
  let failed = 0;

  for (const runId of runIds) {
    try {
      const result = await runs.poll(runId, { pollIntervalMs: 2000 });
      if (result.status === "COMPLETED") {
        completed++;
      } else {
        failed++;
      }

      // Progress updates every 10 agents
      if ((completed + failed) % 10 === 0) {
        console.log(`Progress: ${completed + failed}/100 (completed:${completed} failed:${failed})`);
      }
    } catch (error) {
      failed++;
      console.error(`Task ${runId} error`);
    }
  }

  const duration = Date.now() - startTime;

  console.log("");
  console.log("=".repeat(70));
  console.log("PRODUCTION TEST RESULTS");
  console.log("=".repeat(70));
  console.log(`Total Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`Completed: ${completed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((completed / 100) * 100).toFixed(1)}%`);
  console.log(`Output Directory: ${outputDir}`);
  console.log("=".repeat(70));
  console.log("");

  // Verify files
  const { execSync } = await import("child_process");
  try {
    const fileCount = execSync(`ls ${outputDir} 2>/dev/null | wc -l`, { encoding: "utf-8" }).trim();
    console.log(`Files created: ${fileCount}/100`);

    if (parseInt(fileCount) === 100) {
      console.log("SUCCESS: All 100 agents produced output files!");
    }
  } catch (error) {
    console.log(`Files check: See ${outputDir}`);
  }
}

run100DirectProductionTest().catch(console.error);
