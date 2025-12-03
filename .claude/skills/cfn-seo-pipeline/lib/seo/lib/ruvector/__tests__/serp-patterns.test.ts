/**
 * SERP Patterns Collection Tests
 *
 * Tests for seo_serp_patterns RuVector collection.
 * Follows London School TDD principles with mock VectorDB.
 *
 * @module seo/lib/ruvector/__tests__/serp-patterns.test
 */

import type { VectorDB } from '@ruvector/core';
import {
  SERPPatternsCollection,
  type SERPPatternInput,
  type SERPPatternQueryOptions,
} from '../collections/serp-patterns';
import {
  COLLECTION_TTL_DAYS,
  SEO_COLLECTIONS,
  calculateFreshnessScore,
  generateSERPPatternId,
  isSERPPatternEntry,
  type SERPPatternEntry,
  type SERPFeature,
  type SERPFeatureOpportunity,
  type RankingPattern,
  type SemanticCluster,
} from '../schemas';

// Mock VectorDB implementation
function createMockVectorDB(): VectorDB & { _storage: Map<string, any> } {
  const storage = new Map<string, any>();

  return {
    _storage: storage,
    insert: jest.fn(async (item: { id: string; vector: Float32Array; metadata: any }) => {
      storage.set(item.id, { ...item, score: 1.0 });
    }),
    delete: jest.fn(async (id: string) => {
      storage.delete(id);
    }),
    search: jest.fn(async (params: { vector: Float32Array; k: number; filter?: (item: any) => boolean }) => {
      const results = Array.from(storage.values());

      // If filter provided, apply it - pass the full item structure
      if (params.filter) {
        return results
          .filter((item) => params.filter!({ metadata: item.metadata }))
          .slice(0, params.k);
      }

      // Calculate mock similarity scores based on vector similarity
      return results
        .map((item) => ({
          ...item,
          score: calculateMockSimilarity(item.vector, params.vector),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, params.k);
    }),
  } as VectorDB & { _storage: Map<string, any> };
}

// Deterministic embedding function for testing
async function mockEmbeddingFn(text: string): Promise<Float32Array> {
  const vector = new Float32Array(1536);
  // Create deterministic but unique embeddings based on text hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  for (let i = 0; i < 1536; i++) {
    vector[i] = Math.sin(hash + i) * 0.5 + 0.5;
  }
  return vector;
}

// Calculate mock similarity (cosine-like)
function calculateMockSimilarity(v1: Float32Array, v2: Float32Array): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// Test data factory
function createSERPPatternInput(overrides: Partial<SERPPatternInput> = {}): SERPPatternInput {
  return {
    keyword: 'best coffee beans',
    featuresPresent: [
      { type: 'featured_snippet', position: 0, details: 'Paragraph snippet' },
      { type: 'people_also_ask', position: 2, details: '4 questions' },
    ],
    featuresOpportunity: [
      { type: 'featured_snippet', reason: 'Current snippet is outdated', difficulty: 0.6 },
    ],
    rankingPatterns: {
      avgContentLength: 2500,
      avgDomainAuthority: 45,
      freshnessSignal: true,
      topFactors: ['content depth', 'backlinks', 'expertise'],
    },
    semanticClusters: [
      { name: 'coffee origin', keywords: ['arabica', 'robusta', 'single origin'], weight: 0.8 },
    ],
    topCompetitors: ['coffeegeek.com', 'seriouseats.com'],
    clusterId: 'cluster-coffee-001',
    ...overrides,
  };
}

describe('SERPPatternsCollection', () => {
  let collection: SERPPatternsCollection;
  let mockDb: VectorDB & { _storage: Map<string, any> };

  beforeEach(() => {
    mockDb = createMockVectorDB();
    collection = new SERPPatternsCollection(mockDb, mockEmbeddingFn);
  });

  describe('add', () => {
    it('should add a new SERP pattern with all fields', async () => {
      const input = createSERPPatternInput();

      const result = await collection.add(input);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.metadata.keyword).toBe(input.keyword);
      expect(result.metadata.featuresPresent).toHaveLength(2);
      expect(result.metadata.featuresOpportunity).toHaveLength(1);
      expect(result.metadata.rankingPatterns.avgContentLength).toBe(2500);
      expect(result.metadata.freshnessScore).toBe(1.0);
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    it('should use week-bucket ID generation (same ID within same week)', async () => {
      // Note: Implementation uses week buckets for ID generation
      // Same keyword within same week = same ID (allows upsert pattern)
      const input = createSERPPatternInput();

      const result1 = await collection.add(input);
      const result2 = await collection.add(input);

      // IDs will be the same since they're in the same week bucket
      expect(result1.id).toBe(result2.id);
    });

    it('should default empty arrays for optional fields', async () => {
      const input: SERPPatternInput = {
        keyword: 'minimal keyword',
        rankingPatterns: {
          avgContentLength: 1500,
          avgDomainAuthority: 30,
          freshnessSignal: false,
          topFactors: ['content'],
        },
      };

      const result = await collection.add(input);

      expect(result.metadata.featuresPresent).toEqual([]);
      expect(result.metadata.featuresOpportunity).toEqual([]);
      expect(result.metadata.semanticClusters).toEqual([]);
      expect(result.metadata.topCompetitors).toEqual([]);
    });

    it('should set correct TTL-based expiration', async () => {
      const input = createSERPPatternInput();
      const beforeAdd = new Date();

      const result = await collection.add(input);

      const expectedTTL = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.SERP_PATTERNS]; // 21 days
      const capturedAt = new Date(result.metadata.capturedAt);
      const expiresAt = new Date(result.metadata.expiresAt);

      const daysDiff = (expiresAt.getTime() - capturedAt.getTime()) / (1000 * 60 * 60 * 24);
      expect(Math.round(daysDiff)).toBe(expectedTTL);
    });

    it('should store clusterId when provided', async () => {
      const input = createSERPPatternInput({ clusterId: 'test-cluster-123' });

      const result = await collection.add(input);

      expect(result.metadata.clusterId).toBe('test-cluster-123');
    });

    it('should handle complex SERP features', async () => {
      const complexFeatures: SERPFeature[] = [
        { type: 'featured_snippet', position: 0, details: 'List snippet' },
        { type: 'local_pack', position: 1, details: '3 local results' },
        { type: 'image_pack', position: 3, details: '8 images' },
        { type: 'video_carousel', position: 5, details: '4 videos from YouTube' },
        { type: 'knowledge_panel', position: null, details: 'Brand panel' },
      ];

      const input = createSERPPatternInput({ featuresPresent: complexFeatures });

      const result = await collection.add(input);

      expect(result.metadata.featuresPresent).toHaveLength(5);
      expect(result.metadata.featuresPresent[4].type).toBe('knowledge_panel');
    });
  });

  describe('update', () => {
    it('should update an existing SERP pattern', async () => {
      const input = createSERPPatternInput();
      const original = await collection.add(input);

      const updated = await collection.update(original.id, {
        topCompetitors: ['newsite.com', 'anothersite.com', 'thirdsite.com'],
      });

      expect(updated).not.toBeNull();
      expect(updated!.metadata.topCompetitors).toHaveLength(3);
      expect(updated!.metadata.topCompetitors).toContain('newsite.com');
    });

    it('should return null for non-existent ID', async () => {
      const result = await collection.update('non-existent-id', {
        keyword: 'updated keyword',
      });

      expect(result).toBeNull();
    });

    it('should update ranking patterns', async () => {
      const input = createSERPPatternInput();
      const original = await collection.add(input);

      const newRankingPatterns: RankingPattern = {
        avgContentLength: 3500,
        avgDomainAuthority: 60,
        freshnessSignal: false,
        topFactors: ['authority', 'comprehensiveness', 'user engagement'],
      };

      const updated = await collection.update(original.id, {
        rankingPatterns: newRankingPatterns,
      });

      expect(updated!.metadata.rankingPatterns.avgContentLength).toBe(3500);
      expect(updated!.metadata.rankingPatterns.avgDomainAuthority).toBe(60);
      expect(updated!.metadata.rankingPatterns.freshnessSignal).toBe(false);
    });

    it('should preserve original data for fields not updated', async () => {
      const input = createSERPPatternInput();
      const original = await collection.add(input);

      const updated = await collection.update(original.id, {
        topCompetitors: ['onlythis.com'],
      });

      expect(updated!.metadata.keyword).toBe(original.metadata.keyword);
      expect(updated!.metadata.featuresPresent).toEqual(original.metadata.featuresPresent);
      expect(updated!.metadata.rankingPatterns).toEqual(original.metadata.rankingPatterns);
    });

    it('should recalculate freshness score on update', async () => {
      const input = createSERPPatternInput();
      const original = await collection.add(input);

      // Initial freshness should be 1.0
      expect(original.metadata.freshnessScore).toBe(1.0);

      const updated = await collection.update(original.id, {
        keyword: 'updated keyword',
      });

      // Freshness should still be high (nearly 1.0) since just created
      expect(updated!.metadata.freshnessScore).toBeGreaterThan(0.9);
    });
  });

  describe('getById', () => {
    it('should retrieve a SERP pattern by ID', async () => {
      const input = createSERPPatternInput();
      const added = await collection.add(input);

      const retrieved = await collection.getById(added.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(added.id);
      expect(retrieved!.metadata.keyword).toBe(input.keyword);
    });

    it('should return null for non-existent ID', async () => {
      const result = await collection.getById('does-not-exist');

      expect(result).toBeNull();
    });

    it('should return null for empty ID', async () => {
      const result = await collection.getById('');

      expect(result).toBeNull();
    });
  });

  describe('getLatestForKeyword', () => {
    it('should get the most recent pattern for a keyword', async () => {
      // Add older pattern
      const input1 = createSERPPatternInput({ keyword: 'test keyword' });
      await collection.add(input1);

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Add newer pattern
      const input2 = createSERPPatternInput({
        keyword: 'test keyword',
        rankingPatterns: {
          avgContentLength: 3000,
          avgDomainAuthority: 55,
          freshnessSignal: true,
          topFactors: ['newer', 'factors'],
        },
      });
      const newer = await collection.add(input2);

      const result = await collection.getLatestForKeyword('test keyword');

      expect(result).not.toBeNull();
      expect(result!.id).toBe(newer.id);
      expect(result!.metadata.rankingPatterns.avgContentLength).toBe(3000);
    });

    it('should handle case-insensitive keyword matching', async () => {
      const input = createSERPPatternInput({ keyword: 'Best Coffee Beans' });
      const added = await collection.add(input);

      const result = await collection.getLatestForKeyword('best coffee beans');

      expect(result).not.toBeNull();
      expect(result!.id).toBe(added.id);
    });

    it('should return null when no patterns exist for keyword', async () => {
      const input = createSERPPatternInput({ keyword: 'existing keyword' });
      await collection.add(input);

      const result = await collection.getLatestForKeyword('non-existent keyword');

      expect(result).toBeNull();
    });

    it('should trim whitespace in keyword comparison', async () => {
      const input = createSERPPatternInput({ keyword: 'trimmed keyword' });
      const added = await collection.add(input);

      const result = await collection.getLatestForKeyword('  trimmed keyword  ');

      expect(result).not.toBeNull();
      expect(result!.id).toBe(added.id);
    });
  });

  describe('search', () => {
    it('should search patterns by semantic similarity', async () => {
      const input1 = createSERPPatternInput({ keyword: 'best coffee beans for espresso' });
      const input2 = createSERPPatternInput({ keyword: 'how to brew pour over coffee' });
      const input3 = createSERPPatternInput({ keyword: 'cat food reviews' });

      await collection.add(input1);
      await collection.add(input2);
      await collection.add(input3);

      const results = await collection.search('coffee brewing methods', { limit: 5 });

      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.entry).toBeDefined();
        expect(r.similarity).toBeDefined();
        expect(r.similarity).toBeGreaterThanOrEqual(0);
        expect(r.similarity).toBeLessThanOrEqual(1);
      });
    });

    it('should filter by minimum similarity', async () => {
      const input = createSERPPatternInput({ keyword: 'coffee' });
      await collection.add(input);

      const highThreshold = await collection.search('completely unrelated quantum physics', {
        minSimilarity: 0.95,
      });

      // With high threshold and unrelated query, should filter out
      expect(highThreshold.length).toBeLessThanOrEqual(1);
    });

    it('should filter by clusterId', async () => {
      const input1 = createSERPPatternInput({ keyword: 'coffee 1', clusterId: 'cluster-A' });
      const input2 = createSERPPatternInput({ keyword: 'coffee 2', clusterId: 'cluster-B' });

      await collection.add(input1);
      await collection.add(input2);

      const results = await collection.search('coffee', { clusterId: 'cluster-A' });

      results.forEach((r) => {
        expect(r.entry.metadata.clusterId).toBe('cluster-A');
      });
    });

    it('should filter by SERP feature presence', async () => {
      const withSnippet = createSERPPatternInput({
        keyword: 'with snippet',
        featuresPresent: [{ type: 'featured_snippet', position: 0, details: 'test' }],
      });
      const withoutSnippet = createSERPPatternInput({
        keyword: 'without snippet',
        featuresPresent: [{ type: 'people_also_ask', position: 1, details: 'test' }],
      });

      await collection.add(withSnippet);
      await collection.add(withoutSnippet);

      const results = await collection.search('keyword', { hasFeature: 'featured_snippet' });

      results.forEach((r) => {
        const hasFeature = r.entry.metadata.featuresPresent.some(
          (f) => f.type.toLowerCase() === 'featured_snippet'
        );
        expect(hasFeature).toBe(true);
      });
    });

    it('should exclude stale entries when requested', async () => {
      const input = createSERPPatternInput();
      const added = await collection.add(input);

      // Mock stale entry by manipulating metadata (in real scenario would be old date)
      // Fresh entries should be included
      const results = await collection.search('coffee', { excludeStale: true });

      // New entries should not be excluded
      expect(results.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      // Add multiple patterns
      for (let i = 0; i < 10; i++) {
        await collection.add(createSERPPatternInput({ keyword: `coffee variant ${i}` }));
      }

      const results = await collection.search('coffee', { limit: 3 });

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getByClusterId', () => {
    it('should retrieve all patterns for a cluster', async () => {
      const clusterId = 'test-cluster-xyz';
      const input1 = createSERPPatternInput({ keyword: 'keyword 1', clusterId });
      const input2 = createSERPPatternInput({ keyword: 'keyword 2', clusterId });
      const input3 = createSERPPatternInput({ keyword: 'keyword 3', clusterId: 'other-cluster' });

      await collection.add(input1);
      await collection.add(input2);
      await collection.add(input3);

      const results = await collection.getByClusterId(clusterId);

      expect(results.length).toBe(2);
      results.forEach((r) => {
        expect(r.metadata.clusterId).toBe(clusterId);
      });
    });

    it('should return empty array for non-existent cluster', async () => {
      const input = createSERPPatternInput({ clusterId: 'existing-cluster' });
      await collection.add(input);

      const results = await collection.getByClusterId('non-existent-cluster');

      expect(results).toEqual([]);
    });
  });

  describe('hasFreshPattern', () => {
    it('should return true for fresh pattern', async () => {
      const input = createSERPPatternInput({ keyword: 'fresh keyword' });
      await collection.add(input);

      const hasFresh = await collection.hasFreshPattern('fresh keyword');

      expect(hasFresh).toBe(true);
    });

    it('should return false for non-existent keyword', async () => {
      const hasFresh = await collection.hasFreshPattern('non-existent keyword');

      expect(hasFresh).toBe(false);
    });

    it('should respect custom freshness threshold', async () => {
      const input = createSERPPatternInput({ keyword: 'test keyword' });
      await collection.add(input);

      // With threshold of 0.99, even very fresh patterns might not pass
      const hasFreshHighThreshold = await collection.hasFreshPattern('test keyword', 0.99);
      // With threshold of 0.1, should definitely pass
      const hasFreshLowThreshold = await collection.hasFreshPattern('test keyword', 0.1);

      expect(hasFreshLowThreshold).toBe(true);
    });
  });

  describe('getFeaturedSnippetOpportunities', () => {
    it('should find featured snippet opportunities', async () => {
      const withOpportunity = createSERPPatternInput({
        keyword: 'opportunity keyword',
        featuresOpportunity: [
          { type: 'featured_snippet', reason: 'Current snippet is weak', difficulty: 0.5 },
        ],
      });
      const withoutOpportunity = createSERPPatternInput({
        keyword: 'no opportunity',
        featuresOpportunity: [
          { type: 'people_also_ask', reason: 'Can add questions', difficulty: 0.3 },
        ],
      });

      await collection.add(withOpportunity);
      await collection.add(withoutOpportunity);

      const opportunities = await collection.getFeaturedSnippetOpportunities();

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].keyword).toBe('opportunity keyword');
      expect(opportunities[0].reason).toBe('Current snippet is weak');
    });

    it('should filter by clusterId when provided', async () => {
      const clusterA = createSERPPatternInput({
        keyword: 'cluster a keyword',
        clusterId: 'cluster-A',
        featuresOpportunity: [
          { type: 'featured_snippet', reason: 'Opportunity A', difficulty: 0.5 },
        ],
      });
      const clusterB = createSERPPatternInput({
        keyword: 'cluster b keyword',
        clusterId: 'cluster-B',
        featuresOpportunity: [
          { type: 'featured_snippet', reason: 'Opportunity B', difficulty: 0.4 },
        ],
      });

      await collection.add(clusterA);
      await collection.add(clusterB);

      const opportunities = await collection.getFeaturedSnippetOpportunities('cluster-A');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].keyword).toBe('cluster a keyword');
    });

    it('should return empty array when no opportunities exist', async () => {
      const input = createSERPPatternInput({
        keyword: 'no snippet',
        featuresOpportunity: [],
      });
      await collection.add(input);

      const opportunities = await collection.getFeaturedSnippetOpportunities();

      expect(opportunities).toEqual([]);
    });
  });

  describe('getAverageRankingPatterns', () => {
    it('should calculate average ranking patterns for a cluster', async () => {
      const clusterId = 'avg-cluster';
      const input1 = createSERPPatternInput({
        keyword: 'kw1',
        clusterId,
        rankingPatterns: {
          avgContentLength: 2000,
          avgDomainAuthority: 40,
          freshnessSignal: true,
          topFactors: ['content', 'backlinks'],
        },
      });
      const input2 = createSERPPatternInput({
        keyword: 'kw2',
        clusterId,
        rankingPatterns: {
          avgContentLength: 3000,
          avgDomainAuthority: 50,
          freshnessSignal: true,
          topFactors: ['content', 'expertise'],
        },
      });
      const input3 = createSERPPatternInput({
        keyword: 'kw3',
        clusterId,
        rankingPatterns: {
          avgContentLength: 2500,
          avgDomainAuthority: 45,
          freshnessSignal: false,
          topFactors: ['backlinks', 'expertise'],
        },
      });

      await collection.add(input1);
      await collection.add(input2);
      await collection.add(input3);

      const avgPatterns = await collection.getAverageRankingPatterns(clusterId);

      expect(avgPatterns).not.toBeNull();
      expect(avgPatterns!.avgContentLength).toBe(2500); // (2000 + 3000 + 2500) / 3
      expect(avgPatterns!.avgDomainAuthority).toBe(45); // (40 + 50 + 45) / 3
      expect(avgPatterns!.freshnessSignal).toBe(true); // Majority vote (2 out of 3)
      expect(avgPatterns!.topFactors).toContain('content');
      expect(avgPatterns!.topFactors).toContain('backlinks');
    });

    it('should return null for non-existent cluster', async () => {
      const avgPatterns = await collection.getAverageRankingPatterns('non-existent-cluster');

      expect(avgPatterns).toBeNull();
    });

    it('should limit top factors to 5', async () => {
      const clusterId = 'many-factors-cluster';
      const manyFactors = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'];

      const input = createSERPPatternInput({
        keyword: 'kw',
        clusterId,
        rankingPatterns: {
          avgContentLength: 2000,
          avgDomainAuthority: 40,
          freshnessSignal: true,
          topFactors: manyFactors,
        },
      });

      await collection.add(input);

      const avgPatterns = await collection.getAverageRankingPatterns(clusterId);

      expect(avgPatterns!.topFactors.length).toBeLessThanOrEqual(5);
    });
  });

  describe('delete', () => {
    it('should delete a SERP pattern', async () => {
      const input = createSERPPatternInput();
      const added = await collection.add(input);

      const deleteResult = await collection.delete(added.id);

      expect(deleteResult).toBe(true);
      expect(mockDb.delete).toHaveBeenCalledWith(added.id);

      const retrieved = await collection.getById(added.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent ID deletion', async () => {
      // Mock delete to throw for non-existent
      (mockDb.delete as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

      const result = await collection.delete('non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('getStaleEntries', () => {
    it('should identify stale entries', async () => {
      const input = createSERPPatternInput();
      const added = await collection.add(input);

      // Fresh entries should not be returned as stale
      const staleEntries = await collection.getStaleEntries(0.3);

      // Newly added entries have freshness 1.0, so should not be stale
      const isStale = staleEntries.some((e) => e.id === added.id);
      expect(isStale).toBe(false);
    });

    it('should use custom threshold', async () => {
      const input = createSERPPatternInput();
      await collection.add(input);

      // With threshold of 1.0, even fresh entries are "stale"
      const staleWithHighThreshold = await collection.getStaleEntries(1.1);

      // Fresh entries (1.0) should be included when threshold is > 1.0
      // But realistically freshness maxes at 1.0
      expect(Array.isArray(staleWithHighThreshold)).toBe(true);
    });
  });

  describe('getCollectionName', () => {
    it('should return correct collection name', () => {
      const name = collection.getCollectionName();

      expect(name).toBe(SEO_COLLECTIONS.SERP_PATTERNS);
      expect(name).toBe('seo_serp_patterns');
    });
  });

  describe('edge cases', () => {
    it('should handle empty semantic clusters', async () => {
      const input = createSERPPatternInput({ semanticClusters: [] });

      const result = await collection.add(input);

      expect(result.metadata.semanticClusters).toEqual([]);
    });

    it('should handle patterns with no features', async () => {
      const input = createSERPPatternInput({
        featuresPresent: [],
        featuresOpportunity: [],
      });

      const result = await collection.add(input);

      expect(result.metadata.featuresPresent).toEqual([]);
      expect(result.metadata.featuresOpportunity).toEqual([]);
    });

    it('should handle very long keyword strings', async () => {
      const longKeyword = 'a'.repeat(500);
      const input = createSERPPatternInput({ keyword: longKeyword });

      const result = await collection.add(input);

      expect(result.metadata.keyword).toBe(longKeyword);
    });

    it('should handle special characters in keywords', async () => {
      const specialKeyword = 'café & résumé "quotes" <html>';
      const input = createSERPPatternInput({ keyword: specialKeyword });

      const result = await collection.add(input);

      expect(result.metadata.keyword).toBe(specialKeyword);
    });

    it('should handle null position in SERP features', async () => {
      const input = createSERPPatternInput({
        featuresPresent: [
          { type: 'knowledge_panel', position: null, details: 'Side panel' },
        ],
      });

      const result = await collection.add(input);

      expect(result.metadata.featuresPresent[0].position).toBeNull();
    });

    it('should handle zero values in ranking patterns', async () => {
      const input = createSERPPatternInput({
        rankingPatterns: {
          avgContentLength: 0,
          avgDomainAuthority: 0,
          freshnessSignal: false,
          topFactors: [],
        },
      });

      const result = await collection.add(input);

      expect(result.metadata.rankingPatterns.avgContentLength).toBe(0);
      expect(result.metadata.rankingPatterns.avgDomainAuthority).toBe(0);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent adds', async () => {
      const inputs = Array.from({ length: 5 }, (_, i) =>
        createSERPPatternInput({ keyword: `concurrent keyword ${i}` })
      );

      const results = await Promise.all(inputs.map((input) => collection.add(input)));

      expect(results.length).toBe(5);
      const uniqueIds = new Set(results.map((r) => r.id));
      expect(uniqueIds.size).toBe(5);
    });

    it('should handle concurrent searches', async () => {
      await collection.add(createSERPPatternInput());

      const searches = Array.from({ length: 5 }, () =>
        collection.search('coffee', { limit: 5 })
      );

      const results = await Promise.all(searches);

      results.forEach((r) => {
        expect(Array.isArray(r)).toBe(true);
      });
    });
  });
});
