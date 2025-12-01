import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

async function run100AgentTest() {
  console.log("=".repeat(70));
  console.log("100 AI AGENT STRESS TEST");
  console.log("=".repeat(70));
  console.log("");

  // Configure with Secret Key
  configure({
    secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
    baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
  });

  const outputDir = "/tmp/real-ai-stress-test-100";
  console.log(`Output directory: ${outputDir}`);
  console.log(`Provider: Z.ai (cost-optimized)`);
  console.log("");

  const startTime = Date.now();

  console.log("Triggering stress-test-real-ai orchestrator...");
  const handle = await tasks.trigger("stress-test-real-ai", {
    agentCount: 100,
    outputDir,
  });

  console.log(`✓ Orchestrator triggered: ${handle.id}`);
  console.log(`  Monitor at: http://localhost:8030`);
  console.log("");
  console.log("Waiting for completion (this may take several minutes)...");
  console.log("");

  // Poll for completion
  const result = await runs.poll(handle.id, { pollIntervalMs: 5000 });

  const duration = Date.now() - startTime;

  console.log("");
  console.log("=".repeat(70));
  console.log("TEST RESULTS");
  console.log("=".repeat(70));
  console.log(`Status: ${result.status}`);
  console.log(`Total Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`Output Directory: ${outputDir}`);
  console.log("");

  if (result.output) {
    console.log(`Agents Spawned: ${result.output.agentsSpawned ?? "N/A"}`);
    console.log(`Successful: ${result.output.successCount ?? "N/A"}`);
    console.log(`Failed: ${result.output.failureCount ?? "N/A"}`);
    console.log(`Orchestrator Duration: ${result.output.orchestratorDuration ?? "N/A"}ms`);
    console.log(`Child Tasks Duration: ${result.output.childTasksDuration ?? "N/A"}ms`);

    if (result.output.throughput) {
      console.log(`Throughput: ${result.output.throughput} agents/second`);
    }
  }

  console.log("=".repeat(70));
  console.log("");

  // Verify files
  console.log("Verifying output files...");
  const { execSync } = require("child_process");

  try {
    const fileCount = execSync(`ls ${outputDir} | wc -l`, { encoding: "utf-8" }).trim();
    console.log(`✓ Files created: ${fileCount}`);

    if (parseInt(fileCount) === 100) {
      console.log("✅ SUCCESS: All 100 agents produced output files!");
    } else {
      console.log(`⚠️  WARNING: Expected 100 files, found ${fileCount}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not verify files: ${error}`);
  }

  console.log("");
  console.log("Sample files:");
  try {
    const sampleFiles = execSync(`ls ${outputDir} | head -10`, { encoding: "utf-8" });
    console.log(sampleFiles);
  } catch (error) {
    console.log("Could not list sample files");
  }
}

run100AgentTest().catch(console.error);
