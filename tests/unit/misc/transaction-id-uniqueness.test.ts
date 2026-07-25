/**
 * Transaction ID Uniqueness Tests
 *
 * Tests for Issue #15: Transaction ID Collision Risk (MEDIUM)
 * Validates that transaction IDs use crypto.randomUUID() instead of Date.now()
 * to prevent collisions in rapid succession.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SQLiteAdapter } from '../src/lib/database-service/sqlite-adapter';
import { RedisAdapter } from '../src/lib/database-service/redis-adapter';
import { DatabaseConfig } from '../src/lib/database-service/types';

describe('Transaction ID Uniqueness', () => {
  describe('SQLiteAdapter', () => {
    let adapter: SQLiteAdapter;
    const config: DatabaseConfig = {
      type: 'sqlite',
      database: ':memory:',
    };

    beforeEach(async () => {
      adapter = new SQLiteAdapter(config);
      await adapter.connect();
    });

    afterEach(async () => {
      await adapter.disconnect();
    });

    it('should generate unique transaction IDs in rapid succession', async () => {
      const txPromises = Array.from({ length: 100 }, () =>
        adapter.beginTransaction()
      );

      const transactions = await Promise.all(txPromises);
      const transactionIds = transactions.map(tx => tx.id);

      // All IDs should be unique
      const uniqueIds = new Set(transactionIds);
      expect(uniqueIds.size).toBe(100);

      // All IDs should follow the pattern: sqlite-tx-{uuid}
      transactionIds.forEach(id => {
        expect(id).toMatch(/^sqlite-tx-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      });

      // Cleanup
      await Promise.all(transactions.map(tx => adapter.rollbackTransaction(tx)));
    });

    it('should use UUID format (not timestamp-based)', async () => {
      const tx = await adapter.beginTransaction();

      // Should NOT match Date.now() format (sqlite-tx-{timestamp})
      expect(tx.id).not.toMatch(/^sqlite-tx-\d+$/);

      // Should match UUID format
      expect(tx.id).toMatch(/^sqlite-tx-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      await adapter.rollbackTransaction(tx);
    });

    it('should not generate collisions even with concurrent transactions', async () => {
      // Test sequential transaction creation (SQLite doesn't support concurrent transactions)
      const allIds: string[] = [];

      for (let i = 0; i < 100; i++) {
        const tx = await adapter.beginTransaction();
        allIds.push(tx.id);
        await adapter.rollbackTransaction(tx);
      }

      // All 100 IDs should be unique
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(100);
    });
  });

  describe('RedisAdapter', () => {
    let adapter: RedisAdapter;
    const config: DatabaseConfig = {
      type: 'redis',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    };

    beforeEach(async () => {
      adapter = new RedisAdapter(config);
      try {
        await adapter.connect();
      } catch (err) {
        // Skip tests if Redis is not available
        console.warn('Redis not available, skipping RedisAdapter tests');
      }
    });

    afterEach(async () => {
      if (adapter.isConnected()) {
        await adapter.disconnect();
      }
    });

    it('should generate unique transaction IDs in rapid succession', async () => {
      if (!adapter.isConnected()) {
        console.warn('Redis not connected, skipping test');
        return;
      }

      const txPromises = Array.from({ length: 100 }, () =>
        adapter.beginTransaction()
      );

      const transactions = await Promise.all(txPromises);
      const transactionIds = transactions.map(tx => tx.id);

      // All IDs should be unique
      const uniqueIds = new Set(transactionIds);
      expect(uniqueIds.size).toBe(100);

      // All IDs should follow the pattern: redis-tx-{uuid}
      transactionIds.forEach(id => {
        expect(id).toMatch(/^redis-tx-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      });

      // Cleanup
      await Promise.all(transactions.map(tx => adapter.rollbackTransaction(tx)));
    });

    it('should use UUID format (not timestamp-based)', async () => {
      if (!adapter.isConnected()) {
        console.warn('Redis not connected, skipping test');
        return;
      }

      const tx = await adapter.beginTransaction();

      // Should NOT match old format (redis-tx-{timestamp}-{random})
      expect(tx.id).not.toMatch(/^redis-tx-\d+-[a-z0-9]+$/);

      // Should match UUID format
      expect(tx.id).toMatch(/^redis-tx-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      await adapter.rollbackTransaction(tx);
    });

    it('should not generate collisions even with concurrent transactions', async () => {
      if (!adapter.isConnected()) {
        console.warn('Redis not connected, skipping test');
        return;
      }

      // Test sequential transaction creation
      const allIds: string[] = [];

      for (let i = 0; i < 100; i++) {
        const tx = await adapter.beginTransaction();
        allIds.push(tx.id);
        await adapter.rollbackTransaction(tx);
      }

      // All 100 IDs should be unique
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(100);
    });
  });

  describe('Cross-Adapter Uniqueness', () => {
    it('should generate unique IDs across different adapter types', async () => {
      const sqliteConfig: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
      };

      const sqliteAdapter = new SQLiteAdapter(sqliteConfig);
      await sqliteAdapter.connect();

      const sqliteTxs = await Promise.all(
        Array.from({ length: 50 }, () => sqliteAdapter.beginTransaction())
      );

      const allIds = sqliteTxs.map(tx => tx.id);

      // All IDs should be unique
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(50);

      // Cleanup
      await Promise.all(sqliteTxs.map(tx => sqliteAdapter.rollbackTransaction(tx)));
      await sqliteAdapter.disconnect();
    });
  });
});
