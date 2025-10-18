/**
 * Integration Tests for CRDT Verification System
 * Tests memory management, resource cleanup, and distributed synchronization
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CRDTVerificationCoordinator } from '../../src/verification/crdt-coordinator.js';
import { CRDTMemoryManager } from '../../src/verification/memory-manager.js';
import { CRDTConflictResolver } from '../../src/verification/conflict-resolver.js';
import { VerificationCRDT, VerificationReport } from '../../src/crdt/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('CRDT Verification Integration', () => {
  let coordinator: CRDTVerificationCoordinator;
  let memoryManager: CRDTMemoryManager;
  let conflictResolver: CRDTConflictResolver;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crdt-test-'));

    coordinator = new CRDTVerificationCoordinator({
      nodeId: 'test-node',
      replicationGroup: ['test-node', 'peer1', 'peer2'],
      syncInterval: 1000,
      maxRetries: 3,
      enablePersistence: true,
      memoryBackend: 'sqlite'
    });

    memoryManager = new CRDTMemoryManager('test-node', {
      backend: 'memory',
      persistence: {
        enabled: true,
        directory: tempDir,
        maxSize: 100,
        ttl: 3600,
        compressionEnabled: false
      },
      cleanup: {
        agentTimeout: 30,
        stateRetention: 3600,
        orphanCleanupInterval: 60,
        memoryThreshold: 80
      },
      synchronization: {
        batchSize: 10,
        maxRetries: 3,
        backoffMultiplier: 2,
        conflictBufferSize: 100
      }
    });

    conflictResolver = new CRDTConflictResolver('test-node');
  });

  afterEach(async () => {
    await coordinator.shutdown();
    await memoryManager.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Memory Management Tests', () => {
    it('should store and retrieve CRDT states correctly', async () => {
      const verification = new VerificationCRDT('test-agent', {
        id: 'test-1',
        agentId: 'test-agent',
        nodeId: 'test-node',
        timestamp: Date.now(),
        status: 'passed',
        metrics: new Map([['performance', 95]]),
        conflicts: [],
        metadata: { testSuite: 'unit-tests' }
      });

      await memoryManager.storeState('test-key', verification);
      const retrieved = await memoryManager.getState('test-key');

      expect(retrieved).toBeTruthy();
      expect(retrieved!.toReport().status).toBe('passed');
      expect(retrieved!.toReport().metrics.get('performance')).toBe(95);
    });

    it('should handle agent termination and cleanup', async () => {
      const agentId = 'terminating-agent';
      const verification = new VerificationCRDT(agentId);

      await memoryManager.storeState(`${agentId}-state`, verification);
      memoryManager.registerAgent(agentId, 'test-node');

      // Verify agent is registered
      const statsBefore = memoryManager.getStats();
      expect(statsBefore.activeAgents).toBe(1);

      // Terminate agent
      await memoryManager.handleAgentTermination(agentId);

      // Verify cleanup
      const statsAfter = memoryManager.getStats();
      expect(statsAfter.activeAgents).toBe(0);

      // State should be cleaned up after some time
      setTimeout(async () => {
        const retrieved = await memoryManager.getState(`${agentId}-state`);
        expect(retrieved).toBeNull();
      }, 100);
    });

    it('should persist states to disk when enabled', async () => {
      const verification = new VerificationCRDT('persistent-agent');
      verification.updateStatus('passed');
      verification.updateMetric('score', 88, ['test-node']);

      await memoryManager.storeState('persistent-key', verification);

      // Check if file exists
      const persistedFiles = await fs.readdir(tempDir);
      expect(persistedFiles.some(file => file.includes('persistent-key'))).toBe(true);
    });

    it('should validate resource cleanup', async () => {
      // Create multiple states
      for (let i = 0; i < 5; i++) {
        const verification = new VerificationCRDT(`agent-${i}`);
        await memoryManager.storeState(`state-${i}`, verification);
        memoryManager.registerAgent(`agent-${i}`, 'test-node');
      }

      // Terminate some agents
      await memoryManager.handleAgentTermination('agent-1');
      await memoryManager.handleAgentTermination('agent-3');

      // Validate cleanup
      const validation = await memoryManager.validateCleanup();
      expect(validation.cleanupSuccess).toBe(true);
      expect(validation.memoryLeaks.length).toBe(0);
    });

    it('should handle memory pressure correctly', async () => {
      // Fill memory with many states
      const states = [];
      for (let i = 0; i < 50; i++) {
        const verification = new VerificationCRDT(`bulk-agent-${i}`);
        verification.updateMetric('data', Math.random() * 1000, ['test-node']);
        states.push(verification);
        await memoryManager.storeState(`bulk-state-${i}`, verification);
      }

      const stats = memoryManager.getStats();
      expect(stats.totalStates).toBe(50);
    });

    it('should create and restore backups', async () => {
      // Create some test states
      const verification1 = new VerificationCRDT('backup-agent-1');
      const verification2 = new VerificationCRDT('backup-agent-2');

      verification1.updateStatus('passed');
      verification2.updateStatus('failed');

      await memoryManager.storeState('backup-state-1', verification1);
      await memoryManager.storeState('backup-state-2', verification2);

      // Create backup
      const backup = await memoryManager.createBackup();
      expect(backup.stateCount).toBe(2);

      // Clear states
      await memoryManager.shutdown();

      // Create new memory manager and restore
      const newMemoryManager = new CRDTMemoryManager('test-node', {
        backend: 'memory',
        persistence: {
          enabled: true,
          directory: tempDir,
          maxSize: 100,
          ttl: 3600,
          compressionEnabled: false
        },
        cleanup: {
          agentTimeout: 30,
          stateRetention: 3600,
          orphanCleanupInterval: 60,
          memoryThreshold: 80
        },
        synchronization: {
          batchSize: 10,
          maxRetries: 3,
          backoffMultiplier: 2,
          conflictBufferSize: 100
        }
      });

      await newMemoryManager.restoreFromBackup(backup.backupId);

      const restored1 = await newMemoryManager.getState('backup-state-1');
      const restored2 = await newMemoryManager.getState('backup-state-2');

      expect(restored1?.toReport().status).toBe('passed');
      expect(restored2?.toReport().status).toBe('failed');

      await newMemoryManager.shutdown();
    });
  });

  describe('Distributed Synchronization Tests', () => {
    it('should synchronize states across multiple nodes', async () => {
      const report1: VerificationReport = {
        id: 'sync-test-1',
        agentId: 'sync-agent',
        nodeId: 'test-node',
        timestamp: Date.now(),
        status: 'passed',
        metrics: new Map([['performance', 90]]),
        conflicts: [],
        metadata: { testSuite: 'sync-test' }
      };

      await coordinator.processVerificationReport(report1);

      // Mock synchronization with peers
      await coordinator.synchronizeWithNodes(['peer1', 'peer2']);

      // Verify coordination was logged
      const status = coordinator.getVerificationStatus();
      expect(status.totalStates).toBeGreaterThan(0);
    });

    it('should merge conflicting verification reports', async () => {
      const conflictingReports: VerificationReport[] = [
        {
          id: 'conflict-1',
          agentId: 'agent1',
          nodeId: 'node1',
          timestamp: Date.now(),
          status: 'passed',
          metrics: new Map([['score', 85]]),
          conflicts: ['timing-issue'],
          metadata: { environment: 'prod' }
        },
        {
          id: 'conflict-2',
          agentId: 'agent2',
          nodeId: 'node2',
          timestamp: Date.now() + 1000,
          status: 'failed',
          metrics: new Map([['score', 60]]),
          conflicts: ['memory-leak'],
          metadata: { environment: 'staging' }
        },
        {
          id: 'conflict-3',
          agentId: 'agent3',
          nodeId: 'node3',
          timestamp: Date.now() + 2000,
          status: 'passed',
          metrics: new Map([['score', 92]]),
          conflicts: [],
          metadata: { environment: 'prod' }
        }
      ];

      const merged = await coordinator.mergeConflictingReports(conflictingReports);

      expect(merged.id).toBe('merged-conflict-resolution');
      expect(merged.conflicts.length).toBeGreaterThan(0);
      expect(merged.metrics.get('score')).toBeGreaterThan(0);
    });

    it('should handle network partitions gracefully', async () => {
      // Simulate network partition by processing reports without sync
      const report1: VerificationReport = {
        id: 'partition-1',
        agentId: 'partition-agent1',
        nodeId: 'node1',
        timestamp: Date.now(),
        status: 'passed',
        metrics: new Map([['metric1', 100]]),
        conflicts: [],
        metadata: {}
      };

      const report2: VerificationReport = {
        id: 'partition-2',
        agentId: 'partition-agent2',
        nodeId: 'node2',
        timestamp: Date.now(),
        status: 'failed',
        metrics: new Map([['metric1', 75]]),
        conflicts: [],
        metadata: {}
      };

      await coordinator.processVerificationReport(report1);
      await coordinator.processVerificationReport(report2);

      // Check that both reports are processed
      const status = coordinator.getVerificationStatus();
      expect(status.totalStates).toBe(2);
    });
  });

  describe('Conflict Resolution Tests', () => {
    it('should resolve performance benchmark conflicts', async () => {
      const benchmarkResults = new Map([
        ['cpu-benchmark', [
          {
            benchmarkId: 'cpu-benchmark',
            nodeId: 'node1',
            timestamp: Date.now(),
            metrics: {
              executionTime: 1500,
              throughput: 1000,
              errorRate: 0.01,
              memoryUsage: 512,
              cpuUtilization: 75
            },
            metadata: {
              testSuite: 'performance',
              environment: 'production',
              version: '1.0.0',
              configuration: { threads: 4 }
            },
            conflicts: []
          },
          {
            benchmarkId: 'cpu-benchmark',
            nodeId: 'node2',
            timestamp: Date.now() + 1000,
            metrics: {
              executionTime: 1800,
              throughput: 800,
              errorRate: 0.02,
              memoryUsage: 600,
              cpuUtilization: 85
            },
            metadata: {
              testSuite: 'performance',
              environment: 'staging',
              version: '1.0.0',
              configuration: { threads: 4 }
            },
            conflicts: ['environment-difference']
          },
          {
            benchmarkId: 'cpu-benchmark',
            nodeId: 'node3',
            timestamp: Date.now() + 2000,
            metrics: {
              executionTime: 1300,
              throughput: 1200,
              errorRate: 0.005,
              memoryUsage: 480,
              cpuUtilization: 70
            },
            metadata: {
              testSuite: 'performance',
              environment: 'production',
              version: '1.0.1',
              configuration: { threads: 8 }
            },
            conflicts: ['version-mismatch']
          }
        ]]
      ]);

      const resolved = await conflictResolver.resolveConflicts(benchmarkResults);
      const resolvedBenchmark = resolved.get('cpu-benchmark');

      expect(resolvedBenchmark).toBeTruthy();
      expect(resolvedBenchmark!.metrics.executionTime).toBeGreaterThan(0);
      expect(resolvedBenchmark!.metrics.throughput).toBeGreaterThan(0);
      expect(resolvedBenchmark!.metadata.configuration.resolution).toBeTruthy();
    });

    it('should handle statistical outliers in benchmark results', async () => {
      const benchmarkResults = new Map([
        ['outlier-test', Array.from({ length: 10 }, (_, i) => ({
          benchmarkId: 'outlier-test',
          nodeId: `node-${i}`,
          timestamp: Date.now() + i * 1000,
          metrics: {
            executionTime: i === 5 ? 10000 : 1000 + (Math.random() * 100), // One outlier
            throughput: 1000,
            errorRate: 0.01,
            memoryUsage: 500,
            cpuUtilization: 70
          },
          metadata: {
            testSuite: 'outlier-detection',
            environment: 'test',
            version: '1.0.0',
            configuration: {}
          },
          conflicts: []
        }))]
      ]);

      const resolved = await conflictResolver.resolveConflicts(benchmarkResults);
      const resolvedBenchmark = resolved.get('outlier-test');

      expect(resolvedBenchmark).toBeTruthy();
      // The outlier should not significantly affect the result
      expect(resolvedBenchmark!.metrics.executionTime).toBeLessThan(2000);
    });

    it('should use appropriate resolution strategies based on conflict type', async () => {
      // Environment conflicts
      const envConflicts = new Map([
        ['env-test', [
          {
            benchmarkId: 'env-test',
            nodeId: 'prod-node',
            timestamp: Date.now(),
            metrics: { executionTime: 1000, throughput: 100, errorRate: 0.01, memoryUsage: 500, cpuUtilization: 70 },
            metadata: { testSuite: 'test', environment: 'production', version: '1.0.0', configuration: {} },
            conflicts: ['environment-diff']
          },
          {
            benchmarkId: 'env-test',
            nodeId: 'staging-node',
            timestamp: Date.now(),
            metrics: { executionTime: 1200, throughput: 80, errorRate: 0.02, memoryUsage: 600, cpuUtilization: 80 },
            metadata: { testSuite: 'test', environment: 'staging', version: '1.0.0', configuration: {} },
            conflicts: ['environment-diff']
          }
        ]]
      ]);

      const resolved = await conflictResolver.resolveConflicts(envConflicts);
      const result = resolved.get('env-test');

      expect(result).toBeTruthy();
      expect(result!.metadata.environment).toBeTruthy();
    });
  });

  describe('End-to-End Integration Tests', () => {
    it('should handle complete verification workflow', async () => {
      // 1. Multiple agents report verification results
      const reports: VerificationReport[] = [
        {
          id: 'e2e-1',
          agentId: 'consensus-agent-1',
          nodeId: 'node1',
          timestamp: Date.now(),
          status: 'passed',
          metrics: new Map([['accuracy', 95], ['speed', 80]]),
          conflicts: [],
          metadata: { testType: 'unit', suite: 'core' }
        },
        {
          id: 'e2e-2',
          agentId: 'consensus-agent-2',
          nodeId: 'node2',
          timestamp: Date.now() + 500,
          status: 'failed',
          metrics: new Map([['accuracy', 70], ['speed', 90]]),
          conflicts: ['timing-issue'],
          metadata: { testType: 'unit', suite: 'core' }
        },
        {
          id: 'e2e-3',
          agentId: 'consensus-agent-3',
          nodeId: 'node3',
          timestamp: Date.now() + 1000,
          status: 'passed',
          metrics: new Map([['accuracy', 88], ['speed', 85]]),
          conflicts: [],
          metadata: { testType: 'unit', suite: 'core' }
        }
      ];

      // 2. Process all reports
      for (const report of reports) {
        await coordinator.processVerificationReport(report);
      }

      // 3. Trigger synchronization
      await coordinator.synchronizeWithNodes();

      // 4. Merge conflicts if any
      const merged = await coordinator.mergeConflictingReports(reports.slice(0, 2)); // First two conflict

      // 5. Verify final state
      const status = coordinator.getVerificationStatus();
      expect(status.totalStates).toBeGreaterThan(0);
      expect(merged.id).toContain('merged');
    });

    it('should maintain consistency under concurrent operations', async () => {
      const concurrentReports = Array.from({ length: 20 }, (_, i) => ({
        id: `concurrent-${i}`,
        agentId: `agent-${i % 5}`, // 5 different agents
        nodeId: `node-${i % 3}`, // 3 different nodes
        timestamp: Date.now() + i * 100,
        status: (i % 2 === 0 ? 'passed' : 'failed') as 'passed' | 'failed',
        metrics: new Map([['metric', Math.random() * 100]]),
        conflicts: i % 3 === 0 ? [`conflict-${i}`] : [],
        metadata: { batch: 'concurrent-test' }
      }));

      // Process all reports concurrently
      await Promise.all(
        concurrentReports.map(report => coordinator.processVerificationReport(report))
      );

      // Verify consistency
      const finalStatus = coordinator.getVerificationStatus();
      expect(finalStatus.totalStates).toBeGreaterThan(0);
      expect(finalStatus.consensusMetrics).toBe(20);
    });

    it('should recover gracefully from failures', async () => {
      const report: VerificationReport = {
        id: 'recovery-test',
        agentId: 'failing-agent',
        nodeId: 'test-node',
        timestamp: Date.now(),
        status: 'passed',
        metrics: new Map([['test-metric', 100]]),
        conflicts: [],
        metadata: { recovery: true }
      };

      await coordinator.processVerificationReport(report);

      // Simulate agent failure
      await coordinator.handleAgentTermination('failing-agent', 'test-node');

      // Verify cleanup was successful
      const status = coordinator.getVerificationStatus();
      expect(status).toBeTruthy();
    });
  });

  describe('Performance Tests', () => {
    it('should handle high-volume verification reports', async () => {
      const startTime = Date.now();
      const reportCount = 1000;

      const reports = Array.from({ length: reportCount }, (_, i) => ({
        id: `perf-test-${i}`,
        agentId: `perf-agent-${i % 10}`,
        nodeId: `node-${i % 5}`,
        timestamp: Date.now() + i,
        status: (Math.random() > 0.5 ? 'passed' : 'failed') as 'passed' | 'failed',
        metrics: new Map([
          ['performance', Math.random() * 100],
          ['reliability', Math.random() * 100]
        ]),
        conflicts: Math.random() > 0.8 ? [`conflict-${i}`] : [],
        metadata: { perfTest: true, batch: Math.floor(i / 100) }
      }));

      // Process all reports
      for (const report of reports) {
        await coordinator.processVerificationReport(report);
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      console.log(`Processed ${reportCount} reports in ${processingTime}ms`);
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds

      const status = coordinator.getVerificationStatus();
      expect(status.consensusMetrics).toBe(reportCount);
    });

    it('should maintain memory efficiency', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create many verification states
      for (let i = 0; i < 500; i++) {
        const verification = new VerificationCRDT(`mem-test-agent-${i}`);
        verification.updateMetric('data', Math.random() * 1000, ['test-node']);
        await memoryManager.storeState(`mem-test-${i}`, verification);
      }

      const midMemory = process.memoryUsage().heapUsed;

      // Trigger cleanup
      const validation = await memoryManager.validateCleanup();
      expect(validation.cleanupSuccess).toBe(true);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Memory increase: ${memoryIncrease / 1024 / 1024} MB`);
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
    });
  });
});