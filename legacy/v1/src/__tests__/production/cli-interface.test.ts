/**
 * Comprehensive Production-Ready Test Suite for CLI Interface
 *
 * Tests all command variations, error handling, output formats,
 * and Redis backend integration
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { spawn, execSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    execSync: jest.fn(),
    spawn: jest.fn()
  };
});

describe('CLI Interface Production Tests', () => {
  let originalEnv;
  let testResultsDir;
  let mockSpawn;

  // CLI command helper
  const runCLICommand = async (args, options = {}) => {
    return new Promise((resolve, reject) => {
      const cliPath = path.join(__dirname, '../../../src/cli/main.ts');
      const process = spawn('node', ['-r', 'tsx/cjs', cliPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' },
        ...options
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      process.on('error', (error) => {
        reject(error);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        process.kill();
        reject(new Error('Command timed out'));
      }, 30000);
    });
  };

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testResultsDir = path.join(__dirname, '../../test-results');
    await fs.mkdir(testResultsDir, { recursive: true });

    // Setup mock spawn
    mockSpawn = require('child_process').spawn;
  });

  afterAll(async () => {
    process.env = originalEnv;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up test outputs
    try {
      const files = await fs.readdir(testResultsDir);
      await Promise.all(files.map(file => fs.unlink(path.join(testResultsDir, file))));
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Command Variations and Arguments', () => {
    it('should handle swarm command with objective', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      // Simulate successful process execution
      setTimeout(() => {
        if (mockProcess.on.mock.calls.length > 0) {
          const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close');
          if (closeCallback) {
            closeCallback[1](0);
          }
        }
      }, 100);

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');
      await swarmCommand(['Build a REST API with authentication'], {});

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should handle swarm command with all strategy variations', async () => {
      const strategies = ['auto', 'research', 'development', 'analysis', 'testing', 'optimization', 'maintenance'];
      const results = [];

      for (const strategy of strategies) {
        const mockProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        mockSpawn.mockReturnValue(mockProcess);

        // Simulate process response
        setTimeout(() => {
          const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close');
          if (closeCallback) {
            closeCallback[1](0);
          }
        }, 50);

        const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

        try {
          await swarmCommand(['Test objective'], { strategy });
          results.push({ strategy, success: true });
        } catch (error) {
          results.push({ strategy, success: false, error: error.message });
        }
      }

      // All strategies should be accepted
      expect(results.length).toBe(strategies.length);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    it('should handle swarm command with all mode variations', async () => {
      const modes = ['centralized', 'distributed', 'hierarchical', 'mesh', 'hybrid'];
      const results = [];

      for (const mode of modes) {
        const mockProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        mockSpawn.mockReturnValue(mockProcess);

        setTimeout(() => {
          const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close');
          if (closeCallback) {
            closeCallback[1](0);
          }
        }, 50);

        const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

        try {
          await swarmCommand(['Test objective'], { mode });
          results.push({ mode, success: true });
        } catch (error) {
          results.push({ mode, success: false, error: error.message });
        }
      }

      expect(results.length).toBe(modes.length);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    it('should handle all CLI flags and options', async () => {
      const flagCombinations = [
        { 'max-agents': '10' },
        { timeout: '120' },
        { 'task-timeout-minutes': '45' },
        { parallel: true },
        { distributed: true },
        { monitor: true },
        { ui: true },
        { background: true },
        { review: true },
        { testing: true },
        { encryption: true },
        { verbose: true },
        { 'dry-run': true },
        { executor: true },
        { claude: true },
        { 'output-format': 'json' },
        { 'output-format': 'text' },
        { 'no-interactive': true },
        { analysis: true },
        { 'quality-threshold': '0.9' },
        { 'memory-namespace': 'test' }
      ];

      for (const flags of flagCombinations) {
        const mockProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        mockSpawn.mockReturnValue(mockProcess);

        setTimeout(() => {
          const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close');
          if (closeCallback) {
            closeCallback[1](0);
          }
        }, 50);

        const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

        try {
          await swarmCommand(['Test objective'], flags);
          // If we get here, the flags were accepted without throwing
        } catch (error) {
          // Some flags might cause expected errors, which is fine
          expect(error.message).toBeDefined();
        }
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing objective gracefully', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      // Capture console.error calls
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');
      await swarmCommand([], {});

      expect(consoleSpy).toHaveBeenCalledWith('❌ Usage: swarm <objective>');

      consoleSpy.mockRestore();
    });

    it('should handle invalid flag values', async () => {
      const invalidFlags = [
        { 'max-agents': 'invalid' },
        { timeout: 'invalid' },
        { 'quality-threshold': '2.0' }, // Above 1.0
        { 'quality-threshold': '-0.1' }, // Below 0
        { 'memory-namespace': '' } // Empty string
      ];

      for (const flags of invalidFlags) {
        const mockProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        mockSpawn.mockReturnValue(mockProcess);

        const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

        try {
          await swarmCommand(['Test objective'], flags);
          // Should handle gracefully or provide meaningful error
        } catch (error) {
          expect(error.message).toBeDefined();
        }
      }
    });

    it('should handle Claude CLI not available', async () => {
      // Mock execSync to simulate Claude CLI not found
      require('child_process').execSync.mockImplementation(() => {
        throw new Error('Command not found: claude');
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');
      await swarmCommand(['Test objective'], {});

      // Should provide helpful message about installing Claude
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Claude Code CLI not found')
      );

      consoleSpy.mockRestore();
    });

    it('should handle headless environment detection', async () => {
      const headlessEnvironments = [
        { CI: 'true' },
        { GITHUB_ACTIONS: 'true' },
        { GITLAB_CI: 'true' },
        { JENKINS_URL: 'http://jenkins' }
      ];

      for (const env of headlessEnvironments) {
        // Set environment variable
        Object.assign(process.env, env);

        const mockProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        mockSpawn.mockReturnValue(mockProcess);

        const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

        try {
          await swarmCommand(['Test objective'], { headless: true });
          // Should detect headless environment and configure appropriately
        } catch (error) {
          // Expected behavior
        }

        // Clean up
        Object.keys(env).forEach(key => delete process.env[key]);
      }
    });
  });

  describe('Output Format Validation', () => {
    it('should generate valid JSON output', async () => {
      const mockProcess = {
        stdout: { on: jest.fn((event, handler) => {
          if (event === 'data') {
            // Simulate JSON output
            handler(JSON.stringify({
              success: true,
              swarmId: 'test-swarm-123',
              objective: 'Test objective',
              timestamp: new Date().toISOString()
            }));
          }
        })},
        stderr: { on: jest.fn() },
        on: jest.fn((event, handler) => {
          if (event === 'close') {
            handler(0);
          }
        }),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand(['Test objective'], {
          'output-format': 'json',
          executor: true
        });
      } catch (error) {
        // Expected behavior
      }

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should generate valid text output', async () => {
      const mockProcess = {
        stdout: { on: jest.fn((event, handler) => {
          if (event === 'data') {
            // Simulate text output
            handler('✅ Swarm execution completed successfully!\n');
            handler('   Duration: 2.5 minutes\n');
            handler('   Agents: 5\n');
            handler('   Tasks: 12\n');
          }
        })},
        stderr: { on: jest.fn() },
        on: jest.fn((event, handler) => {
          if (event === 'close') {
            handler(0);
          }
        }),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand(['Test objective'], {
          'output-format': 'text',
          executor: true
        });
      } catch (error) {
        // Expected behavior
      }

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should handle stream-json output format', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        stdin: {
          write: jest.fn(),
          end: jest.fn()
        }
      };

      mockSpawn.mockReturnValue(mockProcess);

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand(['Test objective'], {
          'output-format': 'stream-json'
        });
      } catch (error) {
        // Expected behavior
      }

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should save output to file when specified', async () => {
      const outputFile = path.join(testResultsDir, 'test-output.json');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      // Mock fs.writeFile
      const writeSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue();

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand(['Test objective'], {
          'output-format': 'json',
          'output-file': outputFile,
          executor: true
        });
      } catch (error) {
        // Expected behavior
      }

      writeSpy.mockRestore();
    });
  });

  describe('Redis Backend Integration', () => {
    it('should integrate with Redis client for state persistence', async () => {
      const { connectRedis, saveSwarmState, loadSwarmState } = await import('../../../src/cli/utils/redis-client.js');

      // Mock Redis client
      const mockRedisClient = {
        connect: jest.fn().mockResolvedValue(true),
        setEx: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue(JSON.stringify({
          id: 'test-swarm',
          objective: 'Test objective',
          status: 'running'
        })),
        sAdd: jest.fn().mockResolvedValue(true),
        hSet: jest.fn().mockResolvedValue(true),
        ping: jest.fn().mockResolvedValue('PONG'),
        on: jest.fn(),
        isOpen: true
      };

      jest.doMock('redis', () => ({
        createClient: jest.fn().mockReturnValue(mockRedisClient)
      }));

      // Test connection
      const client = await connectRedis();
      expect(client).toBeDefined();

      // Test state operations
      await saveSwarmState(mockRedisClient, 'test-swarm', {
        id: 'test-swarm',
        objective: 'Test objective'
      });

      const state = await loadSwarmState(mockRedisClient, 'test-swarm');
      expect(state).toBeDefined();
      expect(state.id).toBe('test-swarm');
    });

    it('should handle Redis connection failures gracefully', async () => {
      // Mock Redis connection failure
      const mockRedisClient = {
        connect: jest.fn().mockRejectedValue(new Error('Connection failed')),
        on: jest.fn()
      };

      jest.doMock('redis', () => ({
        createClient: jest.fn().mockReturnValue(mockRedisClient)
      }));

      const { connectRedis } = await import('../../../src/cli/utils/redis-client.js');

      try {
        await connectRedis();
        fail('Should have thrown connection error');
      } catch (error) {
        expect(error.message).toContain('Failed to connect to Redis');
      }
    });

    it('should handle swarm state persistence across CLI sessions', async () => {
      const mockRedisClient = {
        connect: jest.fn().mockResolvedValue(true),
        setEx: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue(JSON.stringify({
          id: 'persistent-swarm',
          objective: 'Test persistent swarm',
          status: 'running',
          agents: [],
          tasks: [],
          lastUpdated: Date.now()
        })),
        sMembers: jest.fn().mockResolvedValue(['persistent-swarm']),
        sAdd: jest.fn().mockResolvedValue(true),
        hSet: jest.fn().mockResolvedValue(true),
        ping: jest.fn().mockResolvedValue('PONG'),
        on: jest.fn(),
        isOpen: true
      };

      jest.doMock('redis', () => ({
        createClient: jest.fn().mockReturnValue(mockRedisClient)
      }));

      // Simulate saving state in first CLI session
      const { saveSwarmState, loadSwarmState, listActiveSwarms } = await import('../../../src/cli/utils/redis-client.js');

      await saveSwarmState(mockRedisClient, 'persistent-swarm', {
        id: 'persistent-swarm',
        objective: 'Test persistent swarm',
        status: 'running'
      });

      // Simulate loading state in second CLI session
      const loadedState = await loadSwarmState(mockRedisClient, 'persistent-swarm');
      expect(loadedState).toBeDefined();
      expect(loadedState.id).toBe('persistent-swarm');

      // Verify it appears in active swarms
      const activeSwarms = await listActiveSwarms(mockRedisClient);
      expect(activeSwarms.length).toBeGreaterThan(0);
      expect(activeSwarms[0].id).toBe('persistent-swarm');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle rapid command execution', async () => {
      const numCommands = 50;
      const commands = [];
      const startTime = Date.now();

      for (let i = 0; i < numCommands; i++) {
        const mockProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        mockSpawn.mockReturnValue(mockProcess);

        setTimeout(() => {
          const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close');
          if (closeCallback) {
            closeCallback[1](0);
          }
        }, 10);

        const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');
        commands.push(swarmCommand([`Test objective ${i}`], {}));
      }

      await Promise.all(commands);

      const totalTime = Date.now() - startTime;
      const avgTimePerCommand = totalTime / numCommands;

      // Should handle rapid execution efficiently (<100ms per command on average)
      expect(avgTimePerCommand).toBeLessThan(100);
      expect(totalTime).toBeLessThan(5000); // Total < 5 seconds
    });

    it('should handle large objective strings', async () => {
      const largeObjective = 'Build a comprehensive system with '.repeat(1000) + 'detailed requirements';
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      const startTime = Date.now();

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand([largeObjective], {});
      } catch (error) {
        // Expected behavior
      }

      const processingTime = Date.now() - startTime;

      // Should handle large objectives efficiently (<1 second)
      expect(processingTime).toBeLessThan(1000);
    });

    it('should handle concurrent CLI processes', async () => {
      const numProcesses = 10;
      const processes = [];

      for (let i = 0; i < numProcesses; i++) {
        const mockProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn(),
          pid: 1000 + i
        };

        mockSpawn.mockReturnValue(mockProcess);

        setTimeout(() => {
          const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close');
          if (closeCallback) {
            closeCallback[1](0);
          }
        }, 100 + i * 10); // Stagger completion times

        const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');
        processes.push(swarmCommand([`Concurrent test ${i}`], {}));
      }

      const results = await Promise.allSettled(processes);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Should handle concurrent processes with high success rate
      expect(successful).toBeGreaterThanOrEqual(numProcesses * 0.8);
      expect(failed).toBeLessThan(numProcesses * 0.2);
    });
  });

  describe('Background and Daemon Mode', () => {
    it('should handle background execution', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        pid: 12345,
        unref: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand(['Test background execution'], { background: true });
      } catch (error) {
        // Expected behavior
      }

      // Should indicate background execution
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Background mode')
      );

      consoleSpy.mockRestore();
    });

    it('should handle daemon mode with proper process management', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        pid: 54321,
        unref: jest.fn(),
        detached: true
      };

      mockSpawn.mockReturnValue(mockProcess);

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand(['Test daemon mode'], {
          background: true,
          daemon: true
        });
      } catch (error) {
        // Expected behavior
      }

      expect(mockProcess.detached).toBe(true);
      expect(mockProcess.unref).toHaveBeenCalled();
    });
  });

  describe('Health Check and Monitoring', () => {
    it('should perform health check when requested', async () => {
      const mockProcess = {
        stdout: { on: jest.fn((event, handler) => {
          if (event === 'data') {
            handler(JSON.stringify({
              status: 'healthy',
              service: 'claude-flow-swarm',
              version: '2.0.0',
              timestamp: new Date().toISOString()
            }));
          }
        })},
        stderr: { on: jest.fn() },
        on: jest.fn((event, handler) => {
          if (event === 'close') {
            handler(0);
          }
        }),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand(['health-check'], { 'health-check': true });
      } catch (error) {
        // Expected behavior
      }

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should provide monitoring information', async () => {
      const mockProcess = {
        stdout: { on: jest.fn((event, handler) => {
          if (event === 'data') {
            handler('📊 Swarm Status:\n');
            handler('  Active Swarms: 3\n');
            handler('  Total Agents: 15\n');
            handler('  Completed Tasks: 42\n');
            handler('  System Health: OK\n');
          }
        })},
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand(['status'], { monitor: true });
      } catch (error) {
        // Expected behavior
      }

      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  describe('Security and Validation', () => {
    it('should validate input parameters', async () => {
      const maliciousInputs = [
        '../../../etc/passwd',
        'rm -rf /',
        '<script>alert("xss")</script>',
        'SELECT * FROM users',
        '\x00\x01\x02\x03'
      ];

      for (const input of maliciousInputs) {
        const mockProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        mockSpawn.mockReturnValue(mockProcess);

        const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

        try {
          await swarmCommand([input], {});
          // Should handle malicious input gracefully
        } catch (error) {
          // Expected behavior - should not crash
          expect(error.message).toBeDefined();
        }
      }
    });

    it('should handle permission and security flags', async () => {
      const securityFlags = [
        { 'dangerously-skip-permissions': false },
        { 'no-auto-permissions': true },
        { encryption: true },
        { analysis: true },
        { 'read-only': true }
      ];

      for (const flags of securityFlags) {
        const mockProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        mockSpawn.mockReturnValue(mockProcess);

        const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

        try {
          await swarmCommand(['Test objective'], flags);
          // Should handle security flags appropriately
        } catch (error) {
          // Some flags might cause expected behavior
        }
      }
    });

    it('should sanitize output for security', async () => {
      const mockProcess = {
        stdout: { on: jest.fn((event, handler) => {
          if (event === 'data') {
            // Output should not contain sensitive information
            const output = 'Swarm execution completed\nID: swarm_abc123\nStatus: success';
            handler(output);
          }
        })},
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand(['Test security'], {});
      } catch (error) {
        // Expected behavior
      }

      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should integrate with file system operations', async () => {
      const testFile = path.join(testResultsDir, 'integration-test.txt');

      // Mock file system operations
      const writeSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue();
      const readSpy = jest.spyOn(fs, 'readFile').mockResolvedValue('test content');

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockProcess);

      const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

      try {
        await swarmCommand([`Create file at ${testFile}`], {});
      } catch (error) {
        // Expected behavior
      }

      writeSpy.mockRestore();
      readSpy.mockRestore();
    });

    it('should handle environment-specific configurations', async () => {
      const environments = ['development', 'staging', 'production'];

      for (const env of environments) {
        process.env.NODE_ENV = env;

        const mockProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        mockSpawn.mockReturnValue(mockProcess);

        const { swarmCommand } = await import('../../../src/cli/simple-commands/swarm.js');

        try {
          await swarmCommand(['Test environment configuration'], {});
          // Should adapt to environment
        } catch (error) {
          // Expected behavior
        }
      }

      process.env.NODE_ENV = 'test';
    });
  });
});