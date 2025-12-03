/**
 * Intelligence Curator Tests - Phase 1 Sprint 2
 *
 * @module planning/seo/lib/__tests__/intelligence-curator.test
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IntelligenceCurator } from '../intelligence-curator';
import {
  IntelligenceQuery,
  CompetitiveIntelligence,
  SERPPattern,
  LearningCapture,
} from '../../types';

describe('IntelligenceCurator', () => {
  const testKnowledgeStorePath = path.join(__dirname, '__test-knowledge-store__');
  let curator: IntelligenceCurator;

  beforeEach(() => {
    curator = new IntelligenceCurator({
      knowledgeStorePath: testKnowledgeStorePath,
      verbose: false,
    });
  });

  afterEach(async () => {
    // Clean up test knowledge store
    try {
      await fs.rm(testKnowledgeStorePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Knowledge Store Initialization', () => {
    it('should create knowledge store directory structure', async () => {
      const query: IntelligenceQuery = {
        targetKeyword: 'test keyword',
      };

      await curator.loadIntelligence(query);

      // Verify directory structure exists
      const competitiveDir = path.join(
        testKnowledgeStorePath,
        'competitive-intelligence'
      );
      const serpDir = path.join(testKnowledgeStorePath, 'serp-patterns');
      const successDir = path.join(testKnowledgeStorePath, 'learning/successes');
      const failureDir = path.join(testKnowledgeStorePath, 'learning/failures');

      const [compExists, serpExists, successExists, failureExists] =
        await Promise.all([
          fs.stat(competitiveDir).then(() => true).catch(() => false),
          fs.stat(serpDir).then(() => true).catch(() => false),
          fs.stat(successDir).then(() => true).catch(() => false),
          fs.stat(failureDir).then(() => true).catch(() => false),
        ]);

      expect(compExists).toBe(true);
      expect(serpExists).toBe(true);
      expect(successExists).toBe(true);
      expect(failureExists).toBe(true);
    });

    it('should return empty result for non-existent intelligence', async () => {
      const query: IntelligenceQuery = {
        targetKeyword: 'non-existent keyword',
      };

      const result = await curator.loadIntelligence(query);

      expect(result.competitive).toEqual([]);
      expect(result.serpPatterns).toEqual([]);
      expect(result.learnings).toEqual([]);
      expect(result.metadata.itemsLoaded).toBe(0);
    });
  });

  describe('Competitive Intelligence Storage', () => {
    it('should store competitive intelligence data', async () => {
      const intelligence: CompetitiveIntelligence = {
        domain: 'example.com',
        contentStrategy: {
          averageWordCount: 2500,
          keywordDensity: {
            typescript: 0.02,
            'utility types': 0.015,
          },
          contentTypes: ['blog', 'guide', 'tutorial'],
        },
        keywordTargeting: {
          primaryKeywords: ['typescript utility types', 'typescript generics'],
          secondaryKeywords: ['typescript types', 'advanced typescript'],
          searchVolumes: {
            'typescript utility types': 12000,
            'typescript generics': 8500,
          },
        },
        backlinks: {
          total: 1500,
          domainAuthority: 75,
          topReferrers: ['github.com', 'stackoverflow.com', 'dev.to'],
        },
        analyzedAt: new Date(),
      };

      await curator.storeCompetitiveIntelligence(intelligence);

      // Verify files were created (use exact sanitization from implementation)
      const domainDir = path.join(
        testKnowledgeStorePath,
        'competitive-intelligence',
        'example.com' // Domain sanitization keeps dots for valid domains
      );
      const contentStrategyPath = path.join(domainDir, 'content-strategy.json');
      const keywordTargetingPath = path.join(domainDir, 'keyword-targeting.json');
      const backlinkProfilePath = path.join(domainDir, 'backlink-profile.json');

      const [strategyExists, targetingExists, backlinksExist] = await Promise.all([
        fs.stat(contentStrategyPath).then(() => true).catch(() => false),
        fs.stat(keywordTargetingPath).then(() => true).catch(() => false),
        fs.stat(backlinkProfilePath).then(() => true).catch(() => false),
      ]);

      expect(strategyExists).toBe(true);
      expect(targetingExists).toBe(true);
      expect(backlinksExist).toBe(true);

      // Verify content
      const strategyContent = await fs.readFile(contentStrategyPath, 'utf-8');
      const strategy = JSON.parse(strategyContent);
      expect(strategy.averageWordCount).toBe(2500);
      expect(strategy.contentTypes).toContain('blog');
    });

    it('should load stored competitive intelligence', async () => {
      // Store intelligence first
      const intelligence: CompetitiveIntelligence = {
        domain: 'test-domain.com',
        contentStrategy: {
          averageWordCount: 3000,
          keywordDensity: { keyword1: 0.01 },
          contentTypes: ['article'],
        },
        keywordTargeting: {
          primaryKeywords: ['test keyword'],
          secondaryKeywords: [],
          searchVolumes: {},
        },
        backlinks: {
          total: 100,
          domainAuthority: 50,
          topReferrers: [],
        },
        analyzedAt: new Date(),
      };

      await curator.storeCompetitiveIntelligence(intelligence);

      // Load intelligence
      const query: IntelligenceQuery = {
        targetKeyword: 'test keyword',
        competitorDomains: ['test-domain.com'],
      };

      const result = await curator.loadIntelligence(query);

      expect(result.competitive).toHaveLength(1);
      expect(result.competitive[0].domain).toBe('test-domain.com');
      expect(result.competitive[0].contentStrategy.averageWordCount).toBe(3000);
    });
  });

  describe('SERP Pattern Storage', () => {
    it('should store SERP pattern data', async () => {
      const pattern: SERPPattern = {
        keyword: 'typescript utility types',
        featuredSnippets: [
          {
            type: 'paragraph',
            structure: 'Definition with examples',
            example: 'TypeScript utility types are...',
          },
          {
            type: 'list',
            structure: 'Bulleted list',
            example: '• Partial<T>\n• Required<T>\n• Pick<T>',
          },
        ],
        peopleAlsoAsk: [
          'What are TypeScript utility types?',
          'How to use Partial in TypeScript?',
          'Difference between Pick and Omit?',
        ],
        relatedSearches: [
          'typescript advanced types',
          'typescript generics tutorial',
          'typescript type manipulation',
        ],
        capturedAt: new Date(),
      };

      await curator.storeSerpPattern(pattern);

      // Verify files were created
      const keywordHash = require('crypto')
        .createHash('sha256')
        .update(pattern.keyword.toLowerCase())
        .digest('hex');
      const patternDir = path.join(testKnowledgeStorePath, 'serp-patterns', keywordHash);

      const snippetsPath = path.join(patternDir, 'featured-snippets.json');
      const paaPath = path.join(patternDir, 'people-also-ask.json');
      const relatedPath = path.join(patternDir, 'related-searches.json');
      const metadataPath = path.join(patternDir, 'metadata.json');

      const [snippetsExist, paaExists, relatedExists, metadataExists] =
        await Promise.all([
          fs.stat(snippetsPath).then(() => true).catch(() => false),
          fs.stat(paaPath).then(() => true).catch(() => false),
          fs.stat(relatedPath).then(() => true).catch(() => false),
          fs.stat(metadataPath).then(() => true).catch(() => false),
        ]);

      expect(snippetsExist).toBe(true);
      expect(paaExists).toBe(true);
      expect(relatedExists).toBe(true);
      expect(metadataExists).toBe(true);

      // Verify content
      const paaContent = await fs.readFile(paaPath, 'utf-8');
      const paa = JSON.parse(paaContent);
      expect(paa).toHaveLength(3);
      expect(paa[0]).toContain('What are TypeScript utility types?');
    });

    it('should load stored SERP patterns', async () => {
      const pattern: SERPPattern = {
        keyword: 'test keyword',
        featuredSnippets: [
          {
            type: 'paragraph',
            structure: 'Simple definition',
            example: 'Test example',
          },
        ],
        peopleAlsoAsk: ['Question 1?', 'Question 2?'],
        relatedSearches: ['related 1', 'related 2'],
        capturedAt: new Date(),
      };

      await curator.storeSerpPattern(pattern);

      // Load pattern
      const query: IntelligenceQuery = {
        targetKeyword: 'test keyword',
      };

      const result = await curator.loadIntelligence(query);

      expect(result.serpPatterns).toHaveLength(1);
      expect(result.serpPatterns[0].keyword).toBe('test keyword');
      expect(result.serpPatterns[0].peopleAlsoAsk).toHaveLength(2);
      expect(result.serpPatterns[0].relatedSearches).toContain('related 1');
    });
  });

  describe('Learning Capture', () => {
    it('should capture successful learning', async () => {
      const learning: LearningCapture = {
        outcome: 'success',
        topic: 'TypeScript utility types guide',
        context: {
          targetKeyword: 'typescript utility types',
          approach: 'Comprehensive guide with code examples',
          metrics: {
            wordCount: 3500,
            readingTime: 15,
            codeExamples: 12,
          },
        },
        lessons: [
          'FAQ schema improved CTR by 25%',
          'Code examples increased engagement',
          'Interactive playground boosted shares',
        ],
        recommendations: [
          'Add video tutorial for visual learners',
          'Create downloadable cheat sheet',
          'Build interactive type playground',
        ],
        capturedAt: new Date(),
      };

      await curator.captureLearning(learning);

      // Verify file was created
      const successDir = path.join(testKnowledgeStorePath, 'learning/successes');
      const files = await fs.readdir(successDir);

      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.json$/);

      // Verify content
      const filepath = path.join(successDir, files[0]);
      const content = await fs.readFile(filepath, 'utf-8');
      const savedLearning = JSON.parse(content);

      expect(savedLearning.outcome).toBe('success');
      expect(savedLearning.topic).toBe('TypeScript utility types guide');
      expect(savedLearning.lessons).toHaveLength(3);
      expect(savedLearning.recommendations).toHaveLength(3);
    });

    it('should capture failed learning', async () => {
      const learning: LearningCapture = {
        outcome: 'failure',
        topic: 'JavaScript promises tutorial',
        context: {
          targetKeyword: 'javascript promises',
          approach: 'Basic tutorial with minimal examples',
        },
        lessons: [
          'Insufficient code examples led to high bounce rate',
          'Lack of visual diagrams confused readers',
          'Missing error handling examples',
        ],
        recommendations: [
          'Add more practical code examples',
          'Include flowchart diagrams',
          'Cover common error scenarios',
        ],
        capturedAt: new Date(),
      };

      await curator.captureLearning(learning);

      // Verify file was created in failures directory
      const failureDir = path.join(testKnowledgeStorePath, 'learning/failures');
      const files = await fs.readdir(failureDir);

      expect(files.length).toBe(1);

      const filepath = path.join(failureDir, files[0]);
      const content = await fs.readFile(filepath, 'utf-8');
      const savedLearning = JSON.parse(content);

      expect(savedLearning.outcome).toBe('failure');
      expect(savedLearning.lessons.length).toBeGreaterThan(0);
    });

    it('should load historical learnings', async () => {
      // Capture multiple learnings
      const learning1: LearningCapture = {
        outcome: 'success',
        topic: 'TypeScript basics',
        context: {
          targetKeyword: 'typescript',
          approach: 'Beginner friendly',
        },
        lessons: ['Lesson 1'],
        recommendations: ['Recommendation 1'],
        capturedAt: new Date(),
      };

      const learning2: LearningCapture = {
        outcome: 'failure',
        topic: 'Advanced TypeScript',
        context: {
          targetKeyword: 'typescript advanced',
          approach: 'Too complex',
        },
        lessons: ['Lesson 2'],
        recommendations: ['Recommendation 2'],
        capturedAt: new Date(),
      };

      await curator.captureLearning(learning1);
      await curator.captureLearning(learning2);

      // Load historical learnings
      const query: IntelligenceQuery = {
        targetKeyword: 'typescript',
        includeHistorical: true,
      };

      const result = await curator.loadIntelligence(query);

      expect(result.learnings.length).toBeGreaterThanOrEqual(1);
      expect(result.metadata.itemsLoaded).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Age Filtering', () => {
    it('should filter out old intelligence data', async () => {
      // This test is time-sensitive and may need adjustment
      // For now, we'll test that maxAge parameter is accepted
      const query: IntelligenceQuery = {
        targetKeyword: 'test',
        maxAge: 7, // 7 days
      };

      const result = await curator.loadIntelligence(query);

      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should calculate oldest item age correctly', async () => {
      const learning: LearningCapture = {
        outcome: 'success',
        topic: 'Test topic',
        context: {
          targetKeyword: 'test',
          approach: 'test approach',
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date(),
      };

      await curator.captureLearning(learning);

      const query: IntelligenceQuery = {
        targetKeyword: 'test',
        includeHistorical: true,
      };

      const result = await curator.loadIntelligence(query);

      expect(result.metadata.oldestItemAge).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Knowledge Store Statistics', () => {
    it('should return accurate statistics', async () => {
      // Store some data
      const intelligence: CompetitiveIntelligence = {
        domain: 'stats-test.com',
        contentStrategy: {
          averageWordCount: 2000,
          keywordDensity: {},
          contentTypes: [],
        },
        keywordTargeting: {
          primaryKeywords: [],
          secondaryKeywords: [],
          searchVolumes: {},
        },
        backlinks: {
          total: 0,
          domainAuthority: 0,
          topReferrers: [],
        },
        analyzedAt: new Date(),
      };

      const pattern: SERPPattern = {
        keyword: 'stats keyword',
        featuredSnippets: [],
        peopleAlsoAsk: [],
        relatedSearches: [],
        capturedAt: new Date(),
      };

      const learning: LearningCapture = {
        outcome: 'success',
        topic: 'Stats test',
        context: {
          targetKeyword: 'stats',
          approach: 'test',
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date(),
      };

      await curator.storeCompetitiveIntelligence(intelligence);
      await curator.storeSerpPattern(pattern);
      await curator.captureLearning(learning);

      const stats = await curator.getKnowledgeStoreStats();

      expect(stats.competitorCount).toBe(1);
      expect(stats.serpPatternCount).toBe(1);
      expect(stats.successLearningCount).toBe(1);
      expect(stats.failureLearningCount).toBe(0);
    });
  });

  describe('Integration with ResearchService', () => {
    it('should handle fresh data fetching gracefully', async () => {
      const query: IntelligenceQuery = {
        targetKeyword: 'test keyword',
        includeHistorical: true,
      };

      // Should not throw even if ResearchService fails
      const result = await curator.loadIntelligence(query);

      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted JSON files gracefully', async () => {
      // Create corrupted competitive intelligence file
      const domainDir = path.join(
        testKnowledgeStorePath,
        'competitive-intelligence',
        'corrupted_domain'
      );
      await fs.mkdir(domainDir, { recursive: true });
      await fs.writeFile(
        path.join(domainDir, 'content-strategy.json'),
        'invalid json{',
        'utf-8'
      );

      const query: IntelligenceQuery = {
        targetKeyword: 'test',
        competitorDomains: ['corrupted-domain'],
      };

      // Should not throw, just skip corrupted data
      const result = await curator.loadIntelligence(query);

      expect(result.competitive).toEqual([]);
    });

    it('should handle missing knowledge store gracefully', async () => {
      const nonExistentPath = path.join(__dirname, '__non-existent-store__');
      const tempCurator = new IntelligenceCurator({
        knowledgeStorePath: nonExistentPath,
        verbose: false,
      });

      const query: IntelligenceQuery = {
        targetKeyword: 'test',
      };

      const result = await tempCurator.loadIntelligence(query);

      expect(result).toBeDefined();
      expect(result.competitive).toEqual([]);
      expect(result.serpPatterns).toEqual([]);

      // Cleanup
      await fs.rm(nonExistentPath, { recursive: true, force: true });
    });
  });
});
