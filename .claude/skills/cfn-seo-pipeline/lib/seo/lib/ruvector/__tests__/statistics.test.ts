/**
 * Statistics Collection Test Suite
 * Location: .claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/__tests__/statistics.test.ts
 *
 * TDD London School focus: Object collaboration, interaction verification, clear contracts.
 * Tests verify interaction between StatisticsCollection and VectorDB, embedding service, and date/time.
 */

import { StatisticsCollection } from '../collections/statistics';
import type { VectorDB } from '../storage';
import type { StatisticInput } from '../collections/statistics';

// ============================================================================
// Mock Setup: VectorDB and EmbeddingService
// ============================================================================

const mockVectorDB = {
  insert: jest.fn(),
  delete: jest.fn(),
  search: jest.fn(),
};

const mockEmbeddingService = jest.fn((text: string): Float32Array => {
  // Deterministic embedding: hash text to produce consistent vector
  const hash = Array.from(text).reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
  const array = new Float32Array(1536);
  for (let i = 0; i < 1536; i++) {
    array[i] = Math.sin(hash + i) * 0.5 + 0.5;
  }
  return array;
});

// Control Date for freshness calculations
let mockedDate: Date;

beforeEach(() => {
  jest.clearAllMocks();
  mockedDate = new Date('2025-01-15T00:00:00Z');
  jest.useFakeTimers();
  jest.setSystemTime(mockedDate);
});

afterEach(() => {
  jest.useRealTimers();
});

// ============================================================================
// Test Suite: StatisticsCollection
// ============================================================================

describe('StatisticsCollection', () => {
  let collection: StatisticsCollection;

  beforeEach(() => {
    collection = new StatisticsCollection(mockVectorDB as any, mockEmbeddingService as any);
  });

  // ========================================================================
  // 1. add() - Create new statistics with all fields
  // ========================================================================

  describe('add()', () => {
    it('should create new statistic with all required fields and interactions', async () => {
      // GIVEN: A fresh statistic with full details
      const newStatInput: StatisticInput = {
        statistic: 'conversion_rate',
        numericValue: 3.5,
        unit: 'percent',
        topics: ['conversion', 'optimization'],
        sourceName: 'industry_benchmark',
        sourceUrl: 'https://example.com/benchmark',
        publicationDate: new Date('2024-12-01'),
        credibilityScore: 0.92,
        timeSensitive: false,
        niche: 'ecommerce',
      };

      // WHEN: Adding the statistic
      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(
        new Float32Array(1536).fill(0.5),
      );

      const result = await collection.add(newStatInput);

      // THEN: VectorDB.insert called with correct structure
      expect(mockVectorDB.insert).toHaveBeenCalled();
      expect(mockEmbeddingService).toHaveBeenCalled();

      const call = (mockVectorDB.insert as jest.Mock).mock.calls[0][0];
      expect(call.id).toBeDefined();
      expect(call.vector).toBeDefined();
      expect(call.metadata.metadata.statistic).toBe('conversion_rate');
      expect(call.metadata.metadata.numericValue).toBe(3.5);
      expect(call.metadata.metadata.unit).toBe('percent');
      expect(call.metadata.metadata.topics).toEqual(['conversion', 'optimization']);
      expect(call.metadata.metadata.sourceName).toBe('industry_benchmark');
      expect(call.metadata.metadata.timeSensitive).toBe(false);
      expect(call.metadata.metadata.freshnessScore).toBe(1.0);
      expect(call.metadata.metadata.credibilityScore).toBe(0.92);
      expect(call.metadata.metadata.useCount).toBe(0);
      expect(call.metadata.metadata.articleIds).toEqual([]);

      expect(result.metadata.statistic).toBe('conversion_rate');
      expect(result.metadata.freshnessScore).toBe(1.0);
    });

    it('should embed statistic with generated text for semantic search', async () => {
      const input: StatisticInput = {
        statistic: 'bounce_rate',
        numericValue: 42,
        unit: 'percent',
        topics: ['bounce', 'rate'],
        sourceName: 'analytics',
        sourceUrl: 'https://example.com/analytics',
        publicationDate: mockedDate,
        timeSensitive: true,
        niche: 'general',
      };

      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      await collection.add(input);

      // Verify embedding was called (text includes statistic and value)
      expect(mockEmbeddingService).toHaveBeenCalled();
      expect(mockVectorDB.insert).toHaveBeenCalled();
    });

    it('should initialize freshness_score to 1.0 for new statistics', async () => {
      const input: StatisticInput = {
        statistic: 'ctr',
        numericValue: 2.8,
        unit: 'percent',
        topics: ['ctr'],
        sourceName: 'search_console',
        sourceUrl: 'https://example.com',
        publicationDate: mockedDate,
        timeSensitive: false,
        niche: 'seo',
      };

      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      const result = await collection.add(input);

      // Freshness should be 1.0 on creation
      expect(result.metadata.freshnessScore).toBe(1.0);
      expect(mockVectorDB.insert).toHaveBeenCalled();
      const call = (mockVectorDB.insert as jest.Mock).mock.calls[0][0];
      expect(call.metadata.metadata.freshnessScore).toBe(1.0);
    });

    it('should use default credibility of 0.7 if not provided', async () => {
      const input: StatisticInput = {
        statistic: 'avg_session_duration',
        numericValue: 245,
        unit: 'seconds',
        topics: ['session'],
        sourceName: 'analytics',
        sourceUrl: 'https://example.com',
        publicationDate: mockedDate,
        timeSensitive: false,
        niche: 'general',
        // credibilityScore not provided
      };

      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      const result = await collection.add(input);

      expect(result.metadata.credibilityScore).toBe(0.7);
    });

    it('should initialize articleIds as empty array', async () => {
      const input: StatisticInput = {
        statistic: 'test_metric',
        numericValue: 10,
        unit: 'unit',
        topics: ['test'],
        sourceName: 'source',
        sourceUrl: 'https://example.com',
        publicationDate: mockedDate,
        niche: 'test',
      };

      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      const result = await collection.add(input);

      expect(result.metadata.articleIds).toEqual([]);
    });
  });

  // ========================================================================
  // 2. update() - Update existing entries, merge article IDs
  // ========================================================================

  describe('update()', () => {
    it('should update existing statistic and merge articleIds', async () => {
      // GIVEN: An existing statistic
      const existingEntry = {
        id: 'stat-001',
        text: 'test',
        metadata: {
          statistic: 'conversion_rate',
          numericValue: 3.5,
          unit: 'percent',
          topics: ['conversion'],
          sourceName: 'benchmark',
          sourceUrl: 'https://example.com',
          publicationDate: new Date('2024-12-01'),
          credibilityScore: 0.92,
          timeSensitive: false,
          firstSeen: mockedDate,
          lastVerified: mockedDate,
          useCount: 0,
          articleIds: ['article-101'],
          freshnessScore: 1.0,
          niche: 'ecommerce',
        },
      };

      const updates: Partial<StatisticInput> & { articleIds?: string[] } = {
        numericValue: 3.8,
        articleIds: ['article-103'],
      };

      // WHEN: Updating the statistic
      mockVectorDB.search.mockResolvedValue([
        {
          score: 1.0,
          metadata: existingEntry,
        },
      ]);
      mockVectorDB.delete.mockResolvedValue(undefined);
      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      const result = await collection.update('stat-001', updates);

      // THEN: VectorDB.delete and insert called with merged articleIds
      expect(mockVectorDB.delete).toHaveBeenCalledWith('stat-001');
      expect(mockVectorDB.insert).toHaveBeenCalled();

      const call = (mockVectorDB.insert as jest.Mock).mock.calls[0][0];
      expect(call.id).toBe('stat-001');
      expect(call.metadata.metadata.numericValue).toBe(3.8);
      expect(call.metadata.metadata.articleIds).toContain('article-101');
      expect(call.metadata.metadata.articleIds).toContain('article-103');

      expect(result).not.toBeNull();
      expect(result?.metadata.articleIds).toContain('article-101');
      expect(result?.metadata.articleIds).toContain('article-103');
    });

    it('should remove duplicate articleIds when merging', async () => {
      const existingEntry = {
        id: 'stat-001',
        text: 'test',
        metadata: {
          statistic: 'bounce_rate',
          numericValue: 42,
          unit: 'percent',
          topics: ['bounce'],
          sourceName: 'analytics',
          sourceUrl: 'https://example.com',
          publicationDate: mockedDate,
          credibilityScore: 0.85,
          timeSensitive: false,
          firstSeen: mockedDate,
          lastVerified: mockedDate,
          useCount: 0,
          articleIds: ['article-101'],
          freshnessScore: 0.9,
          niche: 'general',
        },
      };

      const updates: Partial<StatisticInput> & { articleIds?: string[] } = {
        articleIds: ['article-101'], // duplicate
      };

      mockVectorDB.search.mockResolvedValue([
        {
          score: 1.0,
          metadata: existingEntry,
        },
      ]);
      mockVectorDB.delete.mockResolvedValue(undefined);
      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      await collection.update('stat-001', updates);

      // Verify only unique articleIds are kept (via Set)
      expect(mockVectorDB.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'stat-001',
          vector: expect.any(Float32Array),
          metadata: expect.any(Object),
        }),
      );
      // Verify the call was made and articleIds are uniquified
      const call = (mockVectorDB.insert as jest.Mock).mock.calls[0][0];
      expect(call.metadata.metadata.articleIds).toEqual(['article-101']);
    });

    it('should update credibilityScore if provided', async () => {
      const existingEntry = {
        id: 'stat-001',
        text: 'test',
        metadata: {
          statistic: 'ctr',
          numericValue: 2.8,
          unit: 'percent',
          topics: ['ctr'],
          sourceName: 'search_console',
          sourceUrl: 'https://example.com',
          publicationDate: mockedDate,
          credibilityScore: 0.80,
          timeSensitive: false,
          firstSeen: mockedDate,
          lastVerified: mockedDate,
          useCount: 0,
          articleIds: [],
          freshnessScore: 0.85,
          niche: 'seo',
        },
      };

      const updates: Partial<StatisticInput> = {
        credibilityScore: 0.95,
      };

      mockVectorDB.search.mockResolvedValue([
        {
          score: 1.0,
          metadata: existingEntry,
        },
      ]);
      mockVectorDB.delete.mockResolvedValue(undefined);
      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      const result = await collection.update('stat-001', updates);

      expect(mockVectorDB.insert).toHaveBeenCalled();
      const call = (mockVectorDB.insert as jest.Mock).mock.calls[0][0];
      expect(call.metadata.metadata.credibilityScore).toBe(0.95);
    });

    it('should return null for non-existent statistic', async () => {
      mockVectorDB.search.mockResolvedValue([]);

      const result = await collection.update('missing-id', { numericValue: 5 });

      expect(result).toBeNull();
      expect(mockVectorDB.delete).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 3. getById() - Retrieve by ID
  // ========================================================================

  describe('getById()', () => {
    it('should retrieve statistic by ID via search filter', async () => {
      // GIVEN: A stored statistic
      const storedEntry = {
        id: 'stat-001',
        text: 'conversion rate 3.5',
        metadata: {
          statistic: 'conversion_rate',
          numericValue: 3.5,
          unit: 'percent',
          topics: ['conversion'],
          sourceName: 'benchmark',
          sourceUrl: 'https://example.com',
          publicationDate: new Date('2024-12-01'),
          credibilityScore: 0.92,
          timeSensitive: false,
          firstSeen: mockedDate,
          lastVerified: mockedDate,
          useCount: 0,
          articleIds: [],
          freshnessScore: 0.95,
          niche: 'ecommerce',
        },
      };

      // WHEN: Retrieving by ID
      mockVectorDB.search.mockResolvedValue([
        {
          score: 1.0,
          metadata: storedEntry,
        },
      ]);

      const result = await collection.getById('stat-001');

      // THEN: Search called and result returned
      expect(mockVectorDB.search).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: expect.any(Float32Array),
          k: 1000,
          filter: expect.any(Function),
        }),
      );
      expect(result).toEqual(storedEntry);
    });

    it('should return null for missing statistic', async () => {
      mockVectorDB.search.mockResolvedValue([]);

      const result = await collection.getById('missing-id');

      expect(result).toBeNull();
    });

    it('should handle search errors gracefully by returning null', async () => {
      mockVectorDB.search.mockRejectedValue(new Error('Search failed'));

      const result = await collection.getById('stat-001');

      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // 4. search() - Semantic search with similarity, freshness, credibility
  // ========================================================================

  describe('search()', () => {
    it('should search with semantic similarity and default limit', async () => {
      // GIVEN: Search query and search results
      const query = 'bounce rate optimization';

      const searchResults = [
        {
          score: 0.92,
          metadata: {
            id: 'stat-001',
            text: 'bounce_rate 42',
            metadata: {
              statistic: 'bounce_rate',
              numericValue: 42,
              unit: 'percent',
              topics: ['bounce'],
              sourceName: 'analytics',
              sourceUrl: 'https://example.com',
              publicationDate: mockedDate,
              credibilityScore: 0.90,
              timeSensitive: false,
              firstSeen: mockedDate,
              lastVerified: mockedDate,
              useCount: 0,
              articleIds: [],
              freshnessScore: 0.85,
              niche: 'general',
            },
          },
        },
      ];

      // WHEN: Searching
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));
      mockVectorDB.search.mockResolvedValue(searchResults);

      const results = await collection.search(query);

      // THEN: EmbeddingService called and results returned
      expect(mockEmbeddingService).toHaveBeenCalledWith(query);
      expect(mockVectorDB.search).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: expect.any(Float32Array),
          k: 20, // default limit * 2
        }),
      );
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('entry');
      expect(results[0]).toHaveProperty('similarity');
    });

    it('should filter results by minSimilarity threshold', async () => {
      const query = 'conversion optimization';
      const minSimilarity = 0.8;

      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));
      mockVectorDB.search.mockResolvedValue([
        {
          score: 0.92,
          metadata: {
            id: 'stat-001',
            text: 'test',
            metadata: {
              statistic: 'conversion_rate',
              numericValue: 3.5,
              unit: 'percent',
              topics: ['conversion'],
              sourceName: 'benchmark',
              sourceUrl: 'https://example.com',
              publicationDate: mockedDate,
              credibilityScore: 0.92,
              timeSensitive: false,
              firstSeen: mockedDate,
              lastVerified: mockedDate,
              useCount: 0,
              articleIds: [],
              freshnessScore: 0.9,
              niche: 'ecommerce',
            },
          },
        },
        {
          score: 0.65, // Below threshold
          metadata: {
            id: 'stat-002',
            text: 'test',
            metadata: {
              statistic: 'bounce_rate',
              numericValue: 45,
              unit: 'percent',
              topics: ['bounce'],
              sourceName: 'analytics',
              sourceUrl: 'https://example.com',
              publicationDate: mockedDate,
              credibilityScore: 0.80,
              timeSensitive: false,
              firstSeen: mockedDate,
              lastVerified: mockedDate,
              useCount: 0,
              articleIds: [],
              freshnessScore: 0.5,
              niche: 'general',
            },
          },
        },
      ]);

      const results = await collection.search(query, { minSimilarity });

      // Only high-similarity result returned
      expect(results.every((r) => r.similarity >= minSimilarity)).toBe(true);
    });

    it('should filter results by minCredibilityScore', async () => {
      const query = 'ctr metrics';
      const minCredibilityScore = 0.85;

      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));
      mockVectorDB.search.mockResolvedValue([
        {
          score: 0.88,
          metadata: {
            id: 'stat-001',
            text: 'test',
            metadata: {
              statistic: 'ctr',
              numericValue: 3.0,
              unit: 'percent',
              topics: ['ctr'],
              sourceName: 'search_console',
              sourceUrl: 'https://example.com',
              publicationDate: mockedDate,
              credibilityScore: 0.92,
              timeSensitive: false,
              firstSeen: mockedDate,
              lastVerified: mockedDate,
              useCount: 0,
              articleIds: [],
              freshnessScore: 0.9,
              niche: 'seo',
            },
          },
        },
        {
          score: 0.80,
          metadata: {
            id: 'stat-002',
            text: 'test',
            metadata: {
              statistic: 'ctr',
              numericValue: 2.8,
              unit: 'percent',
              topics: ['ctr'],
              sourceName: 'analytics',
              sourceUrl: 'https://example.com',
              publicationDate: mockedDate,
              credibilityScore: 0.75, // Below threshold
              timeSensitive: false,
              firstSeen: mockedDate,
              lastVerified: mockedDate,
              useCount: 0,
              articleIds: [],
              freshnessScore: 0.85,
              niche: 'general',
            },
          },
        },
      ]);

      const results = await collection.search(query, { minCredibilityScore });

      expect(results.every((r) => r.entry.metadata.credibilityScore >= minCredibilityScore)).toBe(
        true,
      );
    });

    it('should filter results by minFreshnessScore', async () => {
      const query = 'fresh data';
      const minFreshnessScore = 0.75;

      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));
      mockVectorDB.search.mockResolvedValue([
        {
          score: 0.92,
          metadata: {
            id: 'stat-001',
            text: 'test',
            metadata: {
              statistic: 'metric1',
              numericValue: 10,
              unit: 'unit1',
              topics: ['test'],
              sourceName: 'source1',
              sourceUrl: 'https://example.com',
              publicationDate: mockedDate,
              credibilityScore: 0.90,
              timeSensitive: false,
              firstSeen: mockedDate,
              lastVerified: mockedDate,
              useCount: 0,
              articleIds: [],
              freshnessScore: 0.88,
              niche: 'general',
            },
          },
        },
      ]);

      const results = await collection.search(query, { minFreshnessScore });

      expect(results.every((r) => r.entry.metadata.freshnessScore >= minFreshnessScore)).toBe(
        true,
      );
    });

    it('should filter by niche when specified', async () => {
      const query = 'ecommerce metrics';
      const niche = 'ecommerce';

      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));
      mockVectorDB.search.mockResolvedValue([
        {
          score: 0.92,
          metadata: {
            id: 'stat-001',
            text: 'test',
            metadata: {
              statistic: 'conversion_rate',
              numericValue: 3.5,
              unit: 'percent',
              topics: ['conversion'],
              sourceName: 'benchmark',
              sourceUrl: 'https://example.com',
              publicationDate: mockedDate,
              credibilityScore: 0.92,
              timeSensitive: false,
              firstSeen: mockedDate,
              lastVerified: mockedDate,
              useCount: 0,
              articleIds: [],
              freshnessScore: 0.9,
              niche: 'ecommerce',
            },
          },
        },
        {
          score: 0.85,
          metadata: {
            id: 'stat-002',
            text: 'test',
            metadata: {
              statistic: 'bounce_rate',
              numericValue: 45,
              unit: 'percent',
              topics: ['bounce'],
              sourceName: 'analytics',
              sourceUrl: 'https://example.com',
              publicationDate: mockedDate,
              credibilityScore: 0.85,
              timeSensitive: false,
              firstSeen: mockedDate,
              lastVerified: mockedDate,
              useCount: 0,
              articleIds: [],
              freshnessScore: 0.85,
              niche: 'saas', // Different niche
            },
          },
        },
      ]);

      const results = await collection.search(query, { niche, includeCrossNiche: false });

      // All results should match niche
      expect(results.every((r) => r.entry.metadata.niche === niche)).toBe(true);
    });

    it('should respect limit option', async () => {
      const query = 'test';
      const limit = 5;

      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));
      mockVectorDB.search.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({
          score: 0.9 - i * 0.01,
          metadata: {
            id: `stat-${i}`,
            text: 'test',
            metadata: {
              statistic: `metric${i}`,
              numericValue: i,
              unit: 'unit',
              topics: ['test'],
              sourceName: 'source',
              sourceUrl: 'https://example.com',
              publicationDate: mockedDate,
              credibilityScore: 0.85,
              timeSensitive: false,
              firstSeen: mockedDate,
              lastVerified: mockedDate,
              useCount: 0,
              articleIds: [],
              freshnessScore: 0.85,
              niche: 'general',
            },
          },
        })),
      );

      const results = await collection.search(query, { limit });

      expect(results.length).toBeLessThanOrEqual(limit);
    });
  });

  // ========================================================================
  // 5. findByTopic() - Topic-based search
  // ========================================================================

  describe('findByTopic()', () => {
    it('should find statistics by topic via search', async () => {
      const topic = 'conversion_optimization';

      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));
      mockVectorDB.search.mockResolvedValue([
        {
          score: 0.90,
          metadata: {
            id: 'stat-001',
            text: 'test',
            metadata: {
              statistic: 'conversion_rate',
              numericValue: 3.5,
              unit: 'percent',
              topics: ['conversion', 'optimization'],
              sourceName: 'benchmark',
              sourceUrl: 'https://example.com',
              publicationDate: mockedDate,
              credibilityScore: 0.92,
              timeSensitive: false,
              firstSeen: mockedDate,
              lastVerified: mockedDate,
              useCount: 0,
              articleIds: [],
              freshnessScore: 0.9,
              niche: 'ecommerce',
            },
          },
        },
      ]);

      const results = await collection.findByTopic(topic);

      // Should call search with "Statistics about {topic}"
      expect(mockEmbeddingService).toHaveBeenCalledWith(`Statistics about ${topic}`);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-existent topic', async () => {
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));
      mockVectorDB.search.mockResolvedValue([]);

      const results = await collection.findByTopic('nonexistent_topic');

      expect(results).toEqual([]);
    });
  });

  // ========================================================================
  // 6. recordUsage() - Usage tracking
  // ========================================================================

  describe('recordUsage()', () => {
    it('should increment usage via update with articleId', async () => {
      const existingEntry = {
        id: 'stat-001',
        text: 'test',
        metadata: {
          statistic: 'bounce_rate',
          numericValue: 42,
          unit: 'percent',
          topics: ['bounce'],
          sourceName: 'analytics',
          sourceUrl: 'https://example.com',
          publicationDate: new Date('2025-01-14'),
          credibilityScore: 0.90,
          timeSensitive: false,
          firstSeen: new Date('2025-01-14'),
          lastVerified: new Date('2025-01-14'),
          useCount: 5,
          articleIds: ['article-001'],
          freshnessScore: 0.85,
          niche: 'general',
        },
      };

      mockVectorDB.search.mockResolvedValue([
        {
          score: 1.0,
          metadata: existingEntry,
        },
      ]);
      mockVectorDB.delete.mockResolvedValue(undefined);
      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      await collection.recordUsage('stat-001', 'article-new');

      // Update should be called with articleIds
      expect(mockVectorDB.delete).toHaveBeenCalledWith('stat-001');
      expect(mockVectorDB.insert).toHaveBeenCalled();
      const call = (mockVectorDB.insert as jest.Mock).mock.calls[0][0];
      expect(call.metadata.metadata.articleIds).toContain('article-001');
      expect(call.metadata.metadata.articleIds).toContain('article-new');
    });

    it('should return early if statistic not found', async () => {
      mockVectorDB.search.mockResolvedValue([]);

      await collection.recordUsage('missing-id', 'article-id');

      expect(mockVectorDB.delete).not.toHaveBeenCalled();
      expect(mockVectorDB.insert).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 7. verify() - Re-verify statistic
  // ========================================================================

  describe('verify()', () => {
    it('should update verified flag via update', async () => {
      const existingEntry = {
        id: 'stat-001',
        text: 'test',
        metadata: {
          statistic: 'bounce_rate',
          numericValue: 42,
          unit: 'percent',
          topics: ['bounce'],
          sourceName: 'analytics',
          sourceUrl: 'https://example.com',
          publicationDate: new Date('2024-10-17'),
          credibilityScore: 0.90,
          timeSensitive: false,
          firstSeen: new Date('2024-10-17'),
          lastVerified: new Date('2024-10-17'),
          useCount: 0,
          articleIds: [],
          freshnessScore: 0.5,
          niche: 'general',
        },
      };

      mockVectorDB.search.mockResolvedValue([
        {
          score: 1.0,
          metadata: existingEntry,
        },
      ]);
      mockVectorDB.delete.mockResolvedValue(undefined);
      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      await collection.verify('stat-001');

      // Update should be called with verified flag
      expect(mockVectorDB.delete).toHaveBeenCalledWith('stat-001');
      expect(mockVectorDB.insert).toHaveBeenCalled();
    });

    it('should return early if statistic not found (idempotent)', async () => {
      mockVectorDB.search.mockResolvedValue([]);

      await collection.verify('missing-id');

      expect(mockVectorDB.delete).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 8. updateCredibilityScore() - Credibility score adjustment
  // ========================================================================

  describe('updateCredibilityScore()', () => {
    it('should update credibility_score via weighted average', async () => {
      const existingEntry = {
        id: 'stat-001',
        text: 'test',
        metadata: {
          statistic: 'bounce_rate',
          numericValue: 42,
          unit: 'percent',
          topics: ['bounce'],
          sourceName: 'analytics',
          sourceUrl: 'https://example.com',
          publicationDate: mockedDate,
          credibilityScore: 0.80,
          timeSensitive: false,
          firstSeen: mockedDate,
          lastVerified: mockedDate,
          useCount: 0,
          articleIds: [],
          freshnessScore: 0.85,
          niche: 'general',
        },
      };

      mockVectorDB.search.mockResolvedValue([
        {
          score: 1.0,
          metadata: existingEntry,
        },
      ]);
      mockVectorDB.delete.mockResolvedValue(undefined);
      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      // performanceScore = 0.9, weight = 0.1
      // newScore = 0.9 * 0.80 + 0.1 * 0.9 = 0.72 + 0.09 = 0.81
      await collection.updateCredibilityScore('stat-001', 0.9, 0.1);

      expect(mockVectorDB.delete).toHaveBeenCalledWith('stat-001');
      expect(mockVectorDB.insert).toHaveBeenCalled();
      const call = (mockVectorDB.insert as jest.Mock).mock.calls[0][0];
      expect(call.metadata.metadata.credibilityScore).toBeCloseTo(0.81, 1);
    });

    it('should clamp performance score to [0.0, 1.0]', async () => {
      const existingEntry = {
        id: 'stat-001',
        text: 'test',
        metadata: {
          statistic: 'metric1',
          numericValue: 10,
          unit: 'unit',
          topics: ['test'],
          sourceName: 'source',
          sourceUrl: 'https://example.com',
          publicationDate: mockedDate,
          credibilityScore: 0.85,
          timeSensitive: false,
          firstSeen: mockedDate,
          lastVerified: mockedDate,
          useCount: 0,
          articleIds: [],
          freshnessScore: 0.9,
          niche: 'general',
        },
      };

      mockVectorDB.search.mockResolvedValue([
        {
          score: 1.0,
          metadata: existingEntry,
        },
      ]);
      mockVectorDB.delete.mockResolvedValue(undefined);
      mockVectorDB.insert.mockResolvedValue(undefined);
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      // performanceScore = 1.5 (clamped to 1.0)
      await collection.updateCredibilityScore('stat-001', 1.5, 0.1);

      expect(mockVectorDB.insert).toHaveBeenCalled();
      const call = (mockVectorDB.insert as jest.Mock).mock.calls[0][0];
      // newScore = (1-0.1)*0.85 + 0.1*1.0 = 0.9*0.85 + 0.1 = 0.765 + 0.1 = 0.865
      expect(call.metadata.metadata.credibilityScore).toBeCloseTo(0.865, 2);
    });

    it('should return early if statistic not found', async () => {
      mockVectorDB.search.mockResolvedValue([]);

      await collection.updateCredibilityScore('missing-id', 0.9);

      expect(mockVectorDB.delete).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 9. delete() - Delete a statistic
  // ========================================================================

  describe('delete()', () => {
    it('should delete statistic by ID via VectorDB', async () => {
      mockVectorDB.delete.mockResolvedValue(undefined);

      const result = await collection.delete('stat-001');

      expect(mockVectorDB.delete).toHaveBeenCalledWith('stat-001');
      expect(result).toBe(true);
    });

    it('should return false if deletion fails', async () => {
      mockVectorDB.delete.mockRejectedValue(new Error('Delete failed'));

      const result = await collection.delete('stat-001');

      expect(result).toBe(false);
    });
  });

  // ========================================================================
  // 10. getStaleEntries() - Find stale statistics
  // ========================================================================

  describe('getStaleEntries()', () => {
    it('should find statistics below freshness threshold', async () => {
      const staleEntry = {
        id: 'stat-001',
        text: 'test',
        metadata: {
          statistic: 'old_metric',
          numericValue: 10,
          unit: 'unit',
          topics: ['test'],
          sourceName: 'source',
          sourceUrl: 'https://example.com',
          publicationDate: mockedDate,
          credibilityScore: 0.85,
          timeSensitive: false,
          firstSeen: new Date('2024-01-01'),
          lastVerified: new Date('2024-01-01'),
          useCount: 0,
          articleIds: [],
          freshnessScore: 0.2, // Very stale
          niche: 'general',
        },
      };

      mockVectorDB.search.mockResolvedValue([
        {
          score: 0.85,
          metadata: staleEntry,
        },
      ]);

      const results = await collection.getStaleEntries(0.3);

      expect(mockVectorDB.search).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: expect.any(Float32Array),
          k: 1000,
        }),
      );
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array if no stale entries', async () => {
      mockVectorDB.search.mockResolvedValue([]);

      const results = await collection.getStaleEntries(0.5);

      expect(results).toEqual([]);
    });
  });

  // ========================================================================
  // 11. Error Handling
  // ========================================================================

  describe('Error handling', () => {
    it('should handle VectorDB insert errors', async () => {
      mockVectorDB.insert.mockRejectedValue(new Error('VectorDB connection failed'));
      mockEmbeddingService.mockReturnValue(new Float32Array(1536).fill(0.5));

      const input: StatisticInput = {
        statistic: 'metric1',
        numericValue: 10,
        unit: 'unit',
        topics: ['test'],
        sourceName: 'source',
        sourceUrl: 'https://example.com',
        publicationDate: mockedDate,
        niche: 'general',
      };

      await expect(collection.add(input)).rejects.toThrow('VectorDB connection failed');
    });

    it('should handle embedding service errors', async () => {
      mockEmbeddingService.mockRejectedValue(new Error('Embedding service unavailable'));

      const input: StatisticInput = {
        statistic: 'metric1',
        numericValue: 10,
        unit: 'unit',
        topics: ['test'],
        sourceName: 'source',
        sourceUrl: 'https://example.com',
        publicationDate: mockedDate,
        niche: 'general',
      };

      await expect(collection.add(input)).rejects.toThrow('Embedding service unavailable');
    });
  });
});
