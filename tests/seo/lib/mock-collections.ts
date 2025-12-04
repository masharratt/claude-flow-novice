#!/usr/bin/env tsx
/**
 * Mock RuVector Collections for Test Execution
 *
 * Provides mock implementations of ContentPatternsCollection and
 * CompetitorIntelligenceCollection for testing Phase 6 and Phase 7.
 *
 * Sprint 1.4 - BUG #21 Prevention
 */

import type {
  ContentPatternEntry,
  CompetitorIntelligenceEntry,
  ContentPatternType,
} from '../../../.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/schemas.ts';

/**
 * Mock ContentPatternsCollection for testing
 */
export class MockContentPatternsCollection {
  private patterns: ContentPatternEntry[] = [];

  constructor() {
    // Pre-populate with test patterns
    this.patterns = [
      {
        id: 'angle:test-pattern-1',
        text: 'ANGLE: Beginner-friendly guides with video tutorials. Niche: genealogy. Success: 0.85',
        metadata: {
          type: 'ANGLE' as ContentPatternType,
          description: 'Beginner-friendly guides with video tutorials',
          example: 'How to Start Your Family Tree: A Complete Beginner\'s Guide',
          niche: 'genealogy',
          format: 'guide',
          confidenceScore: 0.85,
          articleIds: ['art-001', 'art-002'],
          createdAt: new Date('2024-01-15'),
          lastUsed: new Date('2024-11-01'),
          useCount: 12,
          successCount: 10,
          performanceMetrics: {
            avgPosition: 3.2,
            avgCTR: 0.045,
            avgTimeOnPage: 245,
          },
        },
      },
      {
        id: 'structure:test-pattern-2',
        text: 'STRUCTURE: Comparison-style content with tables. Niche: genealogy-software. Success: 0.78',
        metadata: {
          type: 'STRUCTURE' as ContentPatternType,
          description: 'Comparison-style content with feature tables',
          example: 'Top 10 Genealogy Software Tools Compared',
          niche: 'genealogy-software',
          format: 'comparison',
          confidenceScore: 0.78,
          articleIds: ['art-003'],
          createdAt: new Date('2024-02-20'),
          lastUsed: new Date('2024-10-15'),
          useCount: 8,
          successCount: 6,
        },
      },
      {
        id: 'depth:test-pattern-3',
        text: 'DEPTH: Comprehensive research guides with step-by-step instructions. Niche: family-history. Success: 0.92',
        metadata: {
          type: 'DEPTH' as ContentPatternType,
          description: 'Comprehensive research guides with detailed steps',
          example: 'The Complete Guide to Immigration Records Research',
          niche: 'family-history',
          format: 'tutorial',
          confidenceScore: 0.92,
          articleIds: ['art-004', 'art-005'],
          createdAt: new Date('2024-03-10'),
          lastUsed: new Date('2024-11-15'),
          useCount: 15,
          successCount: 14,
        },
      },
    ];
  }

  async search(params: {
    queryText: string;
    limit?: number;
    minConfidence?: number;
  }): Promise<ContentPatternEntry[]> {
    const { queryText, limit = 20, minConfidence = 0.7 } = params;

    // Simple keyword-based filtering for testing
    const filtered = this.patterns.filter((pattern) => {
      const matchesQuery =
        pattern.text.toLowerCase().includes(queryText.toLowerCase()) ||
        pattern.metadata.niche.toLowerCase().includes(queryText.toLowerCase()) ||
        pattern.metadata.description.toLowerCase().includes(queryText.toLowerCase());

      const meetsConfidence = pattern.metadata.confidenceScore >= minConfidence;

      return matchesQuery && meetsConfidence;
    });

    // Sort by confidence score (highest first)
    filtered.sort((a, b) => b.metadata.confidenceScore - a.metadata.confidenceScore);

    return filtered.slice(0, limit);
  }

  /**
   * Add a test pattern (for test-specific setup)
   */
  addPattern(pattern: ContentPatternEntry): void {
    this.patterns.push(pattern);
  }
}

/**
 * Mock CompetitorIntelligenceCollection for testing
 */
export class MockCompetitorIntelligenceCollection {
  private entries: CompetitorIntelligenceEntry[] = [];

  constructor() {
    // Pre-populate with test entries
    this.entries = [
      {
        id: 'competitor1.com:genealogy',
        text: 'Analysis of competitor1.com in genealogy. Architecture: /blog/{category}/{slug}, /resources/{topic}. Gaps: beginner tutorials, video content, mobile app integration',
        metadata: {
          domain: 'competitor1.com',
          niche: 'genealogy',
          architecturePatterns: [
            {
              urlStructure: '/blog/{category}/{slug}',
              hierarchy: 'Category-based blog structure',
              categoryPages: 12,
            },
            {
              urlStructure: '/resources/{topic}',
              hierarchy: 'Flat resource pages',
              categoryPages: 8,
            },
          ],
          contentStrategy: [
            {
              avgWordCount: 2500,
              contentType: 'how-to',
              publishFrequency: '3 per week',
              topFormats: ['guide', 'tutorial', 'comparison'],
              pageCount: 145,
              headingStructures: ['H2 → H3 → H4', 'FAQ sections'],
            },
          ],
          hubPages: [
            {
              url: '/blog/genealogy-101',
              topic: 'Beginner Genealogy',
              internalLinks: 45,
            },
          ],
          internalLinkingPatterns: [
            'Contextual links in paragraphs',
            'Related articles sidebar',
            'Category hub pages',
          ],
          contentGaps: [
            {
              topic: 'beginner tutorials',
              priority: 'high',
              opportunity: 'Lack of step-by-step beginner content',
            },
            {
              topic: 'video content',
              priority: 'high',
              opportunity: 'No video tutorials or walkthroughs',
            },
            {
              topic: 'mobile app integration',
              priority: 'medium',
              opportunity: 'Limited mobile-specific content',
            },
          ],
          estimatedAuthority: 65,
          clusterId: 'cluster-001',
          createdAt: new Date('2024-09-01'),
          expiresAt: new Date('2025-03-01'),
          freshnessScore: 0.75,
        },
      },
      {
        id: 'competitor2.com:family-history',
        text: 'Analysis of competitor2.com in family-history. Architecture: /articles/{year}/{month}/{slug}. Gaps: DNA research guides, international records',
        metadata: {
          domain: 'competitor2.com',
          niche: 'family-history',
          architecturePatterns: [
            {
              urlStructure: '/articles/{year}/{month}/{slug}',
              hierarchy: 'Date-based article structure',
              categoryPages: 24,
            },
          ],
          contentStrategy: [
            {
              avgWordCount: 1800,
              contentType: 'informational',
              publishFrequency: '5 per week',
              topFormats: ['news', 'update', 'announcement'],
              pageCount: 320,
              headingStructures: ['H2 → H3'],
            },
          ],
          hubPages: [],
          internalLinkingPatterns: ['Archive pages', 'Tag pages'],
          contentGaps: [
            {
              topic: 'DNA research guides',
              priority: 'high',
              opportunity: 'Missing comprehensive DNA testing content',
            },
            {
              topic: 'international records',
              priority: 'medium',
              opportunity: 'Limited coverage of non-US records',
            },
          ],
          estimatedAuthority: 58,
          createdAt: new Date('2024-10-01'),
          expiresAt: new Date('2025-04-01'),
          freshnessScore: 0.85,
        },
      },
    ];
  }

  async search(params: {
    queryText: string;
    limit?: number;
    minFreshnessScore?: number;
  }): Promise<CompetitorIntelligenceEntry[]> {
    const { queryText, limit = 10, minFreshnessScore = 0.5 } = params;

    // Simple keyword-based filtering for testing
    const filtered = this.entries.filter((entry) => {
      const matchesQuery =
        entry.text.toLowerCase().includes(queryText.toLowerCase()) ||
        entry.metadata.niche.toLowerCase().includes(queryText.toLowerCase()) ||
        entry.metadata.domain.toLowerCase().includes(queryText.toLowerCase());

      const meetsFreshness = entry.metadata.freshnessScore >= minFreshnessScore;

      return matchesQuery && meetsFreshness;
    });

    // Sort by freshness score (highest first)
    filtered.sort((a, b) => b.metadata.freshnessScore - a.metadata.freshnessScore);

    return filtered.slice(0, limit);
  }

  /**
   * Add a test entry (for test-specific setup)
   */
  addEntry(entry: CompetitorIntelligenceEntry): void {
    this.entries.push(entry);
  }
}

/**
 * Create mock collections for testing
 */
export function createMockCollections() {
  return {
    contentPatterns: new MockContentPatternsCollection(),
    competitorIntelligence: new MockCompetitorIntelligenceCollection(),
  };
}
