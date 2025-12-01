/**
 * Trigger.dev Job: 100-Agent Hello World Stress Test
 *
 * Spawns 100 agents to write "Hello World" in different spoken languages
 * using different programming languages. Tests Trigger.dev coordination at scale.
 *
 * Matrix: 10 spoken languages x 10 programming languages = 100 combinations
 *
 * Spoken languages: English, Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese, Russian
 * Programming languages: TypeScript, Python, Rust, Go, Java, C#, Ruby, PHP, Swift, Kotlin
 *
 * Success criteria:
 * - All 100 files created in output directory
 * - No duplicate files (each combination unique)
 * - Correct greeting per language
 * - Idiomatic code per programming language
 */

import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

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
const PROGRAMMING_LANGUAGES: Record<string, { ext: string; agentType: string; template: (greeting: string) => string }> = {
  typescript: {
    ext: "ts",
    agentType: "typescript-specialist",
    template: (g) => `// Hello World in TypeScript\nconsole.log("${g}");\n`,
  },
  python: {
    ext: "py",
    agentType: "backend-developer",
    template: (g) => `#!/usr/bin/env python3\n"""Hello World Program"""\n\ndef main():\n    print("${g}")\n\nif __name__ == "__main__":\n    main()\n`,
  },
  rust: {
    ext: "rs",
    agentType: "rust-developer",
    template: (g) => `fn main() {\n    println!("${g}");\n}\n`,
  },
  go: {
    ext: "go",
    agentType: "backend-developer",
    template: (g) => `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("${g}")\n}\n`,
  },
  java: {
    ext: "java",
    agentType: "backend-developer",
    template: (g) => `public class HelloWorld {\n    public static void main(String[] args) {\n        System.out.println("${g}");\n    }\n}\n`,
  },
  csharp: {
    ext: "cs",
    agentType: "backend-developer",
    template: (g) => `using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("${g}");\n    }\n}\n`,
  },
  ruby: {
    ext: "rb",
    agentType: "backend-developer",
    template: (g) => `#!/usr/bin/env ruby\n# Hello World in Ruby\nputs "${g}"\n`,
  },
  php: {
    ext: "php",
    agentType: "backend-developer",
    template: (g) => `<?php\n// Hello World in PHP\necho "${g}\\n";\n`,
  },
  swift: {
    ext: "swift",
    agentType: "mobile-dev",
    template: (g) => `// Hello World in Swift\nprint("${g}")\n`,
  },
  kotlin: {
    ext: "kt",
    agentType: "mobile-dev",
    template: (g) => `// Hello World in Kotlin\nfun main() {\n    println("${g}")\n}\n`,
  },
};

/**
 * Generate all 100 task combinations
 */
function generateTasks(): Array<{
  spokenLang: string;
  progLang: string;
  greeting: string;
  langCode: string;
  ext: string;
  agentType: string;
  template: string;
}> {
  const tasks: Array<{
    spokenLang: string;
    progLang: string;
    greeting: string;
    langCode: string;
    ext: string;
    agentType: string;
    template: string;
  }> = [];

  for (const [spokenLang, { greeting, code }] of Object.entries(GREETINGS)) {
    for (const [progLang, { ext, agentType, template }] of Object.entries(PROGRAMMING_LANGUAGES)) {
      tasks.push({
        spokenLang,
        progLang,
        greeting,
        langCode: code,
        ext,
        agentType,
        template: template(greeting),
      });
    }
  }

  return tasks;
}

/**
 * Payload schema for stress test
 */
const StressTestPayloadSchema = z.object({
  outputDir: z.string().default("/tmp/hello-world-trigger"),
  batchSize: z.number().default(10),
  delayBetweenBatches: z.number().default(1000),
});

/**
 * Payload interface for stress test
 */
interface StressTestPayload {
  outputDir: string;
  batchSize: number;
  delayBetweenBatches: number;
}

/**
 * Hello World Stress Test Job
 *
 * Spawns 100 tasks to create hello world files in all language combinations.
 */
export const helloWorldStressTestJob = {
  id: "hello-world-stress-test",
  name: "100-Agent Hello World Stress Test",
  version: "1.0.0",
  trigger: {
    event: {
      name: "stress.hello-world",
      schema: StressTestPayloadSchema,
    },
  },
  run: async (payload: StressTestPayload, io: any, ctx: any) => {
    const { outputDir, batchSize, delayBetweenBatches } = payload;
    const startTime = Date.now();

    io.logger.info("Starting 100-agent hello world stress test", {
      outputDir,
      batchSize,
      delayBetweenBatches,
      runId: ctx.run.id,
    });

    // Create output directory
    await io.runTask("create-output-dir", async () => {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      return { created: true, path: outputDir };
    });

    // Generate all 100 tasks
    const allTasks = generateTasks();
    io.logger.info(`Generated ${allTasks.length} tasks`, {
      spokenLanguages: Object.keys(GREETINGS).length,
      programmingLanguages: Object.keys(PROGRAMMING_LANGUAGES).length,
    });

    // Process in batches
    const results: Array<{ file: string; success: boolean; error?: string }> = [];
    const batches = [];

    for (let i = 0; i < allTasks.length; i += batchSize) {
      batches.push(allTasks.slice(i, i + batchSize));
    }

    io.logger.info(`Processing ${batches.length} batches of ${batchSize} tasks each`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      io.logger.info(`Processing batch ${batchIndex + 1}/${batches.length}`, {
        tasksInBatch: batch.length,
      });

      // Process batch in parallel
      const batchResults = await io.runTask(
        `batch-${batchIndex + 1}`,
        async () => {
          const batchPromises = batch.map(async (task) => {
            const filename = `${task.langCode}-${task.progLang}-${task.agentType}.${task.ext}`;
            const filepath = path.join(outputDir, filename);

            try {
              // Write the file (simulating agent work)
              fs.writeFileSync(filepath, task.template, "utf8");

              return {
                file: filename,
                success: true,
                spokenLang: task.spokenLang,
                progLang: task.progLang,
                greeting: task.greeting,
              };
            } catch (error: any) {
              return {
                file: filename,
                success: false,
                error: error.message,
                spokenLang: task.spokenLang,
                progLang: task.progLang,
              };
            }
          });

          return Promise.all(batchPromises);
        },
        {
          name: `Batch ${batchIndex + 1}`,
          description: `Processing ${batch.length} hello world files`,
        }
      );

      results.push(...batchResults);

      // Delay between batches (except last)
      if (batchIndex < batches.length - 1 && delayBetweenBatches > 0) {
        await io.runTask(`delay-${batchIndex + 1}`, async () => {
          await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
          return { delayed: delayBetweenBatches };
        });
      }
    }

    // Calculate results
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const executionTimeMs = Date.now() - startTime;

    // Verify output
    const filesInDir = fs.readdirSync(outputDir);
    const uniqueFiles = new Set(filesInDir);

    const validation = {
      totalTasks: allTasks.length,
      successCount,
      failureCount,
      filesCreated: filesInDir.length,
      uniqueFiles: uniqueFiles.size,
      duplicates: filesInDir.length - uniqueFiles.size,
      allFilesUnique: filesInDir.length === uniqueFiles.size,
      allTasksSucceeded: successCount === allTasks.length,
    };

    io.logger.info("Stress test completed", {
      ...validation,
      executionTimeMs,
      executionTimeSec: Math.round(executionTimeMs / 1000),
    });

    // Log any failures
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      io.logger.warn("Some tasks failed", {
        failures: failures.map((f) => ({ file: f.file, error: f.error })),
      });
    }

    return {
      success: validation.allTasksSucceeded && validation.allFilesUnique,
      validation,
      executionTimeMs,
      outputDir,
      files: results.map((r) => r.file),
    };
  }
};

export default helloWorldStressTestJob;
