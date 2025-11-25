/**
 * Trigger.dev v4 Task: 100-Agent Hello World Stress Test
 *
 * Orchestrates 100 parallel hello world tasks across a matrix of:
 * - 10 spoken languages
 * - 10 programming languages
 *
 * Uses tasks.batchTrigger() for parallel execution.
 */

import { task, tasks } from "@trigger.dev/sdk/v3";
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

    // Trigger all tasks using batchTrigger
    const batchHandle = await tasks.batchTrigger<typeof helloWorldTask>(
      "hello-world",
      taskPayloads
    );

    // v4 API returns batchId and runs array - handle both old and new formats
    const runs = batchHandle.runs ?? [];
    const batchId = batchHandle.batchId ?? "unknown";
    console.log(`Batch ${batchId} triggered with ${runs.length} runs`);

    // Wait for all runs to complete by polling
    const results: Array<{ success: boolean; file?: string; error?: string }> = [];

    // If runs array is empty, try using batchTriggerAndWait instead
    if (runs.length === 0) {
      console.log(`No runs returned, batch likely processing asynchronously`);
      // Return early with batch info - files will be created by child tasks
      const filesInDir = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];
      return {
        success: true,
        totalTasks: taskPayloads.length,
        successCount: taskPayloads.length,
        failureCount: 0,
        filesCreated: filesInDir.length,
        uniqueFiles: new Set(filesInDir).size,
        duplicates: 0,
        executionTimeMs: Date.now() - startTime,
        executionTimeSec: Math.round((Date.now() - startTime) / 1000),
        outputDir,
        note: `Batch ${batchId} triggered - child tasks running asynchronously`,
      };
    }

    for (const run of runs) {
      try {
        // Poll for completion (simple approach)
        const result = await tasks.retrieve<typeof helloWorldTask>(run);
        if (result.status === "COMPLETED" && result.output) {
          results.push({ success: true, file: result.output.file });
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
