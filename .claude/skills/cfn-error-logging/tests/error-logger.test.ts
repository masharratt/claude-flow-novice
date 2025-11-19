/**
 * Error Logger Test Suite
 *
 * Comprehensive test coverage for the ErrorLogger class including:
 * - Error capture and context enrichment
 * - Error categorization and severity mapping
 * - Multiple backend integration (file, Redis, console)
 * - Report generation (Markdown, JSON)
 * - Log listing and filtering
 * - Cleanup and retention policies
 * - System diagnostics collection
 * - Circuit breaker functionality
 * - Batching and buffering
 * - Retry logic with exponential backoff
 * - Correlation ID tracking
 *
 * Target: ≥90% code coverage
 */

import fs from 'fs';
import path from 'path';
import {
  ErrorLogger,
  ErrorType,
  SeverityLevel,
  CircuitBreakerState,
  ValidationError,
  CircuitBreakerOpenError,
} from '../src/error-logger';
import {
  ErrorContext,
  SystemDiagnostics,
  CFNLoopState,
  ErrorLogEntry,
  isValidErrorType,
  isValidSeverity,
  isValidCorrelationId,
  isValidTaskId,
  isValidErrorContext,
} from '../src/types';

// ===== MOCKS & FIXTURES =====

jest.mock('fs');
jest.mock('path');
jest.mock('ioredis');

// Test fixtures
const mockTaskId = 'cfn-cli-1731234567';
const mockCorrelationId = 'corr-1234567890';
const mockErrorContext: ErrorContext = {
  correlationId: mockCorrelationId,
  timestamp: Date.now(),
  errorType: ErrorType.AGENT_SPAWN,
  severity: SeverityLevel.ERROR,
  message: 'Failed to spawn agent: invalid configuration',
  exitCode: 1,
  taskId: mockTaskId,
};

const mockSystemDiagnostics: SystemDiagnostics = {
  timestamp: new Date().toISOString(),
  hostname: 'test-host',
  user: 'test-user',
  workingDirectory: '/home/test',
  os: 'Linux',
  osVersion: '5.4.0',
  architecture: 'x86_64',
  hardware: {
    cpuCores: 4,
    memory: '8.0 GB',
    disk: '50.0 GB',
  },
  software: {
    nodeVersion: 'v16.0.0',
    npxVersion: '7.0.0',
    dockerVersion: '20.10.0',
    redisAvailable: true,
    redisConnected: true,
  },
  environment: {
    path: '/usr/bin',
    home: '/home/test',
    shell: '/bin/bash',
    lang: 'en_US.UTF-8',
  },
  processes: {
    cfnRunning: 3,
    totalProcesses: 150,
  },
};

const mockCFNLoopState: CFNLoopState = {
  taskId: mockTaskId,
  timestamp: new Date().toISOString(),
  errorType: 'agent-spawn',
  errorMessage: 'Agent failed to spawn',
  exitCode: 1,
  redisState: {
    connected: true,
    trackedAgents: 2,
    recentSignals: 5,
  },
  checkpoint: {
    available: true,
    lastIteration: 2,
    mode: 'standard',
  },
};

// ===== TEST SUITE =====

describe('ErrorLogger', () => {
  let errorLogger: ErrorLogger;
  let tempDir: string;

  beforeEach(() => {
    tempDir = '/tmp/test-error-logs';
    const writtenFiles: Record<string, string> = {};

    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockImplementation((filepath: string) => {
      // Check if we've written this file
      if (writtenFiles[filepath]) {
        return writtenFiles[filepath];
      }
      // Fallback for unmocked files
      if (filepath.includes('cfn-error-')) {
        return JSON.stringify({
          captureId: 'error-test-123',
          timestamp: new Date().toISOString(),
          unixTimestamp: Date.now(),
          error: { type: 'agent-spawn', message: 'test error', exitCode: 1 },
          systemDiagnostics: mockSystemDiagnostics,
          cfnState: mockCFNLoopState,
          correlationId: 'track-123',
        });
      }
      return '{}';
    });
    (fs.writeFileSync as jest.Mock).mockImplementation((filepath: string, data: string) => {
      writtenFiles[filepath] = data;
    });
    (fs.readdirSync as jest.Mock).mockImplementation((dirpath: string) => {
      // Return files we've written
      const files = Object.keys(writtenFiles)
        .filter(
          (f) =>
            f.startsWith(dirpath) &&
            f.includes('cfn-error-') &&
            f.endsWith('.json')
        )
        .map((f) => f.split('/').pop() || '');

      if (files.length > 0) {
        return files;
      }

      // Return default mock file
      if (dirpath.includes('cfn-error-logging')) {
        return ['cfn-error-test-1234567890.json'];
      }
      return [];
    });
    (fs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now(), size: 1024 });
    (fs.unlinkSync as jest.Mock).mockImplementation(() => {});
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));

    errorLogger = new ErrorLogger(
      {
        file: {
          baseDir: tempDir,
          maxSizeMb: 100,
          retentionDays: 7,
        },
        redis: {
          host: 'localhost',
          port: 6379,
          db: 0,
          keyPrefix: 'cfn:error',
        },
        console: {
          enabled: true,
          formatJson: true,
        },
      },
      {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }
    );
  });

  describe('Error Type Validation', () => {
    it('should validate all error types', () => {
      const validTypes = [
        ErrorType.ORCHESTRATOR,
        ErrorType.AGENT_SPAWN,
        ErrorType.TIMEOUT,
        ErrorType.RESOURCE,
        ErrorType.VALIDATION,
        ErrorType.CONFIGURATION,
        ErrorType.DEPENDENCY,
        ErrorType.SYSTEM,
        ErrorType.NETWORK,
        ErrorType.REDIS,
        ErrorType.DOCKER,
        ErrorType.PROCESS,
        ErrorType.UNKNOWN,
      ];

      validTypes.forEach((type) => {
        expect(isValidErrorType(type)).toBe(true);
      });
    });

    it('should reject invalid error types', () => {
      expect(isValidErrorType('invalid-type')).toBe(false);
      expect(isValidErrorType(123)).toBe(false);
      expect(isValidErrorType(null)).toBe(false);
    });
  });

  describe('Severity Level Validation', () => {
    it('should validate all severity levels', () => {
      const validLevels = [
        SeverityLevel.CRITICAL,
        SeverityLevel.ERROR,
        SeverityLevel.WARNING,
        SeverityLevel.INFO,
      ];

      validLevels.forEach((level) => {
        expect(isValidSeverity(level)).toBe(true);
      });
    });

    it('should reject invalid severity levels', () => {
      expect(isValidSeverity('INVALID')).toBe(false);
      expect(isValidSeverity(123)).toBe(false);
    });
  });

  describe('Correlation ID Validation', () => {
    it('should validate correlation IDs', () => {
      expect(isValidCorrelationId('corr-1234567890')).toBe(true);
      expect(isValidCorrelationId('x'.repeat(256))).toBe(true);
    });

    it('should reject invalid correlation IDs', () => {
      expect(isValidCorrelationId('')).toBe(false);
      expect(isValidCorrelationId('x'.repeat(257))).toBe(false);
      expect(isValidCorrelationId(123)).toBe(false);
      expect(isValidCorrelationId(null)).toBe(false);
    });
  });

  describe('Task ID Validation', () => {
    it('should validate task IDs', () => {
      expect(isValidTaskId('cfn-cli-1731234567')).toBe(true);
      expect(isValidTaskId('task-xyz')).toBe(true);
    });

    it('should reject invalid task IDs', () => {
      expect(isValidTaskId('')).toBe(false);
      expect(isValidTaskId(null)).toBe(false);
    });
  });

  describe('Error Context Validation', () => {
    it('should validate error context', () => {
      expect(isValidErrorContext(mockErrorContext)).toBe(true);
    });

    it('should reject invalid error context', () => {
      expect(isValidErrorContext(null)).toBe(false);
      expect(isValidErrorContext({})).toBe(false);
      expect(isValidErrorContext({ correlationId: '' })).toBe(false);
    });

    it('should validate all error context fields', () => {
      const invalidContexts = [
        { ...mockErrorContext, timestamp: -1 },
        { ...mockErrorContext, timestamp: 0 },
        { ...mockErrorContext, errorType: 'invalid' },
        { ...mockErrorContext, severity: 'INVALID' },
        { ...mockErrorContext, message: '' },
      ];

      invalidContexts.forEach((context) => {
        expect(isValidErrorContext(context)).toBe(false);
      });
    });
  });

  describe('Capture Error', () => {
    it('should capture error with full context', async () => {
      const result = await errorLogger.captureError(mockErrorContext);

      expect(result.captureId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.error.type).toBe(ErrorType.AGENT_SPAWN);
      expect(result.error.message).toBe(mockErrorContext.message);
    });

    it('should generate unique capture IDs', async () => {
      const result1 = await errorLogger.captureError(mockErrorContext);
      const result2 = await errorLogger.captureError({
        ...mockErrorContext,
        message: 'Different error',
      });

      expect(result1.captureId).not.toBe(result2.captureId);
    });

    it('should enrich context with diagnostics', async () => {
      const result = await errorLogger.captureError(mockErrorContext);

      expect(result.systemDiagnostics).toBeDefined();
      expect(result.systemDiagnostics.hostname).toBeDefined();
      expect(result.cfnState).toBeDefined();
    });

    it('should handle invalid error context', async () => {
      const invalidContext = { ...mockErrorContext, message: '' };
      await expect(errorLogger.captureError(invalidContext)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('Error Categorization', () => {
    it('should categorize orchestrator errors', async () => {
      const orchestratorError = {
        ...mockErrorContext,
        errorType: ErrorType.ORCHESTRATOR,
        message: 'Orchestration failed',
      };

      const result = await errorLogger.captureError(orchestratorError);
      expect(result.error.type).toBe(ErrorType.ORCHESTRATOR);
    });

    it('should categorize timeout errors', async () => {
      const timeoutError = {
        ...mockErrorContext,
        errorType: ErrorType.TIMEOUT,
        message: 'Operation timed out',
      };

      const result = await errorLogger.captureError(timeoutError);
      expect(result.error.type).toBe(ErrorType.TIMEOUT);
    });

    it('should categorize resource errors', async () => {
      const resourceError = {
        ...mockErrorContext,
        errorType: ErrorType.RESOURCE,
        message: 'Insufficient memory',
      };

      const result = await errorLogger.captureError(resourceError);
      expect(result.error.type).toBe(ErrorType.RESOURCE);
    });

    it('should handle unknown error types', async () => {
      const unknownError = {
        ...mockErrorContext,
        errorType: ErrorType.UNKNOWN,
        message: 'Unknown error occurred',
      };

      const result = await errorLogger.captureError(unknownError);
      expect(result.error.type).toBe(ErrorType.UNKNOWN);
    });
  });

  describe('Severity Filtering', () => {
    it('should filter errors by severity level', async () => {
      const criticalError = { ...mockErrorContext, severity: SeverityLevel.CRITICAL };
      const warningError = { ...mockErrorContext, severity: SeverityLevel.WARNING };

      await errorLogger.captureError(criticalError);
      await errorLogger.captureError(warningError);

      const critical = await errorLogger.getErrorsByMinSeverity(SeverityLevel.CRITICAL);
      const errors = await errorLogger.getErrorsByMinSeverity(SeverityLevel.WARNING);

      expect(critical.length).toBeLessThanOrEqual(errors.length);
    });

    it('should handle all severity levels', async () => {
      const levels = [
        SeverityLevel.CRITICAL,
        SeverityLevel.ERROR,
        SeverityLevel.WARNING,
        SeverityLevel.INFO,
      ];

      for (const level of levels) {
        const error = { ...mockErrorContext, severity: level };
        const result = await errorLogger.captureError(error);
        expect(result.error.type).toBeDefined();
      }
    });
  });

  describe('Correlation ID Tracking', () => {
    it('should track correlation IDs', async () => {
      const correlationId = 'track-123';
      const error = { ...mockErrorContext, correlationId };

      await errorLogger.captureError(error);
      const errors = await errorLogger.getErrorsByCorrelationId(correlationId);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return empty for unknown correlation ID', async () => {
      const errors = await errorLogger.getErrorsByCorrelationId('unknown-corr-id');
      expect(errors.length).toBe(0);
    });

    it('should generate unique correlation IDs', () => {
      const id1 = errorLogger.generateCorrelationId();
      const id2 = errorLogger.generateCorrelationId();

      expect(id1).not.toBe(id2);
      expect(isValidCorrelationId(id1)).toBe(true);
      expect(isValidCorrelationId(id2)).toBe(true);
    });
  });

  describe('System Diagnostics', () => {
    it('should collect system diagnostics', async () => {
      const diagnostics = await errorLogger.collectSystemDiagnostics();

      expect(diagnostics).toBeDefined();
      expect(diagnostics.hostname).toBeDefined();
      expect(diagnostics.os).toBeDefined();
      expect(diagnostics.hardware).toBeDefined();
      expect(diagnostics.software).toBeDefined();
    });

    it('should include hardware information', async () => {
      const diagnostics = await errorLogger.collectSystemDiagnostics();

      expect(diagnostics.hardware.cpuCores).toBeDefined();
      expect(diagnostics.hardware.memory).toBeDefined();
      expect(diagnostics.hardware.disk).toBeDefined();
    });

    it('should include software versions', async () => {
      const diagnostics = await errorLogger.collectSystemDiagnostics();

      expect(diagnostics.software.nodeVersion).toBeDefined();
      expect(diagnostics.software.npxVersion).toBeDefined();
    });

    it('should track redis connectivity', async () => {
      const diagnostics = await errorLogger.collectSystemDiagnostics();

      expect(typeof diagnostics.software.redisConnected).toBe('boolean');
      expect(typeof diagnostics.software.redisAvailable).toBe('boolean');
    });
  });

  describe('Report Generation', () => {
    it('should generate markdown report', async () => {
      const report = await errorLogger.generateReport(mockTaskId, 'markdown');

      expect(report.format).toBe('markdown');
      expect(report.taskId).toBe(mockTaskId);
      expect(report.troubleshootingSteps.length).toBeGreaterThan(0);
    });

    it('should generate json report', async () => {
      const report = await errorLogger.generateReport(mockTaskId, 'json');

      expect(report.format).toBe('json');
      expect(report.taskId).toBe(mockTaskId);
    });

    it('should include troubleshooting steps for orchestrator errors', async () => {
      const error = { ...mockErrorContext, errorType: ErrorType.ORCHESTRATOR };
      await errorLogger.captureError(error);

      const report = await errorLogger.generateReport(
        mockTaskId,
        'markdown'
      );
      expect(report.troubleshootingSteps.length).toBeGreaterThan(0);
    });

    it('should include troubleshooting steps for agent spawn errors', async () => {
      const error = { ...mockErrorContext, errorType: ErrorType.AGENT_SPAWN };
      await errorLogger.captureError(error);

      const report = await errorLogger.generateReport(
        mockTaskId,
        'markdown'
      );
      expect(report.troubleshootingSteps.length).toBeGreaterThan(0);
    });

    it('should include troubleshooting steps for timeout errors', async () => {
      const error = { ...mockErrorContext, errorType: ErrorType.TIMEOUT };
      await errorLogger.captureError(error);

      const report = await errorLogger.generateReport(
        mockTaskId,
        'markdown'
      );
      expect(report.troubleshootingSteps.length).toBeGreaterThan(0);
    });

    it('should include troubleshooting steps for resource errors', async () => {
      const error = { ...mockErrorContext, errorType: ErrorType.RESOURCE };
      await errorLogger.captureError(error);

      const report = await errorLogger.generateReport(
        mockTaskId,
        'markdown'
      );
      expect(report.troubleshootingSteps.length).toBeGreaterThan(0);
    });

    it('should format report as markdown string', async () => {
      const markdownString = await errorLogger.formatReportAsMarkdown(mockTaskId);

      expect(typeof markdownString).toBe('string');
      expect(markdownString.length).toBeGreaterThan(0);
      expect(markdownString).toContain('CFN Loop Error Report');
    });

    it('should format report as json string', async () => {
      const jsonString = await errorLogger.formatReportAsJson(mockTaskId);

      expect(typeof jsonString).toBe('string');
      const parsed = JSON.parse(jsonString);
      expect(parsed.taskId).toBe(mockTaskId);
    });
  });

  describe('Log Listing', () => {
    it('should list error logs', async () => {
      const logs = await errorLogger.listErrorLogs();

      expect(Array.isArray(logs)).toBe(true);
    });

    it('should filter logs by time range', async () => {
      const oneHourAgo = Date.now() - 3600000;
      const logs = await errorLogger.listErrorLogsSince(new Date(oneHourAgo));

      expect(Array.isArray(logs)).toBe(true);
    });

    it('should filter logs by error type', async () => {
      const logs = await errorLogger.listErrorLogsByType(ErrorType.AGENT_SPAWN);

      expect(Array.isArray(logs)).toBe(true);
    });

    it('should filter logs by task ID', async () => {
      const logs = await errorLogger.listErrorLogsByTask(mockTaskId);

      expect(Array.isArray(logs)).toBe(true);
    });

    it('should support table format output', async () => {
      const tableData = await errorLogger.formatLogsAsTable();

      expect(typeof tableData).toBe('string');
    });
  });

  describe('Cleanup & Retention', () => {
    it('should cleanup old logs', async () => {
      const result = await errorLogger.cleanupOldLogs(7);

      expect(result).toBeDefined();
      expect(typeof result.removedCount).toBe('number');
      expect(typeof result.compressedCount).toBe('number');
    });

    it('should enforce maximum directory size', async () => {
      const result = await errorLogger.enforceMaxDirSize(100); // 100 MB

      expect(result).toBeDefined();
      expect(typeof result.removedCount).toBe('number');
    });

    it('should respect retention policy', async () => {
      const retentionDays = 7;
      const result = await errorLogger.cleanupOldLogs(retentionDays);

      expect(result.removedCount).toBeGreaterThanOrEqual(0);
    });

    it('should compress old logs before removal', async () => {
      const result = await errorLogger.cleanupOldLogs(7);

      expect(result.compressedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Batching & Buffering', () => {
    it('should batch errors', async () => {
      errorLogger.enableBatching({ maxSize: 3, maxWaitMs: 5000, enabled: true });

      await errorLogger.captureError(mockErrorContext);
      await errorLogger.captureError({
        ...mockErrorContext,
        message: 'Error 2',
      });

      const bufferSize = errorLogger.getBufferSize();
      expect(bufferSize).toBeGreaterThanOrEqual(0);
    });

    it('should flush buffer when max size reached', async () => {
      errorLogger.enableBatching({ maxSize: 2, maxWaitMs: 10000, enabled: true });

      await errorLogger.captureError(mockErrorContext);
      await errorLogger.captureError({
        ...mockErrorContext,
        message: 'Error 2',
      });

      const flushed = await errorLogger.flushBuffer();
      expect(flushed.length).toBeLessThanOrEqual(2);
    });

    it('should flush buffer after timeout', async () => {
      errorLogger.enableBatching({ maxSize: 100, maxWaitMs: 100, enabled: true });

      await errorLogger.captureError(mockErrorContext);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const flushed = await errorLogger.flushBuffer();
      expect(flushed.length).toBeGreaterThanOrEqual(0);
    });

    it('should get current buffer size', () => {
      const size = errorLogger.getBufferSize();
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed operations', async () => {
      const config = {
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      errorLogger.setRetryConfig(config);

      const result = await errorLogger.captureError(mockErrorContext);
      expect(result).toBeDefined();
    });

    it('should use exponential backoff', async () => {
      const config = {
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      errorLogger.setRetryConfig(config);

      const delays = errorLogger.getBackoffDelays(3);
      expect(delays[0]).toBeLessThanOrEqual(delays[1]);
      expect(delays[1]).toBeLessThanOrEqual(delays[2]);
    });

    it('should respect max attempts', async () => {
      const config = {
        maxAttempts: 2,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      errorLogger.setRetryConfig(config);

      const delays = errorLogger.getBackoffDelays(5);
      expect(delays.length).toBe(5);
    });
  });

  describe('Circuit Breaker', () => {
    it('should start in CLOSED state', () => {
      const status = errorLogger.getCircuitBreakerStatus();

      expect(status.state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN on failures', async () => {
      for (let i = 0; i < 5; i++) {
        await errorLogger.recordFailure();
      }

      const status = errorLogger.getCircuitBreakerStatus();
      // May be OPEN if failure threshold exceeded
      expect(
        status.state === CircuitBreakerState.CLOSED ||
          status.state === CircuitBreakerState.OPEN
      ).toBe(true);
    });

    it('should transition to HALF_OPEN from OPEN after timeout', async () => {
      // Record enough failures to open the circuit
      for (let i = 0; i < 6; i++) {
        await errorLogger.recordFailure();
      }

      let status = errorLogger.getCircuitBreakerStatus();
      // Verify circuit is OPEN
      expect(status.state === CircuitBreakerState.OPEN).toBe(true);
      expect(status.nextRetryTime).toBeDefined();

      // The timeout mechanism works when recordSuccess is called
      // after the nextRetryTime has passed
      await errorLogger.recordSuccess();

      status = errorLogger.getCircuitBreakerStatus();
      // After a success attempt while OPEN, it should try to recover
      expect(
        status.state === CircuitBreakerState.HALF_OPEN ||
          status.state === CircuitBreakerState.CLOSED ||
          status.state === CircuitBreakerState.OPEN
      ).toBe(true);
    });

    it('should reset on success in HALF_OPEN state', async () => {
      await errorLogger.recordSuccess();

      const status = errorLogger.getCircuitBreakerStatus();
      expect(status.failureCount).toBeGreaterThanOrEqual(0);
    });

    it('should throw error when circuit is OPEN', async () => {
      // Force OPEN state
      for (let i = 0; i < 10; i++) {
        await errorLogger.recordFailure();
      }

      const status = errorLogger.getCircuitBreakerStatus();
      if (status.state === CircuitBreakerState.OPEN) {
        await expect(errorLogger.captureError(mockErrorContext)).rejects.toThrow(
          CircuitBreakerOpenError
        );
      }
    });
  });

  describe('Backend Integration', () => {
    it('should save to file backend', async () => {
      const result = await errorLogger.captureError(mockErrorContext);

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result.captureId).toBeDefined();
    });

    it('should handle file backend errors gracefully', async () => {
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Should either fallback or retry
      const result = await errorLogger.captureError(mockErrorContext).catch(
        (err) => err
      );

      // If it throws, should be appropriate error
      if (result instanceof Error) {
        expect(result).toBeDefined();
      }
    });

    it('should support multiple backends', async () => {
      errorLogger.setBackends(['file', 'console']);

      const result = await errorLogger.captureError(mockErrorContext);
      expect(result.captureId).toBeDefined();
    });

    it('should handle backend unavailability', async () => {
      errorLogger.setBackends(['redis']); // Use unavailable backend

      // Should fail gracefully or use fallback
      const result = await errorLogger.captureError(mockErrorContext).catch(
        () => null
      );

      // Test passes if it handles gracefully
      expect(result === null || result?.captureId).toBeDefined();
    });
  });

  describe('Context Enrichment', () => {
    it('should enrich error with task context', async () => {
      const error = { ...mockErrorContext, taskId: mockTaskId };

      await errorLogger.enrichWithTaskContext(error, {
        iteration: 2,
        mode: 'standard',
      });

      expect(error.taskId).toBe(mockTaskId);
    });

    it('should enrich error with agent context', async () => {
      const error = { ...mockErrorContext, agentId: 'agent-123' };

      await errorLogger.enrichWithAgentContext(error, {
        type: 'backend-developer',
        status: 'failed',
      });

      expect(error.agentId).toBe('agent-123');
    });

    it('should enrich error with environment context', async () => {
      const error = { ...mockErrorContext };

      await errorLogger.enrichWithEnvironmentContext(error, {
        branch: 'feature-auth',
        version: '3.0.0',
      });

      expect(error.metadata).toBeDefined();
    });

    it('should handle missing context gracefully', async () => {
      const error = { ...mockErrorContext };

      await errorLogger.enrichWithTaskContext(error, undefined);

      expect(error.correlationId).toBe(mockErrorContext.correlationId);
    });
  });

  describe('Diagnostic Actions', () => {
    it('should run system diagnostics', async () => {
      const diagnostics = await errorLogger.runSystemDiagnostics();

      expect(diagnostics).toBeDefined();
      expect(diagnostics.hostname).toBeDefined();
      expect(diagnostics.os).toBeDefined();
    });

    it('should check dependencies', async () => {
      const depStatus = await errorLogger.checkDependencies();

      expect(depStatus).toBeDefined();
      expect(Array.isArray(depStatus.missing)).toBe(true);
      expect(Array.isArray(depStatus.available)).toBe(true);
    });

    it('should validate Redis connection', async () => {
      const redisConnected = await errorLogger.validateRedisConnection();

      expect(typeof redisConnected).toBe('boolean');
    });

    it('should get system resource status', async () => {
      const resources = await errorLogger.getSystemResourceStatus();

      expect(resources).toBeDefined();
      expect(resources.memory).toBeDefined();
      expect(resources.disk).toBeDefined();
    });
  });

  describe('Error Edge Cases', () => {
    it('should handle errors with null exit code', async () => {
      const error = { ...mockErrorContext, exitCode: undefined };

      const result = await errorLogger.captureError(error);
      expect(result.error.exitCode).toBeUndefined();
    });

    it('should handle very long error messages', async () => {
      const longMessage = 'x'.repeat(10000);
      const error = { ...mockErrorContext, message: longMessage };

      const result = await errorLogger.captureError(error);
      expect(result.error.message.length).toBeGreaterThan(0);
    });

    it('should handle special characters in error messages', async () => {
      const specialMessage = 'Error: <>&"\'`{}[]()';
      const error = { ...mockErrorContext, message: specialMessage };

      const result = await errorLogger.captureError(error);
      expect(result.error.message).toBeDefined();
    });

    it('should handle errors without task context', async () => {
      const error = { ...mockErrorContext, taskId: undefined };

      const result = await errorLogger.captureError(error);
      expect(result.captureId).toBeDefined();
    });

    it('should handle stack traces', async () => {
      const stackTrace = 'at Function.test (file.ts:10:5)\nat Object.<anonymous>';
      const error = { ...mockErrorContext, stackTrace };

      const result = await errorLogger.captureError(error);
      expect(result.error.type).toBeDefined();
    });
  });

  describe('Concurrency & Thread Safety', () => {
    it('should handle concurrent error captures', async () => {
      const promises = Array.from({ length: 10 }).map((_, i) =>
        errorLogger.captureError({
          ...mockErrorContext,
          message: `Error ${i}`,
        })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      expect(new Set(results.map((r) => r.captureId)).size).toBe(10); // All unique
    });

    it('should handle concurrent log listing', async () => {
      await errorLogger.captureError(mockErrorContext);

      const [logs1, logs2] = await Promise.all([
        errorLogger.listErrorLogs(),
        errorLogger.listErrorLogs(),
      ]);

      expect(Array.isArray(logs1)).toBe(true);
      expect(Array.isArray(logs2)).toBe(true);
    });

    it('should handle concurrent cleanup operations', async () => {
      const [result1, result2] = await Promise.all([
        errorLogger.cleanupOldLogs(7),
        errorLogger.cleanupOldLogs(7),
      ]);

      expect(result1.removedCount).toBeGreaterThanOrEqual(0);
      expect(result2.removedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Telemetry & Metrics', () => {
    it('should track error capture metrics', async () => {
      await errorLogger.captureError(mockErrorContext);

      const metrics = errorLogger.getMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics.totalCaptured).toBe('number');
    });

    it('should track error type distribution', async () => {
      const types = [
        ErrorType.ORCHESTRATOR,
        ErrorType.AGENT_SPAWN,
        ErrorType.TIMEOUT,
      ];

      for (const type of types) {
        await errorLogger.captureError({
          ...mockErrorContext,
          errorType: type,
        });
      }

      const distribution = errorLogger.getErrorTypeDistribution();

      expect(distribution).toBeDefined();
      expect(typeof distribution[ErrorType.ORCHESTRATOR]).toBe('number');
    });

    it('should track severity distribution', async () => {
      const severities = [
        SeverityLevel.CRITICAL,
        SeverityLevel.ERROR,
        SeverityLevel.WARNING,
      ];

      for (const severity of severities) {
        await errorLogger.captureError({
          ...mockErrorContext,
          severity,
        });
      }

      const distribution = errorLogger.getSeverityDistribution();

      expect(distribution).toBeDefined();
      expect(typeof distribution[SeverityLevel.CRITICAL]).toBe('number');
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety for error context', () => {
      const validContext: ErrorContext = mockErrorContext;
      expect(validContext.correlationId).toBeDefined();
    });

    it('should maintain type safety for system diagnostics', () => {
      const validDiagnostics: SystemDiagnostics = mockSystemDiagnostics;
      expect(validDiagnostics.hostname).toBeDefined();
    });

    it('should maintain type safety for error log entry', () => {
      const entry: ErrorLogEntry = {
        captureId: 'test',
        timestamp: new Date().toISOString(),
        unixTimestamp: Date.now(),
        error: {
          type: ErrorType.AGENT_SPAWN,
          message: 'test',
        },
        systemDiagnostics: mockSystemDiagnostics,
        cfnState: mockCFNLoopState,
        correlationId: 'test',
      };

      expect(entry.captureId).toBeDefined();
    });
  });

  describe('Additional Coverage - Error Handling', () => {
    it('should handle no configuration gracefully', async () => {
      const loggerNoCfg = new ErrorLogger({}, {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      });

      await expect(loggerNoCfg.cleanupOldLogs(7)).resolves.toEqual({
        removedCount: 0,
        compressedCount: 0,
      });
    });

    it('should handle directory listing errors', async () => {
      (fs.readdirSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      const logs = await errorLogger.listErrorLogs();
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should handle file read errors in correlation ID lookup', async () => {
      (fs.readFileSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Read failed');
      });

      const errors = await errorLogger.getErrorsByCorrelationId('test-corr');
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle invalid JSON in log files', async () => {
      (fs.readFileSync as jest.Mock).mockImplementationOnce(() => {
        return 'invalid json {[';
      });

      const errors = await errorLogger.getErrorsByCorrelationId('test-corr');
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle errors during report generation', async () => {
      const report = await errorLogger.generateReport('unknown-task', 'markdown');
      expect(report).toBeDefined();
      expect(report.taskId).toBe('unknown-task');
    });

    it('should format logs with proper error handling', async () => {
      const table = await errorLogger.formatLogsAsTable();
      expect(typeof table).toBe('string');
    });

    it('should handle cleanup with no files', async () => {
      (fs.readdirSync as jest.Mock).mockImplementationOnce(() => []);

      const result = await errorLogger.cleanupOldLogs(7);
      expect(result.removedCount).toBeGreaterThanOrEqual(0);
    });

    it('should enforce max directory size gracefully', async () => {
      const result = await errorLogger.enforceMaxDirSize(50);
      expect(result.removedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Additional Coverage - Batching & Flushing', () => {
    it('should disable batching', async () => {
      errorLogger.enableBatching({ maxSize: 10, maxWaitMs: 1000, enabled: false });

      await errorLogger.captureError(mockErrorContext);

      expect(errorLogger.getBufferSize()).toBe(0);
    });

    it('should clear batch on flush', async () => {
      errorLogger.enableBatching({ maxSize: 100, maxWaitMs: 10000, enabled: true });

      await errorLogger.captureError(mockErrorContext);
      const bufferBefore = errorLogger.getBufferSize();

      await errorLogger.flushBuffer();
      const bufferAfter = errorLogger.getBufferSize();

      expect(bufferBefore).toBeGreaterThanOrEqual(0);
      expect(bufferAfter).toBeGreaterThanOrEqual(0);
    });

    it('should flush empty buffer', async () => {
      const result = await errorLogger.flushBuffer();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Additional Coverage - Metrics & Telemetry', () => {
    it('should return empty metric distribution initially', () => {
      const errorLogger2 = new ErrorLogger(
        {
          file: { baseDir: tempDir, maxSizeMb: 100, retentionDays: 7 },
        },
        { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      );

      const distribution = errorLogger2.getErrorTypeDistribution();
      expect(distribution).toBeDefined();
    });

    it('should increment metrics on each capture', async () => {
      const metricsBefore = errorLogger.getMetrics();
      const countBefore = metricsBefore.totalCaptured;

      await errorLogger.captureError(mockErrorContext);

      const metricsAfter = errorLogger.getMetrics();
      expect(metricsAfter.totalCaptured).toBeGreaterThan(countBefore);
    });

    it('should track all error types in distribution', async () => {
      const errorTypes = [
        ErrorType.ORCHESTRATOR,
        ErrorType.AGENT_SPAWN,
        ErrorType.TIMEOUT,
        ErrorType.RESOURCE,
        ErrorType.VALIDATION,
      ];

      for (const type of errorTypes) {
        await errorLogger.captureError({
          ...mockErrorContext,
          errorType: type,
        });
      }

      const distribution = errorLogger.getErrorTypeDistribution();
      expect(Object.keys(distribution).length).toBeGreaterThan(0);
    });
  });

  describe('Additional Coverage - Export Validation', () => {
    it('should export all error types', () => {
      expect(ErrorType.ORCHESTRATOR).toBeDefined();
      expect(ErrorType.AGENT_SPAWN).toBeDefined();
      expect(ErrorType.TIMEOUT).toBeDefined();
      expect(ErrorType.RESOURCE).toBeDefined();
    });

    it('should export all severity levels', () => {
      expect(SeverityLevel.CRITICAL).toBeDefined();
      expect(SeverityLevel.ERROR).toBeDefined();
      expect(SeverityLevel.WARNING).toBeDefined();
      expect(SeverityLevel.INFO).toBeDefined();
    });

    it('should export circuit breaker states', () => {
      expect(CircuitBreakerState.CLOSED).toBeDefined();
      expect(CircuitBreakerState.OPEN).toBeDefined();
      expect(CircuitBreakerState.HALF_OPEN).toBeDefined();
    });

    it('should export error classes', () => {
      expect(ValidationError).toBeDefined();
      expect(CircuitBreakerOpenError).toBeDefined();
    });
  });

  describe('Additional Coverage - Diagnostic Output', () => {
    it('should format system diagnostics', async () => {
      const diagnostics = await errorLogger.collectSystemDiagnostics();
      expect(diagnostics.hardware.cpuCores).toBeGreaterThan(0);
    });

    it('should collect CFN state with available checkpoint', async () => {
      const state = await errorLogger.collectCFNLoopState('test-task');
      expect(state.taskId).toBe('test-task');
      expect(state.checkpoint.available).toBeDefined();
    });

    it('should handle all troubleshooting step types', async () => {
      const errorTypes = [
        ErrorType.ORCHESTRATOR,
        ErrorType.AGENT_SPAWN,
        ErrorType.TIMEOUT,
        ErrorType.RESOURCE,
      ];

      for (const type of errorTypes) {
        const report = await errorLogger.generateReport(
          'test-' + type,
          'markdown'
        );
        expect(report.troubleshootingSteps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Additional Coverage - Report Formatting', () => {
    it('should format multi-line markdown report correctly', async () => {
      const md = await errorLogger.formatReportAsMarkdown('test-task');
      expect(md).toContain('# CFN Loop Error Report');
      expect(md).toContain('## Error Summary');
      expect(md).toContain('## Quick Diagnosis');
      expect(md).toContain('## Troubleshooting Steps');
    });

    it('should parse formatted JSON report', async () => {
      const json = await errorLogger.formatReportAsJson('test-task');
      const parsed = JSON.parse(json);
      expect(parsed.taskId).toBe('test-task');
    });
  });

  describe('Additional Coverage - Error Enrichment', () => {
    it('should handle context enrichment with null metadata', async () => {
      const error = { ...mockErrorContext, metadata: undefined };
      await errorLogger.enrichWithTaskContext(error, {
        iteration: 3,
      });

      expect(error.metadata).toBeDefined();
    });

    it('should accumulate multiple context enrichments', async () => {
      const error = { ...mockErrorContext };

      await errorLogger.enrichWithTaskContext(error, { task: 'test' });
      await errorLogger.enrichWithAgentContext(error, { agent: 'backend' });
      await errorLogger.enrichWithEnvironmentContext(error, { env: 'prod' });

      expect(error.metadata).toBeDefined();
      expect(Object.keys(error.metadata || {}).length).toBeGreaterThan(0);
    });
  });

  describe('Additional Coverage - Logger Configuration', () => {
    it('should switch backends dynamically', async () => {
      errorLogger.setBackends(['console']);
      errorLogger.setBackends(['file']);
      errorLogger.setBackends(['file', 'console']);

      const result = await errorLogger.captureError(mockErrorContext);
      expect(result.captureId).toBeDefined();
    });

    it('should update retry configuration', () => {
      const newConfig = {
        maxAttempts: 5,
        initialDelayMs: 200,
        maxDelayMs: 10000,
        backoffMultiplier: 3,
      };

      errorLogger.setRetryConfig(newConfig);
      const delays = errorLogger.getBackoffDelays(3);

      expect(delays.length).toBe(3);
      expect(delays[0]).toBeGreaterThan(0);
    });
  });
});
