/**
 * Test suite for GitHub CLI Safety Wrapper
 *
 * Tests all security features, error handling, and functionality
 */

import { jest } from '@jest/globals';
import {
  GitHubCliSafe,
  createGitHubCliSafe,
  githubCli,
  GitHubCliError,
  GitHubCliTimeoutError,
  GitHubCliValidationError,
  GitHubCliRateLimitError,
} from '../github-cli-safety-wrapper.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

// Mock child_process and fs
jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

describe('GitHubCliSafe', () => {
  let ghSafe;
  let mockSpawn;
  let mockChild;

  beforeEach(() => {
    ghSafe = new GitHubCliSafe({
      timeout: 5000,
      enableRateLimit: false,
      enableLogging: false,
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    mockChild = {
      kill: jest.fn(),
      on: jest.fn(),
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
    };

    mockSpawn = spawn.mockReturnValue(mockChild);
    fs.writeFile.mockResolvedValue();
    fs.unlink.mockResolvedValue();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(() => {
    jest.clearAllMocks();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Input Validation', () => {
    jest.setTimeout(10000);
  test('should validate allowed commands', () => {
      expect(() => ghSafe.validateCommand('issue create')).not.toThrow();
      expect(() => ghSafe.validateCommand('pr comment')).not.toThrow();

      expect(() => ghSafe.validateCommand('rm -rf /')).toThrow(GitHubCliValidationError);
      expect(() => ghSafe.validateCommand('maliciouscommand')).toThrow(GitHubCliValidationError);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should reject empty or invalid commands', () => {
      expect(() => ghSafe.validateCommand('')).toThrow(GitHubCliValidationError);
      expect(() => ghSafe.validateCommand(null)).toThrow(GitHubCliValidationError);
      expect(() => ghSafe.validateCommand(undefined)).toThrow(GitHubCliValidationError);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should sanitize dangerous input patterns', () => {
      const dangerousInputs = [
        '$(rm -rf /)',
        '`rm -rf /`',
        'test && rm -rf /',
        'test || rm -rf /',
        'test; rm -rf /',
        'test <(echo malicious)',
        'test > /dev/null',
        'test | sh',
        'eval("malicious")',
        'exec("malicious")',
      ];

      dangerousInputs.forEach((input) => {
        expect(() => ghSafe.sanitizeInput(input)).toThrow(GitHubCliValidationError);
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should allow safe input', () => {
      const safeInputs = [
        'This is a normal comment',
        'Code example: console.log("hello")',
        'File path: /src/components/Button.jsx',
        'Numbers: 123, versions: v1.2.3',
        'Special chars: @#$%^&*()_+-=[]{}|;:,.<>?',
      ];

      safeInputs.forEach((input) => {
        expect(() => ghSafe.sanitizeInput(input)).not.toThrow();
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should validate body size limits', () => {
      const largeBody = 'x'.repeat(1024 * 1024 + 1); // > 1MB
      expect(() => ghSafe.validateBodySize(largeBody)).toThrow(GitHubCliValidationError);

      const normalBody = 'x'.repeat(1000);
      expect(() => ghSafe.validateBodySize(normalBody)).not.toThrow();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Process Management', () => {
    jest.setTimeout(10000);
  test('should spawn process with correct arguments', async () => { try {
      const mockProcess = setupMockProcess(0, 'success', '');

      await ghSafe.execute('issue create', {
        title: 'Test Issue',
        body: 'Test body',
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(spawn).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['issue', 'create', '--title', 'Test Issue']),
        expect.objectContaining({
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
        }),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle process timeout', async () => { try {
      setupMockProcess(null, '', '', true); // Never completes

      await expect(ghSafe.execute('issue create', { title: 'Test' })).rejects.toThrow(
        GitHubCliTimeoutError,
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle process failure', async () => { try {
      setupMockProcess(1, '', 'Command failed');

      await expect(ghSafe.execute('issue create', { title: 'Test' })).rejects.toThrow(
        GitHubCliError,
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should cleanup processes on timeout', async () => { try {
      setupMockProcess(null, '', '', true); // Never completes

      try {
        await ghSafe.execute('issue create', { title: 'Test' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      } catch (error) {
        expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Retry Logic', () => {
    jest.setTimeout(10000);
  test('should retry on transient failures', async () => { try {
      let attemptCount = 0;
      const operation = jest.fn(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new GitHubCliError('Transient error');
        }
        return { success: true };
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const result = await ghSafe.withRetry(operation, 3);
      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(3);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should not retry validation errors', async () => { try {
      const operation = jest.fn(() => {
        throw new GitHubCliValidationError('Invalid input');
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await expect(ghSafe.withRetry(operation, 3)).rejects.toThrow(GitHubCliValidationError);
      expect(operation).toHaveBeenCalledTimes(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should not retry rate limit errors', async () => { try {
      const operation = jest.fn(() => {
        throw new GitHubCliRateLimitError('Rate limited');
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await expect(ghSafe.withRetry(operation, 3)).rejects.toThrow(GitHubCliRateLimitError);
      expect(operation).toHaveBeenCalledTimes(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Rate Limiting', () => {
    jest.setTimeout(10000);
  test('should enforce rate limits', async () => { try {
      const rateLimitedGh = new GitHubCliSafe({
        enableRateLimit: true,
        maxRequestsPerWindow: 2,
        rateLimitWindow: 1000,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Mock successful executions
      setupMockProcess(0, 'success', '');

      // First two requests should succeed
      await rateLimitedGh.execute('auth status');
      await rateLimitedGh.execute('auth status');

      // Third request should be rate limited
      await expect(rateLimitedGh.execute('auth status')).rejects.toThrow(GitHubCliRateLimitError);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Temp File Handling', () => {
    jest.setTimeout(10000);
  test('should create secure temp files for body content', async () => { try {
      setupMockProcess(0, 'success', '');

      await ghSafe.execute('issue create', {
        title: 'Test',
        body: 'Test body',
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/gh-safe-.*\.tmp$/),
        'Test body',
        { mode: 0o600 },
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should cleanup temp files even on error', async () => { try {
      setupMockProcess(1, '', 'Error');

      try {
        await ghSafe.execute('issue create', {
          title: 'Test',
          body: 'Test body',
        } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      } catch (error) {
        // Expected to fail
      }

      expect(fs.unlink).toHaveBeenCalled();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('High-level Operations', () => {
    beforeEach(() => {
      setupMockProcess(0, 'Issue created successfully', '');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should create issue with proper arguments', async () => { try {
      await ghSafe.createIssue({
        title: 'Bug Report',
        body: 'Found a bug',
        labels: ['bug', 'high-priority'],
        assignees: ['user1', 'user2'],
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(spawn).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'issue',
          'create',
          '--title',
          'Bug Report',
          '--body-file',
          expect.stringMatching(/gh-safe-.*\.tmp$/),
          '--label',
          'bug,high-priority',
          '--assignee',
          'user1,user2',
        ]),
        expect.any(Object),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should create PR with proper arguments', async () => { try {
      await ghSafe.createPR({
        title: 'Feature: Add new component',
        body: 'Adds new component',
        base: 'develop',
        head: 'feature/new-component',
        draft: true,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(spawn).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'pr',
          'create',
          '--title',
          'Feature: Add new component',
          '--body-file',
          expect.stringMatching(/gh-safe-.*\.tmp$/),
          '--base',
          'develop',
          '--head',
          'feature/new-component',
          '--draft',
        ]),
        expect.any(Object),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should add issue comment', async () => { try {
      await ghSafe.addIssueComment(123, 'This is a comment');

      expect(spawn).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'issue',
          'comment',
          '123',
          '--body-file',
          expect.stringMatching(/gh-safe-.*\.tmp$/),
        ]),
        expect.any(Object),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Utility Methods', () => {
    jest.setTimeout(10000);
  test('should check GitHub CLI availability', async () => { try {
      // Mock execSync for version check
      const { execSync } = require('child_process');
      jest.spyOn(require('child_process'), 'execSync').mockImplementation(() => 'gh version 2.0.0');

      const isAvailable = await ghSafe.checkGitHubCli();
      expect(isAvailable).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should get stats', () => {
      const stats = ghSafe.getStats();
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('successfulRequests');
      expect(stats).toHaveProperty('failedRequests');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should cleanup active processes', async () => { try {
      ghSafe.activeProcesses.set('test-process', mockChild);

      await ghSafe.cleanup();

      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
      expect(ghSafe.activeProcesses.size).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Factory Function', () => {
    jest.setTimeout(10000);
  test('should create configured instance', () => {
      const instance = createGitHubCliSafe({
        timeout: 10000,
        maxRetries: 5,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(instance).toBeInstanceOf(GitHubCliSafe);
      expect(instance.options.timeout).toBe(10000);
      expect(instance.options.maxRetries).toBe(5);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Singleton Instance', () => {
    jest.setTimeout(10000);
  test('should provide default singleton', () => {
      expect(githubCli).toBeInstanceOf(GitHubCliSafe);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  // Helper function to setup mock process behavior
  function setupMockProcess(exitCode, stdout = '', stderr = '', neverComplete = false) {
    let closeCallback, errorCallback;
    let stdoutCallback, stderrCallback;

    mockChild.on.mockImplementation((event, callback) => {
      if (event === 'close') closeCallback = callback;
      if (event === 'error') errorCallback = callback;
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    mockChild.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') stdoutCallback = callback;
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    mockChild.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') stderrCallback = callback;
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    // Simulate process execution
    if (!neverComplete) {
      setTimeout(() => {
        if (stdoutCallback && stdout) stdoutCallback(Buffer.from(stdout));
        if (stderrCallback && stderr) stderrCallback(Buffer.from(stderr));
        if (closeCallback) closeCallback(exitCode);
      }, 10);
    }
  }
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

describe('Error Classes', () => {
  jest.setTimeout(10000);
  test('GitHubCliError should contain proper details', () => {
    const error = new GitHubCliError('Test error', 'TEST_CODE', { test: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    expect(error.name).toBe('GitHubCliError');
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toEqual({ test: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    expect(error.timestamp).toBeDefined();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('GitHubCliTimeoutError should extend GitHubCliError', () => {
    const error = new GitHubCliTimeoutError(5000, 'gh issue create');

    expect(error).toBeInstanceOf(GitHubCliError);
    expect(error.name).toBe('GitHubCliTimeoutError');
    expect(error.code).toBe('TIMEOUT');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('GitHubCliValidationError should contain field info', () => {
    const error = new GitHubCliValidationError('Invalid field', 'testField', 'testValue');

    expect(error.name).toBe('GitHubCliValidationError');
    expect(error.details.field).toBe('testField');
    expect(error.details.value).toBe('testValue');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
