/**
 * Cerebras Iteration Loop Test
 *
 * Intentionally creates failing test cases and measures:
 * 1. Time to detect failure
 * 2. Time to regenerate working code
 * 3. Success rate of fixes
 * 4. Token efficiency of iteration
 */

import * as fs from "fs";
import { execSync } from "child_process";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1";
const MODEL = "gpt-oss-120b";

interface IterationResult {
  taskId: number;
  description: string;
  iterations: Array<{
    iteration: number;
    generationMs: number;
    testsPassed: boolean;
    testOutput: string;
    feedback?: string;
  }>;
  totalTime: number;
  totalIterations: number;
  success: boolean;
}

// Intentionally broken test cases to trigger failures
const FAILING_TEST_TASKS = [
  {
    id: 1,
    description: "Create a Sum function",
    failingTests: `
describe('sum function', () => {
  test('sum(2, 3) should return 5', () => {
    expect(sum(2, 3)).toBe(5);
  });
  test('sum handles negative numbers', () => {
    expect(sum(-5, 3)).toBe(-2);
  });
  test('sum with large numbers', () => {
    expect(sum(1000000, 1000000)).toBe(2000000);
  });
});`,
  },
  {
    id: 2,
    description: "Create a Multiply function",
    failingTests: `
describe('multiply function', () => {
  test('multiply(3, 4) should return 12', () => {
    expect(multiply(3, 4)).toBe(12);
  });
  test('multiply with zero', () => {
    expect(multiply(5, 0)).toBe(0);
  });
  test('multiply negative numbers', () => {
    expect(multiply(-3, -4)).toBe(12);
  });
});`,
  },
  {
    id: 3,
    description: "Create a reverse string function",
    failingTests: `
describe('reverseString function', () => {
  test('reverseString("hello") should return "olleh"', () => {
    expect(reverseString("hello")).toBe("olleh");
  });
  test('reverseString with empty string', () => {
    expect(reverseString("")).toBe("");
  });
  test('reverseString with single char', () => {
    expect(reverseString("a")).toBe("a");
  });
});`,
  },
];

async function callCerebras(prompt: string): Promise<string> {
  const response = await fetch(`${CEREBRAS_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = (await response.json()) as any;
  return data.choices[0]?.message?.content || "";
}

async function runTests(code: string, tests: string): Promise<{
  passed: boolean;
  output: string;
}> {
  const tmpFile = `/tmp/test-iter-${Date.now()}.mjs`;
  const fullCode = `${code}\n\n${tests}`;

  fs.writeFileSync(tmpFile, fullCode);

  try {
    const output = execSync(`node ${tmpFile} 2>&1`, {
      timeout: 5000,
      encoding: "utf-8",
    });
    return { passed: true, output };
  } catch (e: any) {
    const output = e.stderr || e.stdout || e.message || "";
    return { passed: false, output: output.substring(0, 300) };
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
}

async function executeIterationLoop(
  task: (typeof FAILING_TEST_TASKS)[0]
): Promise<IterationResult> {
  const startTime = Date.now();
  const iterations: IterationResult["iterations"] = [];
  let success = false;
  let maxIterations = 5;

  console.log(`\n[Task ${task.id}] ${task.description}`);
  console.log("Starting iteration loop...\n");

  for (let iter = 1; iter <= maxIterations; iter++) {
    const iterStartMs = Date.now();

    const feedback =
      iterations.length > 0 && !iterations[iterations.length - 1].testsPassed
        ? `Previous implementation failed with: ${iterations[iterations.length - 1].testOutput}\n\nFix the implementation to pass all tests.`
        : undefined;

    const prompt = `You are a TypeScript/JavaScript developer.

Task: ${task.description}

Required Tests:
${task.failingTests}

${feedback ? `Feedback from previous attempt:\n${feedback}\n\n` : ""}Instructions:
1. Implement the function(s) to pass ALL tests
2. Return ONLY the function implementation (no comments, no test code)
3. Make it work with Node.js (use CommonJS exports)
4. Keep it under 50 lines

Implementation:`;

    try {
      const genStartMs = Date.now();
      const implementation = await callCerebras(prompt);
      const genMs = Date.now() - genStartMs;

      // Try to run tests
      const result = await runTests(implementation, task.failingTests);

      iterations.push({
        iteration: iter,
        generationMs: genMs,
        testsPassed: result.passed,
        testOutput: result.output,
        feedback: feedback,
      });

      const status = result.passed ? "✓ PASS" : "✗ FAIL";
      console.log(
        `  Iteration ${iter}: ${status} (${genMs}ms, output: ${result.output.substring(0, 50)}...)`
      );

      if (result.passed) {
        success = true;
        break;
      }
    } catch (error) {
      iterations.push({
        iteration: iter,
        generationMs: 0,
        testsPassed: false,
        testOutput: (error as Error).message,
      });

      console.log(
        `  Iteration ${iter}: ✗ ERROR - ${(error as Error).message.substring(0, 50)}`
      );
    }
  }

  return {
    taskId: task.id,
    description: task.description,
    iterations,
    totalTime: Date.now() - startTime,
    totalIterations: iterations.length,
    success,
  };
}

async function main() {
  console.log("========================================");
  console.log("Cerebras Iteration Loop Test");
  console.log("Testing tight iteration with failing cases");
  console.log("========================================");

  const results: IterationResult[] = [];

  for (const task of FAILING_TEST_TASKS) {
    const result = await executeIterationLoop(task);
    results.push(result);
  }

  // Summary
  console.log("\n========================================");
  console.log("ITERATION LOOP SUMMARY");
  console.log("========================================\n");

  const successCount = results.filter((r) => r.success).length;
  const totalIterations = results.reduce((s, r) => s + r.totalIterations, 0);
  const avgIterations = (totalIterations / results.length).toFixed(1);
  const totalTime = results.reduce((s, r) => s + r.totalTime, 0);
  const avgTimePerTask = Math.round(totalTime / results.length);

  console.log(`Success Rate: ${successCount}/${results.length}`);
  console.log(`Average iterations to success: ${avgIterations}`);
  console.log(`Average time per task: ${avgTimePerTask}ms`);
  console.log(`Total test time: ${(totalTime / 1000).toFixed(1)}s\n`);

  console.log("Breakdown:");
  results.forEach((result) => {
    const status = result.success ? "✓" : "✗";
    console.log(
      `  Task ${result.taskId}: ${status} (${result.totalIterations} iterations, ${result.totalTime}ms)`
    );

    result.iterations.forEach((iter) => {
      console.log(
        `    → Iter ${iter.iteration}: ${iter.testsPassed ? "PASS" : "FAIL"} (${iter.generationMs}ms)`
      );
    });
  });

  console.log("\nToken Efficiency Analysis:");
  const avgTokensPerCall = 2000; // estimate
  const totalTokens =
    results.reduce((s, r) => s + r.totalIterations, 0) * avgTokensPerCall;
  console.log(`  ~${totalTokens} tokens for 3 tasks with iteration`);
  console.log(`  ~${(totalTokens / 3).toFixed(0)} tokens per task (with retries)`);
  console.log(
    `  First-try success rate: ${((successCount / results.length) * 100).toFixed(0)}%`
  );

  console.log("\nProduction Implications:");
  const totalTaskTokens = 3 * 7; // 3 iterations avg × 7 tasks
  const costPerThousand = 0.30; // $0.30 per 1M tokens (Cerebras pricing)
  const estCost = (totalTaskTokens * 1000 * costPerThousand) / 1000000;
  console.log(`  For 7 MDAP tasks with 3 iterations avg:`);
  console.log(`    Total tokens: ~${totalTaskTokens * 1000}`);
  console.log(`    Est. cost: $${estCost.toFixed(4)} (0.3¢ per task!)`);
  console.log(
    `    Time: ${((totalTime / 1000) * (7 / 3)).toFixed(1)}s for 7 tasks`
  );

  // Save detailed results
  const reportPath = `/tmp/cerebras-iteration-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results: ${reportPath}`);

  process.exit(successCount === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
