/**
 * Database Service Test Suite
 *
 * Comprehensive tests for the database abstraction layer.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 *
 * Test Coverage:
 * - Connection management
 * - CRUD operations for each adapter
 * - Query filtering and options
 * - Transaction management
 * - Cross-database queries
 * - Correlation key support
 * - Error handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import {
  DatabaseService,
  RedisAdapter,
  SQLiteAdapter,
  PostgresAdapter,
  buildTaskKey,
  buildAgentKey,
  buildCorrelationKey,
  parseCorrelationKey,
  DatabaseErrorCode,
} from '../src/lib/database-service';

describe('Database Service', () => {
  let dbService: DatabaseService;

  beforeAll(async () => {
    dbService = new DatabaseService({
      redis: {
        type: 'redis',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        timeout: 5000,
      },
      sqlite: {
        type: 'sqlite',
        database: ':memory:',
      },
      postgres: {
        type: 'postgres',
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/test',
        poolSize: 5,
      },
    });

    await dbService.connect();

    // Setup test tables
    const sqlite = dbService.getAdapter('sqlite');
    await sqlite.raw(`
      CREATE TABLE IF NOT EXISTS test_table (
        id TEXT PRIMARY KEY,
        name TEXT,
        value INTEGER,
        created_at TEXT
      )
    `);

    const postgres = dbService.getAdapter('postgres');
    await postgres.raw(`
      CREATE TABLE IF NOT EXISTS test_table (
        id TEXT PRIMARY KEY,
        name TEXT,
        value INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  });

  afterAll(async () => {
    // Cleanup
    const sqlite = dbService.getAdapter('sqlite');
    await sqlite.raw('DROP TABLE IF EXISTS test_table');

    const postgres = dbService.getAdapter('postgres');
    await postgres.raw('DROP TABLE IF EXISTS test_table');

    await dbService.disconnect();
  });

  beforeEach(async () => {
    // Clear test data
    const sqlite = dbService.getAdapter('sqlite');
    await sqlite.raw('DELETE FROM test_table');

    const postgres = dbService.getAdapter('postgres');
    await postgres.raw('DELETE FROM test_table');

    const redis = dbService.getAdapter('redis');
    const keys = await redis.raw('KEYS', ['test:*']);
    if (keys && Array.isArray(keys) && keys.length > 0) {
      for (const key of keys) {
        await redis.delete('', key);
      }
    }
  });

  describe('Connection Management', () => {
    it('should connect to all databases', () => {
      expect(dbService.isConnected()).toBe(true);
    });

    it('should get adapter by type', () => {
      const redisAdapter = dbService.getAdapter('redis');
      expect(redisAdapter.getType()).toBe('redis');

      const sqliteAdapter = dbService.getAdapter('sqlite');
      expect(sqliteAdapter.getType()).toBe('sqlite');

      const postgresAdapter = dbService.getAdapter('postgres');
      expect(postgresAdapter.getType()).toBe('postgres');
    });

    it('should throw error for unconfigured adapter', () => {
      const dbService2 = new DatabaseService({});

      expect(() => dbService2.getAdapter('redis')).toThrow();
    });

    it('should provide database statistics', () => {
      const stats = dbService.getStats();

      expect(stats.adapters.redis).toBe(true);
      expect(stats.adapters.sqlite).toBe(true);
      expect(stats.adapters.postgres).toBe(true);
      expect(stats.transactions.active).toBe(0);
    });
  });

  describe('Redis Adapter', () => {
    it('should insert and get a record', async () => {
      const redis = dbService.getAdapter('redis');

      const data = { id: '1', name: 'Test', value: 100 };
      const insertResult = await redis.insert('test:1', data);

      expect(insertResult.success).toBe(true);
      expect(insertResult.rowsAffected).toBe(1);

      const retrieved = await redis.get('test:1');
      expect(retrieved).toEqual(data);
    });

    it('should update a record', async () => {
      const redis = dbService.getAdapter('redis');

      await redis.insert('test:2', { id: '2', name: 'Original', value: 50 });

      const updateResult = await redis.update('test:2', { value: 75 });

      expect(updateResult.success).toBe(true);

      const updated = await redis.get<any>('test:2');
      expect(updated?.value).toBe(75);
    });

    it('should delete a record', async () => {
      const redis = dbService.getAdapter('redis');

      await redis.insert('test:3', { id: '3', name: 'ToDelete', value: 25 });

      const deleteResult = await redis.delete('test:3');

      expect(deleteResult.success).toBe(true);

      const retrieved = await redis.get('test:3');
      expect(retrieved).toBeNull();
    });

    it('should list records with pattern', async () => {
      const redis = dbService.getAdapter('redis');

      await redis.insert('test:list:1', { id: '1', name: 'Item 1' });
      await redis.insert('test:list:2', { id: '2', name: 'Item 2' });
      await redis.insert('test:list:3', { id: '3', name: 'Item 3' });

      const results = await redis.list('test:list:*');

      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle query filters', async () => {
      const redis = dbService.getAdapter('redis');

      await redis.insert('test:filter:1', { id: '1', name: 'Alpha', value: 100 });
      await redis.insert('test:filter:2', { id: '2', name: 'Beta', value: 200 });
      await redis.insert('test:filter:3', { id: '3', name: 'Gamma', value: 150 });

      const results = await redis.query('test:filter:*', [
        { field: 'value', operator: 'gte', value: 150 }
      ]);

      expect(results.length).toBe(2);
    });
  });

  describe('SQLite Adapter', () => {
    it('should insert and get a record', async () => {
      const sqlite = dbService.getAdapter('sqlite');

      const data = { id: 'sqlite1', name: 'Test', value: 100 };
      const insertResult = await sqlite.insert('test_table', data);

      expect(insertResult.success).toBe(true);

      const retrieved = await sqlite.get('test_table:sqlite1');
      expect(retrieved).toMatchObject(data);
    });

    it('should list records with filters', async () => {
      const sqlite = dbService.getAdapter('sqlite');

      await sqlite.insert('test_table', { id: 's1', name: 'Alpha', value: 100 });
      await sqlite.insert('test_table', { id: 's2', name: 'Beta', value: 200 });
      await sqlite.insert('test_table', { id: 's3', name: 'Gamma', value: 150 });

      const results = await sqlite.list('test_table', {
        filters: [
          { field: 'value', operator: 'gt', value: 100 }
        ],
        orderBy: 'value',
        order: 'asc'
      });

      expect(results.length).toBe(2);
      expect(results[0]).toMatchObject({ id: 's3', value: 150 });
    });

    it('should update a record', async () => {
      const sqlite = dbService.getAdapter('sqlite');

      await sqlite.insert('test_table', { id: 's4', name: 'Original', value: 50 });

      const updateResult = await sqlite.update('test_table', 's4', { value: 75 });

      expect(updateResult.success).toBe(true);

      const updated = await sqlite.get<any>('test_table:s4');
      expect(updated?.value).toBe(75);
    });

    it('should delete a record', async () => {
      const sqlite = dbService.getAdapter('sqlite');

      await sqlite.insert('test_table', { id: 's5', name: 'ToDelete', value: 25 });

      const deleteResult = await sqlite.delete('test_table', 's5');

      expect(deleteResult.success).toBe(true);

      const retrieved = await sqlite.get('test_table:s5');
      expect(retrieved).toBeNull();
    });

    it('should handle transactions', async () => {
      const sqlite = dbService.getAdapter('sqlite');

      const context = await sqlite.beginTransaction();

      await sqlite.insert('test_table', { id: 'tx1', name: 'Transaction Test', value: 999 });

      await sqlite.commitTransaction(context);

      const retrieved = await sqlite.get('test_table:tx1');
      expect(retrieved).toBeTruthy();
    });

    it('should rollback transactions on error', async () => {
      const sqlite = dbService.getAdapter('sqlite');

      const context = await sqlite.beginTransaction();

      await sqlite.insert('test_table', { id: 'tx2', name: 'Rollback Test', value: 888 });

      await sqlite.rollbackTransaction(context);

      const retrieved = await sqlite.get('test_table:tx2');
      expect(retrieved).toBeNull();
    });
  });

  describe('PostgreSQL Adapter', () => {
    it('should insert and get a record', async () => {
      const postgres = dbService.getAdapter('postgres');

      const data = { id: 'pg1', name: 'Test', value: 100 };
      const insertResult = await postgres.insert('test_table', data);

      expect(insertResult.success).toBe(true);

      const retrieved = await postgres.get('test_table:pg1');
      expect(retrieved).toMatchObject(data);
    });

    it('should insert many records atomically', async () => {
      const postgres = dbService.getAdapter('postgres');

      const data = [
        { id: 'pg_batch1', name: 'Batch 1', value: 10 },
        { id: 'pg_batch2', name: 'Batch 2', value: 20 },
        { id: 'pg_batch3', name: 'Batch 3', value: 30 },
      ];

      const insertResult = await postgres.insertMany('test_table', data);

      expect(insertResult.success).toBe(true);
      expect(insertResult.rowsAffected).toBe(3);
    });

    it('should list records with limit and offset', async () => {
      const postgres = dbService.getAdapter('postgres');

      await postgres.insert('test_table', { id: 'pg2', name: 'Alpha', value: 100 });
      await postgres.insert('test_table', { id: 'pg3', name: 'Beta', value: 200 });
      await postgres.insert('test_table', { id: 'pg4', name: 'Gamma', value: 150 });

      const results = await postgres.list('test_table', {
        limit: 2,
        offset: 0,
        orderBy: 'value',
        order: 'desc'
      });

      expect(results.length).toBe(2);
      expect(results[0]).toMatchObject({ id: 'pg3', value: 200 });
    });
  });

  describe('Correlation Keys', () => {
    it('should build task correlation key', () => {
      const key = buildTaskKey('task123', 'agent');
      expect(key).toBe('task:task123:agent');
    });

    it('should build agent correlation key', () => {
      const key = buildAgentKey('agent456', 'execution');
      expect(key).toBe('agent:agent456:execution');
    });

    it('should build correlation key from object', () => {
      const key = buildCorrelationKey({
        type: 'task',
        id: 'abc123',
        entity: 'skill',
        subtype: 'validation'
      });

      expect(key).toBe('task:abc123:skill:validation');
    });

    it('should parse correlation key', () => {
      const parsed = parseCorrelationKey('task:abc123:skill:validation');

      expect(parsed).toEqual({
        type: 'task',
        id: 'abc123',
        entity: 'skill',
        subtype: 'validation'
      });
    });

    it('should return null for invalid correlation key', () => {
      const parsed = parseCorrelationKey('invalid');
      expect(parsed).toBeNull();
    });
  });

  describe('Cross-Database Queries', () => {
    it('should get data by correlation key across all databases', async () => {
      const redis = dbService.getAdapter('redis');
      const sqlite = dbService.getAdapter('sqlite');
      const postgres = dbService.getAdapter('postgres');

      const key = buildTaskKey('cross_db_test');

      // Insert data in all three databases
      await redis.insert(key, { source: 'redis', data: 'Redis data' });
      await sqlite.insert('test_table', { id: key, name: 'SQLite data', value: 1 });
      await postgres.insert('test_table', { id: key, name: 'Postgres data', value: 2 });

      // Query across all databases
      const result = await dbService.getByCorrelationKey({
        type: 'task',
        id: 'cross_db_test'
      });

      expect(result.redis).toBeTruthy();
      expect(result.sqlite).toBeTruthy();
      expect(result.postgres).toBeTruthy();
    });
  });

  describe('Cross-Database Transactions', () => {
    it('should execute atomic operations across databases', async () => {
      const result = await dbService.executeTransaction([
        {
          database: 'sqlite',
          operation: async (adapter) => {
            return adapter.insert('test_table', {
              id: 'cross_tx_1',
              name: 'SQLite TX',
              value: 100
            });
          }
        },
        {
          database: 'postgres',
          operation: async (adapter) => {
            return adapter.insert('test_table', {
              id: 'cross_tx_1',
              name: 'Postgres TX',
              value: 200
            });
          }
        }
      ]);

      expect(result.length).toBe(2);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle not found errors', async () => {
      const sqlite = dbService.getAdapter('sqlite');

      const result = await sqlite.get('test_table:nonexistent');
      expect(result).toBeNull();
    });

    it('should handle update on non-existent record', async () => {
      const sqlite = dbService.getAdapter('sqlite');

      const updateResult = await sqlite.update('test_table', 'nonexistent', { value: 999 });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error?.code).toBe(DatabaseErrorCode.NOT_FOUND);
    });

    it('should handle delete on non-existent record', async () => {
      const sqlite = dbService.getAdapter('sqlite');

      const deleteResult = await sqlite.delete('test_table', 'nonexistent');

      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error?.code).toBe(DatabaseErrorCode.NOT_FOUND);
    });
  });
});
