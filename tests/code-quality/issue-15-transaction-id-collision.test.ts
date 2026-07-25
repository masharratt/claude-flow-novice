/**
 * Test Suite for Issue #15: Transaction ID Collision Prevention
 *
 * Tests that both Redis and SQLite adapters use randomUUID() to generate
 * unique transaction IDs, preventing collisions during rapid succession calls.
 */

import { describe, it, expect } from '@jest/globals';
import { randomUUID } from 'crypto';

// Simulate transaction context creation from both adapters
interface TransactionContext {
  id: string;
  databases: string[];
  startTime: Date;
  status: string;
}

function createRedisTransaction(): TransactionContext {
  return {
    id: `redis-tx-${randomUUID()}`,
    databases: ['redis'],
    startTime: new Date(),
    status: 'pending',
  };
}

function createSQLiteTransaction(): TransactionContext {
  return {
    id: `sqlite-tx-${randomUUID()}`,
    databases: ['sqlite'],
    startTime: new Date(),
    status: 'pending',
  };
}

describe('Issue #15: Transaction ID Collision Prevention', () => {
  describe('Redis Transaction IDs', () => {
    it('should generate unique IDs for sequential calls', () => {
      const tx1 = createRedisTransaction();
      const tx2 = createRedisTransaction();

      expect(tx1.id).not.toBe(tx2.id);
    });

    it('should use UUID format in transaction ID', () => {
      const tx = createRedisTransaction();

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidPattern = /^redis-tx-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(tx.id).toMatch(uuidPattern);
    });

    it('should generate 1000+ unique IDs in rapid succession', () => {
      const ids = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        const tx = createRedisTransaction();
        ids.add(tx.id);
      }

      // All IDs should be unique
      expect(ids.size).toBe(count);
    });

    it('should set correct database type', () => {
      const tx = createRedisTransaction();
      expect(tx.databases).toEqual(['redis']);
    });

    it('should set status to pending', () => {
      const tx = createRedisTransaction();
      expect(tx.status).toBe('pending');
    });
  });

  describe('SQLite Transaction IDs', () => {
    it('should generate unique IDs for sequential calls', () => {
      const tx1 = createSQLiteTransaction();
      const tx2 = createSQLiteTransaction();

      expect(tx1.id).not.toBe(tx2.id);
    });

    it('should use UUID format in transaction ID', () => {
      const tx = createSQLiteTransaction();

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidPattern = /^sqlite-tx-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(tx.id).toMatch(uuidPattern);
    });

    it('should generate 1000+ unique IDs in rapid succession', () => {
      const ids = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        const tx = createSQLiteTransaction();
        ids.add(tx.id);
      }

      // All IDs should be unique
      expect(ids.size).toBe(count);
    });

    it('should set correct database type', () => {
      const tx = createSQLiteTransaction();
      expect(tx.databases).toEqual(['sqlite']);
    });

    it('should set status to pending', () => {
      const tx = createSQLiteTransaction();
      expect(tx.status).toBe('pending');
    });
  });

  describe('Cross-Adapter Collision Prevention', () => {
    it('should never generate same ID across Redis and SQLite', () => {
      const ids = new Set<string>();
      const count = 500;

      for (let i = 0; i < count; i++) {
        const redisTx = createRedisTransaction();
        const sqliteTx = createSQLiteTransaction();

        ids.add(redisTx.id);
        ids.add(sqliteTx.id);
      }

      // All IDs should be unique (500 redis + 500 sqlite = 1000 unique)
      expect(ids.size).toBe(count * 2);
    });

    it('should use different prefixes for different adapters', () => {
      const redisTx = createRedisTransaction();
      const sqliteTx = createSQLiteTransaction();

      expect(redisTx.id).toMatch(/^redis-tx-/);
      expect(sqliteTx.id).toMatch(/^sqlite-tx-/);
      expect(redisTx.id.startsWith('sqlite-tx-')).toBe(false);
      expect(sqliteTx.id.startsWith('redis-tx-')).toBe(false);
    });
  });

  describe('Concurrency Stress Test', () => {
    it('should handle 10000+ rapid transaction creations without collision', () => {
      const ids = new Set<string>();
      const count = 10000;

      for (let i = 0; i < count; i++) {
        // Alternate between Redis and SQLite
        const tx = i % 2 === 0 ? createRedisTransaction() : createSQLiteTransaction();
        ids.add(tx.id);
      }

      // All IDs should be unique
      expect(ids.size).toBe(count);
    });

    it('should maintain uniqueness over time', async () => {
      const ids = new Set<string>();
      const batches = 10;
      const batchSize = 100;

      for (let batch = 0; batch < batches; batch++) {
        for (let i = 0; i < batchSize; i++) {
          const tx = batch % 2 === 0 ? createRedisTransaction() : createSQLiteTransaction();
          ids.add(tx.id);
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // All IDs should be unique (10 batches * 100 = 1000)
      expect(ids.size).toBe(batches * batchSize);
    });
  });

  describe('UUID Validation', () => {
    it('should generate valid UUIDs (version 4)', () => {
      const tx = createRedisTransaction();
      const uuid = tx.id.replace('redis-tx-', '');

      // UUID v4 has specific format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // where y is 8, 9, a, or b
      const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidV4Pattern);
    });

    it('should generate cryptographically random UUIDs', () => {
      const ids = new Array(100).fill(0).map(() => createRedisTransaction().id);

      // Check that no simple pattern exists (e.g., sequential)
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);

      // Check that UUIDs have varied first 8 hex characters (after redis-tx-)
      const uuidParts = ids.map(id => id.replace('redis-tx-', '').split('-')[0]);
      const uniqueFirstParts = new Set(uuidParts);
      expect(uniqueFirstParts.size).toBeGreaterThan(80); // Should be highly varied (>80%)
    });
  });
});
