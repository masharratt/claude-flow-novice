/**
 * Unit Tests for McpConfigurationManager
 * Comprehensive testing of core functionality with edge cases and error scenarios
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';

// Import the class under test
import { McpConfigurationManager, enhancedMcpInit, quickMcpHealthCheck } from '../../../src/mcp/mcp-config-manager.js';

// Mock external dependencies
jest.mock('child_process');
jest.mock('fs', () => ({
  existsSync: jest.fn()
}));

describe('McpConfigurationManager', () => {
  let manager;
  let mockConsole;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock console
    mockConsole = global.mockConsole.setup();

    // Create fresh manager instance
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

  describe('Constructor and Initialization', () => {
    test('should initialize with default options', () => {
      const defaultManager = new McpConfigurationManager();

      expect(defaultManager.autoFix).toBe(true);
      expect(defaultManager.dryRun).toBe(false);
      expect(defaultManager.verbose).toBe(false);
      expect(defaultManager.operationLog).toEqual([]);
      expect(defaultManager.rollbackStack).toEqual([]);
    });

    test('should initialize with custom options', () => {
      const customManager = new McpConfigurationManager({
        verbose: true,
        autoFix: false,
        dryRun: true
      });

      expect(customManager.verbose).toBe(true);
      expect(customManager.autoFix).toBe(false);
      expect(customManager.dryRun).toBe(true);
    });

    test('should find Claude config path correctly', () => {
      const configPath = manager.findClaudeConfigPath();
      expect(configPath).toContain('.claude.json');
    });
  });

  describe('Configuration Detection', () => {
    test('should detect existing configurations', async () => {
      const state = await manager.detectConfigurationState();

      expect(state).toHaveProperty('hasLocalConfig');
      expect(state).toHaveProperty('hasProjectConfig');
      expect(state).toHaveProperty('localServers');
      expect(state).toHaveProperty('projectServers');
      expect(state).toHaveProperty('healthScore');
      expect(state.healthScore).toBeGreaterThanOrEqual(0);
      expect(state.healthScore).toBeLessThanOrEqual(100);
    });

    test('should handle missing configuration files gracefully', async () => {
      // Create manager with non-existent paths
      const tempManager = new McpConfigurationManager();
      tempManager.localConfigPath = '/non/existent/path/.claude.json';
      tempManager.projectConfigPath = '/non/existent/path/.mcp.json';

      const state = await tempManager.detectConfigurationState();

      expect(state.hasLocalConfig).toBe(false);
      expect(state.hasProjectConfig).toBe(false);
      expect(state.localServers).toHaveLength(0);
      expect(state.projectServers).toHaveLength(0);
    });

    test('should calculate health score correctly', async () => {
      // Create configuration with known issues
      const brokenConfig = {
        mcpServers: {
          'broken-server': global.testUtils.generateTestData.brokenMcpServer('missing-file'),
          'another-broken': global.testUtils.generateTestData.brokenMcpServer('missing-command')
        }
      };

      await global.testUtils.createMockProjectConfig(brokenConfig);

      const state = await manager.detectConfigurationState();

      expect(state.healthScore).toBeLessThan(100);
      expect(state.brokenPaths.length).toBeGreaterThan(0);
      expect(state.criticalIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Server Path Validation', () => {
    test('should detect broken server paths', async () => {
      const brokenServer = {
        name: 'test-server',
        command: 'non-existent-command',
        args: ['--start']
      };

      const issues = await manager.checkServerPath(brokenServer);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(issue => issue.includes('not found'))).toBe(true);
    });

    test('should detect legacy claude-flow-novice patterns', async () => {
      const legacyServer = {
        name: 'claude-flow-novice',
        command: 'node',
        args: ['./.claude-flow-novice/src/mcp/mcp-server.js']
      };

      const issues = await manager.checkServerPath(legacyServer);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(issue => issue.includes('.claude-flow-novice'))).toBe(true);
    });

    test('should validate npx-based configurations correctly', async () => {
      const validServer = {
        name: 'claude-flow-novice',
        command: 'npx',
        args: ['claude-flow-novice', 'mcp', 'start']
      };

      const issues = await manager.checkServerPath(validServer);
      expect(issues).toHaveLength(0);
    });

    test('should calculate issue severity correctly', () => {
      const criticalIssues = ['Command not found in PATH'];
      const highIssues = ['Arguments reference non-existent .claude-flow-novice directory'];
      const mediumIssues = ['Missing command field'];

      expect(manager.calculateIssueSeverity(criticalIssues)).toBe('critical');
      expect(manager.calculateIssueSeverity(highIssues)).toBe('high');
      expect(manager.calculateIssueSeverity(mediumIssues)).toBe('medium');
    });
  });

  describe('Backup Operations', () => {
    test('should create backups successfully', async () => {
      const configPath = await global.testUtils.createTempFile('test-config.json', '{"test": true}');
      const backupPath = await manager.createConfigBackup(configPath, 'test');

      expect(backupPath).toBeTruthy();
      expect(backupPath).toContain('backup-test');
      expect(await global.testUtils.fileExists(backupPath)).toBe(true);
    });

    test('should handle backup creation for non-existent files', async () => {
      const backupPath = await manager.createConfigBackup('/non/existent/file.json', 'test');
      expect(backupPath).toBeNull();
    });

    test('should add rollback operations correctly', async () => {
      const configPath = await global.testUtils.createTempFile('test-config.json', '{"test": true}');
      await manager.createConfigBackup(configPath, 'test');

      expect(manager.rollbackStack.length).toBeGreaterThan(0);
      expect(manager.rollbackStack[0].type).toBe('restore-backup');
    });
  });

  describe('Configuration Conflict Detection', () => {
    test('should find conflicting servers', () => {
      const localServers = [
        { name: 'server1', command: 'node', args: ['local.js'] },
        { name: 'server2', command: 'node', args: ['local2.js'] }
      ];

      const projectServers = [
        { name: 'server1', command: 'npx', args: ['project-server'] },
        { name: 'server3', command: 'node', args: ['project3.js'] }
      ];

      const conflicts = manager.findConflictingServers(localServers, projectServers);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].serverName).toBe('server1');
      expect(conflicts[0].localConfig).toBeTruthy();
      expect(conflicts[0].projectConfig).toBeTruthy();
    });

    test('should handle empty server lists', () => {
      const conflicts = manager.findConflictingServers([], []);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('Claude CLI Integration', () => {
    test('should detect Claude Code installation', () => {
      // Mock successful CLI detection
      execSync.mockReturnValue('claude version 1.0.0');

      const isInstalled = manager.isClaudeCodeInstalled();
      expect(isInstalled).toBe(true);
    });

    test('should handle missing Claude Code CLI', () => {
      // Mock CLI not found
      execSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const isInstalled = manager.isClaudeCodeInstalled();
      expect(isInstalled).toBe(false);
    });
  });

  describe('Configuration Extraction', () => {
    test('should extract MCP servers correctly', () => {
      const config = {
        mcpServers: {
          'server1': { command: 'node', args: ['server1.js'] },
          'server2': { command: 'npx', args: ['server2'] }
        },
        otherProperty: 'ignored'
      };

      const servers = manager.extractMcpServers(config);

      expect(servers).toHaveLength(2);
      expect(servers[0].name).toBe('server1');
      expect(servers[1].name).toBe('server2');
    });

    test('should handle config without mcpServers', () => {
      const config = { otherProperty: 'value' };
      const servers = manager.extractMcpServers(config);
      expect(servers).toHaveLength(0);
    });

    test('should handle null/undefined config', () => {
      expect(manager.extractMcpServers(null)).toHaveLength(0);
      expect(manager.extractMcpServers(undefined)).toHaveLength(0);
    });
  });

  describe('File Operations', () => {
    test('should read local config correctly', async () => {
      const testConfig = { mcpServers: { test: { command: 'test' } } };
      await global.testUtils.createMockClaudeConfig(testConfig);

      const config = await manager.readLocalConfig();
      expect(config).toEqual(testConfig);
    });

    test('should read project config correctly', async () => {
      const testConfig = { mcpServers: { test: { command: 'test' } } };
      await global.testUtils.createMockProjectConfig(testConfig);

      const config = await manager.readProjectConfig();
      expect(config).toEqual(testConfig);
    });

    test('should handle corrupted JSON files', async () => {
      await global.testUtils.createTempFile(
        path.basename(process.env.CLAUDE_CONFIG_PATH),
        'invalid json content'
      );

      const config = await manager.readLocalConfig();
      expect(config).toBeNull();
    });

    test('should check file existence correctly', async () => {
      const existingFile = await global.testUtils.createTempFile('exists.txt', 'content');
      const nonExistentFile = path.join(global.TEST_CONFIG.tempDir, 'does-not-exist.txt');

      expect(await manager.fileExists(existingFile)).toBe(true);
      expect(await manager.fileExists(nonExistentFile)).toBe(false);
    });
  });

  describe('Logging and Operation Tracking', () => {
    test('should log operations correctly', () => {
      manager.log('Test message', 'info');

      expect(manager.operationLog).toHaveLength(1);
      expect(manager.operationLog[0].message).toBe('Test message');
      expect(manager.operationLog[0].level).toBe('info');
      expect(manager.operationLog[0].timestamp).toBeTruthy();
    });

    test('should respect verbose setting', () => {
      const verboseManager = new McpConfigurationManager({ verbose: true });
      const quietManager = new McpConfigurationManager({ verbose: false });

      verboseManager.log('Verbose message', 'info');
      quietManager.log('Quiet message', 'info');

      // Both should log to operationLog
      expect(verboseManager.operationLog).toHaveLength(1);
      expect(quietManager.operationLog).toHaveLength(1);
    });

    test('should always show error and warning messages', () => {
      manager.log('Error message', 'error');
      manager.log('Warning message', 'warn');

      expect(manager.operationLog).toHaveLength(2);
    });
  });

  describe('Recommendation Generation', () => {
    test('should generate recommendations for broken paths', () => {
      const state = {
        brokenPaths: [{ serverName: 'broken', issues: ['not found'] }],
        conflictingServers: [],
        healthScore: 50
      };

      const recommendations = manager.generateRecommendations(state);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('fix-broken-paths');
      expect(recommendations[0].priority).toBe('high');
    });

    test('should generate recommendations for conflicts', () => {
      const state = {
        brokenPaths: [],
        conflictingServers: [{ serverName: 'conflict' }],
        healthScore: 70
      };

      const recommendations = manager.generateRecommendations(state);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('resolve-conflicts');
      expect(recommendations[0].priority).toBe('medium');
    });

    test('should handle healthy state', () => {
      const state = {
        brokenPaths: [],
        conflictingServers: [],
        healthScore: 100
      };

      const recommendations = manager.generateRecommendations(state);
      expect(recommendations).toHaveLength(0);
    });
  });

  describe('Error Analysis', () => {
    test('should analyze permission errors correctly', () => {
      const error = new Error('Permission denied');
      const analysis = manager.analyzeError(error);

      expect(analysis.type).toBe('permission');
      expect(analysis.severity).toBe('high');
      expect(analysis.category).toBe('filesystem');
    });

    test('should analyze missing file errors', () => {
      const error = new Error('File not found ENOENT');
      const analysis = manager.analyzeError(error);

      expect(analysis.type).toBe('missing-file');
      expect(analysis.severity).toBe('high');
      expect(analysis.category).toBe('filesystem');
    });

    test('should analyze Claude CLI missing errors', () => {
      const error = new Error('claude not installed');
      const analysis = manager.analyzeError(error);

      expect(analysis.type).toBe('missing-dependency');
      expect(analysis.severity).toBe('critical');
      expect(analysis.category).toBe('environment');
      expect(analysis.recoverable).toBe(false);
    });

    test('should analyze timeout errors', () => {
      const error = new Error('Operation timed out');
      const analysis = manager.analyzeError(error);

      expect(analysis.type).toBe('timeout');
      expect(analysis.severity).toBe('medium');
      expect(analysis.category).toBe('network');
    });

    test('should analyze JSON parsing errors', () => {
      const error = new Error('JSON parse error');
      const analysis = manager.analyzeError(error);

      expect(analysis.type).toBe('config-corruption');
      expect(analysis.severity).toBe('high');
      expect(analysis.category).toBe('configuration');
    });
  });

  describe('Recovery Actions Generation', () => {
    test('should generate permission error recovery actions', () => {
      const error = new Error('Permission denied');
      const recovery = { errorAnalysis: manager.analyzeError(error), backupsAvailable: false };
      const actions = manager.generateRecoveryActions(error, recovery);

      expect(actions).toContain('Check file permissions on configuration files');
      expect(actions).toContain('Run with appropriate user privileges');
    });

    test('should generate missing dependency recovery actions', () => {
      const error = new Error('claude not installed');
      const recovery = { errorAnalysis: manager.analyzeError(error), backupsAvailable: false };
      const actions = manager.generateRecoveryActions(error, recovery);

      expect(actions).toContain('Install Claude Code: npm install -g @anthropic-ai/claude-code');
      expect(actions).toContain('Verify installation: claude --version');
    });

    test('should include backup restoration when available', () => {
      const error = new Error('JSON parse error');
      const recovery = { errorAnalysis: manager.analyzeError(error), backupsAvailable: true };
      const actions = manager.generateRecoveryActions(error, recovery);

      expect(actions).toContain('Restore from automatic backup');
    });
  });
});

describe('Enhanced MCP Initialization Function', () => {
  let mockConsole;

  beforeEach(() => {
    mockConsole = global.mockConsole.setup();
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockConsole.restore();
  });

  test('should initialize with default options', async () => {
    // Mock Claude CLI as available
    execSync.mockReturnValue('claude version 1.0.0');

    const result = await enhancedMcpInit({
      dryRun: true,
      verbose: false,
      enhancedUx: false
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('details');
  });

  test('should handle missing Claude Code CLI', async () => {
    // Mock Claude CLI as not available
    execSync.mockImplementation(() => {
      throw new Error('Command not found');
    });

    const result = await enhancedMcpInit({
      dryRun: true,
      verbose: false,
      enhancedUx: false
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Claude Code CLI not installed');
  });

  test('should respect dry run mode', async () => {
    execSync.mockReturnValue('claude version 1.0.0');

    const result = await enhancedMcpInit({
      dryRun: true,
      verbose: true
    });

    // Should complete without errors in dry run
    expect(result).toHaveProperty('success');
  });
});

describe('Quick MCP Health Check Function', () => {
  let mockConsole;

  beforeEach(() => {
    mockConsole = global.mockConsole.setup();
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockConsole.restore();
  });

  test('should perform health check', async () => {
    execSync.mockReturnValue('claude version 1.0.0');

    const result = await quickMcpHealthCheck({
      verbose: false
    });

    expect(result).toHaveProperty('healthy');
    expect(result).toHaveProperty('healthScore');
    expect(result).toHaveProperty('state');
    expect(result).toHaveProperty('needsAttention');
  });

  test('should detect unhealthy configuration', async () => {
    // Create broken configuration
    const brokenConfig = {
      mcpServers: {
        'broken-server': global.testUtils.generateTestData.brokenMcpServer('missing-file')
      }
    };

    await global.testUtils.createMockProjectConfig(brokenConfig);
    execSync.mockReturnValue('claude version 1.0.0');

    const result = await quickMcpHealthCheck();

    expect(result.healthy).toBe(false);
    expect(result.needsAttention).toBe(true);
    expect(result.healthScore).toBeLessThan(80);
  });

  test('should handle health check errors gracefully', async () => {
    // Mock an error during health check
    execSync.mockImplementation(() => {
      throw new Error('System error');
    });

    const result = await quickMcpHealthCheck();

    expect(result.healthy).toBe(false);
    expect(result.needsAttention).toBe(true);
    expect(result).toHaveProperty('error');
  });
});

describe('Edge Cases and Error Scenarios', () => {
  let manager;

  beforeEach(() => {
    manager = new McpConfigurationManager({ verbose: false, dryRun: true });
  });

  test('should handle extremely large configurations', async () => {
    const largeConfig = global.testUtils.generateTestData.largeConfiguration(10000);
    await global.testUtils.createMockProjectConfig(largeConfig);

    const config = await manager.readProjectConfig();
    expect(config).toBeTruthy();
    expect(Object.keys(config.mcpServers)).toHaveLength(10000);
  });

  test('should handle deeply nested configurations', async () => {
    const deepConfig = {
      mcpServers: {
        'deep-server': {
          command: 'node',
          args: ['server.js'],
          config: {
            level1: {
              level2: {
                level3: {
                  level4: {
                    level5: {
                      value: 'deep-value'
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    await global.testUtils.createMockProjectConfig(deepConfig);
    const config = await manager.readProjectConfig();
    expect(config.mcpServers['deep-server'].config.level1.level2.level3.level4.level5.value).toBe('deep-value');
  });

  test('should handle configuration with special characters', async () => {
    const specialConfig = {
      mcpServers: {
        'special-server-!@#$%^&*()': {
          command: 'node',
          args: ['server with spaces.js', '--option=value with spaces'],
          env: {
            'VAR_WITH_SPECIAL_CHARS': 'value!@#$%^&*()',
            'UNICODE_VAR': '测试值'
          }
        }
      }
    };

    await global.testUtils.createMockProjectConfig(specialConfig);
    const config = await manager.readProjectConfig();
    expect(config.mcpServers['special-server-!@#$%^&*()']).toBeTruthy();
  });

  test('should handle concurrent access to configuration files', async () => {
    const promises = [];

    for (let i = 0; i < 10; i++) {
      promises.push(manager.detectConfigurationState());
    }

    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
    results.forEach(result => {
      expect(result).toHaveProperty('healthScore');
    });
  });

  test('should handle system resource exhaustion gracefully', async () => {
    // Mock file system errors
    const originalReadFile = fs.readFile;
    fs.readFile = jest.fn().mockRejectedValue(new Error('EMFILE: too many open files'));

    try {
      const config = await manager.readProjectConfig();
      expect(config).toBeNull();
    } finally {
      fs.readFile = originalReadFile;
    }
  });
});