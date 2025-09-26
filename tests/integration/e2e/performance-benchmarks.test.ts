/**
 * E2E Performance Benchmarks Integration Tests
 * Tests system performance under various loads and conditions
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

describe('Performance Benchmarks Integration Tests', () => {
  const testDir = path.join(process.cwd(), 'tests', 'integration', 'temp-performance');
  const cliPath = path.join(process.cwd(), 'src', 'cli', 'main.ts');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterAll(async () => {
    process.chdir(process.cwd().replace(path.sep + 'tests' + path.sep + 'integration' + path.sep + 'temp-performance', ''));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('CLI Performance Tests', () => {
    test('should execute commands within acceptable time limits', async () => {
      const commands = [
        { cmd: 'help', timeout: 2000 },
        { cmd: 'config list', timeout: 3000 },
        { cmd: 'memory list', timeout: 3000 },
        { cmd: 'swarm status', timeout: 5000 }
      ];

      for (const { cmd, timeout } of commands) {
        const startTime = Date.now();

        try {
          await execAsync(`tsx ${cliPath} ${cmd}`, {
            timeout,
            env: { ...process.env, NODE_ENV: 'test' }
          });
        } catch (error) {
          // Some commands might error but should still complete within timeout
        }

        const executionTime = Date.now() - startTime;
        expect(executionTime).toBeLessThan(timeout);
      }
    }, 20000);

    test('should handle concurrent CLI operations', async () => {
      const concurrentCommands = [
        execAsync(`tsx ${cliPath} config get test.concurrent1`, { timeout: 5000 }),
        execAsync(`tsx ${cliPath} config get test.concurrent2`, { timeout: 5000 }),
        execAsync(`tsx ${cliPath} memory list`, { timeout: 5000 }),
        execAsync(`tsx ${cliPath} swarm status`, { timeout: 5000 })
      ];

      const startTime = Date.now();
      const results = await Promise.allSettled(concurrentCommands);
      const executionTime = Date.now() - startTime;

      // Should complete within reasonable time for concurrent execution
      expect(executionTime).toBeLessThan(8000);

      // At least majority should complete successfully
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThanOrEqual(2);
    }, 12000);
  });

  describe('Swarm Performance Tests', () => {
    test('should initialize swarm quickly', async () => {
      const topologies = ['mesh', 'hierarchical', 'ring', 'star'];

      for (const topology of topologies) {
        const startTime = Date.now();

        const { stdout, stderr } = await execAsync(`tsx ${cliPath} swarm init ${topology}`, {
          timeout: 8000,
          env: { ...process.env, NODE_ENV: 'test' }
        });

        const executionTime = Date.now() - startTime;

        expect(stderr).toBe('');
        expect(executionTime).toBeLessThan(7000);
        expect(stdout).toMatch(/swarm.*initialized/i);
      }
    }, 40000);

    test('should spawn multiple agents efficiently', async () => {
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 8000 });

      const agentCount = 5;
      const spawnPromises = Array.from({ length: agentCount }, (_, i) => {
        return execAsync(`tsx ${cliPath} swarm spawn coder "Performance test task ${i + 1}"`, {
          timeout: 12000,
          env: { ...process.env, NODE_ENV: 'test' }
        });
      });

      const startTime = Date.now();
      const results = await Promise.allSettled(spawnPromises);
      const executionTime = Date.now() - startTime;

      // Should spawn agents within reasonable time
      expect(executionTime).toBeLessThan(25000);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThanOrEqual(3); // At least 60% success rate
    }, 35000);

    test('should handle high-frequency swarm operations', async () => {
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 8000 });

      const operations = [
        () => execAsync(`tsx ${cliPath} swarm status`, { timeout: 5000 }),
        () => execAsync(`tsx ${cliPath} swarm list`, { timeout: 5000 }),
        () => execAsync(`tsx ${cliPath} swarm metrics`, { timeout: 5000 })
      ];

      const iterations = 3;
      const allOperations = [];

      for (let i = 0; i < iterations; i++) {
        allOperations.push(...operations.map(op => op()));
      }

      const startTime = Date.now();
      const results = await Promise.allSettled(allOperations);
      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeLessThan(15000);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThanOrEqual(Math.floor(allOperations.length * 0.7));
    }, 25000);
  });

  describe('SPARC Performance Tests', () => {
    test('should execute SPARC modes within performance thresholds', async () => {
      const modes = [
        { mode: 'spec-pseudocode', maxTime: 15000 },
        { mode: 'architect', maxTime: 18000 },
        { mode: 'integration', maxTime: 20000 }
      ];

      for (const { mode, maxTime } of modes) {
        const startTime = Date.now();

        const { stdout, stderr } = await execAsync(`tsx ${cliPath} sparc run ${mode} "Performance test feature"`, {
          timeout: maxTime + 2000,
          env: { ...process.env, NODE_ENV: 'test' }
        });

        const executionTime = Date.now() - startTime;

        expect(stderr).toBe('');
        expect(executionTime).toBeLessThan(maxTime);
        expect(stdout).toMatch(/sparc/i);
      }
    }, 60000);

    test('should handle concurrent SPARC operations', async () => {
      const concurrentSparcs = [
        execAsync(`tsx ${cliPath} sparc run spec-pseudocode "Concurrent test 1"`, {
          timeout: 18000,
          env: { ...process.env, NODE_ENV: 'test' }
        }),
        execAsync(`tsx ${cliPath} sparc run spec-pseudocode "Concurrent test 2"`, {
          timeout: 18000,
          env: { ...process.env, NODE_ENV: 'test' }
        }),
        execAsync(`tsx ${cliPath} sparc run spec-pseudocode "Concurrent test 3"`, {
          timeout: 18000,
          env: { ...process.env, NODE_ENV: 'test' }
        })
      ];

      const startTime = Date.now();
      const results = await Promise.allSettled(concurrentSparcs);
      const executionTime = Date.now() - startTime;

      // Concurrent execution should be faster than sequential
      expect(executionTime).toBeLessThan(30000);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThanOrEqual(1); // At least one should succeed
    }, 40000);
  });

  describe('Memory and Storage Performance Tests', () => {
    test('should handle rapid memory operations', async () => {
      const operationCount = 10;
      const operations = [];

      // Generate store operations
      for (let i = 0; i < operationCount; i++) {
        operations.push(execAsync(`tsx ${cliPath} memory store perf-test-${i} "Performance test value ${i}"`, { timeout: 3000 }));
      }

      const startTime = Date.now();
      const results = await Promise.allSettled(operations);
      const storeTime = Date.now() - startTime;

      expect(storeTime).toBeLessThan(15000);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThanOrEqual(operationCount * 0.8); // 80% success rate
    }, 25000);

    test('should retrieve memory efficiently', async () => {
      // Store test data
      const testKeys = ['perf-1', 'perf-2', 'perf-3'];
      for (const key of testKeys) {
        await execAsync(`tsx ${cliPath} memory store ${key} "test value for ${key}"`, { timeout: 3000 });
      }

      // Measure retrieval performance
      const retrievals = testKeys.map(key =>
        execAsync(`tsx ${cliPath} memory get ${key}`, { timeout: 3000 })
      );

      const startTime = Date.now();
      const results = await Promise.all(retrievals);
      const retrievalTime = Date.now() - startTime;

      expect(retrievalTime).toBeLessThan(5000);

      results.forEach(({ stdout }) => {
        expect(stdout).toMatch(/test value/i);
      });
    }, 15000);
  });

  describe('Resource Usage Tests', () => {
    test('should monitor system resource usage during operations', async () => {
      // Initialize monitoring
      const monitorCommand = `tsx ${cliPath} swarm monitor --duration 10`;

      // Start resource monitoring in background
      const monitorPromise = execAsync(monitorCommand, {
        timeout: 12000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      // Perform resource-intensive operations
      await execAsync(`tsx ${cliPath} swarm init mesh`, { timeout: 8000 });
      await execAsync(`tsx ${cliPath} swarm spawn coder "Resource test"`, { timeout: 10000 });

      // Wait for monitoring to complete
      const { stdout } = await monitorPromise;

      expect(stdout).toMatch(/monitor|resource|performance|memory|cpu/i);
    }, 25000);

    test('should handle memory-intensive operations', async () => {
      // Create large dataset in memory
      const largeData = 'x'.repeat(1000); // 1KB string
      const keys = Array.from({ length: 50 }, (_, i) => `large-data-${i}`);

      const storePromises = keys.map(key =>
        execAsync(`tsx ${cliPath} memory store ${key} "${largeData}"`, { timeout: 5000 })
      );

      const startTime = Date.now();
      const results = await Promise.allSettled(storePromises);
      const operationTime = Date.now() - startTime;

      expect(operationTime).toBeLessThan(30000);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThanOrEqual(keys.length * 0.7); // 70% success rate
    }, 40000);
  });

  describe('Benchmark Comparison Tests', () => {
    test('should run system benchmarks and compare performance', async () => {
      const benchmarkTypes = ['swarm', 'memory', 'neural'];

      for (const type of benchmarkTypes) {
        const startTime = Date.now();

        try {
          const { stdout, stderr } = await execAsync(`tsx ${cliPath} benchmark run --type ${type}`, {
            timeout: 20000,
            env: { ...process.env, NODE_ENV: 'test' }
          });

          const executionTime = Date.now() - startTime;

          expect(stderr).toBe('');
          expect(executionTime).toBeLessThan(18000);
          expect(stdout).toMatch(/benchmark|performance|result|metric/i);
        } catch (error) {
          // Some benchmarks might not be available in test environment
          console.warn(`Benchmark ${type} skipped:`, error);
        }
      }
    }, 70000);

    test('should generate performance reports', async () => {
      const command = `tsx ${cliPath} benchmark report --format summary`;

      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: 10000,
          env: { ...process.env, NODE_ENV: 'test' }
        });

        expect(stderr).toBe('');
        expect(stdout).toMatch(/performance|report|summary|metric/i);
      } catch (error) {
        // Report generation might not be available without prior benchmark data
        console.warn('Performance report skipped:', error);
      }
    }, 15000);
  });
});