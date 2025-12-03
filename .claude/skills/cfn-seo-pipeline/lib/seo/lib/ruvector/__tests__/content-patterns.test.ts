/**
 * Content Patterns Collection Test Suite
 *
 * London School TDD: Focus on object collaboration, mock interactions,
 * and behavior verification through precise expectations.
 *
 * Test coverage:
 * - add() - Create patterns with all fields
 * - update() - Update existing entries, increment success
 * - getById() - Retrieve by ID
 * - search() - Semantic search with filters
 * - getByType() - Get patterns by type
 * - getTopPatterns() - Get top patterns for niche/format
 * - recordUsage() - Track pattern usage
 * - recordSuccess() - Record successful usage
 * - updateConfidence() - Update confidence based on performance
 * - updatePerformanceMetrics() - Update performance metrics
 * - extractAndStore() - Extract and store pattern from successful article
 * - delete() - Remove entries
 * - getLowConfidencePatterns() - Find patterns for review
 * - getHighPerformingPatterns() - Find patterns to replicate
 *
 * @module ruvector/__tests__/content-patterns.test
 */

import type { VectorDB } from '@ruvector/core';
import {
  ContentPatternsCollection,
  type ContentPatternInput,
  type ContentPatternQueryOptions,
} from '../collections/content-patterns';
import type { ContentPatternEntry } from '../schemas';

/**
 * In-memory VectorDB mock implementation
 *
 * Collaboration pattern: ContentPatternsCollection delegates persistence
 * to VectorDB. Mock verifies expected insert/delete/search calls.
 */
class InMemoryVectorDBMock implements VectorDB {
  private items: Map<string, { id: string; vector: Float32Array; metadata: unknown }> = new Map();
  private insertCalls: Array<{ id: string; vector: Float32Array; metadata: unknown }> = [];
  private deleteCalls: string[] = [];
  private searchCalls: Array<{ vector: Float32Array; k: number }> = [];

  async insert(item: { id: string; vector: Float32Array; metadata: unknown }): Promise<void> {
    this.insertCalls.push(item);
    this.items.set(item.id, item);
  }

  async delete(id: string): Promise<void> {
    this.deleteCalls.push(id);
    this.items.delete(id);
  }

  async search(
    options: {
      vector: Float32Array;
      k: number;
      filter?: (item: unknown) => boolean;
    }
  ): Promise<Array<{ metadata: unknown; score: number }>> {
    this.searchCalls.push({ vector: options.vector, k: options.k });

    const results = Array.from(this.items.values())
      .filter((item) => {
        if (!options.filter) return true;
        // The filter receives { metadata: ContentPatternEntry } structure
        // matching the RuVector search result format
        return options.filter({ metadata: item.metadata });
      })
      .map((item) => ({
        metadata: item.metadata,
        score: 0.9, // Default similarity score
      }));

    return results.slice(0, options.k);
  }

  // Test helper methods
  getInsertCalls() {
    return this.insertCalls;
  }

  getDeleteCalls() {
    return this.deleteCalls;
  }

  getSearchCalls() {
    return this.searchCalls;
  }

  getStoredItems() {
    return this.items;
  }

  reset() {
    // Reset call tracking arrays but keep items for subsequent operations
    this.insertCalls = [];
    this.deleteCalls = [];
    this.searchCalls = [];
  }
}

/**
 * Deterministic embedding function for testing
 *
 * Returns same vector for same text, enabling predictable test behavior.
 * Production code would use real embedding model.
 */
function createMockEmbedding() {
  const cache = new Map<string, Float32Array>();

  return async (text: string): Promise<Float32Array> => {
    if (cache.has(text)) {
      return cache.get(text)!;
    }

    // Create deterministic vector based on text hash
    const hash = text.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    const vector = new Float32Array(1536);
    // Seed first few values with hash-based values
    vector[0] = Math.sin(hash) * 0.5 + 0.5;
    vector[1] = Math.cos(hash) * 0.5 + 0.5;

    // Fill rest with deterministic values
    for (let i = 2; i < 1536; i++) {
      vector[i] = Math.sin(hash + i) * 0.1;
    }

    cache.set(text, vector);
    return vector;
  };
}

describe('ContentPatternsCollection', () => {
  let db: InMemoryVectorDBMock;
  let embedding: (text: string) => Promise<Float32Array>;
  let collection: ContentPatternsCollection;

  beforeEach(() => {
    db = new InMemoryVectorDBMock();
    embedding = createMockEmbedding();
    collection = new ContentPatternsCollection(db, embedding);
  });

  describe('add()', () => {
    it('should insert pattern with all fields into VectorDB', async () => {
      const input: ContentPatternInput = {
        type: 'ANGLE',
        description: 'Data-driven angle with statistics',
        example: 'Article starts with surprising stat',
        niche: 'SEO',
        format: 'guide',
        confidenceScore: 0.75,
        performanceMetrics: {
          avgPosition: 3.2,
          avgCTR: 0.085,
          avgTimeOnPage: 245,
        },
      };

      const result = await collection.add(input);

      // Verify return value has correct structure
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata.type).toBe('ANGLE');
      expect(result.metadata.description).toBe('Data-driven angle with statistics');
      expect(result.metadata.niche).toBe('SEO');
      expect(result.metadata.format).toBe('guide');
      expect(result.metadata.confidenceScore).toBe(0.75);

      // Verify VectorDB.insert() was called with vector and metadata
      const insertCalls = db.getInsertCalls();
      expect(insertCalls).toHaveLength(1);
      expect(insertCalls[0].id).toBe(result.id);
      expect(insertCalls[0].vector).toBeInstanceOf(Float32Array);
      expect(insertCalls[0].metadata).toEqual(result);
    });

    it('should set default confidence score to 0.5 when not provided', async () => {
      const input: ContentPatternInput = {
        type: 'HOOK',
        description: 'Question hook',
        example: 'Starting with a question',
        niche: 'marketing',
      };

      const result = await collection.add(input);

      expect(result.metadata.confidenceScore).toBe(0.5);
    });

    it('should initialize pattern with zero usage and success counts', async () => {
      const input: ContentPatternInput = {
        type: 'STRUCTURE',
        description: 'Inverted pyramid',
        example: 'Key info first',
        niche: 'news',
      };

      const result = await collection.add(input);

      expect(result.metadata.useCount).toBe(0);
      expect(result.metadata.successCount).toBe(0);
      expect(result.metadata.articleIds).toHaveLength(0);
    });

    it('should generate ID based on type and description', async () => {
      const input1: ContentPatternInput = {
        type: 'ANGLE',
        description: 'Unique angle description',
        example: 'Example',
        niche: 'niche1',
      };

      const input2: ContentPatternInput = {
        type: 'ANGLE',
        description: 'Unique angle description',
        example: 'Example',
        niche: 'niche1',
      };

      const result1 = await collection.add(input1);
      const result2 = await collection.add(input2);

      // Same type and description should generate same ID
      expect(result1.id).toBe(result2.id);
    });

    it('should call embedding function with generated text', async () => {
      const embeddingSpy = jest.fn(embedding);
      const collectionWithSpy = new ContentPatternsCollection(db, embeddingSpy);

      const input: ContentPatternInput = {
        type: 'DEPTH',
        description: 'In-depth analysis',
        example: 'Comprehensive coverage',
        niche: 'tech',
      };

      await collectionWithSpy.add(input);

      expect(embeddingSpy).toHaveBeenCalled();
      const callArg = embeddingSpy.mock.calls[0][0];
      expect(callArg).toContain('DEPTH');
      expect(callArg).toContain('In-depth analysis');
      expect(callArg).toContain('tech');
    });
  });

  describe('update()', () => {
    it('should update existing pattern and increment use count', async () => {
      const input: ContentPatternInput = {
        type: 'CTA',
        description: 'Action-oriented CTA',
        example: 'Click here to learn more',
        niche: 'ecommerce',
      };

      const original = await collection.add(input);
      expect(original.metadata.useCount).toBe(0);

      const updated = await collection.update(original.id, { articleIds: ['article1'] });

      expect(updated).not.toBeNull();
      expect(updated!.metadata.useCount).toBe(1);
      expect(updated!.metadata.articleIds).toContain('article1');
    });

    it('should increment success count when incrementSuccess is true', async () => {
      const original = await collection.add({
        type: 'VOICE',
        description: 'Authoritative voice',
        example: 'Expert perspective',
        niche: 'finance',
      });

      expect(original.metadata.successCount).toBe(0);

      const updated = await collection.update(original.id, { incrementSuccess: true });

      expect(updated!.metadata.successCount).toBe(1);
    });

    it('should merge article IDs without duplicates', async () => {
      const original = await collection.add({
        type: 'ANGLE',
        description: 'Test angle',
        example: 'Example',
        niche: 'test',
      });

      const first = await collection.update(original.id, { articleIds: ['article1', 'article2'] });
      expect(first!.metadata.useCount).toBe(2);

      const second = await collection.update(original.id, { articleIds: ['article2', 'article3'] });
      expect(second!.metadata.useCount).toBe(4); // Incremented by 2 (length of ['article2', 'article3']), not 3
      expect(new Set(second!.metadata.articleIds)).toEqual(new Set(['article1', 'article2', 'article3']));
    });

    it('should update description and other fields', async () => {
      const original = await collection.add({
        type: 'STRUCTURE',
        description: 'Original description',
        example: 'Original example',
        niche: 'test',
      });

      const updated = await collection.update(original.id, {
        description: 'New description',
        example: 'New example',
      });

      expect(updated!.metadata.description).toBe('New description');
      expect(updated!.metadata.example).toBe('New example');
    });

    it('should return null for non-existent pattern', async () => {
      const result = await collection.update('non-existent-id', { articleIds: ['article1'] });

      expect(result).toBeNull();
    });

    it('should call delete and insert on VectorDB for update', async () => {
      const original = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Test',
        niche: 'test',
      });

      db.reset(); // Reset to see only update operations

      await collection.update(original.id, { confidenceScore: 0.8 });

      const deleteCalls = db.getDeleteCalls();
      const insertCalls = db.getInsertCalls();

      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0]).toBe(original.id);
      expect(insertCalls).toHaveLength(1);
    });
  });

  describe('getById()', () => {
    it('should retrieve pattern by ID', async () => {
      const original = await collection.add({
        type: 'HOOK',
        description: 'Question hook pattern',
        example: 'Why is X important?',
        niche: 'education',
      });

      const retrieved = await collection.getById(original.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(original.id);
      expect(retrieved!.metadata.description).toBe('Question hook pattern');
    });

    it('should return null for non-existent ID', async () => {
      const result = await collection.getById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should call VectorDB.search() with filter for ID matching', async () => {
      const original = await collection.add({
        type: 'ANGLE',
        description: 'Test pattern',
        example: 'Test',
        niche: 'test',
      });

      db.reset();

      await collection.getById(original.id);

      const searchCalls = db.getSearchCalls();
      expect(searchCalls).toHaveLength(1);
    });

    it('should handle VectorDB errors gracefully', async () => {
      const failingDb: VectorDB = {
        async search() {
          throw new Error('Database connection failed');
        },
        async insert() {},
        async delete() {},
      };

      const collectionWithFailingDb = new ContentPatternsCollection(failingDb, embedding);
      const result = await collectionWithFailingDb.getById('any-id');

      expect(result).toBeNull();
    });
  });

  describe('search()', () => {
    beforeEach(async () => {
      // Set up test data
      await collection.add({
        type: 'ANGLE',
        description: 'Data-driven angle',
        example: 'Statistics-based',
        niche: 'SEO',
        format: 'blog',
        confidenceScore: 0.85,
      });

      await collection.add({
        type: 'ANGLE',
        description: 'Story-based angle',
        example: 'Customer success',
        niche: 'SEO',
        format: 'case-study',
        confidenceScore: 0.72,
      });

      await collection.add({
        type: 'STRUCTURE',
        description: 'Step-by-step structure',
        example: 'How-to guide',
        niche: 'marketing',
        confidenceScore: 0.65,
      });
    });

    it('should return patterns matching query', async () => {
      const results = await collection.search('angle with statistics');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('entry');
      expect(results[0]).toHaveProperty('similarity');
    });

    it('should filter by type', async () => {
      const results = await collection.search('pattern', { type: 'ANGLE' });

      expect(results.every((r) => r.entry.metadata.type === 'ANGLE')).toBe(true);
    });

    it('should filter by niche', async () => {
      const results = await collection.search('angle', { niche: 'SEO' });

      expect(results.every((r) => r.entry.metadata.niche === 'SEO')).toBe(true);
    });

    it('should filter by format', async () => {
      const results = await collection.search('pattern', { format: 'blog' });

      expect(results.every((r) => r.entry.metadata.format === 'blog')).toBe(true);
    });

    it('should filter by minimum confidence score', async () => {
      const results = await collection.search('angle', { minConfidenceScore: 0.75 });

      expect(results.every((r) => r.entry.metadata.confidenceScore >= 0.75)).toBe(true);
    });

    it('should filter by minimum use count', async () => {
      const pattern = await collection.add({
        type: 'DEPTH',
        description: 'Deep analysis',
        example: 'Comprehensive',
        niche: 'tech',
      });

      await collection.update(pattern.id, { articleIds: ['a1', 'a2', 'a3'] });

      const results = await collection.search('analysis', { minUseCount: 3 });

      expect(results.every((r) => r.entry.metadata.useCount >= 3)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const results = await collection.search('pattern', { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should call embedding function with query', async () => {
      const embeddingSpy = jest.fn(embedding);
      const collectionWithSpy = new ContentPatternsCollection(db, embeddingSpy);

      await collectionWithSpy.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Test',
        niche: 'test',
      });

      embeddingSpy.mockClear();

      await collectionWithSpy.search('test query');

      expect(embeddingSpy).toHaveBeenCalledWith('test query');
    });
  });

  describe('getByType()', () => {
    beforeEach(async () => {
      await collection.add({
        type: 'ANGLE',
        description: 'First angle',
        example: 'Ex1',
        niche: 'SEO',
        confidenceScore: 0.8,
      });

      await collection.add({
        type: 'ANGLE',
        description: 'Second angle',
        example: 'Ex2',
        niche: 'marketing',
        confidenceScore: 0.9,
      });

      await collection.add({
        type: 'STRUCTURE',
        description: 'Structure pattern',
        example: 'Ex3',
        niche: 'SEO',
        confidenceScore: 0.7,
      });
    });

    it('should return only patterns of specified type', async () => {
      const results = await collection.getByType('ANGLE');

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata.type === 'ANGLE')).toBe(true);
    });

    it('should sort by confidence score descending', async () => {
      const results = await collection.getByType('ANGLE');

      expect(results[0].metadata.confidenceScore).toBeGreaterThanOrEqual(results[1].metadata.confidenceScore);
    });

    it('should filter by niche when option provided', async () => {
      const results = await collection.getByType('ANGLE', { niche: 'SEO' });

      expect(results).toHaveLength(1);
      expect(results[0].metadata.niche).toBe('SEO');
    });

    it('should filter by minimum confidence score', async () => {
      const results = await collection.getByType('ANGLE', { minConfidenceScore: 0.85 });

      expect(results).toHaveLength(1);
      expect(results[0].metadata.confidenceScore).toBe(0.9);
    });

    it('should return empty array for type with no patterns', async () => {
      const results = await collection.getByType('VOICE');

      expect(results).toHaveLength(0);
    });
  });

  describe('getTopPatterns()', () => {
    beforeEach(async () => {
      // Pattern 1: High confidence, medium usage
      const p1 = await collection.add({
        type: 'ANGLE',
        description: 'Top angle',
        example: 'Example',
        niche: 'SEO',
        format: 'guide',
        confidenceScore: 0.95,
      });
      await collection.update(p1.id, { articleIds: ['a1', 'a2'] });

      // Pattern 2: Medium confidence, high usage
      const p2 = await collection.add({
        type: 'STRUCTURE',
        description: 'Popular structure',
        example: 'Example',
        niche: 'SEO',
        format: 'guide',
        confidenceScore: 0.7,
      });
      await collection.update(p2.id, { articleIds: ['a1', 'a2', 'a3', 'a4'] });

      // Pattern 3: Different niche
      await collection.add({
        type: 'HOOK',
        description: 'Marketing hook',
        example: 'Example',
        niche: 'marketing',
        format: 'guide',
        confidenceScore: 0.9,
      });
    });

    it('should return top patterns for niche sorted by compound score', async () => {
      const results = await collection.getTopPatterns('SEO', 'guide');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.metadata.niche === 'SEO')).toBe(true);
      expect(results.every((r) => r.metadata.format === 'guide')).toBe(true);
    });

    it('should filter by format when provided', async () => {
      const results = await collection.getTopPatterns('SEO', 'guide');

      expect(results.every((r) => r.metadata.format === 'guide')).toBe(true);
    });

    it('should not filter by format when not provided', async () => {
      const results = await collection.getTopPatterns('SEO');

      expect(results.every((r) => r.metadata.niche === 'SEO')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const results = await collection.getTopPatterns('SEO', undefined, 1);

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should return empty array for non-existent niche', async () => {
      const results = await collection.getTopPatterns('non-existent-niche');

      expect(results).toHaveLength(0);
    });
  });

  describe('recordUsage()', () => {
    it('should increment use count for pattern', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
      });

      expect(pattern.metadata.useCount).toBe(0);

      await collection.recordUsage(pattern.id, 'article1');

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.useCount).toBe(1);
      expect(updated!.metadata.articleIds).toContain('article1');
    });

    it('should add article ID to pattern', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
      });

      await collection.recordUsage(pattern.id, 'article1');
      await collection.recordUsage(pattern.id, 'article2');

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.articleIds).toContain('article1');
      expect(updated!.metadata.articleIds).toContain('article2');
    });

    it('should do nothing for non-existent pattern', async () => {
      // Should not throw
      await collection.recordUsage('non-existent-id', 'article1');
    });

    it('should update lastUsed timestamp', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
      });

      const timeBefore = pattern.metadata.lastUsed;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await collection.recordUsage(pattern.id, 'article1');

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.lastUsed.getTime()).toBeGreaterThan(timeBefore.getTime());
    });
  });

  describe('recordSuccess()', () => {
    it('should increment success count', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
      });

      expect(pattern.metadata.successCount).toBe(0);

      await collection.recordSuccess(pattern.id, 'article1');

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.successCount).toBe(1);
    });

    it('should also increment use count', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
      });

      await collection.recordSuccess(pattern.id, 'article1');

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.useCount).toBe(1);
      expect(updated!.metadata.successCount).toBe(1);
    });

    it('should do nothing for non-existent pattern', async () => {
      // Should not throw
      await collection.recordSuccess('non-existent-id', 'article1');
    });

    it('should track multiple successes independently', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
      });

      await collection.recordSuccess(pattern.id, 'article1');
      await collection.recordSuccess(pattern.id, 'article2');
      await collection.recordUsage(pattern.id, 'article3');

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.successCount).toBe(2);
      expect(updated!.metadata.useCount).toBe(3);
    });
  });

  describe('updateConfidence()', () => {
    it('should boost confidence for high performance score', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
        confidenceScore: 0.5,
      });

      await collection.updateConfidence(pattern.id, 0.85); // High performance

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.confidenceScore).toBeGreaterThan(0.5);
    });

    it('should reduce confidence for low performance score', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
        confidenceScore: 0.5,
      });

      await collection.updateConfidence(pattern.id, 0.2); // Low performance

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.confidenceScore).toBeLessThan(0.5);
    });

    it('should not change confidence for medium performance', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
        confidenceScore: 0.5,
      });

      await collection.updateConfidence(pattern.id, 0.5); // Medium

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.confidenceScore).toBe(0.5);
    });

    it('should apply consensus bonus adjustment', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
        confidenceScore: 0.5,
      });

      // Consensus 0.95 is 0.10 above 0.85 baseline
      await collection.updateConfidence(pattern.id, 0.5, 0.95);

      const updated = await collection.getById(pattern.id);
      // Should get boost from consensus
      expect(updated!.metadata.confidenceScore).toBeGreaterThan(0.5);
    });

    it('should clamp confidence to valid range [0.1, 0.99]', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
        confidenceScore: 0.99,
      });

      // Try to boost beyond max
      await collection.updateConfidence(pattern.id, 1.0);

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.confidenceScore).toBeLessThanOrEqual(0.99);
    });

    it('should do nothing for non-existent pattern', async () => {
      // Should not throw
      await collection.updateConfidence('non-existent-id', 0.8);
    });
  });

  describe('updatePerformanceMetrics()', () => {
    it('should update performance metrics', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
        performanceMetrics: {
          avgPosition: 5,
          avgCTR: 0.05,
          avgTimeOnPage: 100,
        },
      });

      const newMetrics = {
        avgPosition: 3,
        avgCTR: 0.08,
        avgTimeOnPage: 200,
      };

      await collection.updatePerformanceMetrics(pattern.id, newMetrics);

      const updated = await collection.getById(pattern.id);
      expect(updated!.metadata.performanceMetrics).toBeDefined();
      expect(updated!.metadata.performanceMetrics!.avgPosition).toBeLessThan(5);
    });

    it('should apply weighted average to existing metrics', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
        performanceMetrics: {
          avgPosition: 10,
          avgCTR: 0.02,
          avgTimeOnPage: 50,
        },
      });

      const newMetrics = {
        avgPosition: 2,
        avgCTR: 0.1,
        avgTimeOnPage: 300,
      };

      await collection.updatePerformanceMetrics(pattern.id, newMetrics);

      const updated = await collection.getById(pattern.id);
      // Should be weighted average: 0.7 * old + 0.3 * new
      expect(updated!.metadata.performanceMetrics!.avgPosition).toBeLessThan(10);
      expect(updated!.metadata.performanceMetrics!.avgPosition).toBeGreaterThan(2);
    });

    it('should do nothing for non-existent pattern', async () => {
      // Should not throw
      await collection.updatePerformanceMetrics('non-existent-id', {
        avgPosition: 5,
        avgCTR: 0.05,
        avgTimeOnPage: 100,
      });
    });
  });

  describe('extractAndStore()', () => {
    it('should create pattern with confidence based on consensus score', async () => {
      const input: ContentPatternInput = {
        type: 'STRUCTURE',
        description: 'Proven structure',
        example: 'Example structure',
        niche: 'SEO',
      };

      const consensusScore = 0.92;
      const result = await collection.extractAndStore(input, consensusScore);

      expect(result).not.toBeNull();
      // Initial confidence = 0.5 + (0.92 - 0.85) * 2 = 0.5 + 0.14 = 0.64
      expect(result.metadata.confidenceScore).toBeCloseTo(0.64, 1);
    });

    it('should clamp confidence to valid range during extraction', async () => {
      const input: ContentPatternInput = {
        type: 'ANGLE',
        description: 'Test angle',
        example: 'Example',
        niche: 'test',
      };

      // Very high consensus
      const result = await collection.extractAndStore(input, 0.99);
      expect(result.metadata.confidenceScore).toBeLessThanOrEqual(0.99);

      // Very low consensus
      const result2 = await collection.extractAndStore(input, 0.2);
      expect(result2.metadata.confidenceScore).toBeGreaterThanOrEqual(0.1);
    });

    it('should insert pattern into VectorDB', async () => {
      const input: ContentPatternInput = {
        type: 'VOICE',
        description: 'Expert voice',
        example: 'Speaking as expert',
        niche: 'finance',
      };

      db.reset();

      await collection.extractAndStore(input, 0.9);

      const insertCalls = db.getInsertCalls();
      expect(insertCalls).toHaveLength(1);
    });
  });

  describe('delete()', () => {
    it('should remove pattern from VectorDB', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
      });

      const result = await collection.delete(pattern.id);

      expect(result).toBe(true);

      const retrieved = await collection.getById(pattern.id);
      expect(retrieved).toBeNull();
    });

    it('should call VectorDB.delete with pattern ID', async () => {
      const pattern = await collection.add({
        type: 'ANGLE',
        description: 'Test',
        example: 'Example',
        niche: 'test',
      });

      db.reset();

      await collection.delete(pattern.id);

      const deleteCalls = db.getDeleteCalls();
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0]).toBe(pattern.id);
    });

    it('should return false if deletion fails', async () => {
      const failingDb: VectorDB = {
        async delete() {
          throw new Error('Deletion failed');
        },
        async search() {
          return [];
        },
        async insert() {},
      };

      const collectionWithFailingDb = new ContentPatternsCollection(failingDb, embedding);

      const result = await collectionWithFailingDb.delete('any-id');

      expect(result).toBe(false);
    });
  });

  describe('getLowConfidencePatterns()', () => {
    beforeEach(async () => {
      // Low confidence, high usage
      const p1 = await collection.add({
        type: 'ANGLE',
        description: 'Low confidence angle',
        example: 'Example',
        niche: 'test',
        confidenceScore: 0.25,
      });
      await collection.update(p1.id, {
        articleIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'],
      });

      // High confidence
      const p2 = await collection.add({
        type: 'ANGLE',
        description: 'High confidence angle',
        example: 'Example',
        niche: 'test',
        confidenceScore: 0.85,
      });
      await collection.update(p2.id, {
        articleIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'],
      });

      // Low confidence, low usage (should not be included)
      await collection.add({
        type: 'STRUCTURE',
        description: 'Low confidence, low usage',
        example: 'Example',
        niche: 'test',
        confidenceScore: 0.2,
      });
    });

    it('should return patterns below confidence threshold with sufficient usage', async () => {
      const results = await collection.getLowConfidencePatterns(0.3);

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.metadata.confidenceScore < 0.3)).toBe(true);
      expect(results.every((r) => r.metadata.useCount > 5)).toBe(true);
    });

    it('should exclude patterns with low usage', async () => {
      const results = await collection.getLowConfidencePatterns(0.3);

      // Should exclude the third pattern added
      expect(results.every((r) => r.metadata.useCount > 5)).toBe(true);
    });

    it('should return empty array if no patterns match', async () => {
      const results = await collection.getLowConfidencePatterns(0.01);

      expect(results).toHaveLength(0);
    });
  });

  describe('getHighPerformingPatterns()', () => {
    beforeEach(async () => {
      // High confidence, high success rate
      const p1 = await collection.add({
        type: 'ANGLE',
        description: 'High performer',
        example: 'Example',
        niche: 'SEO',
        confidenceScore: 0.9,
      });
      await collection.update(p1.id, { articleIds: ['a1', 'a2', 'a3'] });
      await collection.recordSuccess(p1.id, 'a1');
      await collection.recordSuccess(p1.id, 'a2');
      await collection.recordSuccess(p1.id, 'a3');

      // Medium confidence, medium success rate
      const p2 = await collection.add({
        type: 'STRUCTURE',
        description: 'Medium performer',
        example: 'Example',
        niche: 'SEO',
        confidenceScore: 0.75,
      });
      await collection.update(p2.id, { articleIds: ['a4', 'a5', 'a6'] });
      await collection.recordSuccess(p2.id, 'a4');

      // Low confidence (should be excluded)
      const p3 = await collection.add({
        type: 'HOOK',
        description: 'Low performer',
        example: 'Example',
        niche: 'marketing',
        confidenceScore: 0.6,
      });
      await collection.update(p3.id, { articleIds: ['a7'] });

      // From different niche
      const p4 = await collection.add({
        type: 'DEPTH',
        description: 'Other niche',
        example: 'Example',
        niche: 'finance',
        confidenceScore: 0.92,
      });
      await collection.update(p4.id, { articleIds: ['a8', 'a9', 'a10'] });
    });

    it('should return patterns with confidence >= 0.7 and use count >= 3', async () => {
      const results = await collection.getHighPerformingPatterns('SEO');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.metadata.confidenceScore >= 0.7)).toBe(true);
      expect(results.every((r) => r.metadata.useCount >= 3)).toBe(true);
    });

    it('should filter by niche when provided', async () => {
      const results = await collection.getHighPerformingPatterns('SEO');

      expect(results.every((r) => r.metadata.niche === 'SEO')).toBe(true);
    });

    it('should not filter by niche when not provided', async () => {
      const results = await collection.getHighPerformingPatterns();

      expect(results.every((r) => r.metadata.confidenceScore >= 0.7)).toBe(true);
    });

    it('should sort by success rate * confidence', async () => {
      const results = await collection.getHighPerformingPatterns('SEO');

      if (results.length > 1) {
        for (let i = 0; i < results.length - 1; i++) {
          const rateA = (results[i].metadata.successCount / Math.max(1, results[i].metadata.useCount)) *
            results[i].metadata.confidenceScore;
          const rateB =
            (results[i + 1].metadata.successCount / Math.max(1, results[i + 1].metadata.useCount)) *
            results[i + 1].metadata.confidenceScore;
          expect(rateA).toBeGreaterThanOrEqual(rateB);
        }
      }
    });

    it('should respect limit parameter', async () => {
      const results = await collection.getHighPerformingPatterns('SEO', 1);

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should return empty array if no patterns match criteria', async () => {
      const results = await collection.getHighPerformingPatterns('non-existent-niche');

      expect(results).toHaveLength(0);
    });
  });

  describe('getCollectionName()', () => {
    it('should return correct collection name', () => {
      const name = collection.getCollectionName();

      expect(name).toBe('seo_content_patterns');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete pattern lifecycle', async () => {
      // 1. Extract pattern from successful article
      const pattern = await collection.extractAndStore(
        {
          type: 'ANGLE',
          description: 'Data-first approach',
          example: 'Start with statistics',
          niche: 'SEO',
          format: 'guide',
        },
        0.92
      );

      expect(pattern.metadata.useCount).toBe(0);
      expect(pattern.metadata.confidenceScore).toBeCloseTo(0.64, 1);

      // 2. Use pattern in new articles
      await collection.recordUsage(pattern.id, 'article-1');
      await collection.recordUsage(pattern.id, 'article-2');

      // 3. Track successes (also increments useCount)
      await collection.recordSuccess(pattern.id, 'article-3');

      // 4. Update performance metrics
      await collection.updatePerformanceMetrics(pattern.id, {
        avgPosition: 3.5,
        avgCTR: 0.082,
        avgTimeOnPage: 240,
      });

      // 5. Adjust confidence based on performance
      await collection.updateConfidence(pattern.id, 0.8);

      const final = await collection.getById(pattern.id);
      expect(final!.metadata.useCount).toBe(3); // 2 from recordUsage + 1 from recordSuccess
      expect(final!.metadata.successCount).toBe(1);
      expect(final!.metadata.confidenceScore).toBeGreaterThan(0.64);
    });

    it('should enable pattern discovery workflows', async () => {
      // Create multiple patterns
      const p1 = await collection.add({
        type: 'ANGLE',
        description: 'Data-driven',
        example: 'Stats first',
        niche: 'SEO',
        format: 'guide',
        confidenceScore: 0.85,
      });

      const p2 = await collection.add({
        type: 'STRUCTURE',
        description: 'Inverted pyramid',
        example: 'Key info first',
        niche: 'SEO',
        format: 'guide',
        confidenceScore: 0.8,
      });

      // Track usage and success
      await collection.recordUsage(p1.id, 'article-1');
      await collection.recordSuccess(p1.id, 'article-1');
      await collection.update(p1.id, { articleIds: ['article-2', 'article-3'] });

      await collection.recordUsage(p2.id, 'article-2');

      // Get top patterns for niche
      const topPatterns = await collection.getTopPatterns('SEO', 'guide');

      expect(topPatterns).toHaveLength(2);
      expect(topPatterns.every((p) => p.metadata.niche === 'SEO')).toBe(true);

      // Get high performers
      const highPerformers = await collection.getHighPerformingPatterns('SEO');

      expect(highPerformers.length).toBeGreaterThan(0);
      expect(highPerformers[0].metadata.confidenceScore).toBeGreaterThanOrEqual(0.7);
    });
  });
});
