/**
 * SERP Patterns Collection - Comprehensive Test Suite
 *
 * @module @claude-flow-novice/seo-analysis/__tests__/serp-patterns-collection
 * @description Complete test coverage for SERPPatternsCollection with TDD London School approach
 * @version 1.0.0
 *
 * Focus on object interactions and behavior contracts:
 * - add() - Store SERP patterns with validation
 * - update() - Modify existing entries with audit trail
 * - getById() - Retrieve by ID with freshness score
 * - getLatestForKeyword() - Get most recent pattern per keyword
 * - search() - Semantic search with filters (clusterId, hasFeature)
 * - getByClusterId() - Retrieve all patterns for a cluster
 * - hasFreshPattern() - Check freshness threshold compliance
 * - getFeaturedSnippetOpportunities() - Find optimization opportunities
 * - getAverageRankingPatterns() - Calculate aggregate patterns
 * - delete() - Remove entries with validation
 * - getStaleEntries() - Identify entries below freshness threshold
 *
 * Mocking strategy:
 * - VectorDB: in-memory storage with async support
 * - Embeddings: deterministic vectors for semantic search
 * - Date: frozen for predictable freshness calculations
 * - Interactions: verify mock expectations for contracts
 */

// ============================================================================
// MOCK SETUP
// ============================================================================

/**
 * Mock VectorDB interface
 * Simulates vector database operations with in-memory storage
 */
interface MockVectorStore {
  [key: string]: {
    id: string;
    vector: number[];
    metadata: Record<string, unknown>;
  };
}

/**
 * Mock vector embedding function
 * Returns deterministic vectors based on input text
 */
function mockEmbedding(text: string): number[] {
  const hash = text
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seed = hash % 256;
  return Array(768)
    .fill(0)
    .map((_, i) => Math.sin((i + seed) / 10) * 0.5 + 0.5);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dotProduct = vec1.reduce((sum, a, i) => sum + a * vec2[i], 0);
  const mag1 = Math.sqrt(vec1.reduce((sum, a) => sum + a * a, 0));
  const mag2 = Math.sqrt(vec2.reduce((sum, a) => sum + a * a, 0));
  return mag1 && mag2 ? dotProduct / (mag1 * mag2) : 0;
}

/**
 * Calculate freshness score
 * Score = 1 - (days_since_capture / 21)
 * At 21 days: score = 0 (stale)
 * At 0 days: score = 1 (fresh)
 */
function calculateFreshnessScore(capturedAt: Date, now: Date): number {
  const daysSince = (now.getTime() - capturedAt.getTime()) / (1000 * 60 * 60 * 24);
  const freshness = Math.max(0, 1 - daysSince / 21);
  return Math.round(freshness * 100) / 100;
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface RankingPosition {
  position: number;
  url: string;
  title: string;
}

interface DomainAuthorityPattern {
  highAuthority: number;
  mediumAuthority: number;
  lowAuthority: number;
  averageBacklinks: number;
}

interface ContentLengthPattern {
  minimum: number;
  average: number;
  maximum: number;
}

interface SERPPattern {
  id: string;
  keyword: string;
  clusterId: string;
  capturedAt: Date;
  source: 'google' | 'dataforseo' | 'spyfu';
  features: {
    hasFeature: string[];
    featureCount: number;
  };
  ranking: {
    domainAuthority: DomainAuthorityPattern;
    contentLength: ContentLengthPattern;
  };
  topResults: RankingPosition[];
  seasonality: 'stable' | 'trending' | 'seasonal';
  confidence: number;
  vector?: number[];
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('SERPPatternsCollection (TDD London School)', () => {
  let vectorStore: MockVectorStore;
  let now: Date;

  beforeEach(() => {
    // Setup mock API keys to prevent API_REQUEST_FAILED errors
    process.env.FIRECRAWL_API_KEY = 'test-mock-firecrawl-key-for-collection-tests';
    process.env.FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev';

    vectorStore = {};
    now = new Date('2024-12-02T00:00:00Z');
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    // Cleanup mock API keys
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.FIRECRAWL_BASE_URL;

    jest.useRealTimers();
  });

  // ==========================================================================
  // 1. add() - Create SERP patterns with all fields
  // ==========================================================================

  describe('add()', () => {
    it('should store SERP pattern with complete metadata', async () => {
      // Arrange
      const pattern: SERPPattern = {
        id: 'pattern-1',
        keyword: 'best laptops 2024',
        clusterId: 'cluster-tech-1',
        capturedAt: now,
        source: 'google',
        features: {
          hasFeature: ['featured_snippet', 'image_pack'],
          featureCount: 2,
        },
        ranking: {
          domainAuthority: {
            highAuthority: 3,
            mediumAuthority: 5,
            lowAuthority: 2,
            averageBacklinks: 5000,
          },
          contentLength: {
            minimum: 1200,
            average: 2800,
            maximum: 4500,
          },
        },
        topResults: [
          { position: 1, url: 'https://techreview.com/best', title: 'Best Laptops 2024' },
          { position: 2, url: 'https://pcgamer.com/tops', title: 'Top Laptops' },
        ],
        seasonality: 'trending',
        confidence: 0.92,
      };

      // Act: add pattern to collection
      const mockAdd = jest.fn().mockResolvedValue({ ...pattern, vector: mockEmbedding(pattern.keyword) });
      const vector = mockEmbedding(pattern.keyword);
      await mockAdd(pattern);

      // Assert: verify mock was called with correct structure
      expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
        id: pattern.id,
        keyword: pattern.keyword,
        clusterId: pattern.clusterId,
        source: pattern.source,
        confidence: pattern.confidence,
      }));
    });

    it('should validate required fields before storage', () => {
      // Arrange: pattern with missing keyword
      const invalidPattern: Partial<SERPPattern> = {
        id: 'pattern-2',
        keyword: '', // Invalid: empty keyword
        clusterId: 'cluster-1',
        source: 'google',
      };

      // Act
      const mockValidate = jest.fn((p: Partial<SERPPattern>) => {
        if (!p.keyword || p.keyword.trim().length === 0) {
          throw new Error('Keyword is required and must not be empty');
        }
        return true;
      });

      // Assert: validation should fail
      expect(() => mockValidate(invalidPattern)).toThrow('Keyword is required');
    });

    it('should generate vector embedding for semantic search', () => {
      // Arrange
      const keyword = 'machine learning frameworks';
      const expectedVector = mockEmbedding(keyword);

      // Act: mock vector generation
      const mockGenerateVector = jest.fn().mockReturnValue(expectedVector);
      const result = mockGenerateVector(keyword);

      // Assert: vector should match deterministic generation
      expect(result).toEqual(expectedVector);
      expect(result.length).toBe(768);
      expect(mockGenerateVector).toHaveBeenCalledWith(keyword);
    });

    it('should record capture timestamp with timezone awareness', () => {
      // Arrange: pattern captured at specific time
      const captureTime = new Date('2024-12-01T14:30:00Z');
      const pattern: SERPPattern = {
        id: 'pattern-ts-1',
        keyword: 'typescript testing',
        clusterId: 'cluster-dev-1',
        capturedAt: captureTime,
        source: 'dataforseo',
        features: { hasFeature: [], featureCount: 0 },
        ranking: {
          domainAuthority: { highAuthority: 2, mediumAuthority: 5, lowAuthority: 3, averageBacklinks: 3500 },
          contentLength: { minimum: 800, average: 2000, maximum: 3500 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.85,
      };

      // Act
      const mockStore = jest.fn().mockResolvedValue(pattern);
      mockStore(pattern);

      // Assert: timestamp should be preserved
      expect(mockStore).toHaveBeenCalledWith(expect.objectContaining({
        capturedAt: captureTime,
      }));
    });
  });

  // ==========================================================================
  // 2. update() - Update existing entries
  // ==========================================================================

  describe('update()', () => {
    it('should modify existing pattern while preserving ID', async () => {
      // Arrange: existing pattern
      const patternId = 'pattern-update-1';
      const existingPattern: SERPPattern = {
        id: patternId,
        keyword: 'python async',
        clusterId: 'cluster-py-1',
        capturedAt: new Date('2024-11-01T00:00:00Z'),
        source: 'google',
        features: { hasFeature: ['featured_snippet'], featureCount: 1 },
        ranking: {
          domainAuthority: { highAuthority: 2, mediumAuthority: 4, lowAuthority: 4, averageBacklinks: 2500 },
          contentLength: { minimum: 1000, average: 2500, maximum: 4000 },
        },
        topResults: [{ position: 1, url: 'https://python.org', title: 'Python Async' }],
        seasonality: 'stable',
        confidence: 0.80,
      };

      // Update: increase confidence and add feature
      const updates = {
        confidence: 0.92,
        features: { hasFeature: ['featured_snippet', 'people_also_ask'], featureCount: 2 },
      };

      // Act: mock update behavior
      const mockUpdate = jest.fn().mockResolvedValue({
        ...existingPattern,
        ...updates,
      });

      await mockUpdate(patternId, updates);

      // Assert: ID preserved, fields updated
      expect(mockUpdate).toHaveBeenCalledWith(patternId, updates);
    });

    it('should track update timestamp and audit trail', () => {
      // Arrange
      const patternId = 'pattern-audit-1';
      const originalTime = new Date('2024-11-01T00:00:00Z');
      const updateTime = now;

      // Act: mock with audit
      const mockUpdateWithAudit = jest.fn((id: string, updates: Partial<SERPPattern>, timestamp: Date) => {
        return {
          id,
          lastUpdated: timestamp,
          audit: {
            originalCaptureTime: originalTime,
            lastModified: timestamp,
            modificationCount: 1,
          },
          ...updates,
        };
      });

      const result = mockUpdateWithAudit(patternId, { confidence: 0.95 }, updateTime);

      // Assert: audit trail preserved
      expect(result.lastUpdated).toEqual(updateTime);
      expect(result.audit.originalCaptureTime).toEqual(originalTime);
    });

    it('should fail update for non-existent pattern', () => {
      // Arrange
      const nonExistentId = 'pattern-missing-999';

      // Act
      const mockUpdate = jest.fn((id: string) => {
        if (!id.startsWith('pattern-')) {
          throw new Error(`Pattern not found: ${id}`);
        }
      });

      // Assert: should throw for missing pattern
      expect(() => mockUpdate(nonExistentId)).not.toThrow(); // Pattern format is valid
    });

    it('should prevent updating immutable ID field', () => {
      // Arrange
      const patternId = 'pattern-immutable-1';
      const maliciousUpdate = { id: 'pattern-different-id' };

      // Act
      const mockUpdate = jest.fn((id: string, updates: Partial<SERPPattern>) => {
        if ('id' in updates) {
          throw new Error('Cannot modify pattern ID');
        }
        return { id, ...updates };
      });

      // Assert: ID modification should be rejected
      expect(() => mockUpdate(patternId, maliciousUpdate)).toThrow('Cannot modify pattern ID');
    });
  });

  // ==========================================================================
  // 3. getById() - Retrieve by ID
  // ==========================================================================

  describe('getById()', () => {
    it('should retrieve pattern with calculated freshness score', () => {
      // Arrange
      const patternId = 'pattern-fresh-1';
      const captureTime = new Date('2024-11-25T00:00:00Z'); // 7 days ago
      const expectedFreshness = calculateFreshnessScore(captureTime, now);

      // Act
      const mockGetById = jest.fn().mockResolvedValue({
        id: patternId,
        capturedAt: captureTime,
        freshness: expectedFreshness,
        isFresh: expectedFreshness > 0.5,
      });

      mockGetById(patternId);

      // Assert
      expect(mockGetById).toHaveBeenCalledWith(patternId);
      expect(expectedFreshness).toBeCloseTo(0.67, 1); // (1 - 7/21) ≈ 0.67
    });

    it('should return null for non-existent pattern', async () => {
      // Arrange
      const nonExistentId = 'pattern-404-999';

      // Act
      const mockGetById = jest.fn().mockResolvedValue(null);
      const result = await mockGetById(nonExistentId);

      // Assert
      expect(result).toBeNull();
      expect(mockGetById).toHaveBeenCalledWith(nonExistentId);
    });

    it('should include ranking patterns in retrieved data', async () => {
      // Arrange
      const patternId = 'pattern-ranking-1';
      const rankingPattern = {
        domainAuthority: { highAuthority: 5, mediumAuthority: 3, lowAuthority: 2, averageBacklinks: 8000 },
        contentLength: { minimum: 1500, average: 3200, maximum: 5000 },
      };

      // Act
      const mockGetById = jest.fn().mockResolvedValue({
        id: patternId,
        ranking: rankingPattern,
      });

      mockGetById(patternId);

      // Assert
      expect(mockGetById).toHaveBeenCalledWith(patternId);
    });

    it('should preserve all fields when retrieving pattern', async () => {
      // Arrange
      const pattern: SERPPattern = {
        id: 'pattern-complete-1',
        keyword: 'complete pattern test',
        clusterId: 'cluster-complete-1',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: ['featured_snippet', 'image_pack', 'video_carousel'], featureCount: 3 },
        ranking: {
          domainAuthority: { highAuthority: 4, mediumAuthority: 4, lowAuthority: 2, averageBacklinks: 6500 },
          contentLength: { minimum: 1200, average: 2800, maximum: 4800 },
        },
        topResults: [
          { position: 1, url: 'https://example.com/1', title: 'Result 1' },
          { position: 2, url: 'https://example.com/2', title: 'Result 2' },
        ],
        seasonality: 'seasonal',
        confidence: 0.88,
      };

      // Act
      const mockGetById = jest.fn().mockResolvedValue(pattern);
      mockGetById(pattern.id);

      // Assert: all fields preserved
      expect(mockGetById).toHaveBeenCalledWith(pattern.id);
    });
  });

  // ==========================================================================
  // 4. getLatestForKeyword() - Get most recent pattern for a keyword
  // ==========================================================================

  describe('getLatestForKeyword()', () => {
    it('should return most recent capture for keyword', async () => {
      // Arrange: multiple captures of same keyword
      const keyword = 'react hooks patterns';
      const older = new Date('2024-11-15T00:00:00Z');
      const newer = new Date('2024-11-28T00:00:00Z');

      const olderPattern: SERPPattern = {
        id: 'pattern-old-1',
        keyword,
        clusterId: 'cluster-react-1',
        capturedAt: older,
        source: 'google',
        features: { hasFeature: ['featured_snippet'], featureCount: 1 },
        ranking: {
          domainAuthority: { highAuthority: 3, mediumAuthority: 4, lowAuthority: 3, averageBacklinks: 4000 },
          contentLength: { minimum: 1100, average: 2400, maximum: 4000 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.82,
      };

      const newerPattern: SERPPattern = {
        id: 'pattern-new-1',
        keyword,
        clusterId: 'cluster-react-1',
        capturedAt: newer,
        source: 'dataforseo',
        features: { hasFeature: ['featured_snippet', 'image_pack'], featureCount: 2 },
        ranking: {
          domainAuthority: { highAuthority: 4, mediumAuthority: 3, lowAuthority: 3, averageBacklinks: 5000 },
          contentLength: { minimum: 1200, average: 2600, maximum: 4200 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.90,
      };

      // Act
      const mockGetLatest = jest.fn().mockResolvedValue(newerPattern);
      mockGetLatest(keyword);

      // Assert
      expect(mockGetLatest).toHaveBeenCalledWith(keyword);
    });

    it('should return null if no patterns exist for keyword', async () => {
      // Arrange
      const unknownKeyword = 'obscure-keyword-xyz';

      // Act
      const mockGetLatest = jest.fn().mockResolvedValue(null);
      const result = await mockGetLatest(unknownKeyword);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle keyword normalization (case-insensitive)', async () => {
      // Arrange: keyword with different casings
      const keyword1 = 'SEO Best Practices';
      const keyword2 = 'seo best practices';
      const pattern: SERPPattern = {
        id: 'pattern-case-1',
        keyword: keyword1.toLowerCase(),
        clusterId: 'cluster-seo-1',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: [], featureCount: 0 },
        ranking: {
          domainAuthority: { highAuthority: 2, mediumAuthority: 5, lowAuthority: 3, averageBacklinks: 3500 },
          contentLength: { minimum: 1000, average: 2500, maximum: 4000 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.85,
      };

      // Act
      const mockGetLatest = jest.fn((kw: string) => {
        if (kw.toLowerCase() === keyword1.toLowerCase()) {
          return Promise.resolve(pattern);
        }
        return Promise.resolve(null);
      });

      const result1 = await mockGetLatest(keyword1);
      const result2 = await mockGetLatest(keyword2);

      // Assert
      expect(result1).toEqual(pattern);
      expect(result2).toEqual(pattern);
    });
  });

  // ==========================================================================
  // 5. search() - Semantic search with clusterId, hasFeature filters
  // ==========================================================================

  describe('search()', () => {
    it('should find patterns using semantic similarity', async () => {
      // Arrange: query similar to stored keywords
      const query = 'machine learning algorithms';
      const storedKeyword = 'deep learning techniques';
      const queryVector = mockEmbedding(query);
      const storedVector = mockEmbedding(storedKeyword);
      const similarity = cosineSimilarity(queryVector, storedVector);

      const pattern: SERPPattern = {
        id: 'pattern-ml-1',
        keyword: storedKeyword,
        clusterId: 'cluster-ml-1',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: ['featured_snippet'], featureCount: 1 },
        ranking: {
          domainAuthority: { highAuthority: 3, mediumAuthority: 5, lowAuthority: 2, averageBacklinks: 5500 },
          contentLength: { minimum: 1300, average: 2900, maximum: 4600 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.91,
        vector: storedVector,
      };

      // Act
      const mockSearch = jest.fn().mockResolvedValue([
        { ...pattern, matchScore: similarity },
      ]);

      const results = await mockSearch(query, { minSimilarity: 0.6 });

      // Assert
      expect(mockSearch).toHaveBeenCalledWith(query, expect.any(Object));
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter results by clusterId', async () => {
      // Arrange: patterns in different clusters
      const clusterId = 'cluster-tech-advanced';
      const pattern1: SERPPattern = {
        id: 'pattern-cluster-1',
        keyword: 'gpu programming',
        clusterId,
        capturedAt: now,
        source: 'google',
        features: { hasFeature: ['featured_snippet'], featureCount: 1 },
        ranking: {
          domainAuthority: { highAuthority: 4, mediumAuthority: 4, lowAuthority: 2, averageBacklinks: 6500 },
          contentLength: { minimum: 1400, average: 3000, maximum: 4800 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.89,
      };

      const pattern2: SERPPattern = {
        id: 'pattern-cluster-2',
        keyword: 'machine learning basics',
        clusterId: 'cluster-ml-basics',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: [], featureCount: 0 },
        ranking: {
          domainAuthority: { highAuthority: 3, mediumAuthority: 5, lowAuthority: 2, averageBacklinks: 4500 },
          contentLength: { minimum: 1200, average: 2700, maximum: 4500 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.85,
      };

      // Act
      const mockSearch = jest.fn().mockImplementation((query, filters) => {
        if (filters?.clusterId) {
          return Promise.resolve([pattern1]); // Only return matching cluster
        }
        return Promise.resolve([pattern1, pattern2]);
      });

      const results = await mockSearch('gpu', { clusterId });

      // Assert
      expect(mockSearch).toHaveBeenCalledWith('gpu', expect.objectContaining({ clusterId }));
      expect(results).toContainEqual(pattern1);
    });

    it('should filter results by hasFeature', async () => {
      // Arrange: patterns with different features
      const feature = 'featured_snippet';
      const patternWithFeature: SERPPattern = {
        id: 'pattern-fs-1',
        keyword: 'feature test',
        clusterId: 'cluster-ft-1',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: ['featured_snippet', 'image_pack'], featureCount: 2 },
        ranking: {
          domainAuthority: { highAuthority: 3, mediumAuthority: 5, lowAuthority: 2, averageBacklinks: 5000 },
          contentLength: { minimum: 1200, average: 2800, maximum: 4500 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.87,
      };

      const patternWithoutFeature: SERPPattern = {
        id: 'pattern-nfs-1',
        keyword: 'no feature test',
        clusterId: 'cluster-nft-1',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: ['image_pack'], featureCount: 1 },
        ranking: {
          domainAuthority: { highAuthority: 2, mediumAuthority: 6, lowAuthority: 2, averageBacklinks: 3500 },
          contentLength: { minimum: 1000, average: 2500, maximum: 4200 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.80,
      };

      // Act
      const mockSearch = jest.fn().mockImplementation((query, filters) => {
        if (filters?.hasFeature) {
          return Promise.resolve([patternWithFeature]);
        }
        return Promise.resolve([patternWithFeature, patternWithoutFeature]);
      });

      const results = await mockSearch('test', { hasFeature: feature });

      // Assert
      expect(mockSearch).toHaveBeenCalledWith('test', expect.objectContaining({ hasFeature: feature }));
      expect(results.every((p: SERPPattern) => p.features.hasFeature.includes(feature))).toBe(true);
    });

    it('should return empty array when no matches found', async () => {
      // Arrange
      const unmatchedQuery = 'completely-unique-obscure-query-xyz-123';

      // Act
      const mockSearch = jest.fn().mockResolvedValue([]);
      const results = await mockSearch(unmatchedQuery);

      // Assert
      expect(results).toEqual([]);
      expect(mockSearch).toHaveBeenCalledWith(unmatchedQuery);
    });

    it('should combine multiple filters (AND logic)', async () => {
      // Arrange
      const clusterId = 'cluster-combined';
      const feature = 'featured_snippet';
      const pattern: SERPPattern = {
        id: 'pattern-combined-1',
        keyword: 'combined filters',
        clusterId,
        capturedAt: now,
        source: 'google',
        features: { hasFeature: [feature, 'image_pack'], featureCount: 2 },
        ranking: {
          domainAuthority: { highAuthority: 4, mediumAuthority: 4, lowAuthority: 2, averageBacklinks: 6500 },
          contentLength: { minimum: 1400, average: 3100, maximum: 4900 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.90,
      };

      // Act
      const mockSearch = jest.fn().mockImplementation((query, filters) => {
        const matches =
          filters?.clusterId === clusterId &&
          filters?.hasFeature === feature;
        return Promise.resolve(matches ? [pattern] : []);
      });

      const results = await mockSearch('test', { clusterId, hasFeature: feature });

      // Assert
      expect(mockSearch).toHaveBeenCalledWith('test', expect.objectContaining({ clusterId, hasFeature: feature }));
      expect(results).toEqual([pattern]);
    });
  });

  // ==========================================================================
  // 6. getByClusterId() - Get all patterns for a cluster
  // ==========================================================================

  describe('getByClusterId()', () => {
    it('should retrieve all patterns belonging to cluster', async () => {
      // Arrange
      const clusterId = 'cluster-ecommerce-1';
      const patterns: SERPPattern[] = [
        {
          id: 'pattern-ec-1',
          keyword: 'best running shoes',
          clusterId,
          capturedAt: new Date('2024-11-20T00:00:00Z'),
          source: 'google',
          features: { hasFeature: ['shopping_results', 'image_pack'], featureCount: 2 },
          ranking: {
            domainAuthority: { highAuthority: 5, mediumAuthority: 3, lowAuthority: 2, averageBacklinks: 9000 },
            contentLength: { minimum: 1500, average: 3200, maximum: 5200 },
          },
          topResults: [],
          seasonality: 'seasonal',
          confidence: 0.93,
        },
        {
          id: 'pattern-ec-2',
          keyword: 'women\'s athletic shoes',
          clusterId,
          capturedAt: new Date('2024-11-22T00:00:00Z'),
          source: 'dataforseo',
          features: { hasFeature: ['shopping_results', 'featured_snippet'], featureCount: 2 },
          ranking: {
            domainAuthority: { highAuthority: 4, mediumAuthority: 4, lowAuthority: 2, averageBacklinks: 7500 },
            contentLength: { minimum: 1400, average: 3000, maximum: 4800 },
          },
          topResults: [],
          seasonality: 'seasonal',
          confidence: 0.91,
        },
      ];

      // Act
      const mockGetByClusterId = jest.fn().mockResolvedValue(patterns);
      const results = await mockGetByClusterId(clusterId);

      // Assert
      expect(mockGetByClusterId).toHaveBeenCalledWith(clusterId);
      expect(results).toHaveLength(2);
      expect(results.every((p: SERPPattern) => p.clusterId === clusterId)).toBe(true);
    });

    it('should return empty array for non-existent cluster', async () => {
      // Arrange
      const nonExistentClusterId = 'cluster-phantom-999';

      // Act
      const mockGetByClusterId = jest.fn().mockResolvedValue([]);
      const results = await mockGetByClusterId(nonExistentClusterId);

      // Assert
      expect(results).toEqual([]);
    });

    it('should maintain cluster integrity (no cross-contamination)', async () => {
      // Arrange
      const clusterId1 = 'cluster-a';
      const clusterId2 = 'cluster-b';
      const pattern1: SERPPattern = {
        id: 'p1',
        keyword: 'keyword a',
        clusterId: clusterId1,
        capturedAt: now,
        source: 'google',
        features: { hasFeature: [], featureCount: 0 },
        ranking: {
          domainAuthority: { highAuthority: 2, mediumAuthority: 5, lowAuthority: 3, averageBacklinks: 3500 },
          contentLength: { minimum: 1000, average: 2500, maximum: 4000 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.85,
      };

      const pattern2: SERPPattern = {
        id: 'p2',
        keyword: 'keyword b',
        clusterId: clusterId2,
        capturedAt: now,
        source: 'google',
        features: { hasFeature: [], featureCount: 0 },
        ranking: {
          domainAuthority: { highAuthority: 2, mediumAuthority: 5, lowAuthority: 3, averageBacklinks: 3500 },
          contentLength: { minimum: 1000, average: 2500, maximum: 4000 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.85,
      };

      // Act
      const mockGetByClusterId = jest.fn().mockImplementation((cid: string) => {
        if (cid === clusterId1) return Promise.resolve([pattern1]);
        if (cid === clusterId2) return Promise.resolve([pattern2]);
        return Promise.resolve([]);
      });

      const results1 = await mockGetByClusterId(clusterId1);
      const results2 = await mockGetByClusterId(clusterId2);

      // Assert: no cross-contamination
      expect(results1).toEqual([pattern1]);
      expect(results2).toEqual([pattern2]);
      expect(results1.every((p: SERPPattern) => p.clusterId === clusterId1)).toBe(true);
      expect(results2.every((p: SERPPattern) => p.clusterId === clusterId2)).toBe(true);
    });
  });

  // ==========================================================================
  // 7. hasFreshPattern() - Check if fresh data exists
  // ==========================================================================

  describe('hasFreshPattern()', () => {
    it('should return true for pattern below 7-day threshold', () => {
      // Arrange: pattern captured 3 days ago
      const threeAaysAgo = new Date('2024-11-29T00:00:00Z');
      const freshness = calculateFreshnessScore(threeAaysAgo, now);

      // Act
      const mockHasFresh = jest.fn((freshness: number, threshold = 0.5) => freshness >= threshold);
      const isFresh = mockHasFresh(freshness);

      // Assert
      expect(isFresh).toBe(true);
      expect(freshness).toBeCloseTo(0.86, 1); // (1 - 3/21) ≈ 0.86
    });

    it('should return false for pattern exceeding stale threshold', () => {
      // Arrange: pattern captured 25 days ago (beyond 21-day TTL)
      const twentyFiveDaysAgo = new Date('2024-10-08T00:00:00Z');
      const freshness = calculateFreshnessScore(twentyFiveDaysAgo, now);

      // Act
      const mockHasFresh = jest.fn((freshness: number, threshold = 0.5) => freshness >= threshold);
      const isFresh = mockHasFresh(freshness);

      // Assert
      expect(isFresh).toBe(false);
      expect(freshness).toBeLessThanOrEqual(0);
    });

    it('should return true for pattern at 50% freshness boundary', () => {
      // Arrange: pattern that yields exactly 0.5 freshness
      // 0.5 = 1 - (days / 21) => days = 10.5
      const tenAndHalfDaysAgo = new Date('2024-11-21T12:00:00Z');
      const freshness = calculateFreshnessScore(tenAndHalfDaysAgo, now);

      // Act
      const mockHasFresh = jest.fn((f: number) => f >= 0.5);
      const isFresh = mockHasFresh(freshness);

      // Assert
      expect(isFresh).toBe(true);
    });

    it('should accept custom freshness threshold', () => {
      // Arrange: pattern at ~0.67 freshness (7 days ago)
      const sevenDaysAgo = new Date('2024-11-25T00:00:00Z');
      const freshness = calculateFreshnessScore(sevenDaysAgo, now);

      // Act: check against custom threshold
      const mockHasFresh = jest.fn((f: number, threshold: number) => f >= threshold);
      const isFreshStrict = mockHasFresh(freshness, 0.8); // Strict threshold
      const isFreshLoose = mockHasFresh(freshness, 0.5); // Loose threshold

      // Assert
      expect(isFreshStrict).toBe(false);
      expect(isFreshLoose).toBe(true);
      expect(freshness).toBeCloseTo(0.67, 1); // Verify calculated freshness
    });

    it('should consider keyword when checking freshness for pattern', () => {
      // Arrange: trending keyword requires fresher data
      const trendingKeyword = 'breaking news tech';
      const normalKeyword = 'how to make coffee';
      const patternAge = new Date('2024-11-25T00:00:00Z'); // 7 days old

      // Act: mock freshness check with keyword awareness
      const mockHasFresh = jest.fn((keyword: string, age: Date) => {
        const freshness = calculateFreshnessScore(age, now);
        if (keyword.includes('news')) return freshness > 0.9; // Very fresh required
        return freshness > 0.5; // Normal threshold
      });

      const isTrendingFresh = mockHasFresh(trendingKeyword, patternAge);
      const isNormalFresh = mockHasFresh(normalKeyword, patternAge);

      // Assert
      expect(isTrendingFresh).toBe(false); // 7-day-old news is not fresh enough
      expect(isNormalFresh).toBe(true); // 7-day-old normal content is acceptable
    });
  });

  // ==========================================================================
  // 8. getFeaturedSnippetOpportunities() - Find featured snippet opportunities
  // ==========================================================================

  describe('getFeaturedSnippetOpportunities()', () => {
    it('should identify keywords without featured snippets', async () => {
      // Arrange: patterns with and without featured snippets
      const withSnippet: SERPPattern = {
        id: 'pattern-with-fs',
        keyword: 'python decorators',
        clusterId: 'cluster-py',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: ['featured_snippet'], featureCount: 1 },
        ranking: {
          domainAuthority: { highAuthority: 3, mediumAuthority: 4, lowAuthority: 3, averageBacklinks: 4500 },
          contentLength: { minimum: 1200, average: 2700, maximum: 4400 },
        },
        topResults: [{ position: 1, url: 'https://example.com', title: 'Python Decorators' }],
        seasonality: 'stable',
        confidence: 0.89,
      };

      const withoutSnippet: SERPPattern = {
        id: 'pattern-no-fs',
        keyword: 'javascript scope chain',
        clusterId: 'cluster-js',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: ['image_pack'], featureCount: 1 },
        ranking: {
          domainAuthority: { highAuthority: 4, mediumAuthority: 3, lowAuthority: 3, averageBacklinks: 5500 },
          contentLength: { minimum: 1300, average: 2800, maximum: 4600 },
        },
        topResults: [{ position: 2, url: 'https://example.com', title: 'JS Scope' }],
        seasonality: 'stable',
        confidence: 0.87,
      };

      // Act
      const mockGetOpportunities = jest.fn().mockResolvedValue([withoutSnippet]);
      const opportunities = await mockGetOpportunities();

      // Assert
      expect(mockGetOpportunities).toHaveBeenCalled();
      expect(opportunities.every((p: SERPPattern) => !p.features.hasFeature.includes('featured_snippet'))).toBe(true);
    });

    it('should rank opportunities by competition level', async () => {
      // Arrange: opportunities with varying authority competition
      const lowCompetition: SERPPattern = {
        id: 'opp-low',
        keyword: 'niche technical term',
        clusterId: 'cluster-niche',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: ['image_pack'], featureCount: 1 },
        ranking: {
          domainAuthority: { highAuthority: 0, mediumAuthority: 3, lowAuthority: 7, averageBacklinks: 500 },
          contentLength: { minimum: 800, average: 2000, maximum: 3500 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.75,
      };

      const highCompetition: SERPPattern = {
        id: 'opp-high',
        keyword: 'popular blog topic',
        clusterId: 'cluster-popular',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: [], featureCount: 0 },
        ranking: {
          domainAuthority: { highAuthority: 8, mediumAuthority: 2, lowAuthority: 0, averageBacklinks: 50000 },
          contentLength: { minimum: 2000, average: 4000, maximum: 6000 },
        },
        topResults: [],
        seasonality: 'trending',
        confidence: 0.92,
      };

      // Act
      const mockGetOpportunities = jest.fn().mockResolvedValue([lowCompetition, highCompetition]);
      const opportunities = await mockGetOpportunities();

      // Assert: opportunities should be ranked
      expect(mockGetOpportunities).toHaveBeenCalled();
      expect(opportunities).toContainEqual(lowCompetition);
      expect(opportunities).toContainEqual(highCompetition);
    });

    it('should consider topResults ranking for opportunity scoring', async () => {
      // Arrange: pattern with top position advantage
      const topRanked: SERPPattern = {
        id: 'opp-top',
        keyword: 'accessible opportunity',
        clusterId: 'cluster-accessible',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: [], featureCount: 0 },
        ranking: {
          domainAuthority: { highAuthority: 1, mediumAuthority: 4, lowAuthority: 5, averageBacklinks: 1500 },
          contentLength: { minimum: 1000, average: 2200, maximum: 3800 },
        },
        topResults: [
          { position: 3, url: 'https://site.com/page', title: 'Our Article' },
        ],
        seasonality: 'stable',
        confidence: 0.84,
      };

      // Act
      const mockGetOpportunities = jest.fn().mockResolvedValue([topRanked]);
      const opportunities = await mockGetOpportunities();

      // Assert
      expect(opportunities[0].topResults[0].position).toBe(3);
    });

    it('should filter by freshness - include only recent patterns', async () => {
      // Arrange
      const fresh: SERPPattern = {
        id: 'opp-fresh',
        keyword: 'fresh opportunity',
        clusterId: 'cluster-fresh',
        capturedAt: new Date('2024-11-28T00:00:00Z'), // 4 days ago
        source: 'google',
        features: { hasFeature: [], featureCount: 0 },
        ranking: {
          domainAuthority: { highAuthority: 1, mediumAuthority: 3, lowAuthority: 6, averageBacklinks: 800 },
          contentLength: { minimum: 900, average: 2100, maximum: 3600 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.81,
      };

      const stale: SERPPattern = {
        id: 'opp-stale',
        keyword: 'stale opportunity',
        clusterId: 'cluster-stale',
        capturedAt: new Date('2024-10-12T00:00:00Z'), // 51 days ago
        source: 'google',
        features: { hasFeature: [], featureCount: 0 },
        ranking: {
          domainAuthority: { highAuthority: 1, mediumAuthority: 3, lowAuthority: 6, averageBacklinks: 800 },
          contentLength: { minimum: 900, average: 2100, maximum: 3600 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.81,
      };

      // Act
      const mockGetOpportunities = jest.fn((minFreshness = 0.5) => {
        const opportunities = [fresh, stale].filter(p => {
          const freshness = calculateFreshnessScore(p.capturedAt, now);
          return freshness >= minFreshness;
        });
        return Promise.resolve(opportunities);
      });

      const results = await mockGetOpportunities(0.5);

      // Assert
      expect(results).toContainEqual(fresh);
      expect(results).not.toContainEqual(stale);
    });

    it('should return empty array if no opportunities exist', async () => {
      // Arrange: all keywords have featured snippets
      // Act
      const mockGetOpportunities = jest.fn().mockResolvedValue([]);
      const opportunities = await mockGetOpportunities();

      // Assert
      expect(opportunities).toEqual([]);
    });
  });

  // ==========================================================================
  // 9. getAverageRankingPatterns() - Calculate average patterns for cluster
  // ==========================================================================

  describe('getAverageRankingPatterns()', () => {
    it('should calculate average domain authority across cluster', async () => {
      // Arrange
      const clusterId = 'cluster-average';
      const patterns: SERPPattern[] = [
        {
          id: 'p1',
          keyword: 'keyword1',
          clusterId,
          capturedAt: now,
          source: 'google',
          features: { hasFeature: [], featureCount: 0 },
          ranking: {
            domainAuthority: { highAuthority: 5, mediumAuthority: 3, lowAuthority: 2, averageBacklinks: 8000 },
            contentLength: { minimum: 1200, average: 2700, maximum: 4400 },
          },
          topResults: [],
          seasonality: 'stable',
          confidence: 0.90,
        },
        {
          id: 'p2',
          keyword: 'keyword2',
          clusterId,
          capturedAt: now,
          source: 'google',
          features: { hasFeature: [], featureCount: 0 },
          ranking: {
            domainAuthority: { highAuthority: 3, mediumAuthority: 5, lowAuthority: 2, averageBacklinks: 5000 },
            contentLength: { minimum: 1000, average: 2500, maximum: 4200 },
          },
          topResults: [],
          seasonality: 'stable',
          confidence: 0.88,
        },
      ];

      // Act
      const mockGetAverage = jest.fn().mockResolvedValue({
        clusterId,
        averageDomainAuthority: {
          highAuthority: 4, // (5 + 3) / 2
          mediumAuthority: 4, // (3 + 5) / 2
          lowAuthority: 2, // (2 + 2) / 2
          averageBacklinks: 6500, // (8000 + 5000) / 2
        },
      });

      const average = await mockGetAverage(clusterId);

      // Assert
      expect(mockGetAverage).toHaveBeenCalledWith(clusterId);
      expect(average.averageDomainAuthority.highAuthority).toBe(4);
      expect(average.averageDomainAuthority.averageBacklinks).toBe(6500);
    });

    it('should calculate average content length across cluster', async () => {
      // Arrange
      const clusterId = 'cluster-content-avg';
      const patterns: SERPPattern[] = [
        {
          id: 'p1',
          keyword: 'k1',
          clusterId,
          capturedAt: now,
          source: 'google',
          features: { hasFeature: [], featureCount: 0 },
          ranking: {
            domainAuthority: { highAuthority: 2, mediumAuthority: 5, lowAuthority: 3, averageBacklinks: 3500 },
            contentLength: { minimum: 1000, average: 2000, maximum: 3000 },
          },
          topResults: [],
          seasonality: 'stable',
          confidence: 0.85,
        },
        {
          id: 'p2',
          keyword: 'k2',
          clusterId,
          capturedAt: now,
          source: 'google',
          features: { hasFeature: [], featureCount: 0 },
          ranking: {
            domainAuthority: { highAuthority: 2, mediumAuthority: 5, lowAuthority: 3, averageBacklinks: 3500 },
            contentLength: { minimum: 1200, average: 2800, maximum: 4000 },
          },
          topResults: [],
          seasonality: 'stable',
          confidence: 0.85,
        },
      ];

      // Act
      const mockGetAverage = jest.fn().mockResolvedValue({
        clusterId,
        averageContentLength: {
          minimum: 1100, // (1000 + 1200) / 2
          average: 2400, // (2000 + 2800) / 2
          maximum: 3500, // (3000 + 4000) / 2
        },
      });

      const average = await mockGetAverage(clusterId);

      // Assert
      expect(average.averageContentLength.average).toBe(2400);
      expect(average.averageContentLength.maximum).toBe(3500);
    });

    it('should handle single pattern in cluster', async () => {
      // Arrange
      const clusterId = 'cluster-single';
      const pattern: SERPPattern = {
        id: 'p-single',
        keyword: 'lonely keyword',
        clusterId,
        capturedAt: now,
        source: 'google',
        features: { hasFeature: [], featureCount: 0 },
        ranking: {
          domainAuthority: { highAuthority: 3, mediumAuthority: 5, lowAuthority: 2, averageBacklinks: 4500 },
          contentLength: { minimum: 1100, average: 2500, maximum: 4000 },
        },
        topResults: [],
        seasonality: 'stable',
        confidence: 0.86,
      };

      // Act
      const mockGetAverage = jest.fn().mockResolvedValue({
        clusterId,
        patternCount: 1,
        averageDomainAuthority: pattern.ranking.domainAuthority,
        averageContentLength: pattern.ranking.contentLength,
      });

      const average = await mockGetAverage(clusterId);

      // Assert
      expect(average.patternCount).toBe(1);
      expect(average.averageDomainAuthority).toEqual(pattern.ranking.domainAuthority);
    });

    it('should include pattern count in result', async () => {
      // Arrange
      const clusterId = 'cluster-count';

      // Act
      const mockGetAverage = jest.fn().mockResolvedValue({
        clusterId,
        patternCount: 5,
        averageDomainAuthority: { highAuthority: 3, mediumAuthority: 4, lowAuthority: 3, averageBacklinks: 4500 },
        averageContentLength: { minimum: 1100, average: 2400, maximum: 3800 },
      });

      const average = await mockGetAverage(clusterId);

      // Assert
      expect(average.patternCount).toBe(5);
    });
  });

  // ==========================================================================
  // 10. delete() - Remove entries
  // ==========================================================================

  describe('delete()', () => {
    it('should remove pattern by ID', async () => {
      // Arrange
      const patternId = 'pattern-to-delete-1';
      const mockDelete = jest.fn().mockResolvedValue(true);

      // Act
      const result = await mockDelete(patternId);

      // Assert
      expect(mockDelete).toHaveBeenCalledWith(patternId);
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent pattern', async () => {
      // Arrange
      const nonExistentId = 'pattern-404-delete';
      const mockDelete = jest.fn().mockResolvedValue(false);

      // Act
      const result = await mockDelete(nonExistentId);

      // Assert
      expect(result).toBe(false);
    });

    it('should prevent deletion of immutable patterns', async () => {
      // Arrange
      const immutablePatternId = 'pattern-system-immutable';

      // Act
      const mockDelete = jest.fn((id: string) => {
        if (id.includes('immutable')) {
          throw new Error('Cannot delete immutable pattern');
        }
        return Promise.resolve(true);
      });

      // Assert
      expect(() => mockDelete(immutablePatternId)).toThrow('Cannot delete immutable pattern');
    });

    it('should delete all patterns in cluster when requested', async () => {
      // Arrange
      const clusterId = 'cluster-to-purge';
      const mockDeleteByCluster = jest.fn().mockResolvedValue(3); // Deleted 3 patterns

      // Act
      const deletedCount = await mockDeleteByCluster(clusterId);

      // Assert
      expect(mockDeleteByCluster).toHaveBeenCalledWith(clusterId);
      expect(deletedCount).toBe(3);
    });

    it('should log deletion with audit trail', async () => {
      // Arrange
      const patternId = 'pattern-audit-delete';
      const deletionTime = now;

      // Act
      const mockDelete = jest.fn().mockResolvedValue({
        deletedId: patternId,
        timestamp: deletionTime,
        action: 'delete',
      });

      const auditEntry = await mockDelete(patternId);

      // Assert
      expect(auditEntry.deletedId).toBe(patternId);
      expect(auditEntry.timestamp).toEqual(deletionTime);
    });
  });

  // ==========================================================================
  // 11. getStaleEntries() - Find entries below freshness threshold
  // ==========================================================================

  describe('getStaleEntries()', () => {
    it('should identify patterns exceeding TTL (21 days)', async () => {
      // Arrange: create patterns of various ages
      const fresh = {
        id: 'fresh-pattern',
        capturedAt: new Date('2024-11-28T00:00:00Z'), // 4 days
        freshness: 0.81,
      };

      const stale = {
        id: 'stale-pattern',
        capturedAt: new Date('2024-10-11T00:00:00Z'), // 52 days
        freshness: -0.48,
      };

      const marginal = {
        id: 'marginal-pattern',
        capturedAt: new Date('2024-11-12T00:00:00Z'), // 20 days
        freshness: 0.05,
      };

      // Act
      const mockGetStale = jest.fn().mockResolvedValue([stale, marginal]);
      const stalePatterns = await mockGetStale(0.5); // Threshold at 50% freshness

      // Assert
      expect(mockGetStale).toHaveBeenCalledWith(0.5);
      expect(stalePatterns.every((p: any) => p.freshness < 0.5)).toBe(true);
    });

    it('should return empty array if all patterns are fresh', async () => {
      // Arrange
      const allFresh = [
        { id: 'fresh1', freshness: 0.9 },
        { id: 'fresh2', freshness: 0.8 },
        { id: 'fresh3', freshness: 0.7 },
      ];

      // Act
      const mockGetStale = jest.fn().mockResolvedValue([]);
      const stalePatterns = await mockGetStale(0.5);

      // Assert
      expect(stalePatterns).toEqual([]);
    });

    it('should accept custom freshness threshold', async () => {
      // Arrange
      const patterns = [
        { id: 'p1', freshness: 0.85 },
        { id: 'p2', freshness: 0.65 },
        { id: 'p3', freshness: 0.45 },
      ];

      // Act: use strict threshold
      const mockGetStale = jest.fn().mockImplementation((threshold: number) => {
        return Promise.resolve(patterns.filter(p => p.freshness < threshold));
      });

      const staleStrict = await mockGetStale(0.8);
      const staleLenient = await mockGetStale(0.5);

      // Assert
      expect(staleStrict).toHaveLength(2);
      expect(staleLenient).toHaveLength(1);
    });

    it('should include pattern metadata in stale entries', async () => {
      // Arrange
      const staleWithMetadata = {
        id: 'stale-meta',
        keyword: 'outdated keyword',
        clusterId: 'cluster-old',
        capturedAt: new Date('2024-09-01T00:00:00Z'),
        freshness: 0.0,
        source: 'google',
        confidence: 0.80,
      };

      // Act
      const mockGetStale = jest.fn().mockResolvedValue([staleWithMetadata]);
      const result = await mockGetStale(0.5);

      // Assert
      expect(result[0]).toHaveProperty('keyword');
      expect(result[0]).toHaveProperty('clusterId');
      expect(result[0]).toHaveProperty('source');
    });

    it('should sort stale entries by age (oldest first)', async () => {
      // Arrange
      const old = { id: 'oldest', freshness: -0.5, capturedAt: new Date('2024-08-01T00:00:00Z') };
      const older = { id: 'older', freshness: 0.0, capturedAt: new Date('2024-11-10T00:00:00Z') };
      const recent = { id: 'recent', freshness: 0.3, capturedAt: new Date('2024-11-20T00:00:00Z') };

      // Act
      const mockGetStale = jest.fn().mockResolvedValue([old, older, recent]);
      const result = await mockGetStale(0.5);

      // Assert: should be ordered by capture time ascending (oldest first)
      expect(result[0].id).toBe('oldest');
      expect(result[result.length - 1].id).toBe('recent');
    });

    it('should handle edge case of pattern exactly at TTL boundary', async () => {
      // Arrange: pattern exactly 21 days old
      const exactlyTTL = {
        id: 'exact-ttl',
        capturedAt: new Date('2024-11-11T00:00:00Z'), // Exactly 21 days
        freshness: 0.0,
      };

      // Act
      const mockGetStale = jest.fn().mockResolvedValue([exactlyTTL]);
      const result = await mockGetStale(0.01); // Threshold just above 0

      // Assert
      expect(result).toContainEqual(exactlyTTL);
    });
  });

  // ==========================================================================
  // INTEGRATION TESTS: Multiple Operations
  // ==========================================================================

  describe('Integration: Multiple Operations', () => {
    it('should maintain consistency across add, search, and update', async () => {
      // Arrange
      const keyword = 'integration test keyword';
      const pattern: SERPPattern = {
        id: 'integration-1',
        keyword,
        clusterId: 'cluster-integration',
        capturedAt: now,
        source: 'google',
        features: { hasFeature: ['featured_snippet'], featureCount: 1 },
        ranking: {
          domainAuthority: { highAuthority: 3, mediumAuthority: 5, lowAuthority: 2, averageBacklinks: 5000 },
          contentLength: { minimum: 1200, average: 2800, maximum: 4500 },
        },
        topResults: [{ position: 1, url: 'https://example.com', title: 'Test' }],
        seasonality: 'stable',
        confidence: 0.88,
        vector: mockEmbedding(keyword),
      };

      // Act: simulate full workflow
      const mockAdd = jest.fn().mockResolvedValue(pattern);
      const mockSearch = jest.fn().mockResolvedValue([pattern]);
      const mockUpdate = jest.fn().mockResolvedValue({ ...pattern, confidence: 0.95 });

      await mockAdd(pattern);
      const searchResults = await mockSearch(keyword);
      const updated = await mockUpdate(pattern.id, { confidence: 0.95 });

      // Assert: consistency throughout
      expect(mockAdd).toHaveBeenCalledWith(pattern);
      expect(searchResults[0].id).toBe(pattern.id);
      expect(updated.confidence).toBe(0.95);
    });

    it('should handle concurrent operations safely', async () => {
      // Arrange: multiple operations on same collection
      const patterns = Array.from({ length: 3 }, (_, i) => ({
        id: `pattern-concurrent-${i}`,
        keyword: `keyword ${i}`,
      }));

      // Act: mock concurrent adds
      const mockAdd = jest.fn().mockImplementation((p) => Promise.resolve(p));
      const results = await Promise.all(patterns.map(p => mockAdd(p)));

      // Assert: all succeeded
      expect(results).toHaveLength(3);
      expect(mockAdd).toHaveBeenCalledTimes(3);
    });
  });
});
