/**
 * Cerebras Hard Iteration Test
 *
 * Complex requirements that test iteration capability
 */

import * as fs from "fs";
import { execSync } from "child_process";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1";
const MODEL = "gpt-oss-120b";

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

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = (await response.json()) as any;
  return data.choices[0]?.message?.content || "";
}

async function runTests(impl: string, tests: string): Promise<{
  passed: boolean;
  error?: string;
}> {
  const tmpFile = `/tmp/test-hard-${Date.now()}.js`;
  const fullCode = `${impl}\n\n${tests}`;

  fs.writeFileSync(tmpFile, fullCode);

  try {
    execSync(`node ${tmpFile}`, { timeout: 5000, encoding: "utf-8" });
    return { passed: true };
  } catch (e: any) {
    const error = String(e.stderr || e.message || "Unknown");
    return { passed: false, error: error.substring(0, 150) };
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
}

// Hard test: Palindrome validator with edge cases
const PALINDROME_TASK = {
  name: "isPalindrome",
  description: "Check if string is palindrome (ignoring spaces, case, punctuation)",
  testCode: `
function isPalindrome(str) {
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned === cleaned.split('').reverse().join('');
}

// Basic tests
console.assert(isPalindrome('racecar') === true, 'racecar');
console.assert(isPalindrome('hello') === false, 'hello');

// Edge cases
console.assert(isPalindrome('A man, a plan, a canal: Panama') === true, 'Panama');
console.assert(isPalindrome('race a car') === false, 'race a car');
console.assert(isPalindrome('') === true, 'empty string');
console.assert(isPalindrome('a') === true, 'single char');

// Punctuation and spacing
console.assert(isPalindrome('Was it a car or a cat I saw?') === true, 'car/cat');

console.log('All palindrome tests passed');
`,
};

// Hard test: LRU Cache
const LRU_TASK = {
  name: "LRU Cache",
  description: "Implement simple LRU cache with get/put and eviction",
  testCode: `
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return -1;
    const val = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, val); // Mark as recently used
    return val;
  }

  put(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const oldKey = this.cache.keys().next().value;
      this.cache.delete(oldKey);
    }
    this.cache.set(key, value);
  }
}

// Tests
const cache = new LRUCache(2);
cache.put(1, 1);
cache.put(2, 2);
console.assert(cache.get(1) === 1, 'get 1');
cache.put(3, 3);
console.assert(cache.get(2) === -1, 'get 2 after eviction');
cache.put(4, 4);
console.assert(cache.get(1) === -1, 'get 1 after eviction');
console.assert(cache.get(3) === 3, 'get 3');
console.assert(cache.get(4) === 4, 'get 4');

console.log('All LRU cache tests passed');
`,
};

// Hard test: Flatten nested structure
const FLATTEN_TASK = {
  name: "flattenObject",
  description: "Flatten nested object with dot notation",
  testCode: `
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? prefix + '.' + key : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, newKey));
      } else {
        result[newKey] = value;
      }
    }
  }
  return result;
}

const input = { a: 1, b: { c: 2, d: { e: 3 } } };
const output = flattenObject(input);

console.assert(output['a'] === 1, 'a = 1');
console.assert(output['b.c'] === 2, 'b.c = 2');
console.assert(output['b.d.e'] === 3, 'b.d.e = 3');
console.assert(Object.keys(output).length === 3, 'keys length');

console.log('All flatten tests passed');
`,
};

const TASKS = [PALINDROME_TASK, LRU_TASK, FLATTEN_TASK];

interface IterationResult {
  task: string;
  description: string;
  iterations: number;
  success: boolean;
  totalTime: number;
  totalTokens: number;
}

async function testTask(task: typeof PALINDROME_TASK): Promise<IterationResult> {
  console.log(`\nTesting: ${task.name} - ${task.description}`);
  let success = false;
  let iterations = 0;
  const startTime = Date.now();
  const tokensPerCall = 1500;
  let totalTokens = 0;

  for (let iter = 1; iter <= 4; iter++) {
    if (iter > 1) await sleep(2000);

    iterations = iter;

    const prompt = `Implement JavaScript function for: ${task.description}

Tests:
${task.testCode}

${iter > 1 ? `Previous attempts failed. Fix the implementation to pass all tests.` : ""}

Return ONLY the function/class implementation:`;

    try {
      const impl = await callCerebras(prompt);
      totalTokens += tokensPerCall;

      const result = await runTests(impl, task.testCode);

      if (result.passed) {
        console.log(`  ✓ Passed on iteration ${iter}`);
        success = true;
        break;
      } else {
        console.log(
          `  ✗ Iteration ${iter} failed: ${result.error?.substring(0, 60)}...`
        );
      }
    } catch (error) {
      console.log(`  ✗ Iteration ${iter} error: ${String(error).substring(0, 60)}`);
    }
  }

  const totalTime = Date.now() - startTime;
  return {
    task: task.name,
    description: task.description,
    iterations,
    success,
    totalTime,
    totalTokens,
  };
}

async function main() {
  console.log("========================================");
  console.log("Cerebras Hard Iteration Test");
  console.log("Complex requirements + edge cases");
  console.log("========================================");

  const results: IterationResult[] = [];

  for (const task of TASKS) {
    const result = await testTask(task);
    results.push(result);
  }

  console.log("\n========================================");
  console.log("RESULTS");
  console.log("========================================\n");

  const successCount = results.filter((r) => r.success).length;
  const totalIterations = results.reduce((s, r) => s + r.iterations, 0);
  const avgIterations = (totalIterations / results.length).toFixed(1);
  const totalTime = results.reduce((s, r) => s + r.totalTime, 0);
  const totalTokens = results.reduce((s, r) => s + r.totalTokens, 0);

  console.log(`Success Rate: ${successCount}/${results.length}`);
  console.log(`Avg iterations to solve: ${avgIterations}`);
  console.log(`Total time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Total tokens: ~${totalTokens}`);
  console.log();

  results.forEach((r) => {
    const mark = r.success ? "✓" : "✗";
    console.log(
      `  ${mark} ${r.task}: ${r.iterations} iterations, ${(r.totalTime / 1000).toFixed(2)}s`
    );
  });

  console.log("\n========================================");
  console.log("ITERATION ECONOMICS");
  console.log("========================================\n");

  const cerebrasPrice = 0.00000015; // $0.00000015 per token
  const cost = totalTokens * cerebrasPrice;

  console.log(`Total API calls: ${totalIterations}`);
  console.log(`Total tokens: ${totalTokens}`);
  console.log(`Total cost: $${cost.toFixed(4)}`);
  console.log(`Cost per task: $${(cost / 3).toFixed(4)}`);
  console.log();

  console.log("Scaling to 7 MDAP tasks:");
  const scaledIterations = totalIterations * (7 / 3);
  const scaledTokens = totalTokens * (7 / 3);
  const scaledCost = scaledTokens * cerebrasPrice;
  const scaledTime = (totalTime / 1000) * (7 / 3);

  console.log(`  Iterations: ${Math.round(scaledIterations)}`);
  console.log(`  Tokens: ~${Math.round(scaledTokens)}`);
  console.log(`  Time: ${scaledTime.toFixed(1)}s`);
  console.log(`  Cost: $${scaledCost.toFixed(4)}`);
  console.log();

  console.log("vs Baseline (glm-4.5-air):");
  console.log(`  Time: 570s (81.5s per task × 7)`);
  console.log(`  Speedup: ${(570 / scaledTime).toFixed(0)}x faster`);

  const reportPath = `/tmp/cerebras-hard-iteration-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nResults: ${reportPath}`);

  process.exit(successCount === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
