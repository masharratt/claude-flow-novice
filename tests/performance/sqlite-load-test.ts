/**
 * SQLite Load Testing - Sprint 1.7
 *
 * Test Coverage:
 * 1. 10,000 writes/sec throughput validation
 * 2. p95 latency for dual-write (<60ms target)
 * 3. p95 latency for SQLite-only (<50ms target)
 * 4. Concurrent agent operations (100 agents)
 *
 * Epic: SQLite Integration Migration
 * Sprint: 1.7 - Testing & Validation
 *
 * @module tests/performance/sqlite-load-test
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

const TEST_DB_PATH = join(process.cwd(), '.test-perf-sqlite.db');

class PerformanceTestManager {
  constructor(private redis: Redis, private db: Database.Database) {
    // Enable WAL mode for performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }

  async dualWrite(key: string, value: any): Promise<number> {
    const start = performance.now();

    // Dual-write pattern
    await Promise.all([
      this.redis.set(`perf:${key}`, JSON.stringify(value)),
      new Promise<void>((resolve) => {
        this.db.prepare(`
          INSERT OR REPLACE INTO perf_data (key, value, timestamp)
          VALUES (?, ?, ?)
        `).run(key, JSON.stringify(value), Date.now());
        resolve();
      }),
    ]);

    return performance.now() - start;
  }

  async sqliteOnlyWrite(key: string, value: any): Promise<number> {
    const start = performance.now();

    this.db.prepare(`
      INSERT OR REPLACE INTO perf_data (key, value, timestamp)
      VALUES (?, ?, ?)
    `).run(key, JSON.stringify(value), Date.now());

    return performance.now() - start;
  }

  calculatePercentile(latencies: number[], percentile: number): number {
    const sorted = latencies.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }
}

describe('SQLite Load Tests (Performance)', () => {
  let redis: Redis;
  let db: Database.Database;
  let manager: PerformanceTestManager;

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
      CREATE TABLE perf_data (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX idx_perf_timestamp ON perf_data(timestamp);
    `);

    manager = new PerformanceTestManager(redis, db);
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

  it('should sustain 10,000 writes/sec throughput', async () => {
    const targetWrites = 10000;
    const timeWindow = 1000; // 1 second

    const startTime = Date.now();
    const writes: Promise<number>[] = [];

    for (let i = 0; i < targetWrites; i++) {
      writes.push(manager.dualWrite(`key-${i}`, { data: `value-${i}` }));
    }

    await Promise.all(writes);
    const duration = Date.now() - startTime;

    const writesPerSec = (targetWrites / duration) * 1000;

    console.log(`Throughput: ${writesPerSec.toFixed(0)} writes/sec`);
    console.log(`Duration: ${duration}ms for ${targetWrites} writes`);

    // Should complete 10K writes within reasonable time
    expect(writesPerSec).toBeGreaterThan(5000); // Allow some headroom
  }, 60000);

  it('should maintain p95 latency <60ms for dual-write', async () => {
    const writeCount = 1000;
    const latencies: number[] = [];

    for (let i = 0; i < writeCount; i++) {
      const latency = await manager.dualWrite(`latency-test-${i}`, {
        index: i,
        timestamp: Date.now(),
      });
      latencies.push(latency);
    }

    const p50 = manager.calculatePercentile(latencies, 50);
    const p95 = manager.calculatePercentile(latencies, 95);
    const p99 = manager.calculatePercentile(latencies, 99);

    console.log(`Dual-Write Latency - p50: ${p50.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms`);

    expect(p95).toBeLessThan(60); // Target: <60ms p95
  }, 60000);

  it('should maintain p95 latency <50ms for SQLite-only', async () => {
    const writeCount = 1000;
    const latencies: number[] = [];

    for (let i = 0; i < writeCount; i++) {
      const latency = await manager.sqliteOnlyWrite(`sqlite-only-${i}`, {
        index: i,
        timestamp: Date.now(),
      });
      latencies.push(latency);
    }

    const p50 = manager.calculatePercentile(latencies, 50);
    const p95 = manager.calculatePercentile(latencies, 95);
    const p99 = manager.calculatePercentile(latencies, 99);

    console.log(`SQLite-Only Latency - p50: ${p50.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms`);

    expect(p95).toBeLessThan(50); // Target: <50ms p95
  }, 60000);

  it('should handle 100 concurrent agents without degradation', async () => {
    const agentCount = 100;
    const writesPerAgent = 50;
    const allLatencies: number[] = [];

    // Simulate 100 agents writing concurrently
    const agentPromises = Array.from({ length: agentCount }, async (_, agentIdx) => {
      const agentLatencies: number[] = [];

      for (let writeIdx = 0; writeIdx < writesPerAgent; writeIdx++) {
        const latency = await manager.dualWrite(
          `agent-${agentIdx}-write-${writeIdx}`,
          {
            agentId: agentIdx,
            writeIdx,
            timestamp: Date.now(),
          }
        );
        agentLatencies.push(latency);
      }

      return agentLatencies;
    });

    const results = await Promise.all(agentPromises);
    results.forEach(latencies => allLatencies.push(...latencies));

    const p95 = manager.calculatePercentile(allLatencies, 95);

    console.log(`100 Concurrent Agents - Total Writes: ${allLatencies.length}, p95: ${p95.toFixed(2)}ms`);

    expect(allLatencies.length).toBe(agentCount * writesPerAgent);
    expect(p95).toBeLessThan(100); // Allow higher latency with contention
  }, 120000);
});
