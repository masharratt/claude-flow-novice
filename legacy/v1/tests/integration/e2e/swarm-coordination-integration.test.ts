/**
 * E2E Swarm Coordination Integration Tests
 * Tests swarm initialization, agent spawning, task orchestration, and inter-agent communication
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

describe('Swarm Coordination Integration Tests', () => {
  const testDir = path.join(process.cwd(), 'tests', 'integration', 'temp-swarm');
  const cliPath = path.join(process.cwd(), 'src', 'cli', 'main.ts');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterAll(async () => {
    process.chdir(process.cwd().replace(path.sep + 'tests' + path.sep + 'integration' + path.sep + 'temp-swarm', ''));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Swarm Initialization Tests', () => {
    test('should initialize swarm with different topologies', async () => {
      const topologies = ['mesh', 'hierarchical', 'ring', 'star'];

      for (const topology of topologies) {
        const command = `tsx ${cliPath} swarm init ${topology}`;
        const { stdout, stderr } = await execAsync(command, {
          timeout: 10000,
          env: { ...process.env, NODE_ENV: 'test' }
        });

        expect(stderr).toBe('');
        expect(stdout).toMatch(/swarm.*initialized|${topology}/i);
      }
    }, 45000);

    test('should validate swarm configuration', async () => {
      // Initialize swarm
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });

      // Check status
      const statusCommand = `tsx ${cliPath} swarm status`;
      const { stdout } = await execAsync(statusCommand, { timeout: 5000 });

      expect(stdout).toMatch(/topology.*mesh|agents.*0|status.*active/i);
    }, 20000);
  });

  describe('Agent Spawning and Management Tests', () => {
    beforeEach(async () => {
      // Ensure fresh swarm for each test
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });
    });

    test('should spawn different agent types', async () => {
      const agentTypes = ['coder', 'tester', 'analyst', 'coordinator', 'researcher'];

      for (const agentType of agentTypes) {
        const command = `tsx ${cliPath} swarm spawn ${agentType} "Test task for ${agentType}"`;
        const { stdout, stderr } = await execAsync(command, {
          timeout: 15000,
          env: { ...process.env, NODE_ENV: 'test' }
        });

        expect(stderr).toBe('');
        expect(stdout).toMatch(new RegExp(`${agentType}|agent.*spawn|task`, 'i'));
      }
    }, 80000);

    test('should list active agents', async () => {
      // Spawn some agents
      await execAsync(`tsx ${cliPath} swarm spawn coder "test task"`, { timeout: 10000 });
      await execAsync(`tsx ${cliPath} swarm spawn tester "test task"`, { timeout: 10000 });

      // List agents
      const listCommand = `tsx ${cliPath} swarm list`;
      const { stdout } = await execAsync(listCommand, { timeout: 5000 });

      expect(stdout).toMatch(/agent.*coder|agent.*tester|2.*agents/i);
    }, 30000);

    test('should get agent metrics', async () => {
      // Spawn agent
      const spawnResult = await execAsync(`tsx ${cliPath} swarm spawn coder "test task"`, { timeout: 10000 });

      // Get metrics
      const metricsCommand = `tsx ${cliPath} swarm metrics`;
      const { stdout } = await execAsync(metricsCommand, { timeout: 5000 });

      expect(stdout).toMatch(/metric|performance|agent|memory|cpu/i);
    }, 20000);
  });

  describe('Task Orchestration Tests', () => {
    beforeEach(async () => {
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });
    });

    test('should orchestrate simple tasks', async () => {
      const command = `tsx ${cliPath} task orchestrate "Create a simple Node.js application" --strategy parallel`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 20000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/task.*orchestrat|parallel|strategy/i);
    }, 25000);

    test('should handle task dependencies', async () => {
      const command = `tsx ${cliPath} task orchestrate "Build and test application" --strategy sequential`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 20000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/task.*orchestrat|sequential|strategy/i);
    }, 25000);

    test('should check task status', async () => {
      // Start a task
      const orchestrateResult = await execAsync(`tsx ${cliPath} task orchestrate "Test task status"`, { timeout: 15000 });

      // Check status
      const statusCommand = `tsx ${cliPath} task status`;
      const { stdout } = await execAsync(statusCommand, { timeout: 5000 });

      expect(stdout).toMatch(/task.*status|pending|running|completed/i);
    }, 25000);
  });

  describe('Cross-Component Coordination Tests', () => {
    beforeEach(async () => {
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });
    });

    test('should coordinate between SPARC and swarm', async () => {
      // Run SPARC with swarm coordination
      const command = `tsx ${cliPath} sparc run architect "Design system with swarm coordination"`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 25000,
        env: { ...process.env, NODE_ENV: 'test', SWARM_ENABLED: 'true' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/sparc|architect|swarm|coordination/i);
    }, 30000);

    test('should integrate memory with swarm operations', async () => {
      // Store coordination data
      await execAsync(`tsx ${cliPath} memory store swarm.test "coordination data"`, { timeout: 5000 });

      // Use in swarm task
      const command = `tsx ${cliPath} task orchestrate "Use stored coordination data"`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 15000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/task.*orchestrat|coordination/i);
    }, 25000);
  });

  describe('Performance and Monitoring Tests', () => {
    beforeEach(async () => {
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });
    });

    test('should monitor swarm performance', async () => {
      // Spawn multiple agents
      await execAsync(`tsx ${cliPath} swarm spawn coder "task 1"`, { timeout: 10000 });
      await execAsync(`tsx ${cliPath} swarm spawn tester "task 2"`, { timeout: 10000 });
      await execAsync(`tsx ${cliPath} swarm spawn analyst "task 3"`, { timeout: 10000 });

      // Monitor performance
      const monitorCommand = `tsx ${cliPath} swarm monitor --duration 5`;
      const { stdout } = await execAsync(monitorCommand, { timeout: 10000 });

      expect(stdout).toMatch(/monitor|performance|agent|metric/i);
    }, 45000);

    test('should run performance benchmarks', async () => {
      const command = `tsx ${cliPath} benchmark run --type swarm`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 15000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      expect(stderr).toBe('');
      expect(stdout).toMatch(/benchmark|performance|swarm|result/i);
    }, 20000);
  });

  describe('Error Recovery Tests', () => {
    test('should handle agent failures gracefully', async () => {
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 10000 });

      // Simulate agent failure scenario
      const command = `tsx ${cliPath} swarm spawn invalid-agent-type "test task"`;

      try {
        await execAsync(command, { timeout: 10000 });
      } catch (error: any) {
        expect(error.stdout || error.stderr).toMatch(/invalid|unknown|agent|type/i);
      }
    }, 15000);

    test('should recover from swarm connection issues', async () => {
      // Test swarm status with no active swarm
      const command = `tsx ${cliPath} swarm status`;

      try {
        const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
        // Should handle gracefully, not crash
        expect(stdout || stderr).toMatch(/no.*swarm|not.*initialized|inactive/i);
      } catch (error: any) {
        // Even if it errors, it should be a handled error
        expect(error.stdout || error.stderr).toMatch(/no.*swarm|not.*initialized/i);
      }
    }, 10000);
  });
});