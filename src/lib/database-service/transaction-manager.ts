/**
 * Cross-Database Transaction Manager
 *
 * Manages atomic transactions across Redis, SQLite, and PostgreSQL.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 */

import { IDatabaseAdapter, TransactionContext } from './types';
import { DatabaseErrorCode, createDatabaseError } from './errors';

export class TransactionManager {
  private activeTransactions: Map<string, TransactionContext> = new Map();

  /**
   * Execute operations across multiple databases atomically
   */
  async executeTransaction<T = any>(
    adapters: IDatabaseAdapter[],
    operations: Array<(adapter: IDatabaseAdapter) => Promise<T>>
  ): Promise<T[]> {
    const contexts: TransactionContext[] = [];
    const results: T[] = [];

    try {
      // Begin transactions on all adapters
      for (const adapter of adapters) {
        const context = await adapter.beginTransaction();
        contexts.push(context);
        this.activeTransactions.set(context.id, context);
      }

      // Execute operations
      for (let i = 0; i < operations.length; i++) {
        const result = await operations[i](adapters[i]);
        results.push(result);
      }

      // Commit all transactions
      for (let i = 0; i < adapters.length; i++) {
        await adapters[i].commitTransaction(contexts[i]);
        this.activeTransactions.delete(contexts[i].id);
      }

      return results;
    } catch (err) {
      // Rollback all transactions (only those that were successfully started)
      for (let i = 0; i < contexts.length; i++) {
        try {
          await adapters[i].rollbackTransaction(contexts[i]);
          this.activeTransactions.delete(contexts[i].id);
        } catch (rollbackErr) {
          console.error(`Failed to rollback transaction ${contexts[i].id}:`, rollbackErr);
        }
      }

      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Cross-database transaction failed',
        err instanceof Error ? err : new Error(String(err)),
        {
          databases: adapters.map(a => a.getType()),
          operationCount: operations.length
        }
      );
    }
  }

  /**
   * Get active transaction count
   */
  getActiveCount(): number {
    return this.activeTransactions.size;
  }

  /**
   * Get active transactions
   */
  getActiveTransactions(): TransactionContext[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Force rollback of stuck transactions (timeout cleanup)
   */
  async cleanupStaleTransactions(adapters: Map<string, IDatabaseAdapter>, maxAge: number = 60000): Promise<void> {
    const now = Date.now();
    const stale: TransactionContext[] = [];

    for (const context of this.activeTransactions.values()) {
      const age = now - context.startTime.getTime();
      if (age > maxAge) {
        stale.push(context);
      }
    }

    for (const context of stale) {
      for (const dbType of context.databases) {
        const adapter = adapters.get(dbType);
        if (adapter) {
          try {
            await adapter.rollbackTransaction(context);
            console.warn(`Rolled back stale transaction ${context.id} (age: ${now - context.startTime.getTime()}ms)`);
          } catch (err) {
            console.error(`Failed to rollback stale transaction ${context.id}:`, err);
          }
        }
      }
      this.activeTransactions.delete(context.id);
    }
  }
}
