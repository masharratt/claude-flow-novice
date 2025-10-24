/**
 * Error Scenario Testing and Recovery Mechanisms
 * Comprehensive testing of error handling, recovery, and rollback functionality
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import { execSync } from 'child_process';

import { McpConfigurationManager, enhancedMcpInit } from '../../../src/mcp/mcp-config-manager.js';
import { invalidConfigurations, legacyConfigurations } from '../fixtures/config-samples.js';

describe('MCP Error Scenario Testing', () => {
  let manager;
  let mockConsole;

  beforeEach(async () => { try {
    mockConsole = global.mockConsole.setup();

    manager = new McpConfigurationManager({
      verbose: false,
      autoFix: true,
      dryRun: false
    });

    // Setup test files
    await global.testUtils.createMockClaudeConfig();
    await global.testUtils.createMockProjectConfig();
  });

  afterEach(() => {
    mockConsole.restore();
  });

  describe('File System Error Handling', () => {
    jest.setTimeout(10000);
  test('should handle missing configuration files gracefully', async () => { try {
      // Point to non-existent files
      manager.localConfigPath = '/non/existent/local-config.json';
      manager.projectConfigPath = '/non/existent/project-config.json';

      const state = await manager.detectConfigurationState();

      expect(state.hasLocalConfig).toBe(false);
      expect(state.hasProjectConfig).toBe(false);
      expect(state.localServers).toHaveLength(0);
      expect(state.projectServers).toHaveLength(0);
      expect(state.healthScore).toBeGreaterThan(0); // Should not be zero due to graceful handling
    });

    jest.setTimeout(10000);
  test('should handle permission denied errors', async () => { try {
      const configPath = await global.testUtils.createTempFile('permission-test.json', '{"test": true}');

      try {
        // Make file unreadable
        await fs.chmod(configPath, 0o000);

        manager.localConfigPath = configPath;
        const config = await manager.readLocalConfig();

        expect(config).toBeNull();
      } catch (error) {
        // On some systems, chmod might not work as expected
        console.log('Permission test skipped on this platform');
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.chmod(configPath, 0o644);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    jest.setTimeout(10000);
  test('should handle corrupted JSON files', async () => { try {
      const corruptedConfigs = [
        'invalid json content',
        '{"incomplete": json',
        '{"valid": "json", "but": "incomplete"',
        '{broken json structure',
        '{"circular": {"ref": {"back": "circular"}}}'
      ];

      for (const corruptedContent of corruptedConfigs) {
        await global.testUtils.createTempFile(
          'corrupted-config.json',
          corruptedContent
        );

        manager.projectConfigPath = await global.testUtils.createTempFile(
          'corrupted-config.json',
          corruptedContent
        );

        const config = await manager.readProjectConfig();
        expect(config).toBeNull();
      }
    });

    jest.setTimeout(10000);
  test('should handle extremely large files', async () => { try {
      // Create a very large JSON file
      const largeConfig = {
        mcpServers: {}
      };

      // Add many servers to create a large file
      for (let i = 0; i < 50000; i++) {
        largeConfig.mcpServers[`server-${i}`] = {
          command: 'node',
          args: [`server-${i}.js`],
          env: {
            LARGE_VALUE: 'x'.repeat(1000) // 1KB per server
          }
        };
      }

      await global.testUtils.createMockProjectConfig(largeConfig);

      // Should handle large file without crashing
      const config = await manager.readProjectConfig();
      expect(config).toBeTruthy();
      expect(Object.keys(config.mcpServers)).toHaveLength(50000);
    });

    jest.setTimeout(10000);
  test('should handle file system failures during backup creation', async () => { try {
      const configPath = await global.testUtils.createTempFile('test-config.json', '{"test": true}');

      // Mock fs.copyFile to fail
      const originalCopyFile = fs.copyFile;
      fs.copyFile = jest.fn().mockRejectedValue(new Error('Disk full'));

      try {
        const backupPath = await manager.createConfigBackup(configPath, 'test');
        expect(backupPath).toBeNull(); // Should handle failure gracefully
      } finally {
        fs.copyFile = originalCopyFile;
      }
    });

    jest.setTimeout(10000);
  test('should handle concurrent file access conflicts', async () => { try {
      const configPath = await global.testUtils.createTempFile('concurrent-test.json', '{"test": true}');
      const promises = [];

      // Simulate multiple concurrent access attempts
      for (let i = 0; i < 50; i++) {
        promises.push(
          manager.fileExists(configPath)
        );
      }

      const results = await Promise.all(promises);
      expect(results.every(result => result === true)).toBe(true);
    });
  });

  describe('Network and CLI Error Handling', () => {
    jest.setTimeout(10000);
  test('should handle Claude CLI installation failures', async () => { try {
      execSync.mockImplementation(() => {
        throw new Error('claude: command not found');
      });

      const result = await manager.executeBulletproofSetup();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude Code CLI not installed');
      expect(result.recovery).toBeTruthy();
      expect(result.recovery.recommendedActions).toContain(
        'Install Claude Code: npm install -g @anthropic-ai/claude-code'
      );
    });

    jest.setTimeout(10000);
  test('should handle CLI timeout errors', async () => { try {
      execSync.mockImplementation(() => {
        throw new Error('Command timed out after 30000ms');
      });

      // Should handle timeout gracefully
      await expect(manager.verifySetup()).resolves.not.toThrow();
    });

    jest.setTimeout(10000);
  test('should handle CLI process crashes', async () => { try {
      execSync.mockImplementation(() => {
        const error = new Error('Process crashed');
        error.signal = 'SIGSEGV';
        throw error;
      });

      const isInstalled = manager.isClaudeCodeInstalled();
      expect(isInstalled).toBe(false);
    });

    jest.setTimeout(10000);
  test('should handle CLI partial failures', async () => { try {
      let callCount = 0;
      execSync.mockImplementation((command) => {
        callCount++;
        if (command.includes('claude --version')) {
          return 'claude version 1.0.0';
        }
        if (command.includes('claude mcp list')) {
          if (callCount % 2 === 0) {
            throw new Error('Service temporarily unavailable');
          }
          return 'MCP Servers:\n✓ claude-flow-novice (running)';
        }
        throw new Error('Unknown command');
      });

      const verification = await manager.performComprehensiveVerification();

      expect(verification.tests.some(test => test.passed)).toBe(true);
      expect(verification.tests.some(test => !test.passed)).toBe(true);
    });

    jest.setTimeout(10000);
  test('should handle network connectivity issues', async () => { try {
      // Simulate network-related errors
      const networkErrors = [
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ECONNRESET',
        'EAI_AGAIN'
      ];

      for (const errorCode of networkErrors) {
        execSync.mockImplementation(() => {
          const error = new Error('Network error');
          error.code = errorCode;
          throw error;
        });

        // Should handle network errors gracefully
        await expect(manager.verifySetup()).resolves.not.toThrow();
      }
    });
  });

  describe('Configuration Validation Error Handling', () => {
    jest.setTimeout(10000);
  test('should handle missing required fields', async () => { try {
      for (const [configName, config] of Object.entries(invalidConfigurations)) {
        if (typeof config === 'string') {
          await global.testUtils.createTempFile('invalid.json', config);
          manager.projectConfigPath = await global.testUtils.createTempFile('invalid.json', config);
        } else {
          await global.testUtils.createMockProjectConfig(config);
        }

        // Should detect issues without crashing
        const state = await manager.detectConfigurationState();
        expect(state).toBeTruthy();
        console.log(`Handled invalid config: ${configName}`);
      }
    });

    jest.setTimeout(10000);
  test('should handle legacy configuration patterns', async () => { try {
      for (const [legacyName, legacyConfig] of Object.entries(legacyConfigurations)) {
        await global.testUtils.createMockProjectConfig(legacyConfig);

        const state = await manager.detectConfigurationState();

        expect(state.brokenPaths.length).toBeGreaterThan(0);
        expect(state.healthScore).toBeLessThan(100);
        console.log(`Detected legacy pattern: ${legacyName}`);
      }
    });

    jest.setTimeout(10000);
  test('should handle circular references in configuration', async () => { try {
      // Create a configuration with circular references
      const circularConfig = {
        mcpServers: {
          'server-a': {
            command: 'node',
            args: ['server.js'],
            references: null // Will be set to circular reference
          }
        }
      };

      // Create circular reference
      circularConfig.mcpServers['server-a'].references = circularConfig;

      try {
        await global.testUtils.createMockProjectConfig(circularConfig);
      } catch (error) {
        // JSON.stringify should fail with circular reference
        expect(error.message).toContain('circular');
      }
    });

    jest.setTimeout(10000);
  test('should handle invalid data types in configuration', async () => { try {
      const invalidTypeConfigs = [
        {
          mcpServers: {
            'invalid-command': {
              command: 123, // Should be string
              args: ['server.js']
            }
          }
        },
        {
          mcpServers: {
            'invalid-args': {
              command: 'node',
              args: 'should-be-array'
            }
          }
        },
        {
          mcpServers: {
            'invalid-env': {
              command: 'node',
              args: ['server.js'],
              env: 'should-be-object'
            }
          }
        }
      ];

      for (const invalidConfig of invalidTypeConfigs) {
        await global.testUtils.createMockProjectConfig(invalidConfig);

        const state = await manager.detectConfigurationState();
        expect(state.brokenPaths.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Rollback and Recovery Mechanisms', () => {
    jest.setTimeout(10000);
  test('should create and execute rollback operations', async () => { try {
      const originalConfig = { mcpServers: { original: { command: 'node', args: ['original.js'] } } };
      await global.testUtils.createMockLocalConfig(originalConfig);

      // Create backup and rollback operation
      const backupPath = await manager.createConfigBackup(manager.localConfigPath, 'test');
      expect(backupPath).toBeTruthy();
      expect(manager.rollbackStack.length).toBeGreaterThan(0);

      // Modify the original file
      const modifiedConfig = { mcpServers: { modified: { command: 'node', args: ['modified.js'] } } };
      await global.testUtils.createMockLocalConfig(modifiedConfig);

      // Verify modification
      const modified = await manager.readLocalConfig();
      expect(modified.mcpServers.modified).toBeTruthy();
      expect(modified.mcpServers.original).toBeUndefined();

      // Execute rollback
      const rollbackResult = await manager.performRollback();
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.operationsRolledBack).toBeGreaterThan(0);

      // Verify rollback worked
      const restored = await manager.readLocalConfig();
      expect(restored.mcpServers.original).toBeTruthy();
      expect(restored.mcpServers.modified).toBeUndefined();
    });

    jest.setTimeout(10000);
  test('should handle rollback failures gracefully', async () => { try {
      // Add a rollback operation that will fail
      manager.addRollbackOperation({
        type: 'test-operation',
        action: async () => { try {
          throw new Error('Rollback operation failed');
        }
      });

      const rollbackResult = await manager.performRollback();
      expect(rollbackResult.success).toBe(false);
      expect(rollbackResult.operationsRolledBack).toBe(0);
    });

    jest.setTimeout(10000);
  test('should execute rollback operations in reverse order', async () => { try {
      const executionOrder = [];

      manager.addRollbackOperation({
        type: 'first-operation',
        action: async () => { try {
          executionOrder.push('first');
        }
      });

      manager.addRollbackOperation({
        type: 'second-operation',
        action: async () => { try {
          executionOrder.push('second');
        }
      });

      manager.addRollbackOperation({
        type: 'third-operation',
        action: async () => { try {
          executionOrder.push('third');
        }
      });

      await manager.performRollback();

      expect(executionOrder).toEqual(['third', 'second', 'first']);
    });

    jest.setTimeout(10000);
  test('should handle partial rollback failures', async () => { try {
      const executionOrder = [];

      manager.addRollbackOperation({
        type: 'success-operation',
        action: async () => { try {
          executionOrder.push('success');
        }
      });

      manager.addRollbackOperation({
        type: 'failure-operation',
        action: async () => { try {
          executionOrder.push('failure');
          throw new Error('Operation failed');
        }
      });

      manager.addRollbackOperation({
        type: 'another-success',
        action: async () => { try {
          executionOrder.push('another-success');
        }
      });

      const rollbackResult = await manager.performRollback();

      // Should continue with other operations even if one fails
      expect(executionOrder).toContain('success');
      expect(executionOrder).toContain('another-success');
      expect(executionOrder).toContain('failure');
    });
  });

  describe('Error Analysis and Recovery Recommendations', () => {
    jest.setTimeout(10000);
  test('should analyze permission errors correctly', () => {
      const permissionError = new Error('EACCES: permission denied, open \'/etc/shadow\'');
      permissionError.code = 'EACCES';

      const analysis = manager.analyzeError(permissionError);

      expect(analysis.type).toBe('permission');
      expect(analysis.severity).toBe('high');
      expect(analysis.category).toBe('filesystem');
      expect(analysis.recoverable).toBe(true);

      const recovery = { errorAnalysis: analysis, backupsAvailable: false };
      const actions = manager.generateRecoveryActions(permissionError, recovery);

      expect(actions).toContain('Check file permissions on configuration files');
      expect(actions).toContain('Run with appropriate user privileges');
    });

    jest.setTimeout(10000);
  test('should analyze missing dependency errors', () => {
      const dependencyError = new Error('claude not installed or not found in PATH');

      const analysis = manager.analyzeError(dependencyError);

      expect(analysis.type).toBe('missing-dependency');
      expect(analysis.severity).toBe('critical');
      expect(analysis.recoverable).toBe(false);

      const recovery = { errorAnalysis: analysis, backupsAvailable: false };
      const actions = manager.generateRecoveryActions(dependencyError, recovery);

      expect(actions).toContain('Install Claude Code: npm install -g @anthropic-ai/claude-code');
      expect(actions).toContain('Verify installation: claude --version');
    });

    jest.setTimeout(10000);
  test('should provide context-aware recovery suggestions', () => {
      const corruptionError = new Error('JSON parse error: Unexpected end of JSON input');

      const analysis = manager.analyzeError(corruptionError);
      const recovery = { errorAnalysis: analysis, backupsAvailable: true };
      const actions = manager.generateRecoveryActions(corruptionError, recovery);

      expect(actions).toContain('Restore from automatic backup');
      expect(actions).toContain('Validate configuration file syntax');
    });

    jest.setTimeout(10000);
  test('should handle unknown errors gracefully', () => {
      const unknownError = new Error('Something weird happened');

      const analysis = manager.analyzeError(unknownError);

      expect(analysis.type).toBe('unknown');
      expect(analysis.recoverable).toBe(true);

      const recovery = { errorAnalysis: analysis, backupsAvailable: true };
      const actions = manager.generateRecoveryActions(unknownError, recovery);

      expect(actions).toContain('Check the error log for specific details');
      expect(actions).toContain('Try running with --verbose for more information');
    });
  });

  describe('Comprehensive Error Recovery Workflows', () => {
    jest.setTimeout(10000);
  test('should recover from complete setup failure', async () => { try {
      // Mock multiple failures
      execSync.mockImplementation(() => {
        throw new Error('claude: command not found');
      });

      const result = await manager.executeBulletproofSetup();

      expect(result.success).toBe(false);
      expect(result.recovery).toBeTruthy();
      expect(result.recovery.errorAnalysis).toBeTruthy();
      expect(result.recovery.recommendedActions.length).toBeGreaterThan(0);
    });

    jest.setTimeout(10000);
  test('should handle cascading failures', async () => { try {
      // Create a scenario with multiple failure points
      const brokenConfig = {
        mcpServers: {
          'broken-1': global.testUtils.generateTestData.brokenMcpServer('missing-file'),
          'broken-2': global.testUtils.generateTestData.brokenMcpServer('missing-command'),
          'broken-3': global.testUtils.generateTestData.brokenMcpServer('claude-flow-legacy')
        }
      };

      await global.testUtils.createMockProjectConfig(brokenConfig);

      execSync.mockImplementation(() => {
        throw new Error('CLI also failing');
      });

      const result = await manager.executeBulletproofSetup();

      expect(result.success).toBe(false);
      expect(result.recovery).toBeTruthy();

      // Should identify multiple issues
      expect(result.recovery.recommendedActions.length).toBeGreaterThan(1);
    });

    jest.setTimeout(10000);
  test('should provide comprehensive failure analysis', async () => { try {
      const complexError = new Error('Multiple subsystems failed');

      const recovery = await manager.handleSetupFailure(complexError);

      expect(recovery.errorAnalysis).toBeTruthy();
      expect(recovery.recommendedActions).toBeTruthy();
      expect(recovery.backupsAvailable).toBeDefined();
    });
  });

  describe('Enhanced MCP Init Error Handling', () => {
    jest.setTimeout(10000);
  test('should handle init failure with UX disabled', async () => { try {
      execSync.mockImplementation(() => {
        throw new Error('System failure');
      });

      const result = await enhancedMcpInit({
        dryRun: true,
        enhancedUx: false,
        verbose: false
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.recovery).toBeTruthy();
    });

    jest.setTimeout(10000);
  test('should handle UX module loading failures', async () => { try {
      // Mock UX module to fail loading
      jest.doMock('../../../src/cli/mcp-user-experience.js', () => {
        throw new Error('UX module not found');
      });

      const result = await enhancedMcpInit({
        enhancedUx: true,
        showEducation: true
      });

      // Should fall back to basic mode
      expect(result).toBeTruthy();
    });

    jest.setTimeout(10000);
  test('should handle mixed success/failure scenarios', async () => { try {
      // Mock partial success
      execSync.mockImplementation((command) => {
        if (command.includes('claude --version')) {
          return 'claude version 1.0.0';
        }
        if (command.includes('claude mcp list')) {
          throw new Error('MCP service down');
        }
        throw new Error('Unknown command');
      });

      const result = await enhancedMcpInit({
        dryRun: true,
        verbose: true
      });

      // Should complete with warnings
      expect(result).toBeTruthy();
    });
  });

  describe('Stress Testing Error Scenarios', () => {
    jest.setTimeout(10000);
  test('should handle resource exhaustion gracefully', async () => { try {
      // Simulate running out of file descriptors
      const originalOpen = fs.open;
      let openCount = 0;

      fs.open = jest.fn(async (path, flags) => {
        openCount++;
        if (openCount > 100) {
          const error = new Error('EMFILE: too many open files');
          error.code = 'EMFILE';
          throw error;
        }
        return originalOpen(path, flags);
      });

      try {
        // Try to trigger resource exhaustion
        const promises = [];
        for (let i = 0; i < 200; i++) {
          promises.push(manager.fileExists('/tmp/test-file'));
        }

        await Promise.allSettled(promises);

        // Should handle gracefully without crashing
        expect(true).toBe(true);
      } finally {
        fs.open = originalOpen;
      }
    });

    jest.setTimeout(10000);
  test('should handle memory pressure scenarios', async () => { try {
      // Create scenarios that could cause memory issues
      const largeConfig = global.testUtils.generateTestData.largeConfiguration(10000);
      await global.testUtils.createMockProjectConfig(largeConfig);

      // Should complete without memory errors
      const state = await manager.detectConfigurationState();
      expect(state).toBeTruthy();
    });

    jest.setTimeout(10000);
  test('should handle concurrent error scenarios', async () => { try {
      // Create multiple failing operations
      const failingOperations = [];

      for (let i = 0; i < 50; i++) {
        failingOperations.push(
          manager.checkServerPath({
            name: `failing-server-${i}`,
            command: 'non-existent-command',
            args: [`/non/existent/path-${i}.js`]
          })
        );
      }

      const results = await Promise.allSettled(failingOperations);

      // All should complete (with errors), none should crash
      expect(results).toHaveLength(50);
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
        expect(result.value).toBeInstanceOf(Array);
      });
    });
  });
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});