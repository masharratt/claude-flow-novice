/**
 * Mock for @ruvector/core
 *
 * Provides mock implementations of RuVector core functionality
 * to allow testing MDAP analytics without native module dependencies.
 */

export enum DistanceMetric {
  Cosine = 'cosine',
  Euclidean = 'euclidean',
  InnerProduct = 'inner_product',
}

export interface DbOptions {
  dimensions: number;
  distanceMetric?: DistanceMetric;
  storagePath?: string;
  hnswConfig?: {
    m?: number;
    efConstruction?: number;
    efSearch?: number;
    maxElements?: number;
  };
}

export interface VectorEntry {
  id: string;
  vector: Float32Array | number[];
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Mock VectorDB class
 */
export class VectorDB {
  private store: Map<string, VectorEntry> = new Map();
  private options: DbOptions;

  constructor(options: DbOptions) {
    this.options = options;
  }

  async insert(entry: VectorEntry): Promise<string> {
    this.store.set(entry.id, entry);
    return entry.id;
  }

  async get(id: string): Promise<VectorEntry | undefined> {
    return this.store.get(id);
  }

  async search(query: { vector: Float32Array | number[]; k: number }): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    for (const [id, entry] of this.store.entries()) {
      results.push({
        id,
        score: 0.9, // Mock similarity score
        metadata: entry.metadata,
      });
    }
    return results.slice(0, query.k);
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async count(): Promise<number> {
    return this.store.size;
  }
}

// Also export as VectorDb for compatibility
export { VectorDB as VectorDb };

export default {
  VectorDB,
  VectorDb: VectorDB,
  DistanceMetric,
};
