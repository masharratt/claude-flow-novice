import { tasks } from "@trigger.dev/sdk/v3";

async function runStressTest() {
  console.log("===================================================================");
  console.log("TRIGGERING 100 REAL AI AGENTS VIA TRIGGER.DEV");
  console.log("===================================================================");
  console.log("");
  console.log("Each agent will:");
  console.log("  1. Run in its own Trigger.dev worker container");
  console.log("  2. Call: npx @anthropic-ai/claude-code via execa");
  console.log("  3. Use Z.ai provider routing");
  console.log("  4. Create a real TypeScript file");
  console.log("");
  console.log("Output: /tmp/real-ai-stress-test-100");
  console.log("Monitor: http://localhost:8030");
  console.log("");
  console.log("Starting in 3 seconds...");

  await new Promise(resolve => setTimeout(resolve, 3000));

  const startTime = Date.now();

  console.log("[TRIGGER] Calling tasks.trigger('stress-test-real-ai')...");

  const handle = await tasks.trigger("stress-test-real-ai", {
    agentCount: 100,
    outputDir: "/tmp/real-ai-stress-test-100",
  });

  console.log(`[SUCCESS] Triggered: ${handle.id}`);
  console.log(`[INFO] Monitor at: http://localhost:8030`);
  console.log("");
  console.log("The test is now running. You should see:");
  console.log("  - Docker Desktop showing 100+ containers spawning");
  console.log("  - Files appearing in /tmp/real-ai-stress-test-100/");
  console.log("");
  console.log("This script will now wait for completion...");
  console.log("");

  // Wait for completion
  const result = await tasks.retrieve(handle);

  const duration = Date.now() - startTime;

  console.log("");
  console.log("===================================================================");
  console.log("TEST COMPLETE");
  console.log("===================================================================");
  console.log(`Status: ${result.status}`);
  console.log(`Duration: ${Math.round(duration / 1000)}s`);
  console.log(`Output: ${result.output}`);
  console.log("===================================================================");
}

runStressTest().catch(console.error);
