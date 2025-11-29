/**
 * Cerebras TDD (Impl + Tests) Validation
 *
 * Single prompt generates BOTH implementation and Jest test file
 * Measures time to validated code
 */

import * as fs from "fs";
import { execSync } from "child_process";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1";
const MODEL = "gpt-oss-120b";

if (!CEREBRAS_API_KEY) {
  console.error("Error: CEREBRAS_API_KEY not set");
  process.exit(1);
}

const TASKS = [
  {
    id: 1,
    description:
      "Create a simple Counter class with increment/decrement methods",
  },
  {
    id: 2,
    description:
      "Implement a UserValidator that checks email and password requirements",
  },
  {
    id: 3,
    description:
      "Build a basic Cache with get/set/clear methods and TTL support",
  },
];

interface TDDResult {
  taskId: number;
  description: string;
  totalTime: number;
  generationTime: number;
  testExecutionTime: number;
  implementation: string;
  tests: string;
  testsPassed: boolean;
  testOutput: string;
  grade: number;
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
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cerebras API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as any;
  return data.choices[0]?.message?.content || "";
}

function parseResponse(content: string): {
  implementation: string;
  tests: string;
} {
  // Split on the separator between implementation and tests
  const parts = content.split(
    /\/\/\s*===+\s*TESTS?\s*===+|\/\*\*\s*TESTS?\s*\*\*\//i
  );

  if (parts.length >= 2) {
    return {
      implementation: parts[0].trim(),
      tests: parts[1].trim(),
    };
  }

  // Fallback: assume everything after "describe" is tests
  if (content.includes("describe(")) {
    const describeIdx = content.indexOf("describe(");
    return {
      implementation: content.substring(0, describeIdx).trim(),
      tests: content.substring(describeIdx).trim(),
    };
  }

  // If can't parse, return all as implementation
  return {
    implementation: content,
    tests: "",
  };
}

async function executeTask(task: (typeof TASKS)[0]): Promise<TDDResult> {
  const taskStartTime = Date.now();

  try {
    const prompt = `You are an expert TypeScript developer writing test-driven code.

Task: ${task.description}

CRITICAL INSTRUCTIONS:
1. Generate ONLY valid TypeScript code (no markdown, no backticks)
2. First section: Implementation (class/function, under 50 lines)
3. Separate the sections with: // ==== TESTS ====
4. Second section: Jest test file (3-5 test cases)
5. All code must be executable immediately
6. Do NOT import from external packages (use only built-ins and Node.js)

Start with the implementation, then tests. Output ONLY code.`;

    const genStartTime = Date.now();
    const content = await callCerebras(prompt);
    const genEndTime = Date.now();

    const { implementation, tests } = parseResponse(content);

    // Write test file
    const testFile = `/tmp/test-${task.id}-${Date.now()}.test.ts`;
    const implFile = `/tmp/impl-${task.id}-${Date.now()}.ts`;

    // Combine implementation and tests for execution
    const fullTestCode = `${implementation}\n\n${tests}`;

    fs.writeFileSync(testFile, fullTestCode);
    fs.writeFileSync(implFile, implementation);

    // Try to run tests
    let testsPassed = false;
    let testOutput = "";
    const testStartTime = Date.now();

    try {
      testOutput = execSync(`npx jest ${testFile} --no-coverage 2>&1`, {
        encoding: "utf-8",
        timeout: 10000,
      });
      testsPassed = testOutput.includes("passed") && !testOutput.includes("failed");
    } catch (e) {
      // Jest might fail, but we can still check if tests ran
      testOutput = (e as any).stdout || (e as any).message || "";
      testsPassed = false;
    }

    const testEndTime = Date.now();

    // Grade based on parseable code and test presence
    let grade = 50;
    if (implementation.length > 100) grade += 15;
    if (tests.length > 50) grade += 15;
    if (implementation.includes("class") || implementation.includes("function"))
      grade += 10;
    if (tests.includes("describe") && tests.includes("it")) grade += 10;

    // Cleanup
    try {
      fs.unlinkSync(testFile);
      fs.unlinkSync(implFile);
    } catch {}

    return {
      taskId: task.id,
      description: task.description,
      totalTime: Date.now() - taskStartTime,
      generationTime: genEndTime - genStartTime,
      testExecutionTime: testEndTime - testStartTime,
      implementation: implementation.substring(0, 300),
      tests: tests.substring(0, 300),
      testsPassed,
      testOutput: testOutput.substring(0, 200),
      grade,
    };
  } catch (error) {
    return {
      taskId: task.id,
      description: task.description,
      totalTime: Date.now() - taskStartTime,
      generationTime: 0,
      testExecutionTime: 0,
      implementation: `ERROR: ${(error as Error).message}`,
      tests: "",
      testsPassed: false,
      testOutput: (error as Error).message,
      grade: 0,
    };
  }
}

async function main() {
  console.log("========================================");
  console.log("Cerebras TDD (Impl + Tests Combined)");
  console.log("========================================\n");

  const results: TDDResult[] = [];

  for (const task of TASKS) {
    console.log(
      `[Task ${task.id}] ${task.description}`
    );
    const result = await executeTask(task);

    console.log(`  Generation: ${result.generationTime}ms`);
    console.log(`  Tests run: ${result.testExecutionTime}ms`);
    console.log(`  Total time: ${result.totalTime}ms`);
    console.log(`  Tests passed: ${result.testsPassed ? "✓" : "✗"}`);
    console.log(`  Grade: ${result.grade}`);
    console.log(`  Impl (preview): ${result.implementation.substring(0, 60)}...`);
    console.log(`  Tests (preview): ${result.tests.substring(0, 60)}...`);
    console.log();

    results.push(result);
  }

  // Summary
  console.log("========================================");
  console.log("SUMMARY");
  console.log("========================================\n");

  const avgTotal = Math.round(
    results.reduce((s, r) => s + r.totalTime, 0) / results.length
  );
  const avgGen = Math.round(
    results.reduce((s, r) => s + r.generationTime, 0) / results.length
  );
  const testsPassed = results.filter((r) => r.testsPassed).length;

  console.log(
    `Avg time to validated code: ${avgTotal}ms (gen: ${avgGen}ms)`
  );
  console.log(
    `Tests passed: ${testsPassed}/${TASKS.length}`
  );
  console.log(
    `\nFor 7 MDAP tasks (extrapolated):`
  );
  console.log(
    `  Generation: ${(avgGen * 7) / 1000}s`
  );
  console.log(
    `  Total (with test execution): ${(avgTotal * 7) / 1000}s`
  );
  console.log(
    `  vs baseline: 81.5s per task = 570s for 7 tasks`
  );
  console.log(
    `  Speedup: ${(570 / ((avgTotal * 7) / 1000)).toFixed(1)}x faster`
  );

  const reportPath = `/tmp/cerebras-tdd-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${reportPath}`);

  process.exit(testsPassed === TASKS.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
