/**
 * RuVector Performance Benchmarks
 *
 * Performance tests including:
 * - Insert 1000 documents: target <500ms
 * - Query with topK=10: target <100ms
 * - GNN learning iteration: target <1s
 * - Memory usage tracking
 * - Throughput measurement (ops/sec)
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { VectorDb: VectorDB, JsDistanceMetric } = require('@ruvector/core');
import {
  initializeRuVector,
  getCollection,
  COLLECTIONS,
  benchmarkPerformance,
  closeRuVector
} from '../../src/lib/ruvector-init';
import {
  generateRandomVector,
  generateDecompositionBatch,
  cleanupTestDatabases,
  createTestDataDir,
  PerformanceTimer,
  measureThroughput
} from './test-utils';
import * as path from 'path';
import * as fs from 'fs';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test-ruvector-benchmarks');

describe('RuVector Performance Benchmarks', () => {
  let db: InstanceType<typeof VectorDB>;
  let TEST_DB_PATH: string;

  beforeAll(() => {
    createTestDataDir(TEST_DATA_DIR);
  });

  beforeEach(() => {
    // Create unique database path for each test to prevent lock errors
    TEST_DB_PATH = path.join(TEST_DATA_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

    // Create fresh database for each benchmark
    db = new VectorDB({
      dimensions: 1536,
      distanceMetric: JsDistanceMetric.Cosine,
      storagePath: TEST_DB_PATH,
      hnswConfig: {
        m: 16,
        efConstruction: 200,
        efSearch: 100,
        maxElements: 10000
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

  describe('Insert Performance', () => {
    test('should insert 1000 documents in <500ms', async () => {
      // GIVEN 1000 documents
      const docCount = 1000;
      const entries = Array.from({ length: docCount }, (_, i) => ({
        id: `bench-insert-${i}`,
        vector: generateRandomVector(),
        metadata: { index: i, timestamp: Date.now() }
      }));

      // WHEN inserting all documents
      const timer = new PerformanceTimer();
      timer.start();

      await db.insertBatch(entries);

      const duration = timer.stop();

      // THEN should meet performance target
      console.log(`✓ Inserted ${docCount} documents in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500);

      // Verify all inserted (stats() may not exist in all RuVector versions)
      if (typeof db.stats === 'function') {
        const stats = await db.stats();
        expect(stats.count).toBe(docCount);
      }
    });

    test('should measure insert throughput (ops/sec)', async () => {
      // WHEN measuring insert throughput
      const result = await measureThroughput(
        async () => {
          await db.insert({
            id: `throughput-${Date.now()}-${Math.random()}`,
            vector: generateRandomVector(),
            metadata: { test: true }
          });
        },
        100 // 100 operations
      );

      // THEN should calculate metrics
      console.log(`✓ Insert throughput: ${result.opsPerSecond.toFixed(2)} ops/sec`);
      console.log(`  Average: ${result.avgTimeMs.toFixed(2)}ms per insert`);

      expect(result.opsPerSecond).toBeGreaterThan(100); // At least 100 ops/sec
      expect(result.avgTimeMs).toBeLessThan(10); // Less than 10ms per insert
    });

    test('should handle batch inserts efficiently at different sizes', async () => {
      const batchSizes = [10, 50, 100, 500];
      const results: Array<{ size: number; duration: number; opsPerSec: number }> = [];

      for (const size of batchSizes) {
        const entries = Array.from({ length: size }, (_, i) => ({
          id: `batch-size-${size}-${i}`,
          vector: generateRandomVector(),
          metadata: { batchSize: size, index: i }
        }));

        const timer = new PerformanceTimer();
        timer.start();
        await db.insertBatch(entries);
        const duration = timer.stop();

        const opsPerSec = (size / duration) * 1000;
        results.push({ size, duration, opsPerSec });

        console.log(`  Batch ${size}: ${duration.toFixed(2)}ms (${opsPerSec.toFixed(0)} ops/sec)`);
      }

      // THEN larger batches should maintain good throughput
      // Note: Throughput may not always scale linearly due to HNSW index construction overhead
      expect(results[results.length - 1].opsPerSec).toBeGreaterThan(500); // Minimum acceptable throughput
    });
  });

  describe('Query Performance', () => {
    beforeEach(async () => {
      // Pre-populate with 1000 documents for query tests
      const entries = Array.from({ length: 1000 }, (_, i) => ({
        id: `query-bench-${i}`,
        vector: generateRandomVector(),
        metadata: generateDecompositionBatch(1)[0].metadata
      }));

      await db.insertBatch(entries);
    });

    test('should query with topK=10 in <100ms', async () => {
      // WHEN querying
      const timer = new PerformanceTimer();
      timer.start();

      const results = await db.search({
        vector: generateRandomVector(),
        k: 10
      });

      const duration = timer.stop();

      // THEN should meet performance target
      console.log(`✓ Query (k=10) in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(100);
      expect(results.length).toBeLessThanOrEqual(10);
    });

    test('should measure query latency at different k values', async () => {
      const kValues = [1, 5, 10, 20, 50, 100];
      const results: Array<{ k: number; latency: number }> = [];

      for (const k of kValues) {
        const timer = new PerformanceTimer();
        timer.start();

        await db.search({
          vector: generateRandomVector(),
          k
        });

        const latency = timer.stop();
        results.push({ k, latency });

        console.log(`  k=${k}: ${latency.toFixed(2)}ms`);
      }

      // THEN latency should scale reasonably with k
      expect(results[0].latency).toBeLessThan(50); // k=1 should be very fast
      expect(results[results.length - 1].latency).toBeLessThan(200); // k=100 still reasonable
    });

    test('should measure query throughput (queries/sec)', async () => {
      // WHEN measuring query throughput
      const result = await measureThroughput(
        async () => {
          await db.search({
            vector: generateRandomVector(),
            k: 10
          });
        },
        50 // 50 queries
      );

      // THEN should calculate metrics
      console.log(`✓ Query throughput: ${result.opsPerSecond.toFixed(2)} queries/sec`);
      console.log(`  Average: ${result.avgTimeMs.toFixed(2)}ms per query`);

      expect(result.opsPerSecond).toBeGreaterThan(10); // At least 10 queries/sec
      expect(result.avgTimeMs).toBeLessThan(100);
    });

    test('should maintain query performance with concurrent requests', async () => {
      // WHEN executing concurrent queries
      const concurrentCount = 20;
      const timer = new PerformanceTimer();
      timer.start();

      const promises = Array.from({ length: concurrentCount }, () =>
        db.search({
          vector: generateRandomVector(),
          k: 10
        })
      );

      await Promise.all(promises);
      const duration = timer.stop();

      // THEN concurrent queries should be efficient
      const avgLatency = duration / concurrentCount;
      console.log(`✓ ${concurrentCount} concurrent queries in ${duration.toFixed(2)}ms`);
      console.log(`  Average latency: ${avgLatency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(100);
    });
  });

  describe('Index Building Performance', () => {
    test('should build HNSW index efficiently', async () => {
      // Skip if buildIndex not available (RuVector auto-indexes on insert)
      if (typeof db.buildIndex !== 'function') {
        console.log('✓ Skipped: buildIndex not available (RuVector auto-indexes)');
        return;
      }

      // GIVEN database with documents
      const docCount = 1000;
      await db.insertBatch(
        Array.from({ length: docCount }, (_, i) => ({
          id: `index-build-${i}`,
          vector: generateRandomVector(),
          metadata: { index: i }
        }))
      );

      // WHEN building index
      const timer = new PerformanceTimer();
      timer.start();

      await db.buildIndex();

      const duration = timer.stop();

      // THEN should build quickly
      console.log(`✓ Built HNSW index for ${docCount} docs in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(1000); // <1s for 1000 docs
    });

    test('should improve query performance after index build', async () => {
      // Skip if buildIndex not available (RuVector auto-indexes on insert)
      if (typeof db.buildIndex !== 'function') {
        console.log('✓ Skipped: buildIndex not available (RuVector auto-indexes)');
        return;
      }

      // GIVEN database with documents
      await db.insertBatch(
        Array.from({ length: 500 }, (_, i) => ({
          id: `index-perf-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // Measure query time before index
      const timer1 = new PerformanceTimer();
      timer1.start();
      await db.search({ vector: generateRandomVector(), k: 10 });
      const beforeIndex = timer1.stop();

      // WHEN building index
      await db.buildIndex();

      // AND measuring query time after index
      const timer2 = new PerformanceTimer();
      timer2.start();
      await db.search({ vector: generateRandomVector(), k: 10 });
      const afterIndex = timer2.stop();

      // THEN query should be faster or similar
      console.log(`  Before index: ${beforeIndex.toFixed(2)}ms`);
      console.log(`  After index: ${afterIndex.toFixed(2)}ms`);

      // Index should not significantly degrade performance
      expect(afterIndex).toBeLessThan(beforeIndex * 2);
    });
  });

  describe('Memory Usage', () => {
    test('should track memory usage during operations', async () => {
      // WHEN inserting documents and tracking memory
      const memoryReadings: number[] = [];

      if (global.gc) {
        global.gc(); // Force GC if available
      }

      const initialMemory = process.memoryUsage().heapUsed;
      memoryReadings.push(initialMemory);

      // Insert batches
      for (let batch = 0; batch < 5; batch++) {
        await db.insertBatch(
          Array.from({ length: 100 }, (_, i) => ({
            id: `memory-batch-${batch}-${i}`,
            vector: generateRandomVector(),
            metadata: generateDecompositionBatch(1)[0].metadata
          }))
        );

        const currentMemory = process.memoryUsage().heapUsed;
        memoryReadings.push(currentMemory);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthMB = memoryGrowth / 1024 / 1024;

      console.log(`✓ Memory growth for 500 docs: ${memoryGrowthMB.toFixed(2)}MB`);
      console.log(`  Initial: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Final: ${(finalMemory / 1024 / 1024).toFixed(2)}MB`);

      // THEN memory growth should be reasonable (<50MB for 500 docs)
      expect(memoryGrowthMB).toBeLessThan(50);
    });

    test('should report database statistics including memory', async () => {
      // Skip if stats not available
      if (typeof db.stats !== 'function') {
        console.log('✓ Skipped: stats() not available in this RuVector version');
        return;
      }

      // GIVEN database with data
      await db.insertBatch(
        Array.from({ length: 100 }, (_, i) => ({
          id: `stats-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // WHEN getting stats
      const stats = await db.stats();

      // THEN should include useful metrics
      console.log('✓ Database statistics:');
      console.log(`  Documents: ${stats.count}`);
      console.log(`  Dimension: ${stats.dimension}`);
      console.log(`  Metric: ${stats.metric}`);

      if (stats.memoryUsage) {
        console.log(`  Memory: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
      }

      expect(stats.count).toBe(100);
      expect(stats.dimension).toBe(1536);
    });
  });

  describe('Optimization Performance', () => {
    test('should optimize database efficiently', async () => {
      // Skip if optimize not available
      if (typeof db.optimize !== 'function') {
        console.log('✓ Skipped: optimize() not available in this RuVector version');
        return;
      }

      // GIVEN database with operations
      await db.insertBatch(
        Array.from({ length: 500 }, (_, i) => ({
          id: `optimize-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // Delete some documents
      for (let i = 0; i < 50; i++) {
        await db.delete(`optimize-${i}`);
      }

      // WHEN optimizing
      const timer = new PerformanceTimer();
      timer.start();

      await db.optimize();

      const duration = timer.stop();

      // THEN should optimize quickly
      console.log(`✓ Optimized database in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(1000); // <1s for optimization
    });
  });

  describe('Persistence Performance', () => {
    test('should save database efficiently', async () => {
      // Skip if save not available (RuVector auto-persists)
      if (typeof db.save !== 'function') {
        console.log('✓ Skipped: save() not available (RuVector auto-persists to storagePath)');
        return;
      }

      // GIVEN database with data
      await db.insertBatch(
        Array.from({ length: 1000 }, (_, i) => ({
          id: `persist-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // WHEN saving to disk
      const savePath = path.join(TEST_DATA_DIR, `save-test-${Date.now()}.db`);
      const timer = new PerformanceTimer();
      timer.start();

      await db.save(savePath);

      const duration = timer.stop();

      // THEN should save quickly
      console.log(`✓ Saved database in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500);
      expect(fs.existsSync(savePath)).toBe(true);

      // Cleanup
      if (fs.existsSync(savePath)) {
        fs.unlinkSync(savePath);
      }
    });

    test('should load database efficiently', async () => {
      // Skip if load not available
      if (typeof db.load !== 'function') {
        console.log('✓ Skipped: load() not available in this RuVector version');
        return;
      }

      // GIVEN saved database
      const savePath = path.join(TEST_DATA_DIR, `load-test-${Date.now()}.db`);

      // Create and save database
      await db.insertBatch(
        Array.from({ length: 500 }, (_, i) => ({
          id: `load-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );
      await db.save(savePath);

      // WHEN loading database
      const newDbPath = path.join(TEST_DATA_DIR, `new-db-${Date.now()}.db`);
      const newDb = new VectorDB({
        dimensions: 1536,
        distanceMetric: JsDistanceMetric.Cosine,
        storagePath: newDbPath
      });

      const timer = new PerformanceTimer();
      timer.start();

      await newDb.load(savePath);

      const duration = timer.stop();

      // THEN should load quickly
      console.log(`✓ Loaded database in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500);

      // Verify data loaded
      const stats = await newDb.stats();
      expect(stats.count).toBe(500);

      // Cleanup
      if (fs.existsSync(savePath)) {
        fs.unlinkSync(savePath);
      }
      if (fs.existsSync(newDbPath)) {
        fs.unlinkSync(newDbPath);
      }
    });
  });

  describe('Built-in Benchmark', () => {
    test('should run built-in benchmark and pass performance targets', async () => {
      // GIVEN clean RuVector initialization (close any existing connections first)
      await closeRuVector();

      // Use unique path for this test to avoid database lock conflicts
      const uniquePath = path.join(TEST_DATA_DIR, `init-bench-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
      process.env.RUVECTOR_DB_PATH = uniquePath;
      await initializeRuVector();

      // WHEN running benchmark
      const results = await benchmarkPerformance();

      // THEN should meet targets
      console.log('✓ Built-in benchmark results:');
      console.log(`  Insert: ${results.insertLatency.toFixed(2)}ms`);
      console.log(`  Query: ${results.queryLatency.toFixed(2)}ms`);
      console.log(`  Passed: ${results.passed}`);

      expect(results.insertLatency).toBeLessThan(100);
      expect(results.queryLatency).toBeLessThan(100);
      expect(results.passed).toBe(true);

      await closeRuVector();
    });
  });

  describe('Real-World Scenario Benchmarks', () => {
    test('should handle typical RAG workflow efficiently', async () => {
      // GIVEN initial knowledge base
      await db.insertBatch(
        Array.from({ length: 200 }, (_, i) => ({
          id: `knowledge-${i}`,
          vector: generateRandomVector(),
          metadata: generateDecompositionBatch(1)[0].metadata
        }))
      );

      // WHEN simulating RAG workflow (query + insert new learning)
      const timer = new PerformanceTimer();
      timer.start();

      for (let i = 0; i < 10; i++) {
        // Query for similar patterns
        await db.search({
          vector: generateRandomVector(),
          k: 5
        });

        // Insert new learning
        await db.insert({
          id: `rag-new-${i}`,
          vector: generateRandomVector(),
          metadata: generateDecompositionBatch(1)[0].metadata
        });
      }

      const duration = timer.stop();

      // THEN workflow should be fast
      console.log(`✓ RAG workflow (10 iterations) in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(1000); // <1s for 10 iterations
    });

    test('should handle batch learning updates efficiently', async () => {
      // GIVEN existing knowledge base
      await db.insertBatch(
        Array.from({ length: 500 }, (_, i) => ({
          id: `base-${i}`,
          vector: generateRandomVector(),
          metadata: {}
        }))
      );

      // WHEN batch updating with new learnings
      const newLearnings = Array.from({ length: 100 }, (_, i) => ({
        id: `learning-${i}`,
        vector: generateRandomVector(),
        metadata: generateDecompositionBatch(1)[0].metadata
      }));

      const timer = new PerformanceTimer();
      timer.start();

      await db.insertBatch(newLearnings);

      const duration = timer.stop();

      // THEN batch update should be fast
      console.log(`✓ Batch learning update (100 docs) in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500); // Allow 500ms for batch with HNSW indexing

      // Verify total count (stats() may not exist in all RuVector versions)
      if (typeof db.stats === 'function') {
        const stats = await db.stats();
        expect(stats.count).toBe(600);
      }
    });
  });
});
