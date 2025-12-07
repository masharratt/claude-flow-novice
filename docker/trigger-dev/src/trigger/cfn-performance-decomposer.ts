/**
 * CFN Performance Decomposer Task
 *
 * Analyzes tasks for performance considerations and decomposes into performance-focused micro-tasks.
 * Receives architecture and security context from previous decomposers to inform analysis.
 *
 * API Priority Chain:
 * 1. Cerebras (PRIMARY) - Fast inference with llama-3.3-70b for performance reasoning
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
 * @module cfn-performance-decomposer
 * @version 3.0.0 - Unified GLM 4.6 with thinking enabled (reasoning needed for decomposition)
 */

import { task } from "@trigger.dev/sdk/v3";
import type { ArchitectureAnalysis } from "./cfn-architecture-decomposer.js";
import type { SecurityAnalysis } from "./cfn-security-decomposer.js";
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

export interface PerformanceDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  previousContext?: {
    architecture?: ArchitectureAnalysis;
    securityConstraints?: SecurityAnalysis;
    securityBoundaries?: any[];
  };
}

export interface PerformanceConstraint {
  metric: "latency" | "throughput" | "memory" | "cpu" | "bandwidth";
  target: string;
  rationale: string;
  impactedComponents: string[];
}

export interface PerformanceAnalysis {
  taskId: string;
  perspective: "performance";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    metrics: string[];
  }>;
  performanceRecommendations: string[];
  performanceConstraints: PerformanceConstraint[];
  optimizationStrategy: string;
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
  performanceRecommendations?: string[];
  performanceConstraints?: PerformanceConstraint[];
  optimizationStrategy?: string;
}> {
  try {
    // First try parsing with enhanced JSON recovery
    return parseJSONFromResponse(content, contextName) as {
      microTasks?: Array<any>;
      performanceRecommendations?: string[];
      performanceConstraints?: PerformanceConstraint[];
      optimizationStrategy?: string;
    };
  } catch (parseError) {
    // JSON parsing failed even with sanitization - try GLM retry with thinking
    console.log(`[${contextName}] GLM returned malformed JSON, retrying with thinking enabled`);
    console.log(`[${contextName}] Parse error: ${(parseError as Error).message.substring(0, 100)}`);

    try {
      const retryResult = await callGLMWithThinking(prompt, DECOMPOSER_PRESET);
      return parseJSONFromResponse(retryResult.content, `${contextName}-glm-retry`) as {
        microTasks?: Array<any>;
        performanceRecommendations?: string[];
        performanceConstraints?: PerformanceConstraint[];
        optimizationStrategy?: string;
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

export const cfnPerformanceDecomposerTask = task({
  id: "cfn-performance-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: PerformanceDecomposerPayload): Promise<PerformanceAnalysis> => {
    const startTime = Date.now();

    // P0 Fix: Task 1 - Input Validation
    const validated = validateDecomposerInput(payload, "performance-decomposer");

    console.log(`[performance-decomposer] Analyzing task: ${validated.taskDescription.substring(0, 80)}...`);

    try {
      // Build context section if provided
      let contextSection = "";
      if (payload.previousContext?.architecture || payload.previousContext?.securityConstraints) {
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
- Security Recommendations: ${JSON.stringify(sec.securityRecommendations || [])}
- Security Boundaries: ${JSON.stringify(sec.securityBoundaries || [])}
- Risk Level: ${sec.riskLevel}`);
        }

        contextSection = `

${parts.join('\n\n')}

Use this context to identify performance implications:
- Inter-service calls → latency overhead, need caching
- Security encryption/auth → CPU overhead, need connection pooling
- Multiple boundaries → cascading failures, need circuit breakers
- Database access → query optimization, connection pooling`;
      }

      const prompt = `You are a performance engineer. Analyze this task for performance considerations and decompose into performance-focused micro-tasks.

Task: ${validated.taskDescription}${contextSection}

IMPORTANT: Return ONLY valid JSON with NO comments, NO trailing commas. Use double quotes for all strings.

Provide:
1. Performance-focused micro-tasks (ID, title, description, metrics)
2. Performance recommendations informed by architecture and security
3. Performance constraints (latency, throughput, memory targets)
4. Optimization strategy

Format as JSON:
{
  "microTasks": [
    {
      "id": "perf-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Performance optimization",
      "metrics": ["latency", "memory", ...]
    }
  ],
  "performanceRecommendations": ["...", "..."],
  "performanceConstraints": [
    {
      "metric": "latency|throughput|memory|cpu|bandwidth",
      "target": "< 100ms p95",
      "rationale": "User experience requirement",
      "impactedComponents": ["APIGateway", "AuthService"]
    }
  ],
  "optimizationStrategy": "..."
}`;

      // Use unified GLM 4.6 with thinking ENABLED (reasoning needed for decomposition)
      console.log(`[performance-decomposer] Using ${GLM_MODEL_ID} with thinking enabled`);

      const glmResult = await callGLMWithThinking(prompt, DECOMPOSER_PRESET);

      // Convert to expected format for backward compatibility
      const data = {
        choices: [{ message: { content: glmResult.content } }]
      };
      const usedProvider = "GLM";

      console.log(`[performance-decomposer] GLM API: ${glmResult.durationMs}ms, ${glmResult.inputTokens}+${glmResult.outputTokens} tokens (thinking: ${glmResult.thinkingEnabled})`);

      // P0 Fix: Task 3 - API Response Validation
      const validatedData = validateCerebrasResponse(data, "performance-decomposer");
      const content = validatedData.choices[0].message.content;

      // Parse with enhanced JSON recovery and GLM fallback for malformed JSON
      const analysis = await parseWithFallback(content, prompt, "performance-decomposer");

      // P0 Fix: Task 3 - Validate decomposition structure
      const validatedAnalysis = validateDecompositionOutput(analysis, "performance-decomposer");

      const result: PerformanceAnalysis = {
        taskId: validated.taskId,
        perspective: "performance",
        microTasks: validatedAnalysis.microTasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          rationale: task.rationale || "",
          metrics: (task as any).metrics || [],
        })),
        performanceRecommendations: analysis.performanceRecommendations || [],
        performanceConstraints: analysis.performanceConstraints || [],
        optimizationStrategy: analysis.optimizationStrategy || "",
      };

      console.log(`[performance-decomposer] Success (${usedProvider}): ${result.microTasks.length} micro-tasks, ${result.performanceConstraints.length} constraints`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      const errorStack = (error as Error).stack || "No stack trace available";

      // P0 Fix: Enhanced error logging with full context
      console.error(`[performance-decomposer] Critical Error: ${errorMsg}`);
      console.error(`[performance-decomposer] Stack trace: ${errorStack}`);
      console.error(
        `[performance-decomposer] Context: taskId=${payload.taskId}, ` +
          `taskDescription length=${payload.taskDescription?.length || 0} chars`
      );

      // P0 Fix: Fail fast - do NOT return empty results silently
      throw new Error(
        `[performance-decomposer] Failed to decompose task: ${errorMsg}\n` +
          `This is a critical error. Performance analysis is mandatory for production tasks.\n` +
          `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
      );
    }
  },
});