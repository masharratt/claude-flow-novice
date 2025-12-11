// Stub: transaction manager
// Created to satisfy test imports

import { Transaction } from './types';

export interface TransactionOptions {
  isolationLevel?: 'read_uncommitted' | 'read_committed' | 'repeatable_read' | 'serializable';
  timeout?: number;
}

export class TransactionManager {
  private activeTransactions: Map<string, Transaction> = new Map();

  async begin(options?: TransactionOptions): Promise<Transaction> {
    const tx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      metadata: options as Record<string, unknown> | undefined,
    };
    this.activeTransactions.set(tx.id, tx);
    return tx;
  }

  async commit(tx: Transaction): Promise<void> {
    const storedTx = this.activeTransactions.get(tx.id);
    if (storedTx) {
      storedTx.status = 'committed';
      this.activeTransactions.delete(tx.id);
    }
  }

  async rollback(tx: Transaction): Promise<void> {
    const storedTx = this.activeTransactions.get(tx.id);
    if (storedTx) {
      storedTx.status = 'rolled_back';
      this.activeTransactions.delete(tx.id);
    }
  }

  getActiveTransactions(): Transaction[] {
    return Array.from(this.activeTransactions.values());
  }
}
