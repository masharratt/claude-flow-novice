// Stub: distributed lock
// Created to satisfy test imports

export interface LockOptions {
  ttl?: number;
  retryCount?: number;
  retryDelay?: number;
}

export class DistributedLock {
  private locks: Set<string> = new Set();

  async acquire(key: string, options?: LockOptions): Promise<boolean> {
    if (this.locks.has(key)) {
      return false;
    }
    this.locks.add(key);
    return true;
  }

  async release(key: string): Promise<void> {
    this.locks.delete(key);
  }

  async withLock<T>(key: string, fn: () => Promise<T>, options?: LockOptions): Promise<T> {
    const acquired = await this.acquire(key, options);
    if (!acquired) {
      throw new Error(`Failed to acquire lock for ${key}`);
    }

    try {
      return await fn();
    } finally {
      await this.release(key);
    }
  }

  isLocked(key: string): boolean {
    return this.locks.has(key);
  }
}
