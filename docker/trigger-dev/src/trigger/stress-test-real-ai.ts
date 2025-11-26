/**
 * Real AI Stress Test - 100 Claude CLI Agents
 *
 * This task triggers 100 REAL AI agents that each:
 * 1. Spawn in their own Trigger.dev worker container
 * 2. Call npx @anthropic-ai/claude-code via execa
 * 3. Use Z.ai provider for cost efficiency
 * 4. Create actual TypeScript files
 *
 * NOTE: Trigger.dev v4 API change - batchTrigger() no longer returns runs array.
 * Use batch.retrieve(batchId) to get run IDs after triggering.
 */

import { task, tasks, runs, batch } from "@trigger.dev/sdk/v3";

interface StressTestPayload {
  agentCount: number;
  outputDir: string;
}

interface StressTestResult {
  totalAgents: number;
  triggered: number;
  completed: number;
  failed: number;
  duration: number;
  outputDir: string;
}

export const stressTestRealAI = task({
  id: "stress-test-real-ai",
  retry: { maxAttempts: 1 },
  run: async (payload: StressTestPayload): Promise<StressTestResult> => {
    const startTime = Date.now();
    const agentCount = payload.agentCount;

    console.log(`[Stress Test] Starting ${agentCount} REAL AI agents`);
    console.log(`[Stress Test] Each agent will spawn Claude CLI via execa`);
    console.log(`[Stress Test] Output: ${payload.outputDir}`);

    // Create payloads for all agents
    const taskPayloads: Array<{ payload: any }> = [];
    for (let i = 1; i <= agentCount; i++) {
      taskPayloads.push({
        payload: {
          testId: `agent-${i}`,
          outputDir: payload.outputDir,
          taskDescription: `Create a TypeScript file named agent-${i}.ts with a function that returns "Agent ${i} completed via Claude CLI"`,
        },
      });
    }

    console.log(`[Stress Test] Triggering ${taskPayloads.length} test-zai-agent tasks...`);

    // Batch trigger all tasks - v4 API returns batchId + runCount only
    const batchHandle = await tasks.batchTrigger("test-zai-agent", taskPayloads);

    console.log(`[Stress Test] Batch ID: ${batchHandle.batchId}`);
    console.log(`[Stress Test] Run count: ${batchHandle.runCount}`);

    // v4 API: Retrieve batch to get run IDs
    const batchDetails = await batch.retrieve(batchHandle.batchId);
    const runIds = batchDetails.runs; // Array<string> of run IDs

    console.log(`[Stress Test] Retrieved ${runIds.length} run IDs`);
    console.log(`[Stress Test] Waiting for completion...`);

    // Wait for all tasks to complete
    let completed = 0;
    let failed = 0;

    for (const runId of runIds) {
      try {
        // Poll each run by ID
        const result = await runs.poll(runId, { pollIntervalMs: 2000 });

        if ((result.output as any)?.success) {
          completed++;
        } else {
          failed++;
        }

        // Progress updates every 10 agents
        if ((completed + failed) % 10 === 0) {
          console.log(`[Progress] ${completed + failed}/${agentCount} (completed:${completed} failed:${failed})`);
        }
      } catch (error) {
        failed++;
        console.error(`[Error] Task ${runId} failed:`, error);
      }
    }

    const duration = Date.now() - startTime;

    console.log("");
    console.log("=".repeat(60));
    console.log("REAL AI STRESS TEST COMPLETE");
    console.log("=".repeat(60));
    console.log(`Total agents: ${agentCount}`);
    console.log(`Triggered: ${runIds.length}`);
    console.log(`Completed: ${completed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Duration: ${Math.round(duration / 1000)}s`);
    console.log(`Output: ${payload.outputDir}`);
    console.log("=".repeat(60));

    return {
      totalAgents: agentCount,
      triggered: runIds.length,
      completed,
      failed,
      duration,
      outputDir: payload.outputDir,
    };
  },
});
