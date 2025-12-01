/**
 * RuVector Collections Tests
 *
 * Tests collection operations including:
 * - All 5 collections created and accessible
 * - Get documents from each collection
 * - Verify metadata structure matches schemas
 * - Collection isolation (queries on one don't affect others)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  initializeRuVector,
  getCollection,
  getAllCollections,
  COLLECTIONS,
  closeRuVector
} from '../../src/lib/ruvector-init';
import {
  generateRandomVector,
  generateDecompositionEntry,
  generateCodebaseEntry,
  generateErrorEntry,
  generateSecurityEntry,
  generatePerformanceEntry,
  cleanupTestDatabases,
  createTestDataDir
} from './test-utils';
import * as path from 'path';
import * as fs from 'fs';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test-ruvector-collections');

describe('RuVector Collections', () => {
  beforeAll(async () => {
    createTestDataDir(TEST_DATA_DIR);

    // Override storage path for testing with unique path to prevent lock errors
    const uniqueDbPath = path.join(TEST_DATA_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    process.env.RUVECTOR_DB_PATH = uniqueDbPath;
  });

  afterAll(async () => {
    await closeRuVector();
    // Give time for file handles to close
    await new Promise(resolve => setTimeout(resolve, 100));
    cleanupTestDatabases(TEST_DATA_DIR);
  });

  describe('Collection Initialization', () => {
    test('should create all 5 collections successfully', async () => {
      // WHEN initializing RuVector
      const collections = await initializeRuVector();

      // THEN all 5 collections should be created
      expect(collections.size).toBe(5);

      const expectedCollections = [
        COLLECTIONS.DECOMPOSITION_HISTORY,
        COLLECTIONS.CODEBASE_INDEX,
        COLLECTIONS.ERROR_LIBRARY,
        COLLECTIONS.SECURITY_PATTERNS,
        COLLECTIONS.PERFORMANCE_PATTERNS
      ];

      expectedCollections.forEach(name => {
        expect(collections.has(name)).toBe(true);
      });
    });

    test('should return same collections on subsequent calls', async () => {
      // GIVEN already initialized collections
      const collections1 = await initializeRuVector();

      // WHEN calling initializeRuVector again
      const collections2 = await initializeRuVector();

      // THEN should return same instances
      expect(collections1).toBe(collections2);
      expect(collections1.size).toBe(collections2.size);
    });

    test('should create separate database files for each collection', async () => {
      // GIVEN initialized collections
      await initializeRuVector();

      // THEN separate DB files should exist
      const expectedFiles = [
        'decomposition_history.db',
        'codebase_index.db',
        'error_library.db',
        'security_patterns.db',
        'performance_patterns.db'
      ];

      expectedFiles.forEach(filename => {
        const filePath = path.join(TEST_DATA_DIR, filename);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });
  });

  describe('Collection Access', () => {
    beforeAll(async () => {
      await initializeRuVector();
    });

    test('should get specific collection by name', () => {
      // WHEN getting collection
      const decompositionDb = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const codebaseDb = getCollection(COLLECTIONS.CODEBASE_INDEX);

      // THEN should return valid database instances
      expect(decompositionDb).toBeDefined();
      expect(codebaseDb).toBeDefined();
      expect(decompositionDb).not.toBe(codebaseDb);
    });

    test('should throw error for non-existent collection', () => {
      // WHEN/THEN getting invalid collection should throw
      expect(() => {
        getCollection('invalid-collection-name');
      }).toThrow();
    });

    test('should get all collections map', () => {
      // WHEN getting all collections
      const collections = getAllCollections();

      // THEN should return map with all 5 collections
      expect(collections.size).toBe(5);
      expect(collections.has(COLLECTIONS.DECOMPOSITION_HISTORY)).toBe(true);
      expect(collections.has(COLLECTIONS.CODEBASE_INDEX)).toBe(true);
      expect(collections.has(COLLECTIONS.ERROR_LIBRARY)).toBe(true);
      expect(collections.has(COLLECTIONS.SECURITY_PATTERNS)).toBe(true);
      expect(collections.has(COLLECTIONS.PERFORMANCE_PATTERNS)).toBe(true);
    });
  });

  describe('Collection Operations', () => {
    beforeAll(async () => {
      await initializeRuVector();
    });

    test('should insert and retrieve from decomposition_history collection', async () => {
      // GIVEN decomposition collection
      const db = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const entry = generateDecompositionEntry();

      // WHEN inserting document
      await db.insert({
        id: 'decomp-1',
        vector: generateRandomVector(),
        metadata: entry.metadata
      });

      // THEN should retrieve with correct metadata
      const retrieved = await db.get('decomp-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.metadata?.taskId).toBe(entry.metadata.taskId);
      expect(retrieved?.metadata?.decompositionApproach).toBe(entry.metadata.decompositionApproach);
      expect(retrieved?.metadata?.microTaskCount).toBe(entry.metadata.microTaskCount);
    });

    test('should insert and retrieve from codebase_index collection', async () => {
      // GIVEN codebase collection
      const db = getCollection(COLLECTIONS.CODEBASE_INDEX);
      const entry = generateCodebaseEntry();

      // WHEN inserting document
      await db.insert({
        id: 'codebase-1',
        vector: generateRandomVector(),
        metadata: entry.metadata
      });

      // THEN should retrieve with correct metadata
      const retrieved = await db.get('codebase-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.metadata?.filePath).toBe(entry.metadata.filePath);
      expect(retrieved?.metadata?.purpose).toBe(entry.metadata.purpose);
      expect(retrieved?.metadata?.exports).toEqual(entry.metadata.exports);
    });

    test('should insert and retrieve from error_library collection', async () => {
      // GIVEN error library collection
      const db = getCollection(COLLECTIONS.ERROR_LIBRARY);
      const entry = generateErrorEntry();

      // WHEN inserting document
      await db.insert({
        id: 'error-1',
        vector: generateRandomVector(),
        metadata: entry.metadata
      });

      // THEN should retrieve with correct metadata
      const retrieved = await db.get('error-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.metadata?.errorMessage).toBe(entry.metadata.errorMessage);
      expect(retrieved?.metadata?.rootCause).toBe(entry.metadata.rootCause);
      expect(retrieved?.metadata?.fix).toBe(entry.metadata.fix);
    });

    test('should insert and retrieve from security_patterns collection', async () => {
      // GIVEN security patterns collection
      const db = getCollection(COLLECTIONS.SECURITY_PATTERNS);
      const entry = generateSecurityEntry();

      // WHEN inserting document
      await db.insert({
        id: 'security-1',
        vector: generateRandomVector(),
        metadata: entry.metadata
      });

      // THEN should retrieve with correct metadata
      const retrieved = await db.get('security-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.metadata?.patternName).toBe(entry.metadata.patternName);
      expect(retrieved?.metadata?.vulnerabilityType).toBe(entry.metadata.vulnerabilityType);
      expect(retrieved?.metadata?.findings).toEqual(entry.metadata.findings);
    });

    test('should insert and retrieve from performance_patterns collection', async () => {
      // GIVEN performance patterns collection
      const db = getCollection(COLLECTIONS.PERFORMANCE_PATTERNS);
      const entry = generatePerformanceEntry();

      // WHEN inserting document
      await db.insert({
        id: 'perf-1',
        vector: generateRandomVector(),
        metadata: entry.metadata
      });

      // THEN should retrieve with correct metadata
      const retrieved = await db.get('perf-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.metadata?.patternName).toBe(entry.metadata.patternName);
      expect(retrieved?.metadata?.performanceGrade).toBe(entry.metadata.performanceGrade);
      expect(retrieved?.metadata?.issues).toEqual(entry.metadata.issues);
    });
  });

  describe('Metadata Schema Validation', () => {
    beforeAll(async () => {
      await initializeRuVector();
    });

    test('should preserve decomposition history schema fields', async () => {
      // GIVEN decomposition entry with all schema fields
      const db = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const entry = generateDecompositionEntry();

      await db.insert({
        id: 'schema-decomp',
        vector: generateRandomVector(),
        metadata: entry.metadata
      });

      // WHEN retrieving
      const retrieved = await db.get('schema-decomp');

      // THEN all required fields should be present
      const metadata = retrieved?.metadata;
      expect(metadata?.taskId).toBeDefined();
      expect(metadata?.originalTask).toBeDefined();
      expect(metadata?.decompositionApproach).toBeDefined();
      expect(metadata?.microTaskCount).toBeDefined();
      expect(metadata?.gateCheckScore).toBeDefined();
      expect(metadata?.finalDecision).toBeDefined();
      expect(metadata?.technologies).toBeInstanceOf(Array);
    });

    test('should preserve codebase index schema fields', async () => {
      // GIVEN codebase entry
      const db = getCollection(COLLECTIONS.CODEBASE_INDEX);
      const entry = generateCodebaseEntry();

      await db.insert({
        id: 'schema-codebase',
        vector: generateRandomVector(),
        metadata: entry.metadata
      });

      // WHEN retrieving
      const retrieved = await db.get('schema-codebase');

      // THEN all required fields should be present
      const metadata = retrieved?.metadata;
      expect(metadata?.filePath).toBeDefined();
      expect(metadata?.fileName).toBeDefined();
      expect(metadata?.purpose).toBeDefined();
      expect(metadata?.exports).toBeInstanceOf(Array);
      expect(metadata?.dependencies).toBeInstanceOf(Array);
      expect(metadata?.relatedFiles).toBeInstanceOf(Array);
    });

    test('should preserve error library schema fields', async () => {
      // GIVEN error entry
      const db = getCollection(COLLECTIONS.ERROR_LIBRARY);
      const entry = generateErrorEntry();

      await db.insert({
        id: 'schema-error',
        vector: generateRandomVector(),
        metadata: entry.metadata
      });

      // WHEN retrieving
      const retrieved = await db.get('schema-error');

      // THEN all required fields should be present
      const metadata = retrieved?.metadata;
      expect(metadata?.errorMessage).toBeDefined();
      expect(metadata?.errorType).toBeDefined();
      expect(metadata?.rootCause).toBeDefined();
      expect(metadata?.fix).toBeDefined();
      expect(metadata?.severity).toBeDefined();
      expect(metadata?.causedBy).toBeInstanceOf(Array);
    });

    test('should preserve security pattern schema fields', async () => {
      // GIVEN security entry
      const db = getCollection(COLLECTIONS.SECURITY_PATTERNS);
      const entry = generateSecurityEntry();

      await db.insert({
        id: 'schema-security',
        vector: generateRandomVector(),
        metadata: entry.metadata
      });

      // WHEN retrieving
      const retrieved = await db.get('schema-security');

      // THEN all required fields should be present
      const metadata = retrieved?.metadata;
      expect(metadata?.patternName).toBeDefined();
      expect(metadata?.vulnerabilityType).toBeDefined();
      expect(metadata?.findings).toBeInstanceOf(Array);
      expect(metadata?.commonVulnerabilities).toBeInstanceOf(Array);
      expect(metadata?.preventionStrategies).toBeInstanceOf(Array);
    });

    test('should preserve performance pattern schema fields', async () => {
      // GIVEN performance entry
      const db = getCollection(COLLECTIONS.PERFORMANCE_PATTERNS);
      const entry = generatePerformanceEntry();

      await db.insert({
        id: 'schema-performance',
        vector: generateRandomVector(),
        metadata: entry.metadata
      });

      // WHEN retrieving
      const retrieved = await db.get('schema-performance');

      // THEN all required fields should be present
      const metadata = retrieved?.metadata;
      expect(metadata?.patternName).toBeDefined();
      expect(metadata?.performanceGrade).toBeDefined();
      expect(metadata?.issues).toBeInstanceOf(Array);
      expect(metadata?.optimizationStrategies).toBeInstanceOf(Array);
      expect(metadata?.expectedImprovement).toBeDefined();
    });
  });

  describe('Collection Isolation', () => {
    beforeAll(async () => {
      await initializeRuVector();
    });

    test('should isolate documents between collections', async () => {
      // GIVEN documents in different collections
      const decompositionDb = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const codebaseDb = getCollection(COLLECTIONS.CODEBASE_INDEX);

      await decompositionDb.insert({
        id: 'isolation-test',
        vector: generateRandomVector(),
        metadata: generateDecompositionEntry().metadata
      });

      await codebaseDb.insert({
        id: 'isolation-test', // Same ID, different collection
        vector: generateRandomVector(),
        metadata: generateCodebaseEntry().metadata
      });

      // WHEN retrieving from each collection
      const decompDoc = await decompositionDb.get('isolation-test');
      const codebaseDoc = await codebaseDb.get('isolation-test');

      // THEN documents should have different metadata
      expect(decompDoc?.metadata?.taskId).toBeDefined();
      expect(codebaseDoc?.metadata?.filePath).toBeDefined();
      expect(decompDoc?.metadata?.taskId).not.toBe(codebaseDoc?.metadata?.filePath);
    });

    test('should isolate queries between collections', async () => {
      // GIVEN documents in different collections
      const queryVector = generateRandomVector();
      const decompositionDb = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const errorDb = getCollection(COLLECTIONS.ERROR_LIBRARY);

      // Insert similar documents in both collections
      await decompositionDb.insert({
        id: 'query-decomp',
        vector: queryVector,
        metadata: generateDecompositionEntry().metadata
      });

      await errorDb.insert({
        id: 'query-error',
        vector: queryVector,
        metadata: generateErrorEntry().metadata
      });

      // WHEN querying each collection
      const decompResults = await decompositionDb.search({
        vector: queryVector,
        k: 10
      });

      const errorResults = await errorDb.search({
        vector: queryVector,
        k: 10
      });

      // THEN results should be from respective collections only
      expect(decompResults.some((r: any) => r.id === 'query-decomp')).toBe(true);
      expect(decompResults.some((r: any) => r.id === 'query-error')).toBe(false);

      expect(errorResults.some((r: any) => r.id === 'query-error')).toBe(true);
      expect(errorResults.some((r: any) => r.id === 'query-decomp')).toBe(false);
    });

    test('should maintain separate counts per collection', async () => {
      // GIVEN documents in different collections
      const decompositionDb = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const securityDb = getCollection(COLLECTIONS.SECURITY_PATTERNS);

      // Insert different counts
      await decompositionDb.insertBatch(
        Array.from({ length: 5 }, (_, i) => ({
          id: `decomp-count-${i}`,
          vector: generateRandomVector(),
          metadata: generateDecompositionEntry().metadata
        }))
      );

      await securityDb.insertBatch(
        Array.from({ length: 3 }, (_, i) => ({
          id: `security-count-${i}`,
          vector: generateRandomVector(),
          metadata: generateSecurityEntry().metadata
        }))
      );

      // WHEN getting stats
      const decompStats = await decompositionDb.stats();
      const securityStats = await securityDb.stats();

      // THEN counts should be independent
      expect(decompStats.count).toBeGreaterThanOrEqual(5);
      expect(securityStats.count).toBeGreaterThanOrEqual(3);
      expect(decompStats.count).not.toBe(securityStats.count);
    });

    test('should allow deletion from one collection without affecting others', async () => {
      // GIVEN documents with same ID in different collections
      const decompositionDb = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const performanceDb = getCollection(COLLECTIONS.PERFORMANCE_PATTERNS);

      await decompositionDb.insert({
        id: 'delete-test',
        vector: generateRandomVector(),
        metadata: generateDecompositionEntry().metadata
      });

      await performanceDb.insert({
        id: 'delete-test',
        vector: generateRandomVector(),
        metadata: generatePerformanceEntry().metadata
      });

      // WHEN deleting from one collection
      await decompositionDb.delete('delete-test');

      // THEN should only delete from that collection
      const decompDoc = await decompositionDb.get('delete-test');
      const perfDoc = await performanceDb.get('delete-test');

      expect(decompDoc).toBeNull();
      expect(perfDoc).toBeDefined();
    });
  });

  describe('Collection Statistics', () => {
    beforeAll(async () => {
      await initializeRuVector();
    });

    test('should provide stats for each collection independently', async () => {
      // GIVEN collections with documents
      const collections = getAllCollections();

      // WHEN getting stats for each
      const statsPromises = Array.from(collections.values()).map(db => db.stats());
      const stats = await Promise.all(statsPromises);

      // THEN each should have valid stats
      stats.forEach(stat => {
        expect(stat.count).toBeGreaterThanOrEqual(0);
        expect(stat.dimension).toBe(1536);
        expect(stat.metric).toBeDefined();
      });
    });

    test('should track correct document counts per collection', async () => {
      // GIVEN fresh collections
      const decompositionDb = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const codebaseDb = getCollection(COLLECTIONS.CODEBASE_INDEX);

      const initialDecompStats = await decompositionDb.stats();
      const initialCodebaseStats = await codebaseDb.stats();

      // WHEN adding documents
      await decompositionDb.insert({
        id: 'count-test-1',
        vector: generateRandomVector(),
        metadata: generateDecompositionEntry().metadata
      });

      await codebaseDb.insertBatch(
        Array.from({ length: 2 }, (_, i) => ({
          id: `codebase-count-${i}`,
          vector: generateRandomVector(),
          metadata: generateCodebaseEntry().metadata
        }))
      );

      // THEN counts should be updated independently
      const finalDecompStats = await decompositionDb.stats();
      const finalCodebaseStats = await codebaseDb.stats();

      expect(finalDecompStats.count).toBe(initialDecompStats.count + 1);
      expect(finalCodebaseStats.count).toBe(initialCodebaseStats.count + 2);
    });
  });
});
