/**
 * Z.ai Provider Implementation (Tier 3)
 *
 * Cost-optimized provider using GLM-4.5/4.6 models via Z.ai
 * - Default: 8192 tokens (optimized for 500 line per file guideline)
 * - Minimum: 200 tokens (avoids GLM-4.6 empty response bug)
 * - Maximum: 80,000 tokens (supports large code generation tasks)
 */

import { BaseProvider } from "./base-provider.js";
import {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  ProviderCapabilities,
  HealthCheckResult,
  LLMProviderError,
} from "./types.js";

interface ZaiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ZaiCompletionRequest {
  model: string;
  messages: ZaiMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface ZaiCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "length" | "content_filter";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class ZaiProvider extends BaseProvider {
  readonly name: LLMProvider = "zai";
  readonly capabilities: ProviderCapabilities = {
    supportedModels: ["claude-3-5-sonnet-20241022", "glm-4.5", "glm-4.6"],
    maxContextLength: {
      "claude-3-5-sonnet-20241022": 200000,
      "glm-4.5": 128000,
      "glm-4.6": 200000,
    } as Record<LLMModel, number>,
    maxOutputTokens: {
      "claude-3-5-sonnet-20241022": 8192,
      "glm-4.5": 4096,
      "glm-4.6": 128000,
    } as Record<LLMModel, number>,
    supportsStreaming: true,
    supportsFunctionCalling: false,
    supportsSystemMessages: true,
    supportsVision: true,
    supportsAudio: false,
    supportsTools: false,
    supportsFineTuning: false,
    supportsEmbeddings: false,
    supportsLogprobs: false,
    supportsBatching: false,
    pricing: {
      "claude-3-5-sonnet-20241022": {
        promptCostPer1k: 0.003,
        completionCostPer1k: 0.015,
        currency: "USD",
      },
      "glm-4.5": {
        promptCostPer1k: 0.003,
        completionCostPer1k: 0.015,
        currency: "USD",
      },
      "glm-4.6": {
        promptCostPer1k: 0.003,
        completionCostPer1k: 0.015,
        currency: "USD",
      },
    },
  };

  private apiKey!: string;
  private baseURL = "https://api.z.ai/v1";

  protected async doInitialize(): Promise<void> {
    // Validate API key
    if (!this.config.apiKey) {
      throw new Error("Z.ai API key is required. Set Z_AI_API_KEY in .env");
    }

    this.apiKey = this.config.apiKey;
    this.logger.info("Z.ai provider initialized", {
      model: this.config.model,
      baseURL: this.baseURL,
    });
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.config.model;

    // Build request payload
    const payload: ZaiCompletionRequest = {
      model,
      messages: request.messages
        .filter((msg) => msg.role !== "function")
        .map((msg) => ({
          role: msg.role as "system" | "user" | "assistant",
          content: msg.content,
        })),
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: Math.max(
        201,
        request.maxTokens ?? this.config.maxTokens ?? 8192,
      ),
      stream: false,
    };

    // Call Z.ai API
    const response = await this.callZaiAPI<ZaiCompletionResponse>(
      "/chat/completions",
      payload,
    );

    // Calculate cost
    const pricing = this.capabilities.pricing![model];
    const promptCost =
      (response.usage.prompt_tokens / 1000) * pricing.promptCostPer1k;
    const completionCost =
      (response.usage.completion_tokens / 1000) * pricing.completionCostPer1k;

    // Convert to unified response format
    return {
      id: response.id,
      model,
      provider: "zai",
      content: response.choices[0].message.content,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      cost: {
        promptCost,
        completionCost,
        totalCost: promptCost + completionCost,
        currency: "USD",
      },
      finishReason:
        response.choices[0].finish_reason === "stop" ? "stop" : "length",
    };
  }

  protected async *doStreamComplete(
    request: LLMRequest,
  ): AsyncIterable<LLMStreamEvent> {
    const model = request.model || this.config.model;

    // Build request payload
    const payload: ZaiCompletionRequest = {
      model,
      messages: request.messages
        .filter((msg) => msg.role !== "function")
        .map((msg) => ({
          role: msg.role as "system" | "user" | "assistant",
          content: msg.content,
        })),
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: Math.max(
        201,
        request.maxTokens ?? this.config.maxTokens ?? 8192,
      ),
      stream: true,
    };

    // Call Z.ai streaming API
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new LLMProviderError(
        `Z.ai API error: ${response.status} ${response.statusText}`,
        "API_ERROR",
        "zai",
        undefined,
        response.status >= 500,
      );
    }

    if (!response.body) {
      throw new LLMProviderError(
        "No response body from Z.ai API",
        "NO_RESPONSE_BODY",
        "zai",
      );
    }

    // Process SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let totalTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || line.startsWith(":")) continue;

          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);

              if (event.choices?.[0]?.delta?.content) {
                yield {
                  type: "content",
                  delta: {
                    content: event.choices[0].delta.content,
                  },
                };
              }

              if (event.usage) {
                totalTokens = event.usage.total_tokens;
              }
            } catch (parseError) {
              this.logger.warn("Failed to parse SSE event", {
                line,
                error: parseError,
              });
            }
          }
        }
      }

      // Emit final usage statistics
      const pricing = this.capabilities.pricing![model];
      const promptTokens = this.estimateTokens(
        JSON.stringify(request.messages),
      );
      const completionTokens = totalTokens - promptTokens;

      const promptCost = (promptTokens / 1000) * pricing.promptCostPer1k;
      const completionCost =
        (completionTokens / 1000) * pricing.completionCostPer1k;

      yield {
        type: "done",
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        cost: {
          promptCost,
          completionCost,
          totalCost: promptCost + completionCost,
          currency: "USD",
        },
      };
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<LLMModel[]> {
    return this.capabilities.supportedModels;
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    const modelNames: Record<string, string> = {
      "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
      "glm-4.5": "GLM-4.5",
      "glm-4.6": "GLM-4.6",
    };

    const modelDescriptions: Record<string, string> = {
      "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet via Z.ai",
      "glm-4.5": "GLM-4.5 via Z.ai - 128K context",
      "glm-4.6": "GLM-4.6 via Z.ai - 200K context, 128K max output",
    };

    return {
      model,
      name: modelNames[model] || model,
      description: modelDescriptions[model] || `${model} via Z.ai`,
      contextLength: this.capabilities.maxContextLength[model] || 200000,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 8192,
      supportedFeatures: ["chat", "completion", "vision", "streaming"],
      pricing: this.capabilities.pricing![model],
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      // Minimal health check request
      const response = await this.callZaiAPI<ZaiCompletionResponse>(
        "/chat/completions",
        {
          model: this.config.model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 1,
          stream: false,
        },
      );

      return {
        healthy: true,
        timestamp: new Date(),
        details: {
          model: response.model,
          status: "operational",
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      };
    }
  }

  /**
   * Call Z.ai API with error handling
   */
  private async callZaiAPI<T>(endpoint: string, payload: any): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Z.ai API error: ${response.status} ${response.statusText}`;

        try {
          const errorJson = JSON.parse(errorBody);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {
          // Use default error message if body is not JSON
        }

        throw new LLMProviderError(
          errorMessage,
          response.status === 429 ? "RATE_LIMIT" : "API_ERROR",
          "zai",
          undefined,
          response.status >= 500,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof LLMProviderError) {
        throw error;
      }

      throw new LLMProviderError(
        error instanceof Error ? error.message : String(error),
        "NETWORK_ERROR",
        "zai",
        undefined,
        true,
      );
    }
  }

  destroy(): void {
    super.destroy();
    this.logger.info("Z.ai provider destroyed");
  }
}
