/**
 * Test CFN Orchestrator in Dev Mode
 *
 * Tests the complete CFN Loop: Loop 3 → Gate → Loop 2 → Decision
 */

import { configure, tasks } from "@trigger.dev/sdk/v3";

// Configure SDK with dev mode secret key
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

async function main() {
  console.log("Testing CFN Orchestrator in dev mode...\n");

  const payload = {
    taskDescription: "Create a simple TypeScript utility function that adds two numbers",
    workDir: "/tmp/cfn-orchestrator-test",
    mode: "mvp" as const,
    testCommand: "echo 'Mock test: PASS'", // Simple mock test
    implementerAgents: ["typescript-specialist"],
    validatorAgents: ["code-reviewer"],
    provider: "zai" as const,
    _env: {
      ZAI_API_KEY: process.env.ZAI_API_KEY || "22f735783ea54c69a8e5d79b731eb4f4.gDXkwrMNlYcqE8mF",
      ZAI_BASE_URL: "https://api.z.ai/api/anthropic",
    },
  };

  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("\nTriggering cfn-orchestrator task...");

  try {
    const handle = await tasks.trigger("cfn-orchestrator", payload);
    console.log(`✓ Task triggered: ${handle.id}`);
    console.log("\nWaiting for completion (this may take several minutes)...\n");

    // Note: In dev mode, we can't easily poll without runs.poll()
    // For now, just show the run ID and let user check UI
    console.log("=".repeat(60));
    console.log("Run ID:", handle.id);
    console.log("Check status at: http://localhost:8030");
    console.log("=".repeat(60));

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
    process.exit(1);
  }
}

main().catch(console.error);
