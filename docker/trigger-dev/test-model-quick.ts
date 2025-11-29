/**
 * Quick test to verify model resolution
 */
import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

async function main() {
  console.log("Testing model resolution...");

  const handle = await tasks.trigger("cfn-implementer-v2", {
    taskId: "model-test-" + Date.now(),
    agentId: "test-agent",
    iterationId: 1,
    agentType: "typescript-specialist",
    taskDescription: "Create a simple test.txt file with hello world",
    workDir: "/tmp/model-test-" + Date.now(),
    files: [],
    tests: [],
    provider: "zai",
    timeout: 60000,
    enableMDAP: true,
    complexityLevel: "simple",
    modelTier: 1, // Haiku tier
    failureCount: 0,
  });

  console.log("Triggered run:", handle.id);

  // Wait for completion
  const result = (await runs.poll(handle.id, { pollIntervalMs: 3000 })) as any;
  console.log("Status:", result.status);

  if (result.output?.mdap) {
    console.log("===== MDAP INFO =====");
    console.log("Model Name:", result.output.mdap.modelName);
    console.log("Model Tier:", result.output.mdap.modelTier);
    console.log("Tier Name:", result.output.mdap.tierName);
  } else {
    console.log("No MDAP info in output");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
