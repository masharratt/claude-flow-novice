/**
 * Tests for CTR Optimization Engine
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CTROptimizationEngine } from '../lib/ctr-optimization-engine';
import type { CTROptimizationConfig } from '../types/ctr-optimization';

describe('CTROptimizationEngine', () => {
  let engine: CTROptimizationEngine;

  beforeEach(() => {
    engine = new CTROptimizationEngine();
  });

  describe('optimizeTitle', () => {
    it('should optimize a basic title with keyword', () => {
      const result = engine.optimizeTitle(
        'JavaScript Tutorial',
        'JavaScript Tutorial',
        { includeYear: true }
      );

      expect(result.optimized).toBeTruthy();
      expect(result.optimized.toLowerCase()).toContain('javascript tutorial');
      expect(result.changes_made.length).toBeGreaterThan(0);
      expect(result.score_improvement).toBeGreaterThanOrEqual(0);
    });

    it('should add keyword if missing', () => {
      const result = engine.optimizeTitle(
        'Complete Guide to Web Development',
        'JavaScript',
        {}
      );

      expect(result.optimized.toLowerCase()).toContain('javascript');
      expect(result.changes_made).toContain('Added target keyword');
    });

    it('should add power words', () => {
      const result = engine.optimizeTitle(
        'JavaScript Tutorial',
        'JavaScript',
        {}
      );

      const score = engine.scoreCTRPotential(result.optimized, '');
      expect(score.factors.powerWordPresent).toBe(true);
    });

    it('should add numbers for specificity', () => {
      const result = engine.optimizeTitle(
        'JavaScript Tutorial',
        'JavaScript',
        {}
      );

      expect(result.optimized).toMatch(/\d+/);
      expect(result.changes_made).toContain('Added number for specificity');
    });

    it('should add current year when configured', () => {
      const currentYear = new Date().getFullYear().toString();
      const result = engine.optimizeTitle(
        'JavaScript Tutorial',
        'JavaScript',
        { includeYear: true }
      );

      expect(result.optimized).toContain(currentYear);
    });

    it('should add brackets for visual distinction', () => {
      const result = engine.optimizeTitle(
        'JavaScript Tutorial',
        'JavaScript',
        {}
      );

      expect(result.optimized).toMatch(/[\[\(\{]/);
    });

    it('should trim to optimal length', () => {
      const longTitle = 'This is a very long JavaScript tutorial title that definitely exceeds the optimal length';
      const result = engine.optimizeTitle(longTitle, 'JavaScript', {
        targetLength: { title: { min: 50, max: 60 } },
      });

      expect(result.optimized.length).toBeLessThanOrEqual(60);
    });

    it('should generate variations', () => {
      const result = engine.optimizeTitle(
        'JavaScript Tutorial',
        'JavaScript',
        { maxVariations: 5 }
      );

      expect(result.variations).toHaveLength(5);
      expect(result.variations[0].title).toBeTruthy();
      expect(result.variations[0].score).toBeGreaterThan(0);
    });

    it('should provide recommendations', () => {
      const result = engine.optimizeTitle(
        'JS',
        'JavaScript',
        {}
      );

      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('optimizeMeta', () => {
    it('should optimize a basic meta description', () => {
      const result = engine.optimizeMeta(
        'Learn JavaScript programming',
        'JavaScript',
        {}
      );

      expect(result.optimized).toBeTruthy();
      expect(result.optimized.toLowerCase()).toContain('javascript');
      expect(result.changes_made.length).toBeGreaterThan(0);
    });

    it('should add keyword if missing', () => {
      const result = engine.optimizeMeta(
        'Learn programming basics',
        'JavaScript',
        {}
      );

      expect(result.optimized.toLowerCase()).toContain('javascript');
      expect(result.changes_made).toContain('Added target keyword');
    });

    it('should add call-to-action', () => {
      const result = engine.optimizeMeta(
        'JavaScript programming tutorial',
        'JavaScript',
        {}
      );

      expect(result.cta_added).toBe(true);
      expect(result.changes_made.some(c => c.includes('CTA'))).toBe(true);
    });

    it('should add emotional trigger', () => {
      const result = engine.optimizeMeta(
        'JavaScript tutorial',
        'JavaScript',
        {}
      );

      expect(result.emotional_trigger).toBeTruthy();
      expect(result.changes_made.some(c => c.includes('emotional trigger'))).toBe(true);
    });

    it('should trim to optimal length', () => {
      const longMeta = 'This is a very long meta description that goes on and on about JavaScript programming and web development and all sorts of other topics that make it way too long for optimal display in search results';
      const result = engine.optimizeMeta(longMeta, 'JavaScript', {
        targetLength: { meta: { min: 150, max: 160 } },
      });

      expect(result.optimized.length).toBeLessThanOrEqual(160);
    });

    it('should provide recommendations', () => {
      const result = engine.optimizeMeta(
        'Short meta',
        'JavaScript',
        {}
      );

      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('scoreCTRPotential', () => {
    it('should score a well-optimized title/meta combination highly', () => {
      const currentYear = new Date().getFullYear().toString();
      const title = `10 Amazing JavaScript Tips [${currentYear}]`;
      const meta = 'Discover proven JavaScript techniques that will boost your coding skills. Learn more today.';

      const score = engine.scoreCTRPotential(title, meta);

      expect(score.score).toBeGreaterThan(70);
      expect(score.estimatedImpact).toBe('high');
    });

    it('should score a poorly optimized title/meta combination lowly', () => {
      const title = 'JS';
      const meta = 'Info';

      const score = engine.scoreCTRPotential(title, meta);

      expect(score.score).toBeLessThan(50);
      expect(score.estimatedImpact).toBe('low');
    });

    it('should identify all scoring factors', () => {
      const currentYear = new Date().getFullYear().toString();
      const title = `10 Proven JavaScript Tips [${currentYear}]`;
      const meta = 'Amazing JavaScript techniques. Learn more now.';

      const score = engine.scoreCTRPotential(title, meta);

      expect(score.factors.numberPresent).toBe(true);
      expect(score.factors.yearPresent).toBe(true);
      expect(score.factors.powerWordPresent).toBe(true);
      expect(score.factors.bracketsPresent).toBe(true);
    });

    it('should provide actionable recommendations', () => {
      const title = 'JavaScript Tutorial';
      const meta = 'Learn JavaScript';

      const score = engine.scoreCTRPotential(title, meta);

      expect(score.recommendations.length).toBeGreaterThan(0);
      expect(score.recommendations.some(r => r.includes('number'))).toBe(true);
    });
  });

  describe('generateVariations', () => {
    it('should generate requested number of variations', () => {
      const variations = engine.generateVariations('JavaScript', 5);

      expect(variations).toHaveLength(5);
    });

    it('should include different titles', () => {
      const variations = engine.generateVariations('JavaScript', 5);

      const uniqueTitles = new Set(variations.map(v => v.title));
      expect(uniqueTitles.size).toBe(5);
    });

    it('should include score for each variation', () => {
      const variations = engine.generateVariations('JavaScript', 3);

      variations.forEach(variation => {
        expect(variation.score).toBeGreaterThan(0);
        expect(variation.score).toBeLessThanOrEqual(100);
      });
    });

    it('should sort variations by score descending', () => {
      const variations = engine.generateVariations('JavaScript', 5);

      for (let i = 1; i < variations.length; i++) {
        expect(variations[i - 1].score).toBeGreaterThanOrEqual(variations[i].score);
      }
    });

    it('should identify triggers used in each variation', () => {
      const variations = engine.generateVariations('JavaScript', 3);

      variations.forEach(variation => {
        expect(Array.isArray(variation.triggers_used)).toBe(true);
      });
    });

    it('should respect target length configuration', () => {
      const config: CTROptimizationConfig = {
        targetLength: { title: { min: 50, max: 60 } },
      };
      const variations = engine.generateVariations('JavaScript Tutorial', 5, config);

      variations.forEach(variation => {
        expect(variation.length).toBeLessThanOrEqual(60);
      });
    });

    it('should include brand name when configured', () => {
      const config: CTROptimizationConfig = {
        brandName: 'MyBrand',
      };
      const variations = engine.generateVariations('JavaScript', 3, config);

      expect(variations.some(v => v.title.includes('MyBrand'))).toBe(true);
    });
  });

  describe('analyzePsychologicalTriggers', () => {
    it('should detect curiosity triggers', () => {
      const text = 'Secret JavaScript techniques revealed';
      const analysis = engine.analyzePsychologicalTriggers(text);

      expect(analysis.curiosity).toBeGreaterThan(0);
      expect(analysis.trigger_count).toBeGreaterThan(0);
    });

    it('should detect urgency triggers', () => {
      const text = 'Get started now with JavaScript';
      const analysis = engine.analyzePsychologicalTriggers(text);

      expect(analysis.urgency).toBeGreaterThan(0);
    });

    it('should detect benefit triggers', () => {
      const text = 'Free JavaScript tutorial to improve your skills';
      const analysis = engine.analyzePsychologicalTriggers(text);

      expect(analysis.benefit).toBeGreaterThan(0);
    });

    it('should detect emotion triggers', () => {
      const text = 'Amazing JavaScript guide';
      const analysis = engine.analyzePsychologicalTriggers(text);

      expect(analysis.emotion).toBeGreaterThan(0);
    });

    it('should detect social proof', () => {
      const text = '10 customer reviews for JavaScript course';
      const analysis = engine.analyzePsychologicalTriggers(text);

      expect(analysis.social_proof).toBeGreaterThan(0);
    });

    it('should identify dominant trigger', () => {
      const text = 'Amazing incredible stunning JavaScript';
      const analysis = engine.analyzePsychologicalTriggers(text);

      expect(analysis.dominant_trigger).toBe('emotion');
    });

    it('should count total triggers', () => {
      const text = 'Amazing free JavaScript guide with 10 reviews';
      const analysis = engine.analyzePsychologicalTriggers(text);

      expect(analysis.trigger_count).toBeGreaterThan(2);
    });
  });

  describe('addPowerWords', () => {
    it('should add power word to title', () => {
      const title = 'JavaScript Tutorial';
      const enhanced = engine.addPowerWords(title);

      expect(enhanced).not.toBe(title);
      expect(enhanced.length).toBeGreaterThan(title.length);
    });

    it('should insert power word naturally', () => {
      const title = 'JavaScript: Complete Guide';
      const enhanced = engine.addPowerWords(title);

      expect(enhanced).toContain(':');
    });
  });

  describe('addNumbers', () => {
    it('should add number to title', () => {
      const title = 'JavaScript Tips';
      const enhanced = engine.addNumbers(title);

      expect(enhanced).toMatch(/\d+/);
    });

    it('should insert number naturally', () => {
      const title = 'JavaScript Guide';
      const enhanced = engine.addNumbers(title);

      expect(enhanced).toMatch(/\d+ Guide/);
    });
  });

  describe('addBrackets', () => {
    it('should add brackets with year', () => {
      const currentYear = new Date().getFullYear().toString();
      const title = 'JavaScript Tutorial';
      const enhanced = engine.addBrackets(title);

      expect(enhanced).toContain('[');
      expect(enhanced).toContain(currentYear);
    });

    it('should not add brackets if title is too long', () => {
      const title = 'A' + 'a'.repeat(59);
      const enhanced = engine.addBrackets(title);

      expect(enhanced).toBe(title);
    });
  });

  describe('addCurrentYear', () => {
    it('should add current year in parentheses', () => {
      const currentYear = new Date().getFullYear().toString();
      const title = 'JavaScript Tutorial';
      const enhanced = engine.addCurrentYear(title);

      expect(enhanced).toContain(`(${currentYear})`);
    });

    it('should not add year if title is too long', () => {
      const title = 'A' + 'a'.repeat(59);
      const enhanced = engine.addCurrentYear(title);

      expect(enhanced).toBe(title);
    });
  });

  describe('addEmotionalTrigger', () => {
    it('should add emotional trigger to meta', () => {
      const meta = 'JavaScript programming tutorial';
      const result = engine.addEmotionalTrigger(meta);

      expect(result.text).not.toBe(meta);
      expect(result.trigger).toBeTruthy();
      expect(result.text).toContain(result.trigger);
    });

    it('should insert after first sentence if present', () => {
      const meta = 'Learn JavaScript. Build amazing apps.';
      const result = engine.addEmotionalTrigger(meta);

      expect(result.text).toMatch(/\.\s+\w+\s+insights/);
    });

    it('should add at beginning if no sentences', () => {
      const meta = 'JavaScript tutorial';
      const result = engine.addEmotionalTrigger(meta);

      expect(result.text).toMatch(/^\w+\s+insights:/);
    });
  });

  describe('integration tests', () => {
    it('should handle complete CTR optimization workflow', () => {
      const keyword = 'JavaScript Programming';
      const originalTitle = 'Learn JS';
      const originalMeta = 'Programming tutorial';

      // Optimize title
      const titleResult = engine.optimizeTitle(originalTitle, keyword, {
        includeYear: true,
        maxVariations: 3,
      });

      expect(titleResult.optimized).toBeTruthy();
      expect(titleResult.variations).toHaveLength(3);
      expect(titleResult.score_improvement).toBeGreaterThanOrEqual(0);

      // Optimize meta
      const metaResult = engine.optimizeMeta(originalMeta, keyword);

      expect(metaResult.optimized).toBeTruthy();
      expect(metaResult.cta_added).toBe(true);

      // Score combination
      const score = engine.scoreCTRPotential(titleResult.optimized, metaResult.optimized);

      expect(score.score).toBeGreaterThan(50);
      expect(score.estimatedImpact).toBeTruthy();
    });

    it('should maintain consistency across multiple optimizations', () => {
      const keyword = 'React Tutorial';
      const title = 'Learn React';

      const result1 = engine.optimizeTitle(title, keyword);
      const result2 = engine.optimizeTitle(title, keyword);

      // Both should improve score
      expect(result1.score_improvement).toBeGreaterThanOrEqual(0);
      expect(result2.score_improvement).toBeGreaterThanOrEqual(0);
    });
  });
});
