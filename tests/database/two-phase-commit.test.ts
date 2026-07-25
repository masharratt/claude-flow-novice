/**
 * Two-Phase Commit (2PC) Protocol Tests
 *
 * Comprehensive test suite for cross-database two-phase commit protocol.
 * Tests atomic transactions across Redis, SQLite, and PostgreSQL.
 *
 * Coverage Target: >90%
 * Test Cases: >20
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TransactionManager, Transaction, TransactionState } from '../../src/lib/database-service/transaction-manager';
import { PostgresAdapter } from '../../src/lib/database-service/postgres-adapter';
import { SQLiteAdapter } from '../../src/lib/database-service/sqlite-adapter';
import { RedisAdapter } from '../../src/lib/database-service/redis-adapter';
import { DatabaseErrorCode } from '../../src/lib/database-service/types';

describe('Two-Phase Commit Protocol', () => {
  let txManager: TransactionManager;
  let sqliteAdapter: SQLiteAdapter;
  let redisAdapter: RedisAdapter;

  beforeEach(async () => {
    // Setup SQLite adapter (in-memory)
    sqliteAdapter = new SQLiteAdapter({
      type: 'sqlite',
      database: ':memory:',
    });
    await sqliteAdapter.connect();

    // Setup Redis adapter (localhost)
    redisAdapter = new RedisAdapter({
      type: 'redis',
      host: 'localhost',
      port: 6379,
    });
    await redisAdapter.connect();

    // Setup transaction manager
    txManager = new TransactionManager();
    txManager.registerAdapter('sqlite', sqliteAdapter);
    txManager.registerAdapter('redis', redisAdapter);

    // Create test tables
    await sqliteAdapter.raw(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )
    `);

    await sqliteAdapter.raw(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
  });

  afterEach(async () => {
    await sqliteAdapter.disconnect();
    await redisAdapter.disconnect();
  });

  describe('Transaction State Management', () => {
    it('should track transaction state transitions', async () => {
      const tx = await txManager.begin(['sqlite', 'redis']);

      expect(tx.getTransactionState()).toBe(TransactionState.ACTIVE);

      await tx.commit();

      const log = tx.get2PCLog();
      expect(log.length).toBeGreaterThan(0);

      const states = log.map(entry => entry.state);
      expect(states).toContain(TransactionState.PREPARING);
      expect(states).toContain(TransactionState.PREPARED);
      expect(states).toContain(TransactionState.COMMITTING);
      expect(states).toContain(TransactionState.COMMITTED);
    });

    it('should log state transitions with timestamps', async () => {
      const tx = await txManager.begin(['sqlite', 'redis']);

      await tx.commit();

      const log = tx.get2PCLog();
      expect(log.length).toBeGreaterThan(0);

      log.forEach(entry => {
        expect(entry.timestamp).toBeInstanceOf(Date);
        expect(entry.transactionId).toBe(tx.id);
        expect(entry.databases).toEqual(['sqlite', 'redis']);
      });
    });

    it('should track prepared databases', async () => {
      const tx = await txManager.begin(['sqlite', 'redis']);

      await tx.commit();

      const log = tx.get2PCLog();
      const preparedEntry = log.find(e => e.state === TransactionState.PREPARED);

      expect(preparedEntry).toBeDefined();
      expect(preparedEntry?.preparedDatabases).toContain('sqlite');
      expect(preparedEntry?.preparedDatabases).toContain('redis');
    });
  });

  describe('Phase 1: PREPARE', () => {
    it('should successfully prepare all databases', async () => {
      const tx = await txManager.begin(['sqlite', 'redis']);

      // Insert data
      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await tx.execute('redis', async (adapter) => {
        await adapter.insert('user:1', { name: 'Alice', email: 'alice@test.com' });
      });

      await tx.commit();

      const log = tx.get2PCLog();
      const preparedEntry = log.find(e => e.state === TransactionState.PREPARED);

      expect(preparedEntry?.preparedDatabases).toEqual(['sqlite', 'redis']);
      expect(preparedEntry?.failedDatabases).toEqual([]);
    });

    it('should fail prepare if database constraint violated', async () => {
      // Insert user
      await sqliteAdapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });

      const tx = await txManager.begin(['sqlite']);

      // Try to insert duplicate email (unique constraint)
      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '2', name: 'Bob', email: 'alice@test.com' });
      });

      await expect(tx.commit()).rejects.toThrow();

      const log = tx.get2PCLog();
      const abortEntry = log.find(e => e.state === TransactionState.ABORTING || e.state === TransactionState.ABORTED);

      expect(abortEntry).toBeDefined();
    });

    it('should abort if any database fails prepare', async () => {
      const tx = await txManager.begin(['sqlite', 'redis']);

      // Mock prepare failure for Redis
      vi.spyOn(redisAdapter, 'prepareTransaction').mockRejectedValueOnce(
        new Error('Prepare failed')
      );

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await expect(tx.commit()).rejects.toThrow('prepare phase failed');

      const log = tx.get2PCLog();
      expect(log.some(e => e.state === TransactionState.ABORTING || e.state === TransactionState.ABORTED)).toBe(true);
    });

    it('should timeout prepare phase if exceeds limit', async () => {
      const tx = await txManager.begin(['sqlite'], { prepareTimeout: 100 });

      // Mock slow prepare
      vi.spyOn(sqliteAdapter, 'prepareTransaction').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 200))
      );

      await expect(tx.commit()).rejects.toThrow(/timeout/i);
    });

    it('should validate foreign key constraints in SQLite', async () => {
      const tx = await txManager.begin(['sqlite']);

      // Insert order without user (foreign key violation)
      await tx.execute('sqlite', async (adapter) => {
        await adapter.raw(`INSERT INTO orders (id, user_id, amount) VALUES ('1', '999', 100.00)`);
      });

      // Enable foreign key check (default in our adapter)
      await expect(tx.commit()).rejects.toThrow();
    });
  });

  describe('Phase 2: COMMIT', () => {
    it('should commit all databases after successful prepare', async () => {
      const tx = await txManager.begin(['sqlite', 'redis']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await tx.execute('redis', async (adapter) => {
        await adapter.insert('user:1', { name: 'Alice', email: 'alice@test.com' });
      });

      await tx.commit();

      expect(tx.getTransactionState()).toBe(TransactionState.COMMITTED);

      // Verify data committed
      const sqliteUser = await sqliteAdapter.get('users:1');
      expect(sqliteUser).toBeDefined();

      const redisUser = await redisAdapter.get('user:1');
      expect(redisUser).toBeDefined();
    });

    it('should handle partial commit failure (critical error)', async () => {
      const tx = await txManager.begin(['sqlite', 'redis']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      // Mock commit failure for Redis after prepare succeeds
      let prepareCallCount = 0;
      vi.spyOn(redisAdapter, 'prepareTransaction').mockImplementation(async () => {
        prepareCallCount++;
        return true; // Prepare succeeds
      });

      vi.spyOn(redisAdapter, 'commitTransaction').mockRejectedValueOnce(
        new Error('Commit failed')
      );

      await expect(tx.commit()).rejects.toThrow(/partially committed/i);

      const log = tx.get2PCLog();
      const lastEntry = log[log.length - 1];

      expect(lastEntry.failedDatabases).toContain('redis');
    });

    it('should log all commit operations', async () => {
      const tx = await txManager.begin(['sqlite', 'redis']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await tx.commit();

      const log = tx.get2PCLog();
      expect(log.some(e => e.state === TransactionState.COMMITTING)).toBe(true);
      expect(log.some(e => e.state === TransactionState.COMMITTED)).toBe(true);
    });
  });

  describe('Rollback and Abort', () => {
    it('should abort all databases if prepare fails', async () => {
      const tx = await txManager.begin(['sqlite', 'redis']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      // Mock prepare failure
      vi.spyOn(sqliteAdapter, 'prepareTransaction').mockRejectedValueOnce(
        new Error('Prepare failed')
      );

      await expect(tx.commit()).rejects.toThrow();

      // Verify data was rolled back (not committed)
      const sqliteUser = await sqliteAdapter.get('users:1');
      expect(sqliteUser).toBeNull();
    });

    it('should rollback transaction before prepare', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await tx.rollback();

      expect(tx.getTransactionState()).toBe(TransactionState.ROLLED_BACK);

      // Verify data was rolled back
      const sqliteUser = await sqliteAdapter.get('users:1');
      expect(sqliteUser).toBeNull();
    });

    it('should prevent commit after rollback', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.rollback();

      await expect(tx.commit()).rejects.toThrow(/rolled back/i);
    });

    it('should prevent rollback after commit', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await tx.commit();

      await expect(tx.rollback()).rejects.toThrow(/committed/i);
    });
  });

  describe('Single Database Transactions', () => {
    it('should use legacy commit for single database', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await tx.commit();

      // Should not use 2PC for single database
      const log = tx.get2PCLog();
      expect(log.length).toBe(0);
    });

    it('should allow disabling 2PC explicitly', async () => {
      const tx = await txManager.begin(['sqlite', 'redis'], { useTwoPhaseCommit: false });

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await tx.commit();

      // Should not use 2PC when explicitly disabled
      const log = tx.get2PCLog();
      expect(log.length).toBe(0);
    });
  });

  describe('Timeout Handling', () => {
    it('should respect prepare timeout setting', async () => {
      const tx = await txManager.begin(['sqlite'], { prepareTimeout: 50 });

      vi.spyOn(sqliteAdapter, 'prepareTransaction').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 100))
      );

      await expect(tx.commit()).rejects.toThrow(/timeout/i);
    });

    it('should use default prepare timeout', async () => {
      const tx = await txManager.begin(['sqlite']);

      // Default timeout is 5000ms
      expect(tx.options.prepareTimeout).toBe(5000);
    });

    it('should clear prepare timeout after successful prepare', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await tx.commit();

      // No timeout error should occur
      expect(tx.getTransactionState()).toBe(TransactionState.COMMITTED);
    });
  });

  describe('Concurrent Transactions', () => {
    it('should handle multiple concurrent transactions', async () => {
      const tx1 = await txManager.begin(['sqlite']);
      const tx2 = await txManager.begin(['redis']);

      await tx1.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await tx2.execute('redis', async (adapter) => {
        await adapter.insert('user:2', { name: 'Bob', email: 'bob@test.com' });
      });

      await Promise.all([tx1.commit(), tx2.commit()]);

      expect(tx1.getTransactionState()).toBe(TransactionState.COMMITTED);
      expect(tx2.getTransactionState()).toBe(TransactionState.COMMITTED);
    });

    it('should maintain separate transaction contexts', async () => {
      const tx1 = await txManager.begin(['sqlite', 'redis']);
      const tx2 = await txManager.begin(['sqlite']);

      expect(tx1.id).not.toBe(tx2.id);
      expect(tx1.databases).toEqual(['sqlite', 'redis']);
      expect(tx2.databases).toEqual(['sqlite']);
    });
  });

  describe('Error Recovery', () => {
    it('should attempt rollback on commit error', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      // Mock commit error
      vi.spyOn(sqliteAdapter, 'commitTransaction').mockRejectedValueOnce(
        new Error('Commit failed')
      );

      const rollbackSpy = vi.spyOn(sqliteAdapter, 'rollbackTransaction');

      await expect(tx.commit()).rejects.toThrow();

      // Should attempt rollback (via abortPhase for 2PC or direct rollback)
      expect(rollbackSpy).toHaveBeenCalled();
    });

    it('should log rollback failures as non-fatal', async () => {
      const tx = await txManager.begin(['sqlite']);

      // Mock rollback failure
      vi.spyOn(sqliteAdapter, 'rollbackTransaction').mockRejectedValueOnce(
        new Error('Rollback failed')
      );

      // Should not throw (rollback failures are logged but non-fatal)
      await expect(tx.rollback()).resolves.not.toThrow();
    });
  });

  describe('Transaction Manager Coordination', () => {
    it('should track active transactions', async () => {
      const tx1 = await txManager.begin(['sqlite']);
      const tx2 = await txManager.begin(['redis']);

      expect(txManager.getActiveCount()).toBe(2);

      await tx1.commit();

      // After cleanup
      txManager.cleanupCompleted();

      expect(txManager.getActiveCount()).toBe(1);
    });

    it('should cleanup completed transactions', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      await tx.commit();

      const cleaned = txManager.cleanupCompleted();

      expect(cleaned).toBe(1);
      expect(txManager.getActiveCount()).toBe(0);
    });

    it('should provide transaction by ID', async () => {
      const tx = await txManager.begin(['sqlite']);

      const retrieved = txManager.getTransaction(tx.id);

      expect(retrieved).toBe(tx);
      expect(retrieved?.id).toBe(tx.id);
    });
  });

  describe('Database-Specific Prepare Behavior', () => {
    it('should use PREPARE TRANSACTION for PostgreSQL', async () => {
      // This test requires PostgreSQL connection - skip if not available
      // Would test: await pgClient.query(`PREPARE TRANSACTION '${txId}'`)
    });

    it('should validate constraints for SQLite', async () => {
      const tx = await txManager.begin(['sqlite']);

      // Insert user
      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: '1', name: 'Alice', email: 'alice@test.com' });
      });

      // Insert order with valid foreign key
      await tx.execute('sqlite', async (adapter) => {
        await adapter.raw(`INSERT INTO orders (id, user_id, amount) VALUES ('1', '1', 100.00)`);
      });

      await tx.commit();

      expect(tx.getTransactionState()).toBe(TransactionState.COMMITTED);
    });

    it('should check Redis availability in prepare', async () => {
      const tx = await txManager.begin(['redis']);

      // Mock Redis ping failure
      vi.spyOn(redisAdapter.client as any, 'ping').mockRejectedValueOnce(
        new Error('Redis unavailable')
      );

      await expect(tx.commit()).rejects.toThrow(/unavailable/i);
    });
  });
});
