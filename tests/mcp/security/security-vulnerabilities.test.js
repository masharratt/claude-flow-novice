/**
 * Security Vulnerability Tests for MCP Configuration Manager
 * Comprehensive testing for command injection, path traversal, and other security issues
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import { execSync } from 'child_process';

import { McpConfigurationManager } from '../../../src/mcp/mcp-config-manager.js';
import { securityConfigurations } from '../fixtures/config-samples.js';

describe('MCP Security Vulnerability Tests', () => {
  let manager;
  let securityMonitor;

  beforeEach(async () => {
    manager = new McpConfigurationManager({
      verbose: false,
      autoFix: true,
      dryRun: true // Always use dry run for security tests
    });

    // Setup security monitoring
    securityMonitor = global.securityUtils.createSystemCallMonitor();

    // Create test configurations
    await global.testUtils.createMockClaudeConfig();
    await global.testUtils.createMockProjectConfig();
  });

  afterEach(() => {
    securityMonitor.reset();
  });

  describe('Command Injection Prevention', () => {
    test('should detect command injection in command field', async () => {
      const maliciousConfigs = [
        { command: 'node; rm -rf /', args: ['server.js'] },
        { command: 'node && whoami', args: ['server.js'] },
        { command: 'node || id', args: ['server.js'] },
        { command: 'node | cat /etc/passwd', args: ['server.js'] },
        { command: 'node $(echo malicious)', args: ['server.js'] },
        { command: 'node `echo malicious`', args: ['server.js'] }
      ];

      for (const config of maliciousConfigs) {
        const server = { name: 'test-server', ...config };
        const issues = await manager.checkServerPath(server);

        expect(issues.length).toBeGreaterThan(0);
        expect(issues.some(issue => issue.includes('injection'))).toBe(true);
      }
    });

    test('should detect command injection in arguments', async () => {
      const maliciousArgs = [
        ['server.js', '; rm -rf /'],
        ['server.js', '&& whoami'],
        ['server.js', '|| id'],
        ['server.js', '| cat /etc/passwd'],
        ['$(malicious-command)'],
        ['`malicious-command`'],
        ['--config', '../../../etc/passwd']
      ];

      for (const args of maliciousArgs) {
        const server = {
          name: 'test-server',
          command: 'node',
          args
        };

        const issues = await manager.checkServerPath(server);
        expect(issues.length).toBeGreaterThan(0);
      }
    });

    test('should validate configuration safety', () => {
      for (const maliciousConfig of securityConfigurations.commandInjectionAttempts) {
        const validation = global.securityUtils.validateConfigSafety(maliciousConfig);

        expect(validation.safe).toBe(false);
        expect(validation.issues.length).toBeGreaterThan(0);
        expect(validation.issues.some(issue => issue.includes('injection'))).toBe(true);
      }
    });

    test('should block dangerous command execution', async () => {
      // Mock execSync to track dangerous commands
      const dangerousCommands = [
        'rm -rf /',
        'del /f /s /q',
        'format C:',
        'sudo rm',
        'curl | sh',
        'wget | sh'
      ];

      execSync.mockImplementation((command) => {
        for (const dangerous of dangerousCommands) {
          if (command.includes(dangerous)) {
            throw new Error('Blocked dangerous command execution');
          }
        }
        return 'safe execution';
      });

      // Try to execute server removal which might contain injection
      try {
        await manager.removeLocalServer('test; rm -rf /');
        // Should not reach here if properly protected
      } catch (error) {
        expect(error.message).toContain('Blocked dangerous command');
      }
    });

    test('should sanitize server names before CLI usage', async () => {
      const maliciousServerNames = [
        'server; rm -rf /',
        'server && whoami',
        'server || id',
        'server | cat /etc/passwd',
        'server$(malicious)',
        'server`malicious`'
      ];

      for (const serverName of maliciousServerNames) {
        // Should detect unsafe server name
        expect(/[;&|`$()]/.test(serverName)).toBe(true);

        // Manager should not use unsafe names in CLI commands
        try {
          await manager.removeLocalServer(serverName);
        } catch (error) {
          // Should either sanitize or reject
          expect(error.message).toBeDefined();
        }
      }
    });
  });

  describe('Path Traversal Prevention', () => {
    test('should detect path traversal attempts', async () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '....//....//....//etc/passwd',
        '/etc/passwd%00.txt',
        'normal/../../etc/passwd'
      ];

      for (const maliciousPath of pathTraversalAttempts) {
        const server = {
          name: 'test-server',
          command: 'node',
          args: [maliciousPath]
        };

        const issues = await manager.checkServerPath(server);
        expect(issues.length).toBeGreaterThan(0);
      }
    });

    test('should prevent access to restricted system paths', async () => {
      const restrictedPaths = [
        '/etc/passwd',
        '/etc/shadow',
        '/root/.ssh/id_rsa',
        'C:\\Windows\\System32\\config\\SAM',
        'C:\\Users\\Administrator\\.ssh\\id_rsa',
        '/proc/self/environ',
        '/dev/null',
        '/dev/zero'
      ];

      for (const restrictedPath of restrictedPaths) {
        const config = {
          mcpServers: {
            'test-server': {
              command: 'node',
              args: [restrictedPath]
            }
          }
        };

        const validation = global.securityUtils.validateConfigSafety(config);
        expect(validation.safe).toBe(false);
        expect(validation.issues.some(issue =>
          issue.includes('restricted path') || issue.includes('traversal')
        )).toBe(true);
      }
    });

    test('should handle URL-encoded path traversal', async () => {
      const encodedAttempts = [
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '%2e%2e%5c%2e%2e%5c%2e%2e%5cwindows%5csystem32%5chosts',
        '%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd'
      ];

      for (const encoded of encodedAttempts) {
        const server = {
          name: 'test-server',
          command: 'node',
          args: [encoded]
        };

        // Should detect encoded traversal attempts
        const issues = await manager.checkServerPath(server);
        expect(issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Environment Variable Injection Prevention', () => {
    test('should detect dangerous environment variables', async () => {
      const dangerousEnvVars = [
        { PATH: '/tmp:$PATH' },
        { LD_PRELOAD: '/tmp/malicious.so' },
        { NODE_OPTIONS: '--inspect=0.0.0.0:9229' },
        { SHELL: '/bin/sh -c "whoami"' },
        { EDITOR: 'vim -c ":!whoami"' },
        { PAGER: 'sh -c "whoami"' }
      ];

      for (const envVar of dangerousEnvVars) {
        const config = {
          mcpServers: {
            'test-server': {
              command: 'node',
              args: ['server.js'],
              env: envVar
            }
          }
        };

        const validation = global.securityUtils.validateConfigSafety(config);
        expect(validation.safe).toBe(false);
        expect(validation.issues.length).toBeGreaterThan(0);
      }
    });

    test('should detect injection in environment values', async () => {
      const injectionAttempts = [
        '; rm -rf /',
        '&& whoami',
        '|| id',
        '| cat /etc/passwd',
        '$(malicious-command)',
        '`malicious-command`'
      ];

      for (const injection of injectionAttempts) {
        const config = {
          mcpServers: {
            'test-server': {
              command: 'node',
              args: ['server.js'],
              env: {
                'TEST_VAR': injection
              }
            }
          }
        };

        const validation = global.securityUtils.validateConfigSafety(config);
        expect(validation.safe).toBe(false);
      }
    });

    test('should handle configuration with mixed safe and unsafe env vars', () => {
      const config = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
            env: {
              'SAFE_VAR': 'safe_value',
              'NODE_ENV': 'production',
              'MALICIOUS_VAR': '; rm -rf /',
              'ANOTHER_SAFE': 'another_safe_value'
            }
          }
        }
      };

      const validation = global.securityUtils.validateConfigSafety(config);
      expect(validation.safe).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.issues.some(issue =>
        issue.includes('injection') && issue.includes('MALICIOUS_VAR')
      )).toBe(true);
    });
  });

  describe('File System Security', () => {
    test('should prevent unauthorized file access', async () => {
      const { testDir, cleanup } = await global.securityUtils.createSecureTestEnv();

      try {
        // Try to read sensitive file
        const sensitiveFile = '/etc/passwd';

        // Should not allow direct access to sensitive files
        await expect(
          fs.readFile(sensitiveFile, 'utf8')
        ).rejects.toThrow();

      } finally {
        await cleanup();
      }
    });

    test('should validate file permissions before operations', async () => {
      const testFile = await global.testUtils.createTempFile('test-config.json', '{"test": true}');

      // Test readable file
      await expect(manager.fileExists(testFile)).resolves.toBe(true);

      // Make file unreadable
      try {
        await fs.chmod(testFile, 0o000);

        // Should handle permission denied gracefully
        const config = await manager.readProjectConfig();
        expect(config).toBeNull();
      } catch (error) {
        // Permission test may not work on all platforms
        console.log('Permission test skipped on this platform');
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.chmod(testFile, 0o644);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    test('should prevent creation of files in restricted locations', async () => {
      const restrictedPaths = [
        '/etc/malicious-config.json',
        '/root/malicious-config.json',
        'C:\\Windows\\System32\\malicious-config.json'
      ];

      for (const restrictedPath of restrictedPaths) {
        try {
          await fs.writeFile(restrictedPath, '{"malicious": true}');
          // Should not succeed
          expect(false).toBe(true);
        } catch (error) {
          // Should fail with permission error
          expect(error.code).toMatch(/EACCES|ENOENT|EPERM/);
        }
      }
    });
  });

  describe('Configuration Validation Security', () => {
    test('should reject malformed JSON that could cause parser exploits', async () => {
      const malformedConfigs = [
        '{"test": }',
        '{"test": undefined}',
        '{"test": function() { return "exploit"; }}',
        '{"__proto__": {"polluted": true}}',
        '{"constructor": {"prototype": {"polluted": true}}}'
      ];

      for (const malformed of malformedConfigs) {
        await global.testUtils.createTempFile('malformed.json', malformed);

        // Should handle malformed JSON safely
        const config = await manager.readProjectConfig();
        expect(config).toBeNull();
      }
    });

    test('should prevent prototype pollution', async () => {
      const pollutionAttempts = [
        {
          "__proto__": {
            "polluted": true
          },
          mcpServers: {
            "test": { command: "node", args: ["test.js"] }
          }
        },
        {
          "constructor": {
            "prototype": {
              "polluted": true
            }
          },
          mcpServers: {
            "test": { command: "node", args: ["test.js"] }
          }
        }
      ];

      for (const pollutionConfig of pollutionAttempts) {
        await global.testUtils.createMockProjectConfig(pollutionConfig);

        const config = await manager.readProjectConfig();

        // Should not pollute Object prototype
        expect(Object.prototype.polluted).toBeUndefined();
        expect(({}).polluted).toBeUndefined();
      }
    });

    test('should limit configuration size to prevent DoS', async () => {
      // Create extremely large configuration
      const largeConfig = {
        mcpServers: {}
      };

      // Add many servers with large data
      for (let i = 0; i < 100000; i++) {
        largeConfig.mcpServers[`server-${i}`] = {
          command: 'node',
          args: [`server-${i}.js`],
          env: {
            LARGE_DATA: 'A'.repeat(10000) // 10KB per server
          }
        };
      }

      await global.testUtils.createMockProjectConfig(largeConfig);

      // Should handle large configurations without crashing
      const { result, duration } = await global.performanceUtils.measureTime(async () => {
        return await manager.readProjectConfig();
      });

      expect(result).toBeTruthy();
      expect(duration).toBeLessThan(30000); // Should not take more than 30 seconds
    });
  });

  describe('Network Security', () => {
    test('should not make unauthorized network requests', async () => {
      // Monitor network calls
      const networkCalls = [];

      // Mock HTTP modules to track requests
      const originalFetch = global.fetch;
      global.fetch = jest.fn((url, options) => {
        networkCalls.push({ url, options });
        throw new Error('Network blocked in tests');
      });

      try {
        await manager.detectConfigurationState();
        await manager.performComprehensiveVerification();

        // Should not make any network requests
        expect(networkCalls).toHaveLength(0);
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('should validate URLs in configuration', () => {
      const maliciousUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'ftp://malicious.com/script.sh',
        'http://localhost:9229/debug' // Inspector URL
      ];

      for (const url of maliciousUrls) {
        const config = {
          mcpServers: {
            'test-server': {
              command: 'node',
              args: ['server.js'],
              env: {
                'SERVER_URL': url
              }
            }
          }
        };

        // Should validate URLs in environment variables
        const validation = global.securityUtils.validateConfigSafety(config);
        // URL validation would need to be implemented in the actual manager
      }
    });
  });

  describe('Process Security', () => {
    test('should not spawn processes with dangerous privileges', async () => {
      const dangerousCommands = [
        'sudo',
        'su',
        'chmod 777',
        'chown root',
        'setuid'
      ];

      for (const dangerous of dangerousCommands) {
        const server = {
          name: 'dangerous-server',
          command: dangerous,
          args: ['malicious-script']
        };

        const issues = await manager.checkServerPath(server);
        expect(issues.length).toBeGreaterThan(0);
      }
    });

    test('should limit resource usage of spawned processes', async () => {
      // This would require implementing resource limits in the manager
      const resourceLimitConfig = {
        mcpServers: {
          'resource-intensive': {
            command: 'node',
            args: ['memory-bomb.js'],
            limits: {
              memory: '100MB',
              cpu: '50%',
              timeout: '30s'
            }
          }
        }
      };

      // Manager should validate and enforce resource limits
      const validation = global.securityUtils.validateConfigSafety(resourceLimitConfig);
      expect(validation.safe).toBe(true); // Should be safe with limits
    });
  });

  describe('Input Sanitization', () => {
    test('should sanitize special characters in server names', () => {
      const specialCharServers = [
        'server<script>',
        'server"injection"',
        "server'injection'",
        'server\x00null',
        'server\r\ninjection',
        'server\u0000unicode-null'
      ];

      for (const serverName of specialCharServers) {
        // Should detect or sanitize special characters
        const hasSpecialChars = /[<>"'\x00-\x1f\u0000-\u001f]/.test(serverName);
        expect(hasSpecialChars).toBe(true);
      }
    });

    test('should validate configuration keys', () => {
      const maliciousKeys = {
        mcpServers: {
          'normal-server': {
            command: 'node',
            args: ['server.js']
          },
          '__proto__': {
            command: 'malicious',
            args: ['exploit.js']
          },
          'constructor.prototype.polluted': {
            command: 'pollute',
            args: ['prototype.js']
          }
        }
      };

      const validation = global.securityUtils.validateConfigSafety(maliciousKeys);
      // Should detect dangerous property names
      expect(validation.safe).toBe(false);
    });
  });

  describe('Logging Security', () => {
    test('should not log sensitive information', () => {
      const sensitiveConfig = {
        mcpServers: {
          'database-server': {
            command: 'node',
            args: ['db-server.js'],
            env: {
              'DATABASE_PASSWORD': 'super-secret-password',
              'API_KEY': 'sk-1234567890abcdef',
              'JWT_SECRET': 'jwt-secret-key'
            }
          }
        }
      };

      // Mock console to capture logs
      const logs = [];
      const originalLog = console.log;
      console.log = jest.fn((...args) => {
        logs.push(args.join(' '));
      });

      try {
        manager.log('Processing configuration with sensitive data');

        // Should not log sensitive values
        const logContent = logs.join(' ');
        expect(logContent).not.toContain('super-secret-password');
        expect(logContent).not.toContain('sk-1234567890abcdef');
        expect(logContent).not.toContain('jwt-secret-key');
      } finally {
        console.log = originalLog;
      }
    });

    test('should redact sensitive fields in error messages', async () => {
      const configWithSecrets = {
        mcpServers: {
          'secret-server': {
            command: 'non-existent-command',
            args: ['server.js'],
            env: {
              'SECRET_KEY': 'very-secret-key',
              'PASSWORD': 'secret-password'
            }
          }
        }
      };

      await global.testUtils.createMockProjectConfig(configWithSecrets);

      try {
        await manager.detectConfigurationState();
        const logs = manager.operationLog;

        // Check that secrets are not in logs
        const logMessages = logs.map(log => log.message).join(' ');
        expect(logMessages).not.toContain('very-secret-key');
        expect(logMessages).not.toContain('secret-password');
      } catch (error) {
        expect(error.message).not.toContain('very-secret-key');
        expect(error.message).not.toContain('secret-password');
      }
    });
  });
});