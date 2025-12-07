/**
 * Cerebras API Client
 *
 * Fast inference API client with JSON mode support and retry logic.
 * Uses zai-glm-4.6 model (Z.ai subscription on Cerebras).
 */

export interface CerebrasConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CerebrasResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

const DEFAULT_MODEL = "zai-glm-4.6";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function callCerebras(
  prompt: string,
  config: CerebrasConfig
): Promise<CerebrasResponse> {
  const startTime = Date.now();
  const model = config.model || DEFAULT_MODEL;
  const maxTokens = config.maxTokens || 4096;
  const temperature = config.temperature || 0.3;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`Rate limited, retrying in ${delayMs}ms...`);
        await sleep(delayMs);
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Cerebras API error: ${response.status} - ${errorBody}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      if (!data.choices || data.choices.length === 0) {
        throw new Error("Cerebras API returned no choices");
      }

      return {
        content: data.choices[0].message.content,
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error as Error;

      if ((error as Error).name === "AbortError") {
        console.log(`Request timeout, retrying...`);
        continue;
      }

      if (attempt < MAX_RETRIES - 1) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`Error: ${(error as Error).message}, retrying in ${delayMs}ms...`);
        await sleep(delayMs);
        continue;
      }
    }
  }

  throw lastError || new Error("Cerebras API failed after retries");
}
