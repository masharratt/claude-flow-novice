/**
 * Unit tests for Competitor Keyword Collector
 *
 * Tests cover:
 * - RuVector integration for competitor data
 * - Redis Phase 3 data reading
 * - Keyword extraction and deduplication
 * - Competitor attribution
 *
 * @module seo/lib/discovery/__tests__/competitor-collector.test
 */

import { collectFromCompetitors, getKeywordGaps, getCompetitorOverlap, groupByDifficulty } from '../competitor-collector';
import type { CompetitorCollectorOptions } from '../types';
import { MockSEOQueryManager, assertValidKeywordSources } from './test-utils';

describe('Competitor Collector', () => {
  let seoQuery: MockSEOQueryManager;

  beforeEach(() => {
    seoQuery = new MockSEOQueryManager();
  });

  afterEach(() => {
    seoQuery.clear();
  });

  // ========== RUVECTOR INTEGRATION ==========

  describe('RuVector Integration', () => {
    it('should read competitor intelligence from cache', async () => {
      // GIVEN competitor data in RuVector
      seoQuery.addCompetitorData('competitor1.com', {
        niche: 'crm',
        domain: 'competitor1.com',
        topKeywords: [
          { keyword: 'crm software', position: 1, searchVolume: 5000 },
          { keyword: 'best crm', position: 2, searchVolume: 3000 },
        ],
      });

      // WHEN collecting competitor keywords
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'crm',
        competitorDomains: ['competitor1.com'],
      };
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should return competitor keywords
      expect(keywords.length).toBe(2);
      assertValidKeywordSources(keywords);
      keywords.forEach(kw => {
        expect(kw.source).toBe('competitors');
        expect(kw.cacheHit).toBe(true);
        expect(kw.metadata.competitorDomain).toBe('competitor1.com');
      });
    });

    it('should extract topKeywords field', async () => {
      // GIVEN competitor with topKeywords
      seoQuery.addCompetitorData('test.com', {
        niche: 'test',
        domain: 'test.com',
        topKeywords: [
          { keyword: 'keyword 1', position: 1, searchVolume: 1000 },
          { keyword: 'keyword 2', position: 3, searchVolume: 500 },
          { keyword: 'keyword 3', position: 5, searchVolume: 200 },
        ],
      });

      // WHEN collecting
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        limit: 3,
      };
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should extract all keywords
      expect(keywords.length).toBe(3);
      expect(keywords.map(kw => kw.keyword)).toContain('keyword 1');
      expect(keywords.map(kw => kw.keyword)).toContain('keyword 2');
      expect(keywords.map(kw => kw.keyword)).toContain('keyword 3');
    });
  });

  // ========== REDIS INTEGRATION ==========

  describe('Redis Integration', () => {
    it('should read Phase 3 competitor data', async () => {
      // GIVEN Phase 3 data in cache
      seoQuery.addCompetitorData('phase3competitor.com', {
        niche: 'seo',
        domain: 'phase3competitor.com',
        topKeywords: [
          { keyword: 'seo tools', position: 1, searchVolume: 10000 },
        ],
      });

      // WHEN collecting
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'seo',
      };
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should return Phase 3 keywords
      expect(keywords.length).toBeGreaterThan(0);
    });

    it('should handle missing Phase 3 data', async () => {
      // GIVEN no competitor data
      // (empty seoQuery)

      // WHEN collecting
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'nonexistent',
      };
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should return empty array
      expect(keywords).toEqual([]);
    });
  });

  // ========== KEYWORD EXTRACTION ==========

  describe('Keyword Extraction', () => {
    it('should extract top 100 keywords per competitor', async () => {
      // GIVEN competitor with many keywords
      const manyKeywords = Array.from({ length: 150 }, (_, i) => ({
        keyword: `keyword ${i + 1}`,
        position: i + 1,
        searchVolume: 1000 - i,
      }));

      seoQuery.addCompetitorData('test.com', {
        niche: 'test',
        domain: 'test.com',
        topKeywords: manyKeywords,
      });

      // WHEN collecting with limit
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        limit: 100,
      };
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should limit to 100
      expect(keywords.length).toBeLessThanOrEqual(100);
    });

    it('should include competitor attribution', async () => {
      // GIVEN multiple competitors
      seoQuery.addCompetitorData('comp1.com', {
        niche: 'test',
        domain: 'comp1.com',
        topKeywords: [{ keyword: 'kw1', position: 1, searchVolume: 500 }],
      });
      seoQuery.addCompetitorData('comp2.com', {
        niche: 'test',
        domain: 'comp2.com',
        topKeywords: [{ keyword: 'kw2', position: 1, searchVolume: 500 }],
      });

      // WHEN collecting
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
      };
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should track which competitor each keyword came from
      expect(keywords.some(kw => kw.metadata.competitorDomain === 'comp1.com')).toBe(true);
      expect(keywords.some(kw => kw.metadata.competitorDomain === 'comp2.com')).toBe(true);
    });

    it('should filter by minimum search volume', async () => {
      // GIVEN keywords with varying search volume
      seoQuery.addCompetitorData('test.com', {
        niche: 'test',
        domain: 'test.com',
        topKeywords: [
          { keyword: 'high volume', position: 1, searchVolume: 10000 },
          { keyword: 'low volume', position: 2, searchVolume: 10 },
        ],
      });

      // WHEN collecting with min volume
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        minSearchVolume: 1000,
      };
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should filter by volume
      expect(keywords.length).toBe(1);
      expect(keywords[0].keyword).toBe('high volume');
    });
  });

  // ========== DEDUPLICATION ==========

  describe('Deduplication', () => {
    it('should remove duplicate keywords across competitors', async () => {
      // GIVEN multiple competitors with overlapping keywords
      seoQuery.addCompetitorData('comp1.com', {
        niche: 'test',
        domain: 'comp1.com',
        topKeywords: [
          { keyword: 'shared keyword', position: 1, searchVolume: 1000 },
          { keyword: 'unique to comp1', position: 2, searchVolume: 500 },
        ],
      });
      seoQuery.addCompetitorData('comp2.com', {
        niche: 'test',
        domain: 'comp2.com',
        topKeywords: [
          { keyword: 'shared keyword', position: 1, searchVolume: 1500 },
          { keyword: 'unique to comp2', position: 2, searchVolume: 300 },
        ],
      });

      // WHEN collecting
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
      };
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should deduplicate
      const keywordTexts = keywords.map(kw => kw.keyword.toLowerCase());
      const uniqueCount = new Set(keywordTexts).size;
      expect(keywordTexts.length).toBe(uniqueCount);
    });

    it('should keep highest volume version of duplicates', async () => {
      // GIVEN duplicate keywords with different volumes
      seoQuery.addCompetitorData('comp1.com', {
        niche: 'test',
        domain: 'comp1.com',
        topKeywords: [{ keyword: 'duplicate', position: 1, searchVolume: 500 }],
      });
      seoQuery.addCompetitorData('comp2.com', {
        niche: 'test',
        domain: 'comp2.com',
        topKeywords: [{ keyword: 'duplicate', position: 1, searchVolume: 2000 }],
      });

      // WHEN collecting
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
      };
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should keep higher volume version
      const duplicate = keywords.find(kw => kw.keyword.toLowerCase() === 'duplicate');
      expect(duplicate?.metadata.searchVolume).toBe(2000);
    });
  });

  // ========== HELPER FUNCTIONS ==========

  describe('Helper Functions', () => {
    beforeEach(() => {
      // Setup common test data
      seoQuery.addCompetitorData('comp.com', {
        niche: 'test',
        domain: 'comp.com',
        topKeywords: [
          { keyword: 'keyword 1', position: 1, searchVolume: 1000 },
          { keyword: 'keyword 2', position: 2, searchVolume: 500 },
        ],
      });
    });

    it('should identify keyword gaps', async () => {
      // GIVEN our keywords and competitor keywords
      const yourDomain = 'yourdomain.com';

      // Add intelligence for your domain (with only keyword 1)
      seoQuery.addCompetitorData(yourDomain, {
        niche: 'test',
        domain: yourDomain,
        topKeywords: [
          { keyword: 'keyword 1', position: 1, searchVolume: 1000 },
        ],
      });

      // WHEN finding gaps
      const gaps = await getKeywordGaps(seoQuery as any, 'test', yourDomain);

      // THEN should identify missing keywords (keyword 2 is in comp.com but not in yourDomain)
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps.some(kw => kw.keyword === 'keyword 2')).toBe(true);
    });

    it('should calculate competitor overlap', async () => {
      // GIVEN keywords from multiple competitors
      seoQuery.addCompetitorData('comp1.com', {
        niche: 'test',
        domain: 'comp1.com',
        topKeywords: [
          { keyword: 'shared', position: 1, searchVolume: 1000 },
          { keyword: 'unique1', position: 2, searchVolume: 500 },
        ],
      });
      seoQuery.addCompetitorData('comp2.com', {
        niche: 'test',
        domain: 'comp2.com',
        topKeywords: [
          { keyword: 'shared', position: 1, searchVolume: 1000 },
          { keyword: 'unique2', position: 2, searchVolume: 500 },
        ],
      });

      // WHEN calculating overlap
      const domains = ['comp1.com', 'comp2.com'];
      const overlap = await getCompetitorOverlap(seoQuery as any, 'test', domains);

      // THEN should identify shared keywords
      expect(overlap.sharedKeywords.length).toBe(1);
      expect(overlap.sharedKeywords[0]).toBe('shared');
      expect(overlap.overlapPercentage).toBeGreaterThan(0);
    });

    it('should group keywords by difficulty', () => {
      // GIVEN keywords with difficulty metadata
      const keywords = [
        { keyword: 'easy', source: 'competitors' as const, metadata: { difficulty: 20, competitorDomain: 'test.com' }, discoveredAt: '', cacheHit: true },
        { keyword: 'medium', source: 'competitors' as const, metadata: { difficulty: 50, competitorDomain: 'test.com' }, discoveredAt: '', cacheHit: true },
        { keyword: 'hard', source: 'competitors' as const, metadata: { difficulty: 80, competitorDomain: 'test.com' }, discoveredAt: '', cacheHit: true },
      ];

      // WHEN grouping by difficulty
      const groups = groupByDifficulty(keywords);

      // THEN should group correctly
      expect(groups.easy.length).toBe(1);
      expect(groups.medium.length).toBe(1);
      expect(groups.hard.length).toBe(1);
    });
  });

  // ========== ERROR HANDLING ==========

  describe('Error Handling', () => {
    it('should handle empty competitor list', async () => {
      // GIVEN no competitors
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'nonexistent',
      };

      // WHEN collecting
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should return empty array
      expect(keywords).toEqual([]);
    });

    it('should handle malformed competitor data', async () => {
      // GIVEN malformed data
      seoQuery.addCompetitorData('bad.com', {
        niche: 'test',
        domain: 'bad.com',
        topKeywords: null as any,
      });

      // WHEN collecting
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
      };
      const keywords = await collectFromCompetitors('test-task', options, seoQuery as any);

      // THEN should handle gracefully
      expect(Array.isArray(keywords)).toBe(true);
    });

    it('should require SEO query manager', async () => {
      // GIVEN no SEO query manager
      const options: CompetitorCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
      };

      // WHEN collecting without manager
      const keywords = await collectFromCompetitors('test-task', options, null as any);

      // THEN should return empty
      expect(keywords).toEqual([]);
    });
  });
});
