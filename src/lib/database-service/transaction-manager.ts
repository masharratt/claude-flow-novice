/**
 * Cross-Database Transaction Manager
 *
 * Manages atomic transactions across Redis, SQLite, and PostgreSQL with:
 * - Savepoint support for nested transactions
 * - Distributed locking integration
 * - Transaction timeout handling
 * - Isolation level support
 *
 * Part of Task 3.1: Cross-Database Transaction Framework
 */

import { randomUUID } from 'crypto';
import { IDatabaseAdapter, TransactionContext } from './types.js';
import { DatabaseErrorCode, createDatabaseError } from './errors.js';
import { createLogger } from '../logging.js';
import { generateCorrelationId } from '../correlation.js';

const logger = createLogger('transaction-manager');

/**
 * Transaction isolation levels
 */
export enum IsolationLevel {
  READ_UNCOMMITTED = 'READ UNCOMMITTED',
  READ_COMMITTED = 'READ COMMITTED',
  REPEATABLE_READ = 'REPEATABLE READ',
  SERIALIZABLE = 'SERIALIZABLE',
}

/**
 * Transaction state for two-phase commit
 */
export enum TransactionState {
  ACTIVE = 'ACTIVE',
  PREPARING = 'PREPARING',
  PREPARED = 'PREPARED',
  COMMITTING = 'COMMITTING',
  COMMITTED = 'COMMITTED',
  ABORTING = 'ABORTING',
  ABORTED = 'ABORTED',
  ROLLED_BACK = 'ROLLED_BACK',
}

/**
 * Transaction options
 */
export interface TransactionOptions {
  /** Transaction timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Transaction isolation level (default: READ_COMMITTED) */
  isolationLevel?: IsolationLevel;
  /** Automatically acquire distributed lock (default: false) */
  acquireLock?: boolean;
  /** Lock timeout in milliseconds (default: 10000) */
  lockTimeout?: number;
  /** Correlation ID for tracking (auto-generated if not provided) */
  correlationId?: string;
  /** Prepare phase timeout in milliseconds for 2PC (default: 5000) */
  prepareTimeout?: number;
  /** Enable two-phase commit protocol (default: true for multi-database transactions) */
  useTwoPhaseCommit?: boolean;
}

/**
 * Savepoint information
 */
interface SavepointInfo {
  name: string;
  createdAt: Date;
  database: string;
}

/**
 * Two-phase commit log entry
 */
interface TwoPhaseCommitLog {
  transactionId: string;
  state: TransactionState;
  timestamp: Date;
  databases: string[];
  preparedDatabases: string[];
  failedDatabases: string[];
  error?: string;
}

/**
 * Transaction class providing fluent API for cross-database transactions
 */
export class Transaction {
  readonly id: string;
  readonly startedAt: Date;
  readonly databases: string[];
  readonly correlationId: string;
  readonly options: Required<Omit<TransactionOptions, 'correlationId'>>;

  private contexts: Map<string, TransactionContext> = new Map();
  private adapters: Map<string, IDatabaseAdapter> = new Map();
  private savepoints: Map<string, SavepointInfo> = new Map();
  private state: TransactionState = TransactionState.ACTIVE;
  private isCommitted = false;
  private isRolledBack = false;
  private timeoutHandle?: NodeJS.Timeout;
  private prepareTimeoutHandle?: NodeJS.Timeout;
  private lockReleaser?: () => Promise<void>;
  private preparedDatabases: Set<string> = new Set();
  private twoPhaseCommitLog: TwoPhaseCommitLog[] = [];

  constructor(
    id: string,
    databases: string[],
    adapters: Map<string, IDatabaseAdapter>,
    options: TransactionOptions = {}
  ) {
    this.id = id;
    this.startedAt = new Date();
    this.databases = databases;
    this.adapters = adapters;
    this.correlationId = options.correlationId || generateCorrelationId();
    this.options = {
      timeout: options.timeout ?? 30000,
      isolationLevel: options.isolationLevel ?? IsolationLevel.READ_COMMITTED,
      acquireLock: options.acquireLock ?? false,
      lockTimeout: options.lockTimeout ?? 10000,
      prepareTimeout: options.prepareTimeout ?? 5000,
      useTwoPhaseCommit: options.useTwoPhaseCommit ?? (databases.length > 1),
    };

    logger.info('Transaction created', {
      transactionId: this.id,
      databases: this.databases,
      correlationId: this.correlationId,
      options: this.options,
      useTwoPhaseCommit: this.options.useTwoPhaseCommit,
    });
  }

  /**
   * Start the transaction on all databases
   */
  async begin(): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Cannot begin transaction that has already completed',
        undefined,
        { transactionId: this.id, status: this.isCommitted ? 'committed' : 'rolled_back' }
      );
    }

    try {
      // Set transaction timeout
      this.timeoutHandle = setTimeout(() => {
        this.handleTimeout();
      }, this.options.timeout);

      // Begin transaction on each database
      for (const dbType of this.databases) {
        const adapter = this.adapters.get(dbType);
        if (!adapter) {
          throw createDatabaseError(
            DatabaseErrorCode.VALIDATION_FAILED,
            `Database adapter not found: ${dbType}`,
            undefined,
            { database: dbType }
          );
        }

        const context = await adapter.beginTransaction();
        this.contexts.set(dbType, context);

        logger.debug('Transaction started on database', {
          transactionId: this.id,
          database: dbType,
          contextId: context.id,
        });
      }

      logger.info('Transaction began successfully', {
        transactionId: this.id,
        databases: this.databases,
      });
    } catch (err) {
      // Rollback any successful transaction starts
      await this.rollback();
      throw err;
    }
  }

  /**
   * Execute an operation on a specific database within this transaction
   */
  async execute<T>(
    database: string,
    operation: (adapter: IDatabaseAdapter) => Promise<T>
  ): Promise<T> {
    if (this.isCommitted) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Cannot execute operation on committed transaction',
        undefined,
        { transactionId: this.id }
      );
    }

    if (this.isRolledBack) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Cannot execute operation on rolled back transaction',
        undefined,
        { transactionId: this.id }
      );
    }

    const adapter = this.adapters.get(database);
    if (!adapter) {
      throw createDatabaseError(
        DatabaseErrorCode.VALIDATION_FAILED,
        `Database not part of this transaction: ${database}`,
        undefined,
        { database, transactionDatabases: this.databases }
      );
    }

    try {
      logger.debug('Executing operation', {
        transactionId: this.id,
        database,
      });

      const result = await operation(adapter);

      logger.debug('Operation completed', {
        transactionId: this.id,
        database,
      });

      return result;
    } catch (err) {
      logger.error('Operation failed', err as Error, {
        transactionId: this.id,
        database,
      });

      // Auto-rollback on error
      await this.rollback();
      throw err;
    }
  }

  /**
   * Create a savepoint for nested transaction control
   */
  async savepoint(name: string): Promise<void> {
    if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
      throw createDatabaseError(
        DatabaseErrorCode.VALIDATION_FAILED,
        'Savepoint name must be alphanumeric with underscores',
        undefined,
        { name }
      );
    }

    if (this.savepoints.has(name)) {
      throw createDatabaseError(
        DatabaseErrorCode.VALIDATION_FAILED,
        `Savepoint already exists: ${name}`,
        undefined,
        { name }
      );
    }

    // Create savepoint on all databases
    for (const dbType of this.databases) {
      const adapter = this.adapters.get(dbType);
      if (!adapter) continue;

      try {
        // Execute savepoint SQL (PostgreSQL and SQLite support this)
        if (dbType === 'postgres' || dbType === 'sqlite') {
          await adapter.raw(`SAVEPOINT ${name}`);
        }
        // Redis doesn't support savepoints, skip
      } catch (err) {
        throw createDatabaseError(
          DatabaseErrorCode.TRANSACTION_FAILED,
          `Failed to create savepoint: ${name}`,
          err as Error,
          { database: dbType, savepoint: name }
        );
      }
    }

    this.savepoints.set(name, {
      name,
      createdAt: new Date(),
      database: this.databases.join(','),
    });

    logger.info('Savepoint created', {
      transactionId: this.id,
      savepoint: name,
    });
  }

  /**
   * Rollback to a specific savepoint
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    if (!this.savepoints.has(name)) {
      throw createDatabaseError(
        DatabaseErrorCode.VALIDATION_FAILED,
        `Savepoint not found: ${name}`,
        undefined,
        { name, availableSavepoints: Array.from(this.savepoints.keys()) }
      );
    }

    // Rollback to savepoint on all databases
    for (const dbType of this.databases) {
      const adapter = this.adapters.get(dbType);
      if (!adapter) continue;

      try {
        if (dbType === 'postgres' || dbType === 'sqlite') {
          await adapter.raw(`ROLLBACK TO SAVEPOINT ${name}`);
        }
      } catch (err) {
        throw createDatabaseError(
          DatabaseErrorCode.TRANSACTION_FAILED,
          `Failed to rollback to savepoint: ${name}`,
          err as Error,
          { database: dbType, savepoint: name }
        );
      }
    }

    // Remove this savepoint and all later ones
    const savepoints = Array.from(this.savepoints.entries());
    const targetIndex = savepoints.findIndex(([n]) => n === name);
    for (let i = targetIndex; i < savepoints.length; i++) {
      this.savepoints.delete(savepoints[i][0]);
    }

    logger.info('Rolled back to savepoint', {
      transactionId: this.id,
      savepoint: name,
    });
  }

  /**
   * Release a savepoint (no longer needed)
   */
  async releaseSavepoint(name: string): Promise<void> {
    if (!this.savepoints.has(name)) {
      throw createDatabaseError(
        DatabaseErrorCode.VALIDATION_FAILED,
        `Savepoint not found: ${name}`,
        undefined,
        { name }
      );
    }

    // Release savepoint on all databases
    for (const dbType of this.databases) {
      const adapter = this.adapters.get(dbType);
      if (!adapter) continue;

      try {
        if (dbType === 'postgres' || dbType === 'sqlite') {
          await adapter.raw(`RELEASE SAVEPOINT ${name}`);
        }
      } catch (err) {
        logger.warn('Failed to release savepoint (non-fatal)', {
          transactionId: this.id,
          database: dbType,
          savepoint: name,
          error: (err as Error).message,
        });
      }
    }

    this.savepoints.delete(name);

    logger.debug('Savepoint released', {
      transactionId: this.id,
      savepoint: name,
    });
  }

  /**
   * Log 2PC state transition
   * @private
   */
  private log2PCState(
    state: TransactionState,
    preparedDatabases: string[] = [],
    failedDatabases: string[] = [],
    error?: string
  ): void {
    const logEntry: TwoPhaseCommitLog = {
      transactionId: this.id,
      state,
      timestamp: new Date(),
      databases: this.databases,
      preparedDatabases,
      failedDatabases,
      error,
    };

    this.twoPhaseCommitLog.push(logEntry);

    logger.info('2PC state transition', {
      transactionId: this.id,
      from: this.state,
      to: state,
      preparedDatabases,
      failedDatabases,
      error,
    });

    this.state = state;
  }

  /**
   * Get 2PC transaction log
   */
  get2PCLog(): TwoPhaseCommitLog[] {
    return [...this.twoPhaseCommitLog];
  }

  /**
   * Get current transaction state
   */
  getTransactionState(): TransactionState {
    return this.state;
  }

  /**
   * Phase 1: PREPARE - Validate all databases can commit
   * @private
   */
  private async preparePhase(): Promise<boolean> {
    this.log2PCState(TransactionState.PREPARING);

    const preparedDbs: string[] = [];
    const failedDbs: string[] = [];
    let prepareError: string | undefined;

    // Set prepare timeout
    const preparePromise = new Promise<boolean>(async (resolve, reject) => {
      this.prepareTimeoutHandle = setTimeout(() => {
        reject(
          createDatabaseError(
            DatabaseErrorCode.TIMEOUT,
            `Prepare phase timeout after ${this.options.prepareTimeout}ms`,
            undefined,
            { transactionId: this.id, timeout: this.options.prepareTimeout }
          )
        );
      }, this.options.prepareTimeout);

      try {
        // Attempt to prepare all databases
        for (const [dbType, context] of Array.from(this.contexts.entries())) {
          const adapter = this.adapters.get(dbType);
          if (!adapter) {
            failedDbs.push(dbType);
            continue;
          }

          try {
            const prepared = await adapter.prepareTransaction(context);
            if (prepared) {
              preparedDbs.push(dbType);
              this.preparedDatabases.add(dbType);
              logger.debug('Database prepared successfully', {
                transactionId: this.id,
                database: dbType,
              });
            } else {
              failedDbs.push(dbType);
              logger.warn('Database failed to prepare', {
                transactionId: this.id,
                database: dbType,
              });
            }
          } catch (err) {
            failedDbs.push(dbType);
            prepareError = (err as Error).message;
            logger.error('Database prepare error', err as Error, {
              transactionId: this.id,
              database: dbType,
            });
          }
        }

        // Clear prepare timeout
        if (this.prepareTimeoutHandle) {
          clearTimeout(this.prepareTimeoutHandle);
        }

        const allPrepared = failedDbs.length === 0;
        if (allPrepared) {
          this.log2PCState(TransactionState.PREPARED, preparedDbs);
          resolve(true);
        } else {
          this.log2PCState(
            TransactionState.ABORTING,
            preparedDbs,
            failedDbs,
            prepareError || 'One or more databases failed to prepare'
          );
          resolve(false);
        }
      } catch (err) {
        reject(err);
      }
    });

    try {
      return await preparePromise;
    } catch (err) {
      // Timeout or other error
      this.log2PCState(
        TransactionState.ABORTING,
        preparedDbs,
        failedDbs,
        (err as Error).message
      );
      throw err;
    }
  }

  /**
   * Phase 2: COMMIT - Commit all prepared databases
   * @private
   */
  private async commitPhase(): Promise<void> {
    this.log2PCState(TransactionState.COMMITTING, Array.from(this.preparedDatabases));

    const errors: Error[] = [];
    const failedDbs: string[] = [];

    // Commit all prepared databases
    for (const [dbType, context] of Array.from(this.contexts.entries())) {
      const adapter = this.adapters.get(dbType);
      if (!adapter) continue;

      try {
        await adapter.commitTransaction(context);
        logger.debug('Transaction committed on database', {
          transactionId: this.id,
          database: dbType,
        });
      } catch (err) {
        errors.push(err as Error);
        failedDbs.push(dbType);
        logger.error('Failed to commit on database', err as Error, {
          transactionId: this.id,
          database: dbType,
        });
      }
    }

    // If any commits failed after PREPARE succeeded, this is critical
    if (errors.length > 0) {
      this.log2PCState(
        TransactionState.COMMITTED,
        Array.from(this.preparedDatabases).filter(db => !failedDbs.includes(db)),
        failedDbs,
        `Partial commit: ${errors.length} databases failed`
      );

      logger.error('CRITICAL: Partial commit occurred after PREPARE', new Error('Partial commit'), {
        transactionId: this.id,
        failedDatabases: failedDbs,
        totalDatabases: this.contexts.size,
        preparedDatabases: Array.from(this.preparedDatabases),
      });

      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Transaction partially committed - data may be inconsistent',
        undefined,
        {
          transactionId: this.id,
          preparedDatabases: Array.from(this.preparedDatabases),
          failedDatabases: failedDbs,
          errors: errors.map(e => e.message),
        }
      );
    }

    this.log2PCState(TransactionState.COMMITTED, Array.from(this.preparedDatabases));
  }

  /**
   * Abort transaction (rollback all prepared databases)
   * @private
   */
  private async abortPhase(): Promise<void> {
    this.log2PCState(TransactionState.ABORTING, Array.from(this.preparedDatabases));

    // Rollback all databases (both prepared and not prepared)
    for (const [dbType, context] of Array.from(this.contexts.entries())) {
      const adapter = this.adapters.get(dbType);
      if (!adapter) continue;

      try {
        await adapter.rollbackTransaction(context);
        logger.debug('Transaction rolled back on database', {
          transactionId: this.id,
          database: dbType,
        });
      } catch (err) {
        logger.error('Failed to rollback on database (non-fatal)', err as Error, {
          transactionId: this.id,
          database: dbType,
        });
      }
    }

    this.log2PCState(TransactionState.ABORTED, [], Array.from(this.preparedDatabases));
  }

  /**
   * Commit the transaction using two-phase commit protocol
   */
  async commit(): Promise<void> {
    if (this.isCommitted) {
      logger.warn('Transaction already committed', { transactionId: this.id });
      return;
    }

    if (this.isRolledBack) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Cannot commit rolled back transaction',
        undefined,
        { transactionId: this.id }
      );
    }

    // Clear timeout
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }

    try {
      // Use two-phase commit for multi-database transactions
      if (this.options.useTwoPhaseCommit && this.databases.length > 1) {
        logger.info('Starting two-phase commit', {
          transactionId: this.id,
          databases: this.databases,
        });

        // Phase 1: PREPARE
        const prepared = await this.preparePhase();

        if (!prepared) {
          // At least one database failed to prepare, abort all
          logger.warn('Prepare phase failed, aborting transaction', {
            transactionId: this.id,
            preparedDatabases: Array.from(this.preparedDatabases),
          });

          await this.abortPhase();

          throw createDatabaseError(
            DatabaseErrorCode.TRANSACTION_FAILED,
            'Transaction prepare phase failed - all databases rolled back',
            undefined,
            {
              transactionId: this.id,
              preparedDatabases: Array.from(this.preparedDatabases),
              log: this.get2PCLog(),
            }
          );
        }

        // Phase 2: COMMIT
        await this.commitPhase();

        this.isCommitted = true;

        logger.info('Two-phase commit completed successfully', {
          transactionId: this.id,
          duration: Date.now() - this.startedAt.getTime(),
          databases: this.databases,
          log: this.get2PCLog(),
        });
      } else {
        // Single database or 2PC disabled - use legacy commit
        logger.info('Using legacy commit (single database or 2PC disabled)', {
          transactionId: this.id,
          databases: this.databases,
          use2PC: this.options.useTwoPhaseCommit,
        });

        const errors: Error[] = [];

        // Commit all database transactions
        for (const [dbType, context] of Array.from(this.contexts.entries())) {
          const adapter = this.adapters.get(dbType);
          if (!adapter) continue;

          try {
            await adapter.commitTransaction(context);
            logger.debug('Transaction committed on database', {
              transactionId: this.id,
              database: dbType,
            });
          } catch (err) {
            errors.push(err as Error);
            logger.error('Failed to commit on database', err as Error, {
              transactionId: this.id,
              database: dbType,
            });
          }
        }

        // If any commits failed, this is a partial commit - log critical error
        if (errors.length > 0) {
          logger.error('CRITICAL: Partial commit occurred', new Error('Partial commit'), {
            transactionId: this.id,
            failedDatabases: errors.length,
            totalDatabases: this.contexts.size,
          });

          throw createDatabaseError(
            DatabaseErrorCode.TRANSACTION_FAILED,
            'Transaction partially committed - data may be inconsistent',
            undefined,
            {
              transactionId: this.id,
              errors: errors.map(e => e.message),
            }
          );
        }

        this.isCommitted = true;

        logger.info('Transaction committed successfully', {
          transactionId: this.id,
          duration: Date.now() - this.startedAt.getTime(),
        });
      }

      // Release distributed lock if acquired
      await this.releaseLock();
    } catch (err) {
      // On any error, attempt to rollback
      try {
        if (this.state === TransactionState.PREPARED || this.state === TransactionState.PREPARING) {
          await this.abortPhase();
        }
      } catch (rollbackErr) {
        logger.error('Failed to rollback after commit error', rollbackErr as Error, {
          transactionId: this.id,
        });
      }

      throw err;
    }
  }

  /**
   * Rollback the transaction
   */
  async rollback(): Promise<void> {
    if (this.isRolledBack) {
      logger.debug('Transaction already rolled back', { transactionId: this.id });
      return;
    }

    if (this.isCommitted) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Cannot rollback committed transaction',
        undefined,
        { transactionId: this.id }
      );
    }

    // Clear timeouts
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    if (this.prepareTimeoutHandle) {
      clearTimeout(this.prepareTimeoutHandle);
    }

    // Update state
    this.state = TransactionState.ROLLED_BACK;

    // Rollback all database transactions
    for (const [dbType, context] of Array.from(this.contexts.entries())) {
      const adapter = this.adapters.get(dbType);
      if (!adapter) continue;

      try {
        await adapter.rollbackTransaction(context);
        logger.debug('Transaction rolled back on database', {
          transactionId: this.id,
          database: dbType,
        });
      } catch (err) {
        logger.error('Failed to rollback on database (non-fatal)', err as Error, {
          transactionId: this.id,
          database: dbType,
        });
      }
    }

    this.isRolledBack = true;

    logger.info('Transaction rolled back', {
      transactionId: this.id,
      duration: Date.now() - this.startedAt.getTime(),
      state: this.state,
    });

    // Release distributed lock if acquired
    await this.releaseLock();
  }

  /**
   * Set lock releaser callback
   * @internal Used by TransactionManager to integrate with distributed lock
   */
  setLockReleaser(releaser: () => Promise<void>): void {
    this.lockReleaser = releaser;
  }

  /**
   * Release distributed lock
   */
  private async releaseLock(): Promise<void> {
    if (this.lockReleaser) {
      try {
        await this.lockReleaser();
        logger.debug('Distributed lock released', { transactionId: this.id });
      } catch (err) {
        logger.error('Failed to release distributed lock', err as Error, {
          transactionId: this.id,
        });
      }
    }
  }

  /**
   * Handle transaction timeout
   */
  private async handleTimeout(): Promise<void> {
    logger.warn('Transaction timeout exceeded', {
      transactionId: this.id,
      timeout: this.options.timeout,
      duration: Date.now() - this.startedAt.getTime(),
    });

    // Auto-rollback on timeout
    await this.rollback();
  }

  /**
   * Get transaction status
   */
  getStatus(): 'active' | 'committed' | 'rolled_back' {
    if (this.isCommitted) return 'committed';
    if (this.isRolledBack) return 'rolled_back';
    return 'active';
  }

  /**
   * Get transaction duration in milliseconds
   */
  getDuration(): number {
    return Date.now() - this.startedAt.getTime();
  }
}

/**
 * Transaction Manager - manages transaction lifecycle and coordination
 */
export class TransactionManager {
  private activeTransactions: Map<string, Transaction> = new Map();
  private adapters: Map<string, IDatabaseAdapter> = new Map();

  constructor(adapters?: Map<string, IDatabaseAdapter>) {
    if (adapters) {
      this.adapters = adapters;
    }
  }

  /**
   * Register a database adapter
   */
  registerAdapter(type: string, adapter: IDatabaseAdapter): void {
    this.adapters.set(type, adapter);
    logger.debug('Database adapter registered', { type });
  }

  /**
   * Begin a new cross-database transaction
   */
  async begin(databases: string[], options?: TransactionOptions): Promise<Transaction> {
    if (!databases || databases.length === 0) {
      throw createDatabaseError(
        DatabaseErrorCode.VALIDATION_FAILED,
        'At least one database must be specified',
        undefined,
        { databases }
      );
    }

    // Validate all databases have adapters
    for (const dbType of databases) {
      if (!this.adapters.has(dbType)) {
        throw createDatabaseError(
          DatabaseErrorCode.VALIDATION_FAILED,
          `No adapter registered for database: ${dbType}`,
          undefined,
          { database: dbType, registered: Array.from(this.adapters.keys()) }
        );
      }
    }

    const txId = randomUUID();
    const transaction = new Transaction(txId, databases, this.adapters, options);

    // Begin the transaction
    await transaction.begin();

    this.activeTransactions.set(txId, transaction);

    return transaction;
  }

  /**
   * Get active transaction by ID
   */
  getTransaction(id: string): Transaction | undefined {
    return this.activeTransactions.get(id);
  }

  /**
   * Get all active transactions
   */
  getActiveTransactions(): Transaction[] {
    return Array.from(this.activeTransactions.values()).filter(
      tx => tx.getStatus() === 'active'
    );
  }

  /**
   * Get active transaction count
   */
  getActiveCount(): number {
    return this.getActiveTransactions().length;
  }

  /**
   * Cleanup completed transactions from memory
   */
  cleanupCompleted(): number {
    let cleaned = 0;
    for (const [id, tx] of Array.from(this.activeTransactions.entries())) {
      if (tx.getStatus() !== 'active') {
        this.activeTransactions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up completed transactions', { count: cleaned });
    }

    return cleaned;
  }

  /**
   * Force rollback of stale transactions (timeout cleanup)
   */
  async cleanupStaleTransactions(maxAge: number = 60000): Promise<number> {
    const now = Date.now();
    const stale: Transaction[] = [];

    for (const tx of Array.from(this.activeTransactions.values())) {
      if (tx.getStatus() === 'active' && tx.getDuration() > maxAge) {
        stale.push(tx);
      }
    }

    for (const tx of stale) {
      try {
        await tx.rollback();
        logger.warn('Rolled back stale transaction', {
          transactionId: tx.id,
          age: tx.getDuration(),
        });
      } catch (err) {
        logger.error('Failed to rollback stale transaction', err as Error, {
          transactionId: tx.id,
        });
      }
    }

    return stale.length;
  }

  /**
   * Legacy: Execute operations across multiple databases atomically
   * @deprecated Use begin() for new code
   */
  async executeTransaction<T = any>(
    adapters: IDatabaseAdapter[],
    operations: Array<(adapter: IDatabaseAdapter) => Promise<T>>
  ): Promise<T[]> {
    if (adapters.length !== operations.length) {
      throw createDatabaseError(
        DatabaseErrorCode.VALIDATION_FAILED,
        `Adapters and operations arrays must be the same length`,
        undefined,
        { adaptersLength: adapters.length, operationsLength: operations.length }
      );
    }

    const databases = adapters.map(a => a.getType());
    const tx = await this.begin(databases);

    try {
      const results: T[] = [];

      for (let i = 0; i < operations.length; i++) {
        const result = await tx.execute(databases[i], operations[i]);
        results.push(result);
      }

      await tx.commit();
      return results;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
}
