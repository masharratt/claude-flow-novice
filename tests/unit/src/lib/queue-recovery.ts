// Stub: queue recovery
// Created to satisfy test imports

export interface RecoveryOptions {
  maxRetries?: number;
  backoffMs?: number;
}

export class QueueRecovery {
  async recover(queueName: string, options?: RecoveryOptions): Promise<number> {
    // Stub implementation - returns number of recovered items
    return 0;
  }

  async retryFailed(queueName: string): Promise<number> {
    // Stub implementation
    return 0;
  }
}
