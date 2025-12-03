/**
 * Opportunity Scorer Tests
 *
 * Tests scoring factors, pattern matching, and ranking logic.
 *
 * @jest-environment node
 */

import { OpportunityScorer, type KeywordOpportunity } from '../opportunity-scorer';

/**
 * Create test opportunity
 */
function createOpportunity(overrides?: Partial<KeywordOpportunity>): KeywordOpportunity {
  return {
    keyword: 'test keyword',
    searchVolume: 2000,
    difficulty: 0.4,
    currentPosition: 15,
    trend: 'stable' as const,
    ...overrides,
  };
}

describe('OpportunityScorer', () => {
  let scorer: OpportunityScorer;

  beforeEach(() => {
    scorer = new OpportunityScorer({
      verbose: false,
      minSearchVolume: 50,
      maxDifficulty: 0.8,
    });
  });

  describe('Initialization', () => {
    it('should create with default config', () => {
      expect(scorer).toBeDefined();
      const config = scorer.getConfig();
      expect(config.volumeDifficultyWeight).toBe(0.3);
      expect(config.gapBonusWeight).toBe(0.25);
    });

    it('should create with custom config', () => {
      const customScorer = new OpportunityScorer({
        volumeDifficultyWeight: 0.35,
        gapBonusWeight: 0.25,
        trendBonusWeight: 0.15,
        quickWinBonusWeight: 0.1,
        intentBonusWeight: 0.05,
        patternMatchBonusWeight: 0.05,
        historicalSuccessBonusWeight: 0.05,
        minSearchVolume: 500,
      });

      const config = customScorer.getConfig();
      expect(config.volumeDifficultyWeight).toBe(0.35);
      expect(config.minSearchVolume).toBe(500);
    });

    it('should update config', () => {
      scorer.updateConfig({ minSearchVolume: 200 });

      const config = scorer.getConfig();
      expect(config.minSearchVolume).toBe(200);
    });
  });

  describe('Volume/Difficulty Scoring', () => {
    it('should score high volume, low difficulty as excellent', async () => {
      const opp = createOpportunity({
        searchVolume: 5000,
        difficulty: 0.2,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.volumeDifficultyScore).toBeGreaterThan(0.8);
    });

    it('should score low volume as poor', async () => {
      const opp = createOpportunity({
        searchVolume: 20,
        difficulty: 0.3,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.volumeDifficultyScore).toBe(0);
    });

    it('should score high difficulty as poor', async () => {
      const opp = createOpportunity({
        searchVolume: 5000,
        difficulty: 0.9,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.volumeDifficultyScore).toBeLessThan(0.2);
    });

    it('should cap score at 1.0', async () => {
      const opp = createOpportunity({
        searchVolume: 20000,
        difficulty: 0.1,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.volumeDifficultyScore).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Gap Bonus', () => {
    it('should award max bonus when site doesn\'t rank', async () => {
      const opp = createOpportunity({
        currentPosition: null,
        hasGap: true,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.gapBonus).toBe(0.3);
    });

    it('should award moderate bonus for page 2 position', async () => {
      const opp = createOpportunity({
        currentPosition: 15,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.gapBonus).toBe(0.15);
    });

    it('should award no bonus for page 1', async () => {
      const opp = createOpportunity({
        currentPosition: 8,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.gapBonus).toBe(0);
    });
  });

  describe('Trend Bonus', () => {
    it('should award max bonus for growing keywords', async () => {
      const opp = createOpportunity({
        trend: 'growing',
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.trendBonus).toBe(0.15);
    });

    it('should award moderate bonus for stable keywords', async () => {
      const opp = createOpportunity({
        trend: 'stable',
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.trendBonus).toBe(0.08);
    });

    it('should award no bonus for declining keywords', async () => {
      const opp = createOpportunity({
        trend: 'declining',
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.trendBonus).toBe(0);
    });
  });

  describe('Quick Win Bonus', () => {
    it('should award bonus for low difficulty + page 2', async () => {
      const opp = createOpportunity({
        difficulty: 0.3,
        currentPosition: 15,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.quickWinBonus).toBe(0.1);
    });

    it('should not award bonus for high difficulty', async () => {
      const opp = createOpportunity({
        difficulty: 0.5,
        currentPosition: 15,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.quickWinBonus).toBe(0);
    });

    it('should not award bonus for page 1', async () => {
      const opp = createOpportunity({
        difficulty: 0.3,
        currentPosition: 5,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.quickWinBonus).toBe(0);
    });
  });

  describe('Intent Alignment Bonus', () => {
    it('should award bonus proportional to alignment', async () => {
      const opp = createOpportunity({
        intentAlignment: 1.0, // 100% aligned
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.intentBonus).toBe(0.1);
    });

    it('should award half bonus for 50% alignment', async () => {
      const opp = createOpportunity({
        intentAlignment: 0.5,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.intentBonus).toBeCloseTo(0.05, 2);
    });

    it('should award no bonus for no alignment', async () => {
      const opp = createOpportunity({
        intentAlignment: 0,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.intentBonus).toBe(0);
    });
  });

  describe('Final Score Calculation', () => {
    it('should calculate score as weighted sum', async () => {
      const opp = createOpportunity({
        searchVolume: 3000,
        difficulty: 0.35,
        currentPosition: 14,
        trend: 'growing' as const,
        intentAlignment: 0.8,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.finalScore).toBeGreaterThan(0);
      expect(factors.finalScore).toBeLessThanOrEqual(1.0);
      expect(factors.confidence).toBeGreaterThanOrEqual(0.7);
      expect(factors.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should cap final score at 1.0', async () => {
      const opp = createOpportunity({
        searchVolume: 10000,
        difficulty: 0.1,
        currentPosition: null,
        hasGap: true,
        trend: 'growing',
        intentAlignment: 1.0,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.finalScore).toBeLessThanOrEqual(1.0);
    });

    it('should provide explanation', async () => {
      const opp = createOpportunity();

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.explanation).toBeDefined();
      expect(Array.isArray(factors.explanation)).toBe(true);
      expect(factors.explanation.length).toBeGreaterThan(0);
    });
  });

  describe('Ranking Multiple Keywords', () => {
    it('should rank keywords by final score', async () => {
      const opportunities: KeywordOpportunity[] = [
        createOpportunity({
          keyword: 'easy keyword',
          searchVolume: 5000,
          difficulty: 0.2,
          currentPosition: null,
        }),
        createOpportunity({
          keyword: 'hard keyword',
          searchVolume: 5000,
          difficulty: 0.8,
          currentPosition: 5,
        }),
        createOpportunity({
          keyword: 'medium keyword',
          searchVolume: 2000,
          difficulty: 0.4,
          currentPosition: 15,
        }),
      ];

      const ranked = await scorer.scoreAndRank(opportunities);

      // First should be highest score
      expect(ranked[0].scoring.finalScore).toBeGreaterThanOrEqual(
        ranked[1].scoring.finalScore,
      );
      expect(ranked[1].scoring.finalScore).toBeGreaterThanOrEqual(
        ranked[2].scoring.finalScore,
      );
    });

    it('should return top N results', async () => {
      const opportunities: KeywordOpportunity[] = [
        createOpportunity({ keyword: 'kw1', searchVolume: 1000 }),
        createOpportunity({ keyword: 'kw2', searchVolume: 2000 }),
        createOpportunity({ keyword: 'kw3', searchVolume: 3000 }),
        createOpportunity({ keyword: 'kw4', searchVolume: 4000 }),
        createOpportunity({ keyword: 'kw5', searchVolume: 5000 }),
      ];

      const ranked = await scorer.scoreAndRank(opportunities, 3);

      expect(ranked.length).toBe(3);
    });

    it('should handle empty list', async () => {
      const ranked = await scorer.scoreAndRank([]);

      expect(ranked).toEqual([]);
    });
  });

  describe('Score Interpretation', () => {
    const interpretScore = (score: number): string => {
      if (score >= 0.8) return 'excellent';
      if (score >= 0.6) return 'very_good';
      if (score >= 0.4) return 'good';
      if (score >= 0.2) return 'moderate';
      return 'poor';
    };

    it('should interpret excellent opportunities', async () => {
      const opp = createOpportunity({
        searchVolume: 8000,
        difficulty: 0.2,
        currentPosition: null,
        hasGap: true,
        trend: 'growing',
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(interpretScore(factors.finalScore)).toBe('excellent');
    });

    it('should interpret poor opportunities', async () => {
      const opp = createOpportunity({
        searchVolume: 50,
        difficulty: 0.9,
        currentPosition: 3,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(interpretScore(factors.finalScore)).toMatch(/moderate|poor/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing optional fields', async () => {
      const minimal: KeywordOpportunity = {
        keyword: 'minimal',
        searchVolume: 1000,
        difficulty: 0.5,
      };

      const factors = await scorer.scoreOpportunity(minimal);

      expect(factors.finalScore).toBeGreaterThan(0);
      expect(factors.finalScore).toBeLessThanOrEqual(1.0);
    });

    it('should handle zero search volume', async () => {
      const opp = createOpportunity({
        searchVolume: 0,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.volumeDifficultyScore).toBe(0);
    });

    it('should handle extreme difficulty values', async () => {
      const opp = createOpportunity({
        searchVolume: 5000,
        difficulty: 1.0,
      });

      const factors = await scorer.scoreOpportunity(opp);

      expect(factors.volumeDifficultyScore).toBeLessThan(0.2);
    });

    it('should handle negative current position gracefully', async () => {
      const opp = createOpportunity({
        currentPosition: -1,
      });

      const factors = await scorer.scoreOpportunity(opp);

      // Should still calculate score
      expect(factors.finalScore).toBeGreaterThan(0);
    });
  });

  describe('Verbose Logging', () => {
    it('should log when verbose enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const verboseScorer = new OpportunityScorer({
        verbose: true,
      });

      const opp = createOpportunity();
      await verboseScorer.scoreOpportunity(opp);

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should not log when verbose disabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const opp = createOpportunity();
      await scorer.scoreOpportunity(opp);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Weight Validation and Normalization', () => {
    describe('Default Weights', () => {
      it('should create scorer with default weights that sum to 1.0', () => {
        const defaultScorer = new OpportunityScorer();
        const config = defaultScorer.getConfig();

        const totalWeight =
          config.volumeDifficultyWeight +
          config.gapBonusWeight +
          config.trendBonusWeight +
          config.quickWinBonusWeight +
          config.intentBonusWeight +
          config.patternMatchBonusWeight +
          config.historicalSuccessBonusWeight;

        expect(Math.abs(totalWeight - 1.0)).toBeLessThanOrEqual(0.01);
      });

      it('should verify individual default weight values', () => {
        const defaultScorer = new OpportunityScorer();
        const config = defaultScorer.getConfig();

        expect(config.volumeDifficultyWeight).toBe(0.3);
        expect(config.gapBonusWeight).toBe(0.25);
        expect(config.trendBonusWeight).toBe(0.15);
        expect(config.quickWinBonusWeight).toBe(0.1);
        expect(config.intentBonusWeight).toBe(0.05);
        expect(config.patternMatchBonusWeight).toBe(0.1);
        expect(config.historicalSuccessBonusWeight).toBe(0.05);
      });
    });

    describe('Custom Weights Validation', () => {
      it('should accept custom weights that sum to 1.0', () => {
        expect(
          () =>
            new OpportunityScorer({
              volumeDifficultyWeight: 0.35,
              gapBonusWeight: 0.25,
              trendBonusWeight: 0.15,
              quickWinBonusWeight: 0.1,
              intentBonusWeight: 0.05,
              patternMatchBonusWeight: 0.05,
              historicalSuccessBonusWeight: 0.05,
            }),
        ).not.toThrow();
      });

      it('should throw error when weights sum to greater than 1.0', () => {
        expect(
          () =>
            new OpportunityScorer({
              volumeDifficultyWeight: 0.5,
              gapBonusWeight: 0.5,
              trendBonusWeight: 0.2,
              quickWinBonusWeight: 0.1,
              intentBonusWeight: 0.05,
              patternMatchBonusWeight: 0.1,
              historicalSuccessBonusWeight: 0.05,
            }),
        ).toThrow(/weights sum to/);
      });

      it('should throw error when weights sum to less than 1.0', () => {
        expect(
          () =>
            new OpportunityScorer({
              volumeDifficultyWeight: 0.2,
              gapBonusWeight: 0.15,
              trendBonusWeight: 0.1,
              quickWinBonusWeight: 0.05,
              intentBonusWeight: 0.02,
              patternMatchBonusWeight: 0.03,
              historicalSuccessBonusWeight: 0.02,
            }),
        ).toThrow(/weights sum to/);
      });

      it('should throw error with detailed weight summary on validation failure', () => {
        expect(
          () =>
            new OpportunityScorer({
              volumeDifficultyWeight: 0.6,
              gapBonusWeight: 0.3,
              trendBonusWeight: 0.15,
              quickWinBonusWeight: 0.1,
              intentBonusWeight: 0.05,
              patternMatchBonusWeight: 0.1,
              historicalSuccessBonusWeight: 0.05,
            }),
        ).toThrow(/volumeDifficultyWeight.*gapBonusWeight.*historicalSuccessBonusWeight/);
      });

      it('should allow weights within 0.01 tolerance of 1.0 (upper bound)', () => {
        expect(
          () =>
            new OpportunityScorer({
              volumeDifficultyWeight: 0.3,
              gapBonusWeight: 0.25,
              trendBonusWeight: 0.15,
              quickWinBonusWeight: 0.1,
              intentBonusWeight: 0.05,
              patternMatchBonusWeight: 0.105,
              historicalSuccessBonusWeight: 0.045,
            }),
        ).not.toThrow();
      });

      it('should allow weights within 0.01 tolerance of 1.0 (lower bound)', () => {
        expect(
          () =>
            new OpportunityScorer({
              volumeDifficultyWeight: 0.3,
              gapBonusWeight: 0.25,
              trendBonusWeight: 0.15,
              quickWinBonusWeight: 0.1,
              intentBonusWeight: 0.05,
              patternMatchBonusWeight: 0.095,
              historicalSuccessBonusWeight: 0.055,
            }),
        ).not.toThrow();
      });

      it('should reject weights exceeding tolerance on high side', () => {
        expect(
          () =>
            new OpportunityScorer({
              volumeDifficultyWeight: 0.3,
              gapBonusWeight: 0.25,
              trendBonusWeight: 0.15,
              quickWinBonusWeight: 0.1,
              intentBonusWeight: 0.05,
              patternMatchBonusWeight: 0.11,
              historicalSuccessBonusWeight: 0.05,
            }),
        ).toThrow(/weights sum to/);
      });

      it('should reject weights exceeding tolerance on low side', () => {
        expect(
          () =>
            new OpportunityScorer({
              volumeDifficultyWeight: 0.3,
              gapBonusWeight: 0.25,
              trendBonusWeight: 0.15,
              quickWinBonusWeight: 0.1,
              intentBonusWeight: 0.05,
              patternMatchBonusWeight: 0.08,  // Total: 0.98 (outside tolerance)
              historicalSuccessBonusWeight: 0.05,
            }),
        ).toThrow(/weights sum to/);
      });

      it('should provide helpful error message with configuration guidance', () => {
        try {
          new OpportunityScorer({
            volumeDifficultyWeight: 0.4,
            gapBonusWeight: 0.4,
            trendBonusWeight: 0.3,
            quickWinBonusWeight: 0.1,
            intentBonusWeight: 0.05,
            patternMatchBonusWeight: 0.1,
            historicalSuccessBonusWeight: 0.05,
          });
          expect(true).toBe(false); // Should have thrown
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('inflated or deflated');
          expect((error as Error).message).toContain('OpportunityScorerConfig');
        }
      });
    });

    describe('Weighted Score Calculation', () => {
      it('should calculate final score as weighted sum of all factors', async () => {
        const customScorer = new OpportunityScorer({
          volumeDifficultyWeight: 0.4,
          gapBonusWeight: 0.2,
          trendBonusWeight: 0.15,
          quickWinBonusWeight: 0.1,
          intentBonusWeight: 0.05,
          patternMatchBonusWeight: 0.05,
          historicalSuccessBonusWeight: 0.05,
        });

        const opp = createOpportunity({
          searchVolume: 3000,
          difficulty: 0.3,
          currentPosition: 15,
          trend: 'growing',
          intentAlignment: 0.8,
          hasGap: true,
        });

        const factors = await customScorer.scoreOpportunity(opp);

        // Final score should be weighted sum
        const expectedScore =
          factors.volumeDifficultyScore * 0.4 +
          factors.gapBonus * 0.2 +
          factors.trendBonus * 0.15 +
          factors.quickWinBonus * 0.1 +
          factors.intentBonus * 0.05 +
          factors.patternMatchBonus * 0.05 +
          factors.historicalSuccessBonus * 0.05;

        expect(Math.abs(factors.finalScore - expectedScore)).toBeLessThan(0.001);
      });

      it('should not exceed 1.0 when all factors are at maximum', async () => {
        const opp = createOpportunity({
          searchVolume: 10000,
          difficulty: 0.1,
          currentPosition: 2,
          trend: 'growing',
          intentAlignment: 1.0,
          hasGap: true,
        });

        const factors = await scorer.scoreOpportunity(opp);

        expect(factors.finalScore).toBeLessThanOrEqual(1.0);
      });
    });
  });
});
