/**
 * Test Helpers for Integration Tests
 *
 * Provides convenient utilities for creating mock instances and test data.
 */

import { jest } from '@jest/globals';

/**
 * Creates a mock DatabaseService instance with all required methods
 */
export function createMockDatabaseService() {
  const createMockAdapter = () => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    execute: jest.fn().mockResolvedValue({ success: true }),
    raw: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    transaction: jest.fn().mockImplementation(async (callback: any) => {
      return await callback({
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        execute: jest.fn().mockResolvedValue({ success: true }),
        raw: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      });
    }),
    close: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockResolvedValue(true),
    getConnection: jest.fn().mockResolvedValue({}),
  });

  return {
    getAdapter: jest.fn((type: string) => createMockAdapter()),
    createAdapter: jest.fn((type: string, config: any) => createMockAdapter()),
    initialize: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockResolvedValue(true),
    getConnection: jest.fn().mockResolvedValue({}),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    execute: jest.fn().mockResolvedValue({ success: true }),
    raw: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    transaction: jest.fn().mockImplementation(async (callback: any) => {
      return await callback({
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        execute: jest.fn().mockResolvedValue({ success: true }),
        raw: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      });
    }),
  };
}

/**
 * Creates a mock Redis client instance
 */
export function createMockRedisClient() {
  const store = new Map<string, any>();
  const lists = new Map<string, any[]>();
  const sets = new Map<string, Set<any>>();
  const hashes = new Map<string, Map<string, any>>();

  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) || null)),
    set: jest.fn((key: string, value: any) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((...keys: string[]) => {
      let deleted = 0;
      keys.forEach(k => { if (store.delete(k)) deleted++; });
      return Promise.resolve(deleted);
    }),
    exists: jest.fn((...keys: string[]) => {
      return Promise.resolve(keys.filter(k => store.has(k)).length);
    }),
    keys: jest.fn((pattern: string) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Promise.resolve(Array.from(store.keys()).filter(k => regex.test(k)));
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    quit: jest.fn(() => {
      store.clear();
      return Promise.resolve('OK');
    }),
    ping: jest.fn(() => Promise.resolve('PONG')),
    // Add more methods as needed
    _store: store, // For test inspection
    _clear: () => {
      store.clear();
      lists.clear();
      sets.clear();
      hashes.clear();
    },
  };
}

/**
 * Creates a mock logger instance
 */
export function createMockLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
}

/**
 * Waits for a condition to become true with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Creates a temporary test directory that is automatically cleaned up
 */
export async function createTempTestDir(baseName: string = 'test'): Promise<string> {
  const { promises: fs } = await import('fs');
  const path = await import('path');
  const { randomBytes } = await import('crypto');

  const randomId = randomBytes(8).toString('hex');
  const tempDir = path.join(process.cwd(), `.test-${baseName}-${randomId}`);

  await fs.mkdir(tempDir, { recursive: true });

  return tempDir;
}

/**
 * Cleans up a temporary test directory
 */
export async function cleanupTempTestDir(dirPath: string): Promise<void> {
  const { promises: fs } = await import('fs');

  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to cleanup test directory ${dirPath}:`, error);
  }
}
