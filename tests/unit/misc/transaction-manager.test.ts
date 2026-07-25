/**
 * Cross-Database Transaction Framework - Comprehensive Test Suite
 *
 * Tests for:
 * - Transaction Manager (basic operations, savepoints, error handling)
 * - Distributed Lock (acquisition, release, concurrency)
 * - Deadlock Resolver (detection, resolution, retry logic)
 * - Integration scenarios (end-to-end workflows)
 *
 * Part of Task 3.1: Cross-Database Transaction Framework
 */

import { Transaction, TransactionManager, IsolationLevel } from '../src/lib/database-service/transaction-manager';
import { DistributedLock, LockResource, LockAcquisitionError } from '../src/lib/distributed-lock';
import { DeadlockResolver, DeadlockError } from '../src/lib/deadlock-resolver';
import { IDatabaseAdapter, TransactionContext } from '../src/lib/database-service/types';
import { DatabaseErrorCode } from '../src/lib/database-service/errors';

// ============================================================================
// Test Utilities and Mocks
// ============================================================================

/**
 * Mock Redis client for distributed lock tests
 */
class MockRedisClient {
  private store: Map<string, { value: string; expiry: number }> = new Map();

  async set(key: string, value: string, ...args: any[]): Promise<string> {
    const now = Date.now();

    // Parse PX (milliseconds) and NX (set if not exists) options
    let ttl: number | undefined;
    let nx = false;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'PX' && i + 1 < args.length) {
        ttl = args[i + 1];
      } else if (args[i] === 'NX') {
        nx = true;
      }
    }

    // Check NX condition
    if (nx && this.store.has(key)) {
      const entry = this.store.get(key)!;
      if (entry.expiry > now) {
        return null as any; // Key exists and not expired
      }
    }

    this.store.set(key, {
      value,
      expiry: ttl ? now + ttl : Infinity,
    });

    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiry < Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;

    if (entry.expiry < Date.now()) {
      this.store.delete(key);
      return 0;
    }

    return 1;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Mock database adapter
 */
class MockDatabaseAdapter implements IDatabaseAdapter {
  private dbType: 'redis' | 'sqlite' | 'postgres';
  private connected = false;
  private transactionActive = false;
  private transactionId: string | null = null;
  public operationLog: string[] = [];

  constructor(dbType: 'redis' | 'sqlite' | 'postgres') {
    this.dbType = dbType;
  }

  getType(): 'redis' | 'sqlite' | 'postgres' {
    return this.dbType;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.operationLog.push('connect');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.operationLog.push('disconnect');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async get<T = any>(key: string): Promise<T | null> {
    this.operationLog.push(`get:${key}`);
    return null;
  }

  async list<T = any>(table: string, options?: any): Promise<T[]> {
    this.operationLog.push(`list:${table}`);
    return [];
  }

  async query<T = any>(table: string, filters: any[]): Promise<T[]> {
    this.operationLog.push(`query:${table}`);
    return [];
  }

  async insert<T = any>(table: string, data: T): Promise<any> {
    this.operationLog.push(`insert:${table}`);
    return { success: true, data };
  }

  async insertMany<T = any>(table: string, data: T[]): Promise<any> {
    this.operationLog.push(`insertMany:${table}`);
    return { success: true, data };
  }

  async update<T = any>(table: string, key: string, data: Partial<T>): Promise<any> {
    this.operationLog.push(`update:${table}:${key}`);
    return { success: true, data };
  }

  async delete(table: string, key: string): Promise<any> {
    this.operationLog.push(`delete:${table}:${key}`);
    return { success: true };
  }

  async raw<T = any>(query: string, params?: any[]): Promise<T> {
    this.operationLog.push(`raw:${query}`);
    return null as any;
  }

  async beginTransaction(): Promise<TransactionContext> {
    if (this.transactionActive) {
      throw new Error('Transaction already active');
    }

    this.transactionId = `tx-${this.dbType}-${Date.now()}`;
    this.transactionActive = true;
    this.operationLog.push('beginTransaction');

    return {
      id: this.transactionId,
      databases: [this.dbType],
      startTime: new Date(),
      status: 'pending',
    };
  }

  async commitTransaction(context: TransactionContext): Promise<void> {
    if (!this.transactionActive) {
      throw new Error('No active transaction');
    }

    this.transactionActive = false;
    this.transactionId = null;
    this.operationLog.push('commitTransaction');
  }

  async rollbackTransaction(context: TransactionContext): Promise<void> {
    if (!this.transactionActive) {
      // Allow rollback on inactive transaction (idempotent)
      this.operationLog.push('rollbackTransaction:inactive');
      return;
    }

    this.transactionActive = false;
    this.transactionId = null;
    this.operationLog.push('rollbackTransaction');
  }

  isTransactionActive(): boolean {
    return this.transactionActive;
  }

  getOperationLog(): string[] {
    return [...this.operationLog];
  }

  clearLog(): void {
    this.operationLog = [];
  }
}

/**
 * Helper to wait for async operations
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper to expect async error
 */
async function expectAsyncError(
  fn: () => Promise<any>,
  expectedErrorPattern?: string | RegExp
): Promise<Error> {
  try {
    await fn();
    throw new Error('Expected function to throw error, but it succeeded');
  } catch (error) {
    if (expectedErrorPattern) {
      const message = (error as Error).message;
      if (typeof expectedErrorPattern === 'string') {
        if (!message.includes(expectedErrorPattern)) {
          throw new Error(
            `Expected error message to include "${expectedErrorPattern}", got: ${message}`
          );
        }
      } else {
        if (!expectedErrorPattern.test(message)) {
          throw new Error(
            `Expected error message to match ${expectedErrorPattern}, got: ${message}`
          );
        }
      }
    }
    return error as Error;
  }
}

// ============================================================================
// Transaction Manager Tests
// ============================================================================

jest.setTimeout(30000);

describe('TransactionManager', () => {
  let txManager: TransactionManager;
  let sqliteAdapter: MockDatabaseAdapter;
  let postgresAdapter: MockDatabaseAdapter;
  let adapters: Map<string, IDatabaseAdapter>;

  beforeEach(() => {
    sqliteAdapter = new MockDatabaseAdapter('sqlite');
    postgresAdapter = new MockDatabaseAdapter('postgres');

    adapters = new Map();
    adapters.set('sqlite', sqliteAdapter);
    adapters.set('postgres', postgresAdapter);

    txManager = new TransactionManager(adapters);
  });

  describe('begin()', () => {
    it('should begin transaction on single database', async () => {
      const tx = await txManager.begin(['sqlite']);

      expect(tx).toBeDefined();
      expect(tx.id).toBeTruthy();
      expect(tx.databases).toEqual(['sqlite']);
      expect(tx.getStatus()).toBe('active');
      expect(sqliteAdapter.isTransactionActive()).toBe(true);
    });

    it('should begin transaction on multiple databases', async () => {
      const tx = await txManager.begin(['sqlite', 'postgres']);

      expect(tx.databases).toEqual(['sqlite', 'postgres']);
      expect(sqliteAdapter.isTransactionActive()).toBe(true);
      expect(postgresAdapter.isTransactionActive()).toBe(true);
    });

    it('should throw error if no databases specified', async () => {
      await expectAsyncError(
        () => txManager.begin([]),
        'At least one database must be specified'
      );
    });

    it('should throw error if database adapter not registered', async () => {
      await expectAsyncError(
        () => txManager.begin(['mongodb']),
        'No adapter registered for database'
      );
    });

    it('should set transaction timeout', async () => {
      const tx = await txManager.begin(['sqlite'], { timeout: 5000 });

      expect(tx.options.timeout).toBe(5000);
    });

    it('should use default timeout if not specified', async () => {
      const tx = await txManager.begin(['sqlite']);

      expect(tx.options.timeout).toBe(30000); // Default 30s
    });
  });

  describe('execute()', () => {
    it('should execute operation on specified database', async () => {
      const tx = await txManager.begin(['sqlite']);

      const result = await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: 1, name: 'Test' });
        return 'success';
      });

      expect(result).toBe('success');
      expect(sqliteAdapter.getOperationLog()).toContain('insert:users');
    });

    it('should throw error if database not part of transaction', async () => {
      const tx = await txManager.begin(['sqlite']);

      await expectAsyncError(
        () => tx.execute('postgres', async () => 'test'),
        'Database not part of this transaction'
      );
    });

    it('should auto-rollback on operation error', async () => {
      const tx = await txManager.begin(['sqlite']);

      await expectAsyncError(async () => {
        await tx.execute('sqlite', async () => {
          throw new Error('Operation failed');
        });
      }, 'Operation failed');

      expect(tx.getStatus()).toBe('rolled_back');
    });
  });

  describe('commit()', () => {
    it('should commit transaction successfully', async () => {
      const tx = await txManager.begin(['sqlite', 'postgres']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: 1 });
      });

      await tx.commit();

      expect(tx.getStatus()).toBe('committed');
      expect(sqliteAdapter.getOperationLog()).toContain('commitTransaction');
      expect(postgresAdapter.getOperationLog()).toContain('commitTransaction');
    });

    it('should be idempotent (can commit already committed transaction)', async () => {
      const tx = await txManager.begin(['sqlite']);
      await tx.commit();
      await tx.commit(); // Should not throw

      expect(tx.getStatus()).toBe('committed');
    });

    it('should throw error if committing rolled back transaction', async () => {
      const tx = await txManager.begin(['sqlite']);
      await tx.rollback();

      await expectAsyncError(
        () => tx.commit(),
        'Cannot commit rolled back transaction'
      );
    });
  });

  describe('rollback()', () => {
    it('should rollback transaction successfully', async () => {
      const tx = await txManager.begin(['sqlite', 'postgres']);

      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: 1 });
      });

      await tx.rollback();

      expect(tx.getStatus()).toBe('rolled_back');
      expect(sqliteAdapter.getOperationLog()).toContain('rollbackTransaction');
      expect(postgresAdapter.getOperationLog()).toContain('rollbackTransaction');
    });

    it('should be idempotent (can rollback already rolled back transaction)', async () => {
      const tx = await txManager.begin(['sqlite']);
      await tx.rollback();
      await tx.rollback(); // Should not throw

      expect(tx.getStatus()).toBe('rolled_back');
    });

    it('should throw error if rolling back committed transaction', async () => {
      const tx = await txManager.begin(['sqlite']);
      await tx.commit();

      await expectAsyncError(
        () => tx.rollback(),
        'Cannot rollback committed transaction'
      );
    });
  });

  describe('savepoints', () => {
    it('should create savepoint successfully', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.savepoint('sp1');

      expect(sqliteAdapter.getOperationLog()).toContain('raw:SAVEPOINT sp1');
    });

    it('should rollback to savepoint successfully', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.savepoint('sp1');
      await tx.execute('sqlite', async (adapter) => {
        await adapter.insert('users', { id: 1 });
      });

      await tx.rollbackToSavepoint('sp1');

      expect(sqliteAdapter.getOperationLog()).toContain('raw:ROLLBACK TO SAVEPOINT sp1');
    });

    it('should release savepoint successfully', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.savepoint('sp1');
      await tx.releaseSavepoint('sp1');

      expect(sqliteAdapter.getOperationLog()).toContain('raw:RELEASE SAVEPOINT sp1');
    });

    it('should throw error for invalid savepoint name', async () => {
      const tx = await txManager.begin(['sqlite']);

      await expectAsyncError(
        () => tx.savepoint('invalid-name!'),
        'Savepoint name must be alphanumeric'
      );
    });

    it('should throw error for duplicate savepoint name', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.savepoint('sp1');

      await expectAsyncError(
        () => tx.savepoint('sp1'),
        'Savepoint already exists'
      );
    });

    it('should handle nested savepoints', async () => {
      const tx = await txManager.begin(['sqlite']);

      await tx.savepoint('sp1');
      await tx.savepoint('sp2');
      await tx.savepoint('sp3');

      await tx.rollbackToSavepoint('sp2');

      // sp3 should be removed after rollback to sp2
      await expectAsyncError(
        () => tx.rollbackToSavepoint('sp3'),
        'Savepoint not found'
      );

      // But sp1 and sp2 should still exist
      await tx.rollbackToSavepoint('sp1');
    });
  });

  describe('transaction timeout', () => {
    it('should auto-rollback on timeout', async () => {
      const tx = await txManager.begin(['sqlite'], { timeout: 100 });

      // Wait for timeout
      await wait(150);

      expect(tx.getStatus()).toBe('rolled_back');
    });

    it('should clear timeout on commit', async () => {
      const tx = await txManager.begin(['sqlite'], { timeout: 1000 });

      await tx.commit();
      await wait(1100);

      // Should still be committed, not rolled back
      expect(tx.getStatus()).toBe('committed');
    });
  });

  describe('cleanup', () => {
    it('should cleanup completed transactions', async () => {
      const tx1 = await txManager.begin(['sqlite']);
      const tx2 = await txManager.begin(['postgres']);

      await tx1.commit();
      await tx2.rollback();

      const cleaned = txManager.cleanupCompleted();

      expect(cleaned).toBe(2);
      expect(txManager.getActiveCount()).toBe(0);
    });

    it('should cleanup stale transactions', async () => {
      const tx = await txManager.begin(['sqlite'], { timeout: 100000 }); // Long timeout

      // Manually force stale cleanup with short age
      const cleaned = await txManager.cleanupStaleTransactions(50);

      await wait(60);

      const cleaned2 = await txManager.cleanupStaleTransactions(50);

      expect(cleaned2).toBe(1);
      expect(tx.getStatus()).toBe('rolled_back');
    });
  });
});

// ============================================================================
// Distributed Lock Tests
// ============================================================================

jest.setTimeout(30000);

describe('DistributedLock', () => {
  let lockManager: DistributedLock;
  let redisClient: MockRedisClient;

  beforeEach(() => {
    redisClient = new MockRedisClient();
    lockManager = new DistributedLock(redisClient);
  });

  afterEach(() => {
    redisClient.clear();
  });

  describe('acquire()', () => {
    it('should acquire lock successfully', async () => {
      const resource: LockResource = { database: 'sqlite', table: 'users' };

      const lock = await lockManager.acquire(resource);

      expect(lock).toBeDefined();
      expect(lock.id).toBeTruthy();
      expect(lock.resource).toEqual(resource);
      expect(lock.acquiredAt).toBeInstanceOf(Date);
    });

    it('should fail to acquire already locked resource', async () => {
      const resource: LockResource = { database: 'sqlite', table: 'users' };

      await lockManager.acquire(resource);

      await expectAsyncError(
        () => lockManager.acquire(resource, { timeout: 200 }),
        'Failed to acquire lock'
      );
    }, 10000);

    it('should acquire lock with custom TTL', async () => {
      const resource: LockResource = { database: 'sqlite' };

      const lock = await lockManager.acquire(resource, { ttl: 5000 });

      expect(lock.ttl).toBe(5000);
    });

    it('should retry lock acquisition until timeout', async () => {
      const resource: LockResource = { database: 'sqlite' };

      // Acquire first lock
      const lock1 = await lockManager.acquire(resource, { ttl: 300 });

      // Try to acquire second lock (should retry and succeed after TTL expires)
      const startTime = Date.now();
      const lock2 = await lockManager.acquire(resource, { timeout: 500 });
      const duration = Date.now() - startTime;

      expect(lock2).toBeDefined();
      expect(duration).toBeGreaterThan(250); // Should wait for first lock to expire
    }, 10000);
  });

  describe('release()', () => {
    it('should release lock successfully', async () => {
      const resource: LockResource = { database: 'sqlite', table: 'users' };

      const lock = await lockManager.acquire(resource);
      await lockManager.release(lock);

      const isLocked = await lockManager.isLocked(resource);
      expect(isLocked).toBe(false);
    });

    it('should be idempotent (can release already released lock)', async () => {
      const resource: LockResource = { database: 'sqlite' };

      const lock = await lockManager.acquire(resource);
      await lockManager.release(lock);
      await lockManager.release(lock); // Should not throw
    });

    it('should throw error when releasing lock owned by different transaction', async () => {
      const resource: LockResource = { database: 'sqlite' };

      const lock1 = await lockManager.acquire(resource);

      // Release the lock via Redis directly
      await redisClient.del('lock:sqlite');

      // Acquire new lock
      const lock2 = await lockManager.acquire(resource);

      // Try to release old lock (ownership mismatch)
      await expectAsyncError(
        () => lockManager.release(lock1),
        'ownership mismatch'
      );
    });
  });

  describe('isLocked()', () => {
    it('should return true for locked resource', async () => {
      const resource: LockResource = { database: 'sqlite' };

      await lockManager.acquire(resource);

      const isLocked = await lockManager.isLocked(resource);
      expect(isLocked).toBe(true);
    });

    it('should return false for unlocked resource', async () => {
      const resource: LockResource = { database: 'sqlite' };

      const isLocked = await lockManager.isLocked(resource);
      expect(isLocked).toBe(false);
    });

    it('should return false for expired lock', async () => {
      const resource: LockResource = { database: 'sqlite' };

      await lockManager.acquire(resource, { ttl: 100 });

      await wait(150);

      const isLocked = await lockManager.isLocked(resource);
      expect(isLocked).toBe(false);
    });
  });

  describe('getLockInfo()', () => {
    it('should return lock metadata', async () => {
      const resource: LockResource = { database: 'sqlite', table: 'users' };

      const lock = await lockManager.acquire(resource, { transactionId: 'tx-123' });

      const info = await lockManager.getLockInfo(resource);

      expect(info).toBeDefined();
      expect(info!.lockId).toBe(lock.id);
      expect(info!.transactionId).toBe('tx-123');
    });

    it('should return null for unlocked resource', async () => {
      const resource: LockResource = { database: 'sqlite' };

      const info = await lockManager.getLockInfo(resource);

      expect(info).toBeNull();
    });
  });
});

// ============================================================================
// Deadlock Resolver Tests
// ============================================================================

jest.setTimeout(30000);

describe('DeadlockResolver', () => {
  let txManager: TransactionManager;
  let lockManager: DistributedLock;
  let resolver: DeadlockResolver;
  let adapters: Map<string, IDatabaseAdapter>;
  let redisClient: MockRedisClient;

  beforeEach(() => {
    const sqliteAdapter = new MockDatabaseAdapter('sqlite');
    const postgresAdapter = new MockDatabaseAdapter('postgres');

    adapters = new Map();
    adapters.set('sqlite', sqliteAdapter);
    adapters.set('postgres', postgresAdapter);

    txManager = new TransactionManager(adapters);

    redisClient = new MockRedisClient();
    lockManager = new DistributedLock(redisClient);

    resolver = new DeadlockResolver(txManager, lockManager);
  });

  describe('detectDeadlock()', () => {
    it('should not detect deadlock for new transaction', async () => {
      const tx = await txManager.begin(['sqlite']);

      const isDeadlocked = await resolver.detectDeadlock(tx, 1000);

      expect(isDeadlocked).toBe(false);
    });

    it('should detect deadlock for long-running transaction', async () => {
      const tx = await txManager.begin(['sqlite']);

      await wait(100);

      const isDeadlocked = await resolver.detectDeadlock(tx, 50);

      expect(isDeadlocked).toBe(true);
    });
  });

  describe('resolve()', () => {
    it('should abort single transaction in deadlock', async () => {
      const tx = await txManager.begin(['sqlite']);

      const result = await resolver.resolve([tx]);

      expect(result.resolved).toBe(true);
      expect(result.abortedTransaction).toBe(tx);
      expect(tx.getStatus()).toBe('rolled_back');
    });

    it('should abort youngest transaction in multi-transaction deadlock', async () => {
      const tx1 = await txManager.begin(['sqlite']);
      await wait(10);
      const tx2 = await txManager.begin(['postgres']);
      await wait(10);
      const tx3 = await txManager.begin(['sqlite']);

      const result = await resolver.resolve([tx1, tx2, tx3]);

      expect(result.resolved).toBe(true);
      expect(result.abortedTransaction).toBe(tx3); // Youngest
      expect(result.survivingTransactions).toEqual([tx1, tx2]);
      expect(tx3.getStatus()).toBe('rolled_back');
      expect(tx1.getStatus()).toBe('active');
      expect(tx2.getStatus()).toBe('active');
    });
  });

  describe('executeWithRetry()', () => {
    it('should succeed on first attempt if no deadlock', async () => {
      let attempts = 0;

      const result = await resolver.executeWithRetry(async () => {
        attempts++;
        return 'success';
      });

      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });

    it('should retry on lock acquisition error', async () => {
      let attempts = 0;

      const result = await resolver.executeWithRetry(async () => {
        attempts++;
        if (attempts < 3) {
          throw new LockAcquisitionError('Lock timeout', 'lock:test');
        }
        return 'success';
      }, { maxAttempts: 5 });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    }, 10000);

    it('should fail after max retry attempts', async () => {
      let attempts = 0;

      await expectAsyncError(
        () => resolver.executeWithRetry(async () => {
          attempts++;
          throw new LockAcquisitionError('Lock timeout', 'lock:test');
        }, { maxAttempts: 3 }),
        'Lock timeout'
      );

      expect(attempts).toBe(3);
    }, 10000);
  });

  describe('statistics', () => {
    it('should track deadlock statistics', async () => {
      const tx1 = await txManager.begin(['sqlite']);
      const tx2 = await txManager.begin(['postgres']);

      await resolver.resolve([tx1, tx2]);

      const stats = resolver.getStats();

      expect(stats.totalResolved).toBe(1);
      expect(stats.totalAborted).toBe(1);
    });

    it('should reset statistics', async () => {
      const tx = await txManager.begin(['sqlite']);
      await resolver.resolve([tx]);

      resolver.resetStats();

      const stats = resolver.getStats();

      expect(stats.totalResolved).toBe(0);
      expect(stats.totalAborted).toBe(0);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

jest.setTimeout(30000);

describe('Integration Tests', () => {
  let txManager: TransactionManager;
  let lockManager: DistributedLock;
  let resolver: DeadlockResolver;

  beforeEach(() => {
    const adapters = new Map();
    adapters.set('sqlite', new MockDatabaseAdapter('sqlite'));
    adapters.set('postgres', new MockDatabaseAdapter('postgres'));

    txManager = new TransactionManager(adapters);
    lockManager = new DistributedLock(new MockRedisClient());
    resolver = new DeadlockResolver(txManager, lockManager);
  });

  it('should execute complete transaction workflow with locks', async () => {
    const resource: LockResource = { database: 'sqlite', table: 'users' };

    const lock = await lockManager.acquire(resource);

    const tx = await txManager.begin(['sqlite', 'postgres']);

    await tx.execute('sqlite', async (adapter) => {
      await adapter.insert('users', { id: 1, name: 'Alice' });
    });

    await tx.execute('postgres', async (adapter) => {
      await adapter.insert('audit_log', { action: 'user_created', userId: 1 });
    });

    await tx.commit();
    await lockManager.release(lock);

    expect(tx.getStatus()).toBe('committed');
    expect(await lockManager.isLocked(resource)).toBe(false);
  });

  it('should handle transaction with savepoint and rollback', async () => {
    const tx = await txManager.begin(['sqlite']);

    await tx.execute('sqlite', async (adapter) => {
      await adapter.insert('users', { id: 1, name: 'Alice' });
    });

    await tx.savepoint('before_update');

    await tx.execute('sqlite', async (adapter) => {
      await adapter.update('users', '1', { name: 'Bob' });
    });

    await tx.rollbackToSavepoint('before_update');

    await tx.commit();

    expect(tx.getStatus()).toBe('committed');
  });

  it('should complete multi-database transaction in <5 seconds', async () => {
    const startTime = Date.now();

    const tx = await txManager.begin(['sqlite', 'postgres']);

    await tx.execute('sqlite', async (adapter) => {
      await adapter.insert('users', { id: 1 });
    });

    await tx.execute('postgres', async (adapter) => {
      await adapter.insert('audit', { userId: 1 });
    });

    await tx.commit();

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(5000);
  });
});
