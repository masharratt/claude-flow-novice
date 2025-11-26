/**
 * Post-Edit Pipeline Integration Test
 *
 * Tests that implementer tasks run post-edit validation after file modifications.
 *
 * Expected Behavior:
 * 1. Trigger implementer task with post-edit enabled
 * 2. Task creates a TypeScript file with intentional syntax error
 * 3. Post-edit validation detects error and logs warning
 * 4. Task completes successfully (non-blocking validation)
 *
 * Usage:
 *   TRIGGER_SECRET_KEY=tr_dev_xxx npx tsx test-post-edit-integration.ts
 */

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";
import * as fs from "fs";
import * as path from "path";

// Configure SDK with Secret Key
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY!,
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

async function main() {
  console.log("=== Post-Edit Pipeline Integration Test ===\n");

  // Create test directory
  const testDir = "/tmp/test-post-edit-" + Date.now();
  fs.mkdirSync(testDir, { recursive: true });
  console.log(`Test directory: ${testDir}\n`);

  // Trigger implementer task with intentional error
  console.log("Triggering implementer task...");
  const handle = await tasks.trigger("cfn-implementer", {
    taskDescription: `Create a TypeScript file named 'test-syntax-error.ts' with the following code:

      export function hello() {
        console.log("Hello world")  // Missing semicolon (intentional error)
      }

      This file should trigger a post-edit validation warning.`,
    agentType: "typescript-specialist",
    workDir: testDir,
    iteration: 1,
    taskId: "test-post-edit-" + Date.now(),
    provider: "zai",
    enablePostEdit: true,
    postEditTimeout: 30000,
    _env: {
      ZAI_API_KEY: process.env.ZAI_API_KEY,
    },
  });

  console.log(`Task triggered: ${handle.id}\n`);

  // Wait for completion
  console.log("Waiting for task to complete...");
  const result = await runs.poll(handle.id, {
    pollIntervalMs: 2000,
  });

  console.log(`\nTask status: ${result.status}`);
  console.log(`Duration: ${result.costInCents}ms`);

  if (result.output) {
    const output = result.output as {
      success: boolean;
      agentType: string;
      filesModified: string[];
      output: string;
      duration: number;
      error?: string;
    };

    console.log(`\nResult:`);
    console.log(`- Success: ${output.success}`);
    console.log(`- Agent: ${output.agentType}`);
    console.log(`- Files modified: ${output.filesModified.length}`);
    console.log(`- Execution duration: ${output.duration}ms`);

    if (output.error) {
      console.log(`- Error: ${output.error}`);
    }

    if (output.filesModified.length > 0) {
      console.log(`\nModified files:`);
      for (const file of output.filesModified) {
        console.log(`  - ${file}`);

        // Check if file exists
        const filePath = path.join(testDir, file);
        if (fs.existsSync(filePath)) {
          console.log(`    ✓ File exists`);
          const content = fs.readFileSync(filePath, "utf-8");
          console.log(`    Content (first 200 chars):`);
          console.log(`    ${content.substring(0, 200)}`);
        } else {
          console.log(`    ✗ File not found`);
        }
      }
    }
  }

  console.log("\n=== Test Complete ===");
  console.log(`\nCheck logs for post-edit validation warnings.`);
  console.log(`Expected to see: "[Implementer] Running post-edit validation on X files"`);
  console.log(`Expected to see: "[Implementer] Validating <filename>..."`);
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
