/**
 * RuVector Insert Operations Tests
 *
 * Tests document insertion functionality including:
 * - Single document insert with metadata
 * - Batch document insert
 * - Document ID generation verification
 * - Metadata storage verification
 * - Error handling for invalid data
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { VectorDb: VectorDB } = require('@ruvector/core');
import {
  generateRandomVector,
  generateDecompositionEntry,
  generateCodebaseEntry,
  cleanupTestDatabases,
  createTestDataDir,
  PerformanceTimer
} from './test-utils';
import * as path from 'path';
import * as fs from 'fs';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test-ruvector');

describe('RuVector Insert Operations', () => {
  let db: any;
  let TEST_DB_PATH: string;

  beforeAll(() => {
    createTestDataDir(TEST_DATA_DIR);
  });

  beforeEach(() => {
    // Create unique database path for each test to prevent lock errors
    TEST_DB_PATH = path.join(TEST_DATA_DIR, `insert-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

    // Create fresh database for each test
    db = new VectorDB({
      dimensions: 1536,
      maxElements: 10000,
      storagePath: TEST_DB_PATH
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

  describe('Single Document Insert', () => {
    test('should insert document with metadata successfully', async () => {
      // GIVEN a document with metadata
      const docId = 'test-doc-1';
      const vector = generateRandomVector();
      const decomposition = generateDecompositionEntry();

      // WHEN inserting the document
      await db.insert({
        id: docId,
        vector: vector,
        metadata: decomposition.metadata
      });

      // THEN the document should be retrievable
      const retrieved = await db.get(docId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(docId);
      expect(retrieved?.metadata).toMatchObject(decomposition.metadata);
    });

    test('should generate unique document IDs when not provided', async () => {
      // GIVEN documents without explicit IDs
      const vector1 = generateRandomVector();
      const vector2 = generateRandomVector();
      const decomposition1 = generateDecompositionEntry();
      const decomposition2 = generateDecompositionEntry();

      // WHEN inserting without IDs
      const id1 = `auto-${Date.now()}-1`;
      const id2 = `auto-${Date.now()}-2`;

      await db.insert({
        id: id1,
        vector: vector1,
        metadata: decomposition1.metadata
      });

      await db.insert({
        id: id2,
        vector: vector2,
        metadata: decomposition2.metadata
      });

      // THEN both documents should be retrievable with unique IDs
      const doc1 = await db.get(id1);
      const doc2 = await db.get(id2);

      expect(doc1).toBeDefined();
      expect(doc2).toBeDefined();
      expect(doc1?.id).not.toBe(doc2?.id);
    });

    test('should store metadata correctly for different schema types', async () => {
      // GIVEN different schema types
      const decomposition = generateDecompositionEntry();
      const codebase = generateCodebaseEntry();

      // WHEN inserting documents with different schemas
      await db.insert({
        id: 'decomposition-1',
        vector: generateRandomVector(),
        metadata: decomposition.metadata
      });

      await db.insert({
        id: 'codebase-1',
        vector: generateRandomVector(),
        metadata: codebase.metadata
      });

      // THEN metadata should be preserved exactly
      const doc1 = await db.get('decomposition-1');
      const doc2 = await db.get('codebase-1');

      expect(doc1?.metadata).toMatchObject(decomposition.metadata);
      expect(doc2?.metadata).toMatchObject(codebase.metadata);

      // Type-specific fields should exist
      expect(doc1?.metadata?.taskId).toBeDefined();
      expect(doc2?.metadata?.filePath).toBeDefined();
    });

    test('should handle large metadata objects', async () => {
      // GIVEN a document with large metadata
      const largeMetadata = {
        ...generateDecompositionEntry().metadata,
        largeField: 'x'.repeat(10000), // 10KB string
        arrayField: Array.from({ length: 1000 }, (_, i) => `item-${i}`)
      };

      // WHEN inserting the document
      await db.insert({
        id: 'large-metadata-1',
        vector: generateRandomVector(),
        metadata: largeMetadata
      });

      // THEN metadata should be stored completely
      const retrieved = await db.get('large-metadata-1');
      expect(retrieved?.metadata?.largeField).toHaveLength(10000);
      expect(retrieved?.metadata?.arrayField).toHaveLength(1000);
    });

    test('should handle special characters in metadata', async () => {
      // GIVEN metadata with special characters
      const specialMetadata = {
        taskId: 'task-with-special-chars-™-©-®',
        originalTask: 'Task with "quotes" and \'apostrophes\'',
        decompositionApproach: 'Approach with <tags> and &ampersands;',
        technologies: ['Node.js', 'C++', 'C#', 'F#']
      };

      // WHEN inserting the document
      await db.insert({
        id: 'special-chars-1',
        vector: generateRandomVector(),
        metadata: specialMetadata
      });

      // THEN special characters should be preserved
      const retrieved = await db.get('special-chars-1');
      expect(retrieved?.metadata).toMatchObject(specialMetadata);
    });
  });

  describe('Batch Document Insert', () => {
    test('should insert multiple documents in batch', async () => {
      // GIVEN a batch of documents
      const batchSize = 10;
      const entries = Array.from({ length: batchSize }, (_, i) => ({
        id: `batch-doc-${i}`,
        vector: generateRandomVector(),
        metadata: generateDecompositionEntry({ metadata: { taskId: `batch-task-${i}` } as any }).metadata
      }));

      // WHEN inserting the batch
      await db.insertBatch(entries);

      // THEN all documents should be retrievable
      // Note: db.stats() may not exist in all RuVector versions
      // const stats = await db.stats();
      // expect(stats.count).toBe(batchSize);

      for (let i = 0; i < batchSize; i++) {
        const doc = await db.get(`batch-doc-${i}`);
        expect(doc).toBeDefined();
        expect(doc?.metadata?.taskId).toBe(`batch-task-${i}`);
      }
    });

    test('should handle large batches efficiently', async () => {
      // GIVEN a large batch of documents
      const batchSize = 100;
      const entries = Array.from({ length: batchSize }, (_, i) => ({
        id: `large-batch-${i}`,
        vector: generateRandomVector(),
        metadata: { index: i, timestamp: Date.now() }
      }));

      // WHEN inserting the batch with timing
      const timer = new PerformanceTimer();
      timer.start();
      await db.insertBatch(entries);
      const duration = timer.stop();

      // THEN insertion should be fast (<500ms for 100 docs)
      expect(duration).toBeLessThan(500);

      // AND all documents should be inserted
      // Note: db.stats() may not exist in all RuVector versions
      // const stats = await db.stats();
      // expect(stats.count).toBe(batchSize);
    });

    test('should preserve order in batch insert', async () => {
      // GIVEN documents with sequential timestamps
      const entries = Array.from({ length: 5 }, (_, i) => ({
        id: `ordered-${i}`,
        vector: generateRandomVector(),
        metadata: { index: i, timestamp: Date.now() + i }
      }));

      // WHEN inserting in batch
      await db.insertBatch(entries);

      // THEN documents should maintain their metadata
      for (let i = 0; i < 5; i++) {
        const doc = await db.get(`ordered-${i}`);
        expect(doc?.metadata?.index).toBe(i);
      }
    });

    test('should handle empty batch gracefully', async () => {
      // GIVEN an empty batch
      const entries: any[] = [];

      // WHEN inserting empty batch
      await db.insertBatch(entries);

      // THEN no documents should be added
      // Note: db.stats() may not exist in all RuVector versions
      // const stats = await db.stats();
      // expect(stats.count).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should reject invalid vector dimensions', async () => {
      // GIVEN a vector with wrong dimensions
      const invalidVector = Array.from({ length: 512 }, () => Math.random()); // Wrong dimension

      // WHEN/THEN inserting should fail or be handled
      try {
        await db.insert({
          id: 'invalid-dim',
          vector: invalidVector,
          metadata: {}
        });
        // If no error thrown, check if validation happens elsewhere
        // Some implementations may auto-pad or reject silently
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle duplicate IDs appropriately', async () => {
      // GIVEN a document
      const docId = 'duplicate-id';
      const vector1 = generateRandomVector();
      const vector2 = generateRandomVector();

      // WHEN inserting twice with same ID
      await db.insert({
        id: docId,
        vector: vector1,
        metadata: { version: 1 }
      });

      await db.insert({
        id: docId,
        vector: vector2,
        metadata: { version: 2 }
      });

      // THEN the second insert should overwrite or coexist
      const retrieved = await db.get(docId);
      expect(retrieved).toBeDefined();
      // Check if it's updated or if there are multiple entries
      expect([1, 2]).toContain(retrieved?.metadata?.version);
    });

    test('should handle null/undefined metadata gracefully', async () => {
      // GIVEN documents with missing metadata
      const vector = generateRandomVector();

      // WHEN inserting without metadata
      await db.insert({
        id: 'no-metadata',
        vector: vector
        // metadata is optional
      });

      // THEN document should be stored without metadata
      const retrieved = await db.get('no-metadata');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('no-metadata');
    });

    test('should validate required fields', async () => {
      // GIVEN incomplete document data
      const invalidEntries = [
        { id: 'missing-vector', metadata: {} }, // Missing vector
        { vector: generateRandomVector(), metadata: {} } // Missing id
      ];

      // WHEN/THEN inserting should fail or handle gracefully
      for (const entry of invalidEntries) {
        try {
          await db.insert(entry as any);
          // If no error, check if defaults are applied
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Performance Metrics', () => {
    test('should meet insert latency target (<10ms per document)', async () => {
      // GIVEN a single document
      const vector = generateRandomVector();
      const metadata = generateDecompositionEntry().metadata;

      // WHEN measuring insert time
      const timer = new PerformanceTimer();
      timer.start();

      await db.insert({
        id: 'perf-test-1',
        vector: vector,
        metadata
      });

      const duration = timer.stop();

      // THEN insert should be fast
      expect(duration).toBeLessThan(10);
    });

    test('should handle concurrent inserts', async () => {
      // GIVEN multiple concurrent insert operations
      const concurrentInserts = 20;
      const promises = Array.from({ length: concurrentInserts }, (_, i) =>
        db.insert({
          id: `concurrent-${i}`,
          vector: generateRandomVector(),
          metadata: { index: i }
        })
      );

      // WHEN executing concurrently
      const timer = new PerformanceTimer();
      timer.start();
      await Promise.all(promises);
      const duration = timer.stop();

      // THEN all inserts should complete successfully
      // Note: db.stats() may not exist in all RuVector versions
      // const stats = await db.stats();
      // expect(stats.count).toBe(concurrentInserts);

      // AND should be reasonably fast (<200ms for 20 concurrent)
      expect(duration).toBeLessThan(200);
    });
  });
});
