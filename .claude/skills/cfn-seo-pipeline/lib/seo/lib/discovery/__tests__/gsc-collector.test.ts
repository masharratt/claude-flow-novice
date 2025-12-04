/**
 * Unit tests for Google Search Console Keyword Collector
 *
 * Tests cover:
 * - Authentication and credentials
 * - Query execution and filtering
 * - Data transformation and normalization
 * - Error handling and rate limiting
 * - Performance metrics extraction
 *
 * @module seo/lib/discovery/__tests__/gsc-collector.test
 */

import { collectFromGSC, isGSCConfigured, getGSCSites, getTopQueries } from '../gsc-collector';
import type { GSCCollectorOptions } from '../types';
import { mockFetch, restoreFetch, mockGSCResponse, assertValidKeywordSources } from './test-utils';

describe('GSC Collector', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    restoreFetch();
  });

  // ========== AUTHENTICATION ==========

  describe('Authentication', () => {
    it('should detect configured GSC credentials', () => {
      // GIVEN valid GSC access token in environment
      process.env.GSC_ACCESS_TOKEN = 'test-token';

      // WHEN checking if GSC is configured
      const isConfigured = isGSCConfigured();

      // THEN should return true
      expect(isConfigured).toBe(true);
    });

    it('should detect missing GSC credentials', () => {
      // GIVEN no GSC access token
      delete process.env.GSC_ACCESS_TOKEN;

      // WHEN checking if GSC is configured
      const isConfigured = isGSCConfigured();

      // THEN should return false
      expect(isConfigured).toBe(false);
    });

    it('should return empty array when credentials missing', async () => {
      // GIVEN no credentials configured
      delete process.env.GSC_ACCESS_TOKEN;

      // WHEN collecting keywords
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };
      const keywords = await collectFromGSC(options);

      // THEN should return empty array
      expect(keywords).toEqual([]);
    });

    it('should use OAuth Bearer token in API requests', async () => {
      // GIVEN valid access token
      process.env.GSC_ACCESS_TOKEN = 'test-bearer-token';
      const mockFn = mockFetch(/searchAnalytics/, mockGSCResponse(5));

      // WHEN collecting keywords
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };
      await collectFromGSC(options);

      // THEN should include Authorization header
      expect(mockFn).toHaveBeenCalled();
      const callArgs = mockFn.mock.calls[0];
      const headers = callArgs[1]?.headers;
      expect(headers.Authorization).toBe('Bearer test-bearer-token');
    });
  });

  // ========== QUERY EXECUTION ==========

  describe('Query Execution', () => {
    beforeEach(() => {
      process.env.GSC_ACCESS_TOKEN = 'test-token';
    });

    it('should fetch keywords for domain', async () => {
      // GIVEN mock GSC API response
      const mockData = mockGSCResponse(10);
      mockFetch(/searchAnalytics/, mockData);

      // WHEN collecting keywords
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };
      const keywords = await collectFromGSC(options);

      // THEN should return keywords
      expect(keywords).toHaveLength(10);
      assertValidKeywordSources(keywords);
      keywords.forEach(kw => {
        expect(kw.source).toBe('gsc');
        expect(kw.cacheHit).toBe(false);
      });
    });

    it('should filter by minimum impressions', async () => {
      // GIVEN GSC data with varying impressions
      const mockData = {
        rows: [
          { keys: ['high impressions'], clicks: 50, impressions: 1000, ctr: 0.05, position: 3 },
          { keys: ['low impressions'], clicks: 1, impressions: 5, ctr: 0.2, position: 7 },
          { keys: ['medium impressions'], clicks: 20, impressions: 100, ctr: 0.2, position: 5 },
        ],
      };
      mockFetch(/searchAnalytics/, mockData);

      // WHEN collecting with min impressions threshold
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
        minImpressions: 50,
      };
      const keywords = await collectFromGSC(options);

      // THEN should only return keywords above threshold
      expect(keywords.length).toBe(2);
      keywords.forEach(kw => {
        expect(kw.metadata.impressions).toBeGreaterThanOrEqual(50);
      });
    });

    it('should respect row limit', async () => {
      // GIVEN more rows than limit
      mockFetch(/searchAnalytics/, mockGSCResponse(100));

      // WHEN collecting with limit
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
        limit: 25,
      };
      const keywords = await collectFromGSC(options);

      // THEN should return only limited rows
      expect(keywords.length).toBeLessThanOrEqual(25);
    });

    it('should use default date range of 30 days', async () => {
      // GIVEN mock fetch
      const mockFn = mockFetch(/searchAnalytics/, mockGSCResponse(5));

      // WHEN collecting without date range
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };
      await collectFromGSC(options);

      // THEN should use 30-day range
      const requestBody = JSON.parse(mockFn.mock.calls[0][1]?.body);
      const startDate = new Date(requestBody.startDate);
      const endDate = new Date(requestBody.endDate);
      const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      expect(daysDiff).toBeGreaterThanOrEqual(29);
      expect(daysDiff).toBeLessThanOrEqual(31);
    });

    it('should accept custom date range', async () => {
      // GIVEN custom date range
      const mockFn = mockFetch(/searchAnalytics/, mockGSCResponse(5));

      // WHEN collecting with custom dates
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };
      await collectFromGSC(options);

      // THEN should use provided dates
      const requestBody = JSON.parse(mockFn.mock.calls[0][1]?.body);
      expect(requestBody.startDate).toBe('2025-01-01');
      expect(requestBody.endDate).toBe('2025-01-31');
    });
  });

  // ========== DATA TRANSFORMATION ==========

  describe('Data Transformation', () => {
    beforeEach(() => {
      process.env.GSC_ACCESS_TOKEN = 'test-token';
    });

    it('should convert GSC data to KeywordSource format', async () => {
      // GIVEN GSC API response
      const mockData = {
        rows: [
          { keys: ['test keyword'], clicks: 42, impressions: 500, ctr: 0.084, position: 3.5 },
        ],
      };
      mockFetch(/searchAnalytics/, mockData);

      // WHEN collecting keywords
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };
      const keywords = await collectFromGSC(options);

      // THEN should have correct structure
      expect(keywords[0]).toMatchObject({
        keyword: 'test keyword',
        source: 'gsc',
        cacheHit: false,
      });
      expect(keywords[0].discoveredAt).toBeTruthy();
    });

    it('should include metadata (impressions, clicks, position)', async () => {
      // GIVEN GSC data with metrics
      const mockData = {
        rows: [
          { keys: ['keyword 1'], clicks: 100, impressions: 2000, ctr: 0.05, position: 2.3 },
          { keys: ['keyword 2'], clicks: 50, impressions: 1000, ctr: 0.05, position: 4.7 },
        ],
      };
      mockFetch(/searchAnalytics/, mockData);

      // WHEN collecting keywords
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };
      const keywords = await collectFromGSC(options);

      // THEN should include performance metadata
      expect(keywords[0].metadata).toEqual({
        impressions: 2000,
        clicks: 100,
        position: 2.3,
      });
      expect(keywords[1].metadata).toEqual({
        impressions: 1000,
        clicks: 50,
        position: 4.7,
      });
    });

    it('should round numeric values appropriately', async () => {
      // GIVEN GSC data with decimal values
      const mockData = {
        rows: [
          { keys: ['keyword'], clicks: 42.7, impressions: 500.9, ctr: 0.084, position: 3.567 },
        ],
      };
      mockFetch(/searchAnalytics/, mockData);

      // WHEN collecting keywords
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };
      const keywords = await collectFromGSC(options);

      // THEN should round appropriately
      expect(keywords[0].metadata.clicks).toBe(43); // Rounded
      expect(keywords[0].metadata.impressions).toBe(501); // Rounded
      expect(keywords[0].metadata.position).toBe(3.6); // 1 decimal place
    });
  });

  // ========== ERROR HANDLING ==========

  describe('Error Handling', () => {
    beforeEach(() => {
      process.env.GSC_ACCESS_TOKEN = 'test-token';
    });

    it('should handle network timeouts', async () => {
      // GIVEN network timeout
      mockFetch(/searchAnalytics/, {}, { status: 408 });

      // WHEN collecting keywords
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };

      // THEN should throw error
      await expect(collectFromGSC(options)).rejects.toThrow();
    });

    it('should handle 401 unauthorized errors', async () => {
      // GIVEN invalid credentials
      mockFetch(/searchAnalytics/, { error: 'Unauthorized' }, { status: 401 });

      // WHEN collecting keywords
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };

      // THEN should throw error
      await expect(collectFromGSC(options)).rejects.toThrow(/401/);
    });

    it('should handle malformed responses', async () => {
      // GIVEN malformed response
      mockFetch(/searchAnalytics/, { invalid: 'structure' });

      // WHEN collecting keywords
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };
      const keywords = await collectFromGSC(options);

      // THEN should return empty array
      expect(keywords).toEqual([]);
    });

    it('should handle empty results gracefully', async () => {
      // GIVEN no results from GSC
      mockFetch(/searchAnalytics/, { rows: [] });

      // WHEN collecting keywords
      const options: GSCCollectorOptions = {
        taskId: 'test-task',
        siteUrl: 'https://example.com',
      };
      const keywords = await collectFromGSC(options);

      // THEN should return empty array
      expect(keywords).toEqual([]);
    });
  });

  // ========== ADDITIONAL FUNCTIONS ==========

  describe('Helper Functions', () => {
    beforeEach(() => {
      process.env.GSC_ACCESS_TOKEN = 'test-token';
    });

    it('should get list of verified sites', async () => {
      // GIVEN mock sites list
      const mockData = {
        siteEntry: [
          { siteUrl: 'https://example1.com' },
          { siteUrl: 'https://example2.com' },
        ],
      };
      mockFetch(/sites$/, mockData);

      // WHEN getting sites
      const sites = await getGSCSites();

      // THEN should return site URLs
      expect(sites).toEqual(['https://example1.com', 'https://example2.com']);
    });

    it('should get top queries convenience function', async () => {
      // GIVEN mock GSC data
      mockFetch(/searchAnalytics/, mockGSCResponse(50));

      // WHEN getting top queries
      const keywords = await getTopQueries('https://example.com', 25);

      // THEN should return limited keywords
      expect(keywords.length).toBeLessThanOrEqual(25);
      assertValidKeywordSources(keywords);
    });
  });
});
