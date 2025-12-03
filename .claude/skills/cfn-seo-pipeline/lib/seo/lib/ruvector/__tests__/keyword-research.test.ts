import { KeywordResearchCollection, type KeywordResearchInput } from '../collections/keyword-research';
import {
  KeywordResearchEntry,
  COLLECTION_TTL_DAYS,
  SEO_COLLECTIONS,
  SecondaryKeyword,
} from '../schemas';

// Mock VectorDB implementation with in-memory storage
class MockVectorDB {
  private store: Map<string, KeywordResearchEntry> = new Map();
  private vectors: Map<string, Float32Array> = new Map();

  async insert(item: {
    id: string;
    vector: Float32Array;
    metadata: KeywordResearchEntry;
  }): Promise<void> {
    this.store.set(item.id, item.metadata);
    this.vectors.set(item.id, item.vector);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
    this.vectors.delete(id);
  }

  async search(options: {
    vector: Float32Array;
    k: number;
    filter?: (item: any) => boolean;
  }): Promise<
    Array<{
      metadata: KeywordResearchEntry;
      score: number;
    }>
  > {
    const results: Array<{ metadata: KeywordResearchEntry; score: number }> = [];

    for (const [, metadata] of this.store) {
      if (options.filter && !options.filter({ metadata })) {
        continue;
      }

      const vector = this.vectors.get(metadata.id);
      if (!vector) continue;

      const score = this.calculateSimilarity(options.vector, vector);
      results.push({ metadata, score });
    }

    // Sort by similarity descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, options.k);
  }

  private calculateSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
}

// Mock embedding function that returns deterministic Float32Array
const mockEmbeddingFn = async (text: string): Promise<Float32Array> => {
  const hash = text.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);

  const vector = new Float32Array(1536);
  for (let i = 0; i < 1536; i++) {
    vector[i] = Math.sin((hash + i) * 0.1) * 0.5 + 0.5;
  }
  return vector;
};

describe('KeywordResearchCollection', () => {
  let collection: KeywordResearchCollection;
  let mockDb: MockVectorDB;

  beforeEach(() => {
    mockDb = new MockVectorDB();
    collection = new KeywordResearchCollection(mockDb as any, mockEmbeddingFn);
  });

  describe('add()', () => {
    it('should create keyword research with all fields', async () => {
      const input: KeywordResearchInput = {
        primaryKeyword: 'machine learning basics',
        searchVolume: 12500,
        keywordDifficulty: 45,
        cpc: 2.35,
        searchIntent: 'informational',
        secondaryKeywords: [
          { keyword: 'ML introduction', volume: 8000, difficulty: 40, cpc: 2.0 },
        ],
        longTailKeywords: ['machine learning basics for beginners'],
        niche: 'technology',
        clusterId: 'cluster-tech-001',
      };

      const entry = await collection.add(input);

      expect(entry).toBeDefined();
      expect(entry.metadata.primaryKeyword).toBe('machine learning basics');
      expect(entry.metadata.searchVolume).toBe(12500);
      expect(entry.metadata.keywordDifficulty).toBe(45);
      expect(entry.metadata.cpc).toBe(2.35);
      expect(entry.metadata.searchIntent).toBe('informational');
      expect(entry.metadata.niche).toBe('technology');
      expect(entry.metadata.clusterId).toBe('cluster-tech-001');
    });

    it('should set required metadata fields during creation', async () => {
      const input: KeywordResearchInput = {
        primaryKeyword: 'test keyword',
        searchVolume: 1000,
        keywordDifficulty: 30,
        cpc: 1.5,
        searchIntent: 'navigational',
        niche: 'general',
      };

      const entry = await collection.add(input);

      expect(entry.metadata).toBeDefined();
      expect(entry.metadata.primaryKeyword).toBe('test keyword');
      expect(entry.metadata.createdAt).toBeInstanceOf(Date);
      expect(entry.metadata.expiresAt).toBeInstanceOf(Date);
      expect(entry.metadata.freshnessScore).toBe(1.0);
      expect(entry.metadata.secondaryKeywords).toEqual([]);
      expect(entry.metadata.longTailKeywords).toEqual([]);
      expect(entry.metadata.peopleAlsoAsk).toEqual([]);
      expect(entry.metadata.relatedSearches).toEqual([]);
    });

    it('should calculate correct expiration date (90 days from creation)', async () => {
      const now = new Date();
      const input: KeywordResearchInput = {
        primaryKeyword: 'expiry test',
        searchVolume: 500,
        keywordDifficulty: 25,
        cpc: 1.0,
        searchIntent: 'informational',
        niche: 'test',
      };

      const entry = await collection.add(input);
      const ttlMs = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.KEYWORD_RESEARCH] * 24 * 60 * 60 * 1000;
      const expectedExpiry = new Date(now.getTime() + ttlMs);

      expect(entry.metadata.expiresAt.getTime()).toBeCloseTo(expectedExpiry.getTime(), -3);
    });

    it('should set freshnessScore to 1.0 on creation', async () => {
      const input: KeywordResearchInput = {
        primaryKeyword: 'fresh test',
        searchVolume: 600,
        keywordDifficulty: 28,
        cpc: 1.2,
        searchIntent: 'commercial',
        niche: 'test',
      };

      const entry = await collection.add(input);

      expect(entry.metadata.freshnessScore).toBe(1.0);
    });
  });

  describe('update()', () => {
    let existingId: string;

    beforeEach(async () => {
      const input: KeywordResearchInput = {
        primaryKeyword: 'original keyword',
        searchVolume: 5000,
        keywordDifficulty: 40,
        cpc: 2.0,
        searchIntent: 'informational',
        niche: 'original',
        clusterId: 'cluster-orig',
      };
      const entry = await collection.add(input);
      existingId = entry.id;
    });

    it('should update existing entries', async () => {
      const updates: Partial<KeywordResearchInput> = {
        searchVolume: 6000,
        keywordDifficulty: 45,
      };

      const updated = await collection.update(existingId, updates);

      expect(updated).toBeDefined();
      expect(updated!.metadata.searchVolume).toBe(6000);
      expect(updated!.metadata.keywordDifficulty).toBe(45);
      expect(updated!.metadata.primaryKeyword).toBe('original keyword');
    });

    it('should update searchIntent field', async () => {
      const updated = await collection.update(existingId, { searchIntent: 'transactional' });

      expect(updated!.metadata.searchIntent).toBe('transactional');
    });

    it('should preserve unmodified fields during partial update', async () => {
      const originalCpc = (await collection.getById(existingId))!.metadata.cpc;

      const updated = await collection.update(existingId, { keywordDifficulty: 50 });

      expect(updated!.metadata.cpc).toBe(originalCpc);
    });

    it('should return null when updating non-existent entry', async () => {
      const result = await collection.update('non-existent-id', { searchVolume: 1000 });

      expect(result).toBeNull();
    });
  });

  describe('getById()', () => {
    let testId: string;

    beforeEach(async () => {
      const input: KeywordResearchInput = {
        primaryKeyword: 'retrieve test',
        searchVolume: 3000,
        keywordDifficulty: 35,
        cpc: 1.8,
        searchIntent: 'commercial',
        niche: 'retrieve',
        clusterId: 'cluster-retrieve',
      };
      const entry = await collection.add(input);
      testId = entry.id;
    });

    it('should retrieve entry by ID', async () => {
      const result = await collection.getById(testId);

      expect(result).toBeDefined();
      expect(result!.id).toBe(testId);
      expect(result!.metadata.primaryKeyword).toBe('retrieve test');
    });

    it('should return null for non-existent ID', async () => {
      const result = await collection.getById('non-existent');

      expect(result).toBeNull();
    });

    it('should retrieve complete object with all metadata fields', async () => {
      const result = await collection.getById(testId);

      expect(result!.metadata).toHaveProperty('primaryKeyword');
      expect(result!.metadata).toHaveProperty('searchVolume');
      expect(result!.metadata).toHaveProperty('keywordDifficulty');
      expect(result!.metadata).toHaveProperty('cpc');
      expect(result!.metadata).toHaveProperty('searchIntent');
      expect(result!.metadata).toHaveProperty('secondaryKeywords');
      expect(result!.metadata).toHaveProperty('createdAt');
      expect(result!.metadata).toHaveProperty('expiresAt');
      expect(result!.metadata).toHaveProperty('freshnessScore');
    });
  });

  describe('getByKeyword()', () => {
    beforeEach(async () => {
      const inputs: KeywordResearchInput[] = [
        {
          primaryKeyword: 'exact keyword match',
          searchVolume: 2000,
          keywordDifficulty: 30,
          cpc: 1.5,
          searchIntent: 'informational',
          niche: 'niche1',
          clusterId: 'cluster-1',
        },
        {
          primaryKeyword: 'different keyword',
          searchVolume: 1500,
          keywordDifficulty: 25,
          cpc: 1.2,
          searchIntent: 'navigational',
          niche: 'niche2',
          clusterId: 'cluster-2',
        },
      ];

      for (const input of inputs) {
        await collection.add(input);
      }
    });

    it('should retrieve by primary keyword via generated ID', async () => {
      const result = await collection.getByKeyword('exact keyword match');

      expect(result).toBeDefined();
      expect(result!.metadata.primaryKeyword).toBe('exact keyword match');
    });

    it('should return null for non-existent keyword', async () => {
      const result = await collection.getByKeyword('non-existent keyword');

      expect(result).toBeNull();
    });

    it('should perform exact match on primary keyword', async () => {
      const result = await collection.getByKeyword('exact keyword');

      expect(result).toBeNull();
    });
  });

  describe('search()', () => {
    beforeEach(async () => {
      const inputs: KeywordResearchInput[] = [
        {
          primaryKeyword: 'python programming',
          searchVolume: 15000,
          keywordDifficulty: 50,
          cpc: 3.5,
          searchIntent: 'informational',
          niche: 'programming',
          clusterId: 'cluster-python',
          secondaryKeywords: [
            { keyword: 'python basics', volume: 8000, difficulty: 40, cpc: 2.8 },
          ],
        },
        {
          primaryKeyword: 'python frameworks',
          searchVolume: 8000,
          keywordDifficulty: 60,
          cpc: 4.2,
          searchIntent: 'informational',
          niche: 'programming',
          clusterId: 'cluster-frameworks',
        },
        {
          primaryKeyword: 'buy python books',
          searchVolume: 3000,
          keywordDifficulty: 40,
          cpc: 2.8,
          searchIntent: 'transactional',
          niche: 'books',
          clusterId: 'cluster-books',
        },
        {
          primaryKeyword: 'java programming',
          searchVolume: 12000,
          keywordDifficulty: 55,
          cpc: 3.2,
          searchIntent: 'informational',
          niche: 'programming',
          clusterId: 'cluster-java',
        },
      ];

      for (const input of inputs) {
        await collection.add(input);
      }
    });

    it('should perform semantic search returning results', async () => {
      const results = await collection.search('python programming');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return entries with similarity scores', async () => {
      const results = await collection.search('python programming');

      if (results.length > 0) {
        expect(results[0]).toHaveProperty('entry');
        expect(results[0]).toHaveProperty('similarity');
        expect(typeof results[0].similarity).toBe('number');
      }
    });

    it('should filter by niche', async () => {
      const results = await collection.search('programming', { niche: 'programming' });

      expect(results.every((r) => r.entry.metadata.niche === 'programming')).toBe(true);
    });

    it('should filter by clusterId', async () => {
      const results = await collection.search('python', { clusterId: 'cluster-python' });

      expect(results.every((r) => r.entry.metadata.clusterId === 'cluster-python')).toBe(true);
    });

    it('should filter by searchIntent', async () => {
      const results = await collection.search('keyword', { searchIntent: 'transactional' });

      expect(
        results.every((r) => r.entry.metadata.searchIntent === 'transactional')
      ).toBe(true);
    });

    it('should combine multiple filters', async () => {
      const results = await collection.search('python', {
        niche: 'programming',
        searchIntent: 'informational',
      });

      expect(
        results.every(
          (r) =>
            r.entry.metadata.niche === 'programming' &&
            r.entry.metadata.searchIntent === 'informational'
        )
      ).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const results = await collection.search('programming', { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array when filters match no entries', async () => {
      const results = await collection.search('keyword', { niche: 'nonexistent' });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should handle minSimilarity filtering', async () => {
      const results = await collection.search('python programming', { minSimilarity: 0.8 });

      expect(results.every((r) => r.similarity >= 0.8)).toBe(true);
    });
  });

  describe('getByClusterId()', () => {
    beforeEach(async () => {
      const inputs: KeywordResearchInput[] = [
        {
          primaryKeyword: 'seo basics',
          searchVolume: 5000,
          keywordDifficulty: 35,
          cpc: 1.5,
          searchIntent: 'informational',
          niche: 'seo',
          clusterId: 'cluster-seo-001',
        },
        {
          primaryKeyword: 'on page optimization',
          searchVolume: 3000,
          keywordDifficulty: 30,
          cpc: 1.2,
          searchIntent: 'informational',
          niche: 'seo',
          clusterId: 'cluster-seo-001',
        },
        {
          primaryKeyword: 'backlink building',
          searchVolume: 2500,
          keywordDifficulty: 45,
          cpc: 2.0,
          searchIntent: 'informational',
          niche: 'seo',
          clusterId: 'cluster-seo-002',
        },
      ];

      for (const input of inputs) {
        await collection.add(input);
      }
    });

    it('should retrieve all research for a cluster', async () => {
      const results = await collection.getByClusterId('cluster-seo-001');

      expect(results.length).toBe(2);
      expect(results.every((r) => r.metadata.clusterId === 'cluster-seo-001')).toBe(true);
    });

    it('should return empty array for cluster with no entries', async () => {
      const results = await collection.getByClusterId('non-existent-cluster');

      expect(results).toEqual([]);
    });

    it('should return all fields for each entry', async () => {
      const results = await collection.getByClusterId('cluster-seo-001');

      expect(results[0]).toHaveProperty('metadata');
      expect(results[0].metadata).toHaveProperty('primaryKeyword');
      expect(results[0].metadata).toHaveProperty('searchVolume');
    });

    it('should distinguish between different clusters', async () => {
      const results1 = await collection.getByClusterId('cluster-seo-001');
      const results2 = await collection.getByClusterId('cluster-seo-002');

      expect(results1.length).toBe(2);
      expect(results2.length).toBe(1);
      expect(results1[0].id).not.toBe(results2[0].id);
    });
  });

  describe('hasFreshResearch()', () => {
    it('should return true for recently created research', async () => {
      const input: KeywordResearchInput = {
        primaryKeyword: 'fresh keyword',
        searchVolume: 1000,
        keywordDifficulty: 20,
        cpc: 1.0,
        searchIntent: 'informational',
        niche: 'test',
      };

      const entry = await collection.add(input);
      const isFresh = await collection.hasFreshResearch(entry.metadata.primaryKeyword, 0.5);

      expect(isFresh).toBe(true);
    });

    it('should return false for non-existent keyword', async () => {
      const isFresh = await collection.hasFreshResearch('non-existent-keyword', 0.5);

      expect(isFresh).toBe(false);
    });

    it('should use freshnessThreshold parameter correctly', async () => {
      const input: KeywordResearchInput = {
        primaryKeyword: 'threshold test',
        searchVolume: 1000,
        keywordDifficulty: 20,
        cpc: 1.0,
        searchIntent: 'informational',
        niche: 'test',
      };

      await collection.add(input);

      // Should return true with low threshold
      const isFreshLow = await collection.hasFreshResearch('threshold test', 0.1);
      expect(isFreshLow).toBe(true);

      // Should return true with medium threshold
      const isFreshMed = await collection.hasFreshResearch('threshold test', 0.5);
      expect(isFreshMed).toBe(true);
    });
  });

  describe('delete()', () => {
    it('should delete keyword research by ID', async () => {
      const input: KeywordResearchInput = {
        primaryKeyword: 'delete test',
        searchVolume: 1000,
        keywordDifficulty: 20,
        cpc: 1.0,
        searchIntent: 'informational',
        niche: 'test',
      };

      const entry = await collection.add(input);
      const deleted = await collection.delete(entry.id);

      expect(deleted).toBe(true);

      const retrieved = await collection.getById(entry.id);
      expect(retrieved).toBeNull();
    });

    it('should return true even when deleting non-existent entry (no-op)', async () => {
      const deleted = await collection.delete('non-existent-id');

      expect(deleted).toBe(true);
    });
  });

  describe('getStaleEntries()', () => {
    it('should return empty array when no stale entries exist', async () => {
      const input: KeywordResearchInput = {
        primaryKeyword: 'fresh entry',
        searchVolume: 1000,
        keywordDifficulty: 20,
        cpc: 1.0,
        searchIntent: 'informational',
        niche: 'test',
      };

      await collection.add(input);
      const staleEntries = await collection.getStaleEntries(0.5);

      expect(Array.isArray(staleEntries)).toBe(true);
    });
  });

  describe('getCollectionName()', () => {
    it('should return the correct collection name', () => {
      const name = collection.getCollectionName();

      expect(name).toBe(SEO_COLLECTIONS.KEYWORD_RESEARCH);
    });
  });
});
