/**
 * Embedding Providers Module
 */

export * from './provider.js';
export * from './openai.js';

import type { EmbeddingProvider, EmbeddingProviderConfig } from './provider.js';
import { EmbeddingError } from './provider.js';
import { createOpenAIProvider } from './openai.js';

export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'openai':
      return createOpenAIProvider({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        dimensions: config.dimensions,
      });
    case 'ollama':
    case 'transformers':
      throw new EmbeddingError(`${config.provider} provider not yet implemented`, config.provider);
    default:
      throw new EmbeddingError(`Unknown provider: ${(config as any).provider}`, 'unknown');
  }
}