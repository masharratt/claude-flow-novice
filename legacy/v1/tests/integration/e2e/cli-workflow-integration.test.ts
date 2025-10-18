/**
 * E2E CLI Workflow Integration Tests
 * Tests complete user workflows including SPARC, swarm operations, and configuration management
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

describe('CLI Workflow Integration Tests', () => {
  const testDir = path.join(process.cwd(), 'tests', 'integration', 'temp');
  const cliPath = path.join(process.cwd(), 'src', 'cli', 'main.ts');

  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterAll(async () => {
    // Cleanup test directory
    process.chdir(process.cwd().replace(path.sep + 'tests' + path.sep + 'integration' + path.sep + 'temp', ''));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('SPARC Workflow Tests', () => {
    test('should execute complete SPARC TDD workflow', async () => {
      const command = `tsx ${cliPath} sparc tdd "Create user authentication system"`;

      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('SPARC');
      expect(stdout).toMatch(/specification|pseudocode|architecture|refinement|completion/i);
    }, 35000);

    test('should run SPARC modes individually', async () => {
      const modes = ['spec-pseudocode', 'architect', 'integration'];

      for (const mode of modes) {
        const command = `tsx ${cliPath} sparc run ${mode} "Test feature"`;
        const { stdout, stderr } = await execAsync(command, { timeout: 15000 });

        expect(stderr).toBe('');
        expect(stdout).toContain('SPARC');
      }
    }, 50000);
  });

  describe('Swarm Operations Tests', () => {
    test('should initialize and manage swarm', async () => {
      // Initialize swarm
      const initCommand = `tsx ${cliPath} swarm init mesh`;
      const { stdout: initOut } = await execAsync(initCommand, { timeout: 10000 });
      expect(initOut).toContain('swarm');

      // Check swarm status
      const statusCommand = `tsx ${cliPath} swarm status`;
      const { stdout: statusOut } = await execAsync(statusCommand, { timeout: 5000 });
      expect(statusOut).toMatch(/swarm|agents|status/i);

      // Spawn agent
      const spawnCommand = `tsx ${cliPath} swarm spawn coder "test task"`;
      const { stdout: spawnOut } = await execAsync(spawnCommand, { timeout: 10000 });
      expect(spawnOut).toMatch(/agent|spawn/i);
    }, 30000);

    test('should handle agent coordination', async () => {
      const command = `tsx ${cliPath} agent coordinator "coordinate test tasks"`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 15000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/coordinator|agent/i);
    }, 20000);
  });

  describe('Configuration Management Tests', () => {
    test('should manage configuration settings', async () => {
      // Set configuration
      const setCommand = `tsx ${cliPath} config set test.value "integration-test"`;
      await execAsync(setCommand, { timeout: 5000 });

      // Get configuration
      const getCommand = `tsx ${cliPath} config get test.value`;
      const { stdout } = await execAsync(getCommand, { timeout: 5000 });
      expect(stdout).toContain('integration-test');

      // List all configurations
      const listCommand = `tsx ${cliPath} config list`;
      const { stdout: listOut } = await execAsync(listCommand, { timeout: 5000 });
      expect(listOut).toContain('test.value');
    }, 20000);

    test('should validate configuration schema', async () => {
      const command = `tsx ${cliPath} config validate`;
      const { stdout, stderr } = await execAsync(command, { timeout: 10000 });

      // Should not error on validation
      expect(stderr).not.toContain('error');
      expect(stdout).toMatch(/valid|configuration|schema/i);
    }, 15000);
  });

  describe('Memory and Neural Features Tests', () => {
    test('should manage memory operations', async () => {
      // Store memory
      const storeCommand = `tsx ${cliPath} memory store test-key "test value for integration"`;
      await execAsync(storeCommand, { timeout: 5000 });

      // Retrieve memory
      const getCommand = `tsx ${cliPath} memory get test-key`;
      const { stdout } = await execAsync(getCommand, { timeout: 5000 });
      expect(stdout).toContain('test value for integration');

      // List memory
      const listCommand = `tsx ${cliPath} memory list`;
      const { stdout: listOut } = await execAsync(listCommand, { timeout: 5000 });
      expect(listOut).toContain('test-key');
    }, 20000);

    test('should initialize and check neural features', async () => {
      const initCommand = `tsx ${cliPath} neural init`;
      const { stdout, stderr } = await execAsync(initCommand, {
        timeout: 10000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      // Neural init should complete without critical errors
      expect(stderr).not.toContain('CRITICAL');
      expect(stdout).toMatch(/neural|initialized|ready/i);
    }, 15000);
  });

  describe('Help and Documentation Tests', () => {
    test('should display comprehensive help', async () => {
      const command = `tsx ${cliPath} help`;
      const { stdout } = await execAsync(command, { timeout: 5000 });

      expect(stdout).toContain('claude-flow-novice');
      expect(stdout).toMatch(/command|usage|options/i);
      expect(stdout).toContain('sparc');
      expect(stdout).toContain('swarm');
    });

    test('should display command-specific help', async () => {
      const commands = ['sparc', 'swarm', 'agent', 'config'];

      for (const cmd of commands) {
        const helpCommand = `tsx ${cliPath} ${cmd} --help`;
        const { stdout } = await execAsync(helpCommand, { timeout: 5000 });
        expect(stdout).toContain(cmd);
      }
    }, 25000);
  });

  describe('Error Handling Tests', () => {
    test('should handle invalid commands gracefully', async () => {
      const command = `tsx ${cliPath} invalid-command`;

      try {
        await execAsync(command, { timeout: 5000 });
      } catch (error: any) {
        expect(error.stdout || error.message).toMatch(/unknown|invalid|command/i);
      }
    });

    test('should handle missing arguments gracefully', async () => {
      const command = `tsx ${cliPath} sparc run`;

      try {
        await execAsync(command, { timeout: 5000 });
      } catch (error: any) {
        expect(error.stdout || error.stderr).toMatch(/required|missing|argument/i);
      }
    });
  });
});