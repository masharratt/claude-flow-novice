import { describe, test, expect, beforeEach, afterEach, jest } from 'vitest';
import {
  Logger,
  LogLevel,
  logger,
  createLogger,
  getCorrelationId,
  getAgentContext,
} from '../../src/utils/logging';

describe('Structured Logging', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Logger', () => {
    test('should log INFO message with correct format', () => {
      const testLogger = createLogger({ agentType: 'test' });
      testLogger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry).toMatchObject({
        level: LogLevel.INFO,
        message: 'Test message',
        context: {
          agentType: 'test',
        },
      });
      expect(logEntry.timestamp).toBeDefined();
      expect(logEntry.correlationId).toBeDefined();
    });

    test('should log ERROR with stack trace', () => {
      const testLogger = createLogger({ agentType: 'test' });
      const error = new Error('Test error');

      testLogger.error('Error occurred', {}, error);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry).toMatchObject({
        level: LogLevel.ERROR,
        message: 'Error occurred',
        error: {
          name: 'Error',
          message: 'Test error',
        },
      });
      expect(logEntry.error.stack).toBeDefined();
    });

    test('should log FATAL to both stdout and stderr', () => {
      const testLogger = createLogger({ agentType: 'test' });
      testLogger.fatal('Fatal error');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      const stdoutLog = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      const stderrLog = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(stdoutLog.level).toBe(LogLevel.FATAL);
      expect(stderrLog.level).toBe(LogLevel.FATAL);
    });

    test('should inherit context in child logger', () => {
      const parentLogger = createLogger({
        agentType: 'backend-developer',
        team: 'platform',
      });

      const childLogger = parentLogger.child({
        taskId: 'task-123',
      });

      childLogger.info('Child log message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.context).toMatchObject({
        agentType: 'backend-developer',
        team: 'platform',
        taskId: 'task-123',
      });
    });

    test('should use same correlation ID for parent and child', () => {
      const parentLogger = createLogger({ agentType: 'test' });
      const parentCorrelationId = parentLogger.getCorrelationId();

      const childLogger = parentLogger.child({ taskId: 'task-123' });

      parentLogger.info('Parent log');
      childLogger.info('Child log');

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);

      const parentLog = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      const childLog = JSON.parse(consoleLogSpy.mock.calls[1][0] as string);

      expect(parentLog.correlationId).toBe(parentCorrelationId);
      expect(childLog.correlationId).toBe(parentCorrelationId);
    });

    test('should log DEBUG messages', () => {
      const testLogger = createLogger({ agentType: 'test' });
      testLogger.debug('Debug message', { detail: 'value' });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry).toMatchObject({
        level: LogLevel.DEBUG,
        message: 'Debug message',
        context: {
          agentType: 'test',
          detail: 'value',
        },
      });
    });

    test('should log WARN messages with optional error', () => {
      const testLogger = createLogger({ agentType: 'test' });
      const warning = new Error('Warning error');

      testLogger.warn('Warning message', {}, warning);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry).toMatchObject({
        level: LogLevel.WARN,
        message: 'Warning message',
      });
      expect(logEntry.error).toBeDefined();
    });

    test('should set and get correlation ID', () => {
      const testLogger = createLogger({ agentType: 'test' });
      const newCorrelationId = 'custom-correlation-id-123';

      testLogger.setCorrelationId(newCorrelationId);
      expect(testLogger.getCorrelationId()).toBe(newCorrelationId);

      testLogger.info('Test message');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logEntry.correlationId).toBe(newCorrelationId);
    });
  });

  describe('Utility Functions', () => {
    test('getCorrelationId should return UUID format', () => {
      const correlationId = getCorrelationId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      expect(correlationId).toMatch(uuidRegex);
    });

    test('getCorrelationId should use CORRELATION_ID from environment', () => {
      const customId = 'custom-id-from-env';
      process.env.CORRELATION_ID = customId;

      const correlationId = getCorrelationId();

      expect(correlationId).toBe(customId);

      delete process.env.CORRELATION_ID;
    });

    test('getAgentContext should extract from environment', () => {
      process.env.AGENT_ID = 'agent-123';
      process.env.AGENT_TYPE = 'backend-developer';
      process.env.TASK_ID = 'task-456';
      process.env.TEAM_NAME = 'platform';
      process.env.PROJECT_NAME = 'auth-service';

      const context = getAgentContext();

      expect(context).toMatchObject({
        agentId: 'agent-123',
        agentType: 'backend-developer',
        taskId: 'task-456',
        team: 'platform',
        project: 'auth-service',
      });
      expect(context.correlationId).toBeDefined();

      // Cleanup
      delete process.env.AGENT_ID;
      delete process.env.AGENT_TYPE;
      delete process.env.TASK_ID;
      delete process.env.TEAM_NAME;
      delete process.env.PROJECT_NAME;
    });

    test('getAgentContext should handle missing environment variables', () => {
      const context = getAgentContext();

      expect(context).toMatchObject({
        agentId: undefined,
        agentType: undefined,
        taskId: undefined,
        team: undefined,
        project: undefined,
      });
      expect(context.correlationId).toBeDefined();
    });
  });

  describe('Default Logger', () => {
    test('should use default logger instance', () => {
      logger.info('Default logger test');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry).toMatchObject({
        level: LogLevel.INFO,
        message: 'Default logger test',
      });
    });
  });

  describe('Log Levels', () => {
    test('should handle all log levels', () => {
      const testLogger = createLogger({ agentType: 'test' });

      testLogger.debug('Debug');
      testLogger.info('Info');
      testLogger.warn('Warn');
      testLogger.error('Error');
      testLogger.fatal('Fatal');

      expect(consoleLogSpy).toHaveBeenCalledTimes(5);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // FATAL only

      const levels = consoleLogSpy.mock.calls.map((call) => {
        const log = JSON.parse(call[0] as string);
        return log.level;
      });

      expect(levels).toEqual([
        LogLevel.DEBUG,
        LogLevel.INFO,
        LogLevel.WARN,
        LogLevel.ERROR,
        LogLevel.FATAL,
      ]);
    });
  });

  describe('Context Merging', () => {
    test('should merge context correctly', () => {
      const testLogger = createLogger({
        agentType: 'test',
        team: 'platform',
      });

      testLogger.info('Test message', {
        taskId: 'task-123',
        project: 'auth-service',
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.context).toMatchObject({
        agentType: 'test',
        team: 'platform',
        taskId: 'task-123',
        project: 'auth-service',
      });
    });

    test('should override default context with log context', () => {
      const testLogger = createLogger({
        agentType: 'original',
        team: 'platform',
      });

      testLogger.info('Test message', {
        agentType: 'override',
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.context.agentType).toBe('override');
      expect(logEntry.context.team).toBe('platform');
    });
  });
});
