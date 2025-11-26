// Trigger.dev v4 - Test Task Triggering with Secret Key
//
// IMPORTANT: Trigger.dev v4 uses two types of keys:
// - Personal Access Token (PAT): tr_pat_* - CLI and management (whoami, deploy, dev)
// - Secret Key: tr_dev_* or tr_prod_* - triggering tasks programmatically
//
// The PAT does NOT work when triggering tasks. You must use the Secret Key
// from the RuntimeEnvironment (found in webapp UI or database).
//
// Usage:
//   TRIGGER_SECRET_KEY=tr_dev_xxx npx tsx test-with-secret-key.ts

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

async function testTaskTrigger() {
  const secretKey = process.env.TRIGGER_SECRET_KEY;
  const apiUrl = process.env.TRIGGER_API_URL || "http://localhost:8030";

  if (!secretKey) {
    console.error("ERROR: TRIGGER_SECRET_KEY environment variable is required");
    console.error("");
    console.error("Get it from:");
    console.error("  1. Webapp UI: Project Settings > API Keys");
    console.error("  2. Database: SELECT \"apiKey\" FROM \"RuntimeEnvironment\" WHERE type='DEVELOPMENT'");
    console.error("");
    console.error("Example:");
    console.error("  TRIGGER_SECRET_KEY=tr_dev_xxx npx tsx test-with-secret-key.ts");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("Trigger.dev v4 - Task Trigger Test");
  console.log("=".repeat(60));
  console.log(`API URL: ${apiUrl}`);
  console.log(`Secret Key: ${secretKey.substring(0, 10)}...`);
  console.log("");

  // Configure SDK with secret key (NOT PAT)
  configure({
    secretKey: secretKey,
    baseURL: apiUrl,
  });

  console.log("SDK configured with secret key");
  console.log("");

  // Test 1: Simple hello-world task
  console.log("Test 1: Triggering hello-world task...");
  const outputPath = "/tmp/secret-key-test";

  try {
    const handle = await tasks.trigger("hello-world", {
      outputDir: outputPath,
      language: "en",
      greeting: "Hello from SDK with Secret Key!",
      progLang: "typescript",
      extension: "ts",
      agentType: "sdk-test",
    });

    console.log(`  Run ID: ${handle.id}`);
    console.log(`  Output: ${outputPath}`);
    console.log("");

    // Wait for completion using runs.poll()
    console.log("Waiting for task completion...");
    const result = await runs.poll(handle.id, { pollIntervalMs: 1000 });

    console.log("");
    console.log("=".repeat(60));
    console.log("RESULT");
    console.log("=".repeat(60));
    console.log(`Status: ${result.status}`);
    console.log(`Output: ${JSON.stringify(result.output, null, 2)}`);

    if (result.status === "COMPLETED") {
      console.log("");
      console.log("SUCCESS: Task completed!");
    } else {
      console.log("");
      console.log(`FAILED: Task status is ${result.status}`);
    }

  } catch (error: any) {
    console.error("ERROR:", error.message);
    if (error.status === 401) {
      console.error("");
      console.error("Authentication failed. Make sure you're using the Secret Key (tr_dev_*)");
      console.error("NOT the Personal Access Token (tr_pat_*)");
    }
    process.exit(1);
  }
}

testTaskTrigger();
