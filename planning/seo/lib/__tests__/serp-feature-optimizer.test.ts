/**
 * SERP Feature Optimizer Tests
 *
 * @module planning/seo/tests/serp-feature-optimizer.test
 * @description Test suite for SERP feature optimization and schema markup generation
 */

import {
  detectSERPOpportunities,
  formatForFeaturedSnippet,
  formatForPAA,
  formatForVideoCarousel,
  formatForImagePack,
  formatForHowTo,
  formatForTableSnippet,
  generateFAQSchema,
  generateHowToSchema,
  generateVideoObjectSchema,
  generateArticleSchema,
  schemaToJSONLD,
  validateSchema,
} from '../serp-feature-optimizer';

import { SERPFeatureType, FeaturedSnippetType } from '../../../../packages/seo-analysis/src/types/serp-analysis';
import { SERPOptimizationErrorCode, SERPFeatureOpportunity } from '../../types/serp-optimization';

describe('SERP Feature Optimizer', () => {
  // ============================================================================
  // OPPORTUNITY DETECTION TESTS
  // ============================================================================

  describe('detectSERPOpportunities', () => {
    it('should detect featured snippet opportunity', async () => {
      const config = {
        content: 'What is genealogy? Genealogy is the study of family history and lineage...',
        keyword: 'what is genealogy',
        currentPosition: 5,
      };

      const opportunities = await detectSERPOpportunities(config);

      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].type).toBe(SERPFeatureType.FEATURED_SNIPPET);
      expect(opportunities[0].confidence).toBeGreaterThan(0.5);
    });

    it('should detect PAA opportunity when PAA feature exists in SERP', async () => {
      const config = {
        content: 'FAQ about genealogy. What is genealogy? How do I start? Where can I find records?',
        keyword: 'genealogy research',
        serpFeatures: [SERPFeatureType.PEOPLE_ALSO_ASK],
      };

      const opportunities = await detectSERPOpportunities(config);

      const paaOpp = opportunities.find((o: SERPFeatureOpportunity) => o.type === SERPFeatureType.PEOPLE_ALSO_ASK);
      expect(paaOpp).toBeDefined();
      expect(paaOpp?.confidence).toBeGreaterThan(0.7);
    });

    it('should detect video carousel opportunity', async () => {
      const config = {
        content: 'Watch this video tutorial on family tree research. <iframe src="youtube.com/embed/123"></iframe>',
        keyword: 'family tree tutorial',
        serpFeatures: [SERPFeatureType.VIDEO_CAROUSEL],
      };

      const opportunities = await detectSERPOpportunities(config);

      const videoOpp = opportunities.find((o: SERPFeatureOpportunity) => o.type === SERPFeatureType.VIDEO_CAROUSEL);
      expect(videoOpp).toBeDefined();
      expect(videoOpp?.confidence).toBeGreaterThan(0.5);
    });

    it('should detect HowTo opportunity for how-to queries', async () => {
      const config = {
        content: 'Step 1: Gather documents. Step 2: Interview relatives. Step 3: Build tree.',
        keyword: 'how to start family tree',
      };

      const opportunities = await detectSERPOpportunities(config);

      const howToOpp = opportunities.find((o: SERPFeatureOpportunity) => o.requiredSchema?.includes('HowTo'));
      expect(howToOpp).toBeDefined();
      expect(howToOpp?.confidence).toBeGreaterThan(0.7);
    });

    it('should sort opportunities by impact and confidence', async () => {
      const config = {
        content: `
          What is genealogy? Genealogy is...
          FAQ: How do I start? Where can I find records?
          Watch video tutorial...
        `,
        keyword: 'genealogy',
        serpFeatures: [SERPFeatureType.PEOPLE_ALSO_ASK, SERPFeatureType.VIDEO_CAROUSEL],
      };

      const opportunities = await detectSERPOpportunities(config);

      // Should be sorted by impact (high > medium > low) then confidence
      if (opportunities.length > 1) {
        for (let i = 0; i < opportunities.length - 1; i++) {
          const impactWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
          const currentWeight = impactWeight[opportunities[i].impact] || 0;
          const nextWeight = impactWeight[opportunities[i + 1].impact] || 0;
          expect(currentWeight).toBeGreaterThanOrEqual(nextWeight);
        }
      }
    });
  });

  // ============================================================================
  // FEATURED SNIPPET FORMATTING TESTS
  // ============================================================================

  describe('formatForFeaturedSnippet', () => {
    it('should format content as question + answer', () => {
      const config = {
        question: 'What is genealogy?',
        sourceContent: 'Genealogy is the study and tracing of family lineages and history.',
        targetLength: 50,
      };

      const formatted = formatForFeaturedSnippet(config);

      expect(formatted).toContain('## What is genealogy?');
      expect(formatted).toContain('Genealogy is the study');
      expect(formatted.split('\n')).toHaveLength(3); // H2 + blank + paragraph
    });

    it('should limit answer to target word count', () => {
      const config = {
        question: 'How to start genealogy research?',
        sourceContent:
          'Start by gathering family documents including birth certificates, marriage licenses, death certificates, family bibles, letters, and photos. Interview older relatives and record their memories, stories, and knowledge about family members. Create a basic family tree outline with names, dates, and relationships. Research online databases and archives. Visit local libraries and historical societies.',
        targetLength: 25,
      };

      const formatted = formatForFeaturedSnippet(config);
      const answer = formatted.split('\n')[2]; // Third line is the answer
      const wordCount = answer.split(/\s+/).length;

      expect(wordCount).toBeLessThanOrEqual(26); // +1 for ellipsis
    });

    it('should throw error for content too short', () => {
      const config = {
        question: 'What is X?',
        sourceContent: 'Short.',
        targetLength: 50,
      };

      expect(() => formatForFeaturedSnippet(config)).toThrow();
    });
  });

  // ============================================================================
  // PAA FORMATTING TESTS
  // ============================================================================

  describe('formatForPAA', () => {
    it('should format FAQ with question headings', () => {
      const config = {
        questions: ['What is genealogy?', 'How do I start?'],
        answers: ['Genealogy is the study of family history.', 'Start by gathering documents and interviewing relatives.'],
        useExpandable: false,
      };

      const formatted = formatForPAA(config);

      expect(formatted).toContain('## Frequently Asked Questions');
      expect(formatted).toContain('### What is genealogy?');
      expect(formatted).toContain('Genealogy is the study of family history.');
      expect(formatted).toContain('### How do I start?');
    });

    it('should format FAQ with expandable details/summary', () => {
      const config = {
        questions: ['What is genealogy?'],
        answers: ['Genealogy is the study of family history.'],
        useExpandable: true,
      };

      const formatted = formatForPAA(config);

      expect(formatted).toContain('<details>');
      expect(formatted).toContain('<summary><strong>What is genealogy?</strong></summary>');
      expect(formatted).toContain('<p>Genealogy is the study of family history.</p>');
      expect(formatted).toContain('</details>');
    });

    it('should throw error when questions and answers length mismatch', () => {
      const config = {
        questions: ['Question 1', 'Question 2'],
        answers: ['Answer 1'],
      };

      expect(() => formatForPAA(config)).toThrow();
    });
  });

  // ============================================================================
  // VIDEO CAROUSEL FORMATTING TESTS
  // ============================================================================

  describe('formatForVideoCarousel', () => {
    it('should format video with iframe embed', () => {
      const config = {
        title: 'Family Tree Tutorial',
        description: 'Learn how to build a family tree',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        uploadDate: '2024-01-15T08:00:00Z',
        duration: 'PT10M30S',
        embedUrl: 'https://www.youtube.com/embed/VIDEO_ID',
      };

      const formatted = formatForVideoCarousel(config);

      expect(formatted).toContain('## Family Tree Tutorial');
      expect(formatted).toContain('<iframe src="https://www.youtube.com/embed/VIDEO_ID"');
      expect(formatted).toContain('width="560"');
      expect(formatted).toContain('height="315"');
    });

    it('should throw error when embedUrl is missing', () => {
      const config = {
        title: 'Video',
        description: 'Description',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        uploadDate: '2024-01-15T08:00:00Z',
        duration: 'PT10M',
      };

      expect(() => formatForVideoCarousel(config)).toThrow();
    });
  });

  // ============================================================================
  // IMAGE PACK FORMATTING TESTS
  // ============================================================================

  describe('formatForImagePack', () => {
    it('should generate optimized alt text', () => {
      const config = {
        src: 'https://example.com/image.jpg',
        keyword: 'family tree software',
        context: 'This software helps you build comprehensive family trees with ease.',
      };

      const result = formatForImagePack(config);

      expect(result.optimizedAlt).toContain('family tree software');
      expect(result.optimizedAlt.length).toBeGreaterThan(10);
    });

    it('should generate optimized file name', () => {
      const config = {
        src: 'https://example.com/image123.jpg',
        keyword: 'family tree software',
        context: 'Software screenshot',
        fileName: 'image123.jpg',
      };

      const result = formatForImagePack(config);

      expect(result.optimizedFileName).toBe('family-tree-software.jpg');
      expect(result.optimizedFileName).not.toContain(' ');
    });

    it('should provide recommendations for improvement', () => {
      const config = {
        src: 'https://example.com/image.jpg',
        currentAlt: 'img',
        keyword: 'family tree',
        context: 'Family tree diagram',
        fileName: 'image123.jpg',
      };

      const result = formatForImagePack(config);

      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some((r: string) => r.includes('alt text'))).toBe(true);
    });
  });

  // ============================================================================
  // HOWTO FORMATTING TESTS
  // ============================================================================

  describe('formatForHowTo', () => {
    it('should format HowTo with numbered steps', () => {
      const config = {
        title: 'How to Start a Family Tree',
        description: 'A step-by-step guide to beginning your genealogy research',
        steps: [
          { name: 'Gather Documents', text: 'Collect birth certificates and family records' },
          { name: 'Interview Relatives', text: 'Talk to older family members about family history' },
          { name: 'Create Basic Tree', text: 'Start organizing information into a family tree structure' },
        ],
      };

      const formatted = formatForHowTo(config);

      expect(formatted).toContain('## How to Start a Family Tree');
      expect(formatted).toContain('### Step 1: Gather Documents');
      expect(formatted).toContain('### Step 2: Interview Relatives');
      expect(formatted).toContain('### Step 3: Create Basic Tree');
    });

    it('should include images and tips when provided', () => {
      const config = {
        title: 'How to Research Ancestry',
        description: 'Research guide',
        steps: [
          {
            name: 'Start Research',
            text: 'Begin with what you know',
            image: 'https://example.com/step1.jpg',
            tip: 'Always verify information with multiple sources',
          },
          { name: 'Expand Research', text: 'Look for additional records' },
        ],
      };

      const formatted = formatForHowTo(config);

      expect(formatted).toContain('![Start Research](https://example.com/step1.jpg)');
      expect(formatted).toContain('**Tip:** Always verify information with multiple sources');
    });

    it('should throw error when fewer than 2 steps', () => {
      const config = {
        title: 'How to X',
        description: 'Description',
        steps: [{ name: 'Only Step', text: 'Single step' }],
      };

      expect(() => formatForHowTo(config)).toThrow();
    });
  });

  // ============================================================================
  // TABLE SNIPPET FORMATTING TESTS
  // ============================================================================

  describe('formatForTableSnippet', () => {
    it('should format HTML table with headers and rows', () => {
      const config = {
        caption: 'Genealogy Software Comparison',
        headers: ['Software', 'Price', 'Features'],
        rows: [
          ['Ancestry', '$25/mo', 'Large database'],
          ['MyHeritage', '$15/mo', 'DNA testing'],
        ],
      };

      const formatted = formatForTableSnippet(config);

      expect(formatted).toContain('<table>');
      expect(formatted).toContain('<caption>Genealogy Software Comparison</caption>');
      expect(formatted).toContain('<thead>');
      expect(formatted).toContain('<th>Software</th>');
      expect(formatted).toContain('<tbody>');
      expect(formatted).toContain('<td>$25/mo</td>');
    });
  });

  // ============================================================================
  // SCHEMA GENERATION TESTS
  // ============================================================================

  describe('generateFAQSchema', () => {
    it('should generate valid FAQ schema', () => {
      const config = {
        questions: ['What is genealogy?', 'How do I start?'],
        answers: ['Genealogy is the study of family history.', 'Start by gathering documents.'],
      };

      const schema = generateFAQSchema(config);

      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@type']).toBe('FAQPage');
      expect(schema.mainEntity).toHaveLength(2);
      expect(schema.mainEntity[0]['@type']).toBe('Question');
      expect(schema.mainEntity[0].name).toBe('What is genealogy?');
      expect(schema.mainEntity[0].acceptedAnswer['@type']).toBe('Answer');
      expect(schema.mainEntity[0].acceptedAnswer.text).toBe('Genealogy is the study of family history.');
    });
  });

  describe('generateHowToSchema', () => {
    it('should generate valid HowTo schema', () => {
      const config = {
        title: 'How to Start Genealogy',
        description: 'Step-by-step guide',
        steps: [
          { name: 'Gather Documents', text: 'Collect records' },
          { name: 'Interview Family', text: 'Talk to relatives' },
        ],
        totalTime: 'PT2H',
        tools: ['Computer', 'Scanner'],
      };

      const schema = generateHowToSchema(config);

      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@type']).toBe('HowTo');
      expect(schema.name).toBe('How to Start Genealogy');
      expect(schema.step).toHaveLength(2);
      expect(schema.step[0]['@type']).toBe('HowToStep');
      expect(schema.totalTime).toBe('PT2H');
      expect(schema.tool).toEqual(['Computer', 'Scanner']);
    });

    it('should throw error for fewer than 2 steps', () => {
      const config = {
        title: 'How to X',
        description: 'Guide',
        steps: [{ name: 'Step', text: 'Text' }],
      };

      expect(() => generateHowToSchema(config)).toThrow();
    });
  });

  describe('generateVideoObjectSchema', () => {
    it('should generate valid VideoObject schema', () => {
      const config = {
        title: 'Family Tree Tutorial',
        description: 'Learn to build family trees',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        uploadDate: '2024-01-15T08:00:00Z',
        duration: 'PT10M30S',
        contentUrl: 'https://example.com/video.mp4',
        embedUrl: 'https://www.youtube.com/embed/VIDEO_ID',
      };

      const schema = generateVideoObjectSchema(config);

      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@type']).toBe('VideoObject');
      expect(schema.name).toBe('Family Tree Tutorial');
      expect(schema.duration).toBe('PT10M30S');
      expect(schema.contentUrl).toBe('https://example.com/video.mp4');
      expect(schema.embedUrl).toBe('https://www.youtube.com/embed/VIDEO_ID');
    });
  });

  describe('generateArticleSchema', () => {
    it('should generate valid Article schema', () => {
      const config = {
        headline: '10 Best Genealogy Tools',
        author: 'John Doe',
        datePublished: '2024-01-15T08:00:00Z',
        dateModified: '2024-01-20T10:00:00Z',
        imageUrl: 'https://example.com/featured.jpg',
        publisherName: 'Genealogy Blog',
        publisherLogo: 'https://example.com/logo.jpg',
      };

      const schema = generateArticleSchema(config);

      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@type']).toBe('Article');
      expect(schema.headline).toBe('10 Best Genealogy Tools');
      expect(schema.author.name).toBe('John Doe');
      expect(schema.publisher.logo['@type']).toBe('ImageObject');
    });
  });

  describe('schemaToJSONLD', () => {
    it('should convert schema to JSON-LD script tag', () => {
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Test Article',
      };

      const jsonld = schemaToJSONLD(schema);

      expect(jsonld).toContain('<script type="application/ld+json">');
      expect(jsonld).toContain('"@context": "https://schema.org"');
      expect(jsonld).toContain('"headline": "Test Article"');
      expect(jsonld).toContain('</script>');
    });
  });

  // ============================================================================
  // SCHEMA VALIDATION TESTS
  // ============================================================================

  describe('validateSchema', () => {
    it('should validate correct FAQ schema', () => {
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is genealogy?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Genealogy is the study of family history.',
            },
          },
          {
            '@type': 'Question',
            name: 'How do I start?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Start by gathering documents.',
            },
          },
        ],
      };

      const result = validateSchema(schema, 'FAQPage');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: 'Video Title',
        // Missing: description, thumbnailUrl, uploadDate
      };

      const result = validateSchema(schema, 'VideoObject');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e: any) => e.message.includes('description'))).toBe(true);
    });

    it('should detect invalid @context', () => {
      const schema = {
        '@context': 'https://wrong-context.org',
        '@type': 'Article',
        headline: 'Test',
      };

      const result = validateSchema(schema, 'Article');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: any) => e.code === 'INVALID_CONTEXT')).toBe(true);
    });

    it('should warn about few FAQ questions', () => {
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Only question?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Only answer.',
            },
          },
        ],
      };

      const result = validateSchema(schema, 'FAQPage');

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w: any) => w.code === 'FEW_QUESTIONS')).toBe(true);
    });

    it('should validate HowTo requires minimum 2 steps', () => {
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'How to X',
        step: [{ '@type': 'HowToStep', name: 'Step 1', text: 'Do something' }],
      };

      const result = validateSchema(schema, 'HowTo');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: any) => e.code === 'INSUFFICIENT_STEPS')).toBe(true);
    });
  });
});
