/**
 * GLM 4.6 Provider for MDAP
 *
 * Unified provider for all MDAP tasks using zai-glm-4.6 model.
 * Supports thinking/reasoning control per Cerebras documentation:
 * https://inference-docs.cerebras.ai/resources/glm-migration#7-minimize-reasoning-when-not-needed
 *
 * Usage:
 * - Decomposition/Planning tasks: enableThinking = true (reasoning needed)
 * - Implementation/Fix tasks: enableThinking = false (faster, no reasoning overhead)
 *
 * @module glm-provider
 * @version 1.0.0
 */

// =============================================
// Types
// =============================================

export interface GLMRequestOptions {
  /** Enable thinking/reasoning mode (default: false for speed) */
  enableThinking?: boolean;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Temperature for response generation (0.0-1.0) */
  temperature?: number;
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

export interface GLMResponse {
  /** Generated content */
  content: string;
  /** Input tokens used */
  inputTokens: number;
  /** Output tokens used */
  outputTokens: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether thinking was enabled */
  thinkingEnabled: boolean;
}

// =============================================
// Constants
// =============================================

/**
 * GLM 4.6 model ID - use this for ALL MDAP tasks
 * Consistent model reduces variability and simplifies debugging
 */
export const GLM_MODEL_ID = "zai-glm-4.6";

/** Cerebras API endpoint */
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";

/** Default configuration */
const DEFAULTS = {
  maxTokens: 2048,
  temperature: 0.5,
  timeoutMs: 30000,
  enableThinking: false,
};

/** Retry configuration */
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

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
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return Math.min(exponentialDelay + jitter, maxDelay);
}

// =============================================
// Main API Function
// =============================================

/**
 * Call GLM 4.6 API with optional thinking/reasoning
 *
 * Per Cerebras docs, disable thinking for implementation tasks:
 * "If your task doesn't require reasoning, you can disable thinking
 * to get faster responses and reduce token usage."
 *
 * @param prompt - The prompt to send
 * @param options - Request options including thinking toggle
 * @returns GLM response with content and metrics
 *
 * @example
 * // For decomposition (needs reasoning):
 * const result = await callGLM(prompt, { enableThinking: true });
 *
 * @example
 * // For implementation (no reasoning needed):
 * const result = await callGLM(prompt, { enableThinking: false });
 */
export async function callGLM(
  prompt: string,
  options: GLMRequestOptions = {}
): Promise<GLMResponse> {
  const startTime = Date.now();

  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error("CEREBRAS_API_KEY environment variable not set");
  }

  const {
    enableThinking = DEFAULTS.enableThinking,
    maxTokens = DEFAULTS.maxTokens,
    temperature = DEFAULTS.temperature,
    timeoutMs = DEFAULTS.timeoutMs,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Build request body
      const requestBody: Record<string, unknown> = {
        model: GLM_MODEL_ID,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: temperature,
      };

      // Add thinking parameter per Cerebras GLM docs
      // https://inference-docs.cerebras.ai/resources/glm-migration#7-minimize-reasoning-when-not-needed
      if (!enableThinking) {
        requestBody.thinking = { type: "disabled" };
      }
      // When enableThinking is true, omit the parameter (default behavior enables thinking)

      const response = await fetch(CEREBRAS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        let delayMs: number;

        if (retryAfter) {
          delayMs = parseInt(retryAfter, 10) * 1000;
        } else {
          delayMs = calculateBackoff(attempt, RETRY_CONFIG.baseDelayMs, RETRY_CONFIG.maxDelayMs);
        }

        console.log(
          `[glm-provider] Rate limited (429), retry ${attempt + 1}/${RETRY_CONFIG.maxRetries} after ${Math.round(delayMs)}ms`
        );
        await sleep(delayMs);
        continue;
      }

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text();
        lastError = new Error(
          `GLM API error: ${response.status} - ${errorBody.substring(0, 200)}`
        );

        // Only retry on 5xx server errors
        if (response.status >= 500 && attempt < RETRY_CONFIG.maxRetries - 1) {
          const delayMs = calculateBackoff(attempt, RETRY_CONFIG.baseDelayMs, RETRY_CONFIG.maxDelayMs);
          console.log(
            `[glm-provider] Server error (${response.status}), retry ${attempt + 1}/${RETRY_CONFIG.maxRetries} after ${delayMs}ms`
          );
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
        throw new Error("GLM API returned no choices");
      }

      return {
        content: data.choices[0].message.content,
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        durationMs,
        thinkingEnabled: enableThinking,
      };

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(`GLM API request timed out after ${timeoutMs}ms`);
      } else {
        lastError = error as Error;
      }

      // Don't retry on abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw lastError;
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error(`GLM API failed after ${RETRY_CONFIG.maxRetries} retries`);
}

// =============================================
// Convenience Functions
// =============================================

/**
 * Call GLM for decomposition/planning tasks (thinking ENABLED)
 * Use this for tasks that require reasoning, analysis, or planning.
 */
export async function callGLMWithThinking(
  prompt: string,
  options: Omit<GLMRequestOptions, 'enableThinking'> = {}
): Promise<GLMResponse> {
  return callGLM(prompt, { ...options, enableThinking: true });
}

/**
 * Call GLM for implementation/fix tasks (thinking DISABLED)
 * Use this for straightforward code generation, fixes, transformations.
 * Faster and more token-efficient than thinking mode.
 */
export async function callGLMFast(
  prompt: string,
  options: Omit<GLMRequestOptions, 'enableThinking'> = {}
): Promise<GLMResponse> {
  return callGLM(prompt, { ...options, enableThinking: false });
}

// =============================================
// Task-Specific Presets
// =============================================

/**
 * Preset for decomposition tasks
 * - Thinking enabled (complex reasoning)
 * - Higher max tokens (detailed output)
 * - Lower temperature (consistent output)
 */
export const DECOMPOSER_PRESET: GLMRequestOptions = {
  enableThinking: true,
  maxTokens: 4096,
  temperature: 0.3,
  timeoutMs: 60000, // Longer timeout for thinking
};

/**
 * Preset for implementation/fixer tasks
 * - Thinking disabled (speed)
 * - Standard max tokens
 * - Moderate temperature
 */
export const IMPLEMENTER_PRESET: GLMRequestOptions = {
  enableThinking: false,
  maxTokens: 2048,
  temperature: 0.5,
  timeoutMs: 30000,
};

/**
 * Preset for validation tasks
 * - Thinking disabled (straightforward checking)
 * - Lower max tokens (validation is brief)
 * - Low temperature (consistent checks)
 */
export const VALIDATOR_PRESET: GLMRequestOptions = {
  enableThinking: false,
  maxTokens: 1024,
  temperature: 0.2,
  timeoutMs: 20000,
};
