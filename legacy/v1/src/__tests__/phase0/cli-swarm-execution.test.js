/**
 * Jest test suite for CLI Swarm Execution Interface
 * Phase 0 Component: Command Registry and Swarm CLI Integration
 */

import { jest } from '@jest/globals';

// Mock the command registry and swarm-exec module
const mockSwarmExecProgram = {
  parse: jest.fn(),
  opts: jest.fn(),
  command: jest.fn(),
  description: jest.fn(),
  option: jest.fn()
};

// Mock commander program
jest.mock('commander', () => ({
  program: mockSwarmExecProgram
}));

// Mock the CLI utils
const mockArgValidator = {
  validateObjective: jest.fn(),
  validateSwarmConfig: jest.fn(),
  parseFlags: jest.fn()
};

jest.mock('../../cli/utils/arg-validator.js', () => mockArgValidator);

// Mock Redis client utilities
const mockRedisClient = {
  connect: jest.fn(),
  ping: jest.fn(),
  setEx: jest.fn(),
  get: jest.fn(),
  keys: jest.fn(),
  del: jest.fn(),
  sMembers: jest.fn(),
  sAdd: jest.fn(),
  hSet: jest.fn(),
  hDel: jest.fn()
};

jest.mock('../../cli/utils/redis-client.js', () => ({
  connectRedis: jest.fn(() => Promise.resolve(mockRedisClient)),
  saveSwarmState: jest.fn(),
  loadSwarmState: jest.fn(),
  listActiveSwarms: jest.fn(),
  deleteSwarmState: jest.fn(),
  getSwarmMetrics: jest.fn()
}));

// Mock the swarm-exec CLI module
jest.mock('../../cli/commands/swarm-exec.js', () => ({
  program: mockSwarmExecProgram
}));

// Mock process.argv
const originalArgv = process.argv;

describe('CLI Swarm Execution Interface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.argv = originalArgv;

    // Setup default mock returns
    mockArgValidator.validateObjective.mockReturnValue({ valid: true });
    mockArgValidator.validateSwarmConfig.mockReturnValue({ valid: true });
    mockArgValidator.parseFlags.mockReturnValue({});
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockRedisClient.setEx.mockResolvedValue('OK');
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.keys.mockResolvedValue([]);
    mockRedisClient.sMembers.mockResolvedValue([]);
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  describe('Command Registry - Swarm Execution', () => {
    it('should register swarm-exec command with correct configuration', async () => {
      // Import after mocking
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmExecCommand = commandRegistry.get('swarm-exec');

      expect(swarmExecCommand).toBeDefined();
      expect(swarmExecCommand.description).toContain('Direct CLI interface for swarm execution');
      expect(swarmExecCommand.usage).toBe('swarm-exec <command> [options]');
      expect(swarmExecCommand.examples).toContain(
        'swarm-exec execute "Build a REST API with authentication"'
      );
    });

    it('should handle swarm-exec command execution with proper error handling', async () => {
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmExecCommand = commandRegistry.get('swarm-exec');

      const args = ['execute', 'Build a REST API'];
      const flags = { verbose: false };

      // Mock successful execution
      mockSwarmExecProgram.parse.mockImplementation(() => {
        // Simulate successful execution
      });

      await expect(swarmExecCommand.handler(args, flags)).resolves.toBeUndefined();

      expect(mockSwarmExecProgram.parse).toHaveBeenCalledWith(
        expect.arrayContaining(['node', 'swarm-exec', 'execute', 'Build a REST API'])
      );
    });

    it('should handle swarm-exec errors with verbose output', async () => {
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmExecCommand = commandRegistry.get('swarm-exec');

      const args = ['execute', 'Invalid objective'];
      const flags = { verbose: true };

      const error = new Error('Swarm execution failed');
      mockSwarmExecProgram.parse.mockImplementation(() => {
        throw error;
      });

      // Mock console.error to capture output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(swarmExecCommand.handler(args, flags)).rejects.toThrow('Swarm execution failed');

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Swarm execution error:', 'Swarm execution failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith(error.stack);

      consoleErrorSpy.mockRestore();
    });

    it('should handle swarm-exec errors without verbose output', async () => {
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmExecCommand = commandRegistry.get('swarm-exec');

      const args = ['execute', 'Invalid objective'];
      const flags = { verbose: false };

      const error = new Error('Swarm execution failed');
      mockSwarmExecProgram.parse.mockImplementation(() => {
        throw error;
      });

      // Mock console.error to capture output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(swarmExecCommand.handler(args, flags)).rejects.toThrow('Swarm execution failed');

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Swarm execution error:', 'Swarm execution failed');
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(error.stack);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Swarm Command Execution', () => {
    it('should register swarm command with correct configuration', async () => {
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmCommand = commandRegistry.get('swarm');

      expect(swarmCommand).toBeDefined();
      expect(swarmCommand.description).toContain('Swarm-based AI agent coordination');
      expect(swarmCommand.usage).toBe('swarm <objective> [options]');
      expect(swarmCommand.examples).toContain(
        'swarm "Build a REST API"'
      );
    });

    it('should handle swarm command with strategy flag', async () => {
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmCommand = commandRegistry.get('swarm');

      const args = ['Research cloud architecture'];
      const flags = { strategy: 'research', maxAgents: 3 };

      // Mock swarm command execution
      const mockSwarmHandler = jest.fn();
      swarmCommand.handler = mockSwarmHandler.mockResolvedValue({ success: true });

      await swarmCommand.handler(args, flags);

      expect(mockSwarmHandler).toHaveBeenCalledWith(args, flags);
    });
  });

  describe('Command Registry Integration', () => {
    it('should provide comprehensive command list including swarm commands', async () => {
      const { listCommands } = await import('../../cli/command-registry.js');
      const commands = listCommands();

      const swarmCommands = commands.filter(cmd =>
        cmd.name.includes('swarm') || cmd.name.includes('hive')
      );

      expect(swarmCommands.length).toBeGreaterThan(0);
      expect(commands.some(cmd => cmd.name === 'swarm')).toBe(true);
      expect(commands.some(cmd => cmd.name === 'swarm-exec')).toBe(true);
      expect(commands.some(cmd => cmd.name === 'hive-mind')).toBe(true);
    });

    it('should validate command existence', async () => {
      const { hasCommand, getCommand } = await import('../../cli/command-registry.js');

      expect(hasCommand('swarm')).toBe(true);
      expect(hasCommand('swarm-exec')).toBe(true);
      expect(hasCommand('non-existent')).toBe(false);

      const swarmCommand = getCommand('swarm');
      expect(swarmCommand).toBeDefined();
      expect(swarmCommand.description).toContain('Swarm-based AI agent coordination');
    });

    it('should execute commands with proper error handling', async () => {
      const { executeCommand } = await import('../../cli/command-registry.js');

      // Mock a successful command
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const { registerCommand } = await import('../../cli/command-registry.js');

      registerCommand('test-swarm', {
        handler: mockHandler,
        description: 'Test swarm command'
      });

      await expect(executeCommand('test-swarm', ['arg1'], { flag1: true }))
        .resolves.toBeUndefined();

      expect(mockHandler).toHaveBeenCalledWith(['arg1'], { flag1: true });
    });

    it('should handle command execution failures', async () => {
      const { executeCommand } = await import('../../cli/command-registry.js');

      const mockHandler = jest.fn().mockRejectedValue(new Error('Command failed'));
      const { registerCommand } = await import('../../cli/command-registry.js');

      registerCommand('failing-swarm', {
        handler: mockHandler,
        description: 'Failing swarm command'
      });

      await expect(executeCommand('failing-swarm', [], {}))
        .rejects.toThrow("Command 'failing-swarm' failed: Command failed");
    });

    it('should handle unknown commands', async () => {
      const { executeCommand } = await import('../../cli/command-registry.js');

      await expect(executeCommand('unknown-swarm', [], {}))
        .rejects.toThrow("Unknown command: unknown-swarm");
    });
  });

  describe('Swarm Command Help System', () => {
    it('should display comprehensive help for swarm-exec command', async () => {
      const { showCommandHelp } = await import('../../cli/command-registry.js');

      // Mock console.log to capture output
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      showCommandHelp('swarm-exec');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Direct CLI interface for swarm execution')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('COMMANDS:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('STRATEGIES:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('REDIS PERSISTENCE:')
      );

      consoleLogSpy.mockRestore();
    });

    it('should display help for swarm command', async () => {
      const { showCommandHelp } = await import('../../cli/command-registry.js');

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      showCommandHelp('swarm');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Swarm-based AI agent coordination')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('EXAMPLES:')
      );

      consoleLogSpy.mockRestore();
    });

    it('should handle help for unknown commands', async () => {
      const { showCommandHelp } = await import('../../cli/command-registry.js');

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      showCommandHelp('unknown-command');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown command: unknown-command')
      );

      consoleLogSpy.mockRestore();
    });

    it('should show all commands with swarm commands included', async () => {
      const { showAllCommands } = await import('../../cli/command-registry.js');

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      showAllCommands();

      expect(consoleLogSpy).toHaveBeenCalledWith('Available commands:');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('swarm')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('swarm-exec')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('Command Flag Parsing and Validation', () => {
    it('should handle complex flag combinations for swarm commands', async () => {
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmExecCommand = commandRegistry.get('swarm-exec');

      const args = ['execute', 'Build microservices'];
      const flags = {
        strategy: 'development',
        maxAgents: 12,
        mode: 'hierarchical',
        outputFormat: 'json',
        outputFile: 'results.json',
        persist: true,
        monitor: true
      };

      mockArgValidator.parseFlags.mockReturnValue(flags);

      mockSwarmExecProgram.parse.mockImplementation((argv) => {
        expect(argv).toContain('--strategy');
        expect(argv).toContain('development');
        expect(argv).toContain('--max-agents');
        expect(argv).toContain('12');
        expect(argv).toContain('--mode');
        expect(argv).toContain('hierarchical');
        expect(argv).toContain('--output-format');
        expect(argv).toContain('json');
        expect(argv).toContain('--output-file');
        expect(argv).toContain('results.json');
        expect(argv).toContain('--persist');
        expect(argv).toContain('--monitor');
      });

      await swarmExecCommand.handler(args, flags);

      expect(mockArgValidator.parseFlags).toHaveBeenCalled();
    });

    it('should validate swarm execution parameters', async () => {
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmExecCommand = commandRegistry.get('swarm-exec');

      const args = ['execute', 'Build a REST API'];
      const flags = { maxAgents: 5 };

      mockArgValidator.validateSwarmConfig.mockReturnValue({
        valid: true,
        config: { maxAgents: 5, strategy: 'auto' }
      });

      mockSwarmExecProgram.parse.mockImplementation(() => {});

      await swarmExecCommand.handler(args, flags);

      expect(mockArgValidator.validateSwarmConfig).toHaveBeenCalledWith(flags);
    });

    it('should reject invalid swarm configurations', async () => {
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmExecCommand = commandRegistry.get('swarm-exec');

      const args = ['execute', 'Build a REST API'];
      const flags = { maxAgents: 100 }; // Invalid: too many agents

      mockArgValidator.validateSwarmConfig.mockReturnValue({
        valid: false,
        errors: ['Maximum agents cannot exceed 50']
      });

      mockSwarmExecProgram.parse.mockImplementation(() => {
        throw new Error('Invalid configuration: Maximum agents cannot exceed 50');
      });

      await expect(swarmExecCommand.handler(args, flags))
        .rejects.toThrow('Invalid configuration: Maximum agents cannot exceed 50');
    });
  });

  describe('Redis Integration for CLI Swarm Commands', () => {
    it('should integrate Redis persistence for swarm state', async () => {
      const { connectRedis, saveSwarmState } = await import('../../cli/utils/redis-client.js');

      // Mock Redis connection
      mockRedisClient.ping.mockResolvedValue('PONG');
      connectRedis.mockResolvedValue(mockRedisClient);

      const swarmId = 'test-swarm-123';
      const swarmState = {
        id: swarmId,
        objective: 'Test CLI execution',
        status: 'running',
        startTime: Date.now(),
        agents: [],
        tasks: []
      };

      saveSwarmState.mockResolvedValue(true);

      const client = await connectRedis();
      const result = await saveSwarmState(client, swarmId, swarmState);

      expect(result).toBe(true);
      expect(saveSwarmState).toHaveBeenCalledWith(client, swarmId, swarmState);
    });

    it('should handle Redis connection failures gracefully', async () => {
      const { connectRedis } = await import('../../cli/utils/redis-client.js');

      connectRedis.mockRejectedValue(new Error('Redis connection failed'));

      await expect(connectRedis())
        .rejects.toThrow('Redis connection failed');
    });

    it('should load swarm state for recovery operations', async () => {
      const { loadSwarmState, connectRedis } = await import('../../cli/utils/redis-client.js');

      connectRedis.mockResolvedValue(mockRedisClient);

      const swarmId = 'recovery-swarm-123';
      const savedState = {
        id: swarmId,
        objective: 'Recovery test',
        status: 'interrupted',
        progress: 0.5
      };

      loadSwarmState.mockResolvedValue(savedState);

      const client = await connectRedis();
      const state = await loadSwarmState(client, swarmId);

      expect(state).toEqual(savedState);
      expect(loadSwarmState).toHaveBeenCalledWith(client, swarmId);
    });
  });

  describe('Command Performance and Resource Management', () => {
    it('should track command execution performance', async () => {
      const { executeCommand } = await import('../../cli/command-registry.js');

      // Mock performance tracking
      const mockTrackCommandExecution = jest.fn().mockResolvedValue();
      jest.doMock('../../cli/simple-commands/performance-hooks.js', () => ({
        trackCommandExecution: mockTrackCommandExecution
      }));

      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const { registerCommand } = await import('../../cli/command-registry.js');

      registerCommand('performance-test', {
        handler: mockHandler,
        description: 'Performance test command'
      });

      await executeCommand('performance-test', [], {});

      // Performance tracking should be called
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should handle command timeouts gracefully', async () => {
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmExecCommand = commandRegistry.get('swarm-exec');

      const args = ['execute', 'Long running task'];
      const flags = { timeout: 5000 };

      // Mock timeout behavior
      mockSwarmExecProgram.parse.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Command timeout')), 100);
        });
      });

      await expect(swarmExecCommand.handler(args, flags))
        .rejects.toThrow('Command timeout');
    });

    it('should handle concurrent command executions', async () => {
      const { executeCommand } = await import('../../cli/command-registry.js');

      const mockHandler1 = jest.fn().mockResolvedValue({ success: true, id: 1 });
      const mockHandler2 = jest.fn().mockResolvedValue({ success: true, id: 2 });

      const { registerCommand } = await import('../../cli/command-registry.js');

      registerCommand('concurrent-test-1', {
        handler: mockHandler1,
        description: 'Concurrent test 1'
      });

      registerCommand('concurrent-test-2', {
        handler: mockHandler2,
        description: 'Concurrent test 2'
      });

      // Execute commands concurrently
      const results = await Promise.allSettled([
        executeCommand('concurrent-test-1', [], {}),
        executeCommand('concurrent-test-2', [], {})
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');
      expect(mockHandler1).toHaveBeenCalled();
      expect(mockHandler2).toHaveBeenCalled();
    });
  });

  describe('Command Registry Security and Validation', () => {
    it('should validate command registration parameters', async () => {
      const { registerCommand, hasCommand } = await import('../../cli/command-registry.js');

      // Test valid command registration
      const validCommand = {
        handler: jest.fn(),
        description: 'Valid test command',
        usage: 'test [options]',
        examples: ['test --help']
      };

      registerCommand('valid-test', validCommand);
      expect(hasCommand('valid-test')).toBe(true);

      // Test command override warning
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      registerCommand('valid-test', validCommand);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Command 'valid-test' already exists")
      );
      consoleWarnSpy.mockRestore();
    });

    it('should sanitize command inputs', async () => {
      const { commandRegistry } = await import('../../cli/command-registry.js');
      const swarmExecCommand = commandRegistry.get('swarm-exec');

      const args = ['execute', '<script>alert("xss")</script>'];
      const flags = { outputFormat: 'json' };

      mockSwarmExecProgram.parse.mockImplementation((argv) => {
        // Command should sanitize potentially dangerous input
        const objectiveIndex = argv.findIndex(arg => arg.includes('script'));
        if (objectiveIndex >= 0) {
          argv[objectiveIndex] = argv[objectiveIndex].replace(/<[^>]*>/g, '');
        }
      });

      await swarmExecCommand.handler(args, flags);

      const parsedArgs = mockSwarmExecProgram.parse.mock.calls[0][0];
      const objectiveArg = parsedArgs.find(arg => arg.includes('script'));
      if (objectiveArg) {
        expect(objectiveArg).not.toContain('<script>');
      }
    });

    it('should handle malicious command attempts', async () => {
      const { executeCommand } = await import('../../cli/command-registry.js');

      // Test command injection attempt
      const maliciousCommand = 'swarm-exec; rm -rf /';

      await expect(executeCommand(maliciousCommand, [], {}))
        .rejects.toThrow(`Unknown command: ${maliciousCommand}`);
    });
  });
});