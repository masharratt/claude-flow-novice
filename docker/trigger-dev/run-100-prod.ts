import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

async function run100AgentProductionTest() {
  console.log("=".repeat(70));
  console.log("100 AI AGENT PRODUCTION MODE STRESS TEST");
  console.log("Each task runs in its own Docker container");
  console.log("=".repeat(70));
  console.log("");

  // Configure with PRODUCTION Secret Key
  configure({
    secretKey: process.env.TRIGGER_SECRET_KEY || "tr_prod_UzJVaNMHDC3Y1pZ82lUd",
    baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
  });

  const outputDir = "/tmp/prod-stress-test-100";
  console.log(`Output directory: ${outputDir}`);
  console.log(`Environment: PRODUCTION (container-per-task)`);
  console.log(`Provider: Z.ai (cost-optimized)`);
  console.log("");

  const startTime = Date.now();

  console.log("Triggering stress-test-real-ai orchestrator in PRODUCTION...");
  const handle = await tasks.trigger("stress-test-real-ai", {
    agentCount: 100,
    outputDir,
  });

  console.log(`✓ Orchestrator triggered: ${handle.id}`);
  console.log(`  Monitor at: http://localhost:8030`);
  console.log(`  Watch containers: docker ps | grep trigger-run | wc -l`);
  console.log("");
  console.log("Waiting for completion...");
  console.log("");

  // Poll for completion
  const result = await runs.poll(handle.id, { pollIntervalMs: 5000 });

  const duration = Date.now() - startTime;

  console.log("");
  console.log("=".repeat(70));
  console.log("PRODUCTION TEST RESULTS");
  console.log("=".repeat(70));
  console.log(`Status: ${result.status}`);
  console.log(`Total Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`Output Directory: ${outputDir}`);
  console.log("");

  if (result.output) {
    console.log(`Total Agents: ${result.output.totalAgents ?? "N/A"}`);
    console.log(`Triggered: ${result.output.triggered ?? "N/A"}`);
    console.log(`Completed: ${result.output.completed ?? "N/A"}`);
    console.log(`Failed: ${result.output.failed ?? "N/A"}`);
    console.log(`Duration: ${result.output.duration ?? "N/A"}ms`);
  }

  console.log("=".repeat(70));
  console.log("");

  // Verify files
  console.log("Verifying output files...");
  const { execSync } = await import("child_process");

  try {
    const fileCount = execSync(`ls ${outputDir} 2>/dev/null | wc -l`, { encoding: "utf-8" }).trim();
    console.log(`✓ Files created: ${fileCount}`);

    if (parseInt(fileCount) === 100) {
      console.log("✅ SUCCESS: All 100 agents produced output files!");
    } else {
      console.log(`⚠️  Partial success: ${fileCount}/100 files`);
    }
  } catch (error) {
    console.log(`⚠️  Could not verify files`);
  }

  console.log("");
  console.log("Sample files:");
  try {
    const sampleFiles = execSync(`ls ${outputDir} 2>/dev/null | head -10`, { encoding: "utf-8" });
    console.log(sampleFiles);
  } catch (error) {
    console.log("No files found");
  }
}

run100AgentProductionTest().catch(console.error);
