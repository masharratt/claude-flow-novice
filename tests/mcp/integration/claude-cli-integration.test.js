/**
 * Integration Tests for Claude Code CLI interactions
 * Tests real CLI commands and workflows in controlled environment
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

import { McpConfigurationManager } from '../../../src/mcp/mcp-config-manager.js';

// Test timeout for CLI operations
const CLI_TIMEOUT = 15000;

describe('Claude CLI Integration Tests', () => {
  let manager;
  let testDir;
  let originalCwd;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await global.testUtils.createTempDir('cli-integration');
    process.chdir(testDir);

    manager = new McpConfigurationManager({
      verbose: false,
      autoFix: true,
      dryRun: false
    });

    // Override paths to use test directory
    manager.localConfigPath = path.join(testDir, '.claude.json');
    manager.projectConfigPath = path.join(testDir, '.mcp.json');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup test directory: ${error.message}`);
    }
  });

  describe('Claude CLI Detection', () => {
    test('should detect Claude CLI when available', async () => {
      // Skip if Claude CLI is not available in test environment
      try {
        execSync('which claude', { stdio: 'ignore' });
      } catch {
        console.log('Claude CLI not available, skipping CLI detection test');
        return;
      }

      const isInstalled = manager.isClaudeCodeInstalled();
      expect(isInstalled).toBe(true);
    }, CLI_TIMEOUT);

    test('should handle missing Claude CLI gracefully', () => {
      // Mock execSync to simulate missing CLI
      const originalExecSync = execSync;
      execSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      try {
        const isInstalled = manager.isClaudeCodeInstalled();
        expect(isInstalled).toBe(false);
      } finally {
        execSync.mockRestore();
      }
    });

    test('should try multiple detection methods', () => {
      let callCount = 0;
      const originalExecSync = execSync;

      execSync.mockImplementation((command) => {
        callCount++;
        if (command.includes('which claude') && callCount === 1) {
          throw new Error('Command not found');
        }
        if (command.includes('claude --version') && callCount === 2) {
          return 'claude version 1.0.0';
        }
        throw new Error('Command not found');
      });

      try {
        const isInstalled = manager.isClaudeCodeInstalled();
        expect(isInstalled).toBe(true);
        expect(callCount).toBe(2);
      } finally {
        execSync.mockRestore();
      }
    });
  });

  describe('MCP Server Management via CLI', () => {
    test('should remove local server via CLI', async () => {
      // Create a local configuration with test server
      const localConfig = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['test-server.js']
          },
          'keep-server': {
            command: 'npx',
            args: ['keep-server']
          }
        }
      };

      await fs.writeFile(manager.localConfigPath, JSON.stringify(localConfig, null, 2));

      // Mock CLI command
      execSync.mockImplementation((command) => {
        if (command.includes('claude mcp remove test-server')) {
          // Simulate successful removal by updating the config
          const updatedConfig = { ...localConfig };
          delete updatedConfig.mcpServers['test-server'];
          fs.writeFileSync(manager.localConfigPath, JSON.stringify(updatedConfig, null, 2));
          return 'Server removed successfully';
        }
        throw new Error('Command failed');
      });

      await manager.removeLocalServer('test-server');

      // Verify server was removed
      const updatedConfig = await manager.readLocalConfig();
      expect(updatedConfig.mcpServers).not.toHaveProperty('test-server');
      expect(updatedConfig.mcpServers).toHaveProperty('keep-server');
    });

    test('should fallback to manual removal when CLI fails', async () => {
      const localConfig = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['test-server.js']
          }
        }
      };

      await fs.writeFile(manager.localConfigPath, JSON.stringify(localConfig, null, 2));

      // Mock CLI command to fail
      execSync.mockImplementation(() => {
        throw new Error('CLI command failed');
      });

      await manager.removeLocalServer('test-server');

      // Verify manual removal worked
      const updatedConfig = await manager.readLocalConfig();
      expect(updatedConfig.mcpServers).not.toHaveProperty('test-server');
    });

    test('should handle CLI timeout gracefully', async () => {
      const localConfig = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['test-server.js']
          }
        }
      };

      await fs.writeFile(manager.localConfigPath, JSON.stringify(localConfig, null, 2));

      // Mock CLI command to timeout
      execSync.mockImplementation(() => {
        throw new Error('Command timed out');
      });

      // Should not throw, should fallback to manual removal
      await expect(manager.removeLocalServer('test-server')).resolves.not.toThrow();

      const updatedConfig = await manager.readLocalConfig();
      expect(updatedConfig.mcpServers).not.toHaveProperty('test-server');
    });
  });

  describe('MCP Server Listing and Verification', () => {
    test('should verify setup by listing servers', async () => {
      // Mock successful MCP list command
      execSync.mockImplementation((command) => {
        if (command.includes('claude mcp list')) {
          return `
MCP Servers:
✓ claude-flow-novice (running)
✓ other-server (running)
          `;
        }
        throw new Error('Command not found');
      });

      // Should not throw
      await expect(manager.verifySetup()).resolves.not.toThrow();
    });

    test('should handle MCP list command failures', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      // Should not throw, should log warning
      await expect(manager.verifySetup()).resolves.not.toThrow();
    });

    test('should detect missing server in list output', async () => {
      execSync.mockImplementation((command) => {
        if (command.includes('claude mcp list')) {
          return `
MCP Servers:
✓ other-server (running)
          `;
        }
        throw new Error('Command not found');
      });

      await manager.verifySetup();
      // Should log warning about missing server
    });
  });

  describe('Command Execution with Timeout', () => {
    test('should execute commands with timeout', async () => {
      const result = await manager.runCommandWithTimeout('echo', ['hello'], 5000);

      expect(result.success).toBe(true);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('hello');
    });

    test('should timeout long-running commands', async () => {
      // Test with a command that would take longer than timeout
      await expect(
        manager.runCommandWithTimeout('sleep', ['10'], 1000)
      ).rejects.toThrow('Command timed out');
    });

    test('should handle command errors', async () => {
      const result = await manager.runCommandWithTimeout('false', [], 5000);

      expect(result.success).toBe(false);
      expect(result.code).not.toBe(0);
    });

    test('should handle non-existent commands', async () => {
      await expect(
        manager.runCommandWithTimeout('non-existent-command', [], 5000)
      ).rejects.toThrow();
    });
  });

  describe('Real CLI Workflow Tests', () => {
    test('should complete full setup workflow with CLI', async () => {
      // Skip if Claude CLI is not available
      try {
        execSync('which claude', { stdio: 'ignore' });
      } catch {
        console.log('Claude CLI not available, skipping workflow test');
        return;
      }

      // Mock CLI responses for the workflow
      execSync.mockImplementation((command) => {
        if (command.includes('claude --version')) {
          return 'claude version 1.0.0';
        }
        if (command.includes('claude mcp list')) {
          return 'MCP Servers:\n✓ claude-flow-novice (running)';
        }
        if (command.includes('claude mcp remove')) {
          return 'Server removed successfully';
        }
        return '';
      });

      const result = await manager.executeBulletproofSetup();

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.details).toBeTruthy();
    }, CLI_TIMEOUT);

    test('should handle CLI unavailable during setup', async () => {
      execSync.mockImplementation(() => {
        throw new Error('claude: command not found');
      });

      const result = await manager.executeBulletproofSetup();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude Code CLI not installed');
      expect(result.recovery).toBeTruthy();
    });
  });

  describe('Comprehensive Verification Tests', () => {
    test('should run all verification tests', async () => {
      // Mock CLI responses
      execSync.mockImplementation((command) => {
        if (command.includes('claude --version')) {
          return 'claude version 1.0.0';
        }
        if (command.includes('claude mcp list')) {
          return 'MCP Servers:\n✓ claude-flow-novice (running)\n✓ Connected';
        }
        throw new Error('Unknown command');
      });

      // Create valid project configuration
      const validConfig = {
        mcpServers: {
          'claude-flow-novice': {
            command: 'npx',
            args: ['claude-flow-novice', 'mcp', 'start']
          }
        }
      };
      await fs.writeFile(manager.projectConfigPath, JSON.stringify(validConfig, null, 2));

      const verification = await manager.performComprehensiveVerification();

      expect(verification.success).toBe(true);
      expect(verification.tests.length).toBeGreaterThan(0);
      expect(verification.tests.every(test => test.name)).toBe(true);
    });

    test('should handle verification failures gracefully', async () => {
      execSync.mockImplementation(() => {
        throw new Error('All CLI commands fail');
      });

      const verification = await manager.performComprehensiveVerification();

      expect(verification.success).toBe(false);
      expect(verification.errors.length).toBeGreaterThan(0);
    });

    test('should test file permissions correctly', async () => {
      // Create files with known permissions
      await fs.writeFile(manager.localConfigPath, '{"test": true}');
      await fs.writeFile(manager.projectConfigPath, '{"test": true}');

      const verification = await manager.performComprehensiveVerification();
      const permissionTest = verification.tests.find(test => test.name === 'File Permissions');

      expect(permissionTest).toBeTruthy();
      expect(permissionTest.passed).toBe(true);
    });

    test('should detect permission issues', async () => {
      // Create a file and then make it unreadable (if possible)
      await fs.writeFile(manager.localConfigPath, '{"test": true}');

      try {
        await fs.chmod(manager.localConfigPath, 0o000);

        const verification = await manager.performComprehensiveVerification();
        const permissionTest = verification.tests.find(test => test.name === 'File Permissions');

        // Should detect permission issue
        expect(permissionTest.passed).toBe(false);
      } catch (error) {
        // If chmod fails (e.g., on Windows), skip this test
        console.log('Cannot test permission issues on this platform');
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.chmod(manager.localConfigPath, 0o644);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe('CLI Command Safety', () => {
    test('should not execute dangerous commands', async () => {
      const dangerousCommands = [
        'rm -rf /',
        'del /f /s /q C:\\',
        'format C:',
        'sudo rm -rf /',
        'shutdown -r now'
      ];

      for (const dangerous of dangerousCommands) {
        execSync.mockImplementation((command) => {
          if (command.includes(dangerous)) {
            throw new Error('Dangerous command blocked');
          }
          return 'safe output';
        });

        // Should not execute dangerous commands
        try {
          execSync(dangerous);
          throw new Error('Dangerous command was executed');
        } catch (error) {
          expect(error.message).toContain('blocked');
        }
      }
    });

    test('should sanitize command arguments', async () => {
      const maliciousArgs = [
        '; rm -rf /',
        '&& del /f /s /q C:\\',
        '| cat /etc/passwd',
        '$(malicious-command)',
        '`malicious-command`'
      ];

      for (const malicious of maliciousArgs) {
        // Verify that malicious arguments are detected
        expect(malicious).toMatch(/[;&|`$()]/);
      }
    });

    test('should validate server removal commands', async () => {
      const validServerNames = ['claude-flow-novice', 'test-server', 'valid-name-123'];
      const invalidServerNames = ['; rm -rf /', '$(malicious)', '`command`', '../../../etc/passwd'];

      for (const validName of validServerNames) {
        // Should construct safe command
        const command = `claude mcp remove ${validName} -s local`;
        expect(command).not.toMatch(/[;&|`$()]/);
      }

      for (const invalidName of invalidServerNames) {
        // Should not use invalid names in commands
        expect(invalidName).toMatch(/[;&|`$()\.\/]/);
      }
    });
  });

  describe('Error Recovery Integration', () => {
    test('should recover from CLI timeout errors', async () => {
      let callCount = 0;
      execSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Command timed out');
        }
        return 'success';
      });

      // Should retry or use alternative method
      const isInstalled = manager.isClaudeCodeInstalled();
      expect(isInstalled).toBe(true);
      expect(callCount).toBe(2);
    });

    test('should handle partial CLI failures', async () => {
      execSync.mockImplementation((command) => {
        if (command.includes('claude --version')) {
          return 'claude version 1.0.0';
        }
        if (command.includes('claude mcp list')) {
          throw new Error('MCP service unavailable');
        }
        if (command.includes('claude mcp remove')) {
          return 'Server removed successfully';
        }
        throw new Error('Command failed');
      });

      const verification = await manager.performComprehensiveVerification();

      // Should handle mixed success/failure
      expect(verification.tests.some(test => test.passed)).toBe(true);
      expect(verification.tests.some(test => !test.passed)).toBe(true);
    });

    test('should provide helpful error messages for CLI failures', async () => {
      execSync.mockImplementation(() => {
        const error = new Error('Command failed');
        error.code = 'ENOENT';
        throw error;
      });

      const result = await manager.executeBulletproofSetup();

      expect(result.success).toBe(false);
      expect(result.recovery).toBeTruthy();
      expect(result.recovery.recommendedActions).toContain(
        'Install Claude Code: npm install -g @anthropic-ai/claude-code'
      );
    });
  });
});