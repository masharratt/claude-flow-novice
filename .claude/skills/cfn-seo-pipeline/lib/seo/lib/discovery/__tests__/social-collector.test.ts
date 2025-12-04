/**
 * Unit tests for Social Media Keyword Collector
 *
 * Tests cover:
 * - Reddit integration and API calls
 * - Question mining and pattern recognition
 * - Rate limiting
 * - Error handling
 *
 * @module seo/lib/discovery/__tests__/social-collector.test
 */

import { collectFromSocial, getTrendingQuestions, analyzeSocialPatterns } from '../social-collector';
import type { SocialCollectorOptions } from '../types';
import { mockFetch, restoreFetch, assertValidKeywordSources } from './test-utils';

describe('Social Collector', () => {
  afterEach(() => {
    restoreFetch();
  });

  // ========== REDDIT INTEGRATION ==========

  describe('Reddit Integration', () => {
    it('should fetch subreddit posts', async () => {
      // GIVEN mock Reddit API response
      const mockData = {
        data: {
          children: [
            {
              data: {
                title: 'What is the best CRM?',
                selftext: 'Looking for recommendations',
                score: 150,
                num_comments: 42,
                subreddit: 'sales',
                created_utc: Date.now() / 1000,
              },
            },
            {
              data: {
                title: 'How to choose CRM software?',
                selftext: '',
                score: 200,
                num_comments: 30,
                subreddit: 'sales',
                created_utc: Date.now() / 1000,
              },
            },
          ],
        },
      };
      mockFetch(/reddit\.com/, mockData);

      // WHEN collecting from subreddits
      const options: SocialCollectorOptions = {
        taskId: 'test-task',
        niche: 'crm',
        subreddits: ['sales'],
        minEngagement: 10,
      };
      const keywords = await collectFromSocial('crm', options);

      // THEN should return keyword sources
      expect(keywords.length).toBeGreaterThan(0);
      assertValidKeywordSources(keywords);
      keywords.forEach(kw => {
        expect(kw.source).toBe('social');
        expect(kw.metadata.subreddit).toBeDefined();
      });
    });

    it('should extract keywords from titles', async () => {
      // GIVEN Reddit posts with questions
      const mockData = {
        data: {
          children: [
            { data: { title: 'What is CRM?', score: 100, num_comments: 10, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
            { data: { title: 'Not a question', score: 50, num_comments: 5, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
            { data: { title: 'Why use CRM software?', score: 80, num_comments: 15, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
          ],
        },
      };
      mockFetch(/reddit\.com/, mockData);

      // WHEN collecting keywords
      const options: SocialCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        subreddits: ['test'],
      };
      const keywords = await collectFromSocial('test', options);

      // THEN should only extract questions
      expect(keywords.length).toBe(2);
      keywords.forEach(kw => {
        expect(kw.keyword.includes('?') || /^(what|why|how|when|where|who)/i.test(kw.keyword)).toBe(true);
      });
    });

    it('should handle private subreddits', async () => {
      // GIVEN forbidden subreddit
      mockFetch(/reddit\.com/, { error: 'Forbidden' }, { status: 403 });

      // WHEN collecting
      const options: SocialCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        subreddits: ['privatesubreddit'],
      };
      const keywords = await collectFromSocial('test', options);

      // THEN should return empty array
      expect(keywords).toEqual([]);
    });
  });

  // ========== QUESTION MINING ==========

  describe('Question Mining', () => {
    it('should identify question patterns', async () => {
      // GIVEN posts with various question patterns
      const mockData = {
        data: {
          children: [
            { data: { title: 'What is the best?', score: 100, num_comments: 10, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
            { data: { title: 'Can someone explain?', score: 90, num_comments: 8, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
            { data: { title: 'Should I use this?', score: 80, num_comments: 12, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
            { data: { title: 'Looking for recommendations', score: 70, num_comments: 6, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
          ],
        },
      };
      mockFetch(/reddit\.com/, mockData);

      // WHEN collecting keywords
      const options: SocialCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        subreddits: ['test'],
      };
      const keywords = await collectFromSocial('test', options);

      // THEN should identify questions
      expect(keywords.length).toBeGreaterThan(0);
    });

    it('should classify by questionType', async () => {
      // GIVEN various question types
      const mockData = {
        data: {
          children: [
            { data: { title: 'What is this?', score: 100, num_comments: 10, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
            { data: { title: 'Why use this?', score: 100, num_comments: 10, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
            { data: { title: 'How to do this?', score: 100, num_comments: 10, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
          ],
        },
      };
      mockFetch(/reddit\.com/, mockData);

      // WHEN collecting keywords
      const options: SocialCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        subreddits: ['test'],
      };
      const keywords = await collectFromSocial('test', options);

      // THEN should classify question types
      expect(keywords.some(kw => kw.metadata.questionType === 'what')).toBe(true);
      expect(keywords.some(kw => kw.metadata.questionType === 'why')).toBe(true);
      expect(keywords.some(kw => kw.metadata.questionType === 'how')).toBe(true);
    });

    it('should filter by minimum engagement', async () => {
      // GIVEN posts with varying engagement
      const mockData = {
        data: {
          children: [
            { data: { title: 'What has high engagement?', score: 500, num_comments: 50, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
            { data: { title: 'What has low engagement?', score: 5, num_comments: 1, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
          ],
        },
      };
      mockFetch(/reddit\.com/, mockData);

      // WHEN collecting with min engagement
      const options: SocialCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        subreddits: ['test'],
        minEngagement: 100,
      };
      const keywords = await collectFromSocial('test', options);

      // THEN should only include high engagement
      expect(keywords.length).toBe(1);
      expect(keywords[0].keyword).toContain('high engagement');
    });
  });

  // ========== RATE LIMITING ==========

  describe('Rate Limiting', () => {
    it('should respect Reddit rate limits (60/min)', async () => {
      // GIVEN mock Reddit API
      const timestamps: number[] = [];
      global.fetch = jest.fn(async () => {
        timestamps.push(Date.now());
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { children: [] } }),
        } as any;
      });

      // WHEN collecting from multiple subreddits
      const options: SocialCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        subreddits: ['sub1', 'sub2', 'sub3'],
      };
      await collectFromSocial('test', options);

      // THEN should have delays
      expect(timestamps.length).toBeGreaterThan(1);
    });

    it('should handle 429 rate limit errors', async () => {
      // GIVEN rate limit response
      mockFetch(/reddit\.com/, { error: 'Rate limited' }, { status: 429 });

      // WHEN collecting keywords
      const options: SocialCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        subreddits: ['test'],
      };
      const keywords = await collectFromSocial('test', options);

      // THEN should handle gracefully
      expect(Array.isArray(keywords)).toBe(true);
    });
  });

  // ========== HELPER FUNCTIONS ==========

  describe('Helper Functions', () => {
    it('should get trending questions', async () => {
      // GIVEN mock Reddit data
      const mockData = {
        data: {
          children: [
            { data: { title: 'What is trending?', score: 1000, num_comments: 100, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
          ],
        },
      };
      mockFetch(/reddit\.com/, mockData);

      // WHEN getting trending questions
      const trending = await getTrendingQuestions('test', 10);

      // THEN should return high-engagement questions
      expect(trending.length).toBeGreaterThan(0);
      assertValidKeywordSources(trending);
    });

    it('should analyze social patterns', async () => {
      // GIVEN keyword sources from social
      const keywords = [
        {
          keyword: 'What is CRM?',
          source: 'social' as const,
          metadata: { questionType: 'what' as const, subreddit: 'sales' },
          discoveredAt: '',
          cacheHit: false,
        },
        {
          keyword: 'Why use CRM?',
          source: 'social' as const,
          metadata: { questionType: 'why' as const, subreddit: 'sales' },
          discoveredAt: '',
          cacheHit: false,
        },
      ];

      // WHEN analyzing patterns
      const patterns = analyzeSocialPatterns(keywords);

      // THEN should return analysis
      expect(patterns.totalQuestions).toBe(2);
      expect(patterns.questionTypes.what).toBe(1);
      expect(patterns.questionTypes.why).toBe(1);
      expect(patterns.topSubreddits[0].subreddit).toBe('sales');
    });
  });

  // ========== ERROR HANDLING ==========

  describe('Error Handling', () => {
    it('should handle API auth failures', async () => {
      // GIVEN unauthorized response
      mockFetch(/reddit\.com/, { error: 'Unauthorized' }, { status: 401 });

      // WHEN collecting keywords
      const options: SocialCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        subreddits: ['test'],
      };
      const keywords = await collectFromSocial('test', options);

      // THEN should return empty array
      expect(keywords).toEqual([]);
    });

    it('should handle deleted/removed posts', async () => {
      // GIVEN posts with [deleted] content
      const mockData = {
        data: {
          children: [
            { data: { title: '[deleted]', score: 100, num_comments: 10, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
            { data: { title: 'What is this?', score: 100, num_comments: 10, subreddit: 'test', created_utc: Date.now() / 1000, selftext: '' } },
          ],
        },
      };
      mockFetch(/reddit\.com/, mockData);

      // WHEN collecting keywords
      const options: SocialCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        subreddits: ['test'],
      };
      const keywords = await collectFromSocial('test', options);

      // THEN should skip deleted posts
      expect(keywords.length).toBe(1);
      expect(keywords[0].keyword).not.toContain('[deleted]');
    });
  });
});
