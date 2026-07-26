/**
 * Comprehensive Test Cleanup Utility
 *
 * Fixes "Cannot log after tests are done" errors by ensuring all async
 * operations are properly cleaned up before test completion.
 *
 * Usage:
 * ```typescript
 * import { TestCleanupManager } from './utils/cleanup';
 *
 * describe('MyTest', () => {
 *   const cleanup = new TestCleanupManager();
 *
 *   afterEach(async () => {
 *     await cleanup.cleanupAll();
 *   });
 *
 *   it('test case', async () => {
 *     const timer = setTimeout(() => {}, 1000);
 *     cleanup.trackTimer(timer);
 *     // ... test logic
 *   });
 * });
 * ```
 */

import { RedisClientType } from 'redis';

/**
 * Structural stand-in for the database service tracked by TestCleanupManager.
 * Only `disconnect()` is called on tracked instances (see closeDatabaseServices),
 * so any object exposing it is accepted. The concrete DatabaseService type lived
 * in src/lib/database-service, which was removed with the Sprint-4 stub layer;
 * this local interface decouples the cleanup utility from that deleted module.
 */
interface DatabaseServiceLike {
  disconnect(): Promise<void> | void;
}

/**
 * Helper to race a promise with a timeout and properly clear the timeout handle
 * to prevent event loop leaks. This ensures setTimeout handles don't keep Node running.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export interface CleanupOptions {
  /**
   * Maximum time to wait for connections to close (ms)
   * @default 5000
   */
  timeout?: number;

  /**
   * Whether to suppress cleanup errors
   * @default true
   */
  suppressErrors?: boolean;

  /**
   * Whether to force close connections
   * @default true
   */
  forceClose?: boolean;
}

export class TestCleanupManager {
  private timers: Set<NodeJS.Timeout> = new Set();
  private intervals: Set<NodeJS.Timeout> = new Set();
  private redisClients: Set<RedisClientType> = new Set();
  private databaseServices: Set<DatabaseServiceLike> = new Set();
  private eventListeners: Map<EventTarget | NodeJS.EventEmitter, Array<{
    event: string;
    listener: (...args: any[]) => void;
  }>> = new Map();
  private cleanupCallbacks: Array<() => Promise<void> | void> = [];

  /**
   * Track a timer for cleanup
   */
  trackTimer(timer: NodeJS.Timeout): void {
    this.timers.add(timer);
  }

  /**
   * Track an interval for cleanup
   */
  trackInterval(interval: NodeJS.Timeout): void {
    this.intervals.add(interval);
  }

  /**
   * Track a Redis client for cleanup
   */
  trackRedisClient(client: RedisClientType): void {
    this.redisClients.add(client);
  }

  /**
   * Track a database service for cleanup
   */
  trackDatabaseService(service: DatabaseServiceLike): void {
    this.databaseServices.add(service);
  }

  /**
   * Track an event listener for cleanup
   */
  trackEventListener(
    target: EventTarget | NodeJS.EventEmitter,
    event: string,
    listener: (...args: any[]) => void
  ): void {
    if (!this.eventListeners.has(target)) {
      this.eventListeners.set(target, []);
    }
    this.eventListeners.get(target)!.push({ event, listener });
  }

  /**
   * Register a custom cleanup callback
   */
  onCleanup(callback: () => Promise<void> | void): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /**
   * Clear all intervals
   */
  private clearIntervals(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  /**
   * Close all Redis clients
   */
  private async closeRedisClients(options: CleanupOptions): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const client of this.redisClients) {
      const closePromise = (async () => {
        try {
          if (client.isOpen) {
            if (options.forceClose) {
              // Force disconnect without graceful shutdown
              await client.disconnect();
            } else {
              // Graceful shutdown
              await client.quit();
            }
          }
        } catch (error) {
          if (!options.suppressErrors) {
            console.error('Error closing Redis client:', error);
          }
        }
      })();

      promises.push(closePromise);
    }

    await withTimeout(
      Promise.all(promises),
      options.timeout || 5000
    );

    this.redisClients.clear();
  }

  /**
   * Close all database connections
   */
  private async closeDatabaseServices(options: CleanupOptions): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const service of this.databaseServices) {
      const closePromise = (async () => {
        try {
          await service.disconnect();
        } catch (error) {
          if (!options.suppressErrors) {
            console.error('Error closing database service:', error);
          }
        }
      })();

      promises.push(closePromise);
    }

    await withTimeout(
      Promise.all(promises),
      options.timeout || 5000
    );

    this.databaseServices.clear();
  }

  /**
   * Remove all event listeners
   */
  private removeEventListeners(): void {
    for (const [target, listeners] of this.eventListeners.entries()) {
      for (const { event, listener } of listeners) {
        if ('removeEventListener' in target) {
          (target as EventTarget).removeEventListener(event, listener);
        } else {
          (target as NodeJS.EventEmitter).removeListener(event, listener);
        }
      }
    }
    this.eventListeners.clear();
  }

  /**
   * Execute custom cleanup callbacks
   */
  private async executeCleanupCallbacks(options: CleanupOptions): Promise<void> {
    const promises = this.cleanupCallbacks.map(async (callback) => {
      try {
        await callback();
      } catch (error) {
        if (!options.suppressErrors) {
          console.error('Error in cleanup callback:', error);
        }
      }
    });

    await withTimeout(
      Promise.all(promises),
      options.timeout || 5000
    );

    this.cleanupCallbacks = [];
  }

  /**
   * Clean up all tracked resources
   */
  async cleanupAll(options: CleanupOptions = {}): Promise<void> {
    const opts: Required<CleanupOptions> = {
      timeout: options.timeout ?? 5000,
      suppressErrors: options.suppressErrors ?? true,
      forceClose: options.forceClose ?? true,
    };

    // Clear synchronous resources first
    this.clearTimers();
    this.clearIntervals();
    this.removeEventListeners();

    // Close async connections with timeout
    await Promise.all([
      this.closeRedisClients(opts),
      this.closeDatabaseServices(opts),
      this.executeCleanupCallbacks(opts),
    ]);

    // Wait a bit for any final async operations
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Check if there are any pending resources
   */
  hasPendingResources(): boolean {
    return (
      this.timers.size > 0 ||
      this.intervals.size > 0 ||
      this.redisClients.size > 0 ||
      this.databaseServices.size > 0 ||
      this.eventListeners.size > 0 ||
      this.cleanupCallbacks.length > 0
    );
  }
}

/**
 * Global cleanup manager for use in test setup
 */
export const globalCleanup = new TestCleanupManager();

/**
 * Helper to wrap setTimeout with automatic tracking
 */
export function trackedSetTimeout(
  callback: () => void,
  ms: number,
  cleanup: TestCleanupManager = globalCleanup
): NodeJS.Timeout {
  const timer = setTimeout(callback, ms);
  cleanup.trackTimer(timer);
  return timer;
}

/**
 * Helper to wrap setInterval with automatic tracking
 */
export function trackedSetInterval(
  callback: () => void,
  ms: number,
  cleanup: TestCleanupManager = globalCleanup
): NodeJS.Timeout {
  const interval = setInterval(callback, ms);
  cleanup.trackInterval(interval);
  return interval;
}

/**
 * Clean up all connections globally
 * Use in afterAll hooks
 */
export async function cleanupAllConnections(options?: CleanupOptions): Promise<void> {
  await globalCleanup.cleanupAll(options);
}

/**
 * Force close all database connections
 * Useful for stuck connections
 */
export async function forceCloseAllConnections(): Promise<void> {
  await globalCleanup.cleanupAll({
    timeout: 1000,
    suppressErrors: true,
    forceClose: true,
  });
}
