// Stub: file lock manager
// Created to satisfy test imports

export interface LockOptions {
  timeout?: number;
  retryInterval?: number;
}

export class FileLockManager {
  private locks: Set<string> = new Set();

  async acquireLock(path: string, options?: LockOptions): Promise<boolean> {
    if (this.locks.has(path)) {
      return false;
    }
    this.locks.add(path);
    return true;
  }

  async releaseLock(path: string): Promise<void> {
    this.locks.delete(path);
  }

  isLocked(path: string): boolean {
    return this.locks.has(path);
  }

  async withLock<T>(path: string, fn: () => Promise<T>, options?: LockOptions): Promise<T> {
    const acquired = await this.acquireLock(path, options);
    if (!acquired) {
      throw new Error(`Failed to acquire lock for ${path}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(path);
    }
  }
}
