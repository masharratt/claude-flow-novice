/**
 * Type declarations for @ruvector/core
 *
 * @module types/ruvector
 */

export interface VectorEntry<T = Record<string, unknown>> {
  id: string;
  text: string;
  metadata: T;
  similarity?: number;
  score?: number;
}

export interface VectorQueryOptions {
  limit?: number;
  minSimilarity?: number;
  offset?: number;
  filter?: Record<string, unknown>;
}

export interface VectorDB {
  add(id: string, text: string, metadata: Record<string, unknown>): Promise<void>;
  query(text: string, options?: VectorQueryOptions): Promise<VectorEntry[]>;
  update(id: string, text: string, metadata: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

export type EmbeddingFunction = (text: string) => Promise<Float32Array>;

export interface VectorDBFactory {
  create(name: string): Promise<VectorDB>;
  get(name: string): VectorDB | null;
  delete(name: string): Promise<void>;
}

declare module '@ruvector/core' {
  export type { VectorEntry, VectorQueryOptions, VectorDB, EmbeddingFunction, VectorDBFactory };
}
