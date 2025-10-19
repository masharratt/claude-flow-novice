// Provider Interface: Abstraction for LLM Providers

export interface LLMProviderOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMMessageOptions extends LLMProviderOptions {
  system?: string;
}

export interface LLMModel {
  id: string;
  name: string;
  context_window: number;
  pricing: {
    input: number;
    output: number;
  };
}

export interface LLMProviderInterface {
  /**
   * Send a message to the LLM provider
   * @param prompt The user's message/prompt
   * @param options Configuration options for the request
   * @returns Promise with the LLM's response
   */
  sendMessage(prompt: string, options?: LLMMessageOptions): Promise<string>;

  /**
   * Stream a message from the LLM provider
   * @param prompt The user's message/prompt
   * @param options Configuration options for the request
   * @returns AsyncGenerator that yields streamed response chunks
   */
  streamMessage(prompt: string, options?: LLMMessageOptions): AsyncGenerator<string, void, unknown>;

  /**
   * Retrieve available models for this provider
   * @returns Promise with list of available models
   */
  getModels(): Promise<LLMModel[]>;

  /**
   * Check health and availability of the provider
   * @returns Promise resolving to health status
   */
  checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unavailable';
    latency?: number;
    models_available?: number;
  }>;
}

/**
 * Custom error for provider-related issues
 */
export class ProviderError extends Error {
  public code: string;
  public details?: any;

  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.details = details;
  }
}