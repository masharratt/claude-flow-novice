import { tasks } from "@trigger.dev/sdk/v3";

async function testSingleAgent() {
  console.log("Testing single AI agent via Trigger.dev...");
  console.log("");

  const outputPath = "/tmp/single-agent-test";

  console.log(`Triggering claude-agent task...`);
  console.log(`Output directory: ${outputPath}`);
  console.log("");

  const handle = await tasks.trigger("claude-agent", {
    prompt: "Create a simple hello.ts file with a greeting function that takes a name parameter",
    workDir: outputPath,
    provider: "zai",
    agentType: "typescript-specialist",
    timeout: 120000,
  });

  console.log(`✓ Task triggered: ${handle.id}`);
  console.log(`  Monitor at: http://localhost:8030`);
  console.log("");
  console.log("Waiting for completion...");

  const result = await tasks.retrieve(handle);

  console.log("");
  console.log("=".repeat(60));
  console.log("SINGLE AGENT TEST RESULT");
  console.log("=".repeat(60));
  console.log(`Status: ${result.status}`);
  console.log(`Success: ${result.output?.success ?? false}`);
  console.log(`Exit Code: ${result.output?.exitCode ?? "N/A"}`);
  console.log(`Duration: ${result.output?.duration ?? "N/A"}ms`);
  console.log(`Output Directory: ${outputPath}`);
  console.log("=".repeat(60));

  if (result.output?.stdout) {
    console.log("");
    console.log("STDOUT:");
    console.log(result.output.stdout);
  }

  if (result.output?.stderr) {
    console.log("");
    console.log("STDERR:");
    console.log(result.output.stderr);
  }
}

testSingleAgent().catch(console.error);
