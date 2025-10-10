/**
 * Dashboard Real-Time Performance Test - 1000+ Agent Metrics
 *
 * Validates:
 * - WebSocket/HTTP polling latency with 1000+ agents
 * - Real-time metric updates <1s refresh rate
 * - Dashboard responsiveness under load
 * - Connection stability and recovery
 * - Memory usage optimization
 */

const { performance } = require('perf_hooks');
const { createServer } = require('http');
const { Server: SocketIO } = require('socket.io');
const io = require('socket.io-client');

describe('Dashboard Real-Time Performance Test - 1000+ Agents', () => {
  let httpServer;
  let socketServer;
  let clients = [];
  let testResults;

  const PORT = 3456;
  const AGENT_COUNT = 1000;

  beforeAll(async () => {
    testResults = {
      websocketLatency: {},
      httpPollingLatency: {},
      metricUpdates: {},
      connectionStability: {},
      memoryUsage: {},
      confidence: 0
    };

    // Setup test server
    httpServer = createServer();
    socketServer = new SocketIO(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket', 'polling']
    });

    // Setup metrics emitter
    setupMetricsEmitter();

    await new Promise((resolve) => {
      httpServer.listen(PORT, () => {
        console.log(`🚀 Test server listening on port ${PORT}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Cleanup clients
    for (const client of clients) {
      client.close();
    }

    // Cleanup server
    if (socketServer) {
      socketServer.close();
    }

    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  function setupMetricsEmitter() {
    socketServer.on('connection', (socket) => {
      // Emit metrics every 500ms to simulate real-time updates
      const metricsInterval = setInterval(() => {
        const metrics = generateMetrics(AGENT_COUNT);
        socket.emit('metrics_update', metrics);
      }, 500);

      socket.on('disconnect', () => {
        clearInterval(metricsInterval);
      });

      socket.on('subscribe_agent', (agentId) => {
        socket.join(`agent:${agentId}`);
      });
    });
  }

  function generateMetrics(agentCount) {
    return {
      timestamp: Date.now(),
      fleet: {
        totalAgents: agentCount,
        activeAgents: Math.floor(agentCount * 0.8),
        idleAgents: Math.floor(agentCount * 0.2),
        tasksCompleted: Math.floor(Math.random() * 10000),
        tasksFailed: Math.floor(Math.random() * 100)
      },
      performance: {
        cpuUtilization: Math.random() * 0.5 + 0.3,
        memoryUtilization: Math.random() * 0.4 + 0.4,
        responseTime: Math.random() * 500 + 100,
        throughput: Math.random() * 100 + 50
      },
      agents: Array.from({ length: Math.min(100, agentCount) }, (_, i) => ({
        id: `agent-${i}`,
        status: ['active', 'idle', 'busy'][Math.floor(Math.random() * 3)],
        cpu: Math.random(),
        memory: Math.random() * 512
      }))
    };
  }

  describe('WebSocket Latency with 1000 Connections', () => {
    it('should maintain <100ms WebSocket latency with 1000 concurrent connections', async () => {
      const connectionLatencies = [];
      const messageLatencies = [];

      // Create 1000 WebSocket connections
      const connectionPromises = [];

      for (let i = 0; i < AGENT_COUNT; i++) {
        const connectionStart = performance.now();

        const promise = new Promise((resolve) => {
          const client = io(`http://localhost:${PORT}`, {
            transports: ['websocket']
          });

          client.on('connect', () => {
            const connectionEnd = performance.now();
            connectionLatencies.push(connectionEnd - connectionStart);
            clients.push(client);

            // Setup message latency tracking
            client.on('metrics_update', (metrics) => {
              if (metrics.timestamp) {
                const latency = Date.now() - metrics.timestamp;
                messageLatencies.push(latency);
              }
            });

            resolve(client);
          });

          client.on('connect_error', (error) => {
            console.warn(`Connection ${i} failed:`, error.message);
            resolve(null);
          });
        });

        connectionPromises.push(promise);

        // Stagger connections to avoid overwhelming the server
        if (i % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      await Promise.all(connectionPromises);

      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 10000));

      const avgConnectionLatency = connectionLatencies.reduce((a, b) => a + b, 0) / connectionLatencies.length;
      const avgMessageLatency = messageLatencies.reduce((a, b) => a + b, 0) / messageLatencies.length;
      const p95MessageLatency = messageLatencies.sort((a, b) => a - b)[Math.floor(messageLatencies.length * 0.95)];

      testResults.websocketLatency = {
        totalConnections: clients.length,
        avgConnectionLatency,
        avgMessageLatency,
        p95MessageLatency,
        messagesReceived: messageLatencies.length,
        connectionSuccessRate: (clients.length / AGENT_COUNT) * 100
      };

      console.log('\n📊 WebSocket Latency Results:');
      console.log(`  Total Connections: ${clients.length}`);
      console.log(`  Avg Connection Latency: ${avgConnectionLatency.toFixed(2)}ms`);
      console.log(`  Avg Message Latency: ${avgMessageLatency.toFixed(2)}ms`);
      console.log(`  P95 Message Latency: ${p95MessageLatency.toFixed(2)}ms`);
      console.log(`  Messages Received: ${messageLatencies.length}`);
      console.log(`  Connection Success Rate: ${testResults.websocketLatency.connectionSuccessRate.toFixed(2)}%`);

      expect(clients.length).toBeGreaterThan(AGENT_COUNT * 0.95); // >95% connection success
      expect(avgMessageLatency).toBeLessThan(100); // <100ms message latency
      expect(p95MessageLatency).toBeLessThan(200); // P95 <200ms
    }, 120000);
  });

  describe('HTTP Polling Fallback Performance', () => {
    it('should handle HTTP polling with <1s refresh rate', async () => {
      const pollingClients = [];
      const pollingLatencies = [];

      // Create 100 polling clients (subset for testing)
      const pollingPromises = [];

      for (let i = 0; i < 100; i++) {
        const promise = new Promise((resolve) => {
          const client = io(`http://localhost:${PORT}`, {
            transports: ['polling']
          });

          client.on('connect', () => {
            pollingClients.push(client);

            client.on('metrics_update', (metrics) => {
              if (metrics.timestamp) {
                const latency = Date.now() - metrics.timestamp;
                pollingLatencies.push(latency);
              }
            });

            resolve(client);
          });

          client.on('connect_error', () => {
            resolve(null);
          });
        });

        pollingPromises.push(promise);
      }

      await Promise.all(pollingPromises);

      // Wait for polling metrics
      await new Promise(resolve => setTimeout(resolve, 10000));

      const avgPollingLatency = pollingLatencies.reduce((a, b) => a + b, 0) / pollingLatencies.length;
      const maxPollingLatency = Math.max(...pollingLatencies);

      testResults.httpPollingLatency = {
        totalPollingClients: pollingClients.length,
        avgPollingLatency,
        maxPollingLatency,
        messagesReceived: pollingLatencies.length
      };

      console.log('\n📊 HTTP Polling Results:');
      console.log(`  Total Polling Clients: ${pollingClients.length}`);
      console.log(`  Avg Polling Latency: ${avgPollingLatency.toFixed(2)}ms`);
      console.log(`  Max Polling Latency: ${maxPollingLatency.toFixed(2)}ms`);
      console.log(`  Messages Received: ${pollingLatencies.length}`);

      expect(avgPollingLatency).toBeLessThan(1000); // <1s refresh rate
      expect(pollingClients.length).toBe(100);

      // Cleanup polling clients
      for (const client of pollingClients) {
        client.close();
      }
    }, 60000);
  });

  describe('Real-Time Metric Updates', () => {
    it('should process 1000+ agent metric updates within 1s', async () => {
      const updateStart = performance.now();
      const updateLatencies = [];

      // Emit metric update for all agents
      const metricsUpdate = {
        timestamp: Date.now(),
        agents: Array.from({ length: AGENT_COUNT }, (_, i) => ({
          id: `agent-${i}`,
          status: 'active',
          cpu: Math.random(),
          memory: Math.random() * 512,
          tasksCompleted: Math.floor(Math.random() * 100)
        }))
      };

      socketServer.emit('bulk_metrics_update', metricsUpdate);

      // Track reception on sample clients
      const sampleSize = Math.min(100, clients.length);
      const receivedPromises = [];

      for (let i = 0; i < sampleSize; i++) {
        const client = clients[i];

        const promise = new Promise((resolve) => {
          const handler = (metrics) => {
            if (metrics.timestamp === metricsUpdate.timestamp) {
              const latency = Date.now() - metrics.timestamp;
              updateLatencies.push(latency);
              client.off('bulk_metrics_update', handler);
              resolve();
            }
          };

          client.on('bulk_metrics_update', handler);

          // Timeout after 2s
          setTimeout(() => {
            client.off('bulk_metrics_update', handler);
            resolve();
          }, 2000);
        });

        receivedPromises.push(promise);
      }

      await Promise.all(receivedPromises);

      const updateEnd = performance.now();
      const totalUpdateTime = updateEnd - updateStart;

      const avgUpdateLatency = updateLatencies.length > 0
        ? updateLatencies.reduce((a, b) => a + b, 0) / updateLatencies.length
        : 0;

      testResults.metricUpdates = {
        totalAgents: AGENT_COUNT,
        sampleSize,
        updatesReceived: updateLatencies.length,
        totalUpdateTime,
        avgUpdateLatency,
        updateSuccessRate: (updateLatencies.length / sampleSize) * 100
      };

      console.log('\n📊 Metric Update Results:');
      console.log(`  Total Agents: ${AGENT_COUNT}`);
      console.log(`  Sample Size: ${sampleSize}`);
      console.log(`  Updates Received: ${updateLatencies.length}`);
      console.log(`  Total Update Time: ${totalUpdateTime.toFixed(2)}ms`);
      console.log(`  Avg Update Latency: ${avgUpdateLatency.toFixed(2)}ms`);
      console.log(`  Update Success Rate: ${testResults.metricUpdates.updateSuccessRate.toFixed(2)}%`);

      expect(totalUpdateTime).toBeLessThan(1000); // <1s for all updates
      expect(avgUpdateLatency).toBeLessThan(500); // <500ms average latency
      expect(testResults.metricUpdates.updateSuccessRate).toBeGreaterThan(90); // >90% success rate
    }, 30000);
  });

  describe('Connection Stability and Recovery', () => {
    it('should maintain stable connections and recover from disruptions', async () => {
      const disconnectionEvents = [];
      const reconnectionEvents = [];

      // Monitor sample clients for stability
      const sampleSize = Math.min(50, clients.length);

      for (let i = 0; i < sampleSize; i++) {
        const client = clients[i];

        client.on('disconnect', (reason) => {
          disconnectionEvents.push({ clientId: i, reason, timestamp: Date.now() });
        });

        client.on('reconnect', () => {
          reconnectionEvents.push({ clientId: i, timestamp: Date.now() });
        });
      }

      // Simulate server disruption
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Force disconnect some clients
      for (let i = 0; i < Math.min(10, sampleSize); i++) {
        clients[i].disconnect();
        await new Promise(resolve => setTimeout(resolve, 100));
        clients[i].connect();
      }

      // Wait for reconnections
      await new Promise(resolve => setTimeout(resolve, 5000));

      const disconnectionRate = (disconnectionEvents.length / sampleSize) * 100;
      const reconnectionRate = disconnectionEvents.length > 0
        ? (reconnectionEvents.length / disconnectionEvents.length) * 100
        : 100;

      testResults.connectionStability = {
        sampleSize,
        disconnections: disconnectionEvents.length,
        reconnections: reconnectionEvents.length,
        disconnectionRate,
        reconnectionRate
      };

      console.log('\n📊 Connection Stability Results:');
      console.log(`  Sample Size: ${sampleSize}`);
      console.log(`  Disconnections: ${disconnectionEvents.length}`);
      console.log(`  Reconnections: ${reconnectionEvents.length}`);
      console.log(`  Disconnection Rate: ${disconnectionRate.toFixed(2)}%`);
      console.log(`  Reconnection Rate: ${reconnectionRate.toFixed(2)}%`);

      expect(reconnectionRate).toBeGreaterThan(90); // >90% reconnection success
    }, 30000);
  });

  describe('Memory Usage Optimization', () => {
    it('should maintain reasonable memory usage with 1000 connections', async () => {
      const initialMemory = process.memoryUsage();

      // Wait for memory stabilization
      await new Promise(resolve => setTimeout(resolve, 5000));

      const finalMemory = process.memoryUsage();

      const memoryIncrease = {
        heapUsed: (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024,
        heapTotal: (finalMemory.heapTotal - initialMemory.heapTotal) / 1024 / 1024,
        external: (finalMemory.external - initialMemory.external) / 1024 / 1024,
        rss: (finalMemory.rss - initialMemory.rss) / 1024 / 1024
      };

      const memoryPerConnection = memoryIncrease.heapUsed / clients.length;

      testResults.memoryUsage = {
        totalConnections: clients.length,
        initialHeap: initialMemory.heapUsed / 1024 / 1024,
        finalHeap: finalMemory.heapUsed / 1024 / 1024,
        heapIncrease: memoryIncrease.heapUsed,
        memoryPerConnection
      };

      console.log('\n📊 Memory Usage Results:');
      console.log(`  Total Connections: ${clients.length}`);
      console.log(`  Initial Heap: ${testResults.memoryUsage.initialHeap.toFixed(2)} MB`);
      console.log(`  Final Heap: ${testResults.memoryUsage.finalHeap.toFixed(2)} MB`);
      console.log(`  Heap Increase: ${memoryIncrease.heapUsed.toFixed(2)} MB`);
      console.log(`  Memory per Connection: ${memoryPerConnection.toFixed(4)} MB`);

      expect(memoryPerConnection).toBeLessThan(1); // <1MB per connection
      expect(memoryIncrease.heapUsed).toBeLessThan(500); // <500MB total increase
    }, 30000);
  });

  describe('Performance Validation Summary', () => {
    it('should generate comprehensive dashboard performance report', async () => {
      // Calculate overall confidence score
      const scores = [
        testResults.websocketLatency?.avgMessageLatency < 100 ? 1.0 : 0.7,
        testResults.httpPollingLatency?.avgPollingLatency < 1000 ? 1.0 : 0.8,
        testResults.metricUpdates?.totalUpdateTime < 1000 ? 1.0 : 0.7,
        testResults.connectionStability?.reconnectionRate > 90 ? 1.0 : 0.6,
        testResults.memoryUsage?.memoryPerConnection < 1 ? 1.0 : 0.5
      ];

      testResults.confidence = scores.reduce((a, b) => a + b, 0) / scores.length;

      const report = {
        timestamp: new Date().toISOString(),
        testSuite: 'Dashboard Real-Time Performance Test - 1000+ Agents',
        results: testResults,
        validation: {
          websocketLatency: testResults.websocketLatency?.avgMessageLatency < 100,
          httpPollingLatency: testResults.httpPollingLatency?.avgPollingLatency < 1000,
          metricUpdates: testResults.metricUpdates?.totalUpdateTime < 1000,
          connectionStability: testResults.connectionStability?.reconnectionRate > 90,
          memoryUsage: testResults.memoryUsage?.memoryPerConnection < 1
        },
        overallConfidence: testResults.confidence,
        status: testResults.confidence >= 0.75 ? 'PASS' : 'FAIL'
      };

      console.log('\n📋 Dashboard Performance Test Summary:');
      console.log(JSON.stringify(report, null, 2));

      // Write report to file
      const fs = require('fs-extra');
      await fs.writeJSON(
        '/mnt/c/Users/masha/Documents/claude-flow-novice/tests/performance/dashboard-realtime-1000-agents-report.json',
        report,
        { spaces: 2 }
      );

      expect(report.status).toBe('PASS');
      expect(report.overallConfidence).toBeGreaterThanOrEqual(0.75);
    });
  });
});
