/**
 * Test Coordinator Task
 *
 * A simple coordinator task that triggers the test-zai-agent task.
 * This allows us to test task triggering via the Trigger.dev UI or CLI.
 *
 * Trigger this via the UI at: http://localhost:8030
 *
 * NOTE: Trigger.dev v4 API - uses runs.poll() for polling task completion.
 */

import { task, tasks, runs } from "@trigger.dev/sdk/v3";
import type { testZaiAgentTask } from "./test-zai-agent.js";

interface TestCoordinatorPayload {
  testId?: string;
  outputDir?: string;
}

interface TestCoordinatorResult {
  success: boolean;
  agentResult: any;
  error?: string;
}

export const testCoordinatorTask = task({
  id: "test-coordinator",
  retry: { maxAttempts: 1 },
  run: async (payload: TestCoordinatorPayload): Promise<TestCoordinatorResult> => {
    const testId = payload.testId || "single-test";
    const outputDir = payload.outputDir || "/tmp/trigger-single-test";

    console.log(`[Test Coordinator] Triggering test-zai-agent task`);
    console.log(`[Test Coordinator] Test ID: ${testId}`);
    console.log(`[Test Coordinator] Output dir: ${outputDir}`);

    try {
      // Trigger the test-zai-agent task
      const handle = await tasks.trigger<typeof testZaiAgentTask>("test-zai-agent", {
        testId,
        outputDir,
      });

      console.log(`[Test Coordinator] Task triggered with run ID: ${handle.id}`);
      console.log(`[Test Coordinator] Waiting for completion...`);

      // Wait for the task to complete using v4 runs.poll() API
      const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });

      console.log(`[Test Coordinator] Task completed with status: ${result.status}`);

      return {
        success: result.status === "COMPLETED",
        agentResult: result.output,
      };
    } catch (error) {
      console.error(`[Test Coordinator] Error:`, error);
      return {
        success: false,
        agentResult: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
