/**
 * Embedding Provider Interface for RuVector
 */

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokenCount?: number;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}

export interface EmbeddingProviderConfig {
  provider: 'openai' | 'ollama' | 'transformers';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  dimensions?: number;
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}