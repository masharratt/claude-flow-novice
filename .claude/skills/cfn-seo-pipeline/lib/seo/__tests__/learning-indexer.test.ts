/**
 * Learning Indexer Tests
 *
 * Tests for RuVector-based learning data indexing
 *
 * @module lib/seo/__tests__/learning-indexer.test
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  LearningIndexer,
  LearningCapture,
  indexAllLearnings,
  searchLearnings,
} from '../learning-indexer';
import { MockVectorDB } from '../lib/ruvector-core';

describe('LearningIndexer', () => {
  let indexer: LearningIndexer;
  let testKnowledgeStorePath: string;
  let mockVectorDB: MockVectorDB;

  beforeEach(async () => {
    // Create temp test directory
    testKnowledgeStorePath = path.join(
      __dirname,
      '..',
      '..',
      'test-knowledge-store-' + Date.now()
    );

    mockVectorDB = new MockVectorDB('test-learning');

    indexer = new LearningIndexer({
      knowledgeStorePath: testKnowledgeStorePath,
      vectorDB: mockVectorDB,
      verbose: false,
    });

    // Create directory structure
    await fs.mkdir(path.join(testKnowledgeStorePath, 'learning/successes'), {
      recursive: true,
    });
    await fs.mkdir(path.join(testKnowledgeStorePath, 'learning/failures'), {
      recursive: true,
    });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testKnowledgeStorePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('indexLearning', () => {
    it('should index a success learning capture', async () => {
      const learning: LearningCapture = {
        outcome: 'success',
        topic: 'TypeScript generics',
        context: {
          targetKeyword: 'TypeScript generics',
          approach: 'guide',
          metrics: {
            'step-1-keyword-research': 150.5,
            'step-2-competitor-analysis': 200.3,
          },
        },
        lessons: ['Use concrete examples', 'Include type safety benefits'],
        recommendations: ['Continue using pattern-2-91'],
        capturedAt: new Date().toISOString(),
      };

      const id = await indexer.indexLearning(learning);

      expect(id).toMatch(/^learning-success-typescript-generics-\d+$/);
      expect(await mockVectorDB.exists(id)).toBe(true);
    });

    it('should index a failure learning capture', async () => {
      const learning: LearningCapture = {
        outcome: 'failure',
        topic: 'React hooks',
        context: {
          targetKeyword: 'React hooks',
          approach: 'tutorial',
          metrics: {},
        },
        lessons: ['Need more practical examples'],
        recommendations: ['Avoid pattern-3-12'],
        capturedAt: new Date().toISOString(),
      };

      const id = await indexer.indexLearning(learning);

      expect(id).toMatch(/^learning-failure-react-hooks-\d+$/);
      expect(await mockVectorDB.exists(id)).toBe(true);
    });

    it('should create searchable text with all relevant fields', async () => {
      const learning: LearningCapture = {
        outcome: 'success',
        topic: 'Node.js streams',
        context: {
          targetKeyword: 'Node.js streams',
          approach: 'blog',
          metrics: {
            'step-1': 100,
            'step-2': 200,
          },
        },
        lessons: ['Start with simple examples'],
        recommendations: ['Use pattern-1-23'],
        capturedAt: new Date().toISOString(),
      };

      const id = await indexer.indexLearning(learning);

      // Query to verify searchable text
      const results = await mockVectorDB.query('Node.js streams blog');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe(id);
    });
  });

  describe('indexAllLearnings', () => {
    it('should index all learning files from knowledge store', async () => {
      // Create test learning files
      const success1: LearningCapture = {
        outcome: 'success',
        topic: 'Python asyncio',
        context: {
          targetKeyword: 'Python asyncio',
          approach: 'guide',
          metrics: { 'step-1': 150 },
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      };

      const success2: LearningCapture = {
        outcome: 'success',
        topic: 'Rust ownership',
        context: {
          targetKeyword: 'Rust ownership',
          approach: 'tutorial',
          metrics: { 'step-1': 180 },
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      };

      const failure1: LearningCapture = {
        outcome: 'failure',
        topic: 'Kubernetes pods',
        context: {
          targetKeyword: 'Kubernetes pods',
          approach: 'blog',
          metrics: {},
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      };

      // Write test files
      await fs.writeFile(
        path.join(testKnowledgeStorePath, 'learning/successes/test1.json'),
        JSON.stringify(success1)
      );
      await fs.writeFile(
        path.join(testKnowledgeStorePath, 'learning/successes/test2.json'),
        JSON.stringify(success2)
      );
      await fs.writeFile(
        path.join(testKnowledgeStorePath, 'learning/failures/test3.json'),
        JSON.stringify(failure1)
      );

      const stats = await indexer.indexAllLearnings();

      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.totalIndexed).toBe(3);
      expect(stats.errors.length).toBe(0);
    });

    it('should handle outcome mismatch errors', async () => {
      // Create file with wrong outcome in wrong directory
      const wrongLearning: LearningCapture = {
        outcome: 'failure', // Wrong for successes directory
        topic: 'Test',
        context: {
          targetKeyword: 'Test',
          approach: 'blog',
          metrics: {},
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      };

      await fs.writeFile(
        path.join(testKnowledgeStorePath, 'learning/successes/wrong.json'),
        JSON.stringify(wrongLearning)
      );

      const stats = await indexer.indexAllLearnings();

      expect(stats.successCount).toBe(0);
      expect(stats.errors.length).toBe(1);
      expect(stats.errors[0]).toContain('Outcome mismatch');
    });

    it('should handle empty directories', async () => {
      const stats = await indexer.indexAllLearnings();

      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(stats.totalIndexed).toBe(0);
      expect(stats.errors.length).toBe(0);
    });
  });

  describe('searchLearnings', () => {
    beforeEach(async () => {
      // Index sample data
      await indexer.indexLearning({
        outcome: 'success',
        topic: 'JavaScript promises',
        context: {
          targetKeyword: 'JavaScript promises',
          approach: 'guide',
          metrics: {},
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      });

      await indexer.indexLearning({
        outcome: 'failure',
        topic: 'JavaScript async/await',
        context: {
          targetKeyword: 'JavaScript async/await',
          approach: 'tutorial',
          metrics: {},
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      });

      await indexer.indexLearning({
        outcome: 'success',
        topic: 'Python decorators',
        context: {
          targetKeyword: 'Python decorators',
          approach: 'blog',
          metrics: {},
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      });
    });

    it('should search by semantic query', async () => {
      const results = await indexer.searchLearnings('JavaScript', {
        minSimilarity: 0.0, // MockVectorDB has simple similarity calculation
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].learning.topic).toContain('JavaScript');
    });

    it('should filter by outcome', async () => {
      const results = await indexer.searchLearnings('JavaScript', {
        outcomeFilter: 'success',
        minSimilarity: 0.0, // MockVectorDB has simple similarity calculation
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.learning.outcome).toBe('success');
      });
    });

    it('should filter by approach', async () => {
      const results = await indexer.searchLearnings('guide', {
        approachFilter: 'guide',
        limit: 10,
        minSimilarity: 0.0, // MockVectorDB has simple similarity calculation
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.learning.context.approach).toBe('guide');
      });
    });

    it('should limit results', async () => {
      const results = await indexer.searchLearnings('', { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should include similarity scores', async () => {
      const results = await indexer.searchLearnings('JavaScript');

      results.forEach((r) => {
        expect(typeof r.similarity).toBe('number');
        expect(r.similarity).toBeGreaterThanOrEqual(0);
        expect(r.similarity).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('getAggregatedMetrics', () => {
    beforeEach(async () => {
      // Index sample data with metrics
      await indexer.indexLearning({
        outcome: 'success',
        topic: 'Guide 1',
        context: {
          targetKeyword: 'Guide 1',
          approach: 'guide',
          metrics: {
            'step-1': 100,
            'step-2': 200,
          },
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      });

      await indexer.indexLearning({
        outcome: 'success',
        topic: 'Guide 2',
        context: {
          targetKeyword: 'Guide 2',
          approach: 'guide',
          metrics: {
            'step-1': 150,
            'step-2': 250,
          },
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      });

      await indexer.indexLearning({
        outcome: 'failure',
        topic: 'Guide 3',
        context: {
          targetKeyword: 'Guide 3',
          approach: 'guide',
          metrics: {},
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      });
    });

    it('should calculate success rate', async () => {
      const metrics = await indexer.getAggregatedMetrics('guide');

      expect(metrics.totalLearnings).toBe(3);
      expect(metrics.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('should calculate average step timings', async () => {
      const metrics = await indexer.getAggregatedMetrics('guide');

      expect(metrics.avgStepTimings['step-1']).toBeCloseTo(125, 0);
      expect(metrics.avgStepTimings['step-2']).toBeCloseTo(225, 0);
    });

    it('should filter by approach', async () => {
      await indexer.indexLearning({
        outcome: 'success',
        topic: 'Blog 1',
        context: {
          targetKeyword: 'Blog 1',
          approach: 'blog',
          metrics: {},
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      });

      const guideMetrics = await indexer.getAggregatedMetrics('guide');
      const blogMetrics = await indexer.getAggregatedMetrics('blog');

      expect(guideMetrics.totalLearnings).toBe(3);
      expect(blogMetrics.totalLearnings).toBe(1);
    });

    it('should handle all learnings when no approach filter', async () => {
      const metrics = await indexer.getAggregatedMetrics();

      expect(metrics.totalLearnings).toBe(3);
    });
  });

  describe('deleteLearning', () => {
    it('should delete learning from index', async () => {
      const learning: LearningCapture = {
        outcome: 'success',
        topic: 'To be deleted',
        context: {
          targetKeyword: 'To be deleted',
          approach: 'guide',
          metrics: {},
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      };

      const id = await indexer.indexLearning(learning);
      expect(await mockVectorDB.exists(id)).toBe(true);

      await indexer.deleteLearning(id);
      expect(await mockVectorDB.exists(id)).toBe(false);
    });
  });

  describe('clearIndex', () => {
    it('should clear all learning data', async () => {
      // Index some data
      await indexer.indexLearning({
        outcome: 'success',
        topic: 'Test 1',
        context: {
          targetKeyword: 'Test 1',
          approach: 'guide',
          metrics: {},
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      });

      await indexer.indexLearning({
        outcome: 'success',
        topic: 'Test 2',
        context: {
          targetKeyword: 'Test 2',
          approach: 'blog',
          metrics: {},
        },
        lessons: [],
        recommendations: [],
        capturedAt: new Date().toISOString(),
      });

      // Clear index
      await indexer.clearIndex();

      // Verify no results
      const results = await indexer.searchLearnings('');
      expect(results.length).toBe(0);
    });
  });

  describe('Convenience functions', () => {
    it('should export indexAllLearnings function', () => {
      expect(typeof indexAllLearnings).toBe('function');
    });

    it('should export searchLearnings function', () => {
      expect(typeof searchLearnings).toBe('function');
    });
  });
});
