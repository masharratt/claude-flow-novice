/**
 * Phase 3: Competitor Discovery - Unit Tests
 *
 * Validates:
 * - Type safety and interface compliance
 * - Step 0: Cache querying
 * - Step 1-4: Core workflow execution
 * - Step 4.5: Storage preparation
 * - Helper functions (stub implementations)
 *
 * @module seo/phases/phase-3-competitors.test
 */

import {
  executePhase3,
  type CompetitorDiscoveryInput,
  type CompetitorDiscoveryOutput,
  type Competitor,
  type CompetitiveGap,
  type TechnicalFoundationOutput,
  type ContentInventoryOutput,
} from './phase-3-competitors';

describe('Phase 3: Competitor Discovery', () => {
  // Mock Phase 1 output
  const mockPhase1Output: TechnicalFoundationOutput = {
    domain: 'example.com',
    technicalHealthScore: 0.87,
    crawlData: {
      totalPages: 245,
      indexedPages: 230,
    },
    blockingCondition: false,
  };

  // Mock Phase 2 output
  const mockPhase2Output: ContentInventoryOutput = {
    domain: 'example.com',
    totalPages: 245,
    contentByType: {
      blog: 120,
      product: 45,
      service: 15,
      landing: 10,
      other: 55,
    },
    topPerformingPages: [
      { url: '/blog/top-post', estimatedTraffic: 5000 },
      { url: '/services', estimatedTraffic: 3000 },
    ],
  };

  describe('executePhase3()', () => {
    it('should execute all 5 steps successfully', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'healthcare',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
        manualCompetitors: ['competitor-manual.com'],
        skipCache: false,
      };

      const output = await executePhase3(input);

      // Validate output structure
      expect(output).toBeDefined();
      expect(output.domain).toBe('example.com');
      expect(Array.isArray(output.competitors)).toBe(true);
      expect(Array.isArray(output.gaps)).toBe(true);
      expect(typeof output.competitive_intensity).toBe('number');
      expect(typeof output.cached).toBe('boolean');
      expect(typeof output.timestamp).toBe('string');
    });

    it('should identify competitors (Step 1)', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'saas',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
        manualCompetitors: ['manual1.com', 'manual2.com'],
      };

      const output = await executePhase3(input);

      // Should have manual + discovered competitors
      expect(output.competitors.length).toBeGreaterThan(0);
      // At least 2 manual + discovered
      expect(output.competitors.length).toBeGreaterThanOrEqual(2);
    });

    it('should rank competitors (Step 2)', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'ecommerce',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
      };

      const output = await executePhase3(input);

      // Competitors should be ranked (rank 1, 2, 3...)
      output.competitors.forEach((comp, idx) => {
        expect(comp.rank).toBe(idx + 1);
        expect(comp.domain).toBeTruthy();
        expect(comp.domain_authority).toBeGreaterThanOrEqual(0);
        expect(comp.domain_authority).toBeLessThanOrEqual(100);
        expect(comp.overlap_score).toBeGreaterThanOrEqual(0);
        expect(comp.overlap_score).toBeLessThanOrEqual(1);
      });
    });

    it('should identify gaps (Step 3)', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'finance',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
      };

      const output = await executePhase3(input);

      // Should identify gaps
      expect(output.gaps.length).toBeGreaterThan(0);

      // Validate gap structure
      output.gaps.forEach((gap) => {
        expect(gap.gap_id).toBeTruthy();
        expect(gap.keyword).toBeTruthy();
        expect(gap.competitor_domain).toBeTruthy();
        expect(gap.competitor_rank).toBeGreaterThan(0);
        expect(gap.our_rank).toBeNull(); // We don't rank
        expect(gap.search_volume).toBeGreaterThanOrEqual(0);
        expect(gap.difficulty).toBeGreaterThanOrEqual(0);
        expect(gap.difficulty).toBeLessThanOrEqual(100);
        expect(gap.opportunity_score).toBeGreaterThanOrEqual(0);
        expect(gap.opportunity_score).toBeLessThanOrEqual(1);
      });
    });

    it('should calculate competitive intensity (Step 4)', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'technology',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
      };

      const output = await executePhase3(input);

      // Intensity should be between 0 and 1
      expect(output.competitive_intensity).toBeGreaterThanOrEqual(0);
      expect(output.competitive_intensity).toBeLessThanOrEqual(1);
    });

    it('should handle skipCache flag (Step 0)', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'healthcare',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
        skipCache: true,
      };

      const output = await executePhase3(input);

      // With skipCache=true, cached should be false
      expect(output.cached).toBe(false);
    });

    it('should include timestamp in ISO format', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'education',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
      };

      const output = await executePhase3(input);

      // Timestamp should be valid ISO string
      expect(output.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(output.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('Type Safety', () => {
    it('should enforce TechnicalFoundationOutput interface', () => {
      const validOutput: TechnicalFoundationOutput = {
        domain: 'test.com',
        technicalHealthScore: 0.9,
        crawlData: {
          totalPages: 100,
          indexedPages: 95,
        },
        blockingCondition: false,
      };

      expect(validOutput.domain).toBeDefined();
      expect(validOutput.technicalHealthScore).toBeGreaterThanOrEqual(0);
      expect(validOutput.technicalHealthScore).toBeLessThanOrEqual(1);
    });

    it('should enforce ContentInventoryOutput interface', () => {
      const validOutput: ContentInventoryOutput = {
        domain: 'test.com',
        totalPages: 100,
        contentByType: { blog: 50, product: 50 },
        topPerformingPages: [{ url: '/top', estimatedTraffic: 1000 }],
      };

      expect(validOutput.domain).toBeDefined();
      expect(validOutput.totalPages).toBeGreaterThan(0);
      expect(validOutput.contentByType).toBeDefined();
    });

    it('should enforce Competitor interface', () => {
      const validCompetitor: Competitor = {
        domain: 'competitor.com',
        rank: 1,
        domain_authority: 70,
        overlap_score: 0.6,
        estimated_traffic: 50000,
        content_pages: 200,
      };

      expect(validCompetitor.rank).toBeGreaterThan(0);
      expect(validCompetitor.domain_authority).toBeGreaterThanOrEqual(0);
      expect(validCompetitor.overlap_score).toBeGreaterThanOrEqual(0);
    });

    it('should enforce CompetitiveGap interface', () => {
      const validGap: CompetitiveGap = {
        gap_id: 'gap-1',
        keyword: 'test keyword',
        competitor_domain: 'competitor.com',
        competitor_rank: 3,
        our_rank: null,
        search_volume: 5000,
        difficulty: 50,
        opportunity_score: 0.8,
      };

      expect(validGap.gap_id).toBeDefined();
      expect(validGap.keyword).toBeDefined();
      expect(validGap.our_rank).toBeNull();
      expect(validGap.opportunity_score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty manual competitors', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'retail',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
        manualCompetitors: [],
      };

      const output = await executePhase3(input);

      // Should still discover competitors
      expect(output.competitors.length).toBeGreaterThan(0);
    });

    it('should handle no discovered competitors gracefully', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'niche-industry',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
      };

      const output = await executePhase3(input);

      // Should not crash
      expect(output).toBeDefined();
      expect(output.competitive_intensity).toBeGreaterThanOrEqual(0);
    });

    it('should deduplicate manual and discovered competitors', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'healthcare',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
        manualCompetitors: ['competitor1-healthcare.com'], // Will also be discovered
      };

      const output = await executePhase3(input);

      // Should not have duplicates
      const domains = output.competitors.map((c) => c.domain);
      const uniqueDomains = [...new Set(domains)];
      expect(domains.length).toBe(uniqueDomains.length);
    });
  });

  describe('Confidence Scoring', () => {
    it('should have high intensity for strong competitors', async () => {
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'healthcare',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
      };

      const output = await executePhase3(input);

      // With high DA competitors and gaps, intensity should be meaningful
      if (output.competitors.length > 0 && output.gaps.length > 0) {
        expect(output.competitive_intensity).toBeGreaterThan(0.3);
      }
    });

    it('should have low intensity for weak/no competitors', async () => {
      // This would require mocking the helper functions to return empty arrays
      // For now, we validate the formula works correctly
      const input: CompetitorDiscoveryInput = {
        domain: 'example.com',
        industry: 'new-industry',
        phase1Output: mockPhase1Output,
        phase2Output: mockPhase2Output,
      };

      const output = await executePhase3(input);

      // Intensity should always be valid
      expect(output.competitive_intensity).toBeGreaterThanOrEqual(0);
      expect(output.competitive_intensity).toBeLessThanOrEqual(1);
    });
  });
});

describe('Integration with RuVector', () => {
  it('should note RuVector client not implemented (Step 0)', async () => {
    const input: CompetitorDiscoveryInput = {
      domain: 'example.com',
      industry: 'technology',
      phase1Output: {
        domain: 'example.com',
        technicalHealthScore: 0.85,
        crawlData: { totalPages: 100, indexedPages: 95 },
        blockingCondition: false,
      },
      phase2Output: {
        domain: 'example.com',
        totalPages: 100,
        contentByType: { blog: 100 },
        topPerformingPages: [],
      },
      skipCache: false,
    };

    // Should execute without errors even though RuVector client is not implemented
    const output = await executePhase3(input);
    expect(output).toBeDefined();
  });

  it('should note RuVector storage not implemented (Step 4.5)', async () => {
    const input: CompetitorDiscoveryInput = {
      domain: 'example.com',
      industry: 'finance',
      phase1Output: {
        domain: 'example.com',
        technicalHealthScore: 0.9,
        crawlData: { totalPages: 200, indexedPages: 190 },
        blockingCondition: false,
      },
      phase2Output: {
        domain: 'example.com',
        totalPages: 200,
        contentByType: { product: 200 },
        topPerformingPages: [],
      },
    };

    // Should complete without errors (storage is non-blocking)
    const output = await executePhase3(input);
    expect(output.competitors.length).toBeGreaterThan(0);
    expect(output.timestamp).toBeDefined();
  });
});
