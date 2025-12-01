/**
 * CFN Testing Decomposer Task
 *
 * Analyzes tasks for testing requirements and decomposes into testing-focused micro-tasks.
 * Receives full context from architecture, security, and performance decomposers.
 *
 * API Priority Chain:
 * 1. Cerebras (PRIMARY) - Fast inference with llama-3.3-70b for test planning
 * 2. Groq (FALLBACK) - Used when Cerebras fails (429 rate limit, API errors)
 *
 * Note: Groq free tier is unreliable with aggressive rate limiting.
 * Use as fallback only, not primary.
 *
 * JSON Parsing Robustness:
 * - Handles trailing commas, comments, unquoted property names
 * - Falls back to extracting just microTasks array if full parse fails
 * - Retries with Groq if Cerebras returns malformed JSON
 *
 * @module cfn-testing-decomposer
 * @version 2.0.0 - Enhanced JSON parsing and Groq fallback
 */

import { task } from "@trigger.dev/sdk/v3";
import type { ArchitectureAnalysis } from "./cfn-architecture-decomposer.js";
import type { SecurityAnalysis } from "./cfn-security-decomposer.js";
import type { PerformanceAnalysis } from "./cfn-performance-decomposer.js";
import {
  validateDecomposerInput,
  validateCerebrasResponse,
  validateDecompositionOutput,
  parseJSONFromResponse,
} from "../lib/validation-schemas.js";

export interface TestingDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  previousContext?: {
    architecture?: ArchitectureAnalysis;
    securityConstraints?: SecurityAnalysis;
    performanceConstraints?: PerformanceAnalysis;
  };
}

export interface TestRequirement {
  component: string;
  testType: "unit" | "integration" | "e2e" | "security" | "performance" | "load";
  scenarios: string[];
  priority: "critical" | "high" | "medium" | "low";
}

export interface TestingAnalysis {
  taskId: string;
  perspective: "testing";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    testTypes: string[];
  }>;
  testingRecommendations: string[];
  testRequirements: TestRequirement[];
  coverageGoal: number;
}

// =============================================
// Helper Functions
// =============================================

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Cerebras API for decomposition (PRIMARY)
 * Fast inference with reliable rate limits.
 */
async function callCerebrasAPI(prompt: string): Promise<{
  choices: Array<{ message: { content: string } }>;
}> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error("CEREBRAS_API_KEY environment variable not set");
  }

  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 30000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2048,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      let delayMs: number;

      if (retryAfter) {
        delayMs = parseInt(retryAfter, 10) * 1000;
      } else {
        const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 500;
        delayMs = Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
      }

      console.log(`[testing-decomposer] Cerebras rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`);
      await sleep(delayMs);
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      lastError = new Error(
        `Cerebras API error: ${response.status} - ${errorBody}\n` +
        `Check API key validity and quota limits.`
      );

      if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[testing-decomposer] Cerebras server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw lastError;
    }

    return await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
  }

  throw lastError || new Error(`Cerebras API failed after ${MAX_RETRIES} retries due to rate limiting`);
}

/**
 * Call Groq API as fallback when Cerebras is rate limited or returns malformed JSON.
 *
 * Note: Groq free tier is unreliable with aggressive rate limiting.
 * Use as fallback only.
 */
async function callGroqAPI(prompt: string): Promise<{
  choices: Array<{ message: { content: string } }>;
}> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable not set for fallback");
  }

  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 30000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2048,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      let delayMs: number;

      if (retryAfter) {
        delayMs = parseInt(retryAfter, 10) * 1000;
      } else {
        const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 500;
        delayMs = Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
      }

      console.log(`[testing-decomposer] Groq rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`);
      await sleep(delayMs);
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      lastError = new Error(
        `Groq API error: ${response.status} - ${errorBody}\n` +
        `Check API key validity and quota limits.`
      );

      if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[testing-decomposer] Groq server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw lastError;
    }

    return await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
  }

  throw lastError || new Error(`Groq API failed after ${MAX_RETRIES} retries due to rate limiting`);
}

/**
 * Parse decomposition response with fallback to Groq if JSON is malformed.
 */
async function parseWithFallback(
  content: string,
  prompt: string,
  contextName: string
): Promise<{
  microTasks?: Array<any>;
  testingRecommendations?: string[];
  testRequirements?: TestRequirement[];
  coverageGoal?: number;
}> {
  try {
    // First try parsing with enhanced JSON recovery
    return parseJSONFromResponse(content, contextName) as {
      microTasks?: Array<any>;
      testingRecommendations?: string[];
      testRequirements?: TestRequirement[];
      coverageGoal?: number;
    };
  } catch (parseError) {
    // JSON parsing failed even with sanitization - try Groq as fallback
    console.log(`[${contextName}] Cerebras returned malformed JSON, trying Groq fallback`);
    console.log(`[${contextName}] Parse error: ${(parseError as Error).message.substring(0, 100)}`);

    try {
      const groqData = await callGroqAPI(prompt);
      const groqContent = groqData.choices[0].message.content;
      return parseJSONFromResponse(groqContent, `${contextName}-groq-fallback`) as {
        microTasks?: Array<any>;
        testingRecommendations?: string[];
        testRequirements?: TestRequirement[];
        coverageGoal?: number;
      };
    } catch (groqError) {
      // Both Cerebras JSON and Groq failed
      throw new Error(
        `[${contextName}] JSON parsing failed for both Cerebras and Groq.\n` +
        `Cerebras error: ${(parseError as Error).message.substring(0, 150)}\n` +
        `Groq error: ${(groqError as Error).message.substring(0, 150)}`
      );
    }
  }
}

export const cfnTestingDecomposerTask = task({
  id: "cfn-testing-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: TestingDecomposerPayload): Promise<TestingAnalysis> => {
    const startTime = Date.now();

    // P0 Fix: Task 1 - Input Validation
    const validated = validateDecomposerInput(payload, "testing-decomposer");

    console.log(`[testing-decomposer] Analyzing task: ${validated.taskDescription.substring(0, 80)}...`);

    try {
      // Build comprehensive context section
      let contextSection = "";
      if (payload.previousContext?.architecture ||
          payload.previousContext?.securityConstraints ||
          payload.previousContext?.performanceConstraints) {
        const parts = [];

        if (payload.previousContext.architecture) {
          const arch = payload.previousContext.architecture;
          parts.push(`ARCHITECTURE CONTEXT:
- Components: ${JSON.stringify(arch.components || [])}
- Boundaries: ${JSON.stringify(arch.boundaries || [])}`);
        }

        if (payload.previousContext.securityConstraints) {
          const sec = payload.previousContext.securityConstraints;
          parts.push(`SECURITY CONSTRAINTS:
- Risk Level: ${sec.riskLevel}
- Security Boundaries: ${JSON.stringify(sec.securityBoundaries || [])}`);
        }

        if (payload.previousContext.performanceConstraints) {
          const perf = payload.previousContext.performanceConstraints;
          parts.push(`PERFORMANCE CONSTRAINTS:
- Constraints: ${JSON.stringify(perf.performanceConstraints || [])}
- Optimization Strategy: ${perf.optimizationStrategy}`);
        }

        contextSection = `

${parts.join('\n\n')}

Use this context to create comprehensive test strategy:
- Test inter-service failures (from architecture boundaries)
- Test auth token expiry (from security constraints)
- Test cache invalidation (from performance optimizations)
- Test certificate rotation (from security mTLS)
- Test connection failure recovery (from performance pooling)
- Load test with performance targets (from constraints)`;
      }

      const prompt = `You are a QA engineer. Analyze this task for testing requirements and decompose into testing-focused micro-tasks.

Task: ${validated.taskDescription}${contextSection}

IMPORTANT: Return ONLY valid JSON with NO comments, NO trailing commas. Use double quotes for all strings.

Provide:
1. Testing-focused micro-tasks (ID, title, description, test types)
2. Testing recommendations informed by architecture, security, and performance
3. Detailed test requirements per component
4. Coverage goal percentage

Format as JSON:
{
  "microTasks": [
    {
      "id": "test-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Test coverage",
      "testTypes": ["unit", "integration", "e2e", "security", "performance"]
    }
  ],
  "testingRecommendations": ["...", "..."],
  "testRequirements": [
    {
      "component": "AuthService",
      "testType": "unit|integration|e2e|security|performance|load",
      "scenarios": ["Token expiry", "Refresh flow", "Rate limiting"],
      "priority": "critical|high|medium|low"
    }
  ],
  "coverageGoal": 85
}`;

      let data: { choices: Array<{ message: { content: string } }> };
      let usedProvider = "Cerebras";

      // Try Cerebras first, fallback to Groq on 429 or API errors
      try {
        data = await callCerebrasAPI(prompt);
      } catch (cerebrasError) {
        const errorMsg = (cerebrasError as Error).message;

        if (errorMsg.includes('429') || errorMsg.includes('rate limit') ||
            errorMsg.includes('500') || errorMsg.includes('502') ||
            errorMsg.includes('503') || errorMsg.includes('504') ||
            errorMsg.includes('timeout') || errorMsg.includes('CEREBRAS_API_KEY')) {
          console.log(`[testing-decomposer] Cerebras failed, falling back to Groq: ${errorMsg.substring(0, 100)}`);
          data = await callGroqAPI(prompt);
          usedProvider = "Groq";
        } else {
          throw cerebrasError;
        }
      }

      // P0 Fix: Task 3 - API Response Validation
      const validatedData = validateCerebrasResponse(data, "testing-decomposer");
      const content = validatedData.choices[0].message.content;

      // Parse with enhanced JSON recovery and Groq fallback for malformed JSON
      const analysis = await parseWithFallback(content, prompt, "testing-decomposer");

      // P0 Fix: Task 3 - Validate decomposition structure
      const validatedAnalysis = validateDecompositionOutput(analysis, "testing-decomposer");

      const result: TestingAnalysis = {
        taskId: validated.taskId,
        perspective: "testing",
        microTasks: validatedAnalysis.microTasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          rationale: task.rationale || "",
          testTypes: (task as any).testTypes || [],
        })),
        testingRecommendations: analysis.testingRecommendations || [],
        testRequirements: analysis.testRequirements || [],
        coverageGoal: analysis.coverageGoal || 80,
      };

      console.log(`[testing-decomposer] Success (${usedProvider}): Coverage goal ${result.coverageGoal}%, ${result.testRequirements.length} test requirements`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      const errorStack = (error as Error).stack || "No stack trace available";

      // P0 Fix: Enhanced error logging with full context
      console.error(`[testing-decomposer] Critical Error: ${errorMsg}`);
      console.error(`[testing-decomposer] Stack trace: ${errorStack}`);
      console.error(
        `[testing-decomposer] Context: taskId=${payload.taskId}, ` +
          `taskDescription length=${payload.taskDescription?.length || 0} chars`
      );

      // P0 Fix: Fail fast - do NOT return empty results silently
      throw new Error(
        `[testing-decomposer] Failed to decompose task: ${errorMsg}\n` +
          `This is a critical error. Testing requirements are mandatory for production tasks.\n` +
          `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
      );
    }
  },
});
