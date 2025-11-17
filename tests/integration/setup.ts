/**
 * Jest Setup File for Integration Tests
 *
 * Configures global mocks and test environment settings.
 */

import { jest } from '@jest/globals';

// Create mock adapter factory with all required methods
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

// Mock logging globally to prevent test output pollution
jest.mock('../../src/lib/logging', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
  getGlobalLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

// Mock DatabaseService from database-service/index.js
jest.mock('../../src/lib/database-service/index.js', () => ({
  DatabaseService: jest.fn().mockImplementation(() => ({
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
  })),
}));

// Also mock the non-.js import path
jest.mock('../../src/lib/database-service', () => ({
  DatabaseService: jest.fn().mockImplementation(() => ({
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
  })),
}));

// Mock errors.js module
jest.mock('../../src/lib/errors.js', () => {
  enum ErrorCode {
    UNKNOWN = 'UNKNOWN',
    VALIDATION = 'VALIDATION',
    NOT_FOUND = 'NOT_FOUND',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    DATABASE = 'DATABASE',
    DB_QUERY_FAILED = 'DB_QUERY_FAILED',
    CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  }

  class StandardError extends Error {
    constructor(
      codeOrMessage: ErrorCode | string,
      messageOrDetails?: string | any,
      details?: any,
      cause?: Error
    ) {
      // Handle both old and new constructor signatures
      let message: string;
      let code: ErrorCode;
      
      if (typeof codeOrMessage === 'string' && Object.values(ErrorCode).includes(codeOrMessage as ErrorCode)) {
        code = codeOrMessage as ErrorCode;
        message = typeof messageOrDetails === 'string' ? messageOrDetails : codeOrMessage;
      } else {
        message = codeOrMessage as string;
        code = ErrorCode.UNKNOWN;
      }
      
      super(message);
      this.name = 'StandardError';
      (this as any).code = code;
      (this as any).details = details;
      (this as any).cause = cause;
    }
  }

  return { ErrorCode, StandardError };
});

// Mock Redis client (ioredis)
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    const store = new Map<string, any>();
    const lists = new Map<string, any[]>();
    const sets = new Map<string, Set<any>>();
    const hashes = new Map<string, Map<string, any>>();
    
    return {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) || null)),
      set: jest.fn((key: string, value: any, ...args: any[]) => {
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
      ttl: jest.fn(() => Promise.resolve(-1)),
      incr: jest.fn((key: string) => {
        const val = parseInt(store.get(key) || '0', 10) + 1;
        store.set(key, val.toString());
        return Promise.resolve(val);
      }),
      decr: jest.fn((key: string) => {
        const val = parseInt(store.get(key) || '0', 10) - 1;
        store.set(key, val.toString());
        return Promise.resolve(val);
      }),
      lpush: jest.fn((key: string, ...values: any[]) => {
        if (!lists.has(key)) lists.set(key, []);
        lists.get(key)!.unshift(...values);
        return Promise.resolve(lists.get(key)!.length);
      }),
      rpush: jest.fn((key: string, ...values: any[]) => {
        if (!lists.has(key)) lists.set(key, []);
        lists.get(key)!.push(...values);
        return Promise.resolve(lists.get(key)!.length);
      }),
      lpop: jest.fn((key: string) => {
        const list = lists.get(key);
        return Promise.resolve(list ? list.shift() : null);
      }),
      rpop: jest.fn((key: string) => {
        const list = lists.get(key);
        return Promise.resolve(list ? list.pop() : null);
      }),
      lrange: jest.fn((key: string, start: number, stop: number) => {
        const list = lists.get(key) || [];
        return Promise.resolve(list.slice(start, stop >= 0 ? stop + 1 : undefined));
      }),
      llen: jest.fn((key: string) => {
        return Promise.resolve((lists.get(key) || []).length);
      }),
      sadd: jest.fn((key: string, ...members: any[]) => {
        if (!sets.has(key)) sets.set(key, new Set());
        let added = 0;
        members.forEach(m => {
          if (!sets.get(key)!.has(m)) {
            sets.get(key)!.add(m);
            added++;
          }
        });
        return Promise.resolve(added);
      }),
      smembers: jest.fn((key: string) => {
        return Promise.resolve(sets.has(key) ? Array.from(sets.get(key)!) : []);
      }),
      sismember: jest.fn((key: string, member: any) => {
        return Promise.resolve(sets.has(key) && sets.get(key)!.has(member) ? 1 : 0);
      }),
      hset: jest.fn((key: string, ...args: any[]) => {
        if (!hashes.has(key)) hashes.set(key, new Map());
        const hash = hashes.get(key)!;
        
        if (args.length === 2) {
          // Single field-value pair
          const [field, value] = args;
          const isNew = !hash.has(field);
          hash.set(field, value);
          return Promise.resolve(isNew ? 1 : 0);
        } else {
          // Multiple field-value pairs or object
          let added = 0;
          for (let i = 0; i < args.length; i += 2) {
            const field = args[i];
            const value = args[i + 1];
            if (!hash.has(field)) added++;
            hash.set(field, value);
          }
          return Promise.resolve(added);
        }
      }),
      hget: jest.fn((key: string, field: string) => {
        return Promise.resolve(hashes.has(key) ? hashes.get(key)!.get(field) : null);
      }),
      hgetall: jest.fn((key: string) => {
        if (!hashes.has(key)) return Promise.resolve({});
        const obj: Record<string, any> = {};
        hashes.get(key)!.forEach((value, field) => {
          obj[field] = value;
        });
        return Promise.resolve(obj);
      }),
      hdel: jest.fn((key: string, ...fields: string[]) => {
        if (!hashes.has(key)) return Promise.resolve(0);
        let deleted = 0;
        fields.forEach(f => {
          if (hashes.get(key)!.delete(f)) deleted++;
        });
        return Promise.resolve(deleted);
      }),
      publish: jest.fn(() => Promise.resolve(0)),
      subscribe: jest.fn(() => Promise.resolve('OK')),
      unsubscribe: jest.fn(() => Promise.resolve('OK')),
      quit: jest.fn(() => {
        store.clear();
        lists.clear();
        sets.clear();
        hashes.clear();
        return Promise.resolve('OK');
      }),
      disconnect: jest.fn(() => Promise.resolve()),
      ping: jest.fn(() => Promise.resolve('PONG')),
      on: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
    };
  });
});

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.CFN_CUSTOM_ROUTING = 'false';
process.env.LOG_LEVEL = 'error';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Increase Jest timeout for integration tests
jest.setTimeout(30000);

console.log('Integration test environment configured');
