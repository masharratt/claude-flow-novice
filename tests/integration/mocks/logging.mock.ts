/**
 * Mock Logging Module for Integration Tests
 *
 * Provides silent logger mocks to prevent test output pollution.
 */

export interface IMockLogger {
  debug: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  child: jest.Mock;
}

const createMockLogger = (): IMockLogger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
});

export const mockLogger = createMockLogger();

export const createLogger = jest.fn((name?: string) => createMockLogger());

export const getGlobalLogger = jest.fn(() => mockLogger);

export const logger = mockLogger;

// Default export for module replacement
export default {
  createLogger,
  getGlobalLogger,
  logger,
  mockLogger,
};
