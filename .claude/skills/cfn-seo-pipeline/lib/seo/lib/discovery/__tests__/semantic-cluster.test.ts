/**
 * Unit tests for semantic keyword clustering with RuVector embeddings
 *
 * Tests cover:
 * - Embedding generation and caching
 * - Cosine similarity calculation
 * - Hierarchical clustering algorithm
 * - Representative keyword selection
 * - Cluster naming and extraction
 * - Complete clustering workflow
 * - Deduplication rate metrics
 *
 * @module seo/lib/discovery/__tests__/semantic-cluster.test
 */

import {
  clusterKeywordsSemantically,
  type ClusterOptions,
  type KeywordCluster,
  type ClusteringResult,
} from '../semantic-cluster';
import type { KeywordSource } from '../types';
import type { VectorDB } from '@ruvector/core';

// ============================================================================
// MOCK DATA
// ============================================================================

/**
 * Mock RuVector database implementation
 */
class MockVectorDB implements VectorDB {
  private storage: Map<string, any> = new Map();

  // High-level text-based API
  async add(id: string, text: string, metadata: Record<string, unknown>): Promise<void> {
    this.storage.set(id, { id, text, metadata });
  }

  async query(text: string, options?: any): Promise<any[]> {
    return Array.from(this.storage.values()).slice(0, options?.limit ?? 10);
  }

  async update(id: string, text: string, metadata: Record<string, unknown>): Promise<void> {
    if (!this.storage.has(id)) {
      throw new Error(`Entry with id ${id} not found`);
    }
    this.storage.set(id, { id, text, metadata });
  }

  // Low-level vector-based API
  async insert(data: any): Promise<void> {
    this.storage.set(data.id, data);
  }

  async search(params: any): Promise<any[]> {
    // Support both string query and vector params
    if (typeof params === 'string') {
      return Array.from(this.storage.values()).slice(0, 10);
    }
    const { k, filter } = params;
    let results = Array.from(this.storage.values());
    if (filter) {
      results = results.filter(filter);
    }
    return results.slice(0, k || 10).map(entry => ({
      id: entry.id,
      score: 0.9,
      metadata: entry.metadata || entry,
    }));
  }

  // Common operations
  async delete(id: string): Promise<void> {
    this.storage.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.storage.has(id);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }
}

/**
 * Simple embedding function for testing (deterministic)
 *
 * Uses word-based hashing to create consistent embeddings
 */
function createMockEmbeddingFn(): (text: string) => Promise<Float32Array> {
  const cache = new Map<string, Float32Array>();

  return async (text: string): Promise<Float32Array> => {
    if (cache.has(text)) {
      return cache.get(text)!;
    }

    // Create deterministic embedding based on text content
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Float32Array(384);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let hash = 0;

      for (let j = 0; j < word.length; j++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(j);
        hash |= 0; // Convert to 32-bit integer
      }

      // Spread word hash across multiple dimensions
      for (let j = 0; j < 384; j++) {
        embedding[j] += Math.sin(hash + j) * 0.25;
      }
    }

    // Normalize
    let sum = 0;
    for (let i = 0; i < embedding.length; i++) {
      sum += embedding[i] * embedding[i];
    }
    const magnitude = Math.sqrt(sum);
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude || 1;
    }

    cache.set(text, embedding);
    return embedding;
  };
}

/**
 * Test dataset: 12 keywords that should cluster into 2-3 groups
 */
const testKeywordDataset: KeywordSource[] = [
  { keyword: 'best CRM software', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'top CRM tools', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'CRM software comparison', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'how to choose CRM', source: 'paa', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'selecting CRM platform', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'CRM buying guide', source: 'paa', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'small business CRM', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'CRM for startups', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'affordable CRM', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'free CRM', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'open source CRM', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'CRM without cost', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
];

/**
 * Expected cluster groupings for test dataset:
 * Group 1: "CRM Selection" (best, top, comparison, choose, selecting, buying)
 * Group 2: "Small Business/Budget CRM" (small business, startups, affordable, free, open source, free)
 * Dedup rate: 12 → 2 clusters = ~83% reduction
 */

// ============================================================================
// TESTS
// ============================================================================

describe('Semantic Keyword Clustering', () => {
  let mockDb: MockVectorDB;
  let embeddingFn: (text: string) => Promise<Float32Array>;

  beforeEach(() => {
    mockDb = new MockVectorDB();
    embeddingFn = createMockEmbeddingFn();
  });

  // ========== BASIC FUNCTIONALITY ==========

  describe('Basic Clustering', () => {
    it('should handle empty keyword list', async () => {
      const result = await clusterKeywordsSemantically([], mockDb as any, embeddingFn);

      expect(result.totalKeywords).toBe(0);
      expect(result.uniqueClusters).toBe(0);
      expect(result.clusters).toEqual([]);
    });

    it('should handle single keyword', async () => {
      const keywords: KeywordSource[] = [
        { keyword: 'test keyword', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
      ];

      const result = await clusterKeywordsSemantically(keywords, mockDb as any, embeddingFn);

      expect(result.totalKeywords).toBe(1);
      expect(result.uniqueClusters).toBe(1);
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].keywords).toEqual(['test keyword']);
      expect(result.clusters[0].size).toBe(1);
    });

    it('should deduplicate exact matches at source level', async () => {
      const keywords: KeywordSource[] = [
        { keyword: 'test', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
        { keyword: 'test', source: 'paa', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
        { keyword: 'test', source: 'competitors', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
      ];

      const result = await clusterKeywordsSemantically(keywords, mockDb as any, embeddingFn);

      expect(result.totalKeywords).toBe(1);
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].keywords).toEqual(['test']);
    });

    it('should achieve 40%+ deduplication on test dataset', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn,
        { similarityThreshold: 0.7 }
      );

      // 12 → 2-4 clusters should be ~40%+ reduction
      expect(result.totalKeywords).toBe(12);
      expect(result.uniqueClusters).toBeLessThanOrEqual(7); // 12 * (1 - 0.40)
      expect(result.deduplicationRate).toBeGreaterThanOrEqual(40);

      console.log(`Test dataset: ${result.totalKeywords} keywords → ${result.uniqueClusters} clusters`);
      console.log(`Deduplication rate: ${result.deduplicationRate.toFixed(2)}%`);
    });
  });

  // ========== CLUSTER QUALITY ==========

  describe('Cluster Quality', () => {
    it('should have positive average similarity within clusters', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn,
        { similarityThreshold: 0.7 }
      );

      for (const cluster of result.clusters) {
        expect(cluster.avgSimilarity).toBeGreaterThan(0);
        expect(cluster.avgSimilarity).toBeLessThanOrEqual(1.0);
      }
    });

    it('cluster size should match keywords array length', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      for (const cluster of result.clusters) {
        expect(cluster.size).toBe(cluster.keywords.length);
      }
    });

    it('representative keyword should be in cluster keywords', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      for (const cluster of result.clusters) {
        expect(cluster.keywords).toContain(cluster.representativeKeyword);
      }
    });

    it('should respect minimum cluster size constraint', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn,
        { minClusterSize: 3 }
      );

      for (const cluster of result.clusters) {
        expect(cluster.size).toBeGreaterThanOrEqual(3);
      }
    });
  });

  // ========== CLUSTER NAMING ==========

  describe('Cluster Naming', () => {
    it('should generate human-readable cluster names', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn,
        { clusterNaming: 'auto' }
      );

      for (const cluster of result.clusters) {
        // Name should not be empty
        expect(cluster.name.length).toBeGreaterThan(0);

        // Name should not contain special characters (except spaces)
        expect(cluster.name).toMatch(/^[a-zA-Z0-9\s]+$/);
      }
    });

    it('should use representative keyword with representative naming', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn,
        { clusterNaming: 'representative' }
      );

      for (const cluster of result.clusters) {
        expect(cluster.name).toBe(cluster.representativeKeyword);
      }
    });
  });

  // ========== METRICS ==========

  describe('Clustering Metrics', () => {
    it('should report valid execution time', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      expect(result.metrics.executionTimeMs).toBeGreaterThan(0);
      expect(result.metrics.executionTimeMs).toBeLessThan(60000); // Less than 60 seconds
    });

    it('should report embedding time less than total execution time', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      expect(result.metrics.embeddingTimeMs).toBeLessThanOrEqual(result.metrics.executionTimeMs);
    });

    it('should calculate correct deduplication rate', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      const expectedRate = ((result.totalKeywords - result.uniqueClusters) / result.totalKeywords) * 100;
      expect(result.deduplicationRate).toBeCloseTo(expectedRate, 1);
    });

    it('should calculate average cluster size correctly', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      const totalKeywords = result.clusters.reduce((sum, c) => sum + c.size, 0);
      const expectedAvg = totalKeywords / result.uniqueClusters;
      expect(result.avgClusterSize).toBeCloseTo(expectedAvg, 1);
    });

    it('should track similarity comparisons', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      // N*(N-1)/2 for N keywords
      const expectedComparisons = (result.totalKeywords * (result.totalKeywords - 1)) / 2;
      expect(result.metrics.similarityComparisons).toBe(expectedComparisons);
    });
  });

  // ========== THRESHOLD TESTING ==========

  describe('Similarity Threshold', () => {
    it('should create more clusters with higher threshold', async () => {
      const resultLowThreshold = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb,
        embeddingFn,
        { similarityThreshold: 0.5 }
      );

      await mockDb.clear();

      const resultHighThreshold = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb,
        embeddingFn,
        { similarityThreshold: 0.9 }
      );

      // Higher threshold = less merging = more clusters
      expect(resultHighThreshold.uniqueClusters).toBeGreaterThanOrEqual(
        resultLowThreshold.uniqueClusters
      );
    });

    it('should create fewer clusters with lower threshold', async () => {
      const resultHighThreshold = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb,
        embeddingFn,
        { similarityThreshold: 0.9 }
      );

      await mockDb.clear();

      const resultLowThreshold = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb,
        embeddingFn,
        { similarityThreshold: 0.3 }
      );

      // Lower threshold = more merging = fewer clusters
      expect(resultLowThreshold.uniqueClusters).toBeLessThanOrEqual(
        resultHighThreshold.uniqueClusters
      );
    });
  });

  // ========== CLUSTER CONTENT ==========

  describe('Cluster Content', () => {
    it('should include all unique keywords in clusters', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      const allKeywordsInClusters = result.clusters.flatMap(c => c.keywords);
      const uniqueCount = new Set(allKeywordsInClusters).size;

      expect(uniqueCount).toBe(result.totalKeywords);
    });

    it('should not duplicate keywords across clusters', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      const allKeywords: string[] = [];
      for (const cluster of result.clusters) {
        for (const keyword of cluster.keywords) {
          allKeywords.push(keyword);
        }
      }

      const uniqueKeywords = new Set(allKeywords);
      expect(uniqueKeywords.size).toBe(allKeywords.length);
    });

    it('should extract common terms for clusters', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      for (const cluster of result.clusters) {
        if (cluster.size > 1) {
          // Multi-keyword clusters should have common terms
          expect(Array.isArray(cluster.metadata.commonTerms)).toBe(true);
        }
      }
    });
  });

  // ========== METADATA ==========

  describe('Cluster Metadata', () => {
    it('should include valid similarity statistics', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      for (const cluster of result.clusters) {
        const stats = cluster.metadata.similarityStats;

        expect(stats.min).toBeLessThanOrEqual(stats.max);
        expect(stats.mean).toBeGreaterThanOrEqual(stats.min);
        expect(stats.mean).toBeLessThanOrEqual(stats.max);
        expect(stats.stdDev).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include creation timestamp', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      for (const cluster of result.clusters) {
        expect(cluster.metadata.createdAt).toBeTruthy();
        // Should be ISO string
        expect(new Date(cluster.metadata.createdAt)).toBeInstanceOf(Date);
      }
    });

    it('should have unique cluster IDs', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn
      );

      const ids = result.clusters.map(c => c.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // ========== OPTIONS ==========

  describe('Clustering Options', () => {
    it('should respect similarityThreshold option', async () => {
      const result1 = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb,
        embeddingFn,
        { similarityThreshold: 0.5 }
      );

      await mockDb.clear();

      const result2 = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb,
        embeddingFn,
        { similarityThreshold: 0.95 }
      );

      // Different thresholds should produce different results
      expect(result1.uniqueClusters).not.toBe(result2.uniqueClusters);
    });

    it('should respect minClusterSize option', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn,
        { minClusterSize: 3 }
      );

      for (const cluster of result.clusters) {
        expect(cluster.size).toBeGreaterThanOrEqual(3);
      }
    });

    it('should accept custom clusterNaming option', async () => {
      const result = await clusterKeywordsSemantically(
        testKeywordDataset,
        mockDb as any,
        embeddingFn,
        { clusterNaming: 'representative' }
      );

      for (const cluster of result.clusters) {
        expect(cluster.name).toBe(cluster.representativeKeyword);
      }
    });
  });
});
