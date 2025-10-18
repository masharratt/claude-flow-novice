/**
 * MCP Test Setup - Core testing utilities and environment setup
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { jest } from '@jest/globals';

// Global test configuration
global.TEST_CONFIG = {
  tempDir: path.join(os.tmpdir(), 'claude-flow-mcp-tests'),
  fixtures: path.join(process.cwd(), 'tests/mcp/fixtures'),
  timeout: 30000,
  verbose: process.env.VERBOSE_TESTS === 'true'
};

// Setup test environment before each test file
beforeAll(async () => {
  // Create temporary test directory
  try {
    await fs.mkdir(global.TEST_CONFIG.tempDir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }

  // Set environment variables for tests
  process.env.NODE_ENV = 'test';
  process.env.CLAUDE_FLOW_NOVICE_MODE = 'test';
  process.env.CLAUDE_CONFIG_PATH = path.join(global.TEST_CONFIG.tempDir, '.claude.json');
  process.env.MCP_PROJECT_CONFIG_PATH = path.join(global.TEST_CONFIG.tempDir, '.mcp.json');
});

// Cleanup after each test file
afterAll(async () => {
  // Clean up temporary files
  try {
    await fs.rm(global.TEST_CONFIG.tempDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Warning: Failed to cleanup test directory: ${error.message}`);
  }
});

// Enhanced test utilities
global.testUtils = {
  /**
   * Create a temporary file with content
   */
  async createTempFile(filename, content) {
    const filePath = path.join(global.TEST_CONFIG.tempDir, filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  },

  /**
   * Create a temporary directory
   */
  async createTempDir(dirname) {
    const dirPath = path.join(global.TEST_CONFIG.tempDir, dirname);
    await fs.mkdir(dirPath, { recursive: true });
    return dirPath;
  },

  /**
   * Read file content safely
   */
  async readFile(filePath) {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      return null;
    }
  },

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Create mock Claude config
   */
  async createMockClaudeConfig(config = {}) {
    const defaultConfig = {
      mcpServers: {
        'test-server': {
          command: 'node',
          args: ['test-server.js'],
          env: {}
        }
      }
    };

    const mergedConfig = { ...defaultConfig, ...config };
    const configPath = process.env.CLAUDE_CONFIG_PATH;
    await fs.writeFile(configPath, JSON.stringify(mergedConfig, null, 2));
    return configPath;
  },

  /**
   * Create mock MCP project config
   */
  async createMockProjectConfig(config = {}) {
    const defaultConfig = {
      mcpServers: {
        'claude-flow-novice': {
          command: 'npx',
          args: ['claude-flow-novice', 'mcp', 'start'],
          env: {
            NODE_ENV: 'production'
          }
        }
      }
    };

    const mergedConfig = { ...defaultConfig, ...config };
    const configPath = process.env.MCP_PROJECT_CONFIG_PATH;
    await fs.writeFile(configPath, JSON.stringify(mergedConfig, null, 2));
    return configPath;
  },

  /**
   * Wait for a condition to be true
   */
  async waitFor(condition, timeout = 5000, interval = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  },

  /**
   * Generate test data
   */
  generateTestData: {
    /**
     * Generate broken MCP server config
     */
    brokenMcpServer(type = 'missing-file') {
      switch (type) {
        case 'missing-file':
          return {
            command: 'node',
            args: ['/non/existent/path/server.js'],
            env: {}
          };
        case 'missing-command':
          return {
            command: 'non-existent-command',
            args: ['--start'],
            env: {}
          };
        case 'claude-flow-legacy':
          return {
            command: 'node',
            args: ['./.claude-flow-novice/src/mcp/mcp-server.js'],
            env: {}
          };
        case 'invalid-json':
          return 'this is not valid json';
        default:
          throw new Error(`Unknown broken server type: ${type}`);
      }
    },

    /**
     * Generate large configuration
     */
    largeConfiguration(serverCount = 100) {
      const servers = {};
      for (let i = 0; i < serverCount; i++) {
        servers[`test-server-${i}`] = {
          command: 'node',
          args: [`server-${i}.js`],
          env: {
            PORT: `${3000 + i}`,
            NODE_ENV: 'production'
          }
        };
      }
      return { mcpServers: servers };
    }
  }
};

// Mock console methods for testing log output
global.mockConsole = {
  setup() {
    const originalConsole = { ...console };
    const logs = {
      log: [],
      warn: [],
      error: [],
      info: []
    };

    ['log', 'warn', 'error', 'info'].forEach(method => {
      console[method] = jest.fn((...args) => {
        logs[method].push(args.join(' '));
        if (global.TEST_CONFIG.verbose) {
          originalConsole[method](...args);
        }
      });
    });

    return { logs, restore: () => Object.assign(console, originalConsole) };
  }
};

// Error assertion helpers
global.expectError = {
  /**
   * Expect function to throw with specific message pattern
   */
  async toThrowWithMessage(asyncFn, messagePattern) {
    try {
      await asyncFn();
      throw new Error('Expected function to throw');
    } catch (error) {
      if (messagePattern instanceof RegExp) {
        expect(error.message).toMatch(messagePattern);
      } else {
        expect(error.message).toContain(messagePattern);
      }
    }
  }
};

// Performance testing utilities
global.performanceUtils = {
  /**
   * Measure execution time
   */
  async measureTime(fn) {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    return {
      result,
      duration: Number(end - start) / 1000000 // Convert to milliseconds
    };
  },

  /**
   * Memory usage snapshot
   */
  getMemoryUsage() {
    return process.memoryUsage();
  }
};

// Custom matchers
expect.extend({
  toBeValidMcpConfig(received) {
    const pass = received &&
      typeof received === 'object' &&
      received.mcpServers &&
      typeof received.mcpServers === 'object';

    return {
      message: () => `expected ${received} to be a valid MCP configuration`,
      pass
    };
  },

  toHaveValidServerEntry(received, serverName) {
    const server = received?.mcpServers?.[serverName];
    const pass = server &&
      typeof server.command === 'string' &&
      Array.isArray(server.args);

    return {
      message: () => `expected MCP config to have valid server entry for ${serverName}`,
      pass
    };
  }
});