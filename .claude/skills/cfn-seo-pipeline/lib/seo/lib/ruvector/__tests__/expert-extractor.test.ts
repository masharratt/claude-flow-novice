/**
 * ExpertExtractor Test Suite
 *
 * London School TDD: Focus on pattern matching, extraction accuracy, deduplication
 *
 * @module seo/lib/ruvector/__tests__/expert-extractor.test
 * @description Comprehensive tests for ExpertExtractor pattern-based extraction
 */

import {
  ExpertExtractor,
  ResearchContent,
  ExtractedExpert,
  ExpertExtractionResult,
  ExpertExtractorConfig,
} from '../expert-extractor';

describe('ExpertExtractor', () => {
  let extractor: ExpertExtractor;

  beforeEach(() => {
    extractor = new ExpertExtractor();
  });

  describe('Pattern-based Quote Extraction', () => {
    it('should extract expert from "quote" said Name pattern', () => {
      const content: ResearchContent = {
        text: '"Machine learning is transforming healthcare" said John Smith, a professor at MIT.',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['machine learning', 'healthcare'],
        niche: 'ai',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].name).toBe('John Smith');
      expect(result.experts[0].quotes).toHaveLength(1);
      expect(result.experts[0].quotes[0].text).toBe('Machine learning is transforming healthcare');
    });

    it('should extract expert from Name, PhD said pattern', () => {
      const content: ResearchContent = {
        text: 'Jane Doe, Ph.D. in Computer Science, explained "Deep learning requires massive datasets."',
        sourceUrl: 'https://example.com/article',
        sourceType: 'research_paper',
        topics: ['deep learning', 'data science'],
        niche: 'ai',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].name).toBe('Jane Doe');
      expect(result.experts[0].credentials).toContain('Ph.D');
      expect(result.experts[0].quotes[0].text).toBe('Deep learning requires massive datasets.');
    });

    it('should extract expert from According to Name pattern', () => {
      const content: ResearchContent = {
        text: 'According to Sarah Johnson, CEO of TechCorp, "Innovation drives our success."',
        sourceUrl: 'https://example.com/interview',
        sourceType: 'interview',
        topics: ['innovation', 'leadership'],
        niche: 'business',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].name).toBe('Sarah Johnson');
      expect(result.experts[0].credentials).toContain('CEO');
      expect(result.experts[0].quotes[0].text).toBe('Innovation drives our success.');
    });

    it('should extract expert from Name explains: pattern', () => {
      const content: ResearchContent = {
        text: 'Robert Brown explains: "Climate change requires immediate action."',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['climate change', 'environment'],
        niche: 'science',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].name).toBe('Robert Brown');
      expect(result.experts[0].quotes[0].text).toBe('Climate change requires immediate action.');
    });
  });

  describe('Credential Extraction', () => {
    it('should extract Ph.D. credentials', () => {
      const content: ResearchContent = {
        text: 'Alice Wong, Ph.D. in Biology, said "Genetics is fascinating."',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['genetics', 'biology'],
        niche: 'science',
      };

      const result = extractor.extract(content);

      expect(result.experts[0].credentials).toContain('Ph.D');
      expect(result.patterns.credentialsMatched).toBeGreaterThan(0);
    });

    it('should extract multiple credential types', () => {
      const content: ResearchContent = {
        text: 'Dr. Michael Lee, CEO and founder of StartupX, stated "Entrepreneurship requires resilience."',
        sourceUrl: 'https://example.com/article',
        sourceType: 'interview',
        topics: ['entrepreneurship', 'startups'],
        niche: 'business',
      };

      const result = extractor.extract(content);

      const credentials = result.experts[0].credentials;
      expect(credentials).toMatch(/CEO|founder/i);
    });

    it('should extract researcher/scientist credentials', () => {
      const content: ResearchContent = {
        text: 'Dr. Emily Chen, researcher at Stanford, explained "Neural networks mimic human cognition."',
        sourceUrl: 'https://example.com/article',
        sourceType: 'research_paper',
        topics: ['neural networks', 'cognition'],
        niche: 'ai',
      };

      const result = extractor.extract(content);

      expect(result.experts[0].credentials).toContain('researcher');
    });
  });

  describe('Authority Score Estimation', () => {
    it('should assign higher score for Ph.D.', () => {
      const content: ResearchContent = {
        text: 'Dr. John Smith, Ph.D., said "Research shows this."',
        sourceUrl: 'https://example.com/article',
        sourceType: 'research_paper',
        topics: ['research'],
        niche: 'science',
      };

      const result = extractor.extract(content);

      expect(result.experts[0].authorityScore).toBeGreaterThan(0.5);
    });

    it('should boost score for research papers', () => {
      const content: ResearchContent = {
        text: 'Jane Doe said "This is important."',
        sourceUrl: 'https://example.com/paper',
        sourceType: 'research_paper',
        topics: ['science'],
        niche: 'science',
      };

      const result = extractor.extract(content);

      expect(result.experts[0].authorityScore).toBeGreaterThan(0.5);
    });

    it('should boost score for multiple quotes', () => {
      const content: ResearchContent = {
        text: `
          "First insight" said John Smith.
          Later, John Smith explained "Second insight is crucial."
          John Smith also noted "Third perspective matters."
        `,
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].quotes.length).toBeGreaterThan(1);
      expect(result.experts[0].authorityScore).toBeGreaterThan(0.5);
    });
  });

  describe('Primary Domain Extraction', () => {
    it('should extract domain from credentials', () => {
      const content: ResearchContent = {
        text: 'Dr. Sarah Lee, professor of Computer Science, said "AI is the future."',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['ai', 'future'],
        niche: 'technology',
      };

      const result = extractor.extract(content);

      expect(result.experts[0].primaryDomain).toContain('computer science');
    });

    it('should fallback to first topic if no domain in credentials', () => {
      const content: ResearchContent = {
        text: 'John Doe said "This is interesting."',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['blockchain', 'cryptocurrency'],
        niche: 'fintech',
      };

      const result = extractor.extract(content);

      expect(result.experts[0].primaryDomain).toBe('blockchain');
    });
  });

  describe('Quote Validation', () => {
    it('should filter out quotes that are too short', () => {
      const extractor = new ExpertExtractor({ minQuoteLength: 30 });

      const content: ResearchContent = {
        text: '"Too short" said John Smith.',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(0);
    });

    it('should filter out quotes that are too long', () => {
      const extractor = new ExpertExtractor({ maxQuoteLength: 50 });

      const longQuote = 'a'.repeat(100);
      const content: ResearchContent = {
        text: `"${longQuote}" said John Smith.`,
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(0);
    });

    it('should accept quotes within valid length range', () => {
      const content: ResearchContent = {
        text: '"This quote is just the right length for our purposes" said John Smith.',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].quotes).toHaveLength(1);
    });
  });

  describe('Expert Deduplication', () => {
    it('should merge quotes from same expert', () => {
      const content: ResearchContent = {
        text: `
          "First insight" said John Smith, Ph.D.
          "Second insight" said John Smith.
        `,
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].name).toBe('John Smith');
      expect(result.experts[0].quotes).toHaveLength(2);
    });

    it('should deduplicate identical quotes', () => {
      const content: ResearchContent = {
        text: `
          "Same quote" said John Smith.
          "Same quote" said John Smith.
        `,
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].quotes).toHaveLength(1);
    });

    it('should keep similar but different quotes', () => {
      const content: ResearchContent = {
        text: `
          "Machine learning is powerful" said John Smith.
          "Deep learning is revolutionary" said John Smith.
        `,
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['ai'],
        niche: 'technology',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].quotes).toHaveLength(2);
    });
  });

  describe('Batch Extraction', () => {
    it('should extract from multiple research items', () => {
      const contents: ResearchContent[] = [
        {
          text: '"AI will change everything" said John Smith.',
          sourceUrl: 'https://example.com/article1',
          sourceType: 'website',
          topics: ['ai'],
          niche: 'technology',
        },
        {
          text: '"Blockchain has potential" said Jane Doe.',
          sourceUrl: 'https://example.com/article2',
          sourceType: 'website',
          topics: ['blockchain'],
          niche: 'fintech',
        },
      ];

      const result = extractor.extractBatch(contents);

      expect(result.experts).toHaveLength(2);
      expect(result.patterns.quotesFound).toBe(2);
    });

    it('should merge same expert across multiple items', () => {
      const contents: ResearchContent[] = [
        {
          text: '"First quote" said John Smith, CEO.',
          sourceUrl: 'https://example.com/article1',
          sourceType: 'website',
          topics: ['business'],
          niche: 'business',
        },
        {
          text: '"Second quote" said John Smith.',
          sourceUrl: 'https://example.com/article2',
          sourceType: 'interview',
          topics: ['leadership'],
          niche: 'business',
        },
      ];

      const result = extractor.extractBatch(contents);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].name).toBe('John Smith');
      expect(result.experts[0].quotes).toHaveLength(2);
      expect(result.experts[0].topics).toContain('business');
      expect(result.experts[0].topics).toContain('leadership');
    });

    it('should merge sources from multiple items', () => {
      const contents: ResearchContent[] = [
        {
          text: '"Quote one" said John Smith.',
          sourceUrl: 'https://example.com/source1',
          sourceType: 'website',
          topics: ['general'],
          niche: 'general',
        },
        {
          text: '"Quote two" said John Smith.',
          sourceUrl: 'https://example.com/source2',
          sourceType: 'interview',
          topics: ['general'],
          niche: 'general',
        },
      ];

      const result = extractor.extractBatch(contents);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].sources).toHaveLength(2);
      expect(result.experts[0].sources[0].url).toBe('https://example.com/source1');
      expect(result.experts[0].sources[1].url).toBe('https://example.com/source2');
    });
  });

  describe('Extraction Metrics', () => {
    it('should report extraction metrics', () => {
      const content: ResearchContent = {
        text: `
          "Quote one" said John Smith, Ph.D.
          "Quote two" said Jane Doe, CEO.
        `,
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.patterns.quotesFound).toBe(2);
      expect(result.patterns.namedEntitiesFound).toBe(2);
      expect(result.patterns.credentialsMatched).toBeGreaterThan(0);
      expect(result.extractionTime).toBeGreaterThan(0);
    });

    it('should track extraction time', () => {
      const content: ResearchContent = {
        text: '"Test quote" said Test Expert.',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['test'],
        niche: 'test',
      };

      const result = extractor.extract(content);

      expect(result.extractionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const content: ResearchContent = {
        text: '',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(0);
      expect(result.patterns.quotesFound).toBe(0);
    });

    it('should handle text without quotes', () => {
      const content: ResearchContent = {
        text: 'This is a regular article with no expert quotes.',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(0);
    });

    it('should handle names with hyphens', () => {
      const content: ResearchContent = {
        text: '"Innovation matters" said Mary-Jane Smith-Johnson.',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['innovation'],
        niche: 'business',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0].name).toContain('Mary-Jane');
    });

    it('should handle mixed quote styles', () => {
      const content: ResearchContent = {
        text: `
          "Double quotes work" said John Smith.
          'Single quotes work' said Jane Doe.
        `,
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.experts.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom minQuoteLength', () => {
      const extractor = new ExpertExtractor({ minQuoteLength: 50 });

      const content: ResearchContent = {
        text: '"Short quote" said John Smith.',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      expect(result.experts).toHaveLength(0);
    });

    it('should respect custom defaultAuthorityScore', () => {
      const extractor = new ExpertExtractor({ defaultAuthorityScore: 0.8 });

      const content: ResearchContent = {
        text: '"Basic quote with no special credentials" said Unknown Person.',
        sourceUrl: 'https://example.com/article',
        sourceType: 'website',
        topics: ['general'],
        niche: 'general',
      };

      const result = extractor.extract(content);

      if (result.experts.length > 0) {
        expect(result.experts[0].authorityScore).toBeGreaterThanOrEqual(0.8);
      }
    });
  });
});
