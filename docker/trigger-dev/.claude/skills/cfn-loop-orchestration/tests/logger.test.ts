/**
 * Unit tests for logger utility
 * Validates logging functionality
 */

import { Logger } from '../src/utils/logger';

describe('logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with context', () => {
      const logger = new Logger('test-context');
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should accept empty context', () => {
      const logger = new Logger('');
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should accept special characters in context', () => {
      const logger = new Logger('context-with-special_chars.123');
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('debug', () => {
    it('should log debug message', () => {
      const logger = new Logger('test');
      logger.debug('debug message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] [test] debug message', '');
    });

    it('should log debug message with data', () => {
      const logger = new Logger('test');
      const data = { key: 'value' };
      logger.debug('debug message', data);

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] [test] debug message', data);
    });

    it('should handle undefined data', () => {
      const logger = new Logger('test');
      logger.debug('message', undefined);

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] [test] message', '');
    });

    it('should handle null data', () => {
      const logger = new Logger('test');
      logger.debug('message', null);

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] [test] message', null);
    });

    it('should handle complex data objects', () => {
      const logger = new Logger('test');
      const complexData = {
        nested: { value: 123 },
        array: [1, 2, 3],
        boolean: true,
      };
      logger.debug('message', complexData);

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] [test] message', complexData);
    });
  });

  describe('info', () => {
    it('should log info message', () => {
      const logger = new Logger('test');
      logger.info('info message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [test] info message', '');
    });

    it('should log info message with data', () => {
      const logger = new Logger('test');
      const data = { status: 'success' };
      logger.info('operation completed', data);

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [test] operation completed', data);
    });

    it('should handle string data', () => {
      const logger = new Logger('test');
      logger.info('message', 'additional info');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [test] message', 'additional info');
    });

    it('should handle number data', () => {
      const logger = new Logger('test');
      logger.info('count', 42);

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [test] count', 42);
    });
  });

  describe('warn', () => {
    it('should log warning message', () => {
      const logger = new Logger('test');
      logger.warn('warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN] [test] warning message', '');
    });

    it('should log warning message with data', () => {
      const logger = new Logger('test');
      const data = { threshold: 90 };
      logger.warn('threshold exceeded', data);

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN] [test] threshold exceeded', data);
    });

    it('should use console.warn instead of console.log', () => {
      const logger = new Logger('test');
      logger.warn('warning');

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error message', () => {
      const logger = new Logger('test');
      logger.error('error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] [test] error message', '');
    });

    it('should log error message with error object', () => {
      const logger = new Logger('test');
      const error = new Error('something went wrong');
      logger.error('operation failed', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] [test] operation failed', error);
    });

    it('should handle Error instance', () => {
      const logger = new Logger('test');
      const error = new Error('test error');
      logger.error('error occurred', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] [test] error occurred', error);
    });

    it('should handle undefined error', () => {
      const logger = new Logger('test');
      logger.error('error', undefined);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] [test] error', '');
    });

    it('should use console.error instead of console.log', () => {
      const logger = new Logger('test');
      logger.error('error');

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('context formatting', () => {
    it('should include context in all log levels', () => {
      const logger = new Logger('orchestrator');

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[orchestrator]'), '');
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[orchestrator]'), '');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[orchestrator]'),
        ''
      );
    });

    it('should handle empty context gracefully', () => {
      const logger = new Logger('');

      logger.info('message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [] message', '');
    });

    it('should preserve context with special characters', () => {
      const logger = new Logger('loop-3_agent.v2');

      logger.info('message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [loop-3_agent.v2] message', '');
    });
  });

  describe('multiple loggers', () => {
    it('should maintain separate contexts', () => {
      const logger1 = new Logger('context1');
      const logger2 = new Logger('context2');

      logger1.info('message from logger1');
      logger2.info('message from logger2');

      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '[INFO] [context1] message from logger1', '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '[INFO] [context2] message from logger2', '');
    });

    it('should not interfere with each other', () => {
      const logger1 = new Logger('logger1');
      const logger2 = new Logger('logger2');

      logger1.debug('debug1');
      logger2.warn('warn2');
      logger1.error('error1');

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] [logger1] debug1', '');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN] [logger2] warn2', '');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] [logger1] error1', '');
    });
  });

  describe('edge cases', () => {
    it('should handle very long messages', () => {
      const logger = new Logger('test');
      const longMessage = 'a'.repeat(10000);
      logger.info(longMessage);

      expect(consoleLogSpy).toHaveBeenCalledWith(`[INFO] [test] ${longMessage}`, '');
    });

    it('should handle very long context', () => {
      const longContext = 'c'.repeat(1000);
      const logger = new Logger(longContext);
      logger.info('message');

      expect(consoleLogSpy).toHaveBeenCalledWith(`[INFO] [${longContext}] message`, '');
    });

    it('should handle newlines in message', () => {
      const logger = new Logger('test');
      logger.info('line1\nline2\nline3');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [test] line1\nline2\nline3', '');
    });

    it('should handle circular references in data', () => {
      const logger = new Logger('test');
      const circular: { self?: unknown } = {};
      circular.self = circular;

      // Should not throw
      expect(() => logger.info('circular', circular)).not.toThrow();
    });

    it('should handle array data', () => {
      const logger = new Logger('test');
      const arrayData = [1, 2, 3, 4, 5];
      logger.info('array', arrayData);

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [test] array', arrayData);
    });

    it('should handle boolean data', () => {
      const logger = new Logger('test');
      logger.info('boolean true', true);
      logger.info('boolean false', false);

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [test] boolean true', true);
      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [test] boolean false', false);
    });
  });
});
