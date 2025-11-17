/**
 * Deadlock Resolver
 *
 * Detects and resolves deadlocks in cross-database transactions using:
 * - Timeout-based deadlock detection
 * - Automatic resolution (abort younger transaction)
 * - Exponential backoff retry logic
 * - Deadlock logging and metrics
 *
 * Part of Task 3.1: Cross-Database Transaction Framework
 */

import { Transaction, TransactionManager } from './database-service/transaction-manager.js';
import { DistributedLock, LockResource, Lock, LockAcquisitionError } from './distributed-lock.js';
import { withRetry, RetryOptions } from './retry.js';
import { createLogger } from './logging.js';
import { generateCorrelationId } from './correlation.js';

const logger = createLogger('deadlock-resolver');

/**
 * Deadlock retry options
 */
export interface DeadlockRetryOptions extends RetryOptions {
  /** Maximum retry attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds (default: 100) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 5000) */
  maxDelayMs?: number;
  /** Backoff factor for exponential backoff (default: 2) */
  backoffFactor?: number;
}

/**
 * Deadlock detection result
 */
export interface DeadlockDetectionResult {
  /** Is deadlock detected */
  detected: boolean;
  /** Transactions involved in deadlock */
  transactions: Transaction[];
  /** Lock resources involved */
  resources: LockResource[];
  /** Detection method */
  method: 'timeout' | 'cycle-detection' | 'manual';
  /** Detection timestamp */
  detectedAt: Date;
}

/**
 * Deadlock resolution result
 */
export interface DeadlockResolutionResult {
  /** Was resolution successful */
  resolved: boolean;
  /** Transaction that was aborted */
  abortedTransaction?: Transaction;
  /** Surviving transactions */
  survivingTransactions: Transaction[];
  /** Resolution method */
  method: 'youngest-abort' | 'random-abort' | 'manual';
  /** Resolution timestamp */
  resolvedAt: Date;
}

/**
 * Deadlock statistics
 */
export interface DeadlockStats {
  /** Total deadlocks detected */
  totalDetected: number;
  /** Total deadlocks resolved */
  totalResolved: number;
  /** Total transactions aborted due to deadlock */
  totalAborted: number;
  /** Average resolution time in milliseconds */
  avgResolutionTimeMs: number;
  /** Last deadlock timestamp */
  lastDeadlock?: Date;
}

/**
 * Deadlock Resolver - handles detection and automatic resolution
 */
export class DeadlockResolver {
  private txManager: TransactionManager;
  private lockManager: DistributedLock;
  private stats: DeadlockStats = {
    totalDetected: 0,
    totalResolved: 0,
    totalAborted: 0,
    avgResolutionTimeMs: 0,
  };

  constructor(txManager: TransactionManager, lockManager: DistributedLock) {
    this.txManager = txManager;
    this.lockManager = lockManager;

    logger.info('Deadlock resolver initialized');
  }

  /**
   * Detect potential deadlock for a transaction
   *
   * Uses timeout-based detection: if transaction is waiting for lock beyond threshold,
   * consider it a deadlock candidate.
   */
  async detectDeadlock(transaction: Transaction, waitTimeMs: number = 5000): Promise<boolean> {
    const duration = transaction.getDuration();

    if (duration < waitTimeMs) {
      return false; // Not waiting long enough
    }

    logger.debug('Potential deadlock detected (timeout)', {
      transactionId: transaction.id,
      duration,
      threshold: waitTimeMs,
    });

    this.stats.totalDetected++;
    this.stats.lastDeadlock = new Date();

    return true;
  }

  /**
   * Resolve deadlock by aborting younger transaction
   *
   * Strategy: In a deadlock involving multiple transactions, abort the youngest one
   * (most recently started) to minimize wasted work.
   */
  async resolve(transactions: Transaction[]): Promise<DeadlockResolutionResult> {
    if (transactions.length === 0) {
      throw new Error('Cannot resolve deadlock with no transactions');
    }

    if (transactions.length === 1) {
      // Single transaction deadlock (waiting on itself) - just abort it
      await this.abortTransaction(transactions[0]);

      return {
        resolved: true,
        abortedTransaction: transactions[0],
        survivingTransactions: [],
        method: 'youngest-abort',
        resolvedAt: new Date(),
      };
    }

    logger.info('Resolving deadlock', {
      transactionCount: transactions.length,
      transactionIds: transactions.map(t => t.id),
    });

    const startTime = Date.now();

    // Sort by start time (oldest first)
    const sorted = transactions.sort((a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime()
    );

    // Abort youngest transaction (last in sorted array)
    const youngest = sorted[sorted.length - 1];
    const survivors = sorted.slice(0, -1);

    await this.abortTransaction(youngest);

    const resolutionTime = Date.now() - startTime;

    // Update statistics
    this.stats.totalResolved++;
    this.stats.totalAborted++;
    this.stats.avgResolutionTimeMs =
      (this.stats.avgResolutionTimeMs * (this.stats.totalResolved - 1) + resolutionTime)
      / this.stats.totalResolved;

    logger.info('Deadlock resolved', {
      abortedTransactionId: youngest.id,
      survivingTransactions: survivors.map(t => t.id),
      resolutionTimeMs: resolutionTime,
    });

    return {
      resolved: true,
      abortedTransaction: youngest,
      survivingTransactions: survivors,
      method: 'youngest-abort',
      resolvedAt: new Date(),
    };
  }

  /**
   * Execute operation with automatic deadlock retry
   *
   * If operation fails due to deadlock, automatically retry with exponential backoff.
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: DeadlockRetryOptions = {}
  ): Promise<T> {
    const opts = {
      maxAttempts: options.maxAttempts ?? 3,
      baseDelayMs: options.baseDelayMs ?? 100,
      maxDelayMs: options.maxDelayMs ?? 5000,
      backoffFactor: options.backoffFactor ?? 2,
      exponential: options.exponential ?? true,
      jitter: options.jitter ?? true,
    };

    const correlationId = generateCorrelationId();

    logger.debug('Executing operation with deadlock retry', {
      maxAttempts: opts.maxAttempts,
      baseDelayMs: opts.baseDelayMs,
      correlationId,
    });

    return await withRetry(
      operation,
      {
        maxAttempts: opts.maxAttempts,
        baseDelayMs: opts.baseDelayMs,
        maxDelayMs: opts.maxDelayMs,
        exponential: opts.exponential,
        jitter: opts.jitter,
        shouldRetry: (error: Error) => {
          // Retry on deadlock or lock acquisition errors
          return (
            error instanceof DeadlockError ||
            error instanceof LockAcquisitionError ||
            error.message.includes('deadlock') ||
            error.message.includes('lock')
          );
        },
        onRetry: (attempt: number, error: Error, delayMs: number) => {
          logger.warn('Retrying after deadlock', {
            attempt,
            maxAttempts: opts.maxAttempts,
            error: error.message,
            delayMs,
            correlationId,
          });
        },
      }
    );
  }

  /**
   * Execute transaction with automatic deadlock handling
   *
   * Wraps transaction execution with deadlock detection and automatic retry.
   */
  async executeTransaction<T>(
    databases: string[],
    operations: Array<(tx: Transaction) => Promise<T>>,
    options: DeadlockRetryOptions = {}
  ): Promise<T[]> {
    return await this.executeWithRetry(async () => {
      const tx = await this.txManager.begin(databases);

      try {
        const results: T[] = [];

        for (const operation of operations) {
          const result = await operation(tx);
          results.push(result);
        }

        await tx.commit();
        return results;
      } catch (err) {
        await tx.rollback();

        // Check if this is a deadlock
        if (err instanceof LockAcquisitionError) {
          throw new DeadlockError(
            `Deadlock detected: ${err.message}`,
            [tx],
            []
          );
        }

        throw err;
      }
    }, options);
  }

  /**
   * Get deadlock statistics
   */
  getStats(): DeadlockStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalDetected: 0,
      totalResolved: 0,
      totalAborted: 0,
      avgResolutionTimeMs: 0,
    };

    logger.info('Deadlock statistics reset');
  }

  /**
   * Abort a transaction (rollback and cleanup)
   */
  private async abortTransaction(transaction: Transaction): Promise<void> {
    logger.info('Aborting transaction', {
      transactionId: transaction.id,
      age: transaction.getDuration(),
    });

    try {
      await transaction.rollback();

      logger.debug('Transaction aborted successfully', {
        transactionId: transaction.id,
      });
    } catch (err) {
      logger.error('Error aborting transaction', err as Error, {
        transactionId: transaction.id,
      });
      throw err;
    }
  }

  /**
   * Monitor active transactions for potential deadlocks
   *
   * Should be called periodically (e.g., every second) to detect long-running
   * transactions that may be in deadlock.
   */
  async monitorDeadlocks(thresholdMs: number = 10000): Promise<DeadlockDetectionResult[]> {
    const activeTransactions = this.txManager.getActiveTransactions();
    const deadlocks: DeadlockDetectionResult[] = [];

    for (const tx of activeTransactions) {
      const isDeadlocked = await this.detectDeadlock(tx, thresholdMs);

      if (isDeadlocked) {
        deadlocks.push({
          detected: true,
          transactions: [tx],
          resources: [], // TODO: Track lock resources
          method: 'timeout',
          detectedAt: new Date(),
        });
      }
    }

    if (deadlocks.length > 0) {
      logger.warn('Deadlocks detected during monitoring', {
        count: deadlocks.length,
        transactionIds: deadlocks.flatMap(d => d.transactions.map(t => t.id)),
      });
    }

    return deadlocks;
  }

  /**
   * Auto-resolve detected deadlocks
   *
   * Automatically resolve deadlocks found during monitoring.
   */
  async autoResolveDeadlocks(thresholdMs: number = 10000): Promise<DeadlockResolutionResult[]> {
    const deadlocks = await this.monitorDeadlocks(thresholdMs);
    const resolutions: DeadlockResolutionResult[] = [];

    for (const deadlock of deadlocks) {
      try {
        const resolution = await this.resolve(deadlock.transactions);
        resolutions.push(resolution);
      } catch (err) {
        logger.error('Failed to auto-resolve deadlock', err as Error, {
          transactionIds: deadlock.transactions.map(t => t.id),
        });
      }
    }

    return resolutions;
  }
}

/**
 * Deadlock error
 */
export class DeadlockError extends Error {
  constructor(
    message: string,
    public transactions: Transaction[],
    public resources: LockResource[]
  ) {
    super(message);
    this.name = 'DeadlockError';
  }
}

/**
 * Utility: Create deadlock resolver with default configuration
 */
export function createDeadlockResolver(
  txManager: TransactionManager,
  lockManager: DistributedLock
): DeadlockResolver {
  return new DeadlockResolver(txManager, lockManager);
}

/**
 * Utility: Start automatic deadlock monitoring
 *
 * Returns cleanup function to stop monitoring.
 */
export function startDeadlockMonitoring(
  resolver: DeadlockResolver,
  intervalMs: number = 1000,
  thresholdMs: number = 10000
): () => void {
  logger.info('Starting automatic deadlock monitoring', {
    intervalMs,
    thresholdMs,
  });

  const intervalHandle = setInterval(async () => {
    try {
      await resolver.autoResolveDeadlocks(thresholdMs);
    } catch (err) {
      logger.error('Error during automatic deadlock resolution', err as Error);
    }
  }, intervalMs);

  // Return cleanup function
  return () => {
    clearInterval(intervalHandle);
    logger.info('Stopped automatic deadlock monitoring');
  };
}
