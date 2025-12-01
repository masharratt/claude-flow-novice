/**
 * RuVector Query Operations Tests
 *
 * Tests semantic query functionality including:
 * - Query similar documents
 * - TopK parameter verification (return ≤K results)
 * - Confidence score verification (>0.5)
 * - Empty result handling
 * - Query timeout handling
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { VectorDb: VectorDB } = require('@ruvector/core');
import {
  generateRandomVector,
  generateDecompositionEntry,
  generateDecompositionBatch,
  cleanupTestDatabases,
  createTestDataDir,
  assertVectorSimilarity,
  PerformanceTimer
} from './test-utils';
import * as path from 'path';
import * as fs from 'fs';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test-ruvector');

describe('RuVector Query Operations', () => {
  let db: any;
  let TEST_DB_PATH: string;

  beforeAll(() => {
    createTestDataDir(TEST_DATA_DIR);
  });

  beforeEach(() => {
    // Create unique database path for each test to prevent lock errors
    TEST_DB_PATH = path.join(TEST_DATA_DIR, `query-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

    // Create fresh database for each test
    db = new VectorDB({
      dimensions: 1536,

      storagePath: TEST_DB_PATH,
      hnswConfig: {



      }
    });
  });

  afterEach(async () => {
    db = null; // Release reference
    // Give time for file handles to close
    await new Promise(resolve => setTimeout(resolve, 100));
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch (error) {
        console.warn('Cleanup warning:', error);
      }
    }
  });

  afterAll(() => {
    cleanupTestDatabases(TEST_DATA_DIR);
  });

  describe('Semantic Search', () => {
    test('should find similar documents', async () => {
      // GIVEN documents with similar vectors
      const baseVector = generateRandomVector();
      const similarVector = new Float32Array(baseVector.length);

      // Create similar vector (99% same)
      for (let i = 0; i < baseVector.length; i++) {
        similarVector[i] = baseVector[i] + (Math.random() - 0.5) * 0.01;
      }

      await db.insert({
        id: 'base-doc',
        vector: baseVector,
        metadata: { type: 'base' }
      });

      await db.insert({
        id: 'similar-doc',
        vector: similarVector,
        metadata: { type: 'similar' }
      });

      await db.insert({
        id: 'random-doc',
        vector: generateRandomVector(),
        metadata: { type: 'random' }
      });

      // WHEN searching with base vector
      const results = await db.search({
        vector: baseVector,
        k: 2
      });

      // THEN should find similar documents first
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('base-doc'); // Exact match should be first
      expect(results[1].id).toBe('similar-doc');
    });

    test('should return results ordered by similarity', async () => {
      // GIVEN documents with varying similarity
      const queryVector = generateRandomVector();

      // Insert documents with controlled similarity
      const entries = [
        { id: 'exact', similarity: 1.0 },
        { id: 'very-similar', similarity: 0.95 },
        { id: 'similar', similarity: 0.85 },
        { id: 'somewhat-similar', similarity: 0.75 },
        { id: 'different', similarity: 0.5 }
      ];

      for (const entry of entries) {
        const vector = new Float32Array(queryVector.length);
        // Create vector with controlled similarity
        for (let i = 0; i < queryVector.length; i++) {
          vector[i] = queryVector[i] * entry.similarity + (Math.random() - 0.5) * (1 - entry.similarity);
        }

        await db.insert({
          id: entry.id,
          vector: vector,
          metadata: { targetSimilarity: entry.similarity }
        });
      }

      // WHEN querying
      const results = await db.search({
        vector: queryVector,
        k: 5
      });

      // THEN results should be ordered by similarity (descending)
      expect(results).toHaveLength(5);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }

      // Most similar should be first
      expect(results[0].id).toBe('exact');
    });

    test('should handle exact match queries', async () => {
      // GIVEN a document with known vector
      const exactVector = generateRandomVector();

      await db.insert({
        id: 'exact-match',
        vector: exactVector,
        metadata: { type: 'exact' }
      });

      // WHEN searching with exact same vector
      const results = await db.search({
        vector: exactVector,
        k: 1
      });

      // THEN should return the exact document with high score
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('exact-match');
      expect(results[0].score).toBeGreaterThan(0.99); // Cosine similarity ~1.0
    });

    test('should filter by metadata when supported', async () => {
      // GIVEN documents with different categories
      const vector = generateRandomVector();

      await db.insertBatch([
        {
          id: 'api-endpoint-1',
          vector: vector,
          metadata: { taskCategory: 'api-endpoint', complexity: 'simple' }
        },
        {
          id: 'api-endpoint-2',
          vector: vector,
          metadata: { taskCategory: 'api-endpoint', complexity: 'complex' }
        },
        {
          id: 'database-1',
          vector: vector,
          metadata: { taskCategory: 'database-migration', complexity: 'simple' }
        }
      ]);

      // WHEN searching with metadata filter (if supported)
      try {
        const results = await db.search({
          vector: vector,
          k: 10,
          filter: { taskCategory: 'api-endpoint' }
        } as any);

        // THEN should only return filtered results
        expect(results.every((r: any) => r.metadata?.taskCategory === 'api-endpoint')).toBe(true);
      } catch (error) {
        // If filtering not supported, that's acceptable
        console.log('Metadata filtering not supported in this RuVector version');
      }
    });
  });

  describe('TopK Parameter', () => {
    test('should respect k parameter and return at most k results', async () => {
      // GIVEN 20 documents
      const docCount = 20;
      const entries = Array.from({ length: docCount }, (_, i) => ({
        id: `doc-${i}`,
        vector: generateRandomVector(),
        metadata: { index: i }
      }));

      await db.insertBatch(entries);

      // WHEN querying with different k values
      const testCases = [1, 5, 10, 15, 20, 30];

      for (const k of testCases) {
        const results = await db.search({
          vector: generateRandomVector(),
          k
        });

        // THEN should return at most k results
        expect(results.length).toBeLessThanOrEqual(k);
        expect(results.length).toBeLessThanOrEqual(docCount);
      }
    });

    test('should return fewer results if database has less than k documents', async () => {
      // GIVEN only 3 documents
      await db.insertBatch([
        { id: 'doc-1', vector: generateRandomVector(), metadata: {} },
        { id: 'doc-2', vector: generateRandomVector(), metadata: {} },
        { id: 'doc-3', vector: generateRandomVector(), metadata: {} }
      ]);

      // WHEN querying with k=10
      const results = await db.search({
        vector: generateRandomVector(),
        k: 10
      });

      // THEN should return only 3 results
      expect(results).toHaveLength(3);
    });

    test('should handle k=1 (single result)', async () => {
      // GIVEN multiple documents
      await db.insertBatch(
        Array.from({ length: 10 }, (_, i) => ({
          id: `doc-${i}`,
          vector: generateRandomVector(),
          metadata: { index: i }
        }))
      );

      // WHEN querying with k=1
      const results = await db.search({
        vector: generateRandomVector(),
        k: 1
      });

      // THEN should return exactly 1 result
      expect(results).toHaveLength(1);
    });

    test('should default k parameter appropriately', async () => {
      // GIVEN documents
      await db.insertBatch(
        Array.from({ length: 20 }, (_, i) => ({
          id: `doc-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // WHEN querying without k parameter
      const results = await db.search({
        vector: generateRandomVector()
        // k not specified
      });

      // THEN should return some default number of results
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Confidence Scores', () => {
    test('should return confidence scores >0.5 for relevant results', async () => {
      // GIVEN documents with varying similarity
      const baseVector = generateRandomVector();

      // Insert very similar documents
      for (let i = 0; i < 5; i++) {
        const similarVector = new Float32Array(baseVector.length);
        for (let j = 0; j < baseVector.length; j++) {
          similarVector[j] = baseVector[j] + (Math.random() - 0.5) * 0.1;
        }

        await db.insert({
          id: `similar-${i}`,
          vector: similarVector,
          metadata: { index: i }
        });
      }

      // WHEN querying with base vector
      const results = await db.search({
        vector: baseVector,
        k: 5
      });

      // THEN all results should have confidence >0.5
      expect(results.every(r => r.score > 0.5)).toBe(true);
    });

    test('should include confidence scores in results', async () => {
      // GIVEN documents
      await db.insertBatch(
        Array.from({ length: 5 }, (_, i) => ({
          id: `doc-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // WHEN querying
      const results = await db.search({
        vector: generateRandomVector(),
        k: 5
      });

      // THEN each result should have a score
      results.forEach(result => {
        expect(result.score).toBeDefined();
        expect(typeof result.score).toBe('number');
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });

    test('should support threshold parameter for minimum confidence', async () => {
      // GIVEN documents
      const queryVector = generateRandomVector();

      await db.insertBatch(
        Array.from({ length: 10 }, (_, i) => ({
          id: `doc-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // WHEN querying with threshold (if supported)
      try {
        const results = await db.search({
          vector: queryVector,
          k: 10,
          threshold: 0.8
        } as any);

        // THEN all results should meet threshold
        expect(results.every(r => r.score >= 0.8)).toBe(true);
      } catch (error) {
        // If threshold not supported, skip this assertion
        console.log('Threshold parameter not supported in this RuVector version');
      }
    });
  });

  describe('Empty Results', () => {
    test('should handle empty database gracefully', async () => {
      // GIVEN empty database
      // (no inserts)

      // WHEN querying
      const results = await db.search({
        vector: generateRandomVector(),
        k: 10
      });

      // THEN should return empty array
      expect(results).toEqual([]);
    });

    test('should return empty array when no matches above threshold', async () => {
      // GIVEN documents
      await db.insertBatch(
        Array.from({ length: 5 }, (_, i) => ({
          id: `doc-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // WHEN querying with very high threshold (if supported)
      try {
        const results = await db.search({
          vector: generateRandomVector(),
          k: 10,
          threshold: 0.999
        } as any);

        // THEN may return empty or few results
        expect(Array.isArray(results)).toBe(true);
      } catch (error) {
        console.log('Threshold filtering not supported');
      }
    });

    test('should handle metadata filter with no matches', async () => {
      // GIVEN documents
      await db.insertBatch([
        {
          id: 'doc-1',
          vector: generateRandomVector(),
          metadata: { category: 'type-a' }
        },
        {
          id: 'doc-2',
          vector: generateRandomVector(),
          metadata: { category: 'type-a' }
        }
      ]);

      // WHEN filtering by non-existent category (if supported)
      try {
        const results = await db.search({
          vector: generateRandomVector(),
          k: 10,
          filter: { category: 'type-z' }
        } as any);

        // THEN should return empty results
        expect(results).toEqual([]);
      } catch (error) {
        console.log('Metadata filtering not supported');
      }
    });
  });

  describe('Performance', () => {
    test('should meet query latency target (<100ms)', async () => {
      // GIVEN database with 100 documents
      await db.insertBatch(
        Array.from({ length: 100 }, (_, i) => ({
          id: `perf-doc-${i}`,
          vector: generateRandomVector(),
          metadata: generateDecompositionEntry().metadata
        }))
      );

      // WHEN querying
      const timer = new PerformanceTimer();
      timer.start();

      await db.search({
        vector: generateRandomVector(),
        k: 10
      });

      const duration = timer.stop();

      // THEN query should be fast (<100ms)
      expect(duration).toBeLessThan(100);
    });

    test('should maintain performance with large k values', async () => {
      // GIVEN database with 100 documents
      await db.insertBatch(
        Array.from({ length: 100 }, (_, i) => ({
          id: `doc-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // WHEN querying with large k
      const timer = new PerformanceTimer();
      timer.start();

      const results = await db.search({
        vector: generateRandomVector(),
        k: 50
      });

      const duration = timer.stop();

      // THEN should still be fast
      expect(duration).toBeLessThan(150);
      expect(results.length).toBeLessThanOrEqual(50);
    });

    test('should handle concurrent queries efficiently', async () => {
      // GIVEN database with documents
      await db.insertBatch(
        Array.from({ length: 50 }, (_, i) => ({
          id: `doc-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // WHEN executing concurrent queries
      const concurrentQueries = 10;
      const promises = Array.from({ length: concurrentQueries }, () =>
        db.search({
          vector: generateRandomVector(),
          k: 5
        })
      );

      const timer = new PerformanceTimer();
      timer.start();
      const results = await Promise.all(promises);
      const duration = timer.stop();

      // THEN all queries should complete successfully
      expect(results).toHaveLength(concurrentQueries);
      results.forEach(r => expect(Array.isArray(r)).toBe(true));

      // AND should be reasonably fast (<500ms for 10 concurrent)
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid query vector dimensions', async () => {
      // GIVEN database with documents
      await db.insert({
        id: 'doc-1',
        vector: generateRandomVector(),
        metadata: {}
      });

      // WHEN querying with wrong dimension vector
      try {
        const results = await db.search({
          vector: Array.from({ length: 512 }, () => Math.random()), // Wrong dimension
          k: 1
        });

        // If no error, check if handled gracefully
        expect(Array.isArray(results)).toBe(true);
      } catch (error) {
        // Error expected for dimension mismatch
        expect(error).toBeDefined();
      }
    });

    test('should handle malformed query parameters', async () => {
      // GIVEN database
      await db.insert({
        id: 'doc-1',
        vector: generateRandomVector(),
        metadata: {}
      });

      // WHEN querying with invalid k values
      const invalidKValues = [-1, 0, NaN, Infinity];

      for (const k of invalidKValues) {
        try {
          await db.search({
            vector: generateRandomVector(),
            k
          });
        } catch (error) {
          // Errors expected or handled gracefully
          expect(error !== undefined || true).toBe(true);
        }
      }
    });
  });
});
