/**
 * Tests for Step 11.5: Pre-Publication SEO Audit
 *
 * @module planning/seo/lib/steps/__tests__/step-11.5-pre-publication-audit.test
 * @description Comprehensive tests for pre-publication audit functionality
 * @version 1.0.0
 */

import { executeStep115 } from '../step-11.5-pre-publication-audit';
import { Step115Config, Step115Result } from '../../../types/pre-publication-audit';

describe('Step 11.5: Pre-Publication SEO Audit', () => {
  // Sample test data
  const baseConfig: Step115Config = {
    targetKeyword: 'SEO guide',
    contentHtml: `
      <html>
        <body>
          <h1>The Ultimate SEO Guide [2025]</h1>
          <p>Learn how to optimize your website for search engines in 2025.</p>
          <p>This comprehensive guide covers everything you need to know about SEO.</p>
          <p>We'll explore keyword research, on-page optimization, and link building strategies.</p>
          <a href="/related-article">Related Article on SEO</a>
          <a href="/seo-tips">10 SEO Tips</a>
          <a href="/keyword-research">Keyword Research Guide</a>
          <img src="/seo-infographic.jpg" alt="Comprehensive SEO strategy infographic showing keyword research and optimization">
          <img src="/chart.jpg" alt="SEO ranking chart">
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": "The Ultimate SEO Guide"
          }
          </script>
          <p>Published on January 1, 2025</p>
          <p>Last updated: January 15, 2025</p>
        </body>
      </html>
    `,
    titleTag: 'The Ultimate SEO Guide [2025] - 10 Proven Strategies',
    metaDescription:
      'Discover the ultimate SEO guide for 2025. Learn proven strategies to boost your rankings, drive organic traffic, and dominate search results. Start optimizing today!',
    contentType: 'article',
    minAcceptableScore: 75,
    verbose: false,
  };

  describe('executeStep115', () => {
    it('should execute audit successfully with valid config', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.success).toBe(true);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.categoryScores).toHaveLength(7);
      expect(result.executedAt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should fail with invalid config', async () => {
      const invalidConfig = {
        targetKeyword: '',
        contentHtml: '',
        titleTag: '',
        metaDescription: '',
      } as Step115Config;

      const result = await executeStep115(invalidConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.overallScore).toBe(0);
    });

    it('should return all category scores', async () => {
      const result = await executeStep115(baseConfig);

      const categories = result.categoryScores.map((cs) => cs.category);
      expect(categories).toContain('title');
      expect(categories).toContain('meta');
      expect(categories).toContain('schema');
      expect(categories).toContain('links');
      expect(categories).toContain('readability');
      expect(categories).toContain('freshness');
      expect(categories).toContain('images');
    });

    it('should calculate weighted overall score correctly', async () => {
      const result = await executeStep115(baseConfig);

      const manualScore = result.categoryScores.reduce(
        (sum, cs) => sum + cs.score * cs.weight,
        0
      );

      expect(result.overallScore).toBeCloseTo(manualScore, 1);
    });

    it('should identify critical findings', async () => {
      const configWithIssues: Step115Config = {
        ...baseConfig,
        titleTag: 'Bad Title', // Missing keyword, too short
        metaDescription: 'Short meta', // Missing keyword, too short
      };

      const result = await executeStep115(configWithIssues);

      expect(result.criticalFindings.length).toBeGreaterThan(0);
      const criticalCategories = result.criticalFindings.map((f) => f.category);
      expect(criticalCategories).toContain('title');
    });

    it('should pass when score meets minimum threshold', async () => {
      const result = await executeStep115({
        ...baseConfig,
        minAcceptableScore: 50, // Lower threshold
      });

      expect(result.passed).toBe(true);
      expect(result.overallScore).toBeGreaterThanOrEqual(50);
    });

    it('should fail when score below minimum threshold', async () => {
      const poorConfig: Step115Config = {
        targetKeyword: 'SEO',
        contentHtml: '<p>Bad content</p>',
        titleTag: 'Bad',
        metaDescription: 'Bad',
        minAcceptableScore: 90, // Very high threshold
      };

      const result = await executeStep115(poorConfig);

      expect(result.passed).toBe(false);
      expect(result.overallScore).toBeLessThan(90);
    });
  });

  describe('Title Tag Audit', () => {
    it('should score highly for optimal title', async () => {
      const result = await executeStep115(baseConfig);
      const titleScore = result.categoryScores.find((cs) => cs.category === 'title');

      expect(titleScore).toBeDefined();
      expect(titleScore!.score).toBeGreaterThan(70);
      expect(result.details.title.hasKeyword).toBe(true);
      expect(result.details.title.hasPowerWord).toBe(true);
      expect(result.details.title.hasNumber).toBe(true);
      expect(result.details.title.hasCurrentYear).toBe(true);
    });

    it('should detect missing keyword in title', async () => {
      const result = await executeStep115({
        ...baseConfig,
        titleTag: 'Random Title Without Target Keyword',
      });

      expect(result.details.title.hasKeyword).toBe(false);
      const keywordFinding = result.allFindings.find(
        (f) => f.category === 'title' && f.message.includes('keyword not found')
      );
      expect(keywordFinding).toBeDefined();
      expect(keywordFinding!.severity).toBe('critical');
    });

    it('should detect missing power word', async () => {
      const result = await executeStep115({
        ...baseConfig,
        titleTag: 'SEO Guide 2025',
      });

      expect(result.details.title.hasPowerWord).toBe(false);
      const powerWordFinding = result.allFindings.find(
        (f) => f.category === 'title' && f.message.includes('power word')
      );
      expect(powerWordFinding).toBeDefined();
    });

    it('should detect missing current year', async () => {
      const result = await executeStep115({
        ...baseConfig,
        titleTag: 'The Ultimate SEO Guide - 10 Proven Strategies',
      });

      expect(result.details.title.hasCurrentYear).toBe(false);
      const yearFinding = result.allFindings.find(
        (f) => f.category === 'title' && f.message.includes('current year')
      );
      expect(yearFinding).toBeDefined();
    });

    it('should detect suboptimal title length', async () => {
      const result = await executeStep115({
        ...baseConfig,
        titleTag: 'Short',
      });

      const lengthFinding = result.allFindings.find(
        (f) => f.category === 'title' && f.message.includes('length')
      );
      expect(lengthFinding).toBeDefined();
      expect(lengthFinding!.severity).toBe('high');
    });
  });

  describe('Meta Description Audit', () => {
    it('should score highly for optimal meta description', async () => {
      const result = await executeStep115(baseConfig);
      const metaScore = result.categoryScores.find((cs) => cs.category === 'meta');

      expect(metaScore).toBeDefined();
      expect(metaScore!.score).toBeGreaterThan(70);
      expect(result.details.meta.hasKeyword).toBe(true);
      expect(result.details.meta.hasCTA).toBe(true);
      expect(result.details.meta.isOptimalLength).toBe(true);
    });

    it('should detect missing keyword in meta description', async () => {
      const result = await executeStep115({
        ...baseConfig,
        metaDescription: 'Random description without the target keyword that is long enough.',
      });

      expect(result.details.meta.hasKeyword).toBe(false);
      const keywordFinding = result.allFindings.find(
        (f) => f.category === 'meta' && f.message.includes('keyword not found')
      );
      expect(keywordFinding).toBeDefined();
      expect(keywordFinding!.severity).toBe('high');
    });

    it('should detect missing CTA', async () => {
      const result = await executeStep115({
        ...baseConfig,
        metaDescription:
          'This is a SEO guide description that is long enough but has no call to action phrase in it at all.',
      });

      expect(result.details.meta.hasCTA).toBe(false);
      const ctaFinding = result.allFindings.find(
        (f) => f.category === 'meta' && f.message.includes('call-to-action')
      );
      expect(ctaFinding).toBeDefined();
    });

    it('should detect suboptimal length', async () => {
      const result = await executeStep115({
        ...baseConfig,
        metaDescription: 'Too short',
      });

      expect(result.details.meta.isOptimalLength).toBe(false);
      const lengthFinding = result.allFindings.find(
        (f) => f.category === 'meta' && f.message.includes('length')
      );
      expect(lengthFinding).toBeDefined();
    });
  });

  describe('Schema Markup Audit', () => {
    it('should detect existing schema types', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.details.schema.detectedSchemas).toContain('Article');
      expect(result.details.schema.coverageScore).toBeGreaterThan(0);
    });

    it('should identify missing schema types', async () => {
      const result = await executeStep115({
        ...baseConfig,
        contentHtml: '<p>Content without schema markup</p>',
      });

      expect(result.details.schema.detectedSchemas).toHaveLength(0);
      expect(result.details.schema.missingSchemas.length).toBeGreaterThan(0);
      const schemaFinding = result.allFindings.find((f) => f.category === 'schema');
      expect(schemaFinding).toBeDefined();
    });

    it('should recommend content-type specific schemas', async () => {
      const result = await executeStep115({
        ...baseConfig,
        contentType: 'guide',
        contentHtml: '<p>Guide content</p>',
      });

      expect(result.details.schema.missingSchemas).toContain('HowTo');
    });
  });

  describe('Internal Linking Audit', () => {
    it('should detect optimal link count (3-5)', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.details.links.totalLinks).toBe(3);
      expect(result.details.links.isOptimalCount).toBe(true);
    });

    it('should flag too few internal links', async () => {
      const result = await executeStep115({
        ...baseConfig,
        contentHtml: '<p>Content with no links</p>',
      });

      expect(result.details.links.totalLinks).toBe(0);
      expect(result.details.links.isOptimalCount).toBe(false);
      const linkFinding = result.allFindings.find(
        (f) => f.category === 'links' && f.message.includes('internal links')
      );
      expect(linkFinding).toBeDefined();
      expect(linkFinding!.severity).toBe('critical');
    });

    it('should flag too many internal links', async () => {
      const manyLinks = Array.from(
        { length: 10 },
        (_, i) => `<a href="/page-${i}">Link ${i}</a>`
      ).join(' ');
      const result = await executeStep115({
        ...baseConfig,
        contentHtml: `<p>${manyLinks}</p>`,
      });

      expect(result.details.links.totalLinks).toBe(10);
      expect(result.details.links.isOptimalCount).toBe(false);
    });

    it('should detect generic anchor text', async () => {
      const result = await executeStep115({
        ...baseConfig,
        contentHtml: `
          <a href="/page1">click here</a>
          <a href="/page2">here</a>
          <a href="/page3">link</a>
        `,
      });

      const anchorFinding = result.allFindings.find(
        (f) => f.category === 'links' && f.message.includes('generic anchor')
      );
      expect(anchorFinding).toBeDefined();
    });
  });

  describe('Readability Audit', () => {
    it('should calculate Flesch Reading Ease score', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.details.readability.fleschScore).toBeGreaterThan(0);
      expect(result.details.readability.fleschScore).toBeLessThanOrEqual(100);
    });

    it('should detect walls of text', async () => {
      const longParagraph =
        '<p>' + 'word '.repeat(200) + '</p>'; // 200-word paragraph
      const result = await executeStep115({
        ...baseConfig,
        contentHtml: longParagraph,
      });

      expect(result.details.readability.wallOfTextCount).toBeGreaterThan(0);
      const wallFinding = result.allFindings.find(
        (f) => f.category === 'readability' && f.message.includes('exceed 150 words')
      );
      expect(wallFinding).toBeDefined();
    });

    it('should check for transition words', async () => {
      const result = await executeStep115({
        ...baseConfig,
        contentHtml: '<p>Sentence. Sentence. Sentence.</p>', // No transitions
      });

      expect(result.details.readability.transitionWordPercent).toBeLessThan(20);
    });

    it('should score highly for optimal readability', async () => {
      const optimalContent = `
        <p>This is a well-written paragraph. It has good sentence structure.</p>
        <p>Furthermore, it includes transition words. Therefore, readability is excellent.</p>
        <p>Additionally, paragraphs are short. However, they convey complete thoughts.</p>
      `;
      const result = await executeStep115({
        ...baseConfig,
        contentHtml: optimalContent,
      });

      const readabilityScore = result.categoryScores.find((cs) => cs.category === 'readability');
      expect(readabilityScore!.score).toBeGreaterThan(50);
    });
  });

  describe('Freshness Signals Audit', () => {
    it('should detect current year [2025]', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.details.freshness.hasCurrentYear).toBe(true);
    });

    it('should detect missing current year', async () => {
      const result = await executeStep115({
        ...baseConfig,
        contentHtml: '<p>Old content from 2020</p>',
      });

      expect(result.details.freshness.hasCurrentYear).toBe(false);
      const yearFinding = result.allFindings.find(
        (f) => f.category === 'freshness' && f.message.includes('current year')
      );
      expect(yearFinding).toBeDefined();
    });

    it('should detect recent data', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.details.freshness.hasRecentData).toBe(true);
      expect(result.details.freshness.mostRecentYear).toBe(2025);
    });

    it('should detect publication date', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.details.freshness.hasVisibleDate).toBe(true);
    });

    it('should detect last updated date', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.details.freshness.hasLastUpdated).toBe(true);
    });
  });

  describe('Image ALT Text Audit', () => {
    it('should detect images with ALT text', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.details.images.totalImages).toBe(2);
      expect(result.details.images.imagesWithAlt).toBe(2);
      expect(result.details.images.altCoverage).toBe(100);
    });

    it('should detect missing ALT text', async () => {
      const result = await executeStep115({
        ...baseConfig,
        contentHtml: `
          <img src="/image1.jpg">
          <img src="/image2.jpg" alt="">
          <img src="/image3.jpg" alt="Description">
        `,
      });

      expect(result.details.images.imagesMissingAlt).toBeGreaterThan(0);
      const altFinding = result.allFindings.find(
        (f) => f.category === 'images' && f.message.includes('missing ALT')
      );
      expect(altFinding).toBeDefined();
    });

    it('should detect keyword in ALT text', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.details.images.altWithKeyword).toBeGreaterThan(0);
    });

    it('should detect descriptive ALT text (>5 words)', async () => {
      const result = await executeStep115(baseConfig);

      expect(result.details.images.descriptiveAltCount).toBeGreaterThan(0);
    });

    it('should flag short or generic ALT text', async () => {
      const result = await executeStep115({
        ...baseConfig,
        contentHtml: `
          <img src="/img1.jpg" alt="image">
          <img src="/img2.jpg" alt="pic">
          <img src="/img3.jpg" alt="photo">
        `,
      });

      const altFinding = result.allFindings.find(
        (f) => f.category === 'images' && f.message.includes('too short')
      );
      expect(altFinding).toBeDefined();
    });
  });

  describe('Overall Scoring', () => {
    it('should weight categories correctly', async () => {
      const result = await executeStep115(baseConfig);

      const titleScore = result.categoryScores.find((cs) => cs.category === 'title');
      const metaScore = result.categoryScores.find((cs) => cs.category === 'meta');

      // Title weight (0.25) should be higher than meta (0.15)
      expect(titleScore!.weight).toBe(0.25);
      expect(metaScore!.weight).toBe(0.15);
    });

    it('should sum all weights to 1.0', async () => {
      const result = await executeStep115(baseConfig);

      const totalWeight = result.categoryScores.reduce((sum, cs) => sum + cs.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 2);
    });

    it('should include all findings in allFindings', async () => {
      const result = await executeStep115(baseConfig);

      const categoryFindingCounts = result.categoryScores.reduce(
        (sum, cs) => sum + cs.findings.length,
        0
      );
      expect(result.allFindings.length).toBe(categoryFindingCounts);
    });
  });

  describe('Verbose Mode', () => {
    it('should log when verbose is enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await executeStep115({
        ...baseConfig,
        verbose: true,
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not log when verbose is disabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await executeStep115({
        ...baseConfig,
        verbose: false,
      });

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
