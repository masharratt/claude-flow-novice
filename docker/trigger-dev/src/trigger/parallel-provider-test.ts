/**
 * Parallel Provider Test Task
 *
 * Tests spawning multiple Claude Code CLI agents in parallel
 * with different provider configurations.
 */

import { task, tasks } from "@trigger.dev/sdk/v3";
import type { AIProvider, ClaudeAgentPayload, ClaudeAgentResult } from "./claude-agent.js";

/**
 * Test payload for parallel provider test
 */
interface ParallelProviderPayload {
  testId: string;
  /** Providers to test in parallel */
  providers: AIProvider[];
  /** Working directory for all agents */
  workDir: string;
  /** Timeout per agent in ms (default 2 minutes) */
  timeout?: number;
}

/**
 * Individual provider result
 */
interface ProviderResult {
  provider: AIProvider;
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
}

/**
 * Aggregated test results
 */
interface ParallelProviderResult {
  testId: string;
  totalDuration: number;
  successCount: number;
  failCount: number;
  results: ProviderResult[];
}

/**
 * Parallel Provider Test Task
 *
 * This task:
 * 1. Spawns multiple claude-agent tasks in parallel
 * 2. Each uses a different provider (zai, kimi, anthropic, etc.)
 * 3. Aggregates results and reports success/failure per provider
 */
export const parallelProviderTestTask = task({
  id: "parallel-provider-test",
  retry: { maxAttempts: 1 },
  run: async (payload: ParallelProviderPayload): Promise<ParallelProviderResult> => {
    const startTime = Date.now();
    const timeout = payload.timeout ?? 120000;

    console.log(`[Parallel Test] Starting test ${payload.testId}`);
    console.log(`[Parallel Test] Providers: ${payload.providers.join(", ")}`);
    console.log(`[Parallel Test] Work dir: ${payload.workDir}`);

    // Build payloads for each provider
    const agentPayloads: (ClaudeAgentPayload & { provider: AIProvider })[] = payload.providers.map(
      (provider) => ({
        prompt: `Create a simple TypeScript file that exports a function returning the string "${provider} provider test". Save it to ${payload.workDir}/${provider}-test.ts`,
        workDir: payload.workDir,
        agentType: "typescript-specialist",
        timeout,
        provider,
        skipPermissions: true,
      })
    );

    // Trigger all agents in parallel
    console.log(`[Parallel Test] Triggering ${agentPayloads.length} agents in parallel...`);

    const handles = await Promise.all(
      agentPayloads.map((p) =>
        tasks.trigger<{ payload: ClaudeAgentPayload }>("claude-agent", p)
      )
    );

    console.log(`[Parallel Test] All agents triggered, waiting for completion...`);

    // Wait for all to complete (with individual timeouts)
    const results: ProviderResult[] = [];

    for (let i = 0; i < handles.length; i++) {
      const handle = handles[i];
      const provider = payload.providers[i];
      const providerStartTime = Date.now();

      try {
        // Poll for result
        let attempts = 0;
        const maxAttempts = Math.ceil(timeout / 5000);

        while (attempts < maxAttempts) {
          const runResult = await tasks.retrieve<{ payload: ClaudeAgentPayload }>(
            "claude-agent",
            handle.id
          );

          if (runResult.status === "COMPLETED") {
            const output = runResult.output as ClaudeAgentResult;
            results.push({
              provider,
              success: output.success,
              duration: Date.now() - providerStartTime,
              output: output.output?.slice(0, 500),
              error: output.error,
            });
            console.log(`[Parallel Test] ${provider}: ${output.success ? "SUCCESS" : "FAILED"}`);
            break;
          } else if (runResult.status === "FAILED") {
            results.push({
              provider,
              success: false,
              duration: Date.now() - providerStartTime,
              error: String(runResult.error || "Task failed"),
            });
            console.log(`[Parallel Test] ${provider}: FAILED - ${runResult.error}`);
            break;
          }

          await new Promise((r) => setTimeout(r, 5000));
          attempts++;
        }

        // Timeout
        if (results.length <= i) {
          results.push({
            provider,
            success: false,
            duration: Date.now() - providerStartTime,
            error: "Timeout waiting for result",
          });
          console.log(`[Parallel Test] ${provider}: TIMEOUT`);
        }
      } catch (err) {
        results.push({
          provider,
          success: false,
          duration: Date.now() - providerStartTime,
          error: err instanceof Error ? err.message : String(err),
        });
        console.log(`[Parallel Test] ${provider}: ERROR - ${err}`);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`[Parallel Test] Complete: ${successCount}/${results.length} succeeded`);

    return {
      testId: payload.testId,
      totalDuration: Date.now() - startTime,
      successCount,
      failCount,
      results,
    };
  },
});
