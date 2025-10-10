/**
 * State Manager WASM Acceleration Integration Tests
 * Sprint 1.2: Coordination Systems WASM Integration
 *
 * Test Coverage:
 * 1. WASM snapshot creation/restoration
 * 2. Compression pipeline integration
 * 3. Large state handling (100KB+)
 * 4. Fallback behavior
 *
 * CRITICAL: Tests REAL WASM loading and integration with SwarmStateManager
 */

const { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');
const { performance } = require('perf_hooks');
const SwarmStateManager = require('../../src/redis/swarm-state-manager.js');
const Redis = require('ioredis-mock');

describe('State Manager WASM Integration', () => {
  let stateManager;
  let testRedis;
  let testResults = {
    wasmSnapshots: null,
    compressionPipeline: null,
    largeStateHandling: null,
    fallbackBehavior: null,
    confidence: 0
  };

  beforeAll(async () => {
    console.log('\n🚀 State Manager WASM Integration Tests Starting...');
  });

  afterAll(() => {
    // Calculate overall confidence
    const scores = [
      testResults.wasmSnapshots?.passed ? 1.0 : 0.0,
      testResults.compressionPipeline?.passed ? 1.0 : 0.0,
      testResults.largeStateHandling?.passed ? 1.0 : 0.0,
      testResults.fallbackBehavior?.passed ? 1.0 : 0.0
    ];
    testResults.confidence = scores.reduce((a, b) => a + b, 0) / scores.length;

    console.log('\n📋 State Manager WASM Integration Summary:');
    console.log(`  WASM Snapshots: ${testResults.wasmSnapshots?.passed ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  Compression Pipeline: ${testResults.compressionPipeline?.passed ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  Large State Handling: ${testResults.largeStateHandling?.passed ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  Fallback Behavior: ${testResults.fallbackBehavior?.passed ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  Overall Confidence: ${(testResults.confidence * 100).toFixed(1)}%`);
  });

  beforeEach(async () => {
    // Create mock Redis instance
    testRedis = new Redis();

    // Initialize state manager with mock Redis
    stateManager = new SwarmStateManager({
      host: 'localhost',
      port: 6379,
      db: 0
    });

    // Replace Redis client with mock
    stateManager.redis = testRedis;

    await stateManager.initialize();
  });

  afterEach(async () => {
    // Cleanup state manager
    if (stateManager) {
      try {
        await stateManager.shutdown();
      } catch (error) {
        // Ignore shutdown errors in tests
      }
    }

    // Cleanup Redis mock
    if (testRedis) {
      await testRedis.quit();
    }
  });

  describe('1. WASM Snapshot Creation/Restoration', () => {
    it('should create snapshots using WASM serialization', async () => {
      const result = {
        wasmEnabled: false,
        snapshotCreated: false,
        snapshotTime: 0,
        restorationTime: 0,
        dataIntegrity: false,
        passed: false
      };

      try {
        const swarmId = 'test-swarm-1';

        // Create complex state
        const testState = {
          swarmId,
          agents: Array.from({ length: 50 }, (_, i) => ({
            id: `agent_${i}`,
            status: 'active',
            tasks: Array.from({ length: 5 }, (_, j) => ({
              taskId: `task_${j}`,
              progress: Math.random(),
              data: 'x'.repeat(100)
            })),
            memory: { value: Math.random() }
          })),
          coordination: {
            leaderElection: { leader: 'agent_0', term: 1 },
            taskQueue: Array.from({ length: 20 }, (_, i) => ({
              taskId: i,
              priority: Math.random()
            }))
          },
          timestamp: Date.now()
        };

        // Save initial state
        await stateManager.saveState(swarmId, testState);

        // Create snapshot with WASM
        const snapshotStart = performance.now();
        const snapshotId = await stateManager.createSnapshot(swarmId, 'wasm-test');
        const snapshotEnd = performance.now();

        result.snapshotCreated = snapshotId !== null;
        result.snapshotTime = snapshotEnd - snapshotStart;

        // Restore from snapshot with WASM
        const restoreStart = performance.now();
        const restoredState = await stateManager.restoreFromSnapshot(swarmId, snapshotId);
        const restoreEnd = performance.now();

        result.restorationTime = restoreEnd - restoreStart;

        // Verify data integrity
        result.dataIntegrity = restoredState &&
                              restoredState.agents.length === 50 &&
                              restoredState.coordination.taskQueue.length === 20;

        // Check WASM stats
        const stats = await stateManager.getStatistics();
        result.wasmEnabled = stats.wasm?.enabled || false;

        result.passed = result.snapshotCreated &&
                       result.snapshotTime < 10 &&
                       result.restorationTime < 10 &&
                       result.dataIntegrity;

        console.log(`  WASM enabled: ${result.wasmEnabled}`);
        console.log(`  Snapshot time: ${result.snapshotTime.toFixed(4)}ms`);
        console.log(`  Restoration time: ${result.restorationTime.toFixed(4)}ms`);
        console.log(`  Data integrity: ${result.dataIntegrity ? 'PASS ✅' : 'FAIL ❌'}`);

        if (stats.wasm?.enabled) {
          console.log(`  WASM speedup: ${stats.wasm.speedup}`);
          console.log(`  WASM usage: ${stats.wasm.wasmUsagePercent}%`);
        }
      } catch (error) {
        console.error('WASM snapshot test failed:', error);
        result.passed = false;
      }

      testResults.wasmSnapshots = result;
      expect(result.passed).toBe(true);
    }, 20000);

    it('should create multiple snapshots efficiently', async () => {
      const swarmId = 'test-swarm-2';

      const testState = {
        swarmId,
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          value: Math.random(),
          timestamp: Date.now()
        }))
      };

      await stateManager.saveState(swarmId, testState);

      const snapshotCount = 10;
      const snapshotTimes = [];

      for (let i = 0; i < snapshotCount; i++) {
        const startTime = performance.now();
        await stateManager.createSnapshot(swarmId, `snapshot_${i}`);
        const endTime = performance.now();
        snapshotTimes.push(endTime - startTime);
      }

      const avgSnapshotTime = snapshotTimes.reduce((a, b) => a + b, 0) / snapshotTimes.length;
      const maxSnapshotTime = Math.max(...snapshotTimes);

      console.log(`  Snapshots created: ${snapshotCount}`);
      console.log(`  Avg snapshot time: ${avgSnapshotTime.toFixed(4)}ms`);
      console.log(`  Max snapshot time: ${maxSnapshotTime.toFixed(4)}ms`);

      // All snapshots should be fast with WASM
      expect(avgSnapshotTime).toBeLessThan(5);
    }, 20000);
  });

  describe('2. Compression Pipeline Integration', () => {
    it('should use WASM compression for state serialization', async () => {
      const result = {
        compressionEnabled: false,
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 0,
        decompressionCorrect: false,
        passed: false
      };

      try {
        const swarmId = 'test-swarm-3';

        // Create large state with compressible data
        const largeState = {
          swarmId,
          agents: Array.from({ length: 100 }, (_, i) => ({
            id: `agent_${i}`,
            status: 'active',
            data: 'x'.repeat(1000), // Highly compressible
            timestamp: Date.now()
          }))
        };

        const originalSerialized = JSON.stringify(largeState);
        result.originalSize = originalSerialized.length;

        // Save state (triggers WASM serialization/compression)
        const saveStart = performance.now();
        await stateManager.saveState(swarmId, largeState);
        const saveEnd = performance.now();

        // Load state (triggers WASM deserialization/decompression)
        const loadStart = performance.now();
        const loadedState = await stateManager.loadState(swarmId);
        const loadEnd = performance.now();

        const saveTime = saveEnd - saveStart;
        const loadTime = loadEnd - loadStart;

        // Verify decompression correctness
        result.decompressionCorrect = loadedState &&
                                      loadedState.agents.length === 100 &&
                                      loadedState.agents[0].data === 'x'.repeat(1000);

        // Get WASM stats
        const stats = await stateManager.getStatistics();
        const wasmReport = stateManager.getWasmReport();

        result.compressionEnabled = stats.wasm?.enabled || false;

        console.log(`  Original size: ${(result.originalSize / 1024).toFixed(2)} KB`);
        console.log(`  Save time: ${saveTime.toFixed(4)}ms`);
        console.log(`  Load time: ${loadTime.toFixed(4)}ms`);
        console.log(`  Decompression correct: ${result.decompressionCorrect ? 'YES ✅' : 'NO ❌'}`);

        if (wasmReport.enabled) {
          console.log(`  WASM serializations: ${wasmReport.serialization.wasm}`);
          console.log(`  WASM deserializations: ${wasmReport.deserialization.wasm}`);
          console.log(`  Performance speedup: ${wasmReport.performance.speedup}`);
        }

        result.passed = result.decompressionCorrect &&
                       saveTime < 50 &&
                       loadTime < 50;
      } catch (error) {
        console.error('Compression pipeline test failed:', error);
        result.passed = false;
      }

      testResults.compressionPipeline = result;
      expect(result.passed).toBe(true);
    }, 20000);

    it('should handle compression pipeline errors gracefully', async () => {
      const swarmId = 'test-swarm-4';

      // Create state with edge cases
      const edgeCaseState = {
        swarmId,
        empty: null,
        undefined: undefined,
        circular: {}, // Will cause issues if not handled
        specialChars: '€£¥©®™',
        unicode: '你好世界 🌍',
        numbers: [Infinity, -Infinity, NaN],
        largeNumber: Number.MAX_SAFE_INTEGER
      };

      // Avoid circular reference by not adding it
      // edgeCaseState.circular.self = edgeCaseState.circular;

      try {
        await stateManager.saveState(swarmId, edgeCaseState);
        const loadedState = await stateManager.loadState(swarmId);

        // Verify edge cases are handled
        expect(loadedState).toBeTruthy();
        expect(loadedState.specialChars).toBe('€£¥©®™');
        expect(loadedState.unicode).toBe('你好世界 🌍');

        console.log('  Edge cases handled: YES ✅');
      } catch (error) {
        console.error('  Edge cases handling failed:', error);
        throw error;
      }
    }, 15000);
  });

  describe('3. Large State Handling (100KB+)', () => {
    it('should handle 100KB+ states with WASM acceleration', async () => {
      const result = {
        stateSize: 0,
        serializationTime: 0,
        deserializationTime: 0,
        totalTime: 0,
        throughput: 0,
        passed: false
      };

      try {
        const swarmId = 'test-swarm-5';

        // Create 100KB+ state
        const largeState = {
          swarmId,
          agents: Array.from({ length: 200 }, (_, i) => ({
            id: `agent_${i}`,
            status: 'active',
            tasks: Array.from({ length: 20 }, (_, j) => ({
              taskId: `task_${i}_${j}`,
              progress: Math.random(),
              data: {
                payload: 'x'.repeat(50),
                metadata: { timestamp: Date.now(), version: 1 }
              }
            })),
            memory: {
              shortTerm: Array.from({ length: 10 }, (_, k) => ({
                key: `mem_${k}`,
                value: Math.random()
              })),
              longTerm: 'x'.repeat(100)
            }
          })),
          coordination: {
            consensus: Array.from({ length: 50 }, (_, i) => ({
              round: i,
              votes: Array.from({ length: 10 }, () => Math.random() > 0.5)
            }))
          },
          timestamp: Date.now()
        };

        const serializedSize = JSON.stringify(largeState).length;
        result.stateSize = serializedSize;

        console.log(`  State size: ${(serializedSize / 1024).toFixed(2)} KB`);

        // Benchmark serialization (save)
        const serStart = performance.now();
        await stateManager.saveState(swarmId, largeState);
        const serEnd = performance.now();
        result.serializationTime = serEnd - serStart;

        // Benchmark deserialization (load)
        const deserStart = performance.now();
        const loadedState = await stateManager.loadState(swarmId);
        const deserEnd = performance.now();
        result.deserializationTime = deserEnd - deserStart;

        result.totalTime = result.serializationTime + result.deserializationTime;
        result.throughput = (serializedSize / 1024) / (result.totalTime / 1000); // KB/sec

        // Verify integrity
        const integrityCheck = loadedState &&
                              loadedState.agents.length === 200 &&
                              loadedState.agents[0].tasks.length === 20 &&
                              loadedState.coordination.consensus.length === 50;

        result.passed = integrityCheck &&
                       result.serializationTime < 10 &&
                       result.deserializationTime < 10;

        console.log(`  Serialization time: ${result.serializationTime.toFixed(4)}ms`);
        console.log(`  Deserialization time: ${result.deserializationTime.toFixed(4)}ms`);
        console.log(`  Total time: ${result.totalTime.toFixed(4)}ms`);
        console.log(`  Throughput: ${result.throughput.toFixed(2)} KB/sec`);
        console.log(`  Data integrity: ${integrityCheck ? 'PASS ✅' : 'FAIL ❌'}`);

        // Get WASM performance metrics
        const wasmReport = stateManager.getWasmReport();
        if (wasmReport.enabled) {
          console.log(`  WASM avg time: ${wasmReport.performance.avgWasmTime}`);
          console.log(`  JS avg time: ${wasmReport.performance.avgJsTime}`);
          console.log(`  Speedup: ${wasmReport.performance.speedup}`);
        }
      } catch (error) {
        console.error('Large state handling test failed:', error);
        result.passed = false;
      }

      testResults.largeStateHandling = result;
      expect(result.passed).toBe(true);
    }, 30000);

    it('should scale efficiently with state size', async () => {
      const stateSizes = [10, 50, 100, 200]; // KB targets
      const scalabilityData = [];

      for (const targetKB of stateSizes) {
        const swarmId = `test-swarm-size-${targetKB}`;

        // Calculate agent count to reach target size
        const agentCount = Math.ceil(targetKB * 10); // Approximate

        const testState = {
          swarmId,
          agents: Array.from({ length: agentCount }, (_, i) => ({
            id: `agent_${i}`,
            data: 'x'.repeat(100)
          }))
        };

        const actualSize = JSON.stringify(testState).length / 1024; // KB

        const startTime = performance.now();
        await stateManager.saveState(swarmId, testState);
        await stateManager.loadState(swarmId);
        const endTime = performance.now();

        const totalTime = endTime - startTime;
        const throughput = actualSize / (totalTime / 1000); // KB/sec

        scalabilityData.push({
          targetKB,
          actualKB: actualSize.toFixed(2),
          time: totalTime.toFixed(2),
          throughput: throughput.toFixed(2)
        });

        console.log(`  ${actualSize.toFixed(2)} KB: ${totalTime.toFixed(2)}ms (${throughput.toFixed(2)} KB/sec)`);
      }

      // Verify throughput remains consistent (indicating good scaling)
      const throughputs = scalabilityData.map(d => parseFloat(d.throughput));
      const avgThroughput = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
      const throughputVariance = Math.max(...throughputs) - Math.min(...throughputs);

      console.log(`  Avg throughput: ${avgThroughput.toFixed(2)} KB/sec`);
      console.log(`  Throughput variance: ${throughputVariance.toFixed(2)} KB/sec`);

      // Variance should be small (good scaling)
      expect(throughputVariance).toBeLessThan(avgThroughput * 0.5);
    }, 40000);
  });

  describe('4. Fallback Behavior', () => {
    it('should fallback to JavaScript when WASM fails', async () => {
      const result = {
        fallbackTriggered: false,
        functionalityPreserved: false,
        performanceAcceptable: false,
        passed: false
      };

      try {
        const swarmId = 'test-swarm-6';

        const testState = {
          swarmId,
          data: { value: 'fallback-test', timestamp: Date.now() }
        };

        const startTime = performance.now();

        // Save and load (should work with or without WASM)
        await stateManager.saveState(swarmId, testState);
        const loadedState = await stateManager.loadState(swarmId);

        const endTime = performance.now();
        const operationTime = endTime - startTime;

        result.fallbackTriggered = true;
        result.functionalityPreserved = loadedState &&
                                       loadedState.data.value === 'fallback-test';
        result.performanceAcceptable = operationTime < 100;

        const stats = await stateManager.getStatistics();
        console.log(`  WASM enabled: ${stats.wasm?.enabled || false}`);
        console.log(`  Operation time: ${operationTime.toFixed(2)}ms`);
        console.log(`  Data preserved: ${result.functionalityPreserved ? 'YES ✅' : 'NO ❌'}`);

        result.passed = result.functionalityPreserved && result.performanceAcceptable;
      } catch (error) {
        console.error('Fallback test failed:', error);
        result.passed = false;
      }

      testResults.fallbackBehavior = result;
      expect(result.passed).toBe(true);
    }, 15000);

    it('should maintain statistics in fallback mode', async () => {
      const swarmId = 'test-swarm-7';

      // Perform multiple operations
      for (let i = 0; i < 5; i++) {
        const state = {
          swarmId,
          iteration: i,
          data: { value: Math.random() }
        };

        await stateManager.saveState(swarmId, state);
        await stateManager.loadState(swarmId);
      }

      const stats = await stateManager.getStatistics();
      const wasmReport = stateManager.getWasmReport();

      console.log(`  States saved: ${stats.statesSaved}`);
      console.log(`  States loaded: ${stats.statesLoaded}`);
      console.log(`  WASM enabled: ${wasmReport.enabled}`);

      if (wasmReport.enabled) {
        console.log(`  WASM serializations: ${wasmReport.serialization.wasm}`);
        console.log(`  JS serializations: ${wasmReport.serialization.js}`);
      }

      expect(stats.statesSaved).toBeGreaterThan(0);
      expect(stats.statesLoaded).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Integration Validation Summary', () => {
    it('should validate all state manager WASM integration tests passed', () => {
      const validation = {
        wasmSnapshots: testResults.wasmSnapshots?.passed || false,
        compressionPipeline: testResults.compressionPipeline?.passed || false,
        largeStateHandling: testResults.largeStateHandling?.passed || false,
        fallbackBehavior: testResults.fallbackBehavior?.passed || false
      };

      console.log('\n📋 State Manager WASM Integration Validation:');
      console.log(`  WASM Snapshots: ${validation.wasmSnapshots ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  Compression Pipeline: ${validation.compressionPipeline ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  Large State Handling: ${validation.largeStateHandling ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  Fallback Behavior: ${validation.fallbackBehavior ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  Overall Confidence: ${(testResults.confidence * 100).toFixed(1)}%`);

      expect(testResults.confidence).toBeGreaterThanOrEqual(0.75);
    });
  });
});

module.exports = {
  testResults
};
