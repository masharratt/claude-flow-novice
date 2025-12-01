/**
 * Sonnet Provider for MDAP v2
 *
 * Fallback provider for complex tasks requiring higher quality/safety.
 * Uses Claude 3.5 Sonnet via Anthropic API.
 *
 * Used for:
 * - Complex tasks (complexity: 'complex')
 * - Safety-critical code
 * - When Cerebras iteration budget exceeded
 */

import * as fs from "fs";
import { execSync } from "child_process";

// =============================================
// Types
// =============================================

export interface GenerateResult {
  implementation: string;
  tests: string;
  modelUsed: string;
  tokensUsed: number;
  generationMs: number;
}

interface IterationResult {
  implementation: string;
  tests: string;
  success: boolean;
  iterations: number;
  totalTokens: number;
  totalTimeMs: number;
  modelUsed: string;
}

// =============================================
// Constants
// =============================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1";
const MODEL = "claude-3-5-sonnet-20241022";

// =============================================
// API Calls
// =============================================

/**
 * Call Anthropic Sonnet API
 */
export async function callSonnet(
  prompt: string,
  maxTokens: number = 4096
): Promise<{ content: string; tokensUsed: number }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const response = await fetch(`${ANTHROPIC_API_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error.substring(0, 100)}`);
  }

  const data = (await response.json()) as any;
  const content = data.content[0]?.text || "";
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  return { content, tokensUsed };
}

// =============================================
// Parsing
// =============================================

/**
 * Parse response to extract implementation and tests
 */
function parseResponse(content: string): {
  implementation: string;
  tests: string;
} {
  const parts = content.split(/\/\/\s*===+\s*TESTS?\s*===+/i);
  if (parts.length >= 2) {
    return {
      implementation: parts[0].trim(),
      tests: parts[1].trim(),
    };
  }

  if (content.includes("describe(")) {
    const idx = content.indexOf("describe(");
    return {
      implementation: content.substring(0, idx).trim(),
      tests: content.substring(idx).trim(),
    };
  }

  return { implementation: content, tests: "" };
}

/**
 * Run tests for generated implementation
 */
function runTests(impl: string, tests: string): { passed: boolean; error?: string } {
  const tmpFile = `/tmp/sonnet-test-${Date.now()}.js`;
  const fullCode = `${impl}\n\n${tests}`;

  fs.writeFileSync(tmpFile, fullCode);

  try {
    execSync(`node ${tmpFile}`, { timeout: 5000, encoding: "utf-8" });
    fs.unlinkSync(tmpFile);
    return { passed: true };
  } catch (e: any) {
    const error = String(e.stderr || e.message || "Unknown error");
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
    return { passed: false, error: error.substring(0, 200) };
  }
}

// =============================================
// Generation
// =============================================

/**
 * Generate implementation and tests
 */
export async function generateWithTests(
  taskDescription: string,
  validateLocally: boolean = false
): Promise<GenerateResult> {
  const startMs = Date.now();

  const prompt = `You are an expert TypeScript/JavaScript developer creating production-quality code.

Task: ${taskDescription}

Instructions:
1. Generate ONLY valid JavaScript/TypeScript code (no markdown)
2. First section: Implementation (function/class, under 100 lines)
3. Separate sections with: // ==== TESTS ====
4. Second section: Node.js test code (5-10 comprehensive test cases)
5. Tests must be thorough and cover edge cases
6. All code must run immediately in Node.js
7. Do NOT use external packages beyond Node.js built-ins
8. Include proper error handling and validation

Prioritize quality, correctness, and robustness over brevity.

Start with implementation, then tests:`;

  const { content, tokensUsed: genTokens } = await callSonnet(prompt, 4096);
  const { implementation, tests } = parseResponse(content);

  // Optional local validation
  if (validateLocally && tests) {
    const testResult = runTests(implementation, tests);
    if (!testResult.passed) {
      console.warn(`[sonnet-provider] Tests failed: ${testResult.error}`);
    }
  }

  return {
    implementation,
    tests,
    modelUsed: MODEL,
    tokensUsed: genTokens,
    generationMs: Date.now() - startMs,
  };
}

// =============================================
// Iteration Loop
// =============================================

/**
 * Generate implementation with automatic iteration on failure
 */
export async function generateWithIteration(
  taskDescription: string,
  maxIterations: number = 5
): Promise<IterationResult> {
  const startMs = Date.now();
  let totalTokens = 0;
  let lastError = "";

  for (let iter = 1; iter <= maxIterations; iter++) {
    const prompt =
      iter === 1
        ? `You are an expert developer. Create high-quality implementation and comprehensive tests.

Task: ${taskDescription}

Instructions:
1. Return ONLY valid JavaScript code (no markdown, no backticks)
2. First section: Implementation (function/class, under 100 lines)
3. Then: // ==== TESTS ====
4. Then: Node.js tests (5-10 test cases, use console.assert)
5. Tests should be thorough and cover edge cases
6. Make it work immediately in Node.js
7. Prioritize correctness and robustness`
        : `Fix the previous implementation based on this error:

${lastError}

Task: ${taskDescription}

Return ONLY the corrected implementation and tests (same format).
Make sure tests pass and code is production-quality.`;

    try {
      const { content, tokensUsed } = await callSonnet(prompt, 4096);
      totalTokens += tokensUsed;

      const { implementation, tests } = parseResponse(content);

      // Test locally
      if (tests) {
        const testResult = runTests(implementation, tests);
        if (testResult.passed) {
          return {
            implementation,
            tests,
            success: true,
            iterations: iter,
            totalTokens,
            totalTimeMs: Date.now() - startMs,
            modelUsed: MODEL,
          };
        }
        lastError = `Tests failed:\n${testResult.error}`;
      } else {
        return {
          implementation,
          tests,
          success: true,
          iterations: iter,
          totalTokens,
          totalTimeMs: Date.now() - startMs,
          modelUsed: MODEL,
        };
      }
    } catch (error) {
      lastError = `API error: ${(error as Error).message}`;
      if (iter === maxIterations) {
        return {
          implementation: "",
          tests: "",
          success: false,
          iterations: iter,
          totalTokens,
          totalTimeMs: Date.now() - startMs,
          modelUsed: MODEL,
        };
      }
    }
  }

  return {
    implementation: "",
    tests: "",
    success: false,
    iterations: maxIterations,
    totalTokens,
    totalTimeMs: Date.now() - startMs,
    modelUsed: MODEL,
  };
}

// =============================================
// Estimation
// =============================================

/**
 * Estimate tokens and cost for Sonnet
 */
export function estimateTask(): {
  modelName: string;
  estimatedTokens: number;
  estimatedCost: number;
  estimatedTimeMs: number;
} {
  // Sonnet averages: ~4000 tokens per task, ~10s per call
  const estimatedTokens = 4000;
  const inputCost = estimatedTokens * 0.5 * 0.000003; // $3 per 1M tokens
  const outputCost = estimatedTokens * 0.5 * 0.000015; // $15 per 1M tokens
  const totalCost = inputCost + outputCost;

  return {
    modelName: "Claude 3.5 Sonnet",
    estimatedTokens,
    estimatedCost: totalCost,
    estimatedTimeMs: 10000, // ~10 seconds
  };
}
