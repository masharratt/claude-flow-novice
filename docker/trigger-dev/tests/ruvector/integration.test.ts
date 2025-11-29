/**
 * RuVector Integration Tests
 *
 * End-to-end workflow tests including:
 * - Insert → Query → Verify workflow
 * - Multi-collection scenarios
 * - Performance under realistic loads (100 documents)
 * - Concurrent operations
 */

import {
  initializeRuVector,
  getCollection,
  COLLECTIONS,
  closeRuVector,
  verifyConnectivity
} from '../../src/lib/ruvector-init';
import {
  generateRandomVector,
  generateDecompositionBatch,
  generateCodebaseEntry,
  generateErrorEntry,
  generateSecurityEntry,
  generatePerformanceEntry,
  cleanupTestDatabases,
  createTestDataDir,
  PerformanceTimer,
  measureThroughput
} from './test-utils';
import * as path from 'path';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test-ruvector-integration');

describe('RuVector Integration Tests', () => {
  beforeAll(async () => {
    createTestDataDir(TEST_DATA_DIR);
    // Generate unique DB path for this test suite to prevent lock errors
    const uniqueDbPath = path.join(TEST_DATA_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    process.env.RUVECTOR_DB_PATH = uniqueDbPath;
    await initializeRuVector();
  });

  afterAll(async () => {
    await closeRuVector();
    // Give time for file handles to close
    await new Promise(resolve => setTimeout(resolve, 100));
    cleanupTestDatabases(TEST_DATA_DIR);
  });

  describe('End-to-End Workflow', () => {
    test('should complete full insert → query → verify workflow', async () => {
      // GIVEN a collection
      const db = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const queryVector = generateRandomVector();

      // WHEN inserting a document
      const entry = generateDecompositionBatch(1)[0];
      await db.insert({
        id: 'e2e-doc-1',
        vector: queryVector,
        metadata: entry.metadata
      });

      // AND querying for it
      const results = await db.search({
        vector: queryVector,
        k: 1
      });

      // THEN should retrieve the document
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('e2e-doc-1');
      expect(results[0].metadata?.taskId).toBe(entry.metadata.taskId);
      expect(results[0].score).toBeGreaterThan(0.99); // Exact match

      // AND should be able to retrieve directly
      const retrieved = await db.get('e2e-doc-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.metadata).toMatchObject(entry.metadata);
    });

    test('should support RAG pattern: insert, search similar, aggregate results', async () => {
      // GIVEN decomposition patterns
      const db = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const patterns = generateDecompositionBatch(10);

      // Insert historical decompositions
      await db.insertBatch(
        patterns.map((p, i) => ({
          id: `rag-pattern-${i}`,
          vector: generateRandomVector(),
          metadata: p.metadata
        }))
      );

      // WHEN searching for similar patterns
      const queryVector = generateRandomVector();
      const results = await db.search({
        vector: queryVector,
        k: 5
      });

      // THEN should retrieve top 5 relevant patterns
      expect(results.length).toBeLessThanOrEqual(5);
      expect(results.length).toBeGreaterThan(0);

      // AND should be able to aggregate metadata from results
      const aggregated = results.map(r => ({
        approach: r.metadata?.decompositionApproach,
        successRate: r.metadata?.successRate,
        complexity: r.metadata?.complexity,
        confidence: r.score
      }));

      expect(aggregated.every(a => a.approach !== undefined)).toBe(true);
    });

    test('should support causality chain traversal in error library', async () => {
      // GIVEN error library with causality chains
      const db = getCollection(COLLECTIONS.ERROR_LIBRARY);

      // Root cause error
      const rootError = generateErrorEntry({
        metadata: {
          errorMessage: 'Database connection timeout',
          errorType: 'ConnectionError',
          causedBy: [],
          causes: ['downstream-error-1', 'downstream-error-2']
        } as any
      });

      // Downstream errors
      const downstream1 = generateErrorEntry({
        metadata: {
          errorMessage: 'User authentication failed',
          errorType: 'AuthError',
          causedBy: ['root-error'],
          causes: []
        } as any
      });

      const downstream2 = generateErrorEntry({
        metadata: {
          errorMessage: 'Session expired',
          errorType: 'SessionError',
          causedBy: ['root-error'],
          causes: []
        } as any
      });

      // Insert errors
      await db.insertBatch([
        {
          id: 'root-error',
          vector: generateRandomVector(),
          metadata: rootError.metadata
        },
        {
          id: 'downstream-error-1',
          vector: generateRandomVector(),
          metadata: downstream1.metadata
        },
        {
          id: 'downstream-error-2',
          vector: generateRandomVector(),
          metadata: downstream2.metadata
        }
      ]);

      // WHEN retrieving root error
      const root = await db.get('root-error');

      // THEN should be able to traverse causality chain
      expect(root?.metadata?.causes).toEqual(['downstream-error-1', 'downstream-error-2']);

      // AND retrieve downstream errors
      const downstream = await Promise.all(
        root!.metadata!.causes!.map((id: string) => db.get(id))
      );

      expect(downstream).toHaveLength(2);
      expect(downstream.every(e => e?.metadata?.causedBy?.includes('root-error'))).toBe(true);
    });
  });

  describe('Multi-Collection Scenarios', () => {
    test('should coordinate across multiple collections', async () => {
      // GIVEN all 5 collections
      const decompositionDb = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const codebaseDb = getCollection(COLLECTIONS.CODEBASE_INDEX);
      const errorDb = getCollection(COLLECTIONS.ERROR_LIBRARY);
      const securityDb = getCollection(COLLECTIONS.SECURITY_PATTERNS);
      const performanceDb = getCollection(COLLECTIONS.PERFORMANCE_PATTERNS);

      // WHEN inserting related data across collections
      const taskId = 'multi-collection-task-1';

      // Decomposition record
      await decompositionDb.insert({
        id: `decomp-${taskId}`,
        vector: generateRandomVector(),
        metadata: generateDecompositionBatch(1)[0].metadata
      });

      // Files created
      await codebaseDb.insertBatch([
        {
          id: `file-${taskId}-1`,
          vector: generateRandomVector(),
          metadata: generateCodebaseEntry({
            metadata: { relatedMicroTasks: [taskId] } as any
          }).metadata
        },
        {
          id: `file-${taskId}-2`,
          vector: generateRandomVector(),
          metadata: generateCodebaseEntry({
            metadata: { relatedMicroTasks: [taskId] } as any
          }).metadata
        }
      ]);

      // Errors encountered
      await errorDb.insert({
        id: `error-${taskId}`,
        vector: generateRandomVector(),
        metadata: generateErrorEntry().metadata
      });

      // Security findings
      await securityDb.insert({
        id: `security-${taskId}`,
        vector: generateRandomVector(),
        metadata: generateSecurityEntry().metadata
      });

      // Performance issues
      await performanceDb.insert({
        id: `perf-${taskId}`,
        vector: generateRandomVector(),
        metadata: generatePerformanceEntry().metadata
      });

      // THEN should be able to retrieve all related data
      const decompRecord = await decompositionDb.get(`decomp-${taskId}`);
      const files = await Promise.all([
        codebaseDb.get(`file-${taskId}-1`),
        codebaseDb.get(`file-${taskId}-2`)
      ]);
      const error = await errorDb.get(`error-${taskId}`);
      const security = await securityDb.get(`security-${taskId}`);
      const perf = await performanceDb.get(`perf-${taskId}`);

      expect(decompRecord).toBeDefined();
      expect(files.every(f => f !== null)).toBe(true);
      expect(error).toBeDefined();
      expect(security).toBeDefined();
      expect(perf).toBeDefined();
    });

    test('should perform cross-collection analysis', async () => {
      // GIVEN security and performance patterns
      const securityDb = getCollection(COLLECTIONS.SECURITY_PATTERNS);
      const performanceDb = getCollection(COLLECTIONS.PERFORMANCE_PATTERNS);

      const taskCategory = 'database-query';

      // Security pattern for SQL injection
      await securityDb.insert({
        id: 'sec-sql-injection',
        vector: generateRandomVector(),
        metadata: generateSecurityEntry({
          metadata: { taskCategory, vulnerabilityType: 'injection' } as any
        }).metadata
      });

      // Performance pattern for N+1 queries
      await performanceDb.insert({
        id: 'perf-n-plus-one',
        vector: generateRandomVector(),
        metadata: generatePerformanceEntry({
          metadata: { taskCategory, issueType: 'io' } as any
        }).metadata
      });

      // WHEN analyzing patterns by category
      const securityPatterns = await securityDb.search({
        vector: generateRandomVector(),
        k: 10
      });

      const performancePatterns = await performanceDb.search({
        vector: generateRandomVector(),
        k: 10
      });

      // THEN should find related patterns
      const securityInCategory = securityPatterns.filter(
        (p: any) => p.metadata?.taskCategory === taskCategory
      );
      const perfInCategory = performancePatterns.filter(
        (p: any) => p.metadata?.taskCategory === taskCategory
      );

      expect(securityInCategory.length).toBeGreaterThan(0);
      expect(perfInCategory.length).toBeGreaterThan(0);
    });
  });

  describe('Realistic Load Testing', () => {
    test('should handle 100 documents efficiently', async () => {
      // GIVEN 100 decomposition entries
      const db = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const entries = generateDecompositionBatch(100);

      // WHEN inserting all entries
      const timer = new PerformanceTimer();
      timer.start();

      await db.insertBatch(
        entries.map((e, i) => ({
          id: `load-test-${i}`,
          vector: generateRandomVector(),
          metadata: e.metadata
        }))
      );

      const insertDuration = timer.stop();

      // THEN insert should be fast (<500ms for 100 docs)
      expect(insertDuration).toBeLessThan(500);

      // AND querying should also be fast
      timer.start();
      const results = await db.search({
        vector: generateRandomVector(),
        k: 10
      });
      const queryDuration = timer.stop();

      expect(queryDuration).toBeLessThan(100);
      expect(results.length).toBeLessThanOrEqual(10);
    });

    test('should maintain performance with large dataset', async () => {
      // GIVEN database with 200+ documents
      const db = getCollection(COLLECTIONS.CODEBASE_INDEX);

      const entries = Array.from({ length: 200 }, (_, i) => ({
        id: `large-dataset-${i}`,
        vector: generateRandomVector(),
        metadata: generateCodebaseEntry({
          metadata: { filePath: `/src/file-${i}.ts` } as any
        }).metadata
      }));

      await db.insertBatch(entries);

      // WHEN performing multiple queries
      const queryCount = 10;
      const timer = new PerformanceTimer();
      timer.start();

      const queryPromises = Array.from({ length: queryCount }, () =>
        db.search({
          vector: generateRandomVector(),
          k: 10
        })
      );

      await Promise.all(queryPromises);
      const totalDuration = timer.stop();

      // THEN average query time should be reasonable (<50ms per query)
      const avgQueryTime = totalDuration / queryCount;
      expect(avgQueryTime).toBeLessThan(50);
    });

    test('should handle mixed operations at scale', async () => {
      // GIVEN a collection
      const db = getCollection(COLLECTIONS.ERROR_LIBRARY);

      // WHEN performing mixed insert/query operations
      const operations = [];

      // 50 inserts
      for (let i = 0; i < 50; i++) {
        operations.push(
          db.insert({
            id: `mixed-insert-${i}`,
            vector: generateRandomVector(),
            metadata: generateErrorEntry().metadata
          })
        );
      }

      // 50 queries
      for (let i = 0; i < 50; i++) {
        operations.push(
          db.search({
            vector: generateRandomVector(),
            k: 5
          })
        );
      }

      const timer = new PerformanceTimer();
      timer.start();
      await Promise.all(operations);
      const duration = timer.stop();

      // THEN should complete in reasonable time (<2s for 100 ops)
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent inserts across collections', async () => {
      // GIVEN all collections
      const collections = [
        getCollection(COLLECTIONS.DECOMPOSITION_HISTORY),
        getCollection(COLLECTIONS.CODEBASE_INDEX),
        getCollection(COLLECTIONS.ERROR_LIBRARY),
        getCollection(COLLECTIONS.SECURITY_PATTERNS),
        getCollection(COLLECTIONS.PERFORMANCE_PATTERNS)
      ];

      // WHEN inserting concurrently to all collections
      const insertPromises = collections.map((db, colIdx) =>
        Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            db.insert({
              id: `concurrent-col${colIdx}-doc${i}`,
              vector: generateRandomVector(),
              metadata: { index: i, collection: colIdx }
            })
          )
        )
      );

      await Promise.all(insertPromises);

      // THEN all inserts should succeed
      for (let colIdx = 0; colIdx < collections.length; colIdx++) {
        const stats = await collections[colIdx].stats();
        expect(stats.count).toBeGreaterThanOrEqual(10);
      }
    });

    test('should handle concurrent queries without race conditions', async () => {
      // GIVEN database with data
      const db = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);

      await db.insertBatch(
        Array.from({ length: 50 }, (_, i) => ({
          id: `race-test-${i}`,
          vector: generateRandomVector(),
          metadata: generateDecompositionBatch(1)[0].metadata
        }))
      );

      // WHEN executing many concurrent queries
      const queryPromises = Array.from({ length: 20 }, (_, i) =>
        db.search({
          vector: generateRandomVector(),
          k: 5
        })
      );

      // THEN all queries should complete without errors
      const results = await Promise.all(queryPromises);
      expect(results).toHaveLength(20);
      results.forEach(r => {
        expect(Array.isArray(r)).toBe(true);
        expect(r.length).toBeLessThanOrEqual(5);
      });
    });

    test('should support concurrent read/write operations', async () => {
      // GIVEN a collection
      const db = getCollection(COLLECTIONS.PERFORMANCE_PATTERNS);

      // WHEN mixing reads and writes concurrently
      const operations = [];

      // 10 writes
      for (let i = 0; i < 10; i++) {
        operations.push(
          db.insert({
            id: `rw-write-${i}`,
            vector: generateRandomVector(),
            metadata: generatePerformanceEntry().metadata
          })
        );
      }

      // 10 reads
      for (let i = 0; i < 10; i++) {
        operations.push(
          db.search({
            vector: generateRandomVector(),
            k: 3
          })
        );
      }

      // THEN all operations should complete successfully
      const results = await Promise.all(operations);
      expect(results).toHaveLength(20);
    });
  });

  describe('Connectivity and Health', () => {
    test('should verify database connectivity', async () => {
      // WHEN verifying connectivity
      const status = await verifyConnectivity();

      // THEN should report healthy status
      expect(status.connected).toBe(true);
      expect(status.latency).toBeGreaterThan(0);
      expect(status.latency).toBeLessThan(1000);
      expect(status.collectionsReady).toBe(true);
      expect(status.collections).toHaveLength(5);
    });

    test('should handle database restart gracefully', async () => {
      // GIVEN active database
      const db = getCollection(COLLECTIONS.CODEBASE_INDEX);

      await db.insert({
        id: 'restart-test',
        vector: generateRandomVector(),
        metadata: generateCodebaseEntry().metadata
      });

      // WHEN closing and reinitializing
      await closeRuVector();
      await initializeRuVector();

      // THEN should be able to access data
      const newDb = getCollection(COLLECTIONS.CODEBASE_INDEX);
      const retrieved = await newDb.get('restart-test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('restart-test');
    });
  });

  describe('Real-World Use Cases', () => {
    test('should support learning from decomposition history', async () => {
      // GIVEN historical decompositions
      const db = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);
      const successful = generateDecompositionBatch(20);

      await db.insertBatch(
        successful.map((s, i) => ({
          id: `learning-${i}`,
          vector: generateRandomVector(),
          metadata: {
            ...s.metadata,
            finalDecision: 'PROCEED',
            gateCheckScore: 0.95 + Math.random() * 0.03
          }
        }))
      );

      // WHEN searching for similar successful patterns
      const newTaskVector = generateRandomVector();
      const results = await db.search({
        vector: newTaskVector,
        k: 5
      });

      // THEN should retrieve successful patterns
      expect(results).toHaveLength(5);
      results.forEach(r => {
        expect(r.metadata?.finalDecision).toBe('PROCEED');
        expect(r.metadata?.gateCheckScore).toBeGreaterThan(0.95);
      });
    });

    test('should support vulnerability pattern detection', async () => {
      // GIVEN security patterns
      const db = getCollection(COLLECTIONS.SECURITY_PATTERNS);

      // Common vulnerabilities
      const patterns = [
        { type: 'injection', score: 90, findings: 3 },
        { type: 'injection', score: 85, findings: 2 },
        { type: 'xss', score: 75, findings: 1 },
        { type: 'auth', score: 80, findings: 2 }
      ];

      await db.insertBatch(
        patterns.map((p, i) => ({
          id: `vuln-${i}`,
          vector: generateRandomVector(),
          metadata: generateSecurityEntry({
            metadata: {
              vulnerabilityType: p.type,
              vulnerabilityScore: p.score,
              criticalFindingsCount: p.findings
            } as any
          }).metadata
        }))
      );

      // WHEN analyzing code with potential injection
      const codeVector = generateRandomVector();
      const results = await db.search({
        vector: codeVector,
        k: 10
      });

      // THEN should find relevant patterns
      const injectionPatterns = results.filter(
        (r: any) => r.metadata?.vulnerabilityType === 'injection'
      );

      expect(injectionPatterns.length).toBeGreaterThan(0);
    });
  });
});
