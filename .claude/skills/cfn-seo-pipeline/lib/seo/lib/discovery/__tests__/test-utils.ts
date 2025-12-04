/**
 * Test utilities for discovery collector tests
 *
 * Provides mock implementations and helper functions for testing
 * keyword collectors without external API calls.
 *
 * @module seo/lib/discovery/__tests__/test-utils
 */

import type { KeywordSource } from '../types';
import type { VectorDB } from '@ruvector/core';
import type { SEOQueryManager } from '../../ruvector/queries';

/**
 * Create mock KeywordSource with optional overrides
 *
 * @param overrides - Partial KeywordSource to override defaults
 * @returns Complete KeywordSource object
 */
export function mockKeywordSource(overrides?: Partial<KeywordSource>): KeywordSource {
  return {
    keyword: 'test keyword',
    source: 'suggest',
    metadata: {},
    discoveredAt: new Date().toISOString(),
    cacheHit: false,
    ...overrides,
  };
}

/**
 * Create array of mock keyword sources
 *
 * @param count - Number of keywords to create
 * @param source - Source type for all keywords
 * @returns Array of KeywordSource objects
 */
export function mockKeywordSources(
  count: number,
  source: KeywordSource['source'] = 'suggest'
): KeywordSource[] {
  return Array.from({ length: count }, (_, i) => ({
    keyword: `test keyword ${i + 1}`,
    source,
    metadata: {},
    discoveredAt: new Date().toISOString(),
    cacheHit: false,
  }));
}

/**
 * Mock VectorDB implementation for testing
 *
 * Implements full VectorDB interface with both text-based and vector-based APIs
 */
export class MockVectorDB implements VectorDB {
  private storage: Map<string, any> = new Map();

  // High-level text-based API
  async add(id: string, text: string, metadata: Record<string, unknown>): Promise<void> {
    this.storage.set(id, { id, text, metadata });
  }

  async query(text: string, options?: any): Promise<any[]> {
    const limit = options?.limit ?? 10;
    const results = Array.from(this.storage.values());

    // Simple text matching for mock
    const scored = results.map(entry => ({
      ...entry,
      similarity: this.calculateTextSimilarity(text, entry.text || ''),
    }));

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async update(id: string, text: string, metadata: Record<string, unknown>): Promise<void> {
    if (!this.storage.has(id)) {
      throw new Error(`Entry with id ${id} not found`);
    }
    this.storage.set(id, { id, text, metadata });
  }

  // Low-level vector-based API
  async insert(params: any): Promise<void> {
    const { id, vector, metadata } = params;
    const text = metadata.text || '';
    this.storage.set(id, { id, text, metadata, vector });
  }

  async search(params: any): Promise<any[]> {
    const { vector, k, filter } = params;

    let results = Array.from(this.storage.values());

    // Apply filter if provided
    if (filter) {
      results = results.filter(filter);
    }

    // Calculate similarity scores
    const scored = results.map(entry => ({
      id: entry.id,
      score: this.calculateVectorSimilarity(vector, entry.vector || new Float32Array(384)),
      metadata: entry.metadata,
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
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

  // Test helpers
  getStorageSize(): number {
    return this.storage.size;
  }

  hasId(id: string): boolean {
    return this.storage.has(id);
  }

  // Similarity calculations
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculateVectorSimilarity(v1: Float32Array, v2: Float32Array): number {
    // Cosine similarity
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    const len = Math.min(v1.length, v2.length);
    for (let i = 0; i < len; i++) {
      dotProduct += v1[i] * v2[i];
      mag1 += v1[i] * v1[i];
      mag2 += v2[i] * v2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (mag1 * mag2);
  }
}

/**
 * Mock Redis client for testing
 */
export class MockRedisClient {
  private storage: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.storage.get(key) || null;
  }

  async set(key: string, value: string): Promise<string> {
    this.storage.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.storage.has(key);
    this.storage.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.storage.has(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    // Simple pattern matching for tests
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this.storage.keys()).filter(k => regex.test(k));
  }

  // Test helpers
  clear(): void {
    this.storage.clear();
  }

  getStorageSize(): number {
    return this.storage.size;
  }
}

/**
 * Mock SEO Query Manager for testing
 */
export class MockSEOQueryManager implements Partial<SEOQueryManager> {
  private keywordResearchData: Map<string, any> = new Map();
  private competitorData: Map<string, any> = new Map();

  getCollections(): any {
    return {
      keywordResearch: {
        getByKeyword: async (keyword: string) => {
          return this.keywordResearchData.get(keyword) || null;
        },
        hasFreshResearch: async (keyword: string, threshold: number) => {
          return this.keywordResearchData.has(keyword);
        },
        add: async (data: any) => {
          this.keywordResearchData.set(data.primaryKeyword, {
            metadata: {
              niche: data.niche,
              secondaryKeywords: data.secondaryKeywords || [],
              peopleAlsoAsk: data.peopleAlsoAsk || [],
            },
          });
        },
      },
      competitorIntelligence: {
        getByDomain: async (domain: string) => {
          return this.competitorData.get(domain) || null;
        },
        getByDomainAndNiche: async (domain: string, niche: string) => {
          const data = this.competitorData.get(domain);
          return (data && data.metadata.niche === niche) ? data : null;
        },
        getByNiche: async (niche: string) => {
          return Array.from(this.competitorData.values()).filter(
            c => c.metadata.niche === niche
          );
        },
        searchByNiche: async (niche: string) => {
          return Array.from(this.competitorData.values()).filter(
            c => c.metadata.niche === niche
          );
        },
      },
    };
  }

  // Test helpers
  addKeywordResearch(keyword: string, data: any): void {
    this.keywordResearchData.set(keyword, data);
  }

  addCompetitorData(domain: string, data: any): void {
    // Normalize data structure to match CompetitorIntelligenceEntry
    const normalized = {
      id: `${domain}:${data.niche}`,
      text: `Competitor intelligence for ${domain}`,
      metadata: {
        domain: data.domain || domain,
        niche: data.niche,
        topKeywords: data.topKeywords || [],
        estimatedAuthority: data.estimatedAuthority || 50,
        architecturePatterns: data.architecturePatterns || [],
        contentStrategy: data.contentStrategy || [],
        hubPages: data.hubPages || [],
        internalLinkingPatterns: data.internalLinkingPatterns || [],
        contentGaps: data.contentGaps || [],
      },
    };
    this.competitorData.set(domain, normalized);
  }

  clear(): void {
    this.keywordResearchData.clear();
    this.competitorData.clear();
  }
}

/**
 * Mock fetch function for API testing
 *
 * @param url - URL to mock
 * @param response - Response data to return
 * @returns Mock fetch implementation
 */
export function mockFetch(
  url: string | RegExp,
  response: any,
  options?: { status?: number; delay?: number }
): jest.Mock {
  const mockImpl = jest.fn(async (fetchUrl: string, fetchOptions?: any) => {
    // Simulate network delay
    if (options?.delay) {
      await new Promise(resolve => setTimeout(resolve, options.delay));
    }

    // Check if URL matches
    const matches = typeof url === 'string'
      ? fetchUrl.includes(url)
      : url.test(fetchUrl);

    if (!matches) {
      return {
        ok: false,
        status: 404,
        text: async (): Promise<string> => 'Not Found',
      };
    }

    return {
      ok: options?.status === undefined || options.status >= 200 && options.status < 300,
      status: options?.status || 200,
      json: async (): Promise<any> => response,
      text: async (): Promise<string> => JSON.stringify(response),
    };
  });

  global.fetch = mockImpl as any;
  return mockImpl;
}

/**
 * Restore original fetch
 */
export function restoreFetch(): void {
  delete (global as any).fetch;
}

/**
 * Wait for async operations to complete
 *
 * @param ms - Milliseconds to wait
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create mock GSC API response
 */
export function mockGSCResponse(rows: number = 10): any {
  return {
    rows: Array.from({ length: rows }, (_, i) => ({
      keys: [`keyword ${i + 1}`],
      clicks: Math.floor(Math.random() * 100),
      impressions: Math.floor(Math.random() * 1000) + 100,
      ctr: Math.random() * 0.1,
      position: Math.random() * 10 + 1,
    })),
  };
}

/**
 * Create mock Google Suggest response
 */
export function mockSuggestResponse(seed: string, count: number = 5): any {
  return [
    seed,
    Array.from({ length: count }, (_, i) => `${seed} suggestion ${i + 1}`),
  ];
}

/**
 * Create mock PAA response
 */
export function mockPAAResponse(keyword: string): any {
  return [
    {
      question: `What is ${keyword}?`,
      expandedQuestions: [
        `How does ${keyword} work?`,
        `Why use ${keyword}?`,
      ],
    },
    {
      question: `How to use ${keyword}?`,
    },
    {
      question: `Why is ${keyword} important?`,
    },
  ];
}

/**
 * Verify GIVEN/WHEN/THEN test structure
 */
export function describeGWT(name: string, fn: () => void): void {
  describe(name, () => {
    fn();
  });
}

/**
 * Assert keyword source validity
 */
export function assertValidKeywordSource(kw: KeywordSource): void {
  expect(kw).toBeDefined();
  expect(typeof kw.keyword).toBe('string');
  expect(kw.keyword.length).toBeGreaterThan(0);
  expect(['gsc', 'suggest', 'paa', 'social', 'competitors']).toContain(kw.source);
  expect(typeof kw.metadata).toBe('object');
  expect(typeof kw.discoveredAt).toBe('string');
  expect(typeof kw.cacheHit).toBe('boolean');
}

/**
 * Assert array contains valid keyword sources
 */
export function assertValidKeywordSources(keywords: KeywordSource[]): void {
  expect(Array.isArray(keywords)).toBe(true);
  keywords.forEach(kw => assertValidKeywordSource(kw));
}
