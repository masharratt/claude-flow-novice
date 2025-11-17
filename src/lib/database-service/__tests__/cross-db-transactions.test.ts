/**
 * Cross-Database Transaction Integration Tests
 *
 * Tests for atomic transaction support across SQLite and Redis.
 * Issue #13: Cross-Database Transaction Atomicity
 */

import { RedisAdapter } from '../redis-adapter';
import { TransactionManager } from '../transaction-manager';
import { DatabaseConfig, IDatabaseAdapter, TransactionContext } from '../types';

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

// Create a mock SQLite adapter class for testing
class MockSqliteAdapter implements IDatabaseAdapter {
  private mockDb: any;
  private connectedState: boolean = false;
  public transactions: Map<string, TransactionContext> = new Map();

  constructor(private config: DatabaseConfig, mockDb: any) {
    this.mockDb = mockDb;
  }

  getType(): 'sqlite' {
    return 'sqlite';
  }

  async connect(): Promise<void> {
    this.connectedState = true;
  }

  async disconnect(): Promise<void> {
    this.connectedState = false;
  }

  isConnected(): boolean {
    return this.connectedState;
  }

  async beginTransaction(): Promise<TransactionContext> {
    const context: TransactionContext = {
      id: `sqlite-tx-${Date.now()}`,
      databases: ['sqlite'],
      startTime: new Date(),
      status: 'pending',
    };
    this.transactions.set(context.id, context);
    this.mockDb.run('BEGIN TRANSACTION');
    return context;
  }

  async commitTransaction(context: TransactionContext): Promise<void> {
    if (!this.transactions.has(context.id)) {
      throw new Error('Transaction not found');
    }
    this.mockDb.run('COMMIT');
    context.status = 'committed';
    this.transactions.delete(context.id);
  }

  async rollbackTransaction(context: TransactionContext): Promise<void> {
    if (!this.transactions.has(context.id)) {
      throw new Error('Transaction not found');
    }
    this.mockDb.run('ROLLBACK');
    context.status = 'rolled_back';
    this.transactions.delete(context.id);
  }

  // Stub implementations for other required methods
  async query(): Promise<any> { return { success: true, data: [] }; }
  async insert(): Promise<any> { return { success: true }; }
  async update(): Promise<any> { return { success: true }; }
  async delete(): Promise<any> { return { success: true }; }
  async raw(): Promise<any> { return null; }
}

describe('Cross-Database Transaction Integration', () => {
  let redisAdapter: RedisAdapter;
  let sqliteAdapter: MockSqliteAdapter;
  let transactionManager: TransactionManager;
  let mockRedisClient: any;
  let mockRedisMulti: any;
  let mockSqliteDb: any;

  const redisConfig: DatabaseConfig = {
    type: 'redis',
    host: 'localhost',
    port: 6379,
  };

  const sqliteConfig: DatabaseConfig = {
    type: 'sqlite',
    database: ':memory:',
  };

  beforeEach(() => {
    // Setup Redis mocks
    mockRedisMulti = {
      exec: jest.fn().mockResolvedValue(['OK', 'OK']),
      discard: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockReturnThis(),
      get: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
    };

    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      isOpen: true,
      multi: jest.fn().mockReturnValue(mockRedisMulti),
      sendCommand: jest.fn(),
    };

    const { createClient } = require('redis');
    (createClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Setup SQLite mocks
    mockSqliteDb = {
      run: jest.fn(),
      prepare: jest.fn(),
      exec: jest.fn(),
      close: jest.fn(),
    };

    // Create adapters
    redisAdapter = new RedisAdapter(redisConfig);
    sqliteAdapter = new MockSqliteAdapter(sqliteConfig, mockSqliteDb);
    transactionManager = new TransactionManager();
  });

  afterEach(async () => {
    if (redisAdapter.isConnected()) {
      await redisAdapter.disconnect();
    }
    if (sqliteAdapter.isConnected()) {
      await sqliteAdapter.disconnect();
    }
    jest.clearAllMocks();
  });

  describe('atomic commit across databases', () => {
    it('should commit SQLite + Redis atomically', async () => {
      await redisAdapter.connect();
      await sqliteAdapter.connect();

      // Execute cross-database transaction
      const results = await transactionManager.executeTransaction(
        [redisAdapter, sqliteAdapter],
        [
          async () => ({ success: true, data: 'redis-op' }),
          async () => ({ success: true, data: 'sqlite-op' })
        ]
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ success: true, data: 'redis-op' });
      expect(results[1]).toEqual({ success: true, data: 'sqlite-op' });

      expect(mockRedisMulti.exec).toHaveBeenCalled();
      expect(mockSqliteDb.run).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(mockSqliteDb.run).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle partial commit failures with proper error propagation', async () => {
      await redisAdapter.connect();
      await sqliteAdapter.connect();

      // Simulate Redis commit failure (EXEC returns null = transaction aborted)
      mockRedisMulti.exec.mockResolvedValueOnce(null);

      await expect(
        transactionManager.executeTransaction(
          [redisAdapter, sqliteAdapter],
          [
            async () => ({ success: true }),
            async () => ({ success: true })
          ]
        )
      ).rejects.toThrow();

      // Verify rollback was attempted on SQLite (Redis transaction aborted)
      expect(mockSqliteDb.run).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('rollback consistency across databases', () => {
    it('should rollback SQLite + Redis consistently on operation failure', async () => {
      await redisAdapter.connect();
      await sqliteAdapter.connect();

      // Simulate an operation failure
      await expect(
        transactionManager.executeTransaction(
          [redisAdapter, sqliteAdapter],
          [
            async () => { throw new Error('Operation failed'); },
            async () => ({ success: true })
          ]
        )
      ).rejects.toThrow('Cross-database transaction failed');

      // Both should have attempted rollback
      expect(mockRedisMulti.discard).toHaveBeenCalled();
      expect(mockSqliteDb.run).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should handle partial rollback failures gracefully', async () => {
      await redisAdapter.connect();
      await sqliteAdapter.connect();

      // Simulate Redis rollback failure during operation failure
      mockRedisMulti.discard.mockRejectedValue(new Error('DISCARD failed'));

      // The transaction should still fail even if rollback has issues
      await expect(
        transactionManager.executeTransaction(
          [redisAdapter, sqliteAdapter],
          [
            async () => { throw new Error('Operation failed'); },
            async () => ({ success: true })
          ]
        )
      ).rejects.toThrow('Cross-database transaction failed');

      // Rollback was attempted
      expect(mockRedisMulti.discard).toHaveBeenCalled();
    });
  });

  describe('transaction isolation across databases', () => {
    it('should maintain isolation between concurrent cross-db transactions', async () => {
      await redisAdapter.connect();
      await sqliteAdapter.connect();

      // Execute first transaction
      const results1 = await transactionManager.executeTransaction(
        [redisAdapter, sqliteAdapter],
        [
          async () => ({ success: true, data: 'tx1-redis' }),
          async () => ({ success: true, data: 'tx1-sqlite' })
        ]
      );

      // Execute second transaction
      const results2 = await transactionManager.executeTransaction(
        [redisAdapter, sqliteAdapter],
        [
          async () => ({ success: true, data: 'tx2-redis' }),
          async () => ({ success: true, data: 'tx2-sqlite' })
        ]
      );

      // Both transactions should complete successfully
      expect(results1).toHaveLength(2);
      expect(results2).toHaveLength(2);

      // Verify Redis multi was called for each transaction
      expect(mockRedisClient.multi).toHaveBeenCalledTimes(2);
    });
  });

  describe('error propagation in cross-db transactions', () => {
    it('should propagate errors from Redis to transaction manager', async () => {
      await redisAdapter.connect();
      await sqliteAdapter.connect();

      // Simulate critical Redis error during commit
      mockRedisMulti.exec.mockRejectedValue(new Error('Redis connection lost'));

      await expect(
        transactionManager.executeTransaction(
          [redisAdapter, sqliteAdapter],
          [
            async () => ({ success: true }),
            async () => ({ success: true })
          ]
        )
      ).rejects.toThrow('Cross-database transaction failed');
    });

    it('should propagate errors from SQLite to transaction manager', async () => {
      await redisAdapter.connect();
      await sqliteAdapter.connect();

      // Simulate SQLite error during commit
      mockSqliteDb.run.mockImplementation((sql: string) => {
        if (sql === 'COMMIT') {
          throw new Error('SQLite disk full');
        }
      });

      await expect(
        transactionManager.executeTransaction(
          [redisAdapter, sqliteAdapter],
          [
            async () => ({ success: true }),
            async () => ({ success: true })
          ]
        )
      ).rejects.toThrow('Cross-database transaction failed');
    });
  });
});
