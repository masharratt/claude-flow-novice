/**
 * CFN Architecture Decomposer Task
 *
 * Analyzes tasks for architectural concerns and decomposes into atomic micro-tasks.
 * This is the baseline decomposer in the swarm - runs first with no prior context.
 *
 * API Priority Chain:
 * 1. Cerebras (PRIMARY) - Fast inference with qwen-3-235b for architecture reasoning
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
 * @module cfn-architecture-decomposer
 * @version 3.0.0 - Unified GLM 4.6 with thinking enabled (reasoning needed for decomposition)
 */

import { task } from "@trigger.dev/sdk/v3";
import {
  validateDecomposerInput,
  validateCerebrasResponse,
  validateDecompositionOutput,
  validateDecomposerOutput,
  validateDependencyGraph,
  parseJSONFromResponse,
} from "../lib/validation-schemas.js";
import {
  callGLMWithThinking,
  GLM_MODEL_ID,
  DECOMPOSER_PRESET,
} from "../lib/glm-provider.js";

export interface ArchitectureDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  previousContext?: never; // Architecture is baseline, no context
}

export interface ArchitectureComponent {
  name: string;
  type: "service" | "api" | "database" | "frontend" | "middleware" | "gateway";
  responsibilities: string[];
  dependencies: string[];
}

export interface ArchitectureBoundary {
  from: string;
  to: string;
  type: "sync" | "async" | "event" | "data";
  protocol?: string;
  constraints?: string[];
}

export interface ArchitectureAnalysis {
  taskId: string;
  perspective: "architecture";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    dependencies: string[];
  }>;
  recommendations: string[];
  components: ArchitectureComponent[];
  boundaries: ArchitectureBoundary[];
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
          model: "qwen-3-235b-a22b-instruct-2507",
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

      console.log(`[architecture-decomposer] Cerebras rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`);
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
        console.log(`[architecture-decomposer] Cerebras server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
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

      console.log(`[architecture-decomposer] Groq rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`);
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
        console.log(`[architecture-decomposer] Groq server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
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
  recommendations?: string[];
  components?: ArchitectureComponent[];
  boundaries?: ArchitectureBoundary[];
}> {
  try {
    // First try parsing with enhanced JSON recovery
    return parseJSONFromResponse(content, contextName) as {
      microTasks?: Array<any>;
      recommendations?: string[];
      components?: ArchitectureComponent[];
      boundaries?: ArchitectureBoundary[];
    };
  } catch (parseError) {
    // JSON parsing failed even with sanitization - try GLM retry with thinking
    console.log(`[${contextName}] GLM returned malformed JSON, retrying with thinking enabled`);
    console.log(`[${contextName}] Parse error: ${(parseError as Error).message.substring(0, 100)}`);

    try {
      const retryResult = await callGLMWithThinking(prompt, DECOMPOSER_PRESET);
      return parseJSONFromResponse(retryResult.content, `${contextName}-glm-retry`) as {
        microTasks?: Array<any>;
        recommendations?: string[];
        components?: ArchitectureComponent[];
        boundaries?: ArchitectureBoundary[];
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

export const cfnArchitectureDecomposerTask = task({
  id: "cfn-architecture-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: ArchitectureDecomposerPayload): Promise<ArchitectureAnalysis> => {
    const startTime = Date.now();

    // P0 Fix: Task 1 - Input Validation
    const validated = validateDecomposerInput(payload, "architecture-decomposer");

    console.log(`[architecture-decomposer] Analyzing task: ${validated.taskDescription.substring(0, 80)}...`);

    try {
      // Use Qwen-3-235B (best for architecture reasoning)
      const prompt = `You are an expert software architect. Analyze this task and decompose it into atomic micro-tasks focusing on architectural concerns.

Task: ${validated.taskDescription}

Provide:
1. List of micro-tasks needed (ID, title, description, priority, dependencies)
2. Architectural recommendations
3. System components (services, APIs, databases, etc.)
4. Boundaries between components (sync/async communication, data flow)

IMPORTANT: Return ONLY valid JSON with NO comments, NO trailing commas. Use double quotes for all strings.

Format as JSON with structure:
{
  "microTasks": [
    {
      "id": "arch-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Why this is architecturally important",
      "dependencies": []
    }
  ],
  "recommendations": ["...", "..."],
  "components": [
    {
      "name": "AuthService",
      "type": "service|api|database|frontend|middleware|gateway",
      "responsibilities": ["Handle authentication", "Manage sessions"],
      "dependencies": ["UserDatabase", "TokenCache"]
    }
  ],
  "boundaries": [
    {
      "from": "APIGateway",
      "to": "AuthService",
      "type": "sync|async|event|data",
      "protocol": "REST/HTTP",
      "constraints": ["Rate limiting", "Authentication required"]
    }
  ]
}`;

      // Use unified GLM 4.6 with thinking ENABLED (reasoning needed for decomposition)
      // https://inference-docs.cerebras.ai/resources/glm-migration#7-minimize-reasoning-when-not-needed
      console.log(`[architecture-decomposer] Using ${GLM_MODEL_ID} with thinking enabled`);

      const glmResult = await callGLMWithThinking(prompt, DECOMPOSER_PRESET);

      // Convert to expected format for backward compatibility
      const data = {
        choices: [{ message: { content: glmResult.content } }]
      };
      const usedProvider = "GLM";

      console.log(`[architecture-decomposer] GLM API: ${glmResult.durationMs}ms, ${glmResult.inputTokens}+${glmResult.outputTokens} tokens (thinking: ${glmResult.thinkingEnabled})`);

      // P0 Fix: Task 3 - API Response Validation
      const validatedData = validateCerebrasResponse(data, "architecture-decomposer");
      const content = validatedData.choices[0].message.content;

      // Parse with enhanced JSON recovery and Groq fallback for malformed JSON
      const analysis = await parseWithFallback(content, prompt, "architecture-decomposer");

      // Track if we used Groq for JSON recovery
      if (usedProvider === "Cerebras" && analysis) {
        // Check if parseWithFallback used Groq (would have logged it)
        // This is informational only
      }

      // P0 Fix: Task 3 - Validate decomposition structure
      const validatedAnalysis = validateDecompositionOutput(analysis, "architecture-decomposer");

      // P0 FIX sec-1.3: Add strict output type validation
      // Validates: field types, required properties, string lengths, ID formats
      const fullOutput = {
        taskId: validated.taskId,
        perspective: "architecture" as const,
        ...validatedAnalysis,
        components: analysis.components || [],
        boundaries: analysis.boundaries || [],
      };
      const typedOutput = validateDecomposerOutput(fullOutput, "architecture-decomposer");

      // P0 FIX sec-1.3: Validate dependency graph for cycles and missing references
      validateDependencyGraph(
        typedOutput.microTasks.map((t) => ({ id: t.id, dependencies: t.dependencies })),
        "architecture-decomposer"
      );

      const result: ArchitectureAnalysis = {
        taskId: validated.taskId,
        perspective: "architecture",
        microTasks: typedOutput.microTasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          rationale: task.rationale || "",
          dependencies: task.dependencies || [],
        })),
        recommendations: typedOutput.recommendations || [],
        components: (fullOutput as any).components || [],
        boundaries: (fullOutput as any).boundaries || [],
      };

      console.log(`[architecture-decomposer] Success (${usedProvider}): ${result.microTasks.length} micro-tasks, ${result.components.length} components`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      const errorStack = (error as Error).stack || "No stack trace available";

      // P0 Fix: Enhanced error logging with full context
      console.error(`[architecture-decomposer] Critical Error: ${errorMsg}`);
      console.error(`[architecture-decomposer] Stack trace: ${errorStack}`);
      console.error(
        `[architecture-decomposer] Context: taskId=${payload.taskId}, ` +
          `taskDescription length=${payload.taskDescription?.length || 0} chars`
      );

      // P0 Fix: Fail fast - do NOT return empty results silently
      throw new Error(
        `[architecture-decomposer] Failed to decompose task: ${errorMsg}\n` +
          `This is a critical error. The task cannot proceed without architecture baseline.\n` +
          `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
      );
    }
  },
});
