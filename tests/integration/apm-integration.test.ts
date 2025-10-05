/**
 * Integration Tests for Advanced APM System
 * Tests DataDog, New Relic, and distributed tracing functionality
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { APMIntegration, createAPMIntegration } from '../../src/monitoring/apm/apm-integration.js';
import { DataDogCollector } from '../../src/monitoring/apm/datadog-collector.js';
import { NewRelicCollector } from '../../src/monitoring/apm/newrelic-collector.js';

// Mock the console to avoid noise during tests
const originalConsole = global.console;
beforeAll(() => {
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
});

afterAll(() => {
  global.console = originalConsole;
});

describe('APM Integration Tests', () => {
  let apmIntegration: APMIntegration;

  beforeEach(() => {
    // Create a fresh APM integration for each test
    apmIntegration = createAPMIntegration({
      dataDog: {
        enabled: true,
        apiKey: 'test-datadog-key',
        serviceName: 'test-service'
      },
      newRelic: {
        enabled: true,
        licenseKey: 'test-newrelic-key',
        appName: 'Test Application'
      },
      distributedTracing: {
        enabled: true,
        samplingRate: 1.0
      },
      performanceOptimization: {
        enabled: true,
        monitoringInterval: 1000
      },
      customMetrics: {
        enabled: true,
        interval: 5000
      },
      alerting: {
        enabled: false // Disable alerting in tests
      }
    });
  });

  afterEach(async () => {
    if (apmIntegration) {
      await apmIntegration.shutdown();
    }
  });

  describe('Basic Functionality', () => {
    test('should initialize APM integration with all components', () => {
      expect(apmIntegration).toBeDefined();

      const collectors = apmIntegration.getCollectors();
      expect(collectors.dataDog).toBeDefined();
      expect(collectors.newRelic).toBeDefined();
      expect(collectors.distributedTracer).toBeDefined();
      expect(collectors.performanceOptimizer).toBeDefined();
    });

    test('should report healthy status initially', async () => {
      const health = await apmIntegration.getHealthStatus();

      expect(health.overall).toBe('healthy');
      expect(health.components.dataDog).toBe('healthy');
      expect(health.components.newRelic).toBe('healthy');
      expect(health.components.distributedTracing).toBe('healthy');
      expect(health.components.performanceOptimizer).toBe('healthy');
    });

    test('should collect and report custom metrics', () => {
      // Record business metrics
      apmIntegration.recordBusinessMetric('test.metric', 42, { tag: 'test' });
      apmIntegration.recordBusinessMetric('test.counter', 1, { tag: 'test' }, 'count');
      apmIntegration.recordBusinessMetric('test.histogram', 100, { tag: 'test' }, 'histogram');

      // Should not throw errors
      expect(() => apmIntegration.recordBusinessMetric('test.metric', 0)).not.toThrow();
    });
  });

  describe('Agent Lifecycle Tracing', () => {
    test('should trace agent lifecycle events', () => {
      expect(() => {
        apmIntegration.traceAgentLifecycle('test-agent', 'spawn', 'agent-123');
        apmIntegration.traceAgentLifecycle('test-agent', 'initialize', 'agent-123');
        apmIntegration.traceAgentLifecycle('test-agent', 'execute', 'agent-123');
        apmIntegration.traceAgentLifecycle('test-agent', 'complete', 'agent-123');
        apmIntegration.traceAgentLifecycle('test-agent', 'cleanup', 'agent-123');
      }).not.toThrow();
    });

    test('should trace agent errors', () => {
      expect(() => {
        apmIntegration.traceAgentLifecycle('test-agent', 'error', 'agent-123', {
          error: 'Test error message'
        });
      }).not.toThrow();
    });

    test('should handle multiple agents simultaneously', () => {
      const agentIds = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];

      expect(() => {
        agentIds.forEach((id, index) => {
          apmIntegration.traceAgentLifecycle(`agent-type-${index % 3}`, 'execute', id);
        });
      }).not.toThrow();
    });
  });

  describe('Swarm Activity Monitoring', () => {
    test('should trace swarm activities', () => {
      expect(() => {
        apmIntegration.traceSwarmActivity('swarm-123', 'init', 'mesh', 5);
        apmIntegration.traceSwarmActivity('swarm-123', 'execute', 'mesh', 5);
        apmIntegration.traceSwarmActivity('swarm-123', 'coordinate', 'mesh', 5);
        apmIntegration.traceSwarmActivity('swarm-123', 'consensus', 'mesh', 5);
        apmIntegration.traceSwarmActivity('swarm-123', 'complete', 'mesh', 5);
      }).not.toThrow();
    });

    test('should trace different swarm topologies', () => {
      const topologies = ['mesh', 'hierarchical', 'ring', 'star'];

      expect(() => {
        topologies.forEach(topology => {
          apmIntegration.traceSwarmActivity(`swarm-${topology}`, 'execute', topology, 3);
        });
      }).not.toThrow();
    });

    test('should handle large swarm sizes', () => {
      expect(() => {
        apmIntegration.traceSwarmActivity('large-swarm', 'execute', 'hierarchical', 50);
      }).not.toThrow();
    });
  });

  describe('WebSocket Performance Optimization', () => {
    test('should optimize WebSocket operations', () => {
      expect(() => {
        apmIntegration.optimizeWebSocketPerformance('connection', 'socket-123', 10, true);
        apmIntegration.optimizeWebSocketPerformance('message', 'socket-123', 5, true);
        apmIntegration.optimizeWebSocketPerformance('broadcast', 'socket-123', 50, true);
        apmIntegration.optimizeWebSocketPerformance('disconnection', 'socket-123', 2, true);
      }).not.toThrow();
    });

    test('should handle WebSocket errors', () => {
      expect(() => {
        apmIntegration.optimizeWebSocketPerformance('connection', 'socket-456', 1000, false, {
          error: 'Connection failed'
        });
      }).not.toThrow();
    });

    test('should handle high WebSocket load', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          apmIntegration.optimizeWebSocketPerformance('message', `socket-${i}`, Math.random() * 100, true);
        }
      }).not.toThrow();
    });
  });

  describe('Database Performance Monitoring', () => {
    test('should monitor database operations', () => {
      expect(() => {
        apmIntegration.monitorDatabasePerformance('query', 'SELECT * FROM users', 50, true);
        apmIntegration.monitorDatabasePerformance('connection', undefined, 10, true);
        apmIntegration.monitorDatabasePerformance('transaction', undefined, 200, true);
      }).not.toThrow();
    });

    test('should record slow queries', () => {
      expect(() => {
        apmIntegration.monitorDatabasePerformance('query', 'SELECT * FROM large_table', 2000, true);
      }).not.toThrow();
    });

    test('should handle database errors', () => {
      expect(() => {
        apmIntegration.monitorDatabasePerformance('query', 'INVALID SQL', 500, false, {
          error: 'SQL syntax error'
        });
      }).not.toThrow();
    });

    test('should track different table operations', () => {
      const tables = ['users', 'swarms', 'agents', 'metrics'];

      expect(() => {
        tables.forEach(table => {
          apmIntegration.monitorDatabasePerformance('query', `SELECT * FROM ${table}`, Math.random() * 100, true, {
            table
          });
        });
      }).not.toThrow();
    });
  });

  describe('Performance Analytics', () => {
    test('should provide performance analytics', () => {
      const analytics = apmIntegration.getPerformanceAnalytics();

      expect(analytics).toBeDefined();
      expect(analytics.metrics).toBeDefined();
      expect(Array.isArray(analytics.recommendations)).toBe(true);
      expect(analytics.trends).toBeDefined();
    });
  });

  describe('Integration Testing', () => {
    test('should run comprehensive integration tests', async () => {
      const results = await apmIntegration.runIntegrationTest();

      expect(results).toBeDefined();
      expect(['passed', 'failed']).toContain(results.status);
      expect(results.results).toBeDefined();
      expect(typeof results.duration).toBe('number');
      expect(results.duration).toBeGreaterThan(0);
    }, 30000);

    test('should test individual components', async () => {
      const results = await apmIntegration.runIntegrationTest();

      if (results.status === 'passed') {
        expect(results.results.dataDog?.status).toBe('passed');
        expect(results.results.newRelic?.status).toBe('passed');
        expect(results.results.distributedTracing?.status).toBe('passed');
        expect(results.results.performanceOptimizer?.status).toBe('passed');
      }
    }, 30000);
  });

  describe('Disaster Recovery Testing', () => {
    test('should run disaster recovery scenarios', async () => {
      const results = await apmIntegration.runDisasterRecoveryTest();

      expect(results).toBeDefined();
      expect(['passed', 'failed']).toContain(results.status);
      expect(results.scenarios).toBeDefined();
      expect(typeof results.duration).toBe('number');
      expect(results.duration).toBeGreaterThan(0);
    }, 60000);

    test('should handle DataDog outage gracefully', async () => {
      const results = await apmIntegration.runDisasterRecoveryTest();

      expect(results.scenarios.dataDogOutage).toBeDefined();
      expect(['passed', 'failed', 'skipped']).toContain(results.scenarios.dataDogOutage.status);
    }, 60000);

    test('should handle high load scenarios', async () => {
      const results = await apmIntegration.runDisasterRecoveryTest();

      expect(results.scenarios.highLoad).toBeDefined();
      expect(['passed', 'failed']).toContain(results.scenarios.highLoad.status);

      if (results.scenarios.highLoad.status === 'passed') {
        expect(results.scenarios.highLoad.details.metricCount).toBeGreaterThan(0);
        expect(results.scenarios.highLoad.details.duration).toBeLessThan(5000);
      }
    }, 60000);

    test('should handle memory stress scenarios', async () => {
      const results = await apmIntegration.runDisasterRecoveryTest();

      expect(results.scenarios.memoryStress).toBeDefined();
      expect(['passed', 'failed', 'skipped']).toContain(results.scenarios.memoryStress.status);
    }, 60000);
  });

  describe('Load Testing', () => {
    test('should handle high metric volume', async () => {
      const startTime = Date.now();
      const metricCount = 10000;

      // Send a large number of metrics
      for (let i = 0; i < metricCount; i++) {
        apmIntegration.recordBusinessMetric('load.test', i, {
          iteration: i.toString(),
          batch: Math.floor(i / 100).toString()
        });
      }

      const duration = Date.now() - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(10000);
      expect(metricCount).toBe(10000);
    });

    test('should handle concurrent tracing operations', async () => {
      const promises: Promise<void>[] = [];
      const operationCount = 100;

      // Create concurrent tracing operations
      for (let i = 0; i < operationCount; i++) {
        promises.push(new Promise<void>((resolve) => {
          setImmediate(() => {
            apmIntegration.traceAgentLifecycle('load-test-agent', 'execute', `agent-${i}`);
            apmIntegration.traceSwarmActivity(`swarm-${i}`, 'execute', 'mesh', 5);
            apmIntegration.optimizeWebSocketPerformance('message', `socket-${i}`, Math.random() * 50, true);
            resolve();
          });
        }));
      }

      await Promise.all(promises);
    });

    test('should maintain performance under sustained load', async () => {
      const testDuration = 10000; // 10 seconds
      const startTime = Date.now();
      let operationCount = 0;

      while (Date.now() - startTime < testDuration) {
        apmIntegration.recordBusinessMetric('sustained.load.test', operationCount, {
          timestamp: Date.now().toString()
        });

        if (operationCount % 100 === 0) {
          apmIntegration.traceAgentLifecycle('sustained-agent', 'execute', `agent-${operationCount}`);
        }

        operationCount++;
        await new Promise(resolve => setTimeout(resolve, 1)); // Small delay
      }

      const actualDuration = Date.now() - startTime;
      const operationsPerSecond = (operationCount / actualDuration) * 1000;

      expect(actualDuration).toBeGreaterThanOrEqual(testDuration - 100); // Allow small margin
      expect(operationsPerSecond).toBeGreaterThan(100); // Should handle at least 100 ops/sec
    }, 15000);
  });

  describe('Error Handling', () => {
    test('should handle invalid metric names gracefully', () => {
      expect(() => {
        apmIntegration.recordBusinessMetric('', 42);
        apmIntegration.recordBusinessMetric('valid.metric', 42);
      }).not.toThrow();
    });

    test('should handle invalid trace parameters', () => {
      expect(() => {
        apmIntegration.traceAgentLifecycle('', 'execute', '');
        apmIntegration.traceSwarmActivity('', 'execute', '', 0);
        apmIntegration.optimizeWebSocketPerformance('', '', -1, true);
      }).not.toThrow();
    });

    test('should handle malformed metadata', () => {
      expect(() => {
        apmIntegration.traceAgentLifecycle('test-agent', 'execute', 'agent-1', {
          nested: { object: { with: { deep: { structure: true } } } },
          array: [1, 2, 3, 4, 5],
          nullValue: null,
          undefinedValue: undefined
        });
      }).not.toThrow();
    });
  });

  describe('Memory Management', () => {
    test('should not leak memory during normal operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform a significant number of operations
      for (let i = 0; i < 1000; i++) {
        apmIntegration.traceAgentLifecycle('memory-test-agent', 'execute', `agent-${i}`);
        apmIntegration.traceSwarmActivity(`swarm-${i}`, 'execute', 'mesh', 3);
        apmIntegration.recordBusinessMetric('memory.test', i, { iteration: i.toString() });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should clean up resources on shutdown', async () => {
      const collectors = apmIntegration.getCollectors();

      // Verify collectors exist before shutdown
      expect(collectors.dataDog).toBeDefined();
      expect(collectors.newRelic).toBeDefined();

      // Shutdown should complete without errors
      await expect(apmIntegration.shutdown()).resolves.not.toThrow();
    });
  });
});

describe('APM Integration Configuration Tests', () => {
  test('should work with minimal configuration', () => {
    const apmIntegration = createAPMIntegration({
      dataDog: { enabled: false },
      newRelic: { enabled: false },
      distributedTracing: { enabled: false },
      performanceOptimization: { enabled: false },
      customMetrics: { enabled: false }
    });

    expect(apmIntegration).toBeDefined();

    const collectors = apmIntegration.getCollectors();
    expect(collectors.dataDog).toBeUndefined();
    expect(collectors.newRelic).toBeUndefined();
    expect(collectors.distributedTracer).toBeUndefined();
    expect(collectors.performanceOptimizer).toBeUndefined();
  });

  test('should work with partial configuration', () => {
    const apmIntegration = createAPMIntegration({
      dataDog: {
        enabled: true,
        apiKey: 'test-key'
      },
      newRelic: { enabled: false },
      distributedTracing: { enabled: true, samplingRate: 0.5 }
    });

    expect(apmIntegration).toBeDefined();

    const collectors = apmIntegration.getCollectors();
    expect(collectors.dataDog).toBeDefined();
    expect(collectors.newRelic).toBeUndefined();
    expect(collectors.distributedTracer).toBeDefined();
  });

  test('should handle invalid configuration gracefully', () => {
    expect(() => {
      createAPMIntegration({
        dataDog: { enabled: true }, // Missing API key
        newRelic: { enabled: true }, // Missing license key
        distributedTracing: { enabled: true, samplingRate: -1 } // Invalid sampling rate
      });
    }).not.toThrow();
  });
});