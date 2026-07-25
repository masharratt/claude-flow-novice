/**
 * PostgreSQL Transaction Routing Integration Tests
 *
 * Validates the transaction-aware query routing implementation in PostgresAdapter.
 * Tests that all CRUD methods correctly route queries through transaction clients
 * when transactionId is provided, and through the pool when not provided.
 *
 * This test suite addresses the critical bug where queries were bypassing active
 * transactions, causing data integrity issues (e.g., inserts persisting after rollback).
 *
 * Related: PR #4 review feedback, commit 53b0963d
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PostgresAdapter } from '../src/lib/database-service/postgres-adapter';
import type { TransactionContext } from '../src/lib/database-service/types';

describe('PostgreSQL Transaction Routing', () => {
  let adapter: PostgresAdapter;

  beforeAll(async () => {
    adapter = new PostgresAdapter({
      type: 'postgres',
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/test',
      poolSize: 5,
    });

    await adapter.connect();

    // Create test table
    await adapter.raw(`
      CREATE TABLE IF NOT EXISTS transaction_test (
        id TEXT PRIMARY KEY,
        name TEXT,
        value INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  });

  afterAll(async () => {
    await adapter.raw('DROP TABLE IF EXISTS transaction_test');
    await adapter.disconnect();
  });

  beforeEach(async () => {
    // Clear test data
    await adapter.raw('DELETE FROM transaction_test');
  });

  describe('Transaction Client Routing', () => {
    it('should use transaction client when transactionId provided', async () => {
      // Begin transaction
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Insert using transaction
      const insertResult = await adapter.insert(
        'transaction_test',
        { id: 'tx-route-1', name: 'Test', value: 100 },
        txId
      );

      expect(insertResult.success).toBe(true);

      // Query within transaction should see the data
      const withinTx = await adapter.get('transaction_test:tx-route-1', txId);
      expect(withinTx).toMatchObject({ id: 'tx-route-1', name: 'Test', value: 100 });

      // Query outside transaction should NOT see uncommitted data
      const outsideTx = await adapter.get('transaction_test:tx-route-1');
      expect(outsideTx).toBeNull();

      // Commit
      await adapter.commitTransaction(txContext);

      // Now query outside transaction should see the data
      const afterCommit = await adapter.get('transaction_test:tx-route-1');
      expect(afterCommit).toMatchObject({ id: 'tx-route-1', name: 'Test', value: 100 });
    });

    it('should use pool when no transactionId provided', async () => {
      // Insert without transaction (uses pool)
      const insertResult = await adapter.insert('transaction_test', {
        id: 'pool-1',
        name: 'Pool Test',
        value: 200,
      });

      expect(insertResult.success).toBe(true);

      // Should be immediately visible
      const retrieved = await adapter.get('transaction_test:pool-1');
      expect(retrieved).toMatchObject({ id: 'pool-1', name: 'Pool Test', value: 200 });
    });
  });

  describe('Rollback Prevents Persistence (CRITICAL BUG FIX)', () => {
    it('should NOT persist insert after rollback', async () => {
      // This is the critical test that would have FAILED before transaction routing fix
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Insert using transaction
      await adapter.insert(
        'transaction_test',
        { id: 'rollback-test-1', name: 'Should Not Persist', value: 999 },
        txId
      );

      // Verify data exists within transaction
      const withinTx = await adapter.get('transaction_test:rollback-test-1', txId);
      expect(withinTx).toMatchObject({ id: 'rollback-test-1', name: 'Should Not Persist' });

      // Rollback
      await adapter.rollbackTransaction(txContext);

      // CRITICAL: Data should NOT exist after rollback
      const afterRollback = await adapter.get('transaction_test:rollback-test-1');
      expect(afterRollback).toBeNull();
    });

    it('should NOT persist update after rollback', async () => {
      // Setup: Insert data first (outside transaction)
      await adapter.insert('transaction_test', {
        id: 'rollback-update-1',
        name: 'Original',
        value: 100,
      });

      // Begin transaction
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Update within transaction
      await adapter.update(
        'transaction_test',
        'rollback-update-1',
        { name: 'Updated', value: 200 },
        txId
      );

      // Rollback
      await adapter.rollbackTransaction(txContext);

      // Data should have original values
      const afterRollback = await adapter.get('transaction_test:rollback-update-1');
      expect(afterRollback).toMatchObject({ name: 'Original', value: 100 });
    });

    it('should NOT persist delete after rollback', async () => {
      // Setup: Insert data first
      await adapter.insert('transaction_test', {
        id: 'rollback-delete-1',
        name: 'To Delete',
        value: 300,
      });

      // Begin transaction
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Delete within transaction
      await adapter.delete('transaction_test', 'rollback-delete-1', txId);

      // Verify deleted within transaction
      const withinTx = await adapter.get('transaction_test:rollback-delete-1', txId);
      expect(withinTx).toBeNull();

      // Rollback
      await adapter.rollbackTransaction(txContext);

      // Data should still exist
      const afterRollback = await adapter.get('transaction_test:rollback-delete-1');
      expect(afterRollback).toMatchObject({ id: 'rollback-delete-1', name: 'To Delete' });
    });

    it('should NOT persist insertMany after rollback', async () => {
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Insert multiple records
      const data = [
        { id: 'rollback-batch-1', name: 'Batch 1', value: 10 },
        { id: 'rollback-batch-2', name: 'Batch 2', value: 20 },
        { id: 'rollback-batch-3', name: 'Batch 3', value: 30 },
      ];

      await adapter.insertMany('transaction_test', data, txId);

      // Rollback
      await adapter.rollbackTransaction(txContext);

      // None of the records should exist
      const batch1 = await adapter.get('transaction_test:rollback-batch-1');
      const batch2 = await adapter.get('transaction_test:rollback-batch-2');
      const batch3 = await adapter.get('transaction_test:rollback-batch-3');

      expect(batch1).toBeNull();
      expect(batch2).toBeNull();
      expect(batch3).toBeNull();
    });
  });

  describe('All CRUD Methods Support transactionId', () => {
    it('get() supports transactionId parameter', async () => {
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Insert within transaction
      await adapter.insert('transaction_test', { id: 'get-tx-1', name: 'Test', value: 100 }, txId);

      // Get with transactionId should see data
      const result = await adapter.get('transaction_test:get-tx-1', txId);
      expect(result).toBeTruthy();

      // Get without transactionId should NOT see uncommitted data
      const noTxResult = await adapter.get('transaction_test:get-tx-1');
      expect(noTxResult).toBeNull();

      await adapter.rollbackTransaction(txContext);
    });

    it('list() supports transactionId parameter', async () => {
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Insert multiple records within transaction
      await adapter.insert('transaction_test', { id: 'list-tx-1', name: 'A', value: 1 }, txId);
      await adapter.insert('transaction_test', { id: 'list-tx-2', name: 'B', value: 2 }, txId);

      // List with transactionId should see data
      const result = await adapter.list('transaction_test', {}, txId);
      expect(result.length).toBe(2);

      // List without transactionId should see nothing
      const noTxResult = await adapter.list('transaction_test', {});
      expect(noTxResult.length).toBe(0);

      await adapter.rollbackTransaction(txContext);
    });

    it('insert() supports transactionId parameter', async () => {
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      const result = await adapter.insert(
        'transaction_test',
        { id: 'insert-tx-1', name: 'Test', value: 100 },
        txId
      );

      expect(result.success).toBe(true);

      // Verify transaction isolation
      const outsideTx = await adapter.get('transaction_test:insert-tx-1');
      expect(outsideTx).toBeNull();

      await adapter.rollbackTransaction(txContext);
    });

    it('insertMany() supports transactionId parameter', async () => {
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      const data = [
        { id: 'batch-tx-1', name: 'Batch 1', value: 10 },
        { id: 'batch-tx-2', name: 'Batch 2', value: 20 },
      ];

      const result = await adapter.insertMany('transaction_test', data, txId);

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(2);

      // Verify transaction isolation
      const outsideTx = await adapter.list('transaction_test', {});
      expect(outsideTx.length).toBe(0);

      await adapter.rollbackTransaction(txContext);
    });

    it('update() supports transactionId parameter', async () => {
      // Setup: Insert data first
      await adapter.insert('transaction_test', { id: 'update-tx-1', name: 'Original', value: 100 });

      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Update within transaction
      const result = await adapter.update(
        'transaction_test',
        'update-tx-1',
        { name: 'Updated', value: 200 },
        txId
      );

      expect(result.success).toBe(true);

      // Within transaction should see updated data
      const withinTx = await adapter.get('transaction_test:update-tx-1', txId);
      expect(withinTx).toMatchObject({ name: 'Updated', value: 200 });

      // Outside transaction should see original data
      const outsideTx = await adapter.get('transaction_test:update-tx-1');
      expect(outsideTx).toMatchObject({ name: 'Original', value: 100 });

      await adapter.rollbackTransaction(txContext);
    });

    it('delete() supports transactionId parameter', async () => {
      // Setup: Insert data first
      await adapter.insert('transaction_test', { id: 'delete-tx-1', name: 'To Delete', value: 300 });

      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Delete within transaction
      const result = await adapter.delete('transaction_test', 'delete-tx-1', txId);

      expect(result.success).toBe(true);

      // Within transaction should NOT see data
      const withinTx = await adapter.get('transaction_test:delete-tx-1', txId);
      expect(withinTx).toBeNull();

      // Outside transaction should still see data
      const outsideTx = await adapter.get('transaction_test:delete-tx-1');
      expect(outsideTx).toBeTruthy();

      await adapter.rollbackTransaction(txContext);
    });

    it('raw() supports transactionId parameter', async () => {
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Execute raw query within transaction
      await adapter.raw(
        "INSERT INTO transaction_test (id, name, value) VALUES ($1, $2, $3)",
        ['raw-tx-1', 'Raw Test', 400],
        txId
      );

      // Within transaction should see data
      const withinTx = await adapter.get('transaction_test:raw-tx-1', txId);
      expect(withinTx).toBeTruthy();

      // Outside transaction should NOT see data
      const outsideTx = await adapter.get('transaction_test:raw-tx-1');
      expect(outsideTx).toBeNull();

      await adapter.rollbackTransaction(txContext);
    });

    it('query() supports transactionId parameter', async () => {
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Insert data within transaction
      await adapter.insert('transaction_test', { id: 'query-tx-1', name: 'Query Test', value: 500 }, txId);

      // Query with filter and transactionId
      const result = await adapter.query(
        'transaction_test',
        [{ field: 'name', operator: 'eq', value: 'Query Test' }],
        txId
      );

      expect(result.length).toBe(1);
      expect(result[0]).toMatchObject({ id: 'query-tx-1' });

      // Query without transactionId should return nothing
      const noTxResult = await adapter.query('transaction_test', [
        { field: 'name', operator: 'eq', value: 'Query Test' },
      ]);

      expect(noTxResult.length).toBe(0);

      await adapter.rollbackTransaction(txContext);
    });
  });

  describe('insertMany() Nested Transaction Handling', () => {
    it('should not create nested transactions when transactionId provided', async () => {
      // Begin outer transaction
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // insertMany with transactionId should use existing transaction, not create nested BEGIN
      const data = [
        { id: 'nested-1', name: 'Nested 1', value: 10 },
        { id: 'nested-2', name: 'Nested 2', value: 20 },
      ];

      // This should NOT throw "nested transaction" error
      await expect(adapter.insertMany('transaction_test', data, txId)).resolves.toBeTruthy();

      // Rollback outer transaction
      await adapter.rollbackTransaction(txContext);

      // Data should not persist
      const result1 = await adapter.get('transaction_test:nested-1');
      const result2 = await adapter.get('transaction_test:nested-2');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should create its own transaction when no transactionId provided', async () => {
      // insertMany without transactionId should manage its own transaction
      const data = [
        { id: 'own-tx-1', name: 'Own 1', value: 30 },
        { id: 'own-tx-2', name: 'Own 2', value: 40 },
      ];

      const result = await adapter.insertMany('transaction_test', data);

      expect(result.success).toBe(true);

      // Data should be committed immediately
      const result1 = await adapter.get('transaction_test:own-tx-1');
      const result2 = await adapter.get('transaction_test:own-tx-2');

      expect(result1).toBeTruthy();
      expect(result2).toBeTruthy();
    });

    it('should rollback all inserts on error within insertMany transaction', async () => {
      // Attempt to insert duplicate keys (second one will fail)
      const data = [
        { id: 'dup-1', name: 'Dup 1', value: 50 },
        { id: 'dup-1', name: 'Dup 2 (duplicate key)', value: 60 }, // Duplicate ID
      ];

      // Should fail with duplicate key error
      const result = await adapter.insertMany('transaction_test', data);

      expect(result.success).toBe(false);

      // First insert should also be rolled back (atomic)
      const result1 = await adapter.get('transaction_test:dup-1');
      expect(result1).toBeNull();
    });
  });

  describe('Transaction Client Lifecycle', () => {
    it('should not release transaction client from CRUD methods', async () => {
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      // Multiple CRUD operations should reuse same transaction client
      await adapter.insert('transaction_test', { id: 'lifecycle-1', name: 'Test 1', value: 100 }, txId);
      await adapter.insert('transaction_test', { id: 'lifecycle-2', name: 'Test 2', value: 200 }, txId);
      await adapter.update('transaction_test', 'lifecycle-1', { value: 150 }, txId);
      await adapter.get('transaction_test:lifecycle-1', txId);
      await adapter.list('transaction_test', {}, txId);

      // All should work without "client released" errors
      const result = await adapter.get('transaction_test:lifecycle-1', txId);
      expect(result).toMatchObject({ value: 150 });

      // Commit should work (proves client wasn't released)
      await adapter.commitTransaction(txContext);

      // Data should be persisted
      const afterCommit = await adapter.get('transaction_test:lifecycle-1');
      expect(afterCommit).toMatchObject({ value: 150 });
    });

    it('should only release client on commit', async () => {
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      await adapter.insert('transaction_test', { id: 'commit-release-1', name: 'Test', value: 100 }, txId);

      // Commit releases the client
      await adapter.commitTransaction(txContext);

      // Attempting to use transaction ID after commit should fail or use pool
      const result = await adapter.get('transaction_test:commit-release-1', txId);
      // Should use pool (not transaction client), so data is visible
      expect(result).toBeTruthy();
    });

    it('should only release client on rollback', async () => {
      const txContext = await adapter.beginTransaction();
      const txId = txContext.id;

      await adapter.insert('transaction_test', { id: 'rollback-release-1', name: 'Test', value: 100 }, txId);

      // Rollback releases the client
      await adapter.rollbackTransaction(txContext);

      // Attempting to use transaction ID after rollback should fail or use pool
      const result = await adapter.get('transaction_test:rollback-release-1', txId);
      // Should use pool, data shouldn't exist (was rolled back)
      expect(result).toBeNull();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid transactionId gracefully', async () => {
      // Using non-existent transaction ID should fall back to pool
      const result = await adapter.insert(
        'transaction_test',
        { id: 'invalid-tx-1', name: 'Test', value: 100 },
        'non-existent-tx-id'
      );

      // Should use pool and succeed
      expect(result.success).toBe(true);

      // Data should be immediately visible (committed via pool)
      const retrieved = await adapter.get('transaction_test:invalid-tx-1');
      expect(retrieved).toBeTruthy();
    });

    it('should handle concurrent transactions independently', async () => {
      // Start two transactions
      const tx1 = await adapter.beginTransaction();
      const tx2 = await adapter.beginTransaction();

      // Insert different data in each transaction
      await adapter.insert('transaction_test', { id: 'concurrent-1', name: 'TX1', value: 100 }, tx1.id);
      await adapter.insert('transaction_test', { id: 'concurrent-2', name: 'TX2', value: 200 }, tx2.id);

      // Each transaction should only see its own data
      const tx1Data = await adapter.list('transaction_test', {}, tx1.id);
      const tx2Data = await adapter.list('transaction_test', {}, tx2.id);

      expect(tx1Data.length).toBe(1);
      expect(tx1Data[0].id).toBe('concurrent-1');

      expect(tx2Data.length).toBe(1);
      expect(tx2Data[0].id).toBe('concurrent-2');

      // Commit first, rollback second
      await adapter.commitTransaction(tx1);
      await adapter.rollbackTransaction(tx2);

      // Only TX1 data should persist
      const final1 = await adapter.get('transaction_test:concurrent-1');
      const final2 = await adapter.get('transaction_test:concurrent-2');

      expect(final1).toBeTruthy();
      expect(final2).toBeNull();
    });

    it('should handle transaction with no operations', async () => {
      const txContext = await adapter.beginTransaction();

      // Commit without doing anything
      await expect(adapter.commitTransaction(txContext)).resolves.not.toThrow();
    });

    it('should handle rollback without operations', async () => {
      const txContext = await adapter.beginTransaction();

      // Rollback without doing anything
      await expect(adapter.rollbackTransaction(txContext)).resolves.not.toThrow();
    });
  });

  describe('Backward Compatibility', () => {
    it('should work without transactionId (existing behavior)', async () => {
      // All CRUD methods should work without transactionId parameter
      const insertResult = await adapter.insert('transaction_test', {
        id: 'compat-1',
        name: 'Compat Test',
        value: 100,
      });

      expect(insertResult.success).toBe(true);

      const getResult = await adapter.get('transaction_test:compat-1');
      expect(getResult).toBeTruthy();

      const updateResult = await adapter.update('transaction_test', 'compat-1', { value: 200 });
      expect(updateResult.success).toBe(true);

      const listResult = await adapter.list('transaction_test', {});
      expect(listResult.length).toBeGreaterThan(0);

      const deleteResult = await adapter.delete('transaction_test', 'compat-1');
      expect(deleteResult.success).toBe(true);
    });

    it('should maintain transaction context API', async () => {
      // Old transaction API should still work
      const txContext = await adapter.beginTransaction();

      await adapter.insert('transaction_test', { id: 'context-1', name: 'Test', value: 100 });

      await adapter.commitTransaction(txContext);

      const result = await adapter.get('transaction_test:context-1');
      expect(result).toBeTruthy();
    });
  });
});
