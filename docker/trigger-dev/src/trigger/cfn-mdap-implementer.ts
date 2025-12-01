/**
 * CFN MDAP Implementer Task
 *
 * MDAP-specific implementer using Cerebras API as PRIMARY for rapid code generation.
 * Falls back to Groq API when Cerebras is rate-limited or unavailable.
 *
 * API Priority Chain:
 * 1. Cerebras (PRIMARY) - Fast inference (~500ms-3s), reliable, best for MDAP
 * 2. Groq (FALLBACK) - Used when Cerebras fails (429 rate limit, API errors)
 *
 * Note: Groq free tier (openai/gpt-oss-*) has 0% success rate due to aggressive
 * rate limiting. Use as fallback only, not primary.
 *
 * Key differences from cfn-implementer-v2:
 * - Uses Cerebras API directly (NOT Claude Code CLI)
 * - Targets ~500ms-3s per micro-task (vs 60+ seconds with CLI)
 * - Returns generated code for external file writing and test execution
 * - Supports 3-tier model escalation per MDAP design
 *
 * TDD Flow:
 * 1. Coordinator decomposes task into atomic micro-tasks
 * 2. This implementer generates code for each micro-task
 * 3. Coordinator writes code to files
 * 4. Coordinator runs tests (gate check)
 * 5. If tests fail, escalate tier and retry
 * 6. If tests pass, proceed to validation
 *
 * @module cfn-mdap-implementer
 * @version 3.0.0 - Switched back to Cerebras-primary with Groq fallback
 */

import { task } from "@trigger.dev/sdk/v3";
import {
  parseJSONFromResponse,
} from "../lib/validation-schemas.js";

// Security: Sanitize error messages to prevent API key leakage
function sanitizeErrorMessage(error: Error | unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Mask patterns that look like API keys
  return message
    .replace(/tr_(dev|prod|stg|preview)_[a-zA-Z0-9]+/g, 'tr_$1_[REDACTED]')
    .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-[REDACTED]')
    .replace(/gsk_[a-zA-Z0-9]+/g, 'gsk_[REDACTED]')
    .replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[:\s=]+['"]?[a-zA-Z0-9_-]+['"]?/gi, 'api_key=[REDACTED]')
    .replace(/token[:\s=]+['"]?[a-zA-Z0-9_-]+['"]?/gi, 'token=[REDACTED]');
}

import {
  selectModelTier,
  estimateCost,
  getTierSummary,
  type ModelTier,
} from "../lib/mdap-config.js";
import {
  checkDeprecation,
  getRecommendedTier,
} from "../lib/mdap-metrics-tracker.js";

// =============================================
// Types
// =============================================

export interface MDAPImplementerPayload {
  /** CFN Loop task ID */
  taskId: string;
  /** Micro-task identifier */
  microTaskId: string;
  /** Description of the implementation task */
  taskDescription: string;
  /** Working directory context */
  workDir: string;
  /** Target file to create/modify */
  targetFile: string;
  /** Context hints from decomposition */
  contextHints?: string[];
  /** Pre-read file contents for context */
  fileContents?: Array<{ path: string; content: string }>;
  /** Model tier override (1-3) */
  modelTier?: number;
  /** Previous failure count (for escalation) */
  failureCount?: number;
  /** Programming language hint */
  language?: string;
}

export interface MDAPImplementerResult {
  /** Task ID for tracking */
  taskId: string;
  /** Micro-task ID for tracking */
  microTaskId: string;
  /** Whether generation succeeded */
  success: boolean;
  /** Generated code content */
  generatedCode: string;
  /** Target file path */
  targetFile: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Model tier used (1-3) */
  modelTier: number;
  /** Model tier name */
  tierName: string;
  /** Model name used */
  modelName: string;
  /** Estimated cost */
  estimatedCost: number;
  /** Token usage */
  tokens?: {
    input: number;
    output: number;
  };
  /** Error message if failed */
  error?: string;
  /** Which API was used (cerebras or groq) */
  apiUsed?: "cerebras" | "groq";
}

// =============================================
// Model Configuration
// =============================================

/**
 * Model mapping for MDAP tiers using Cerebras API (PRIMARY)
 *
 * T1 (haiku): Fast, cheap - for atomic tasks
 * T2 (sonnet): Balanced - for moderate complexity
 * T3 (opus): Best quality - for complex/retry scenarios
 */
const CEREBRAS_MODELS: Record<number, string> = {
  1: "llama3.1-8b",                      // T1 - Fast, first attempt (~2200 tok/s)
  2: "llama-3.3-70b",                    // T2 - Balanced quality (~2100 tok/s)
  3: "qwen-3-235b-a22b-instruct-2507",   // T3 - Best for complex/retry (~1400 tok/s)
};

/**
 * Model mapping for MDAP tiers using Groq API (FALLBACK)
 * Used when Cerebras is rate-limited or unavailable.
 *
 * Note: Groq free tier is unreliable with aggressive rate limiting.
 * Use as fallback only.
 */
const GROQ_MODELS: Record<number, string> = {
  1: "openai/gpt-oss-20b",    // T1 fallback
  2: "openai/gpt-oss-20b",    // T2 fallback (same model, enhanced prompting)
  3: "openai/gpt-oss-120b",   // T3 fallback - larger model
};

// =============================================
// Helper Functions
// =============================================

/**
 * Build implementation prompt for code generation
 */
function buildImplementationPrompt(payload: MDAPImplementerPayload, tier: ModelTier): string {
  const sections: string[] = [];

  // Role and task
  sections.push(`You are an expert ${payload.language || 'TypeScript'} developer.`);
  sections.push(`Generate code for this atomic micro-task.`);
  sections.push('');

  // Task description
  sections.push(`## Task`);
  sections.push(payload.taskDescription);
  sections.push('');

  // Target file
  sections.push(`## Target File`);
  sections.push(`\`${payload.targetFile}\``);
  sections.push('');

  // Context hints
  if (payload.contextHints && payload.contextHints.length > 0) {
    sections.push(`## Context Hints`);
    payload.contextHints.forEach(hint => sections.push(`- ${hint}`));
    sections.push('');
  }

  // Pre-read file contents
  if (payload.fileContents && payload.fileContents.length > 0) {
    sections.push(`## Existing Code Context`);
    for (const { path, content } of payload.fileContents) {
      sections.push(`### ${path}`);
      sections.push('```');
      sections.push(content.slice(0, 2000)); // Limit context size
      sections.push('```');
      sections.push('');
    }
  }

  // Output format
  sections.push(`## Output Format`);
  sections.push(`Return ONLY valid JSON with this structure:`);
  sections.push('```json');
  sections.push(JSON.stringify({
    code: "// Your generated code here",
    explanation: "Brief explanation of what the code does"
  }, null, 2));
  sections.push('```');
  sections.push('');

  // Quality hints based on tier - Enhanced prompts for T2+ tiers
  if (tier.tier >= 2) {
    sections.push(`## Quality Requirements (T${tier.tier} - ${tier.name})`);
    sections.push(`- Follow TypeScript best practices (strict types, no \`any\`)`);
    sections.push(`- Add JSDoc comments for public functions`);
    sections.push(`- Handle edge cases (null, undefined, empty strings)`);
    sections.push(`- Use descriptive variable names`);
    sections.push(`- Include proper error handling with try-catch blocks`);
    sections.push(`- Add input validation for all parameters`);

    if (tier.tier >= 3) {
      // T3 (opus) gets additional requirements for complex/retry scenarios
      sections.push('');
      sections.push(`## Advanced Requirements (T3 - ${tier.name})`);
      sections.push(`- Implement comprehensive error handling with try-catch and proper error messages`);
      sections.push(`- Add input validation for ALL parameters (type checks, bounds checks, null checks)`);
      sections.push(`- Consider performance implications (avoid N+1 loops, use efficient data structures)`);
      sections.push(`- Write defensive code anticipating failures and edge cases`);
      sections.push(`- Add comprehensive inline comments explaining complex logic`);
      sections.push(`- Consider thread safety if applicable`);
      sections.push(`- Implement proper resource cleanup (finally blocks, dispose patterns)`);
    }
    sections.push('');
  }

  sections.push(`IMPORTANT: Return ONLY the JSON object, no additional text.`);

  return sections.join('\n');
}

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Cerebras API for code generation (PRIMARY)
 * Fast inference with reliable rate limits.
 */
async function callCerebrasAPI(
  prompt: string,
  modelName: string,
  tier: ModelTier
): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}> {
  const startTime = Date.now();

  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error("CEREBRAS_API_KEY environment variable not set");
  }

  // Retry configuration for rate limiting
  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 30000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Add 30s timeout to prevent hanging on slow/unresponsive API
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
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          max_tokens: tier.tier >= 3 ? 4096 : 2048,
          temperature: tier.tier >= 3 ? 0.3 : 0.5,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle rate limiting with exponential backoff
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

      console.log(`[mdap-implementer] Cerebras rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`);
      await sleep(delayMs);
      continue;
    }

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      lastError = new Error(
        `Cerebras API error: ${response.status} - ${errorBody}\n` +
        `Check API key validity and quota limits.`
      );

      // Only retry on 5xx server errors
      if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[mdap-implementer] Cerebras server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw lastError;
    }

    const data = await response.json() as {
      choices?: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    // Validate response structure
    if (!data.choices || data.choices.length === 0) {
      throw new Error("Cerebras API returned no choices");
    }

    return {
      content: data.choices[0].message.content,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      durationMs,
    };
  }

  // All retries exhausted
  throw lastError || new Error(`Cerebras API failed after ${MAX_RETRIES} retries due to rate limiting`);
}

/**
 * Call Groq API for code generation (FALLBACK)
 * Used when Cerebras is unavailable or rate-limited.
 *
 * Note: Groq free tier has aggressive rate limiting (0% success rate in tests).
 * Use as fallback only.
 */
async function callGroqAPI(
  prompt: string,
  modelName: string,
  tier: ModelTier
): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}> {
  const startTime = Date.now();

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable not set for fallback");
  }

  // Retry configuration for rate limiting
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
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          max_tokens: tier.tier >= 3 ? 4096 : 2048,
          temperature: tier.tier >= 3 ? 0.3 : 0.5,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle rate limiting with exponential backoff
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

      console.log(`[mdap-implementer] Groq rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`);
      await sleep(delayMs);
      continue;
    }

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      lastError = new Error(
        `Groq API error: ${response.status} - ${errorBody}\n` +
        `Check API key validity and quota limits.`
      );

      if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[mdap-implementer] Groq server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw lastError;
    }

    const data = await response.json() as {
      choices?: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    if (!data.choices || data.choices.length === 0) {
      throw new Error("Groq API returned no choices");
    }

    return {
      content: data.choices[0].message.content,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      durationMs,
    };
  }

  throw lastError || new Error(`Groq API failed after ${MAX_RETRIES} retries due to rate limiting`);
}

/**
 * Parse generated code from API response with robust fallbacks
 */
function parseGeneratedCode(content: string, contextName: string): { code: string; explanation?: string } {
  try {
    const parsed = parseJSONFromResponse<{ code: string; explanation?: string }>(content, contextName);

    if (!parsed.code || typeof parsed.code !== 'string') {
      throw new Error("Response missing 'code' field");
    }

    return parsed;
  } catch (error) {
    // Fallback 1: Try to extract code from markdown code blocks
    const codeMatch = content.match(/```(?:typescript|javascript|ts|js)?\s*\n?([\s\S]*?)\n?```/);
    if (codeMatch) {
      return { code: codeMatch[1].trim(), explanation: "Extracted from code block" };
    }

    // Fallback 2: Return content as-is if it looks like code
    if (content.includes('function') || content.includes('const') || content.includes('export')) {
      return { code: content.trim(), explanation: "Raw code response" };
    }

    throw new Error(`Failed to parse generated code: ${(error as Error).message}`);
  }
}

// =============================================
// Task Definition
// =============================================

export const cfnMDAPImplementerTask = task({
  id: "cfn-mdap-implementer",
  retry: { maxAttempts: 1 }, // Retries handled by coordinator with tier escalation

  run: async (payload: MDAPImplementerPayload): Promise<MDAPImplementerResult> => {
    const startTime = Date.now();

    console.log(`[mdap-implementer] Starting: ${payload.microTaskId}`);
    console.log(`[mdap-implementer] Task: ${payload.taskDescription.substring(0, 80)}...`);
    console.log(`[mdap-implementer] Target: ${payload.targetFile}`);

    // Get metrics-based tier recommendation (accounts for deprecation)
    const recommendedTier = await getRecommendedTier(
      'simple', // MDAP tasks are always atomic/simple
      payload.failureCount || 0
    );

    // Select model tier based on failure history and recommendation
    let modelTier = selectModelTier(
      'simple', // MDAP tasks are always atomic/simple
      Math.max(payload.modelTier || 1, recommendedTier),
      payload.failureCount || 0
    );

    // Use Cerebras models (PRIMARY)
    let modelName = CEREBRAS_MODELS[modelTier.tier] || CEREBRAS_MODELS[1];
    let apiUsed: "cerebras" | "groq" = "cerebras";

    // Check if model is deprecated (auto-escalate if so)
    const isDeprecated = await checkDeprecation(modelName);
    if (isDeprecated && modelTier.tier < 3) {
      console.log(`[mdap-implementer] Model ${modelName} deprecated, escalating tier`);
      const nextTier = Math.min(modelTier.tier + 1, 3) as 1 | 2 | 3;
      modelTier = selectModelTier('simple', nextTier, 0);
      modelName = CEREBRAS_MODELS[modelTier.tier] || CEREBRAS_MODELS[3];
    }

    console.log(`[mdap-implementer] Using ${getTierSummary(modelTier)} -> ${modelName} (Cerebras primary)`);

    try {
      // Build prompt
      const prompt = buildImplementationPrompt(payload, modelTier);
      console.log(`[mdap-implementer] Prompt length: ${prompt.length} chars`);

      let apiResult: {
        content: string;
        inputTokens: number;
        outputTokens: number;
        durationMs: number;
      };

      // Try Cerebras first (PRIMARY), fallback to Groq on failure
      try {
        apiResult = await callCerebrasAPI(prompt, modelName, modelTier);
        apiUsed = "cerebras";
        console.log(`[mdap-implementer] Cerebras API call: ${apiResult.durationMs}ms, ${apiResult.inputTokens}+${apiResult.outputTokens} tokens`);
      } catch (cerebrasError) {
        const errorMsg = (cerebrasError as Error).message;

        // Check if it's a rate limit or API error that warrants fallback
        if (errorMsg.includes('429') || errorMsg.includes('rate limit') ||
            errorMsg.includes('500') || errorMsg.includes('502') ||
            errorMsg.includes('503') || errorMsg.includes('504') ||
            errorMsg.includes('timeout') || errorMsg.includes('CEREBRAS_API_KEY')) {

          console.log(`[mdap-implementer] Cerebras failed, falling back to Groq: ${errorMsg.substring(0, 100)}`);

          // Switch to Groq fallback model
          const groqModelName = GROQ_MODELS[modelTier.tier] || GROQ_MODELS[1];
          console.log(`[mdap-implementer] Using Groq fallback: ${groqModelName}`);

          try {
            apiResult = await callGroqAPI(prompt, groqModelName, modelTier);
            apiUsed = "groq";
            modelName = groqModelName;
            console.log(`[mdap-implementer] Groq API call: ${apiResult.durationMs}ms, ${apiResult.inputTokens}+${apiResult.outputTokens} tokens`);
          } catch (groqError) {
            // Both APIs failed
            throw new Error(
              `Both Cerebras and Groq APIs failed.\n` +
              `Cerebras: ${errorMsg.substring(0, 150)}\n` +
              `Groq: ${(groqError as Error).message.substring(0, 150)}`
            );
          }
        } else {
          // Non-recoverable Cerebras error, don't try fallback
          throw cerebrasError;
        }
      }

      // Parse generated code
      const { code, explanation } = parseGeneratedCode(apiResult.content, "mdap-implementer");
      console.log(`[mdap-implementer] Generated ${code.length} chars of code`);
      if (explanation) {
        console.log(`[mdap-implementer] Explanation: ${explanation}`);
      }

      const durationMs = Date.now() - startTime;
      const estimatedCost = estimateCost(modelTier, apiResult.inputTokens, apiResult.outputTokens);

      console.log(`[mdap-implementer] Success (${apiUsed}): ${durationMs}ms, cost ~$${estimatedCost.toFixed(6)}`);

      return {
        taskId: payload.taskId,
        microTaskId: payload.microTaskId,
        success: true,
        generatedCode: code,
        targetFile: payload.targetFile,
        durationMs,
        modelTier: modelTier.tier,
        tierName: modelTier.name,
        modelName,
        estimatedCost,
        tokens: {
          input: apiResult.inputTokens,
          output: apiResult.outputTokens,
        },
        apiUsed,
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = sanitizeErrorMessage(error);

      console.error(`[mdap-implementer] Failed: ${errorMsg}`);
      console.error(`[mdap-implementer] Duration: ${durationMs}ms`);

      return {
        taskId: payload.taskId,
        microTaskId: payload.microTaskId,
        success: false,
        generatedCode: "",
        targetFile: payload.targetFile,
        durationMs,
        modelTier: modelTier.tier,
        tierName: modelTier.name,
        modelName,
        estimatedCost: estimateCost(modelTier, 0, 0),
        error: errorMsg,
        apiUsed,
      };
    }
  },
});
