/**
 * MDAP Micro-Task Test
 *
 * Tests MDAP with ultra-fine-grained task decomposition using Z.ai GLM-4.5-air
 *
 * Scenario: Fix TypeScript errors in a simple file
 * - Decompose into atomic micro-tasks (one error per task)
 * - Use glm-4.5-air (ultra-fast) for tier 1
 * - Escalate to glm-4.6 on failures
 * - Track MDAP metrics
 */

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";
import * as fs from "fs/promises";
import * as path from "path";

// Configure SDK
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

// Test file with TypeScript errors
const TEST_FILE_CONTENT = `
// File with multiple TypeScript errors (each will be a micro-task)

interface User {
  id: number;
  name: string;
  email: string;
}

// Error 1: Missing return type
function getUser(id) {
  return { id, name: "John", email: "john@example.com" };
}

// Error 2: Wrong type assignment
const user: User = { id: "123", name: "Jane", email: "jane@example.com" };

// Error 3: Missing property
const partialUser: User = { id: 1, name: "Bob" };

// Error 4: Unused variable
const unusedVar = "test";

// Error 5: Any type usage
function process(data: any) {
  return data;
}
`;

/**
 * Micro-task decomposition: Break into atomic units
 * Each micro-task fixes ONE specific error
 */
const MICRO_TASKS = [
  {
    id: "micro-1",
    description: "Add return type annotation to getUser function",
    files: ["user.ts"],
    tests: [],
    estimatedComplexity: "simple",
  },
  {
    id: "micro-2",
    description: "Fix type mismatch: Change id from string to number in user assignment",
    files: ["user.ts"],
    tests: [],
    estimatedComplexity: "simple",
  },
  {
    id: "micro-3",
    description: "Add missing email property to partialUser",
    files: ["user.ts"],
    tests: [],
    estimatedComplexity: "simple",
  },
  {
    id: "micro-4",
    description: "Remove unused variable unusedVar or mark with underscore",
    files: ["user.ts"],
    tests: [],
    estimatedComplexity: "simple",
  },
  {
    id: "micro-5",
    description: "Replace 'any' type with proper type annotation in process function",
    files: ["user.ts"],
    tests: [],
    estimatedComplexity: "simple",
  },
];

async function runMDAPTest() {
  console.log("=".repeat(80));
  console.log("MDAP Micro-Task Decomposition Test");
  console.log("=".repeat(80));
  console.log(`Provider: Z.ai (glm-4.5-air for T1, glm-4.6 for T2+)`);
  console.log(`MDAP Mode: Enabled (atomic complexity, T1 start)`);
  console.log(`Total Micro-Tasks: ${MICRO_TASKS.length}`);
  console.log("=".repeat(80));

  const testStartTime = Date.now();

  // Create test directory
  const testDir = `/tmp/mdap-test-${Date.now()}`;
  await fs.mkdir(testDir, { recursive: true });

  // Write test file
  const testFile = path.join(testDir, "user.ts");
  await fs.writeFile(testFile, TEST_FILE_CONTENT);

  console.log(`\nTest directory: ${testDir}`);
  console.log(`Test file created: user.ts`);
  console.log(`\nStarting micro-task execution...`);
  console.log("-".repeat(80));

  const results = [];

  // Execute each micro-task sequentially (in real MDAP, these would be parallel)
  for (let i = 0; i < MICRO_TASKS.length; i++) {
    const microTask = MICRO_TASKS[i];
    const microStartTime = Date.now();

    console.log(`\n[${i + 1}/${MICRO_TASKS.length}] Micro-Task: ${microTask.id}`);
    console.log(`Description: ${microTask.description}`);
    console.log(`Complexity: ${microTask.estimatedComplexity}`);

    try {
      // Trigger implementer with MDAP enabled
      const handle = await tasks.trigger("cfn-implementer-v2", {
        taskId: `mdap-test-${Date.now()}`,
        agentId: `mdap-agent-${microTask.id}`,
        iterationId: 1,
        agentType: "typescript-specialist",
        taskDescription: microTask.description,
        workDir: testDir,
        files: microTask.files,
        tests: microTask.tests,
        provider: "zai",
        timeout: 120000, // 2 minutes per micro-task
        enableMDAP: true, // MDAP enabled
        complexityLevel: "simple", // Will be forced anyway
        modelTier: 1, // Start at T1 (glm-4.5-air)
        failureCount: 0, // First attempt
      });

      console.log(`Task triggered: ${handle.id}`);
      console.log(`Waiting for completion...`);

      // Poll for result
      const result = await runs.poll(handle.id, {
        pollIntervalMs: 2000,
        maxAttempts: 60, // 2 minutes
      });

      const microDuration = Date.now() - microStartTime;

      // Trigger.dev v4 SDK: Use isSuccess/isFailed instead of .ok
      // The poll() return type has: status, isSuccess, isFailed, isCompleted, output, error
      if (result.isSuccess) {
        const output = result.output as any;
        console.log(`✅ SUCCESS in ${(microDuration / 1000).toFixed(1)}s`);
        console.log(`   Confidence: ${((output?.confidence || 0) * 100).toFixed(1)}%`);
        console.log(`   Model: ${output?.mdap?.modelName || 'unknown'}`);
        console.log(`   Tier: T${output?.mdap?.modelTier || 1}`);
        console.log(`   Cost: $${output?.mdap?.estimatedCost?.toFixed(6) || '0.000000'}`);

        results.push({
          microTaskId: microTask.id,
          success: true,
          confidence: output?.confidence,
          durationMs: microDuration,
          tier: output?.mdap?.modelTier,
          model: output?.mdap?.modelName,
          cost: output?.mdap?.estimatedCost,
        });
      } else {
        // v4 SDK: error is an object with { message, name?, stackTrace? }
        const errorMessage = result.error?.message || result.status || 'Unknown error';
        console.log(`❌ FAILED in ${(microDuration / 1000).toFixed(1)}s`);
        console.log(`   Status: ${result.status}`);
        console.log(`   Error: ${errorMessage}`);

        results.push({
          microTaskId: microTask.id,
          success: false,
          durationMs: microDuration,
          error: errorMessage,
        });
      }
    } catch (error) {
      const microDuration = Date.now() - microStartTime;
      console.log(`❌ EXCEPTION in ${(microDuration / 1000).toFixed(1)}s`);
      console.log(`   Error: ${(error as Error).message}`);

      results.push({
        microTaskId: microTask.id,
        success: false,
        durationMs: microDuration,
        error: (error as Error).message,
      });
    }
  }

  const totalDuration = Date.now() - testStartTime;

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("MDAP Test Results Summary");
  console.log("=".repeat(80));

  const successCount = results.filter(r => r.success).length;
  const avgConfidence = results
    .filter(r => r.success && r.confidence)
    .reduce((sum, r) => sum + (r.confidence || 0), 0) / successCount || 0;
  const totalCost = results
    .filter(r => r.cost)
    .reduce((sum, r) => sum + (r.cost || 0), 0);
  const avgDuration = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;

  console.log(`Total Micro-Tasks: ${MICRO_TASKS.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${MICRO_TASKS.length - successCount}`);
  console.log(`Success Rate: ${((successCount / MICRO_TASKS.length) * 100).toFixed(1)}%`);
  console.log(`\nPerformance:`);
  console.log(`  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`  Avg Duration/Task: ${(avgDuration / 1000).toFixed(1)}s`);
  console.log(`  Avg Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  console.log(`  Total Cost: $${totalCost.toFixed(6)}`);
  console.log(`  Cost/Task: $${(totalCost / MICRO_TASKS.length).toFixed(6)}`);

  console.log(`\nModel Usage:`);
  const modelUsage = results
    .filter(r => r.model)
    .reduce((acc, r) => {
      acc[r.model!] = (acc[r.model!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  Object.entries(modelUsage).forEach(([model, count]) => {
    console.log(`  ${model}: ${count} tasks`);
  });

  console.log(`\nTier Distribution:`);
  const tierUsage = results
    .filter(r => r.tier)
    .reduce((acc, r) => {
      const tier = `T${r.tier}`;
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  Object.entries(tierUsage).forEach(([tier, count]) => {
    console.log(`  ${tier}: ${count} tasks`);
  });

  // Cleanup
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Test directory preserved: ${testDir}`);
  console.log(`Check user.ts for fixes applied`);
  console.log("=".repeat(80));
}

// Run test
runMDAPTest().catch(console.error);
