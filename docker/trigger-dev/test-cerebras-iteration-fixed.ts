/**
 * Cerebras Iteration Loop Test - Fixed Version
 *
 * Tests iteration with proper module format and rate limiting
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
    error?: string;
  }>;
  totalTime: number;
  totalIterations: number;
  success: boolean;
}

const TASKS = [
  {
    id: 1,
    description: "Function that doubles a number",
    testCode: `
function double(x) {
  return x * 2;
}

console.assert(double(5) === 10, 'double(5) should be 10');
console.assert(double(0) === 0, 'double(0) should be 0');
console.assert(double(-3) === -6, 'double(-3) should be -6');
console.log('All tests passed for double');
`,
  },
  {
    id: 2,
    description: "Function that reverses a string",
    testCode: `
function reverseString(str) {
  return str.split('').reverse().join('');
}

console.assert(reverseString('hello') === 'olleh', 'reverseString("hello")');
console.assert(reverseString('') === '', 'reverseString("")');
console.assert(reverseString('a') === 'a', 'reverseString("a")');
console.log('All tests passed for reverseString');
`,
  },
  {
    id: 3,
    description: "Function that counts vowels in a string",
    testCode: `
function countVowels(str) {
  return (str.match(/[aeiouAEIOU]/g) || []).length;
}

console.assert(countVowels('hello') === 2, 'countVowels("hello") should be 2');
console.assert(countVowels('aeiou') === 5, 'countVowels("aeiou") should be 5');
console.assert(countVowels('xyz') === 0, 'countVowels("xyz") should be 0');
console.log('All tests passed for countVowels');
`,
  },
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `API error: ${response.status} - ${error.substring(0, 100)}`
    );
  }

  const data = (await response.json()) as any;
  return data.choices[0]?.message?.content || "";
}

async function runTests(impl: string, tests: string): Promise<{
  passed: boolean;
  error?: string;
}> {
  const tmpFile = `/tmp/test-iter-${Date.now()}.js`;
  const fullCode = `${impl}\n\n${tests}`;

  fs.writeFileSync(tmpFile, fullCode);

  try {
    execSync(`node ${tmpFile}`, { timeout: 5000, encoding: "utf-8" });
    return { passed: true };
  } catch (e: any) {
    const error = String(e.stderr || e.message || "Unknown error");
    return { passed: false, error: error.substring(0, 100) };
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
}

async function executeIterationLoop(
  task: (typeof TASKS)[0]
): Promise<IterationResult> {
  const startTime = Date.now();
  const iterations: IterationResult["iterations"] = [];
  let success = false;
  const maxIterations = 3;

  console.log(`[Task ${task.id}] ${task.description}`);

  for (let iter = 1; iter <= maxIterations; iter++) {
    // Rate limiting: wait between requests
    if (iter > 1) {
      await sleep(2000);
    }

    const iterStartMs = Date.now();

    const prompt = `Write a JavaScript function that passes these tests:

${task.testCode}

Return ONLY the function implementation (no tests, no console.log). The function will be tested immediately.
${iter > 1 ? `\nPrevious attempts failed. Make sure the implementation exactly matches what the tests expect.` : ""}

Function:`;

    try {
      const genStartMs = Date.now();
      const implementation = await callCerebras(prompt);
      const genMs = Date.now() - genStartMs;

      const result = await runTests(implementation, task.testCode);

      iterations.push({
        iteration: iter,
        generationMs: genMs,
        testsPassed: result.passed,
        error: result.error,
      });

      const status = result.passed ? "✓" : "✗";
      console.log(
        `  Iter ${iter}: ${status} (${genMs}ms)${result.error ? ` - ${result.error}` : ""}`
      );

      if (result.passed) {
        success = true;
        break;
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      iterations.push({
        iteration: iter,
        generationMs: 0,
        testsPassed: false,
        error: errorMsg.substring(0, 100),
      });
      console.log(`  Iter ${iter}: ✗ ERROR - ${errorMsg.substring(0, 50)}`);
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
  console.log("Cerebras Iteration Loop - Fixed Test");
  console.log("========================================\n");

  const results: IterationResult[] = [];

  for (const task of TASKS) {
    const result = await executeIterationLoop(task);
    results.push(result);
    console.log();
  }

  // Summary
  console.log("========================================");
  console.log("RESULTS");
  console.log("========================================\n");

  const successCount = results.filter((r) => r.success).length;
  const totalIterations = results.reduce((s, r) => s + r.totalIterations, 0);
  const avgIterations = (totalIterations / results.length).toFixed(1);
  const totalTime = results.reduce((s, r) => s + r.totalTime, 0);

  console.log(`Success Rate: ${successCount}/${results.length}`);
  console.log(`Average iterations: ${avgIterations}`);
  console.log(`Total time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log();

  results.forEach((r) => {
    const mark = r.success ? "✓" : "✗";
    console.log(
      `  ${mark} Task ${r.taskId}: ${r.totalIterations} iterations, ${r.totalTime}ms`
    );
  });

  console.log("\n========================================");
  console.log("ECONOMICS");
  console.log("========================================\n");

  const avgTokensPerCall = 1500;
  const totalTokens = totalIterations * avgTokensPerCall;
  const cerebrasPrice = 0.00000015; // $0.00000015 per token (Cerebras pricing ~$0.30 per 1M)

  console.log(`Total API calls: ${totalIterations}`);
  console.log(`Est. tokens: ~${totalTokens}`);
  console.log(`Est. cost: $${(totalTokens * cerebrasPrice).toFixed(4)}`);
  console.log();
  console.log(`For 7 MDAP tasks:`);
  console.log(
    `  Total tokens: ~${Math.round((totalTokens / 3) * 7)} (3 tasks avg × 7)`
  );
  console.log(
    `  Est. cost: $${(((totalTokens / 3) * 7 * cerebrasPrice).toFixed(4))}`
  );
  console.log(
    `  Time: ~${((totalTime / 1000) * (7 / 3)).toFixed(1)}s for 7 tasks`
  );

  // Save results
  const reportPath = `/tmp/cerebras-iteration-fixed-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nResults: ${reportPath}`);

  process.exit(successCount === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
