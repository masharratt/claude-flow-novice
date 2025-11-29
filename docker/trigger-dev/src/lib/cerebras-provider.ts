/**
 * Cerebras Provider for MDAP v2
 *
 * Intelligent model selection for task decomposition, implementation, and validation.
 * Optimized for cost, speed, and quality with tight iteration loops.
 *
 * Model Selection Strategy:
 * - Task Decomposition: qwen-3-235b (advanced reasoning)
 * - Implementation: gpt-oss-120b (code quality + speed)
 * - Validation/Refinement: llama-3.3-70b (instruction following)
 * - Quick Fixes: gpt-oss-120b (fast iteration)
 */

import * as fs from "fs";
import { execSync } from "child_process";

// =============================================
// Types
// =============================================

export type TaskType = "decompose" | "implement" | "validate" | "refine";
export type Complexity = "simple" | "moderate" | "complex";

interface CerebrasModel {
  id: string;
  name: string;
  contextWindow: number;
  costPer1MTok: { input: number; output: number };
  bestFor: string[];
  tier: "fast" | "balanced" | "reasoning";
}

interface GenerateResult {
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

interface TaskEstimate {
  modelName: string;
  estimatedTokens: number;
  estimatedCost: number;
  estimatedTimeMs: number;
}

// =============================================
// Constants
// =============================================

const CEREBRAS_API_URL = "https://api.cerebras.ai/v1";
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const RATE_LIMIT_MS = 2000; // 2s between requests

// Available Cerebras models
const MODELS: Record<string, CerebrasModel> = {
  "gpt-oss-120b": {
    id: "gpt-oss-120b",
    name: "GPT-OSS-120B",
    contextWindow: 200000,
    costPer1MTok: { input: 0.00000125, output: 0.00000125 },
    bestFor: ["code-generation", "implementation", "refactoring", "quick-tasks"],
    tier: "fast",
  },
  "llama-3.3-70b": {
    id: "llama-3.3-70b",
    name: "Llama 3.3 70B",
    contextWindow: 128000,
    costPer1MTok: { input: 0.00000088, output: 0.00000088 },
    bestFor: ["instruction-following", "validation", "edge-cases", "refinement"],
    tier: "balanced",
  },
  "qwen-3-235b-a22b-instruct-2507": {
    id: "qwen-3-235b-a22b-instruct-2507",
    name: "Qwen 3 235B",
    contextWindow: 256000,
    costPer1MTok: { input: 0.00000233, output: 0.00000233 },
    bestFor: ["complex-reasoning", "task-decomposition", "planning", "architecture"],
    tier: "reasoning",
  },
  "qwen-3-32b": {
    id: "qwen-3-32b",
    name: "Qwen 3 32B",
    contextWindow: 128000,
    costPer1MTok: { input: 0.00000088, output: 0.00000088 },
    bestFor: ["lightweight-tasks", "fast-implementation", "code-reviews"],
    tier: "fast",
  },
  "zai-glm-4.6": {
    id: "zai-glm-4.6",
    name: "GLM 4.6",
    contextWindow: 200000,
    costPer1MTok: { input: 0.0000003, output: 0.0000003 },
    bestFor: ["fallback", "cost-sensitive"],
    tier: "fast",
  },
};

// =============================================
// Model Selection
// =============================================

/**
 * Select optimal model for task type and complexity
 */
export function selectModelForTask(
  taskType: TaskType,
  complexity: Complexity = "moderate"
): string {
  // Task decomposition: use reasoning model for complex tasks
  if (taskType === "decompose") {
    return complexity === "complex"
      ? "qwen-3-235b-a22b-instruct-2507"
      : "gpt-oss-120b";
  }

  // Implementation: prefer speed for simple, quality for complex
  if (taskType === "implement") {
    if (complexity === "simple") return "gpt-oss-120b";
    if (complexity === "moderate") return "llama-3.3-70b";
    return "qwen-3-235b-a22b-instruct-2507"; // complex
  }

  // Validation: use instruction-following model
  if (taskType === "validate") {
    return "llama-3.3-70b";
  }

  // Quick refinement: use fast model
  if (taskType === "refine") {
    return "gpt-oss-120b";
  }

  return "gpt-oss-120b"; // default
}

/**
 * Get model metadata
 */
export function getModel(modelId: string): CerebrasModel {
  return MODELS[modelId] || MODELS["gpt-oss-120b"];
}

/**
 * List available models
 */
export function getAvailableModels(): CerebrasModel[] {
  return Object.values(MODELS);
}

// =============================================
// API Calls
// =============================================

let lastCallMs = 0;

async function enforceRateLimit() {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallMs;
  if (timeSinceLastCall < RATE_LIMIT_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastCall)
    );
  }
  lastCallMs = Date.now();
}

/**
 * Call Cerebras API with specified model
 */
export async function callCerebras(
  prompt: string,
  modelId: string = "gpt-oss-120b",
  maxTokens: number = 2048
): Promise<{ content: string; tokensUsed: number }> {
  if (!CEREBRAS_API_KEY) {
    throw new Error("CEREBRAS_API_KEY not set");
  }

  await enforceRateLimit();

  const response = await fetch(`${CEREBRAS_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cerebras API error: ${response.status} - ${error.substring(0, 100)}`);
  }

  const data = (await response.json()) as any;
  const content = data.choices[0]?.message?.content || "";
  const tokensUsed = data.usage?.total_tokens || 0;

  return { content, tokensUsed };
}

// =============================================
// Code Generation & Testing
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
  const tmpFile = `/tmp/cerebras-test-${Date.now()}.js`;
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
// Generation with Optional Testing
// =============================================

/**
 * Generate implementation and tests (with optional local validation)
 */
export async function generateWithTests(
  taskDescription: string,
  modelId: string = "gpt-oss-120b",
  validateLocally: boolean = false
): Promise<GenerateResult> {
  const startMs = Date.now();

  const prompt = `You are an expert TypeScript/JavaScript developer.

Task: ${taskDescription}

Instructions:
1. Generate ONLY valid JavaScript/TypeScript code (no markdown)
2. First section: Implementation (function/class, under 50 lines)
3. Separate sections with: // ==== TESTS ====
4. Second section: Node.js test code (3-5 test cases, use console.assert)
5. All code must run immediately in Node.js
6. Do NOT use external packages

Start with implementation, then tests:`;

  const { content, tokensUsed: genTokens } = await callCerebras(prompt, modelId, 2048);
  const { implementation, tests } = parseResponse(content);

  // Optional local validation
  if (validateLocally && tests) {
    const testResult = runTests(implementation, tests);
    if (!testResult.passed) {
      console.warn(`[cerebras-provider] Tests failed: ${testResult.error}`);
    }
  }

  return {
    implementation,
    tests,
    modelUsed: modelId,
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
  maxIterations: number = 3,
  complexity: Complexity = "moderate"
): Promise<IterationResult> {
  const startMs = Date.now();
  const modelId = selectModelForTask("implement", complexity);
  let totalTokens = 0;
  let lastError = "";

  for (let iter = 1; iter <= maxIterations; iter++) {
    const prompt =
      iter === 1
        ? `You are an expert developer. Generate implementation and tests.

Task: ${taskDescription}

Instructions:
1. Return ONLY valid JavaScript code (no markdown, no backticks)
2. First section: Implementation (function/class, under 50 lines)
3. Then: // ==== TESTS ====
4. Then: Node.js tests (3-5 test cases with console.assert)
5. Make it work immediately in Node.js`
        : `Fix the previous implementation based on this error:

${lastError}

Task: ${taskDescription}

Return ONLY the corrected implementation and tests (same format).`;

    try {
      const { content, tokensUsed } = await callCerebras(prompt, modelId, 2048);
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
            modelUsed: modelId,
          };
        }
        lastError = `Tests failed:\n${testResult.error}`;
      } else {
        // No tests generated, assume success
        return {
          implementation,
          tests,
          success: true,
          iterations: iter,
          totalTokens,
          totalTimeMs: Date.now() - startMs,
          modelUsed: modelId,
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
          modelUsed: modelId,
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
    modelUsed: modelId,
  };
}

// =============================================
// Cost & Time Estimation
// =============================================

/**
 * Estimate cost and time for a task
 */
export function estimateTask(
  taskType: TaskType,
  complexity: Complexity = "moderate"
): TaskEstimate {
  const modelId = selectModelForTask(taskType, complexity);
  const model = getModel(modelId);

  // Estimate tokens based on complexity
  let estimatedTokens = 1500;
  if (complexity === "simple") estimatedTokens = 800;
  if (complexity === "complex") estimatedTokens = 3500;

  // Add iteration overhead
  const firstTrySuccessRate = complexity === "simple" ? 0.95 : 0.67;
  const expectedIterations = 1 / firstTrySuccessRate;
  estimatedTokens = Math.round(estimatedTokens * expectedIterations);

  const inputCost = (estimatedTokens * 0.5 * model.costPer1MTok.input) / 1000000;
  const outputCost = (estimatedTokens * 0.5 * model.costPer1MTok.output) / 1000000;
  const totalCost = inputCost + outputCost;

  // Estimate time: ~500ms per API call + test execution
  const estimatedTimeMs = Math.round(500 * expectedIterations + 100);

  return {
    modelName: model.name,
    estimatedTokens,
    estimatedCost: totalCost,
    estimatedTimeMs,
  };
}

/**
 * Estimate cost for multiple tasks
 */
export function estimateWorkload(
  tasks: Array<{ complexity: Complexity; count: number }>
): {
  totalTokens: number;
  totalCost: number;
  totalTimeMs: number;
} {
  let totalTokens = 0;
  let totalCost = 0;
  let totalTimeMs = 0;

  tasks.forEach(({ complexity, count }) => {
    const estimate = estimateTask("implement", complexity);
    totalTokens += estimate.estimatedTokens * count;
    totalCost += estimate.estimatedCost * count;
    totalTimeMs += estimate.estimatedTimeMs * count;
  });

  return { totalTokens, totalCost, totalTimeMs };
}

// =============================================
// Analytics
// =============================================

interface TaskMetrics {
  taskId: string;
  modelUsed: string;
  iterations: number;
  success: boolean;
  tokensUsed: number;
  timeMs: number;
  complexity: Complexity;
}

const metrics: TaskMetrics[] = [];

/**
 * Record task execution metrics
 */
export function recordMetrics(metric: TaskMetrics): void {
  metrics.push(metric);
}

/**
 * Get analytics for recorded tasks
 */
export function getAnalytics(): {
  totalTasks: number;
  successRate: number;
  avgIterations: number;
  avgTokens: number;
  avgTimeMs: number;
  costEstimate: number;
} {
  const successful = metrics.filter((m) => m.success).length;
  const avgIterations =
    metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.iterations, 0) / metrics.length
      : 0;
  const avgTokens =
    metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.tokensUsed, 0) / metrics.length
      : 0;
  const avgTimeMs =
    metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.timeMs, 0) / metrics.length
      : 0;

  // Cost calculation: average tokens * Cerebras rate
  const avgCostPerToken = 0.00000125; // GPT-OSS-120B rate
  const costEstimate = avgTokens * avgCostPerToken;

  return {
    totalTasks: metrics.length,
    successRate: metrics.length > 0 ? successful / metrics.length : 0,
    avgIterations,
    avgTokens,
    avgTimeMs,
    costEstimate,
  };
}

/**
 * Reset analytics
 */
export function resetAnalytics(): void {
  metrics.length = 0;
}
