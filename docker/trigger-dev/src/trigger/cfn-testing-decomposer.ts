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
 * @version 3.0.0 - Unified GLM 4.6 with thinking enabled (reasoning needed for decomposition)
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
import {
  callGLMWithThinking,
  GLM_MODEL_ID,
  DECOMPOSER_PRESET,
} from "../lib/glm-provider.js";

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
 * Parse decomposition response with fallback to GLM if JSON is malformed.
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
    // JSON parsing failed even with sanitization - try GLM retry with thinking
    console.log(`[${contextName}] GLM returned malformed JSON, retrying with thinking enabled`);
    console.log(`[${contextName}] Parse error: ${(parseError as Error).message.substring(0, 100)}`);

    try {
      const retryResult = await callGLMWithThinking(prompt, DECOMPOSER_PRESET);
      return parseJSONFromResponse(retryResult.content, `${contextName}-glm-retry`) as {
        microTasks?: Array<any>;
        testingRecommendations?: string[];
        testRequirements?: TestRequirement[];
        coverageGoal?: number;
      };
    } catch (retryError) {
      // Both attempts failed
      throw new Error(
        `[${contextName}] JSON parsing failed for both GLM attempts.\n` +
        `Initial error: ${(parseError as Error).message.substring(0, 150)}\n` +
        `Retry error: ${(retryError as Error).message.substring(0, 150)}`
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

      // Use unified GLM 4.6 with thinking ENABLED (reasoning needed for decomposition)
      console.log(`[testing-decomposer] Using ${GLM_MODEL_ID} with thinking enabled`);

      const glmResult = await callGLMWithThinking(prompt, DECOMPOSER_PRESET);

      // Convert to expected format for backward compatibility
      const data = {
        choices: [{ message: { content: glmResult.content } }]
      };
      const usedProvider = "GLM";

      console.log(`[testing-decomposer] GLM API: ${glmResult.durationMs}ms, ${glmResult.inputTokens}+${glmResult.outputTokens} tokens (thinking: ${glmResult.thinkingEnabled})`);

      // P0 Fix: Task 3 - API Response Validation
      const validatedData = validateCerebrasResponse(data, "testing-decomposer");
      const content = validatedData.choices[0].message.content;

      // Parse with enhanced JSON recovery and GLM fallback for malformed JSON
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