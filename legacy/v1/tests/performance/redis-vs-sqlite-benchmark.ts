/**
 * Redis vs SQLite Performance Benchmark - Sprint 1.7
 *
 * Test Coverage:
 * 1. Redis-only vs dual-write performance comparison
 * 2. Memory overhead measurement (SQLite DB size)
 * 3. Query performance comparison (read patterns)
 * 4. Write throughput comparison
 *
 * Epic: SQLite Integration Migration
 * Sprint: 1.7 - Testing & Validation
 *
 * @module tests/performance/redis-vs-sqlite-benchmark
 */

import Redis from 'ioredis';
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import { join } from 'path';

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '1'),
};

const TEST_DB_PATH = join(process.cwd(), '.test-benchmark.db');

class BenchmarkManager {
  constructor(private redis: Redis, private db: Database.Database) {
    db.pragma('journal_mode = WAL');
  }

  async redisOnlyWrite(iterations: number): Promise<{ duration: number; throughput: number }> {
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      await this.redis.set(`redis:key-${i}`, JSON.stringify({ value: i }));
    }

    const duration = Date.now() - start;
    const throughput = (iterations / duration) * 1000;

    return { duration, throughput };
  }

  async dualWrite(iterations: number): Promise<{ duration: number; throughput: number }> {
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      await Promise.all([
        this.redis.set(`dual:key-${i}`, JSON.stringify({ value: i })),
        new Promise<void>((resolve) => {
          this.db.prepare(`
            INSERT OR REPLACE INTO benchmark_data (key, value, timestamp)
            VALUES (?, ?, ?)
          `).run(`key-${i}`, JSON.stringify({ value: i }), Date.now());
          resolve();
        }),
      ]);
    }

    const duration = Date.now() - start;
    const throughput = (iterations / duration) * 1000;

    return { duration, throughput };
  }

  async redisRead(iterations: number): Promise<{ duration: number; throughput: number }> {
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      await this.redis.get(`redis:key-${i}`);
    }

    const duration = Date.now() - start;
    const throughput = (iterations / duration) * 1000;

    return { duration, throughput };
  }

  async sqliteRead(iterations: number): Promise<{ duration: number; throughput: number }> {
    const start = Date.now();

    const stmt = this.db.prepare('SELECT value FROM benchmark_data WHERE key = ?');
    for (let i = 0; i < iterations; i++) {
      stmt.get(`key-${i}`);
    }

    const duration = Date.now() - start;
    const throughput = (iterations / duration) * 1000;

    return { duration, throughput };
  }

  async getSQLiteSize(): Promise<number> {
    const stats = await fs.stat(TEST_DB_PATH);
    return stats.size;
  }
}

describe('Redis vs SQLite Benchmark', () => {
  let redis: Redis;
  let db: Database.Database;
  let benchmark: BenchmarkManager;

  beforeEach(async () => {
    redis = new Redis(REDIS_CONFIG);
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });

    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore
    }

    db = new Database(TEST_DB_PATH);
    db.exec(`
      CREATE TABLE benchmark_data (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX idx_benchmark_timestamp ON benchmark_data(timestamp);
    `);

    benchmark = new BenchmarkManager(redis, db);
  });

  afterEach(async () => {
    db.close();
    await redis.quit();
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore
    }
  });

  it('should compare write performance: Redis-only vs Dual-write', async () => {
    const iterations = 1000;

    // Benchmark Redis-only writes
    const redisResult = await benchmark.redisOnlyWrite(iterations);

    // Benchmark dual-write
    const dualResult = await benchmark.dualWrite(iterations);

    console.log('\n=== WRITE PERFORMANCE COMPARISON ===');
    console.log(`Redis-only: ${redisResult.duration}ms (${redisResult.throughput.toFixed(0)} ops/sec)`);
    console.log(`Dual-write: ${dualResult.duration}ms (${dualResult.throughput.toFixed(0)} ops/sec)`);

    const overhead = ((dualResult.duration - redisResult.duration) / redisResult.duration) * 100;
    console.log(`Overhead: ${overhead.toFixed(1)}%`);

    // Dual-write should be slower but still performant
    expect(dualResult.throughput).toBeGreaterThan(500); // Minimum throughput
    expect(overhead).toBeLessThan(200); // Less than 2x overhead
  }, 60000);

  it('should compare read performance: Redis vs SQLite', async () => {
    const iterations = 1000;

    // Prepare data
    await benchmark.dualWrite(iterations);

    // Benchmark Redis reads
    const redisResult = await benchmark.redisRead(iterations);

    // Benchmark SQLite reads
    const sqliteResult = await benchmark.sqliteRead(iterations);

    console.log('\n=== READ PERFORMANCE COMPARISON ===');
    console.log(`Redis: ${redisResult.duration}ms (${redisResult.throughput.toFixed(0)} ops/sec)`);
    console.log(`SQLite: ${sqliteResult.duration}ms (${sqliteResult.throughput.toFixed(0)} ops/sec)`);

    const performanceRatio = redisResult.throughput / sqliteResult.throughput;
    console.log(`Redis is ${performanceRatio.toFixed(1)}x faster than SQLite`);

    // Redis should be faster for reads
    expect(redisResult.throughput).toBeGreaterThan(sqliteResult.throughput);
  }, 60000);

  it('should measure SQLite memory overhead', async () => {
    const recordCount = 10000;

    // Initial size
    const initialSize = await benchmark.getSQLiteSize();

    // Write 10K records
    for (let i = 0; i < recordCount; i++) {
      this.db.prepare(`
        INSERT INTO benchmark_data (key, value, timestamp)
        VALUES (?, ?, ?)
      `).run(`overhead-key-${i}`, JSON.stringify({ index: i, data: 'test-data' }), Date.now());
    }

    // Final size
    const finalSize = await benchmark.getSQLiteSize();
    const overhead = finalSize - initialSize;
    const bytesPerRecord = overhead / recordCount;

    console.log('\n=== MEMORY OVERHEAD ===');
    console.log(`Initial Size: ${(initialSize / 1024).toFixed(2)} KB`);
    console.log(`Final Size: ${(finalSize / 1024).toFixed(2)} KB`);
    console.log(`Overhead: ${(overhead / 1024).toFixed(2)} KB for ${recordCount} records`);
    console.log(`Bytes per Record: ${bytesPerRecord.toFixed(2)} bytes`);

    // Verify reasonable overhead
    expect(bytesPerRecord).toBeLessThan(500); // Less than 500 bytes per record
  }, 60000);

  it('should demonstrate dual-write resilience advantage', async () => {
    const iterations = 100;

    // Write with dual-write
    await benchmark.dualWrite(iterations);

    // Simulate Redis failure (disconnect)
    await redis.quit();

    // Verify SQLite still has all data
    const count = db.prepare('SELECT COUNT(*) as count FROM benchmark_data').get() as any;

    console.log('\n=== RESILIENCE TEST ===');
    console.log(`Records in SQLite after Redis disconnect: ${count.count}`);

    expect(count.count).toBe(iterations);

    // Reconnect Redis for cleanup
    redis = new Redis(REDIS_CONFIG);
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
  }, 60000);
});
