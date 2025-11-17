/**
 * Redis Transaction Tests
 *
 * Tests for Redis MULTI/EXEC transaction support with atomicity guarantees.
 * Issue #13: Cross-Database Transaction Atomicity
 */

import { RedisAdapter } from '../redis-adapter';
import { DatabaseConfig } from '../types';
import { createClient } from 'redis';

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

describe('RedisAdapter - Transaction Support', () => {
  let adapter: RedisAdapter;
  let mockClient: any;
  let mockMulti: any;

  const config: DatabaseConfig = {
    type: 'redis',
    host: 'localhost',
    port: 6379,
  };

  beforeEach(() => {
    // Setup mock multi object
    mockMulti = {
      exec: jest.fn(),
      discard: jest.fn(),
      set: jest.fn().mockReturnThis(),
      get: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      incr: jest.fn().mockReturnThis(),
    };

    // Setup mock client
    mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      isOpen: true,
      multi: jest.fn().mockReturnValue(mockMulti),
      sendCommand: jest.fn(),
    };

    (createClient as jest.Mock).mockReturnValue(mockClient);

    adapter = new RedisAdapter(config);
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
    jest.clearAllMocks();
  });

  describe('beginTransaction', () => {
    it('should create valid transaction context', async () => {
      await adapter.connect();

      const context = await adapter.beginTransaction();

      expect(context).toMatchObject({
        id: expect.stringContaining('redis-tx-'),
        databases: ['redis'],
        status: 'pending',
        startTime: expect.any(Date),
      });

      expect(mockClient.multi).toHaveBeenCalledTimes(1);
    });

    it('should create unique transaction IDs', async () => {
      await adapter.connect();

      const context1 = await adapter.beginTransaction();
      const context2 = await adapter.beginTransaction();

      expect(context1.id).not.toBe(context2.id);
      expect(mockClient.multi).toHaveBeenCalledTimes(2);
    });

    it('should throw error if not connected', async () => {
      await expect(adapter.beginTransaction()).rejects.toThrow('Not connected to Redis');
    });
  });

  describe('commitTransaction', () => {
    it('should execute MULTI/EXEC atomically', async () => {
      await adapter.connect();

      mockMulti.exec.mockResolvedValue(['OK', 'OK']);

      const context = await adapter.beginTransaction();
      await adapter.commitTransaction(context);

      expect(mockMulti.exec).toHaveBeenCalledTimes(1);
      expect(context.status).toBe('committed');
    });

    it('should handle EXEC returning null (transaction aborted)', async () => {
      await adapter.connect();

      // EXEC returns null when transaction is aborted
      mockMulti.exec.mockResolvedValue(null);

      const context = await adapter.beginTransaction();

      await expect(adapter.commitTransaction(context)).rejects.toThrow('Transaction aborted');
      expect(context.status).toBe('pending'); // Status should not change on failure
    });

    it('should handle EXEC errors properly', async () => {
      await adapter.connect();

      const context = await adapter.beginTransaction();

      // Configure error AFTER transaction is created
      const execError = new Error('EXEC failed');
      mockMulti.exec.mockRejectedValue(execError);

      await expect(adapter.commitTransaction(context)).rejects.toThrow('Failed to commit transaction');
      expect(mockMulti.exec).toHaveBeenCalled();
    });

    it('should throw error for invalid transaction context', async () => {
      await adapter.connect();

      const invalidContext = {
        id: 'invalid-tx-123',
        databases: ['redis'] as const,
        startTime: new Date(),
        status: 'pending' as const,
      };

      await expect(adapter.commitTransaction(invalidContext)).rejects.toThrow('Transaction not found');
    });

    it('should cleanup transaction on successful commit', async () => {
      await adapter.connect();

      mockMulti.exec.mockResolvedValue(['OK']);

      const context = await adapter.beginTransaction();
      await adapter.commitTransaction(context);

      // Attempting to commit again should fail (transaction cleaned up)
      await expect(adapter.commitTransaction(context)).rejects.toThrow('Transaction not found');
    });
  });

  describe('rollbackTransaction', () => {
    it('should execute DISCARD properly', async () => {
      await adapter.connect();

      mockMulti.discard.mockResolvedValue(undefined);

      const context = await adapter.beginTransaction();
      await adapter.rollbackTransaction(context);

      expect(mockMulti.discard).toHaveBeenCalledTimes(1);
      expect(context.status).toBe('rolled_back');
    });

    it('should handle DISCARD errors', async () => {
      await adapter.connect();

      const context = await adapter.beginTransaction();

      // Configure error AFTER transaction is created
      const discardError = new Error('DISCARD failed');
      mockMulti.discard.mockRejectedValue(discardError);

      await expect(adapter.rollbackTransaction(context)).rejects.toThrow('Failed to rollback transaction');
      expect(mockMulti.discard).toHaveBeenCalled();
    });

    it('should cleanup transaction on rollback', async () => {
      await adapter.connect();

      mockMulti.discard.mockResolvedValue(undefined);

      const context = await adapter.beginTransaction();
      await adapter.rollbackTransaction(context);

      // Attempting to rollback again should fail (transaction cleaned up)
      await expect(adapter.rollbackTransaction(context)).rejects.toThrow('Transaction not found');
    });

    it('should throw error for invalid transaction context', async () => {
      await adapter.connect();

      const invalidContext = {
        id: 'invalid-tx-456',
        databases: ['redis'] as const,
        startTime: new Date(),
        status: 'pending' as const,
      };

      await expect(adapter.rollbackTransaction(invalidContext)).rejects.toThrow('Transaction not found');
    });
  });

  describe('transaction isolation', () => {
    it('should prevent interference between concurrent transactions', async () => {
      await adapter.connect();

      mockMulti.exec.mockResolvedValue(['OK']);

      const tx1 = await adapter.beginTransaction();
      const tx2 = await adapter.beginTransaction();

      // Commit tx1
      await adapter.commitTransaction(tx1);
      expect(tx1.status).toBe('committed');
      expect(tx2.status).toBe('pending');

      // Tx2 should still be valid
      await adapter.commitTransaction(tx2);
      expect(tx2.status).toBe('committed');
    });

    it('should allow commit after rollback of different transaction', async () => {
      await adapter.connect();

      mockMulti.exec.mockResolvedValue(['OK']);
      mockMulti.discard.mockResolvedValue(undefined);

      const tx1 = await adapter.beginTransaction();
      const tx2 = await adapter.beginTransaction();

      // Rollback tx1
      await adapter.rollbackTransaction(tx1);
      expect(tx1.status).toBe('rolled_back');

      // tx2 should still be committable
      await adapter.commitTransaction(tx2);
      expect(tx2.status).toBe('committed');
    });
  });
});
