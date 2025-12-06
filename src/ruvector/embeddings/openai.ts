/**
 * OpenAI Embedding Provider
 */

import type { EmbeddingProvider, EmbeddingResult } from './provider.js';
import { EmbeddingError } from './provider.js';

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  dimensions?: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions: number;
  
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  
  constructor(config: OpenAIEmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'text-embedding-3-small';
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.dimensions = config.dimensions ?? 1536;
  }
  
  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    return results[0];
  }
  
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];
    
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          dimensions: this.dimensions,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new EmbeddingError(`OpenAI API error: ${response.status} ${error}`, this.name);
      }
      
      const data = await response.json() as {
        data: Array<{ embedding: number[]; index: number }>;
        model: string;
        usage: { total_tokens: number };
      };
      
      const sorted = data.data.sort((a, b) => a.index - b.index);
      
      return sorted.map((item) => ({
        embedding: item.embedding,
        model: data.model,
        tokenCount: Math.floor(data.usage.total_tokens / texts.length),
      }));
    } catch (error) {
      if (error instanceof EmbeddingError) throw error;
      throw new EmbeddingError(
        `Failed to generate embeddings: ${(error as Error).message}`,
        this.name,
        error as Error
      );
    }
  }
}

export function createOpenAIProvider(config?: Partial<OpenAIEmbeddingConfig>): OpenAIEmbeddingProvider {
  const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.ZAI_API_KEY;
  
  if (!apiKey) {
    throw new EmbeddingError(
      'OpenAI API key required. Set OPENAI_API_KEY or ZAI_API_KEY.',
      'openai'
    );
  }
  
  const baseUrl = config?.baseUrl ?? (process.env.ZAI_API_KEY ? 'https://api.zai.com/v1' : undefined);
  
  return new OpenAIEmbeddingProvider({ apiKey, baseUrl, ...config });
}