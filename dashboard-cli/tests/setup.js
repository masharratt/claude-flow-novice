// Jest test setup
const { jest } = require('@jest/globals');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3101'; // Different port for testing

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test timeout
jest.setTimeout(30000);