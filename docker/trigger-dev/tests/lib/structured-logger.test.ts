/**
 * Unit Tests for StructuredLogger
 *
 * Tests JSON structured logging for production monitoring.
 * Covers log level filtering, JSON output format, error serialization,
 * child logger context inheritance, and execution timing.
 *
 * Test Coverage:
 * - Log level filtering (debug/info/warn/error)
 * - JSON output format validation
 * - Error serialization with stack traces
 * - Child logger with context inheritance
 * - measureAsync() timing accuracy
 * - measureSync() timing
 * - Log entry field validation
 * - Stack trace inclusion/exclusion
 * - Context field handling
 * - Logger configuration
 *
 * @module structured-logger.test
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { SpyInstance } from 'jest-mock';
import {
  StructuredLogger,
  initializeLogger,
  getLogger,
  LogLevel,
  LogEntry,
} from '../../src/lib/structured-logger.js';

describe('StructuredLogger', () => {
  let consoleLogSpy: SpyInstance;
  let consoleWarnSpy: SpyInstance;
  let consoleErrorSpy: SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // =============================================
  // Log Level Filtering Tests
  // =============================================

  describe('Log Level Filtering', () => {
    it('should log info when minLevel is info', () => {
      const logger = new StructuredLogger({ component: 'test', minLevel: 'info' });

      logger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.level).toBe('info');
    });

    it('should not log debug when minLevel is info', () => {
      const logger = new StructuredLogger({ component: 'test', minLevel: 'info' });

      logger.debug('Debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log debug when minLevel is debug', () => {
      const logger = new StructuredLogger({ component: 'test', minLevel: 'debug' });

      logger.debug('Debug message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.level).toBe('debug');
    });

    it('should log warn when minLevel is info', () => {
      const logger = new StructuredLogger({ component: 'test', minLevel: 'info' });

      logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(output.level).toBe('warn');
    });

    it('should log error when minLevel is info', () => {
      const logger = new StructuredLogger({ component: 'test', minLevel: 'info' });

      logger.error('Error message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.level).toBe('error');
    });

    it('should respect error minLevel and filter lower levels', () => {
      const logger = new StructuredLogger({ component: 'test', minLevel: 'error' });

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should default to info level when not specified', () => {
      const logger = new StructuredLogger({ component: 'test' });

      logger.debug('Should be filtered');
      logger.info('Should be logged');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================
  // JSON Output Format Tests
  // =============================================

  describe('JSON Output Format', () => {
    it('should output valid JSON for info log', () => {
      const logger = new StructuredLogger({ component: 'test-component' });

      logger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(output.timestamp).toBeDefined();
      expect(output.level).toBe('info');
      expect(output.component).toBe('test-component');
      expect(output.message).toBe('Test message');
    });

    it('should include metrics in output', () => {
      const logger = new StructuredLogger({ component: 'test' });

      logger.info('Test message', { duration: 123, count: 5 });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.metrics).toEqual({ duration: 123, count: 5 });
    });

    it('should include context in output', () => {
      const logger = new StructuredLogger({ component: 'test' });

      logger.info('Test message', undefined, { userId: 'user-123', requestId: 'req-456' });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.context).toEqual({ userId: 'user-123', requestId: 'req-456' });
    });

    it('should include taskId in output when configured', () => {
      const logger = new StructuredLogger({ component: 'test', taskId: 'task-789' });

      logger.info('Test message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.taskId).toBe('task-789');
    });

    it('should not include undefined fields', () => {
      const logger = new StructuredLogger({ component: 'test' });

      logger.info('Test message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.taskId).toBeUndefined();
      expect(output.metrics).toBeUndefined();
      expect(output.context).toBeUndefined();
      expect(output.error).toBeUndefined();
    });

    it('should format timestamp in ISO8601', () => {
      const logger = new StructuredLogger({ component: 'test' });

      logger.info('Test message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  // =============================================
  // Error Serialization Tests
  // =============================================

  describe('Error Serialization', () => {
    it('should serialize Error object with stack trace', () => {
      const logger = new StructuredLogger({ component: 'test', includeStackTrace: true });
      const error = new Error('Test error');

      logger.error('Error occurred', error);

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.error).toBeDefined();
      expect(output.error.message).toBe('Test error');
      expect(output.error.stack).toBeDefined();
      expect(output.error.stack).toContain('Error: Test error');
    });

    it('should serialize Error object without stack trace when disabled', () => {
      const logger = new StructuredLogger({ component: 'test', includeStackTrace: false });
      const error = new Error('Test error');

      logger.error('Error occurred', error);

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.error).toBeDefined();
      expect(output.error.message).toBe('Test error');
      expect(output.error.stack).toBeUndefined();
    });

    it('should include error code when present', () => {
      const logger = new StructuredLogger({ component: 'test' });
      const error: any = new Error('Test error');
      error.code = 'ERR_TEST';

      logger.error('Error occurred', error);

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.error.code).toBe('ERR_TEST');
    });

    it('should handle string errors', () => {
      const logger = new StructuredLogger({ component: 'test' });

      logger.error('Error occurred', 'Simple error string');

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.error).toBeDefined();
      expect(output.error.message).toBe('Simple error string');
    });

    it('should handle object errors', () => {
      const logger = new StructuredLogger({ component: 'test' });
      const error = { message: 'Custom error', code: 'CUSTOM_ERR' };

      logger.error('Error occurred', error);

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.error.message).toBe('Custom error');
      expect(output.error.code).toBe('CUSTOM_ERR');
    });

    it('should handle errors without message property', () => {
      const logger = new StructuredLogger({ component: 'test' });
      const error = { code: 'NO_MESSAGE' };

      logger.error('Error occurred', error);

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.error.message).toBeDefined();
    });

    it('should include context with error', () => {
      const logger = new StructuredLogger({ component: 'test' });
      const error = new Error('Test error');

      logger.error('Error occurred', error, { requestId: 'req-123' });

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.error).toBeDefined();
      expect(output.context).toEqual({ requestId: 'req-123' });
    });
  });

  // =============================================
  // Child Logger Tests
  // =============================================

  describe('Child Logger Context Inheritance', () => {
    it('should create child logger with inherited component', () => {
      const parent = new StructuredLogger({ component: 'parent' });
      const child = parent.child({});

      child.info('Child message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.component).toBe('parent');
    });

    it('should override component in child logger', () => {
      const parent = new StructuredLogger({ component: 'parent' });
      const child = parent.child({ component: 'child' });

      child.info('Child message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.component).toBe('child');
    });

    it('should inherit taskId from parent', () => {
      const parent = new StructuredLogger({ component: 'parent', taskId: 'task-123' });
      const child = parent.child({ component: 'child' });

      child.info('Child message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.taskId).toBe('task-123');
    });

    it('should override taskId in child logger', () => {
      const parent = new StructuredLogger({ component: 'parent', taskId: 'task-123' });
      const child = parent.child({ component: 'child', taskId: 'task-456' });

      child.info('Child message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.taskId).toBe('task-456');
    });

    it('should inherit minLevel from parent', () => {
      const parent = new StructuredLogger({ component: 'parent', minLevel: 'warn' });
      const child = parent.child({ component: 'child' });

      child.info('Should be filtered');
      child.warn('Should be logged');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });

    it('should override minLevel in child logger', () => {
      const parent = new StructuredLogger({ component: 'parent', minLevel: 'warn' });
      const child = parent.child({ component: 'child', minLevel: 'debug' });

      child.debug('Should be logged');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should inherit includeStackTrace setting', () => {
      const parent = new StructuredLogger({ component: 'parent', includeStackTrace: false });
      const child = parent.child({ component: 'child' });

      child.error('Error', new Error('Test'));

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.error.stack).toBeUndefined();
    });

    it('should override includeStackTrace in child', () => {
      const parent = new StructuredLogger({ component: 'parent', includeStackTrace: false });
      const child = parent.child({ component: 'child', includeStackTrace: true });

      child.error('Error', new Error('Test'));

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.error.stack).toBeDefined();
    });
  });

  // =============================================
  // Timing Measurement Tests
  // =============================================

  describe('measureAsync() Timing', () => {
    it('should measure async function execution time', async () => {
      const logger = new StructuredLogger({ component: 'test' });

      await logger.measureAsync('Test operation', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'result';
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.message).toBe('Test operation');
      expect(output.metrics?.durationMs).toBeGreaterThanOrEqual(50);
    });

    it('should return result from measured function', async () => {
      const logger = new StructuredLogger({ component: 'test' });

      const result = await logger.measureAsync('Test operation', async () => {
        return 'test-result';
      });

      expect(result).toBe('test-result');
    });

    it('should log error and rethrow on failure', async () => {
      const logger = new StructuredLogger({ component: 'test' });

      await expect(
        logger.measureAsync('Failing operation', async () => {
          throw new Error('Operation failed');
        })
      ).rejects.toThrow('Operation failed');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.message).toBe('Failing operation failed');
      expect(output.error.message).toBe('Operation failed');
      expect(output.context?.durationMs).toBeDefined();
    });

    it('should include duration in error context', async () => {
      const logger = new StructuredLogger({ component: 'test' });

      try {
        await logger.measureAsync('Failing operation', async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          throw new Error('Failed');
        });
      } catch (error) {
        // Expected
      }

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.context?.durationMs).toBeGreaterThanOrEqual(50);
    });
  });

  describe('measureSync() Timing', () => {
    it('should measure synchronous function execution time', () => {
      const logger = new StructuredLogger({ component: 'test' });

      const result = logger.measureSync('Test operation', () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      });

      expect(result).toBe(499500);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.message).toBe('Test operation');
      expect(output.metrics?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should log error and rethrow on failure', () => {
      const logger = new StructuredLogger({ component: 'test' });

      expect(() =>
        logger.measureSync('Failing operation', () => {
          throw new Error('Sync operation failed');
        })
      ).toThrow('Sync operation failed');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.message).toBe('Failing operation failed');
      expect(output.error.message).toBe('Sync operation failed');
    });
  });

  // =============================================
  // Logger Configuration Tests
  // =============================================

  describe('Logger Configuration', () => {
    it('should create logger with all config options', () => {
      const logger = new StructuredLogger({
        component: 'test',
        minLevel: 'debug',
        includeStackTrace: true,
        includeContext: true,
        taskId: 'task-123',
      });

      logger.debug('Test message', { key: 'value' });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.component).toBe('test');
      expect(output.level).toBe('debug');
      expect(output.taskId).toBe('task-123');
      expect(output.context).toEqual({ key: 'value' });
    });

    it('should exclude context when includeContext is false', () => {
      const logger = new StructuredLogger({
        component: 'test',
        includeContext: false,
      });

      logger.info('Test message', {}, { key: 'value' });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.context).toBeUndefined();
    });

    it('should default includeStackTrace to true', () => {
      const logger = new StructuredLogger({ component: 'test' });

      logger.error('Error', new Error('Test'));

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.error.stack).toBeDefined();
    });

    it('should default includeContext to true', () => {
      const logger = new StructuredLogger({ component: 'test' });

      logger.info('Test', {}, { key: 'value' });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.context).toEqual({ key: 'value' });
    });
  });

  // =============================================
  // Warning Level Tests
  // =============================================

  describe('Warning Level Logging', () => {
    it('should log warnings with metrics', () => {
      const logger = new StructuredLogger({ component: 'test' });

      logger.warn('Warning message', { threshold: 0.8, actual: 0.85 });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(output.level).toBe('warn');
      expect(output.message).toBe('Warning message');
      expect(output.metrics).toEqual({ threshold: 0.8, actual: 0.85 });
    });

    it('should log warnings with context', () => {
      const logger = new StructuredLogger({ component: 'test' });

      logger.warn('Warning message', {}, { source: 'validator' });

      const output = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(output.context).toEqual({ source: 'validator' });
    });
  });

  // =============================================
  // Debug Level Tests
  // =============================================

  describe('Debug Level Logging', () => {
    it('should log debug with context only', () => {
      const logger = new StructuredLogger({ component: 'test', minLevel: 'debug' });

      logger.debug('Debug message', { variable: 'value', count: 5 });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.level).toBe('debug');
      expect(output.message).toBe('Debug message');
      expect(output.context).toEqual({ variable: 'value', count: 5 });
    });

    it('should not include metrics in debug logs', () => {
      const logger = new StructuredLogger({ component: 'test', minLevel: 'debug' });

      logger.debug('Debug message', { data: 'test' });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.metrics).toBeUndefined();
      expect(output.context).toEqual({ data: 'test' });
    });
  });

  // =============================================
  // Singleton Pattern Tests
  // =============================================

  describe('Singleton Pattern', () => {
    it('should initialize global logger', () => {
      initializeLogger({ component: 'global' });
      const logger = getLogger();

      logger.info('Test message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.component).toBe('global');
    });

    it('should create child logger from global logger', () => {
      initializeLogger({ component: 'global' });
      const child = getLogger('child-component');

      child.info('Test message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.component).toBe('child-component');
    });

    it('should create default logger if not initialized', () => {
      const logger = getLogger('test-component');

      logger.info('Test message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.component).toBe('test-component');
    });

    it('should return global logger when no component specified', () => {
      initializeLogger({ component: 'global', minLevel: 'warn' });
      const logger = getLogger();

      logger.info('Should be filtered');
      logger.warn('Should be logged');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
