/**
 * RuVector Core Module - Type-Safe Implementation
 *
 * Provides mock implementations of RuVector VectorDB for development and testing.
 * This module is a stub for Phase 4-5 integration with actual RuVector library.
 *
 * @module lib/ruvector-core
 * @version 1.0.0
 */

import type {
  VectorDB,
  VectorEntry,
  VectorQueryOptions,
  EmbeddingFunction,
  VectorDBFactory,
} from '../types/ruvector-core';

/**
 * Mock VectorDB implementation for development
 */
export class MockVectorDB implements VectorDB {
  private store: Map<string, VectorEntry> = new Map();
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  async add(id: string, text: string, metadata: Record<string, unknown>): Promise<void> {
    this.store.set(id, { id, text, metadata });
  }

  async query(text: string, options?: VectorQueryOptions): Promise<VectorEntry[]> {
    const limit = options?.limit ?? 10;
    const minSimilarity = options?.minSimilarity ?? 0.0;

    // Mock similarity calculation
    const results = Array.from(this.store.values())
      .filter((entry) => {
        const similarity = this.calculateSimilarity(text, entry.text);
        return similarity >= minSimilarity;
      })
      .map((entry) => ({
        ...entry,
        similarity: this.calculateSimilarity(text, entry.text),
      }))
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, limit);

    return results;
  }

  async update(id: string, text: string, metadata: Record<string, unknown>): Promise<void> {
    if (!this.store.has(id)) {
      throw new Error(`Entry with id ${id} not found`);
    }
    this.store.set(id, { id, text, metadata });
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.store.has(id);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /**
   * Mock similarity calculation using string overlap
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

/**
 * Mock VectorDB factory
 */
export class MockVectorDBFactory implements VectorDBFactory {
  private dbs: Map<string, VectorDB> = new Map();

  async create(name: string): Promise<VectorDB> {
    if (this.dbs.has(name)) {
      throw new Error(`Database ${name} already exists`);
    }
    const db = new MockVectorDB(name);
    this.dbs.set(name, db);
    return db;
  }

  get(name: string): VectorDB | null {
    return this.dbs.get(name) ?? null;
  }

  async delete(name: string): Promise<void> {
    this.dbs.delete(name);
  }
}

/**
 * Global VectorDB factory instance
 */
export const vectorDBFactory = new MockVectorDBFactory();

/**
 * Create or get a VectorDB instance
 */
export async function createVectorDB(name: string): Promise<VectorDB> {
  const existing = vectorDBFactory.get(name);
  if (existing) return existing;
  return vectorDBFactory.create(name);
}

/**
 * Mock embedding function for development
 */
export const mockEmbeddingFunction: EmbeddingFunction = async (text: string): Promise<Float32Array> => {
  // Simple hash-based embedding for testing
  const hash = text.split('').reduce((acc, char) => {
    return (acc << 5) - acc + char.charCodeAt(0);
  }, 0);

  const embedding = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    embedding[i] = Math.sin((hash + i) / 100);
  }
  return embedding;
};
