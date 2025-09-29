/**
 * Claude CLI Mock Utilities
 * Comprehensive mocking for Claude Code CLI interactions
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

/**
 * Enhanced Claude CLI Mock
 */
export class ClaudeCliMock {
  constructor(options = {}) {
    this.options = {
      installed: true,
      version: '1.0.0',
      mcpEnabled: true,
      responseDelay: 0,
      failureRate: 0,
      ...options
    };

    this.commandHistory = [];
    this.serverList = new Map();
    this.callCount = new Map();
    this.responses = new Map();
  }

  /**
   * Setup mock for child_process.execSync
   */
  mockExecSync() {
    const originalExecSync = jest.requireActual('child_process').execSync;

    return jest.fn((command, options = {}) => {
      this.commandHistory.push({ command, options, timestamp: Date.now() });

      // Increment call count
      const callCount = this.callCount.get(command) || 0;
      this.callCount.set(command, callCount + 1);

      // Simulate random failures
      if (Math.random() < this.options.failureRate) {
        throw new Error('Random CLI failure');
      }

      // Add response delay
      if (this.options.responseDelay > 0) {
        const start = Date.now();
        while (Date.now() - start < this.options.responseDelay) {
          // Busy wait to simulate delay
        }
      }

      // Handle specific commands
      if (command.includes('which claude') || command.includes('claude --version')) {
        return this.handleVersionCommand(command);
      }

      if (command.includes('claude mcp list')) {
        return this.handleListCommand(command);
      }

      if (command.includes('claude mcp remove')) {
        return this.handleRemoveCommand(command);
      }

      if (command.includes('claude mcp add')) {
        return this.handleAddCommand(command);
      }

      // Custom responses
      if (this.responses.has(command)) {
        const response = this.responses.get(command);
        if (typeof response === 'function') {
          return response(command, options);
        }
        return response;
      }

      // Default to original implementation for unhandled commands
      try {
        return originalExecSync(command, { ...options, timeout: 5000 });
      } catch (error) {
        throw new Error(`Mock CLI: Command not recognized: ${command}`);
      }
    });
  }

  /**
   * Setup mock for child_process.spawn
   */
  mockSpawn() {
    const originalSpawn = jest.requireActual('child_process').spawn;

    return jest.fn((command, args = [], options = {}) => {
      const fullCommand = `${command} ${args.join(' ')}`;
      this.commandHistory.push({ command: fullCommand, options, timestamp: Date.now() });

      // Create mock child process
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = jest.fn();

      // Simulate command execution
      setTimeout(() => {
        if (this.options.installed && command === 'claude') {
          this.handleSpawnCommand(mockChild, command, args);
        } else {
          mockChild.emit('error', new Error('Command not found'));
        }
      }, this.options.responseDelay);

      return mockChild;
    });
  }

  /**
   * Handle version command
   */
  handleVersionCommand(command) {
    if (!this.options.installed) {
      throw new Error('claude: command not found');
    }

    if (command.includes('which claude')) {
      return `/usr/local/bin/claude`;
    }

    if (command.includes('claude --version')) {
      return `claude version ${this.options.version}`;
    }

    throw new Error('Unknown version command');
  }

  /**
   * Handle MCP list command
   */
  handleListCommand(command) {
    if (!this.options.mcpEnabled) {
      throw new Error('MCP not enabled');
    }

    let output = 'MCP Servers:\n';

    if (this.serverList.size === 0) {
      output += '  No servers configured\n';
    } else {
      for (const [name, config] of this.serverList.entries()) {
        const status = config.running ? '✓' : '✗';
        output += `  ${status} ${name} (${config.running ? 'running' : 'stopped'})\n`;
      }
    }

    if (this.serverList.has('claude-flow-novice')) {
      output += '\n✓ Connected';
    }

    return output;
  }

  /**
   * Handle MCP remove command
   */
  handleRemoveCommand(command) {
    const match = command.match(/claude mcp remove (\S+)/);
    if (!match) {
      throw new Error('Invalid remove command syntax');
    }

    const serverName = match[1];
    if (this.serverList.has(serverName)) {
      this.serverList.delete(serverName);
      return `Server '${serverName}' removed successfully`;
    } else {
      throw new Error(`Server '${serverName}' not found`);
    }
  }

  /**
   * Handle MCP add command
   */
  handleAddCommand(command) {
    const match = command.match(/claude mcp add (\S+)/);
    if (!match) {
      throw new Error('Invalid add command syntax');
    }

    const serverName = match[1];
    this.serverList.set(serverName, {
      running: true,
      command: 'npx',
      args: [serverName]
    });

    return `Server '${serverName}' added successfully`;
  }

  /**
   * Handle spawn commands
   */
  handleSpawnCommand(mockChild, command, args) {
    if (args[0] === 'mcp' && args[1] === 'list') {
      const output = this.handleListCommand(`${command} ${args.join(' ')}`);
      mockChild.stdout.emit('data', output);
      mockChild.emit('close', 0);
    } else {
      mockChild.stderr.emit('data', 'Unknown command');
      mockChild.emit('close', 1);
    }
  }

  /**
   * Add server to mock list
   */
  addServer(name, config = {}) {
    this.serverList.set(name, {
      running: true,
      command: 'npx',
      args: [name],
      ...config
    });
  }

  /**
   * Remove server from mock list
   */
  removeServer(name) {
    this.serverList.delete(name);
  }

  /**
   * Set custom response for command
   */
  setResponse(command, response) {
    this.responses.set(command, response);
  }

  /**
   * Get command history
   */
  getCommandHistory() {
    return [...this.commandHistory];
  }

  /**
   * Get call count for command
   */
  getCallCount(command) {
    return this.callCount.get(command) || 0;
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.commandHistory = [];
    this.callCount.clear();
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.clearHistory();
    this.serverList.clear();
    this.responses.clear();
  }

  /**
   * Create realistic scenarios
   */
  createScenario(scenarioName) {
    this.reset();

    switch (scenarioName) {
      case 'fresh-install':
        // No servers configured
        break;

      case 'existing-servers':
        this.addServer('claude-flow-novice', { running: true });
        this.addServer('other-server', { running: false });
        break;

      case 'broken-servers':
        this.addServer('broken-server', { running: false, error: 'Connection failed' });
        this.addServer('claude-flow-novice', { running: true });
        break;

      case 'cli-not-installed':
        this.options.installed = false;
        break;

      case 'mcp-disabled':
        this.options.mcpEnabled = false;
        break;

      case 'slow-responses':
        this.options.responseDelay = 2000;
        break;

      case 'unreliable-cli':
        this.options.failureRate = 0.3; // 30% failure rate
        break;

      default:
        throw new Error(`Unknown scenario: ${scenarioName}`);
    }
  }
}

/**
 * File System Mock for configuration files
 */
export class FileSystemMock {
  constructor() {
    this.files = new Map();
    this.directories = new Set();
    this.permissions = new Map();
    this.readDelay = 0;
    this.writeDelay = 0;
    this.failureRate = 0;
  }

  /**
   * Mock fs/promises module
   */
  mockFsPromises() {
    const originalFs = jest.requireActual('fs/promises');

    return {
      ...originalFs,
      readFile: jest.fn(async (filePath, encoding) => {
        await this.simulateDelay(this.readDelay);
        this.simulateFailure();

        if (!this.files.has(filePath)) {
          const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
          error.code = 'ENOENT';
          throw error;
        }

        const permission = this.permissions.get(filePath);
        if (permission && !permission.readable) {
          const error = new Error(`EACCES: permission denied, open '${filePath}'`);
          error.code = 'EACCES';
          throw error;
        }

        const content = this.files.get(filePath);
        return encoding ? content : Buffer.from(content);
      }),

      writeFile: jest.fn(async (filePath, data) => {
        await this.simulateDelay(this.writeDelay);
        this.simulateFailure();

        const permission = this.permissions.get(filePath);
        if (permission && !permission.writable) {
          const error = new Error(`EACCES: permission denied, open '${filePath}'`);
          error.code = 'EACCES';
          throw error;
        }

        this.files.set(filePath, data.toString());
      }),

      access: jest.fn(async (filePath, mode) => {
        if (!this.files.has(filePath)) {
          const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`);
          error.code = 'ENOENT';
          throw error;
        }

        const permission = this.permissions.get(filePath);
        if (permission) {
          const fs = jest.requireActual('fs');
          if ((mode & fs.constants.R_OK) && !permission.readable) {
            const error = new Error(`EACCES: permission denied, access '${filePath}'`);
            error.code = 'EACCES';
            throw error;
          }
          if ((mode & fs.constants.W_OK) && !permission.writable) {
            const error = new Error(`EACCES: permission denied, access '${filePath}'`);
            error.code = 'EACCES';
            throw error;
          }
        }
      }),

      mkdir: jest.fn(async (dirPath, options) => {
        this.directories.add(dirPath);
      }),

      rm: jest.fn(async (path, options) => {
        if (this.files.has(path)) {
          this.files.delete(path);
        }
        if (this.directories.has(path)) {
          this.directories.delete(path);
        }
      }),

      copyFile: jest.fn(async (src, dest) => {
        if (!this.files.has(src)) {
          const error = new Error(`ENOENT: no such file or directory, open '${src}'`);
          error.code = 'ENOENT';
          throw error;
        }
        this.files.set(dest, this.files.get(src));
      }),

      chmod: jest.fn(async (filePath, mode) => {
        if (!this.files.has(filePath)) {
          const error = new Error(`ENOENT: no such file or directory, chmod '${filePath}'`);
          error.code = 'ENOENT';
          throw error;
        }
        // Update permissions based on mode
        this.permissions.set(filePath, {
          readable: (mode & 0o444) !== 0,
          writable: (mode & 0o222) !== 0,
          executable: (mode & 0o111) !== 0
        });
      })
    };
  }

  /**
   * Add file to mock filesystem
   */
  addFile(filePath, content) {
    this.files.set(filePath, content);
  }

  /**
   * Add directory to mock filesystem
   */
  addDirectory(dirPath) {
    this.directories.add(dirPath);
  }

  /**
   * Set file permissions
   */
  setPermissions(filePath, permissions) {
    this.permissions.set(filePath, permissions);
  }

  /**
   * Simulate delay
   */
  async simulateDelay(delay) {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Simulate random failures
   */
  simulateFailure() {
    if (Math.random() < this.failureRate) {
      throw new Error('Random filesystem failure');
    }
  }

  /**
   * Reset mock filesystem
   */
  reset() {
    this.files.clear();
    this.directories.clear();
    this.permissions.clear();
  }

  /**
   * Create filesystem scenario
   */
  createScenario(scenarioName) {
    this.reset();

    switch (scenarioName) {
      case 'empty':
        // No files
        break;

      case 'valid-configs':
        this.addFile('/test/.claude.json', JSON.stringify({
          mcpServers: {
            'local-server': {
              command: 'node',
              args: ['local-server.js']
            }
          }
        }, null, 2));

        this.addFile('/test/.mcp.json', JSON.stringify({
          mcpServers: {
            'claude-flow-novice': {
              command: 'npx',
              args: ['claude-flow-novice', 'mcp', 'start']
            }
          }
        }, null, 2));
        break;

      case 'corrupted-configs':
        this.addFile('/test/.claude.json', 'invalid json content');
        this.addFile('/test/.mcp.json', '{"incomplete": json');
        break;

      case 'permission-denied':
        this.addFile('/test/.claude.json', '{"test": true}');
        this.setPermissions('/test/.claude.json', {
          readable: false,
          writable: false,
          executable: false
        });
        break;

      case 'slow-filesystem':
        this.readDelay = 1000;
        this.writeDelay = 1000;
        break;

      case 'unreliable-filesystem':
        this.failureRate = 0.2; // 20% failure rate
        break;

      default:
        throw new Error(`Unknown filesystem scenario: ${scenarioName}`);
    }
  }
}

/**
 * System Mock for OS-level operations
 */
export class SystemMock {
  constructor() {
    this.platform = 'linux';
    this.arch = 'x64';
    this.homeDir = '/home/testuser';
    this.tempDir = '/tmp';
    this.pathSeparator = '/';
    this.executableExtension = '';
  }

  /**
   * Mock os module
   */
  mockOs() {
    return {
      platform: jest.fn(() => this.platform),
      arch: jest.fn(() => this.arch),
      homedir: jest.fn(() => this.homeDir),
      tmpdir: jest.fn(() => this.tempDir),
      type: jest.fn(() => 'Linux'),
      release: jest.fn(() => '5.4.0'),
      hostname: jest.fn(() => 'test-machine')
    };
  }

  /**
   * Mock path module
   */
  mockPath() {
    const originalPath = jest.requireActual('path');
    return {
      ...originalPath,
      sep: this.pathSeparator,
      join: jest.fn((...args) => args.join(this.pathSeparator)),
      resolve: jest.fn((...args) => {
        const joined = args.join(this.pathSeparator);
        return joined.startsWith(this.pathSeparator) ? joined : `${process.cwd()}${this.pathSeparator}${joined}`;
      })
    };
  }

  /**
   * Set platform
   */
  setPlatform(platform) {
    this.platform = platform;
    if (platform === 'win32') {
      this.pathSeparator = '\\';
      this.executableExtension = '.exe';
      this.homeDir = 'C:\\Users\\testuser';
      this.tempDir = 'C:\\Temp';
    } else {
      this.pathSeparator = '/';
      this.executableExtension = '';
      this.homeDir = '/home/testuser';
      this.tempDir = '/tmp';
    }
  }

  /**
   * Create system scenario
   */
  createScenario(scenarioName) {
    switch (scenarioName) {
      case 'linux':
        this.setPlatform('linux');
        break;

      case 'windows':
        this.setPlatform('win32');
        break;

      case 'macos':
        this.setPlatform('darwin');
        this.homeDir = '/Users/testuser';
        break;

      default:
        throw new Error(`Unknown system scenario: ${scenarioName}`);
    }
  }
}

// Export factory functions for easy test setup
export function createClaudeCliMock(options) {
  return new ClaudeCliMock(options);
}

export function createFileSystemMock() {
  return new FileSystemMock();
}

export function createSystemMock() {
  return new SystemMock();
}

// Helper to setup all mocks at once
export function setupCompleteMock(options = {}) {
  const claudeCli = createClaudeCliMock(options.cli);
  const fileSystem = createFileSystemMock();
  const system = createSystemMock();

  // Apply scenarios if specified
  if (options.scenario) {
    const { cli: cliScenario, fs: fsScenario, system: systemScenario } = options.scenario;

    if (cliScenario) claudeCli.createScenario(cliScenario);
    if (fsScenario) fileSystem.createScenario(fsScenario);
    if (systemScenario) system.createScenario(systemScenario);
  }

  return {
    claudeCli,
    fileSystem,
    system,
    activateMocks() {
      const { execSync } = jest.requireMock('child_process');
      const { spawn } = jest.requireMock('child_process');

      execSync.mockImplementation(claudeCli.mockExecSync());
      spawn.mockImplementation(claudeCli.mockSpawn());

      // Apply other mocks as needed
    },
    cleanup() {
      claudeCli.reset();
      fileSystem.reset();
    }
  };
}