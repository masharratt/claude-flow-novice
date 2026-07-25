/**
 * Jest test setup and global configuration
 */

// Mock environment variables
process.env.CFN_REDIS_HOST = process.env.CFN_REDIS_HOST || 'localhost';
process.env.CFN_REDIS_PORT = process.env.CFN_REDIS_PORT || '6379';
process.env.NODE_ENV = 'test';

// Suppress console logs in tests unless explicitly needed
const originalLog = console.log;
const originalWarn = console.warn;

beforeAll((): void => {
  console.log = jest.fn();
  console.warn = jest.fn();
});

afterAll((): void => {
  console.log = originalLog;
  console.warn = originalWarn;
});
