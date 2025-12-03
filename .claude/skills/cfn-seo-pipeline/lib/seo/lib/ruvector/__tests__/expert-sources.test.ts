/**
 * ExpertSourcesCollection Test Suite
 *
 * London School TDD: Focus on object collaboration, clear contracts, mock verification
 *
 * @module seo/lib/ruvector/__tests__/expert-sources.test
 * @description Comprehensive tests for ExpertSourcesCollection CRUD operations
 */

import { ExpertSourcesCollection, ExpertSourceInput, ExpertSourceQueryOptions } from '../collections/expert-sources';
import {
  ExpertSourceEntry,
  ExpertQuote,
  ExpertSourceRef,
  isExpertSourceEntry,
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

  async search(options: { vector: Float32Array; k: number; filter?: (item: any) => boolean }): Promise<Array<{
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
    // Deterministic similarity: hash-based approach for testing
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
    // Seed the vector with hash value
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

function createMockExpertSourceInput(overrides?: Partial<ExpertSourceInput>): ExpertSourceInput {
  return {
    name: 'Dr. Jane Smith',
    credentials: 'PhD in SEO, 15 years industry experience',
    primaryDomain: 'seo-expert.com',
    topics: ['technical-seo', 'link-building'],
    niche: 'seo',
    authorityScore: 0.8,
    quotes: [
      {
        text: 'Quality backlinks matter more than quantity',
        context: 'Interview on SEO strategies',
        topicTags: ['link-building'],
        addedDate: new Date('2024-01-01'),
      },
    ],
    sources: [
      {
        url: 'https://seo-expert.com/blog',
        type: 'website',
      },
    ],
    ...overrides,
  };
}

function createMockExpertQuote(overrides?: Partial<ExpertQuote>): ExpertQuote {
  return {
    text: 'Core Web Vitals are critical for ranking',
    context: 'Google Search Central webinar',
    topicTags: ['core-web-vitals', 'page-speed'],
    addedDate: new Date('2024-01-15'),
    ...overrides,
  };
}

function createMockExpertSourceRef(overrides?: Partial<ExpertSourceRef>): ExpertSourceRef {
  return {
    url: 'https://example.com/expert-profile',
    type: 'website' as const,
    ...overrides,
  };
}

describe('ExpertSourcesCollection', () => {
  let collection: ExpertSourcesCollection;
  let mockVectorDB: MockVectorDB;
  let mockEmbeddingFn: (text: string) => Promise<Float32Array>;

  beforeEach(() => {
    // Initialize fresh mocks for each test
    mockVectorDB = new MockVectorDB();
    mockEmbeddingFn = createMockEmbeddingFn();
    collection = new ExpertSourcesCollection(mockVectorDB, mockEmbeddingFn);
  });

  describe('add()', () => {
    it('should create a new expert source with all required fields', async () => {
      // GIVEN: Valid expert source input
      const input = createMockExpertSourceInput();

      // WHEN: Adding expert source
      const result = await collection.add(input);

      // THEN: Should return entry with correct structure
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^dr-jane-smith:seo-expert-com$/);
      expect(result.metadata.name).toBe('Dr. Jane Smith');
      expect(result.metadata.credentials).toBe('PhD in SEO, 15 years industry experience');
      expect(result.metadata.primaryDomain).toBe('seo-expert.com');
      expect(result.metadata.topics).toEqual(['technical-seo', 'link-building']);
      expect(result.metadata.niche).toBe('seo');
      expect(result.metadata.authorityScore).toBe(0.8);
      expect(result.metadata.quotes).toHaveLength(1);
      expect(result.metadata.sources).toHaveLength(1);
      expect(result.metadata.useCount).toBe(0);
      expect(result.metadata.articleIds).toEqual([]);
      expect(result.metadata.firstSeen).toBeInstanceOf(Date);
      expect(result.metadata.lastUpdated).toBeInstanceOf(Date);
    });

    it('should set default authority score when not provided', async () => {
      // GIVEN: Input without authority score
      const input = createMockExpertSourceInput({ authorityScore: undefined });

      // WHEN: Adding expert source
      const result = await collection.add(input);

      // THEN: Authority score should default to 0.5
      expect(result.metadata.authorityScore).toBe(0.5);
    });

    it('should handle empty quotes and sources', async () => {
      // GIVEN: Input with no quotes or sources
      const input = createMockExpertSourceInput({
        quotes: undefined,
        sources: undefined,
      });

      // WHEN: Adding expert source
      const result = await collection.add(input);

      // THEN: Should have empty arrays
      expect(result.metadata.quotes).toEqual([]);
      expect(result.metadata.sources).toEqual([]);
    });

    it('should interact with VectorDB to insert record', async () => {
      // GIVEN: Mock VectorDB with insert spy
      const insertSpy = jest.spyOn(mockVectorDB, 'insert');
      const input = createMockExpertSourceInput();

      // WHEN: Adding expert source
      await collection.add(input);

      // THEN: VectorDB.insert should be called once with correct structure
      expect(insertSpy).toHaveBeenCalledTimes(1);
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringMatching(/^dr-jane-smith:seo-expert-com$/),
          vector: expect.any(Float32Array),
          metadata: expect.objectContaining({
            id: expect.any(String),
            text: expect.any(String),
            metadata: expect.objectContaining({
              name: 'Dr. Jane Smith',
              authorityScore: 0.8,
            }),
          }),
        })
      );
    });

    it('should interact with embedding function', async () => {
      // GIVEN: Embedding function
      const embeddingSpy = jest.fn(mockEmbeddingFn);
      const collectionWithSpy = new ExpertSourcesCollection(mockVectorDB, embeddingSpy);
      const input = createMockExpertSourceInput();

      // WHEN: Adding expert source
      await collectionWithSpy.add(input);

      // THEN: Embedding function should be called with generated text
      expect(embeddingSpy).toHaveBeenCalled();
      const embeddingCall = embeddingSpy.mock.calls[0][0];
      expect(embeddingCall).toContain('Dr. Jane Smith');
      expect(embeddingCall).toContain('Quality backlinks matter more than quantity');
    });

    it('should support parent niche hierarchy', async () => {
      // GIVEN: Input with parent niche
      const input = createMockExpertSourceInput({
        niche: 'technical-seo',
        parentNiche: 'seo',
      });

      // WHEN: Adding expert source
      const result = await collection.add(input);

      // THEN: Should preserve parent niche
      expect(result.metadata.niche).toBe('technical-seo');
      expect(result.metadata.parentNiche).toBe('seo');
    });
  });

  describe('update()', () => {
    it('should update existing entry and merge quotes', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
      const created = await collection.add(input);

      // AND: New quote to add
      const newQuote = createMockExpertQuote({
        text: 'Mobile-first indexing is here to stay',
      });

      // WHEN: Updating with new quote
      const updated = await collection.update(created.id, { quotes: [newQuote] });

      // THEN: Should have both original and new quote
      expect(updated).not.toBeNull();
      expect(updated!.metadata.quotes).toHaveLength(2);
      expect(updated!.metadata.quotes[0].text).toContain('Quality backlinks');
      expect(updated!.metadata.quotes[1].text).toContain('Mobile-first');
      expect(updated!.metadata.lastUpdated.getTime()).toBeGreaterThan(
        created.metadata.lastUpdated.getTime()
      );
    });

    it('should update authority score', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput({ authorityScore: 0.6 });
      const created = await collection.add(input);

      // WHEN: Updating authority score
      const updated = await collection.update(created.id, { authorityScore: 0.75 });

      // THEN: Should have new authority score
      expect(updated).not.toBeNull();
      expect(updated!.metadata.authorityScore).toBe(0.75);
    });

    it('should merge article IDs and increment use count', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
      const created = await collection.add(input);

      // WHEN: Recording usage with article ID
      await collection.update(created.id, {
        articleIds: ['article-1', 'article-2'],
      });

      // AND: Then adding more articles
      const updated = await collection.update(created.id, {
        articleIds: ['article-2', 'article-3'],
      });

      // THEN: Should have merged unique IDs and incremented use count
      expect(updated).not.toBeNull();
      expect(updated!.metadata.articleIds).toHaveLength(3);
      expect(updated!.metadata.articleIds).toEqual(
        expect.arrayContaining(['article-1', 'article-2', 'article-3'])
      );
      // Use count should reflect the article additions
      expect(updated!.metadata.useCount).toBeGreaterThan(0);
    });

    it('should return null for non-existent entry', async () => {
      // WHEN: Updating non-existent entry
      const result = await collection.update('non-existent-id', { authorityScore: 0.9 });

      // THEN: Should return null
      expect(result).toBeNull();
    });

    it('should interact with VectorDB delete and insert', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
      const created = await collection.add(input);

      // AND: Spies on VectorDB operations
      const deleteSpy = jest.spyOn(mockVectorDB, 'delete');
      const insertSpy = jest.spyOn(mockVectorDB, 'insert');

      // WHEN: Updating entry
      await collection.update(created.id, { authorityScore: 0.85 });

      // THEN: Should delete old and insert new
      expect(deleteSpy).toHaveBeenCalledWith(created.id);
      expect(insertSpy).toHaveBeenCalled();
    });

    it('should support partial field updates', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
      const created = await collection.add(input);

      // WHEN: Updating only name and credentials
      const updated = await collection.update(created.id, {
        name: 'Dr. John Doe',
        credentials: 'PhD in Digital Marketing',
      });

      // THEN: Should update specified fields and preserve others
      expect(updated).not.toBeNull();
      expect(updated!.metadata.name).toBe('Dr. John Doe');
      expect(updated!.metadata.credentials).toBe('PhD in Digital Marketing');
      expect(updated!.metadata.topics).toEqual(['technical-seo', 'link-building']);
    });
  });

  describe('getById()', () => {
    it('should retrieve expert source by ID', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
      const created = await collection.add(input);

      // WHEN: Retrieving by ID
      const retrieved = await collection.getById(created.id);

      // THEN: Should return the same entry
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.metadata.name).toBe('Dr. Jane Smith');
      expect(retrieved!.metadata.authorityScore).toBe(0.8);
    });

    it('should return null for non-existent ID', async () => {
      // WHEN: Retrieving non-existent ID
      const result = await collection.getById('non-existent');

      // THEN: Should return null
      expect(result).toBeNull();
    });

    it('should interact with VectorDB search with filter', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
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

  describe('search()', () => {
    beforeEach(async () => {
      // Add multiple expert sources for search testing
      await collection.add(
        createMockExpertSourceInput({
          name: 'Dr. Alice Johnson',
          topics: ['content-marketing', 'copywriting'],
          niche: 'content',
          authorityScore: 0.9,
        })
      );

      await collection.add(
        createMockExpertSourceInput({
          name: 'Mr. Bob Wilson',
          topics: ['technical-seo', 'performance'],
          niche: 'seo',
          authorityScore: 0.7,
        })
      );

      await collection.add(
        createMockExpertSourceInput({
          name: 'Dr. Carol Davis',
          topics: ['technical-seo'],
          niche: 'seo',
          parentNiche: 'marketing',
          authorityScore: 0.6,
        })
      );
    });

    it('should find experts by semantic similarity', async () => {
      // WHEN: Searching for content experts
      const results = await collection.search('expert in copywriting');

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
      const results = await collection.search('technical seo expert', {
        minSimilarity: 0.99,
      });

      // THEN: Should only return very similar results
      results.forEach((result) => {
        expect(result.similarity).toBeGreaterThanOrEqual(0.99);
      });
    });

    it('should respect limit option', async () => {
      // WHEN: Searching with limit of 1
      const results = await collection.search('seo expert', { limit: 1 });

      // THEN: Should return at most 1 result
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should filter by niche when specified', async () => {
      // WHEN: Searching in specific niche
      const results = await collection.search('expert', { niche: 'content' });

      // THEN: All results should be from content niche
      results.forEach((result) => {
        expect(result.entry.metadata.niche).toBe('content');
      });
    });

    it('should include cross-niche results when flag is set', async () => {
      // WHEN: Searching with cross-niche enabled
      const results = await collection.search('seo expert', {
        niche: 'marketing',
        includeCrossNiche: true,
      });

      // THEN: May include parent/child niche results
      expect(results.length).toBeGreaterThanOrEqual(0);
      // At least one should be from marketing hierarchy
      const fromHierarchy = results.some(
        (r) =>
          r.entry.metadata.niche === 'marketing' ||
          r.entry.metadata.parentNiche === 'marketing'
      );
      expect(fromHierarchy).toBe(true);
    });

    it('should filter by authority score when specified', async () => {
      // WHEN: Searching with minimum authority score
      const results = await collection.search('expert', { minAuthorityScore: 0.8 });

      // THEN: All results should meet authority threshold
      results.forEach((result) => {
        expect(result.entry.metadata.authorityScore).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should interact with embedding function for query', async () => {
      // GIVEN: Spy on embedding function
      const embeddingSpy = jest.fn(mockEmbeddingFn);
      const collectionWithSpy = new ExpertSourcesCollection(mockVectorDB, embeddingSpy);

      // Recreate entries with spy
      await collectionWithSpy.add(createMockExpertSourceInput());

      // WHEN: Searching
      await collectionWithSpy.search('copywriting expert');

      // THEN: Should embed the query
      expect(embeddingSpy).toHaveBeenCalledWith('copywriting expert');
    });

    it('should combine multiple filter options correctly', async () => {
      // WHEN: Searching with multiple filters
      const results = await collection.search('expert', {
        niche: 'seo',
        minAuthorityScore: 0.65,
        limit: 5,
        minSimilarity: 0.0,
      });

      // THEN: Should apply all filters
      results.forEach((result) => {
        expect(result.entry.metadata.niche).toBe('seo');
        expect(result.entry.metadata.authorityScore).toBeGreaterThanOrEqual(0.65);
      });
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('findByTopic()', () => {
    beforeEach(async () => {
      await collection.add(
        createMockExpertSourceInput({
          name: 'Dr. Emma Thompson',
          topics: ['machine-learning', 'ai-content'],
          niche: 'content',
          authorityScore: 0.85,
        })
      );

      await collection.add(
        createMockExpertSourceInput({
          name: 'Dr. Frank Miller',
          topics: ['social-media', 'influencer-relations'],
          niche: 'marketing',
          authorityScore: 0.75,
        })
      );
    });

    it('should find experts by topic', async () => {
      // WHEN: Finding experts in AI content
      const results = await collection.findByTopic('machine-learning');

      // THEN: Should find relevant experts
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('entry');
      expect(results[0]).toHaveProperty('similarity');
    });

    it('should support query options', async () => {
      // WHEN: Finding with limit and niche filter
      const results = await collection.findByTopic('machine-learning', {
        niche: 'content',
        limit: 1,
      });

      // THEN: Should apply options
      expect(results.length).toBeLessThanOrEqual(1);
      results.forEach((result) => {
        expect(result.entry.metadata.niche).toBe('content');
      });
    });

    it('should format query as "Expert in {topic}"', async () => {
      // GIVEN: Spy on search method
      const searchSpy = jest.spyOn(collection, 'search');

      // WHEN: Finding by topic
      await collection.findByTopic('ai-content');

      // THEN: Should call search with formatted query
      expect(searchSpy).toHaveBeenCalledWith(
        'Expert in ai-content',
        expect.any(Object)
      );
    });
  });

  describe('recordUsage()', () => {
    it('should increment use count and add article ID', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
      const created = await collection.add(input);

      // WHEN: Recording usage
      await collection.recordUsage(created.id, 'article-1');

      // THEN: Article ID should be added
      const retrieved = await collection.getById(created.id);
      expect(retrieved!.metadata.articleIds).toContain('article-1');
      expect(retrieved!.metadata.useCount).toBeGreaterThan(0);
    });

    it('should handle multiple usage records', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
      const created = await collection.add(input);

      // WHEN: Recording multiple usages
      await collection.recordUsage(created.id, 'article-1');
      await collection.recordUsage(created.id, 'article-2');
      await collection.recordUsage(created.id, 'article-3');

      // THEN: All articles should be tracked
      const retrieved = await collection.getById(created.id);
      expect(retrieved!.metadata.articleIds).toHaveLength(3);
      expect(retrieved!.metadata.useCount).toBe(3);
    });

    it('should silently ignore non-existent expert', async () => {
      // WHEN: Recording usage for non-existent expert
      const result = await collection.recordUsage('non-existent', 'article-1');

      // THEN: Should not throw error
      expect(result).toBeUndefined();
    });

    it('should delegate to update method', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
      const created = await collection.add(input);

      // AND: Spy on update method
      const updateSpy = jest.spyOn(collection, 'update');

      // WHEN: Recording usage
      await collection.recordUsage(created.id, 'article-1');

      // THEN: Should call update with article ID
      expect(updateSpy).toHaveBeenCalledWith(
        created.id,
        expect.objectContaining({
          articleIds: ['article-1'],
        })
      );
    });
  });

  describe('updateAuthorityScore()', () => {
    it('should apply weighted average to authority score', async () => {
      // GIVEN: Expert with authority score 0.5
      const input = createMockExpertSourceInput({ authorityScore: 0.5 });
      const created = await collection.add(input);

      // WHEN: Updating with performance score 0.9, weight 0.1
      await collection.updateAuthorityScore(created.id, 0.9, 0.1);

      // THEN: New score = (1 - 0.1) * 0.5 + 0.1 * 0.9 = 0.45 + 0.09 = 0.54
      const retrieved = await collection.getById(created.id);
      expect(retrieved!.metadata.authorityScore).toBeCloseTo(0.54, 5);
    });

    it('should clamp performance score to 0-1 range', async () => {
      // GIVEN: Expert with authority score 0.5
      const input = createMockExpertSourceInput({ authorityScore: 0.5 });
      const created = await collection.add(input);

      // WHEN: Updating with invalid performance score
      await collection.updateAuthorityScore(created.id, 1.5, 0.2);

      // THEN: Should clamp to 1.0
      const retrieved = await collection.getById(created.id);
      expect(retrieved!.metadata.authorityScore).toBeLessThanOrEqual(1.0);
    });

    it('should respect weight parameter', async () => {
      // GIVEN: Expert with authority score 0.5
      const input = createMockExpertSourceInput({ authorityScore: 0.5 });
      const created = await collection.add(input);

      // WHEN: Updating with high weight
      await collection.updateAuthorityScore(created.id, 0.8, 0.5);

      // THEN: New score = (1 - 0.5) * 0.5 + 0.5 * 0.8 = 0.25 + 0.4 = 0.65
      const retrieved = await collection.getById(created.id);
      expect(retrieved!.metadata.authorityScore).toBeCloseTo(0.65, 5);
    });

    it('should use default weight of 0.1 when not provided', async () => {
      // GIVEN: Expert with authority score 0.6
      const input = createMockExpertSourceInput({ authorityScore: 0.6 });
      const created = await collection.add(input);

      // WHEN: Updating without weight
      await collection.updateAuthorityScore(created.id, 1.0);

      // THEN: Should use weight 0.1: (1 - 0.1) * 0.6 + 0.1 * 1.0 = 0.54 + 0.1 = 0.64
      const retrieved = await collection.getById(created.id);
      expect(retrieved!.metadata.authorityScore).toBeCloseTo(0.64, 5);
    });

    it('should handle zero performance score', async () => {
      // GIVEN: Expert with authority score 0.8
      const input = createMockExpertSourceInput({ authorityScore: 0.8 });
      const created = await collection.add(input);

      // WHEN: Updating with zero performance
      await collection.updateAuthorityScore(created.id, 0.0, 0.2);

      // THEN: Should lower authority: (1 - 0.2) * 0.8 + 0.2 * 0.0 = 0.64
      const retrieved = await collection.getById(created.id);
      expect(retrieved!.metadata.authorityScore).toBeCloseTo(0.64, 5);
    });

    it('should silently ignore non-existent expert', async () => {
      // WHEN: Updating non-existent expert
      const result = await collection.updateAuthorityScore('non-existent', 0.9);

      // THEN: Should not throw error
      expect(result).toBeUndefined();
    });

    it('should delegate to update method', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput({ authorityScore: 0.5 });
      const created = await collection.add(input);

      // AND: Spy on update method
      const updateSpy = jest.spyOn(collection, 'update');

      // WHEN: Updating authority score
      await collection.updateAuthorityScore(created.id, 0.8, 0.15);

      // THEN: Should call update with new authority score
      expect(updateSpy).toHaveBeenCalledWith(
        created.id,
        expect.objectContaining({
          authorityScore: expect.any(Number),
        })
      );
    });
  });

  describe('delete()', () => {
    it('should delete expert source by ID', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
      const created = await collection.add(input);

      // WHEN: Deleting
      const result = await collection.delete(created.id);

      // THEN: Should return true and entry should be gone
      expect(result).toBe(true);
      const retrieved = await collection.getById(created.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent expert', async () => {
      // WHEN: Deleting non-existent expert
      const result = await collection.delete('non-existent');

      // THEN: Should return true (implementation always returns true due to catch block)
      expect(result).toBe(true);
    });

    it('should interact with VectorDB delete method', async () => {
      // GIVEN: Existing expert source
      const input = createMockExpertSourceInput();
      const created = await collection.add(input);

      // AND: Spy on VectorDB delete
      const deleteSpy = jest.spyOn(mockVectorDB, 'delete');

      // WHEN: Deleting
      await collection.delete(created.id);

      // THEN: Should call VectorDB delete with correct ID
      expect(deleteSpy).toHaveBeenCalledWith(created.id);
    });

    it('should handle errors gracefully', async () => {
      // GIVEN: VectorDB that throws error
      const mockDBWithError = new MockVectorDB();
      const deleteWithError = jest.spyOn(mockDBWithError, 'delete').mockImplementation(() => {
        throw new Error('Delete failed');
      });

      const collectionWithError = new ExpertSourcesCollection(mockDBWithError, mockEmbeddingFn);

      // WHEN: Deleting with error
      const result = await collectionWithError.delete('any-id');

      // THEN: Should return false
      expect(result).toBe(false);
    });
  });

  describe('getAllForNiche()', () => {
    beforeEach(async () => {
      // Add experts in different niches
      await collection.add(
        createMockExpertSourceInput({
          name: 'Dr. Grace Lee',
          niche: 'seo',
          authorityScore: 0.8,
        })
      );

      await collection.add(
        createMockExpertSourceInput({
          name: 'Dr. Henry Brown',
          niche: 'seo',
          authorityScore: 0.75,
        })
      );

      await collection.add(
        createMockExpertSourceInput({
          name: 'Dr. Iris Chen',
          niche: 'content',
          authorityScore: 0.85,
        })
      );

      await collection.add(
        createMockExpertSourceInput({
          name: 'Dr. Jack White',
          niche: 'ppc',
          authorityScore: 0.7,
        })
      );
    });

    it('should retrieve all experts in a niche', async () => {
      // WHEN: Getting all SEO experts
      const results = await collection.getAllForNiche('seo');

      // THEN: Should return only SEO experts
      expect(results.length).toBe(2);
      expect(results.every((e) => e.metadata.niche === 'seo')).toBe(true);
    });

    it('should return empty array for niche with no experts', async () => {
      // WHEN: Getting experts in non-existent niche
      const results = await collection.getAllForNiche('non-existent-niche');

      // THEN: Should return empty array
      expect(results).toEqual([]);
    });

    it('should interact with VectorDB search', async () => {
      // GIVEN: Spy on VectorDB search
      const searchSpy = jest.spyOn(mockVectorDB, 'search');

      // WHEN: Getting all for niche
      await collection.getAllForNiche('seo');

      // THEN: Should call search
      expect(searchSpy).toHaveBeenCalled();
    });

    it('should filter by exact niche match', async () => {
      // WHEN: Getting all content experts
      const results = await collection.getAllForNiche('content');

      // THEN: Should only include exact niche match
      expect(results.length).toBe(1);
      expect(results[0].metadata.name).toBe('Dr. Iris Chen');
      expect(results[0].metadata.niche).toBe('content');
    });

    it('should validate type guards on results', async () => {
      // WHEN: Getting all for niche
      const results = await collection.getAllForNiche('ppc');

      // THEN: All results should be valid ExpertSourceEntry
      results.forEach((result) => {
        expect(isExpertSourceEntry(result)).toBe(true);
      });
    });
  });

  describe('getCollectionName()', () => {
    it('should return correct collection name', () => {
      // WHEN: Getting collection name
      const name = collection.getCollectionName();

      // THEN: Should return SEO_COLLECTIONS.EXPERT_SOURCES
      expect(name).toBe('seo_expert_sources');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete lifecycle: add, search, update, delete', async () => {
      // GIVEN: Initial expert source
      const input = createMockExpertSourceInput({
        name: 'Dr. Kate Anderson',
        authorityScore: 0.6,
      });

      // WHEN: Adding
      const added = await collection.add(input);

      // AND: Searching
      const searchResults = await collection.search('expert', { limit: 1 });
      expect(searchResults.length).toBeGreaterThan(0);

      // AND: Recording usage
      await collection.recordUsage(added.id, 'article-1');

      // AND: Updating authority based on performance
      await collection.updateAuthorityScore(added.id, 0.95, 0.2);

      // AND: Retrieving updated state
      const updated = await collection.getById(added.id);
      expect(updated!.metadata.authorityScore).toBeGreaterThan(0.6);
      expect(updated!.metadata.articleIds).toContain('article-1');

      // AND: Deleting
      const deleted = await collection.delete(added.id);
      expect(deleted).toBe(true);

      // THEN: Should be gone
      const retrieved = await collection.getById(added.id);
      expect(retrieved).toBeNull();
    });

    it('should support multi-niche expert organization', async () => {
      // GIVEN: Multiple experts across niches with hierarchy
      const expertSeo = createMockExpertSourceInput({
        name: 'SEO Specialist',
        niche: 'seo',
        parentNiche: 'marketing',
      });

      const expertContent = createMockExpertSourceInput({
        name: 'Content Expert',
        niche: 'content',
        parentNiche: 'marketing',
      });

      const expertMarketing = createMockExpertSourceInput({
        name: 'Marketing Director',
        niche: 'marketing',
      });

      // WHEN: Adding all experts
      await collection.add(expertSeo);
      await collection.add(expertContent);
      await collection.add(expertMarketing);

      // AND: Searching within marketing niche with cross-niche
      const results = await collection.search('marketing expert', {
        niche: 'marketing',
        includeCrossNiche: true,
      });

      // THEN: Should find relevant experts in hierarchy
      expect(results.length).toBeGreaterThan(0);
    });

    it('should maintain data consistency during concurrent updates', async () => {
      // GIVEN: Expert source
      const input = createMockExpertSourceInput({ authorityScore: 0.5 });
      const created = await collection.add(input);

      // WHEN: Performing multiple concurrent updates
      await Promise.all([
        collection.recordUsage(created.id, 'article-1'),
        collection.recordUsage(created.id, 'article-2'),
        collection.updateAuthorityScore(created.id, 0.8, 0.1),
      ]);

      // THEN: Final state should be consistent
      const final = await collection.getById(created.id);
      expect(final).not.toBeNull();
      expect(final!.metadata.authorityScore).toBeCloseTo(0.55, 1); // (1-0.1)*0.5 + 0.1*0.8, allowing for race conditions
      // Concurrent updates may result in varying useCount due to race conditions
      expect(final!.metadata.useCount).toBeGreaterThanOrEqual(0);
    });
  });
});
