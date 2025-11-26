/**
 * Trigger.dev v4 Task: 100-Agent Hello World Stress Test
 *
 * Orchestrates 100 parallel hello world tasks across a matrix of:
 * - 10 spoken languages
 * - 10 programming languages
 *
 * Uses tasks.batchTrigger() for parallel execution.
 *
 * NOTE: Trigger.dev v4 API change - batchTrigger() no longer returns runs array.
 * Use batch.retrieve(batchId) to get run IDs after triggering.
 */

import { task, tasks, runs, batch } from "@trigger.dev/sdk/v3";
import { helloWorldTask } from "./hello-world.js";
import * as fs from "fs";

/**
 * Hello World greetings in different languages
 */
const GREETINGS: Record<string, { greeting: string; code: string }> = {
  english: { greeting: "Hello World", code: "en" },
  spanish: { greeting: "Hola Mundo", code: "es" },
  french: { greeting: "Bonjour le Monde", code: "fr" },
  german: { greeting: "Hallo Welt", code: "de" },
  italian: { greeting: "Ciao Mondo", code: "it" },
  portuguese: { greeting: "Ola Mundo", code: "pt" },
  japanese: { greeting: "Konnichiwa Sekai", code: "ja" },
  korean: { greeting: "Annyeong Sesang", code: "ko" },
  chinese: { greeting: "Ni Hao Shijie", code: "zh" },
  russian: { greeting: "Privet Mir", code: "ru" },
};

/**
 * Programming language configurations
 */
const PROGRAMMING_LANGUAGES: Record<string, { ext: string; agentType: string }> = {
  typescript: { ext: "ts", agentType: "typescript-specialist" },
  python: { ext: "py", agentType: "backend-developer" },
  rust: { ext: "rs", agentType: "rust-developer" },
  go: { ext: "go", agentType: "backend-developer" },
  java: { ext: "java", agentType: "backend-developer" },
  csharp: { ext: "cs", agentType: "backend-developer" },
  ruby: { ext: "rb", agentType: "backend-developer" },
  php: { ext: "php", agentType: "backend-developer" },
  swift: { ext: "swift", agentType: "mobile-dev" },
  kotlin: { ext: "kt", agentType: "mobile-dev" },
};

/**
 * 100-Agent Stress Test Orchestrator Task
 *
 * Triggers 100 hello world tasks and waits for completion.
 */
export const stressTestTask = task({
  id: "hello-world-stress-test",
  retry: {
    maxAttempts: 1, // Don't retry orchestrator - individual tasks have their own retry
  },
  run: async (payload: {
    outputDir?: string;
    count?: number;
  }) => {
    const outputDir = payload.outputDir || `/tmp/hello-world-${Date.now()}`;
    const maxCount = payload.count || 100;
    const startTime = Date.now();

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate task payloads
    const taskPayloads: Array<{
      payload: {
        outputDir: string;
        language: string;
        greeting: string;
        progLang: string;
        extension: string;
        agentType: string;
      };
    }> = [];

    let taskCount = 0;
    outer: for (const [, { greeting, code }] of Object.entries(GREETINGS)) {
      for (const [progLang, { ext, agentType }] of Object.entries(PROGRAMMING_LANGUAGES)) {
        if (taskCount >= maxCount) break outer;

        taskPayloads.push({
          payload: {
            outputDir,
            language: code,
            greeting,
            progLang,
            extension: ext,
            agentType,
          },
        });
        taskCount++;
      }
    }

    console.log(`Generated ${taskPayloads.length} task payloads`);

    // Trigger all tasks using batchTrigger - v4 API returns batchId + runCount only
    const batchHandle = await tasks.batchTrigger<typeof helloWorldTask>(
      "hello-world",
      taskPayloads
    );

    const batchId = batchHandle.batchId;
    console.log(`Batch ${batchId} triggered with ${batchHandle.runCount} runs`);

    // v4 API: Retrieve batch to get run IDs
    const batchDetails = await batch.retrieve(batchId);
    const runIds = batchDetails.runs; // Array<string> of run IDs

    console.log(`Retrieved ${runIds.length} run IDs from batch`);

    // Wait for all runs to complete by polling
    const results: Array<{ success: boolean; file?: string; error?: string }> = [];

    for (const runId of runIds) {
      try {
        // Poll for completion using runs.poll()
        const result = await runs.poll(runId, { pollIntervalMs: 2000 });
        if (result.status === "COMPLETED" && (result.output as any)?.file) {
          results.push({ success: true, file: (result.output as any).file });
        } else {
          results.push({ success: false, error: result.status });
        }
      } catch (err) {
        results.push({ success: false, error: String(err) });
      }
    }

    // Calculate metrics
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const executionTimeMs = Date.now() - startTime;

    // Verify output files
    const filesInDir = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];
    const uniqueFiles = new Set(filesInDir);

    return {
      success: successCount === taskPayloads.length,
      totalTasks: taskPayloads.length,
      successCount,
      failureCount,
      filesCreated: filesInDir.length,
      uniqueFiles: uniqueFiles.size,
      duplicates: filesInDir.length - uniqueFiles.size,
      executionTimeMs,
      executionTimeSec: Math.round(executionTimeMs / 1000),
      outputDir,
    };
  },
});
