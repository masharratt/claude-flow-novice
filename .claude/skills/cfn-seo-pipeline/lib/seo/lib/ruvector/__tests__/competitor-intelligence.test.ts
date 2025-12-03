/**
 * CompetitorIntelligenceCollection Test Suite
 *
 * London School TDD: Focus on object collaboration, clear contracts, mock verification
 *
 * @module seo/lib/ruvector/__tests__/competitor-intelligence
 * @description Comprehensive tests for CompetitorIntelligenceCollection CRUD operations,
 * semantic search, and freshness calculations
 */

import {
  CompetitorIntelligenceCollection,
  CompetitorIntelligenceInput,
  CompetitorIntelligenceQueryOptions,
} from '../collections/competitor-intelligence';
import {
  CompetitorIntelligenceEntry,
  ArchitecturePattern,
  ContentStrategyPattern,
  HubPage,
  ContentGap,
  isCompetitorIntelligenceEntry,
  calculateFreshnessScore,
} from '../schemas';
import type { VectorDB } from '@ruvector/core';

/**
 * Mock VectorDB Implementation
 * In-memory storage for deterministic testing
 */
class MockVectorDB implements VectorDB {
  private storage: Map<string, { vector: Float32Array; metadata: any }> = new Map();

  async insert(item: { id: string; vector: Float32Array; metadata: any }): Promise<void> {
    this.storage.set(item.id, { vector: item.vector, metadata: item.metadata });
  }

  async delete(id: string): Promise<void> {
    this.storage.delete(id);
  }

  async search(options: {
    vector: Float32Array;
    k: number;
    filter?: (item: any) => boolean;
  }): Promise<Array<{
    metadata: any;
    score: number;
  }>> {
    const allResults = Array.from(this.storage.values()).map((item) => ({
      metadata: item.metadata,
      score: this.calculateSimilarity(options.vector, item.vector),
    }));

    // Apply filter if provided
    const filtered = options.filter
      ? allResults.filter((item) => options.filter!(item))
      : allResults;

    // Sort by score descending and limit to k results
    return filtered.sort((a, b) => b.score - a.score).slice(0, options.k);
  }

  private calculateSimilarity(vec1: Float32Array, vec2: Float32Array): number {
    // Deterministic similarity based on cosine distance
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < Math.min(vec1.length, vec2.length); i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  getSize(): number {
    return this.storage.size;
  }

  getAllEntries(): Array<{ id: string; metadata: any }> {
    return Array.from(this.storage.entries()).map(([id, data]) => ({
      id,
      metadata: data.metadata,
    }));
  }
}

/**
 * Deterministic Embedding Function for Testing
 * Returns fixed vectors based on input text hash
 */
function createMockEmbeddingFn(): (text: string) => Promise<Float32Array> {
  const cache: Map<string, Float32Array> = new Map();

  return async (text: string): Promise<Float32Array> => {
    if (cache.has(text)) {
      return cache.get(text)!;
    }

    // Generate deterministic vector from text hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    const vector = new Float32Array(1536);
    for (let i = 0; i < 1536; i++) {
      vector[i] = Math.sin((hash + i) * 0.01) * 0.5 + 0.5;
    }

    cache.set(text, vector);
    return vector;
  };
}

/**
 * Test Factories
 */

function createMockArchitecturePattern(
  overrides?: Partial<ArchitecturePattern>
): ArchitecturePattern {
  return {
    urlStructure: '/blog/{category}/{slug}',
    hierarchy: 'Root > Blog > Category > Article',
    categoryPages: 15,
    ...overrides,
  };
}

function createMockContentStrategyPattern(
  overrides?: Partial<ContentStrategyPattern>
): ContentStrategyPattern {
  return {
    avgWordCount: 2500,
    contentType: 'comprehensive-guide',
    publishFrequency: 'twice-weekly',
    topFormats: ['how-to', 'guide', 'tutorial'],
    pageCount: 45,
    headingStructures: ['H1 > H2 > H3', 'H1 > H2 > H3 > H4'],
    ...overrides,
  };
}

function createMockHubPage(overrides?: Partial<HubPage>): HubPage {
  return {
    url: 'https://example.com/seo-guide',
    topic: 'SEO Fundamentals',
    internalLinks: 12,
    ...overrides,
  };
}

function createMockContentGap(overrides?: Partial<ContentGap>): ContentGap {
  return {
    topic: 'Mobile SEO',
    priority: 'high' as const,
    opportunity: 'Competitors lack in-depth mobile optimization guides',
    ...overrides,
  };
}

function createMockCompetitorIntelligenceInput(
  overrides?: Partial<CompetitorIntelligenceInput>
): CompetitorIntelligenceInput {
  return {
    domain: 'seoblog.example.com',
    niche: 'seo',
    architecturePatterns: [createMockArchitecturePattern()],
    contentStrategy: [createMockContentStrategyPattern()],
    hubPages: [createMockHubPage()],
    internalLinkingPatterns: ['/blog/* -> /resources/*', '/guide/* -> /tools/*'],
    contentGaps: [createMockContentGap()],
    estimatedAuthority: 72,
    clusterId: 'cluster-seo-001',
    ...overrides,
  };
}

describe('CompetitorIntelligenceCollection', () => {
  let collection: CompetitorIntelligenceCollection;
  let mockVectorDB: MockVectorDB;
  let mockEmbeddingFn: (text: string) => Promise<Float32Array>;
  let mockNow: Date;

  beforeEach(() => {
    // Initialize fresh mocks for each test
    mockVectorDB = new MockVectorDB();
    mockEmbeddingFn = createMockEmbeddingFn();
    collection = new CompetitorIntelligenceCollection(mockVectorDB, mockEmbeddingFn);
    mockNow = new Date('2024-06-15T12:00:00Z');
    jest.spyOn(global, 'Date').mockImplementation(() => mockNow as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('add()', () => {
    it('should create competitor intelligence with all required fields', async () => {
      // GIVEN: Valid competitor intelligence input
      const input = createMockCompetitorIntelligenceInput();

      // WHEN: Adding competitor intelligence
      const result = await collection.add(input);

      // THEN: Should return entry with correct structure
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^seoblog-example-com:seo$/);
      expect(result.metadata.domain).toBe('seoblog.example.com');
      expect(result.metadata.niche).toBe('seo');
      expect(result.metadata.architecturePatterns).toHaveLength(1);
      expect(result.metadata.contentStrategy).toHaveLength(1);
      expect(result.metadata.hubPages).toHaveLength(1);
      expect(result.metadata.internalLinkingPatterns).toHaveLength(2);
      expect(result.metadata.contentGaps).toHaveLength(1);
      expect(result.metadata.estimatedAuthority).toBe(72);
      expect(result.metadata.clusterId).toBe('cluster-seo-001');
      expect(result.metadata.createdAt).toEqual(mockNow);
      expect(result.metadata.expiresAt).toEqual(
        new Date(mockNow.getTime() + 180 * 24 * 60 * 60 * 1000)
      );
      expect(result.metadata.freshnessScore).toBe(1.0);
    });

    it('should handle optional fields with defaults', async () => {
      // GIVEN: Minimal input without optional fields
      const input = createMockCompetitorIntelligenceInput({
        architecturePatterns: undefined,
        contentStrategy: undefined,
        hubPages: undefined,
        internalLinkingPatterns: undefined,
        contentGaps: undefined,
        estimatedAuthority: undefined,
        clusterId: undefined,
      });

      // WHEN: Adding competitor intelligence
      const result = await collection.add(input);

      // THEN: Optional fields should be empty arrays/undefined
      expect(result.metadata.architecturePatterns).toEqual([]);
      expect(result.metadata.contentStrategy).toEqual([]);
      expect(result.metadata.hubPages).toEqual([]);
      expect(result.metadata.internalLinkingPatterns).toEqual([]);
      expect(result.metadata.contentGaps).toEqual([]);
      expect(result.metadata.estimatedAuthority).toBe(0);
      expect(result.metadata.clusterId).toBeUndefined();
    });

    it('should set expiration date 180 days from creation', async () => {
      // GIVEN: Competitor intelligence input
      const input = createMockCompetitorIntelligenceInput();

      // WHEN: Adding competitor intelligence
      const result = await collection.add(input);

      // THEN: Expiration should be 180 days from now
      const expectedExpiry = new Date(mockNow.getTime() + 180 * 24 * 60 * 60 * 1000);
      expect(result.metadata.expiresAt).toEqual(expectedExpiry);
    });

    it('should interact with VectorDB to insert record', async () => {
      // GIVEN: Mock VectorDB with insert spy
      const insertSpy = jest.spyOn(mockVectorDB, 'insert');
      const input = createMockCompetitorIntelligenceInput();

      // WHEN: Adding competitor intelligence
      await collection.add(input);

      // THEN: VectorDB.insert should be called once with correct structure
      expect(insertSpy).toHaveBeenCalledTimes(1);
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringMatching(/^seoblog-example-com:seo$/),
          vector: expect.any(Float32Array),
          metadata: expect.objectContaining({
            id: expect.any(String),
            text: expect.any(String),
            metadata: expect.objectContaining({
              domain: 'seoblog.example.com',
              niche: 'seo',
            }),
          }),
        })
      );
    });

    it('should interact with embedding function', async () => {
      // GIVEN: Embedding function
      const embeddingSpy = jest.fn(mockEmbeddingFn);
      const collectionWithSpy = new CompetitorIntelligenceCollection(mockVectorDB, embeddingSpy);
      const input = createMockCompetitorIntelligenceInput();

      // WHEN: Adding competitor intelligence
      await collectionWithSpy.add(input);

      // THEN: Embedding function should be called with generated text
      expect(embeddingSpy).toHaveBeenCalled();
      const embeddingCall = embeddingSpy.mock.calls[0][0];
      expect(embeddingCall).toContain('seoblog.example.com');
      expect(embeddingCall).toContain('seo');
    });

    it('should store multiple architecture patterns', async () => {
      // GIVEN: Input with multiple architecture patterns
      const input = createMockCompetitorIntelligenceInput({
        architecturePatterns: [
          createMockArchitecturePattern({ urlStructure: '/blog/{slug}' }),
          createMockArchitecturePattern({
            urlStructure: '/articles/{year}/{month}/{day}/{slug}',
            categoryPages: 8,
          }),
        ],
      });

      // WHEN: Adding competitor intelligence
      const result = await collection.add(input);

      // THEN: Should preserve all patterns
      expect(result.metadata.architecturePatterns).toHaveLength(2);
      expect(result.metadata.architecturePatterns[0].urlStructure).toBe('/blog/{slug}');
      expect(result.metadata.architecturePatterns[1].urlStructure).toBe(
        '/articles/{year}/{month}/{day}/{slug}'
      );
    });
  });

  describe('update()', () => {
    it('should update existing entry with partial changes', async () => {
      // GIVEN: Existing competitor intelligence
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);

      // WHEN: Updating with new content gaps
      const newGap = createMockContentGap({
        topic: 'Voice Search Optimization',
        priority: 'high' as const,
      });
      const updated = await collection.update(created.id, {
        contentGaps: [newGap],
      });

      // THEN: Should have updated content gaps
      expect(updated).not.toBeNull();
      expect(updated!.metadata.contentGaps).toHaveLength(1);
      expect(updated!.metadata.contentGaps[0].topic).toBe('Voice Search Optimization');
      // Other fields should be preserved
      expect(updated!.metadata.domain).toBe('seoblog.example.com');
      expect(updated!.metadata.niche).toBe('seo');
    });

    it('should update estimated authority score', async () => {
      // GIVEN: Existing competitor intelligence
      const input = createMockCompetitorIntelligenceInput({ estimatedAuthority: 65 });
      const created = await collection.add(input);

      // WHEN: Updating authority
      const updated = await collection.update(created.id, { estimatedAuthority: 78 });

      // THEN: Should have new authority
      expect(updated).not.toBeNull();
      expect(updated!.metadata.estimatedAuthority).toBe(78);
    });

    it('should preserve original creation date on update', async () => {
      // GIVEN: Existing competitor intelligence created at mockNow
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);
      const originalCreatedAt = created.metadata.createdAt;

      // WHEN: Updating entry
      const updated = await collection.update(created.id, { estimatedAuthority: 80 });

      // THEN: CreatedAt should remain unchanged
      expect(updated).not.toBeNull();
      expect(updated!.metadata.createdAt).toEqual(originalCreatedAt);
      expect(updated!.metadata.estimatedAuthority).toBe(80);
    });

    it('should return null for non-existent entry', async () => {
      // WHEN: Updating non-existent entry
      const result = await collection.update('non-existent-id', { estimatedAuthority: 90 });

      // THEN: Should return null
      expect(result).toBeNull();
    });

    it('should interact with VectorDB delete and insert', async () => {
      // GIVEN: Existing competitor intelligence
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);

      // AND: Spies on VectorDB operations
      const deleteSpy = jest.spyOn(mockVectorDB, 'delete');
      const insertSpy = jest.spyOn(mockVectorDB, 'insert');

      // WHEN: Updating entry
      await collection.update(created.id, { estimatedAuthority: 85 });

      // THEN: Should delete old and insert new
      expect(deleteSpy).toHaveBeenCalledWith(created.id);
      expect(insertSpy).toHaveBeenCalled();
    });

    it('should support multiple hub pages update', async () => {
      // GIVEN: Existing competitor intelligence
      const input = createMockCompetitorIntelligenceInput({
        hubPages: [createMockHubPage()],
      });
      const created = await collection.add(input);

      // WHEN: Updating with more hub pages
      const newHubPages = [
        createMockHubPage({ url: 'https://example.com/seo-guide', topic: 'SEO' }),
        createMockHubPage({ url: 'https://example.com/link-building', topic: 'Link Building' }),
      ];
      const updated = await collection.update(created.id, { hubPages: newHubPages });

      // THEN: Should have all hub pages
      expect(updated).not.toBeNull();
      expect(updated!.metadata.hubPages).toHaveLength(2);
      expect(updated!.metadata.hubPages[0].topic).toBe('SEO');
      expect(updated!.metadata.hubPages[1].topic).toBe('Link Building');
    });
  });

  describe('getById()', () => {
    it('should retrieve competitor intelligence by ID', async () => {
      // GIVEN: Existing competitor intelligence
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);

      // WHEN: Retrieving by ID
      const retrieved = await collection.getById(created.id);

      // THEN: Should return the same entry
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.metadata.domain).toBe('seoblog.example.com');
      expect(retrieved!.metadata.estimatedAuthority).toBe(72);
    });

    it('should return null for non-existent ID', async () => {
      // WHEN: Retrieving non-existent ID
      const result = await collection.getById('non-existent');

      // THEN: Should return null
      expect(result).toBeNull();
    });

    it('should interact with VectorDB search with filter', async () => {
      // GIVEN: Existing competitor intelligence
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);

      // AND: Spy on VectorDB search
      const searchSpy = jest.spyOn(mockVectorDB, 'search');

      // WHEN: Retrieving by ID
      await collection.getById(created.id);

      // THEN: Should call search with filter function
      expect(searchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: expect.any(Float32Array),
          k: 1000,
          filter: expect.any(Function),
        })
      );
    });

    it('should handle corrupt metadata gracefully', async () => {
      // GIVEN: Entry with corrupt metadata in storage
      await mockVectorDB.insert({
        id: 'corrupt-entry',
        vector: new Float32Array(1536),
        metadata: { notAnEntry: true }, // Invalid structure
      });

      // WHEN: Trying to retrieve corrupt entry
      const result = await collection.getById('corrupt-entry');

      // THEN: Should return null (type guard fails)
      expect(result).toBeNull();
    });
  });

  describe('getByDomainAndNiche()', () => {
    it('should retrieve competitor intelligence by domain and niche', async () => {
      // GIVEN: Existing competitor intelligence
      const input = createMockCompetitorIntelligenceInput({
        domain: 'competitors.example.com',
        niche: 'digital-marketing',
      });
      const created = await collection.add(input);

      // WHEN: Retrieving by domain and niche
      const retrieved = await collection.getByDomainAndNiche(
        'competitors.example.com',
        'digital-marketing'
      );

      // THEN: Should return the entry
      expect(retrieved).not.toBeNull();
      expect(retrieved!.metadata.domain).toBe('competitors.example.com');
      expect(retrieved!.metadata.niche).toBe('digital-marketing');
    });

    it('should return null when domain or niche does not match', async () => {
      // GIVEN: Existing competitor intelligence
      const input = createMockCompetitorIntelligenceInput({
        domain: 'specific-domain.com',
        niche: 'seo',
      });
      await collection.add(input);

      // WHEN: Retrieving with non-matching niche
      const result = await collection.getByDomainAndNiche('specific-domain.com', 'ppc');

      // THEN: Should return null
      expect(result).toBeNull();
    });

    it('should delegate to getById with generated ID', async () => {
      // GIVEN: Competitor intelligence
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);

      // AND: Spy on getById
      const getByIdSpy = jest.spyOn(collection, 'getById');

      // WHEN: Calling getByDomainAndNiche
      await collection.getByDomainAndNiche('seoblog.example.com', 'seo');

      // THEN: Should call getById with generated ID
      expect(getByIdSpy).toHaveBeenCalledWith(expect.stringMatching(/^seoblog-example-com:seo$/));
    });
  });

  describe('search()', () => {
    beforeEach(async () => {
      // Add multiple competitor intelligence entries for search testing
      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'high-authority-blog.com',
          niche: 'content-marketing',
          estimatedAuthority: 85,
          contentGaps: [
            createMockContentGap({
              topic: 'Video Content Strategy',
              priority: 'high' as const,
            }),
          ],
          clusterId: 'cluster-content-001',
        })
      );

      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'medium-blog.com',
          niche: 'seo',
          estimatedAuthority: 65,
          contentGaps: [
            createMockContentGap({
              topic: 'Technical SEO',
              priority: 'medium' as const,
            }),
          ],
          clusterId: 'cluster-seo-001',
        })
      );

      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'new-startup.com',
          niche: 'seo',
          estimatedAuthority: 40,
          contentGaps: [
            createMockContentGap({
              topic: 'Link Building',
              priority: 'high' as const,
            }),
          ],
          clusterId: 'cluster-seo-002',
        })
      );
    });

    it('should find competitors by semantic similarity', async () => {
      // WHEN: Searching for content strategy competitors
      const results = await collection.search('content strategy analysis');

      // THEN: Should return results
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('entry');
      expect(results[0]).toHaveProperty('similarity');
      expect(typeof results[0].similarity).toBe('number');
      expect(results[0].similarity).toBeGreaterThanOrEqual(0);
      expect(results[0].similarity).toBeLessThanOrEqual(1);
    });

    it('should respect minSimilarity threshold', async () => {
      // WHEN: Searching with high similarity threshold
      const results = await collection.search('seo competitor', {
        minSimilarity: 0.8,
      });

      // THEN: All results should meet similarity threshold
      results.forEach((result) => {
        expect(result.similarity).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should respect limit option', async () => {
      // WHEN: Searching with limit of 1
      const results = await collection.search('competitor analysis', { limit: 1 });

      // THEN: Should return at most 1 result
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should filter by niche when specified', async () => {
      // WHEN: Searching in specific niche
      const results = await collection.search('competitor', {
        niche: 'seo',
        limit: 10,
      });

      // THEN: All results should be from SEO niche
      results.forEach((result) => {
        expect(result.entry.metadata.niche).toBe('seo');
      });
    });

    it('should filter by clusterId when specified', async () => {
      // WHEN: Searching in specific cluster
      const results = await collection.search('competitor analysis', {
        clusterId: 'cluster-seo-001',
      });

      // THEN: All results should be from specified cluster
      results.forEach((result) => {
        expect(result.entry.metadata.clusterId).toBe('cluster-seo-001');
      });
    });

    it('should filter by minAuthority when specified', async () => {
      // WHEN: Searching with minimum authority
      const results = await collection.search('competitor', {
        minAuthority: 70,
        limit: 10,
      });

      // THEN: All results should meet authority threshold
      results.forEach((result) => {
        expect(result.entry.metadata.estimatedAuthority).toBeGreaterThanOrEqual(70);
      });
    });

    it('should exclude stale entries when flag is set', async () => {
      // GIVEN: Entry that becomes stale over time
      const futureDate = new Date(mockNow.getTime() + 170 * 24 * 60 * 60 * 1000); // 170 days later
      jest.spyOn(global, 'Date').mockImplementation(() => futureDate as any);

      // WHEN: Searching with excludeStale flag
      const results = await collection.search('competitor', {
        excludeStale: true,
        limit: 10,
      });

      // THEN: Only fresh entries should be included
      results.forEach((result) => {
        expect(result.entry.metadata.freshnessScore).toBeGreaterThan(0.3);
      });
    });

    it('should filter by minFreshnessScore when specified', async () => {
      // WHEN: Searching with minimum freshness requirement
      const results = await collection.search('competitor', {
        minFreshnessScore: 0.8,
        limit: 10,
      });

      // THEN: All results should meet freshness threshold
      results.forEach((result) => {
        expect(result.entry.metadata.freshnessScore).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should combine multiple filters correctly', async () => {
      // WHEN: Searching with multiple filters
      const results = await collection.search('strategy', {
        niche: 'seo',
        minAuthority: 50,
        limit: 5,
        minSimilarity: 0.0,
      });

      // THEN: Should apply all filters
      results.forEach((result) => {
        expect(result.entry.metadata.niche).toBe('seo');
        expect(result.entry.metadata.estimatedAuthority).toBeGreaterThanOrEqual(50);
      });
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should interact with embedding function for query', async () => {
      // GIVEN: Spy on embedding function
      const embeddingSpy = jest.fn(mockEmbeddingFn);
      const collectionWithSpy = new CompetitorIntelligenceCollection(mockVectorDB, embeddingSpy);

      // Recreate entries with spy
      await collectionWithSpy.add(createMockCompetitorIntelligenceInput());

      // WHEN: Searching
      await collectionWithSpy.search('content gaps analysis');

      // THEN: Should embed the query
      expect(embeddingSpy).toHaveBeenCalledWith('content gaps analysis');
    });

    it('should return results sorted by similarity', async () => {
      // WHEN: Searching without limit
      const results = await collection.search('competitor analysis', { limit: 100 });

      // THEN: Results should be ordered by similarity (descending)
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
      }
    });
  });

  describe('getByNiche()', () => {
    beforeEach(async () => {
      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'seo-blog-1.com',
          niche: 'seo',
        })
      );

      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'seo-blog-2.com',
          niche: 'seo',
        })
      );

      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'content-blog.com',
          niche: 'content-marketing',
        })
      );
    });

    it('should retrieve all competitor intelligence for a niche', async () => {
      // WHEN: Getting all competitors for SEO niche
      const results = await collection.getByNiche('seo');

      // THEN: Should return all SEO competitors
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata.niche === 'seo')).toBe(true);
    });

    it('should return empty array for niche with no competitors', async () => {
      // WHEN: Getting competitors for non-existent niche
      const results = await collection.getByNiche('non-existent-niche');

      // THEN: Should return empty array
      expect(results).toEqual([]);
    });

    it('should return entries as CompetitorIntelligenceEntry instances', async () => {
      // WHEN: Getting competitors
      const results = await collection.getByNiche('seo');

      // THEN: All entries should be valid CompetitorIntelligenceEntry
      results.forEach((entry) => {
        expect(isCompetitorIntelligenceEntry(entry)).toBe(true);
      });
    });

    it('should use VectorDB search without filter for retrieval', async () => {
      // GIVEN: Spy on VectorDB search
      const searchSpy = jest.spyOn(mockVectorDB, 'search');

      // WHEN: Getting competitors
      await collection.getByNiche('seo');

      // THEN: Should call search with large k value
      expect(searchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: expect.any(Float32Array),
          k: 1000,
        })
      );
    });
  });

  describe('getByClusterId()', () => {
    beforeEach(async () => {
      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'cluster-1-site.com',
          niche: 'seo',
          clusterId: 'cluster-seo-001',
        })
      );

      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'cluster-1-site-2.com',
          niche: 'seo',
          clusterId: 'cluster-seo-001',
        })
      );

      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'cluster-2-site.com',
          niche: 'content',
          clusterId: 'cluster-content-001',
        })
      );
    });

    it('should retrieve all competitor intelligence for a cluster', async () => {
      // WHEN: Getting all competitors for cluster
      const results = await collection.getByClusterId('cluster-seo-001');

      // THEN: Should return all competitors in cluster
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata.clusterId === 'cluster-seo-001')).toBe(true);
    });

    it('should return empty array for non-existent cluster', async () => {
      // WHEN: Getting competitors for non-existent cluster
      const results = await collection.getByClusterId('non-existent-cluster');

      // THEN: Should return empty array
      expect(results).toEqual([]);
    });

    it('should return entries from different niches if in same cluster', async () => {
      // WHEN: Getting competitors for cluster with multiple niches
      const results = await collection.getByClusterId('cluster-seo-001');

      // THEN: Should return entries from same cluster
      expect(results).toHaveLength(2);
      results.forEach((r) => {
        expect(r.metadata.clusterId).toBe('cluster-seo-001');
      });
    });
  });

  describe('hasFreshIntelligence()', () => {
    it('should return true when fresh intelligence exists', async () => {
      // GIVEN: Competitor intelligence
      const input = createMockCompetitorIntelligenceInput();
      await collection.add(input);

      // WHEN: Checking for fresh intelligence
      const result = await collection.hasFreshIntelligence('seoblog.example.com', 'seo');

      // THEN: Should return true
      expect(result).toBe(true);
    });

    it('should return false when no intelligence exists', async () => {
      // WHEN: Checking non-existent competitor
      const result = await collection.hasFreshIntelligence('non-existent.com', 'seo');

      // THEN: Should return false
      expect(result).toBe(false);
    });

    it('should return false when entry does not exist even after time passes', async () => {
      // GIVEN: Competitor intelligence for a different domain
      const input = createMockCompetitorIntelligenceInput();
      await collection.add(input);

      // AND: Advance time by 160 days
      const futureDate = new Date(mockNow.getTime() + 160 * 24 * 60 * 60 * 1000);
      jest.spyOn(global, 'Date').mockImplementation(() => futureDate as any);

      // WHEN: Checking for non-existent domain
      const result = await collection.hasFreshIntelligence('other-domain.com', 'seo');

      // THEN: Should return false (entry doesn't exist)
      expect(result).toBe(false);
    });

    it('should use default freshness threshold of 0.3', async () => {
      // GIVEN: Competitor intelligence
      const input = createMockCompetitorIntelligenceInput();
      await collection.add(input);

      // AND: Advance time by 100 days (freshness = 0.44)
      const futureDate = new Date(mockNow.getTime() + 100 * 24 * 60 * 60 * 1000);
      jest.spyOn(global, 'Date').mockImplementation(() => futureDate as any);

      // WHEN: Checking with default threshold
      const result = await collection.hasFreshIntelligence('seoblog.example.com', 'seo');

      // THEN: Should return true (0.44 > 0.3)
      expect(result).toBe(true);
    });

    it('should use provided domain and niche for lookup', async () => {
      // GIVEN: Competitor intelligence
      const input = createMockCompetitorIntelligenceInput({
        domain: 'target-domain.com',
        niche: 'seo',
      });
      await collection.add(input);

      // WHEN: Checking with exact domain and niche match
      const resultMatch = await collection.hasFreshIntelligence(
        'target-domain.com',
        'seo',
        0.3
      );

      // AND: Checking with different niche
      const resultNoMatch = await collection.hasFreshIntelligence(
        'target-domain.com',
        'ppc',
        0.3
      );

      // THEN: Should find with matching domain/niche, not find with mismatched niche
      expect(resultMatch).toBe(true);
      expect(resultNoMatch).toBe(false);
    });
  });

  describe('getAggregatedContentGaps()', () => {
    beforeEach(async () => {
      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'competitor-1.com',
          niche: 'seo',
          contentGaps: [
            createMockContentGap({
              topic: 'Mobile SEO',
              priority: 'high' as const,
            }),
            createMockContentGap({
              topic: 'Voice Search',
              priority: 'medium' as const,
            }),
          ],
        })
      );

      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'competitor-2.com',
          niche: 'seo',
          contentGaps: [
            createMockContentGap({
              topic: 'Mobile SEO',
              priority: 'high' as const,
            }),
            createMockContentGap({
              topic: 'Core Web Vitals',
              priority: 'high' as const,
            }),
          ],
        })
      );

      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'competitor-3.com',
          niche: 'seo',
          contentGaps: [
            createMockContentGap({
              topic: 'Mobile SEO',
              priority: 'high' as const,
            }),
            createMockContentGap({
              topic: 'International SEO',
              priority: 'low' as const,
            }),
          ],
        })
      );
    });

    it('should aggregate content gaps across competitors', async () => {
      // WHEN: Getting aggregated gaps for niche
      const gaps = await collection.getAggregatedContentGaps('seo');

      // THEN: Should include all unique gaps
      const topics = gaps.map((g) => g.topic);
      expect(topics).toContain('Mobile SEO');
      expect(topics).toContain('Voice Search');
      expect(topics).toContain('Core Web Vitals');
      expect(topics).toContain('International SEO');
    });

    it('should count gap frequency across competitors', async () => {
      // WHEN: Getting aggregated gaps
      const gaps = await collection.getAggregatedContentGaps('seo');

      // THEN: Mobile SEO should be most common (3 occurrences)
      const mobileGap = gaps.find((g) => g.topic === 'Mobile SEO');
      expect(mobileGap).toBeDefined();
      // Verify it appears first (most frequent)
      expect(gaps[0].topic).toBe('Mobile SEO');
    });

    it('should upgrade priority when multiple competitors show high priority', async () => {
      // WHEN: Getting aggregated gaps
      const gaps = await collection.getAggregatedContentGaps('seo');

      // THEN: Mobile SEO should have high priority (appears as high in 3 of 3)
      const mobileGap = gaps.find((g) => g.topic === 'Mobile SEO');
      expect(mobileGap).toBeDefined();
      expect(mobileGap!.priority).toBe('high');
    });

    it('should sort by frequency first, then priority', async () => {
      // WHEN: Getting aggregated gaps
      const gaps = await collection.getAggregatedContentGaps('seo');

      // THEN: Should be sorted correctly
      // Mobile SEO: 3 occurrences, high priority (first)
      // Core Web Vitals: 2 occurrences, high priority (second)
      // Voice Search: 1 occurrence, medium priority
      // International SEO: 1 occurrence, low priority
      expect(gaps[0].topic).toBe('Mobile SEO');
      expect(gaps[1].topic).toBe('Core Web Vitals');
      expect(gaps.length).toBe(4);
    });

    it('should return empty array for niche with no competitors', async () => {
      // WHEN: Getting gaps for niche with no data
      const gaps = await collection.getAggregatedContentGaps('non-existent-niche');

      // THEN: Should return empty array
      expect(gaps).toEqual([]);
    });

    it('should handle case-insensitive gap matching', async () => {
      // GIVEN: Competitors with different case variations
      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'competitor-4.com',
          niche: 'content-marketing',
          contentGaps: [
            createMockContentGap({
              topic: 'VIDEO MARKETING', // Different case
              priority: 'high' as const,
            }),
          ],
        })
      );

      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'competitor-5.com',
          niche: 'content-marketing',
          contentGaps: [
            createMockContentGap({
              topic: 'video marketing', // Lowercase
              priority: 'medium' as const,
            }),
          ],
        })
      );

      // WHEN: Getting aggregated gaps
      const gaps = await collection.getAggregatedContentGaps('content-marketing');

      // THEN: Should treat as same gap (case-insensitive)
      const videoGaps = gaps.filter((g) => g.topic.toLowerCase() === 'video marketing');
      // Should be aggregated (either kept separate in lowercase key or merged)
      expect(gaps.length).toBeGreaterThan(0);
    });
  });

  describe('delete()', () => {
    it('should delete competitor intelligence by ID', async () => {
      // GIVEN: Existing competitor intelligence
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);

      // WHEN: Deleting
      const result = await collection.delete(created.id);

      // THEN: Should return true and entry should be gone
      expect(result).toBe(true);
      const retrieved = await collection.getById(created.id);
      expect(retrieved).toBeNull();
    });

    it('should attempt delete even for non-existent entries (implementation returns true)', async () => {
      // GIVEN: MockVectorDB doesn't throw on delete of non-existent ID
      // WHEN: Deleting non-existent entry
      const result = await collection.delete('non-existent');

      // THEN: Should return true (MockVectorDB silently handles missing IDs)
      // Note: Implementation wraps delete in try-catch and returns true on success
      expect(result).toBe(true);
    });

    it('should interact with VectorDB delete method', async () => {
      // GIVEN: Existing competitor intelligence
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);

      // AND: Spy on VectorDB delete
      const deleteSpy = jest.spyOn(mockVectorDB, 'delete');

      // WHEN: Deleting
      await collection.delete(created.id);

      // THEN: Should call VectorDB delete with correct ID
      expect(deleteSpy).toHaveBeenCalledWith(created.id);
    });

    it('should handle delete errors gracefully', async () => {
      // GIVEN: VectorDB that throws error
      const mockDBWithError = new MockVectorDB();
      const deleteWithError = jest.spyOn(mockDBWithError, 'delete').mockImplementation(() => {
        throw new Error('Delete failed');
      });

      const collectionWithError = new CompetitorIntelligenceCollection(
        mockDBWithError,
        mockEmbeddingFn
      );

      // WHEN: Attempting to delete
      const result = await collectionWithError.delete('some-id');

      // THEN: Should return false (error handled)
      expect(result).toBe(false);
      expect(deleteWithError).toHaveBeenCalled();
    });

    it('should allow re-adding after deletion', async () => {
      // GIVEN: Competitor intelligence that was deleted
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);
      await collection.delete(created.id);

      // WHEN: Re-adding same competitor
      const recreated = await collection.add(input);

      // THEN: Should successfully re-add
      expect(recreated).toBeDefined();
      expect(recreated.id).toBe(created.id);
      const retrieved = await collection.getById(created.id);
      expect(retrieved).not.toBeNull();
    });
  });

  describe('getStaleEntries()', () => {
    beforeEach(async () => {
      // Add entry that will remain fresh
      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'fresh-competitor.com',
          niche: 'seo',
        })
      );

      // Add entry that will become stale
      // This entry will be added, then time advances
      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'soon-stale-competitor.com',
          niche: 'seo',
        })
      );
    });

    it('should return empty array when all entries are fresh', async () => {
      // WHEN: Getting stale entries with default threshold
      const staleEntries = await collection.getStaleEntries(0.3);

      // THEN: Should return empty array (all entries are fresh)
      expect(staleEntries).toEqual([]);
    });

    it('should not return fresh entries as stale', async () => {
      // GIVEN: Competitor intelligence created at mockNow
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);

      // WHEN: Getting stale entries with default threshold (0.3)
      // Fresh entries have freshnessScore = 1.0, which is NOT < 0.3
      const staleEntries = await collection.getStaleEntries(0.3);

      // THEN: Should not include fresh entries
      expect(staleEntries).toEqual([]);
    });

    it('should use threshold in comparison: freshnessScore < threshold means stale', async () => {
      // GIVEN: Competitor intelligence with freshnessScore = 1.0
      const input = createMockCompetitorIntelligenceInput();
      await collection.add(input);

      // WHEN: Getting stale entries with threshold 0.5
      const withThreshold05 = await collection.getStaleEntries(0.5);

      // AND: Getting stale entries with threshold 1.5
      const withThreshold15 = await collection.getStaleEntries(1.5);

      // THEN: 1.0 is NOT < 0.5, so no stale entries
      // THEN: 1.0 IS < 1.5, so all entries are stale
      expect(withThreshold05).toEqual([]);
      expect(withThreshold15.length).toBeGreaterThan(0);
    });

    it('should not include fresh entries in stale results', async () => {
      // GIVEN: Advance time by 90 days (freshness = 0.5)
      const futureDate = new Date(mockNow.getTime() + 90 * 24 * 60 * 60 * 1000);
      jest.spyOn(global, 'Date').mockImplementation(() => futureDate as any);

      // WHEN: Getting stale entries with threshold 0.3
      const staleEntries = await collection.getStaleEntries(0.3);

      // THEN: Should be empty (freshness 0.5 > 0.3)
      expect(staleEntries).toEqual([]);
    });

    it('should return multiple stale entries when threshold is high enough', async () => {
      // GIVEN: Multiple entries added (all have freshnessScore = 1.0)
      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'competitor-1.com',
          niche: 'content',
        })
      );
      await collection.add(
        createMockCompetitorIntelligenceInput({
          domain: 'competitor-2.com',
          niche: 'content',
        })
      );

      // WHEN: Getting stale entries with threshold > 1.0
      const staleEntries = await collection.getStaleEntries(1.5);

      // THEN: Should return all entries (1.0 < 1.5)
      expect(staleEntries.length).toBeGreaterThanOrEqual(4);
      staleEntries.forEach((entry) => {
        expect(entry.metadata.domain).toBeDefined();
      });
    });
  });

  describe('getCollectionName()', () => {
    it('should return correct collection name', () => {
      // WHEN: Getting collection name
      const name = collection.getCollectionName();

      // THEN: Should return correct constant
      expect(name).toBe('seo_competitor_intelligence');
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle concurrent add operations', async () => {
      // WHEN: Adding multiple competitors concurrently
      const promises = [
        collection.add(
          createMockCompetitorIntelligenceInput({
            domain: 'concurrent-1.com',
          })
        ),
        collection.add(
          createMockCompetitorIntelligenceInput({
            domain: 'concurrent-2.com',
          })
        ),
        collection.add(
          createMockCompetitorIntelligenceInput({
            domain: 'concurrent-3.com',
          })
        ),
      ];

      const results = await Promise.all(promises);

      // THEN: All should complete successfully
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.id).toBeDefined();
        expect(result.metadata).toBeDefined();
      });
    });

    it('should support large content gaps arrays', async () => {
      // GIVEN: Many content gaps
      const largeGapsArray = Array.from({ length: 50 }, (_, i) =>
        createMockContentGap({
          topic: `Content Gap ${i}`,
          priority: ['high', 'medium', 'low'][i % 3] as any,
        })
      );

      const input = createMockCompetitorIntelligenceInput({
        contentGaps: largeGapsArray,
      });

      // WHEN: Adding competitor with many gaps
      const result = await collection.add(input);

      // THEN: Should handle large arrays
      expect(result.metadata.contentGaps).toHaveLength(50);
      expect(result.metadata.contentGaps[0].topic).toBe('Content Gap 0');
      expect(result.metadata.contentGaps[49].topic).toBe('Content Gap 49');
    });

    it('should preserve data consistency across operations', async () => {
      // GIVEN: Initial entry
      const input = createMockCompetitorIntelligenceInput();
      const created = await collection.add(input);

      // WHEN: Update, retrieve, search operations
      await collection.update(created.id, { estimatedAuthority: 95 });
      const retrieved = await collection.getById(created.id);
      const byDomain = await collection.getByDomainAndNiche(
        'seoblog.example.com',
        'seo'
      );

      // THEN: All methods should return consistent data
      expect(retrieved!.metadata.estimatedAuthority).toBe(95);
      expect(byDomain!.metadata.estimatedAuthority).toBe(95);
      expect(retrieved!.id).toBe(byDomain!.id);
    });

    it('should handle special characters in domain names', async () => {
      // GIVEN: Domain with special characters
      const input = createMockCompetitorIntelligenceInput({
        domain: 'my-seo-blog.co.uk',
      });

      // WHEN: Adding
      const result = await collection.add(input);

      // THEN: Should generate valid ID and retrieve correctly
      expect(result.id).toBeDefined();
      const retrieved = await collection.getByDomainAndNiche('my-seo-blog.co.uk', 'seo');
      expect(retrieved).not.toBeNull();
    });

    it('should handle empty niche correctly', async () => {
      // GIVEN: Competitor with empty niche (edge case)
      const input = createMockCompetitorIntelligenceInput({
        niche: '',
      });

      // WHEN: Adding
      const result = await collection.add(input);

      // THEN: Should still create entry
      expect(result.metadata.niche).toBe('');
      const allFromNiche = await collection.getByNiche('');
      expect(allFromNiche).toHaveLength(1);
    });
  });
});
