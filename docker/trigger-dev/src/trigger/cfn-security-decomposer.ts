/**
 * CFN Security Decomposer Task
 *
 * Analyzes tasks for security implications and decomposes into security-focused micro-tasks.
 * Receives architecture context from the baseline decomposer to inform security analysis.
 *
 * API Priority Chain:
 * 1. Cerebras (PRIMARY) - Fast inference with qwen-3-235b for security reasoning
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
 * @module cfn-security-decomposer
 * @version 3.0.0 - Unified GLM 4.6 with thinking enabled (reasoning needed for decomposition)
 */

import { task } from "@trigger.dev/sdk/v3";
import type { ArchitectureAnalysis, ArchitectureComponent, ArchitectureBoundary } from "./cfn-architecture-decomposer.js";
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

export interface SecurityDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  previousContext?: {
    architecture?: ArchitectureAnalysis;
    components?: ArchitectureComponent[];
    boundaries?: ArchitectureBoundary[];
  };
}

export interface SecurityBoundary {
  boundary: string;
  threatModel: string[];
  mitigations: string[];
  complianceRequirements?: string[];
}

export interface SecurityAnalysis {
  taskId: string;
  perspective: "security";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    threatVectors: string[];
  }>;
  securityRecommendations: string[];
  securityBoundaries: SecurityBoundary[];
  riskLevel: "critical" | "high" | "medium" | "low";
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
  securityRecommendations?: string[];
  securityBoundaries?: SecurityBoundary[];
  riskLevel?: "critical" | "high" | "medium" | "low";
}> {
  try {
    // First try parsing with enhanced JSON recovery
    return parseJSONFromResponse(content, contextName) as {
      microTasks?: Array<any>;
      securityRecommendations?: string[];
      securityBoundaries?: SecurityBoundary[];
      riskLevel?: "critical" | "high" | "medium" | "low";
    };
  } catch (parseError) {
    // JSON parsing failed even with sanitization - try GLM retry with thinking
    console.log(`[${contextName}] GLM returned malformed JSON, retrying with thinking enabled`);
    console.log(`[${contextName}] Parse error: ${(parseError as Error).message.substring(0, 100)}`);

    try {
      const retryResult = await callGLMWithThinking(prompt, DECOMPOSER_PRESET);
      return parseJSONFromResponse(retryResult.content, `${contextName}-glm-retry`) as {
        microTasks?: Array<any>;
        securityRecommendations?: string[];
        securityBoundaries?: SecurityBoundary[];
        riskLevel?: "critical" | "high" | "medium" | "low";
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

export const cfnSecurityDecomposerTask = task({
  id: "cfn-security-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: SecurityDecomposerPayload): Promise<SecurityAnalysis> => {
    const startTime = Date.now();

    // P0 Fix: Task 1 - Input Validation
    const validated = validateDecomposerInput(payload, "security-decomposer");

    console.log(`[security-decomposer] Analyzing task: ${validated.taskDescription.substring(0, 80)}...`);

    try {
      // Build context section if provided
      let contextSection = "";
      if (payload.previousContext?.architecture) {
        const arch = payload.previousContext.architecture;
        contextSection = `

ARCHITECTURE CONTEXT (from previous decomposer):
- Components: ${JSON.stringify(arch.components || [])}
- Boundaries: ${JSON.stringify(arch.boundaries || [])}
- Recommendations: ${JSON.stringify(arch.recommendations || [])}

Use this architecture context to identify security implications:
- Microservices → need inter-service authentication
- Payment services → PCI compliance requirements
- API boundaries → input validation, rate limiting
- Database access → SQL injection prevention
- Frontend → XSS, CSRF protection`;
      }

      const prompt = `You are a security specialist. Analyze this task for security implications and decompose into security-focused micro-tasks.

Task: ${validated.taskDescription}${contextSection}

IMPORTANT: Return ONLY valid JSON with NO comments, NO trailing commas. Use double quotes for all strings.

Provide:
1. Security-focused micro-tasks (ID, title, description, threat vectors)
2. Security recommendations informed by architecture
3. Security boundaries for inter-component communication
4. Overall risk level (critical|high|medium|low)

Format as JSON:
{
  "microTasks": [
    {
      "id": "sec-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Security concern",
      "threatVectors": ["injection", "xss", ...]
    }
  ],
  "securityRecommendations": ["...", "..."],
  "securityBoundaries": [
    {
      "boundary": "API Gateway <-> Auth Service",
      "threatModel": ["Token theft", "Replay attacks"],
      "mitigations": ["JWT with short expiry", "HTTPS only", "Rate limiting"],
      "complianceRequirements": ["GDPR", "PCI-DSS"]
    }
  ],
  "riskLevel": "critical|high|medium|low"
}`;

      // Use unified GLM 4.6 with thinking ENABLED (reasoning needed for decomposition)
      console.log(`[security-decomposer] Using ${GLM_MODEL_ID} with thinking enabled`);

      const glmResult = await callGLMWithThinking(prompt, DECOMPOSER_PRESET);

      // Convert to expected format for backward compatibility
      const data = {
        choices: [{ message: { content: glmResult.content } }]
      };
      const usedProvider = "GLM";

      console.log(`[security-decomposer] GLM API: ${glmResult.durationMs}ms, ${glmResult.inputTokens}+${glmResult.outputTokens} tokens (thinking: ${glmResult.thinkingEnabled})`);

      // P0 Fix: Task 3 - API Response Validation
      const validatedData = validateCerebrasResponse(data, "security-decomposer");
      const content = validatedData.choices[0].message.content;

      // Parse with enhanced JSON recovery and GLM fallback for malformed JSON
      const analysis = await parseWithFallback(content, prompt, "security-decomposer");

      // P0 Fix: Task 3 - Validate decomposition structure
      const validatedAnalysis = validateDecompositionOutput(analysis, "security-decomposer");

      const result: SecurityAnalysis = {
        taskId: validated.taskId,
        perspective: "security",
        microTasks: validatedAnalysis.microTasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          rationale: task.rationale || "",
          threatVectors: (task as any).threatVectors || [],
        })),
        securityRecommendations: analysis.securityRecommendations || [],
        securityBoundaries: analysis.securityBoundaries || [],
        riskLevel: analysis.riskLevel || "low",
      };

      console.log(`[security-decomposer] Success (${usedProvider}): Risk level ${result.riskLevel}, ${result.securityBoundaries.length} boundaries`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      const errorStack = (error as Error).stack || "No stack trace available";

      // P0 Fix: Enhanced error logging with full context
      console.error(`[security-decomposer] Critical Error: ${errorMsg}`);
      console.error(`[security-decomposer] Stack trace: ${errorStack}`);
      console.error(
        `[security-decomposer] Context: taskId=${payload.taskId}, ` +
          `taskDescription length=${payload.taskDescription?.length || 0} chars`
      );

      // P0 Fix: Fail fast - do NOT return empty results silently
      throw new Error(
        `[security-decomposer] Failed to decompose task: ${errorMsg}\n` +
          `This is a critical error. Security analysis is mandatory for production tasks.\n` +
          `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
      );
    }
  },
});