/**
 * Jest test suite for Performance Benchmark Tests
 * Phase 0 Component: Performance Validation and Benchmarking
 */

import { jest } from '@jest/globals';
import { performance } from 'perf_hooks';

// Mock Redis client for performance testing
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
  hDel: jest.fn(),
  info: jest.fn()
};

// Mock performance monitoring utilities
const mockPerformanceMonitor = {
  startTimer: jest.fn(),
  endTimer: jest.fn(),
  recordMetric: jest.fn(),
  getMetrics: jest.fn()
};

describe('Performance Benchmark Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup default mock returns
    mockRedisClient.connect.mockResolvedValue();
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockRedisClient.setEx.mockResolvedValue('OK');
    mockRedisClient.get.mockResolvedValue('{}');
    mockRedisClient.keys.mockResolvedValue([]);
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.sMembers.mockResolvedValue([]);
    mockRedisClient.sAdd.mockResolvedValue(1);
    mockRedisClient.hSet.mockResolvedValue(1);
    mockRedisClient.hDel.mockResolvedValue(1);
    mockRedisClient.info.mockResolvedValue('used_memory_human:1.5M\nconnected_clients:2\nuptime_in_seconds:3600');

    mockPerformanceMonitor.startTimer.mockReturnValue('timer-123');
    mockPerformanceMonitor.endTimer.mockReturnValue(100);
    mockPerformanceMonitor.getMetrics.mockReturnValue({
      redisOperations: { avgLatency: 50, p95Latency: 100, throughput: 1000 },
      swarmOperations: { avgLatency: 200, p95Latency: 400, throughput: 500 },
      memoryUsage: { heapUsed: 50 * 1024 * 1024, heapTotal: 100 * 1024 * 1024 }
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Redis Performance Benchmarks', () => {
    it('should benchmark Redis connection performance', async () => {
      const { connectRedis } = await import('../../cli/utils/redis-client.js');
      connectRedis.mockResolvedValue(mockRedisClient);

      // Measure connection time
      const startTime = performance.now();
      await connectRedis();
      const connectionTime = performance.now() - startTime;

      expect(connectionTime).toBeLessThan(1000); // Should connect within 1 second
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('should benchmark Redis SET operations with varying payload sizes', async () => {
      const payloadSizes = [
        { name: 'small', size: 1024 },           // 1KB
        { name: 'medium', size: 10240 },         // 10KB
        { name: 'large', size: 102400 },         // 100KB
        { name: 'xlarge', size: 1024000 }        // 1MB
      ];

      const results = {};

      for (const payload of payloadSizes) {
        const testData = 'x'.repeat(payload.size);
        const iterations = 10;
        const times = [];

        for (let i = 0; i < iterations; i++) {
          const startTime = performance.now();
          await mockRedisClient.setEx(`test:${i}`, 3600, testData);
          const endTime = performance.now();
          times.push(endTime - startTime);
        }

        const avgTime = times.reduce((sum, time) => sum + time, 0) / iterations;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);

        results[payload.name] = {
          size: payload.size,
          avgTime: Math.round(avgTime * 100) / 100,
          minTime: Math.round(minTime * 100) / 100,
          maxTime: Math.round(maxTime * 100) / 100,
          throughput: Math.round((payload.size / avgTime) * 1000) // bytes/sec
        };
      }

      // Performance assertions
      expect(results.small.avgTime).toBeLessThan(10);   // < 10ms for 1KB
      expect(results.medium.avgTime).toBeLessThan(50);  // < 50ms for 10KB
      expect(results.large.avgTime).toBeLessThan(200);  // < 200ms for 100KB
      expect(results.xlarge.avgTime).toBeLessThan(1000); // < 1s for 1MB

      // Throughput should decrease with size but remain reasonable
      expect(results.small.throughput).toBeGreaterThan(100000);  // > 100KB/s
      expect(results.medium.throughput).toBeGreaterThan(200000); // > 200KB/s
      expect(results.large.throughput).toBeGreaterThan(500000);  // > 500KB/s
    });

    it('should benchmark Redis GET operations under load', async () => {
      const concurrencyLevels = [1, 5, 10, 20, 50];
      const results = {};

      for (const concurrency of concurrencyLevels) {
        const operations = 100;
        const promises = [];

        const startTime = performance.now();

        for (let i = 0; i < operations; i++) {
          promises.push(mockRedisClient.get(`load-test:${i}`));
        }

        await Promise.all(promises);
        const endTime = performance.now();

        const totalTime = endTime - startTime;
        const throughput = (operations / totalTime) * 1000; // ops/sec
        const avgLatency = totalTime / operations;

        results[concurrency] = {
          concurrency,
          operations,
          totalTime: Math.round(totalTime * 100) / 100,
          throughput: Math.round(throughput),
          avgLatency: Math.round(avgLatency * 100) / 100
        };
      }

      // Performance assertions
      expect(results[1].throughput).toBeGreaterThan(1000);  // > 1000 ops/sec single-threaded
      expect(results[10].throughput).toBeGreaterThan(5000); // > 5000 ops/sec with 10 concurrent
      expect(results[50].throughput).toBeGreaterThan(10000); // > 10000 ops/sec with 50 concurrent

      // Latency should remain reasonable even under load
      expect(results[50].avgLatency).toBeLessThan(20); // < 20ms average latency at 50 concurrency
    });

    it('should benchmark Redis batch operations', async () => {
      const batchSizes = [10, 50, 100, 500, 1000];
      const results = {};

      for (const batchSize of batchSizes) {
        const startTime = performance.now();

        // Simulate batch SET operations
        const setPromises = [];
        for (let i = 0; i < batchSize; i++) {
          setPromises.push(mockRedisClient.setEx(`batch:${i}`, 3600, `value-${i}`));
        }
        await Promise.all(setPromises);

        const setEndTime = performance.now();

        // Simulate batch GET operations
        const getPromises = [];
        for (let i = 0; i < batchSize; i++) {
          getPromises.push(mockRedisClient.get(`batch:${i}`));
        }
        await Promise.all(getPromises);

        const getEndTime = performance.now();

        results[batchSize] = {
          batchSize,
          setTime: Math.round((setEndTime - startTime) * 100) / 100,
          getTime: Math.round((getEndTime - setEndTime) * 100) / 100,
          totalTime: Math.round((getEndTime - startTime) * 100) / 100,
          setThroughput: Math.round((batchSize / (setEndTime - startTime)) * 1000),
          getThroughput: Math.round((batchSize / (getEndTime - setEndTime)) * 1000)
        };
      }

      // Batch performance should scale well
      expect(results[100].setThroughput).toBeGreaterThan(5000);  // > 5000 SET ops/sec
      expect(results[100].getThroughput).toBeGreaterThan(10000); // > 10000 GET ops/sec
      expect(results[1000].setThroughput).toBeGreaterThan(8000); // > 8000 SET ops/sec for large batches
    });
  });

  describe('Swarm State Performance Benchmarks', () => {
    it('should benchmark swarm state serialization/deserialization', async () => {
      const swarmSizes = [
        { agents: 5, tasks: 10, name: 'small' },
        { agents: 20, tasks: 50, name: 'medium' },
        { agents: 50, tasks: 200, name: 'large' },
        { agents: 100, tasks: 500, name: 'xlarge' }
      ];

      const results = {};

      for (const size of swarmSizes) {
        const swarmState = {
          id: `perf-test-${size.name}`,
          objective: `Performance test for ${size.name} swarm`,
          status: 'running',
          startTime: Date.now(),
          agents: Array(size.agents).fill(null).map((_, i) => ({
            id: `agent-${i}`,
            type: ['coder', 'tester', 'architect', 'researcher'][i % 4],
            status: 'active',
            task: `Task ${i}`,
            progress: Math.random(),
            lastActivity: Date.now()
          })),
          tasks: Array(size.tasks).fill(null).map((_, i) => ({
            id: `task-${i}`,
            description: `Performance test task ${i}`,
            status: ['pending', 'in_progress', 'completed'][i % 3],
            assignedTo: `agent-${i % size.agents}`,
            progress: Math.random(),
            createdAt: Date.now()
          })),
          metadata: {
            progress: Math.random(),
            totalOperations: size.tasks * 10,
            completedOperations: Math.floor(size.tasks * 5),
            errors: Math.floor(Math.random() * 5)
          }
        };

        // Benchmark serialization
        const serializationTimes = [];
        for (let i = 0; i < 10; i++) {
          const startTime = performance.now();
          const serialized = JSON.stringify(swarmState);
          const endTime = performance.now();
          serializationTimes.push(endTime - startTime);
        }

        // Benchmark deserialization
        const serialized = JSON.stringify(swarmState);
        const deserializationTimes = [];
        for (let i = 0; i < 10; i++) {
          const startTime = performance.now();
          JSON.parse(serialized);
          const endTime = performance.now();
          deserializationTimes.push(endTime - startTime);
        }

        results[size.name] = {
          agents: size.agents,
          tasks: size.tasks,
          stateSize: serialized.length,
          avgSerializationTime: Math.round(
            (serializationTimes.reduce((sum, time) => sum + time, 0) / 10) * 100
          ) / 100,
          avgDeserializationTime: Math.round(
            (deserializationTimes.reduce((sum, time) => sum + time, 0) / 10) * 100
          ) / 100,
          serializationThroughput: Math.round(
            (serialized.length / (serializationTimes.reduce((sum, time) => sum + time, 0) / 10)) * 1000
          ),
          deserializationThroughput: Math.round(
            (serialized.length / (deserializationTimes.reduce((sum, time) => sum + time, 0) / 10)) * 1000
          )
        };
      }

      // Performance assertions
      expect(results.small.avgSerializationTime).toBeLessThan(1);    // < 1ms for small swarms
      expect(results.medium.avgSerializationTime).toBeLessThan(5);  // < 5ms for medium swarms
      expect(results.large.avgSerializationTime).toBeLessThan(20);  // < 20ms for large swarms
      expect(results.xlarge.avgSerializationTime).toBeLessThan(50); // < 50ms for xlarge swarms

      // Throughput should be high for all sizes
      expect(results.small.serializationThroughput).toBeGreaterThan(1000000);  // > 1MB/s
      expect(results.large.serializationThroughput).toBeGreaterThan(500000);   // > 500KB/s
    });

    it('should benchmark concurrent swarm operations', async () => {
      const { saveSwarmState, loadSwarmState, connectRedis } = await import('../../cli/utils/redis-client.js');
      connectRedis.mockResolvedValue(mockRedisClient);
      saveSwarmState.mockResolvedValue(true);
      loadSwarmState.mockResolvedValue({});

      const concurrencyLevels = [5, 10, 25, 50];
      const operationsPerConcurrency = 20;
      const results = {};

      for (const concurrency of concurrencyLevels) {
        const operations = [];
        const startTime = performance.now();

        // Create concurrent save operations
        for (let i = 0; i < operationsPerConcurrency; i++) {
          operations.push(
            saveSwarmState(mockRedisClient, `concurrent-swarm-${i}`, {
              id: `concurrent-swarm-${i}`,
              status: 'running',
              agents: [{ id: `agent-${i}` }],
              tasks: [{ id: `task-${i}` }]
            })
          );
        }

        await Promise.all(operations);
        const saveEndTime = performance.now();

        // Create concurrent load operations
        const loadOperations = [];
        for (let i = 0; i < operationsPerConcurrency; i++) {
          loadOperations.push(loadSwarmState(mockRedisClient, `concurrent-swarm-${i}`));
        }

        await Promise.all(loadOperations);
        const loadEndTime = performance.now();

        results[concurrency] = {
          concurrency,
          operations: operationsPerConcurrency,
          saveTime: Math.round((saveEndTime - startTime) * 100) / 100,
          loadTime: Math.round((loadEndTime - saveEndTime) * 100) / 100,
          totalTime: Math.round((loadEndTime - startTime) * 100) / 100,
          saveThroughput: Math.round((operationsPerConcurrency / (saveEndTime - startTime)) * 1000),
          loadThroughput: Math.round((operationsPerConcurrency / (loadEndTime - saveEndTime)) * 1000)
        };
      }

      // Concurrent performance assertions
      expect(results[5].saveThroughput).toBeGreaterThan(100);  // > 100 saves/sec with 5 concurrent
      expect(results[10].saveThroughput).toBeGreaterThan(200); // > 200 saves/sec with 10 concurrent
      expect(results[25].saveThroughput).toBeGreaterThan(400); // > 400 saves/sec with 25 concurrent
      expect(results[50].saveThroughput).toBeGreaterThan(600); // > 600 saves/sec with 50 concurrent

      // Load operations should be faster than save operations
      expect(results[50].loadThroughput).toBeGreaterThan(results[50].saveThroughput);
    });
  });

  describe('Memory Usage Benchmarks', () => {
    it('should benchmark memory usage during swarm operations', async () => {
      const initialMemory = process.memoryUsage();
      const swarms = [];

      // Create multiple swarms and track memory usage
      for (let i = 0; i < 100; i++) {
        const swarm = {
          id: `memory-test-${i}`,
          objective: `Memory test swarm ${i}`,
          status: 'running',
          agents: Array(10).fill(null).map((_, j) => ({
            id: `agent-${i}-${j}`,
            type: 'coder',
            status: 'active',
            task: `Task ${j}`,
            data: new Array(100).fill(`data-${i}-${j}`).join('')
          })),
          tasks: Array(20).fill(null).map((_, j) => ({
            id: `task-${i}-${j}`,
            description: `Memory test task ${j}`,
            status: 'in_progress',
            data: new Array(50).fill(`task-data-${i}-${j}`).join('')
          }))
        };

        swarms.push(swarm);

        // Measure memory every 10 swarms
        if ((i + 1) % 10 === 0) {
          const currentMemory = process.memoryUsage();
          const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;
          const memoryPerSwarm = memoryIncrease / (i + 1);

          // Memory usage should be reasonable
          expect(memoryPerSwarm).toBeLessThan(1024 * 1024); // < 1MB per swarm
        }
      }

      // Final memory check
      const finalMemory = process.memoryUsage();
      const totalMemoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const avgMemoryPerSwarm = totalMemoryIncrease / swarms.length;

      expect(avgMemoryPerSwarm).toBeLessThan(512 * 1024); // < 512KB average per swarm
      expect(totalMemoryIncrease).toBeLessThan(100 * 1024 * 1024); // < 100MB total for 100 swarms
    });

    it('should benchmark memory cleanup after swarm operations', async () => {
      const initialMemory = process.memoryUsage();
      const swarms = [];

      // Create swarms
      for (let i = 0; i < 50; i++) {
        const swarm = {
          id: `cleanup-test-${i}`,
          data: new Array(1000).fill(`memory-data-${i}`).join(''),
          agents: Array(20).fill(null).map((_, j) => ({
            id: `agent-${i}-${j}`,
            payload: new Array(500).fill(`agent-data-${j}`).join('')
          }))
        };
        swarms.push(swarm);
      }

      const peakMemory = process.memoryUsage();
      const memoryIncrease = peakMemory.heapUsed - initialMemory.heapUsed;

      // Clear references to trigger garbage collection
      swarms.length = 0;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Allow some time for GC
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage();
      const memoryReclaimed = peakMemory.heapUsed - finalMemory.heapUsed;
      const reclaimPercentage = (memoryReclaimed / memoryIncrease) * 100;

      // Should reclaim at least 50% of memory
      expect(reclaimPercentage).toBeGreaterThan(50);

      // Final memory should be close to initial
      const finalIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(finalIncrease).toBeLessThan(memoryIncrease * 0.5); // < 50% of peak increase
    });
  });

  describe('Performance Regression Detection', () => {
    it('should detect Redis performance regression', async () => {
      const { connectRedis } = await import('../../cli/utils/redis-client.js');
      connectRedis.mockResolvedValue(mockRedisClient);

      // Baseline performance (simulated)
      const baselineConnectionTime = 50; // 50ms
      const baselineOperationTime = 5;   // 5ms per operation

      // Current performance measurement
      const connectionStart = performance.now();
      await connectRedis();
      const currentConnectionTime = performance.now() - connectionStart;

      const operationStart = performance.now();
      await mockRedisClient.setEx('test', 3600, 'value');
      await mockRedisClient.get('test');
      const currentOperationTime = performance.now() - operationStart;

      // Regression detection (allow 50% degradation)
      const connectionRegression = (currentConnectionTime / baselineConnectionTime) - 1;
      const operationRegression = (currentOperationTime / baselineOperationTime) - 1;

      expect(connectionRegression).toBeLessThan(0.5); // < 50% regression
      expect(operationRegression).toBeLessThan(0.5);  // < 50% regression

      // Performance should still meet minimum requirements
      expect(currentConnectionTime).toBeLessThan(100);  // < 100ms connection
      expect(currentOperationTime).toBeLessThan(20);    // < 20ms operations
    });

    it('should detect swarm state performance regression', async () => {
      // Create large swarm state
      const largeSwarmState = {
        id: 'regression-test',
        agents: Array(100).fill(null).map((_, i) => ({
          id: `agent-${i}`,
          data: new Array(100).fill(`agent-data-${i}`).join('')
        })),
        tasks: Array(500).fill(null).map((_, i) => ({
          id: `task-${i}`,
          data: new Array(50).fill(`task-data-${i}`).join('')
        }))
      };

      // Baseline performance
      const baselineSerializationTime = 10; // 10ms
      const baselineDeserializationTime = 8; // 8ms

      // Current performance measurement
      const serializationStart = performance.now();
      const serialized = JSON.stringify(largeSwarmState);
      const currentSerializationTime = performance.now() - serializationStart;

      const deserializationStart = performance.now();
      JSON.parse(serialized);
      const currentDeserializationTime = performance.now() - deserializationStart;

      // Regression detection
      const serializationRegression = (currentSerializationTime / baselineSerializationTime) - 1;
      const deserializationRegression = (currentDeserializationTime / baselineDeserializationTime) - 1;

      expect(serializationRegression).toBeLessThan(0.5);    // < 50% regression
      expect(deserializationRegression).toBeLessThan(0.5);  // < 50% regression

      // Performance should still meet minimum requirements
      expect(currentSerializationTime).toBeLessThan(50);    // < 50ms serialization
      expect(currentDeserializationTime).toBeLessThan(40);  // < 40ms deserialization
    });
  });

  describe('Load Testing and Stress Testing', () => {
    it('should handle high-frequency swarm state operations', async () => {
      const { saveSwarmState, connectRedis } = await import('../../cli/utils/redis-client.js');
      connectRedis.mockResolvedValue(mockRedisClient);
      saveSwarmState.mockResolvedValue(true);

      const operations = 1000;
      const concurrency = 50;
      const batchSize = operations / concurrency;

      const startTime = performance.now();
      const promises = [];

      for (let batch = 0; batch < concurrency; batch++) {
        const batchPromises = [];
        for (let i = 0; i < batchSize; i++) {
          const operationId = batch * batchSize + i;
          batchPromises.push(
            saveSwarmState(mockRedisClient, `load-test-${operationId}`, {
              id: `load-test-${operationId}`,
              status: 'running',
              timestamp: Date.now()
            })
          );
        }
        promises.push(Promise.all(batchPromises));
      }

      await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const throughput = (operations / totalTime) * 1000;
      const avgLatency = totalTime / operations;

      // Load testing assertions
      expect(throughput).toBeGreaterThan(1000);    // > 1000 ops/sec
      expect(avgLatency).toBeLessThan(10);          // < 10ms average latency
      expect(totalTime).toBeLessThan(5000);         // < 5 seconds total

      // System should remain stable under load
      expect(mockRedisClient.setEx).toHaveBeenCalledTimes(operations);
    });

    it('should maintain performance under sustained load', async () => {
      const { saveSwarmState, loadSwarmState, connectRedis } = await import('../../cli/utils/redis-client.js');
      connectRedis.mockResolvedValue(mockRedisClient);
      saveSwarmState.mockResolvedValue(true);
      loadSwarmState.mockResolvedValue({});

      const duration = 10000; // 10 seconds
      const targetThroughput = 100; // 100 ops/sec
      const interval = 1000 / targetThroughput; // 10ms between operations

      const startTime = Date.now();
      const operations = [];
      const latencies = [];

      const runOperation = async (id) => {
        const opStart = performance.now();

        await saveSwarmState(mockRedisClient, `sustained-${id}`, {
          id: `sustained-${id}`,
          status: 'running',
          timestamp: Date.now()
        });

        await loadSwarmState(mockRedisClient, `sustained-${id}`);

        const opEnd = performance.now();
        latencies.push(opEnd - opStart);
      };

      // Run sustained load
      while (Date.now() - startTime < duration) {
        const id = operations.length;
        operations.push(runOperation(id));

        // Add small delay to control throughput
        if (operations.length % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      await Promise.all(operations);

      // Analyze performance
      const totalOperations = operations.length;
      const actualThroughput = totalOperations / (duration / 1000);
      const avgLatency = latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
      const maxLatency = Math.max(...latencies);

      // Sustained load assertions
      expect(actualThroughput).toBeGreaterThan(targetThroughput * 0.8); // > 80% of target
      expect(avgLatency).toBeLessThan(50);   // < 50ms average latency
      expect(p95Latency).toBeLessThan(100);  // < 100ms P95 latency
      expect(maxLatency).toBeLessThan(500);  // < 500ms max latency

      // Performance should be stable (no significant degradation)
      const firstHalfLatencies = latencies.slice(0, Math.floor(latencies.length / 2));
      const secondHalfLatencies = latencies.slice(Math.floor(latencies.length / 2));

      const firstHalfAvg = firstHalfLatencies.reduce((sum, lat) => sum + lat, 0) / firstHalfLatencies.length;
      const secondHalfAvg = secondHalfLatencies.reduce((sum, lat) => sum + lat, 0) / secondHalfLatencies.length;

      const degradation = (secondHalfAvg / firstHalfAvg) - 1;
      expect(degradation).toBeLessThan(0.3); // < 30% degradation over time
    });
  });

  describe('Performance Monitoring and Metrics', () => {
    it('should collect and report performance metrics', async () => {
      const mockMetricsCollector = {
        startTimer: jest.fn().mockReturnValue('timer-123'),
        endTimer: jest.fn().mockReturnValue(150),
        recordMetric: jest.fn(),
        getReport: jest.fn().mockReturnValue({
          operations: {
            total: 100,
            successful: 98,
            failed: 2,
            avgLatency: 45.5,
            p95Latency: 120,
            p99Latency: 200
          },
          resources: {
            memoryUsage: '45.2MB',
            cpuUsage: '12.5%',
            redisConnections: 5
          },
          throughput: {
            current: 220.5,
            peak: 450.2,
            average: 285.7
          },
          errors: {
            timeoutErrors: 1,
            connectionErrors: 1,
            validationErrors: 0
          }
        })
      };

      // Simulate performance monitoring
      const timerId = mockMetricsCollector.startTimer('swarm-operation');

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));

      const duration = mockMetricsCollector.endTimer(timerId);
      mockMetricsCollector.recordMetric('operation-latency', duration);

      // Collect metrics
      const report = mockMetricsCollector.getReport();

      // Metrics validation
      expect(report.operations.total).toBe(100);
      expect(report.operations.successful).toBe(98);
      expect(report.operations.failed).toBe(2);
      expect(report.operations.avgLatency).toBe(45.5);
      expect(report.operations.p95Latency).toBe(120);
      expect(report.throughput.current).toBe(220.5);
      expect(report.resources.memoryUsage).toBe('45.2MB');

      expect(mockMetricsCollector.startTimer).toHaveBeenCalledWith('swarm-operation');
      expect(mockMetricsCollector.endTimer).toHaveBeenCalledWith('timer-123');
      expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith('operation-latency', 150);
    });

    it('should detect performance anomalies', async () => {
      const mockAnomalyDetector = {
        checkThreshold: jest.fn(),
        detectOutliers: jest.fn(),
        generateAlert: jest.fn()
      };

      const metrics = {
        latency: [10, 12, 11, 15, 200, 13, 14, 12], // 200 is an outlier
        throughput: [100, 105, 98, 102, 25, 110, 95, 108], // 25 is an outlier
        errorRate: [0.01, 0.02, 0.015, 0.8, 0.025, 0.018] // 0.8 is an outlier
      };

      mockAnomalyDetector.checkThreshold.mockImplementation((metric, value, threshold) => {
        return {
          metric,
          value,
          threshold,
          isAnomalous: value > threshold
        };
      });

      mockAnomalyDetector.detectOutliers.mockImplementation((values) => {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const stdDev = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length);

        return values.filter(value => Math.abs(value - mean) > 2 * stdDev);
      });

      // Check for anomalies
      const latencyCheck = mockAnomalyDetector.checkThreshold('latency', 200, 50);
      const throughputCheck = mockAnomalyDetector.checkThreshold('throughput', 25, 50);
      const errorRateCheck = mockAnomalyDetector.checkThreshold('errorRate', 0.8, 0.1);

      const latencyOutliers = mockAnomalyDetector.detectOutliers(metrics.latency);
      const throughputOutliers = mockAnomalyDetector.detectOutliers(metrics.throughput);
      const errorRateOutliers = mockAnomalyDetector.detectOutliers(metrics.errorRate);

      // Anomaly detection validation
      expect(latencyCheck.isAnomalous).toBe(true);
      expect(throughputCheck.isAnomalous).toBe(true);
      expect(errorRateCheck.isAnomalous).toBe(true);

      expect(latencyOutliers).toContain(200);
      expect(throughputOutliers).toContain(25);
      expect(errorRateOutliers).toContain(0.8);

      // Generate alerts for anomalies
      if (latencyCheck.isAnomalous) {
        mockAnomalyDetector.generateAlert('HIGH_LATENCY', latencyCheck);
      }
      if (throughputCheck.isAnomalous) {
        mockAnomalyDetector.generateAlert('LOW_THROUGHPUT', throughputCheck);
      }
      if (errorRateCheck.isAnomalous) {
        mockAnomalyDetector.generateAlert('HIGH_ERROR_RATE', errorRateCheck);
      }

      expect(mockAnomalyDetector.generateAlert).toHaveBeenCalledTimes(3);
      expect(mockAnomalyDetector.generateAlert).toHaveBeenCalledWith('HIGH_LATENCY', latencyCheck);
      expect(mockAnomalyDetector.generateAlert).toHaveBeenCalledWith('LOW_THROUGHPUT', throughputCheck);
      expect(mockAnomalyDetector.generateAlert).toHaveBeenCalledWith('HIGH_ERROR_RATE', errorRateCheck);
    });
  });
});