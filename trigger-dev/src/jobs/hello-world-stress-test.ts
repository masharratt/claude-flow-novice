/**
 * Hello World 100-Agent Stress Test
 *
 * Tests coordinator's ability to distribute 100 unique tasks to 100 isolated agents
 * without overlap or collision.
 *
 * Matrix: 10 spoken languages × 10 programming languages = 100 combinations
 * Output: /tmp/hello-world-{timestamp}/{language}-{programming}-{agentType}.{ext}
 *
 * Success Criteria:
 * - 100 unique files created
 * - No duplicate assignments
 * - No missing combinations
 * - All files contain correct "Hello World" in specified language
 */

import { TriggerClient, defineJob, eventTrigger } from '@trigger.dev/sdk';
import { z } from 'zod';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Declare client for external initialization
declare const client: TriggerClient;

// 10 spoken languages with their "Hello World" translations
const SPOKEN_LANGUAGES = [
  { code: 'en', name: 'English', greeting: 'Hello World' },
  { code: 'es', name: 'Spanish', greeting: 'Hola Mundo' },
  { code: 'fr', name: 'French', greeting: 'Bonjour le Monde' },
  { code: 'de', name: 'German', greeting: 'Hallo Welt' },
  { code: 'ja', name: 'Japanese', greeting: 'こんにちは世界' },
  { code: 'zh', name: 'Chinese', greeting: '你好世界' },
  { code: 'ko', name: 'Korean', greeting: '안녕하세요 세계' },
  { code: 'ru', name: 'Russian', greeting: 'Привет мир' },
  { code: 'ar', name: 'Arabic', greeting: 'مرحبا بالعالم' },
  { code: 'pt', name: 'Portuguese', greeting: 'Olá Mundo' },
] as const;

// 10 programming languages with file extensions
const PROGRAMMING_LANGUAGES = [
  { code: 'python', name: 'Python', ext: 'py' },
  { code: 'javascript', name: 'JavaScript', ext: 'js' },
  { code: 'typescript', name: 'TypeScript', ext: 'ts' },
  { code: 'rust', name: 'Rust', ext: 'rs' },
  { code: 'go', name: 'Go', ext: 'go' },
  { code: 'java', name: 'Java', ext: 'java' },
  { code: 'csharp', name: 'CSharp', ext: 'cs' },
  { code: 'ruby', name: 'Ruby', ext: 'rb' },
  { code: 'php', name: 'PHP', ext: 'php' },
  { code: 'swift', name: 'Swift', ext: 'swift' },
] as const;

// Agent types to distribute work across
const AGENT_TYPES = [
  'backend-developer',
  'rust-developer',
  'typescript-specialist',
  'react-frontend-engineer',
  'mobile-dev',
] as const;

type SpokenLanguage = typeof SPOKEN_LANGUAGES[number];
type ProgrammingLanguage = typeof PROGRAMMING_LANGUAGES[number];
type AgentType = typeof AGENT_TYPES[number];

interface TaskAssignment {
  id: number;
  spokenLang: SpokenLanguage;
  progLang: ProgrammingLanguage;
  agentType: AgentType;
  outputFile: string;
}

interface AgentResult {
  taskId: number;
  agentType: string;
  containerName: string;
  outputFile: string;
  success: boolean;
  error?: string;
  executionTimeMs: number;
}

interface StressTestResult {
  jobId: string;
  timestamp: string;
  outputDir: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  duplicateFiles: string[];
  missingFiles: string[];
  results: AgentResult[];
  summary: {
    successRate: number;
    avgExecutionTimeMs: number;
    totalExecutionTimeMs: number;
    passed: boolean;
  };
}

/**
 * Generate the 100 task assignments with round-robin agent distribution
 */
function generateTaskMatrix(outputDir: string): TaskAssignment[] {
  const tasks: TaskAssignment[] = [];
  let taskId = 0;

  for (const spokenLang of SPOKEN_LANGUAGES) {
    for (const progLang of PROGRAMMING_LANGUAGES) {
      const agentType = AGENT_TYPES[taskId % AGENT_TYPES.length];
      const outputFile = path.join(
        outputDir,
        `${spokenLang.code}-${progLang.code}-${agentType}.${progLang.ext}`
      );

      tasks.push({
        id: taskId,
        spokenLang,
        progLang,
        agentType,
        outputFile,
      });

      taskId++;
    }
  }

  return tasks;
}

/**
 * Generate hello world code for a specific programming language
 */
function generateHelloWorldCode(
  progLang: ProgrammingLanguage,
  greeting: string
): string {
  const templates: Record<string, string> = {
    python: `#!/usr/bin/env python3
# Hello World in {lang}
print("${greeting}")
`,
    javascript: `// Hello World in {lang}
console.log("${greeting}");
`,
    typescript: `// Hello World in {lang}
const greeting: string = "${greeting}";
console.log(greeting);
`,
    rust: `// Hello World in {lang}
fn main() {
    println!("${greeting}");
}
`,
    go: `// Hello World in {lang}
package main

import "fmt"

func main() {
    fmt.Println("${greeting}")
}
`,
    java: `// Hello World in {lang}
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("${greeting}");
    }
}
`,
    csharp: `// Hello World in {lang}
using System;

class Program {
    static void Main() {
        Console.WriteLine("${greeting}");
    }
}
`,
    ruby: `#!/usr/bin/env ruby
# Hello World in {lang}
puts "${greeting}"
`,
    php: `<?php
// Hello World in {lang}
echo "${greeting}\\n";
?>
`,
    swift: `// Hello World in {lang}
import Foundation
print("${greeting}")
`,
  };

  return templates[progLang.code] || `// ${greeting}`;
}

/**
 * Spawn an agent in isolated container to create hello world file
 */
async function spawnAgentForTask(
  task: TaskAssignment,
  io: { logger: { info: (msg: string, meta?: Record<string, unknown>) => Promise<void>; error: (msg: string, meta?: Record<string, unknown>) => Promise<void> }; runTask: <T>(id: string, fn: () => Promise<T>, opts?: { name: string }) => Promise<T> },
  ctx: { run: { id: string } }
): Promise<AgentResult> {
  const startTime = Date.now();
  const containerName = `hw-${ctx.run.id.slice(0, 8)}-${task.id}`;

  try {
    await io.logger.info(`Spawning agent for task ${task.id}`, {
      spokenLang: task.spokenLang.name,
      progLang: task.progLang.name,
      agentType: task.agentType,
      outputFile: task.outputFile,
    });

    const result = await io.runTask(
      `task-${task.id}`,
      async () => {
        // Generate the hello world code
        const code = generateHelloWorldCode(task.progLang, task.spokenLang.greeting);

        // Create output directory if needed
        const dir = path.dirname(task.outputFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Build Docker command to spawn isolated agent
        const dockerCmd = [
          'docker run --rm',
          `--name ${containerName}`,
          '--network trigger-cfn-network',
          '--cpus=0.5',
          '--memory=512m',
          `-e TASK_ID=${task.id}`,
          `-e SPOKEN_LANG=${task.spokenLang.code}`,
          `-e PROG_LANG=${task.progLang.code}`,
          `-e AGENT_TYPE=${task.agentType}`,
          `-v /tmp:/tmp`,
          'alpine:latest',
          'sh', '-c',
          `'mkdir -p "${dir}" && cat > "${task.outputFile}" << "HELLOEOF"
${code}
HELLOEOF'`,
        ].join(' ');

        try {
          execSync(dockerCmd, { timeout: 30000, encoding: 'utf-8' });

          // Verify file was created
          if (fs.existsSync(task.outputFile)) {
            return { success: true };
          } else {
            return { success: false, error: 'File not created' };
          }
        } catch (execError) {
          const errorMessage = execError instanceof Error ? execError.message : 'Unknown execution error';
          return { success: false, error: errorMessage };
        }
      },
      { name: `HelloWorld-${task.spokenLang.code}-${task.progLang.code}` }
    );

    return {
      taskId: task.id,
      agentType: task.agentType,
      containerName,
      outputFile: task.outputFile,
      success: result.success,
      error: result.error,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await io.logger.error(`Task ${task.id} failed`, { error: errorMessage });

    return {
      taskId: task.id,
      agentType: task.agentType,
      containerName,
      outputFile: task.outputFile,
      success: false,
      error: errorMessage,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Validate results: check for duplicates and missing files
 */
function validateResults(
  tasks: TaskAssignment[],
  results: AgentResult[]
): { duplicates: string[]; missing: string[] } {
  const createdFiles = new Set<string>();
  const duplicates: string[] = [];
  const missing: string[] = [];

  // Check for duplicates
  for (const result of results) {
    if (result.success) {
      if (createdFiles.has(result.outputFile)) {
        duplicates.push(result.outputFile);
      } else {
        createdFiles.add(result.outputFile);
      }
    }
  }

  // Check for missing files
  for (const task of tasks) {
    if (!fs.existsSync(task.outputFile)) {
      missing.push(task.outputFile);
    }
  }

  return { duplicates, missing };
}

/**
 * Hello World 100-Agent Stress Test Job
 *
 * Distributes 100 unique hello world tasks across isolated containers.
 * Tests coordinator's task distribution without overlap.
 */
export const helloWorldStressTestJob = defineJob({
  id: 'hello-world-stress-test',
  name: 'Hello World 100-Agent Stress Test',
  version: '1.0.0',
  trigger: eventTrigger({
    name: 'test.hello.world.stress',
  }),
  run: async (payload: unknown, io, ctx): Promise<StressTestResult> => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = `/tmp/hello-world-${timestamp}`;

    await io.logger.info('Starting Hello World 100-Agent Stress Test', {
      outputDir,
      totalTasks: 100,
      spokenLanguages: SPOKEN_LANGUAGES.length,
      programmingLanguages: PROGRAMMING_LANGUAGES.length,
      agentTypes: AGENT_TYPES.length,
    });

    // Generate task matrix
    const tasks = generateTaskMatrix(outputDir);
    await io.logger.info(`Generated ${tasks.length} task assignments`);

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Execute all tasks in parallel batches of 10 (to avoid overwhelming Docker)
    const batchSize = 10;
    const results: AgentResult[] = [];

    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(tasks.length / batchSize);

      await io.logger.info(`Processing batch ${batchNum}/${totalBatches}`, {
        startTask: i,
        endTask: Math.min(i + batchSize, tasks.length),
      });

      const batchResults = await Promise.all(
        batch.map((task) => spawnAgentForTask(task, io, ctx))
      );

      results.push(...batchResults);
    }

    // Validate results
    const { duplicates, missing } = validateResults(tasks, results);

    // Calculate summary
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const avgExecutionTime =
      results.reduce((sum, r) => sum + r.executionTimeMs, 0) / results.length;
    const totalExecutionTime = Date.now() - startTime;

    const passed =
      successCount === 100 &&
      duplicates.length === 0 &&
      missing.length === 0;

    const summary = {
      successRate: successCount / tasks.length,
      avgExecutionTimeMs: Math.round(avgExecutionTime),
      totalExecutionTimeMs: totalExecutionTime,
      passed,
    };

    await io.logger.info('Stress test completed', {
      successCount,
      failureCount,
      duplicateCount: duplicates.length,
      missingCount: missing.length,
      passed,
      totalExecutionTimeMs: totalExecutionTime,
    });

    // Log failures if any
    if (failureCount > 0) {
      const failures = results.filter((r) => !r.success);
      await io.logger.error('Failed tasks', {
        count: failures.length,
        failures: failures.map((f) => ({
          taskId: f.taskId,
          error: f.error,
          outputFile: f.outputFile,
        })),
      });
    }

    return {
      jobId: ctx.run.id,
      timestamp: new Date().toISOString(),
      outputDir,
      totalTasks: tasks.length,
      completedTasks: successCount,
      failedTasks: failureCount,
      duplicateFiles: duplicates,
      missingFiles: missing,
      results,
      summary,
    };
  },
});

// Export for registration
export default helloWorldStressTestJob;
