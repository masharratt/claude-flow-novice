/**
 * RuVector Core Type Definitions
 *
 * Mock/stub types for RuVector VectorDB client and operations.
 * Provides type-safe interface for vector database operations used in Phase 4-5.
 *
 * @module types/ruvector-core
 * @version 1.0.0
 */

/**
 * Vector database result entry
 */
export interface VectorEntry<T = Record<string, unknown>> {
  id: string;
  text: string;
  metadata: T;
  similarity?: number;
  score?: number;
}

/**
 * Query options for vector similarity search
 */
export interface VectorQueryOptions {
  limit?: number;
  minSimilarity?: number;
  offset?: number;
  filter?: Record<string, unknown>;
}

/**
 * Insert parameters for vector-based API
 */
export interface VectorInsertParams {
  id: string;
  vector: Float32Array;
  metadata: any;
}

/**
 * Search parameters for vector-based API
 */
export interface VectorSearchParams {
  vector: Float32Array;
  k: number;
  filter?: (item: any) => boolean;
}

/**
 * Search result from vector-based API
 */
export interface VectorSearchResult<T = any> {
  id: string;
  score: number;
  metadata: T;
}

/**
 * Vector database interface
 */
export interface VectorDB {
  // High-level text-based API (used by ruvector-core mocks)
  add(id: string, text: string, metadata: Record<string, unknown>): Promise<void>;
  query(text: string, options?: VectorQueryOptions): Promise<VectorEntry[]>;
  update(id: string, text: string, metadata: Record<string, unknown>): Promise<void>;

  // Low-level vector-based API (used by collection classes)
  insert(params: VectorInsertParams): Promise<void>;
  search(params: VectorSearchParams): Promise<VectorSearchResult[]>;

  // Common operations
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

/**
 * Embedding function type
 */
export type EmbeddingFunction = (text: string) => Promise<Float32Array>;

/**
 * Vector database factory
 */
export interface VectorDBFactory {
  create(name: string): Promise<VectorDB>;
  get(name: string): VectorDB | null;
  delete(name: string): Promise<void>;
}
