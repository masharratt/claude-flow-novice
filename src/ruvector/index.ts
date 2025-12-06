/**
 * RuVector - Semantic codebase search for CFN
 */

// Core
export { RuVectorIndex } from './core/index.js';
export type { SearchResult, IndexStats, RuVectorIndexOptions } from './core/index.js';
export { createFileProcessor } from './core/file-processor.js';
export type { ProcessedFile, FileProcessor } from './core/file-processor.js';

// Embeddings
export { EmbeddingError, createEmbeddingProvider, OpenAIEmbeddingProvider, createOpenAIProvider } from './embeddings/index.js';
export type { EmbeddingProvider, EmbeddingResult, EmbeddingProviderConfig } from './embeddings/index.js';