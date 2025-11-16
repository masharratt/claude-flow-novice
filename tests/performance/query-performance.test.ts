/**
 * Performance Test: Query Performance
 *
 * Target SLA: <5s for cross-system queries
 *
 * Tests:
 * - Database query performance
 * - Cross-system data retrieval
 * - Large result set handling
 * - Query optimization
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { DatabaseService } from '../../src/lib/database-service';
import { RedisCoordination } from '../../src/coordination';

describe('Query Performance', () => {
  let dbService: DatabaseService;
  let coordination: RedisCoordination;

  beforeAll(async () => {
    dbService = new DatabaseService({
      redis: { type: 'redis', host: 'localhost', port: 6379 },
      sqlite: { type: 'sqlite', database: ':memory:' },
    });

    await dbService.initialize();

    coordination = new RedisCoordination({
      host: 'localhost',
      port: 6379,
    });

    await coordination.connect();
  });

  afterAll(async () => {
    await dbService.disconnect();
    await coordination.disconnect();
  });

  it('should retrieve single record within 50ms', async () => {
    await dbService.set('redis', 'test:key', { data: 'value' });

    const start = Date.now();
    const result = await dbService.get('redis', 'test:key');
    const duration = Date.now() - start;

    expect(result.data).toBe('value');
    expect(duration).toBeLessThan(50);
  });

  it('should query 100 records within 200ms', async () => {
    // Populate data
    for (let i = 0; i < 100; i++) {
      await dbService.set('redis', `perf:item:${i}`, { id: i, data: `item${i}` });
    }

    const start = Date.now();
    const results = await dbService.query('redis', 'perf:item:*');
    const duration = Date.now() - start;

    expect(results.length).toBe(100);
    expect(duration).toBeLessThan(200);
  });

  it('should execute cross-system query within 1s', async () => {
    await dbService.set('redis', 'task:001', { id: '001' });
    await dbService.set('sqlite', 'tasks', { id: '001', status: 'active' });

    const start = Date.now();

    const redisData = await dbService.get('redis', 'task:001');
    const sqliteData = await dbService.get('sqlite', 'tasks', { id: '001' });

    const duration = Date.now() - start;

    expect(redisData.id).toBe('001');
    expect(sqliteData.status).toBe('active');
    expect(duration).toBeLessThan(1000);
  });

  it('should handle large result sets (1000 records) within 2s', async () => {
    // Populate large dataset
    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(
        dbService.set('redis', `large:${i}`, { id: i, data: `data${i}` })
      );
    }
    await Promise.all(promises);

    const start = Date.now();
    const results = await dbService.query('redis', 'large:*');
    const duration = Date.now() - start;

    expect(results.length).toBe(1000);
    expect(duration).toBeLessThan(2000);
  });

  it('should execute filtered queries efficiently', async () => {
    await dbService.set('sqlite', 'agents', { id: '001', type: 'backend', status: 'active' });
    await dbService.set('sqlite', 'agents', { id: '002', type: 'frontend', status: 'active' });
    await dbService.set('sqlite', 'agents', { id: '003', type: 'backend', status: 'inactive' });

    const start = Date.now();
    const results = await dbService.query('sqlite', 'agents', {
      type: 'backend',
      status: 'active',
    });
    const duration = Date.now() - start;

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('001');
    expect(duration).toBeLessThan(100);
  });

  it('should handle concurrent queries without degradation', async () => {
    // Populate data
    for (let i = 0; i < 50; i++) {
      await dbService.set('redis', `concurrent:${i}`, { id: i });
    }

    const start = Date.now();

    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(dbService.get('redis', `concurrent:${i}`));
    }

    await Promise.all(promises);
    const duration = Date.now() - start;

    // 50 concurrent queries should complete within 500ms
    expect(duration).toBeLessThan(500);
  });

  it('should maintain query performance under load', async () => {
    // Simulate load with background writes
    const writeLoad = setInterval(async () => {
      await dbService.set('redis', `load:${Date.now()}`, { data: 'test' });
    }, 10);

    // Execute queries
    const queryTimes = [];
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await dbService.get('redis', 'test:key');
      queryTimes.push(Date.now() - start);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    clearInterval(writeLoad);

    const avgQueryTime = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
    expect(avgQueryTime).toBeLessThan(100);
  });
});
