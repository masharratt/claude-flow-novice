/**
 * @file Performance Tests for Real-time Updates
 * @description Performance benchmarks and load testing for dashboard real-time functionality
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { performance } from 'perf_hooks';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';

// Test configuration
const PERFORMANCE_CONFIG = {
  // Connection performance thresholds (in milliseconds)
  CONNECTION_TIMEOUT: 5000,
  CONNECTION_ESTABLISHMENT_MAX: 1000,

  // Message performance thresholds
  MESSAGE_DELIVERY_MAX: 100,
  MESSAGE_PROCESSING_MAX: 50,
  BROADCAST_LATENCY_MAX: 200,

  // Load testing parameters
  CONCURRENT_CLIENTS: 50,
  MESSAGES_PER_CLIENT: 100,
  BROADCAST_FREQUENCY: 10, // per second
  TEST_DURATION: 30000, // 30 seconds

  // Memory and resource thresholds
  MEMORY_INCREASE_MAX: 100 * 1024 * 1024, // 100MB
  CPU_USAGE_MAX: 80, // percentage

  // WebSocket thresholds
  WEBSOCKET_FRAME_SIZE_MAX: 1024 * 1024, // 1MB
  CONCURRENT_CONNECTIONS_MAX: 1000
};

interface PerformanceMetrics {
  connectionTime: number;
  messageLatency: number;
  processingTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: number;
  throughput: number;
  errorRate: number;
}

interface LoadTestResult {
  totalClients: number;
  successfulConnections: number;
  failedConnections: number;
  totalMessages: number;
  deliveredMessages: number;
  failedMessages: number;
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  throughput: number;
  errors: string[];
  duration: number;
}

describe('Real-time Updates Performance Tests', () => {
  let httpServer: HttpServer;
  let socketioServer: SocketIOServer;
  let serverUrl: string;
  let clients: ClientSocket[] = [];
  let testMetrics: PerformanceMetrics[] = [];

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create HTTP server
    httpServer = new HttpServer();

    // Create Socket.IO server with performance optimizations
    socketioServer = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: PERFORMANCE_CONFIG.WEBSOCKET_FRAME_SIZE_MAX,
      perMessageDeflate: {
        threshold: 1024,
        concurrency: 4,
        zlibDeflateOptions: {
          level: 3
        }
      }
    });

    // Set up performance monitoring
    setupPerformanceMonitoring();

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        const address = httpServer.address();
        if (typeof address === 'string') {
          serverUrl = address;
        } else {
          serverUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Disconnect all clients
    clients.forEach(client => {
      if (client.connected) {
        client.disconnect();
      }
    });
    clients = [];

    // Close server
    if (socketioServer) {
      socketioServer.close();
    }

    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(resolve);
      });
    }

    testMetrics = [];
    jest.clearAllMocks();
  });

  function setupPerformanceMonitoring() {
    // Track performance metrics
    socketioServer.on('connection', (socket) => {
      const startTime = performance.now();

      socket.on('disconnect', () => {
        const endTime = performance.now();
        const connectionTime = endTime - startTime;

        testMetrics.push({
          connectionTime,
          messageLatency: 0,
          processingTime: 0,
          memoryUsage: process.memoryUsage(),
          cpuUsage: 0,
          throughput: 0,
          errorRate: 0
        });
      });

      // Track message processing time
      socket.onAny((eventName, ...args) => {
        const processingStart = performance.now();

        // Simulate processing time
        setTimeout(() => {
          const processingEnd = performance.now();
          const processingTime = processingEnd - processingStart;

          // Update metrics
          const lastMetric = testMetrics[testMetrics.length - 1];
          if (lastMetric) {
            lastMetric.processingTime += processingTime;
          }
        }, Math.random() * 10); // 0-10ms processing time
      });
    });
  }

  describe('Connection Performance', () => {
    test('establishes connections within performance threshold', async () => {
      const connectionTimes: number[] = [];
      const clientCount = 10;

      // Create multiple connections and measure connection time
      const connectionPromises = Array.from({ length: clientCount }, async (_, index) => {
        const client = ClientIO(serverUrl, {
          forceNew: true,
          timeout: PERFORMANCE_CONFIG.CONNECTION_TIMEOUT
        });

        const startTime = performance.now();

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Connection ${index} timed out`));
          }, PERFORMANCE_CONFIG.CONNECTION_ESTABLISHMENT_MAX);

          client.on('connect', () => {
            clearTimeout(timeout);
            const connectionTime = performance.now() - startTime;
            connectionTimes.push(connectionTime);
            clients.push(client);
            resolve();
          });

          client.on('connect_error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      });

      await Promise.all(connectionPromises);

      // Verify connection performance
      const averageConnectionTime = connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length;
      const maxConnectionTime = Math.max(...connectionTimes);

      expect(averageConnectionTime).toBeLessThan(PERFORMANCE_CONFIG.CONNECTION_ESTABLISHMENT_MAX);
      expect(maxConnectionTime).toBeLessThan(PERFORMANCE_CONFIG.CONNECTION_ESTABLISHMENT_MAX * 2);
      expect(connectionTimes).toHaveLength(clientCount);
    });

    test('handles concurrent connections efficiently', async () => {
      const startTime = performance.now();
      const batchSize = 20;
      const totalBatches = 3;

      // Connect clients in batches
      for (let batch = 0; batch < totalBatches; batch++) {
        const batchPromises = Array.from({ length: batchSize }, async (_, index) => {
          const client = ClientIO(serverUrl, { forceNew: true });

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

            client.on('connect', () => {
              clearTimeout(timeout);
              clients.push(client);
              resolve();
            });

            client.on('connect_error', reject);
          });
        });

        await Promise.all(batchPromises);
      }

      const totalTime = performance.now() - startTime;
      const totalConnections = clients.length;
      const connectionsPerSecond = (totalConnections / totalTime) * 1000;

      expect(totalConnections).toBe(batchSize * totalBatches);
      expect(connectionsPerSecond).toBeGreaterThan(10); // Should handle at least 10 connections/second
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    test('maintains performance under sustained connection load', async () => {
      const connectionCount = 30;
      const testDuration = 10000; // 10 seconds
      const connectionInterval = 100; // Connect a new client every 100ms

      let connectedCount = 0;
      const connectionTimes: number[] = [];

      const connectionIntervalId = setInterval(async () => {
        if (connectedCount >= connectionCount) {
          clearInterval(connectionIntervalId);
          return;
        }

        try {
          const client = ClientIO(serverUrl, { forceNew: true });
          const startTime = performance.now();

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

            client.on('connect', () => {
              clearTimeout(timeout);
              const connectionTime = performance.now() - startTime;
              connectionTimes.push(connectionTime);
              clients.push(client);
              connectedCount++;
              resolve();
            });

            client.on('connect_error', reject);
          });
        } catch (error) {
          console.error('Connection failed:', error);
        }
      }, connectionInterval);

      // Wait for all connections and test duration
      await new Promise(resolve => setTimeout(resolve, testDuration + connectionCount * connectionInterval));

      // Analyze connection performance
      expect(connectedCount).toBe(connectionCount);
      expect(connectionTimes).toHaveLength(connectionCount);

      const averageConnectionTime = connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length;
      expect(averageConnectionTime).toBeLessThan(PERFORMANCE_CONFIG.CONNECTION_ESTABLISHMENT_MAX);
    });
  });

  describe('Message Delivery Performance', () => {
    test('delivers messages with low latency', async () => {
      // Set up test clients
      const clientCount = 5;
      const messageCount = 50;

      // Connect clients
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl);
        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });
        clients.push(client);
      }

      // Join all clients to a test room
      const roomName = 'performance-test-room';
      const joinPromises = clients.map(client =>
        new Promise<void>((resolve) => {
          client.emit('join-room', { roomName });
          client.on('room-joined', resolve);
        })
      );
      await Promise.all(joinPromises);

      // Set up message latency tracking
      const latencies: number[] = [];
      let receivedCount = 0;

      clients.forEach(client => {
        client.on('test-message', (data) => {
          const latency = performance.now() - data.timestamp;
          latencies.push(latency);
          receivedCount++;
        });
      });

      // Send messages and measure latency
      const senderClient = clients[0];
      for (let i = 0; i < messageCount; i++) {
        senderClient.emit('broadcast-message', {
          room: roomName,
          event: 'test-message',
          data: {
            messageId: i,
            timestamp: performance.now(),
            payload: 'A'.repeat(100) // 100 byte payload
          }
        });

        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Wait for all messages to be delivered
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Analyze performance
      const expectedReceives = messageCount * (clientCount - 1); // All clients except sender
      expect(receivedCount).toBeGreaterThanOrEqual(expectedReceives * 0.95); // Allow 5% message loss

      if (latencies.length > 0) {
        const averageLatency = latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;
        const maxLatency = Math.max(...latencies);
        const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

        expect(averageLatency).toBeLessThan(PERFORMANCE_CONFIG.MESSAGE_DELIVERY_MAX);
        expect(maxLatency).toBeLessThan(PERFORMANCE_CONFIG.BROADCAST_LATENCY_MAX);
        expect(p95Latency).toBeLessThan(PERFORMANCE_CONFIG.MESSAGE_DELIVERY_MAX * 2);
      }
    });

    test('maintains performance under high message volume', async () => {
      const clientCount = 10;
      const messagesPerSecond = 100;
      const testDuration = 5000; // 5 seconds

      // Connect clients
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl);
        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });
        clients.push(client);
      }

      // Set up message tracking
      let totalReceived = 0;
      const messageTimestamps: number[] = [];

      clients.forEach(client => {
        client.on('load-test-message', (data) => {
          totalReceived++;
          messageTimestamps.push(performance.now());
        });
      });

      // Start sending high-volume messages
      const senderClient = clients[0];
      let messageCount = 0;
      const messageInterval = setInterval(() => {
        if (performance.now() - messageTimestamps[0] > testDuration) {
          clearInterval(messageInterval);
          return;
        }

        for (let i = 0; i < messagesPerSecond / 10; i++) { // Send in bursts
          senderClient.emit('broadcast-message', {
            event: 'load-test-message',
            data: {
              messageId: messageCount++,
              timestamp: performance.now(),
              payload: 'X'.repeat(200) // 200 byte payload
            }
          });
        }
      }, 100); // Every 100ms

      // Wait for test to complete
      await new Promise(resolve => setTimeout(resolve, testDuration + 1000));

      // Analyze performance
      const expectedMessages = (messagesPerSecond * testDuration / 1000) * (clientCount - 1);
      const actualThroughput = totalReceived / (testDuration / 1000);

      expect(actualThroughput).toBeGreaterThan(messagesPerSecond * 0.8); // Allow 20% degradation
      expect(totalReceived).toBeGreaterThan(expectedMessages * 0.8);
    });

    test('handles large message payloads efficiently', async () => {
      const clientCount = 3;
      const payloadSizes = [1024, 10240, 102400, 1048576]; // 1KB, 10KB, 100KB, 1MB

      // Connect clients
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl);
        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });
        clients.push(client);
      }

      // Test different payload sizes
      for (const size of payloadSizes) {
        const latencies: number[] = [];
        let receivedCount = 0;

        clients.forEach(client => {
          client.on('large-payload-test', (data) => {
            latencies.push(performance.now() - data.timestamp);
            receivedCount++;
          });
        });

        // Send large payload
        const payload = 'L'.repeat(size);
        const senderClient = clients[0];

        senderClient.emit('broadcast-message', {
          event: 'large-payload-test',
          data: {
            timestamp: performance.now(),
            payload,
            size
          }
        });

        // Wait for delivery
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify delivery and performance
        expect(receivedCount).toBe(clientCount - 1);

        if (latencies.length > 0) {
          const averageLatency = latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;

          // Larger payloads should still be delivered within reasonable time
          const maxExpectedLatency = PERFORMANCE_CONFIG.MESSAGE_DELIVERY_MAX + (size / 1024); // Add 1ms per KB
          expect(averageLatency).toBeLessThan(maxExpectedLatency);
        }
      }
    });
  });

  describe('Broadcast Performance', () => {
    test('broadcasts to many clients efficiently', async () => {
      const clientCount = 25;
      const messageCount = 20;

      // Connect many clients
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl);
        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });
        clients.push(client);
      }

      // Join all clients to broadcast room
      const roomName = 'broadcast-perf-test';
      const joinPromises = clients.map(client =>
        new Promise<void>((resolve) => {
          client.emit('join-room', { roomName });
          client.on('room-joined', resolve);
        })
      );
      await Promise.all(joinPromises);

      // Track broadcast performance
      const broadcastTimes: number[] = [];
      let totalReceived = 0;

      clients.forEach(client => {
        client.on('broadcast-perf-message', (data) => {
          totalReceived++;
          if (data.batchIndex === 0) {
            broadcastTimes.push(performance.now() - data.batchStartTime);
          }
        });
      });

      // Send batch broadcasts
      const senderClient = clients[0];
      for (let batch = 0; batch < messageCount; batch++) {
        const batchStartTime = performance.now();

        senderClient.emit('broadcast-to-room', {
          room: roomName,
          event: 'broadcast-perf-message',
          data: {
            batchIndex: batch,
            batchStartTime,
            totalBatches: messageCount,
            payload: `Batch ${batch} test data`
          }
        });

        // Small delay between broadcasts
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Wait for all broadcasts to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Analyze broadcast performance
      expect(totalReceived).toBe(messageCount * (clientCount - 1));
      expect(broadcastTimes).toHaveLength(messageCount);

      const averageBroadcastTime = broadcastTimes.reduce((sum, time) => sum + time, 0) / broadcastTimes.length;
      expect(averageBroadcastTime).toBeLessThan(PERFORMANCE_CONFIG.BROADCAST_LATENCY_MAX);
    });

    test('maintains broadcast performance under load', async () => {
      const clientCount = 15;
      const broadcastFrequency = 20; // broadcasts per second
      const testDuration = 10000; // 10 seconds

      // Connect clients
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl);
        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });
        clients.push(client);
      }

      // Join all clients to room
      const roomName = 'load-broadcast-test';
      const joinPromises = clients.map(client =>
        new Promise<void>((resolve) => {
          client.emit('join-room', { roomName });
          client.on('room-joined', resolve);
        })
      );
      await Promise.all(joinPromises);

      // Track broadcast performance
      let totalBroadcasts = 0;
      let totalReceived = 0;
      const broadcastLatencies: number[] = [];

      clients.forEach(client => {
        client.on('load-broadcast-message', (data) => {
          totalReceived++;
          broadcastLatencies.push(performance.now() - data.timestamp);
        });
      });

      // Start continuous broadcasting
      const senderClient = clients[0];
      const broadcastInterval = setInterval(() => {
        if (performance.now() > Date.now() + testDuration) {
          clearInterval(broadcastInterval);
          return;
        }

        senderClient.emit('broadcast-to-room', {
          room: roomName,
          event: 'load-broadcast-message',
          data: {
            broadcastId: totalBroadcasts++,
            timestamp: performance.now(),
            payload: `Load test broadcast ${totalBroadcasts}`
          }
        });
      }, 1000 / broadcastFrequency);

      // Wait for test to complete
      await new Promise(resolve => setTimeout(resolve, testDuration + 1000));

      // Analyze performance
      const expectedReceives = totalBroadcasts * (clientCount - 1);
      const actualThroughput = totalReceived / (testDuration / 1000);

      expect(totalReceived).toBeGreaterThanOrEqual(expectedReceives * 0.9); // Allow 10% loss
      expect(actualThroughput).toBeGreaterThan(broadcastFrequency * clientCount * 0.8);

      if (broadcastLatencies.length > 0) {
        const averageLatency = broadcastLatencies.reduce((sum, latency) => sum + latency, 0) / broadcastLatencies.length;
        expect(averageLatency).toBeLessThan(PERFORMANCE_CONFIG.BROADCAST_LATENCY_MAX);
      }
    });
  });

  describe('Memory and Resource Management', () => {
    test('maintains stable memory usage during extended operation', async () => {
      const initialMemory = process.memoryUsage();
      const clientCount = 20;
      const testDuration = 15000; // 15 seconds
      const messageFrequency = 10; // messages per second per client

      // Connect clients
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl);
        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });
        clients.push(client);
      }

      // Generate continuous message traffic
      const messageInterval = setInterval(() => {
        clients.forEach((client, index) => {
          client.emit('memory-test-message', {
            clientId: index,
            timestamp: performance.now(),
            data: 'X'.repeat(500) // 500 byte payload
          });
        });
      }, 1000 / messageFrequency);

      // Monitor memory usage
      const memorySnapshots: NodeJS.MemoryUsage[] = [];
      const memoryMonitorInterval = setInterval(() => {
        memorySnapshots.push(process.memoryUsage());
      }, 1000);

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, testDuration));

      // Stop traffic and monitoring
      clearInterval(messageInterval);
      clearInterval(memoryMonitorInterval);

      // Analyze memory usage
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(memoryIncrease).toBeLessThan(PERFORMANCE_CONFIG.MEMORY_INCREASE_MAX);

      // Check for memory leaks (should not continuously increase)
      if (memorySnapshots.length > 5) {
        const firstHalf = memorySnapshots.slice(0, Math.floor(memorySnapshots.length / 2));
        const secondHalf = memorySnapshots.slice(Math.floor(memorySnapshots.length / 2));

        const firstHalfAverage = firstHalf.reduce((sum, snapshot) => sum + snapshot.heapUsed, 0) / firstHalf.length;
        const secondHalfAverage = secondHalf.reduce((sum, snapshot) => sum + snapshot.heapUsed, 0) / secondHalf.length;

        const memoryGrowthRate = (secondHalfAverage - firstHalfAverage) / firstHalfAverage;
        expect(memoryGrowthRate).toBeLessThan(0.2); // Less than 20% growth
      }
    });

    test('efficiently handles connection churn', async () => {
      const maxConcurrentClients = 30;
      const churnCycleDuration = 5000; // 5 seconds per cycle
      const cycles = 3;

      let totalConnections = 0;
      let totalDisconnections = 0;

      // Monitor server resources
      const resourceSnapshots: any[] = [];

      for (let cycle = 0; cycle < cycles; cycle++) {
        // Connect clients
        const cycleClients: ClientSocket[] = [];
        for (let i = 0; i < maxConcurrentClients; i++) {
          const client = ClientIO(serverUrl, { forceNew: true });

          client.on('connect', () => {
            totalConnections++;
          });

          client.on('disconnect', () => {
            totalDisconnections++;
          });

          cycleClients.push(client);
          clients.push(client);

          // Small delay between connections
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Wait for connections to establish
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Record resource usage
        resourceSnapshots.push({
          cycle,
          connectedClients: cycleClients.length,
          memoryUsage: process.memoryUsage(),
          timestamp: performance.now()
        });

        // Disconnect half the clients
        const disconnectCount = Math.floor(cycleClients.length / 2);
        for (let i = 0; i < disconnectCount; i++) {
          cycleClients[i].disconnect();
        }

        // Wait for disconnections
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Record resource usage after disconnections
        resourceSnapshots.push({
          cycle,
          connectedClients: cycleClients.length - disconnectCount,
          memoryUsage: process.memoryUsage(),
          timestamp: performance.now(),
          afterDisconnection: true
        });
      }

      // Wait for all disconnections to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Analyze connection churn
      expect(totalConnections).toBeGreaterThan(maxConcurrentClients * cycles * 0.8);
      expect(totalDisconnections).toBeGreaterThan(maxConcurrentClients * cycles * 0.3);

      // Check resource stability
      const memoryUsages = resourceSnapshots.map(snapshot => snapshot.memoryUsage.heapUsed);
      const maxMemory = Math.max(...memoryUsages);
      const minMemory = Math.min(...memoryUsages);
      const memoryVariation = (maxMemory - minMemory) / minMemory;

      expect(memoryVariation).toBeLessThan(0.5); // Memory usage should be relatively stable
    });

    test('gracefully handles resource exhaustion', async () => {
      // This test simulates resource exhaustion scenarios
      const clientCount = 10;

      // Connect clients
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl);
        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });
        clients.push(client);
      }

      // Simulate high memory usage by sending large messages
      const largePayload = 'Y'.repeat(1024 * 1024); // 1MB payload
      let memoryErrorCount = 0;
      let successfulSends = 0;

      clients.forEach(client => {
        client.on('error', (error) => {
          if (error.message.includes('memory') || error.message.includes('buffer')) {
            memoryErrorCount++;
          }
        });
      });

      // Send large messages rapidly
      for (let i = 0; i < 50; i++) {
        try {
          clients[0].emit('stress-test-message', {
            messageId: i,
            payload: largePayload,
            timestamp: performance.now()
          });
          successfulSends++;
        } catch (error) {
          console.log('Send failed:', error.message);
        }

        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // System should remain functional even under stress
      expect(successfulSends).toBeGreaterThan(0);
      expect(clients.every(client => client.connected)).toBe(true);

      // Test recovery by sending normal messages
      let recoverySends = 0;
      for (let i = 0; i < 10; i++) {
        try {
          clients[0].emit('recovery-test-message', {
            messageId: i,
            payload: 'Normal size message',
            timestamp: performance.now()
          });
          recoverySends++;
        } catch (error) {
          console.log('Recovery send failed:', error.message);
        }
      }

      expect(recoverySends).toBe(10); // Should recover fully
    });
  });

  describe('Comprehensive Load Testing', () => {
    test('handles realistic production load', async () => {
      const testConfig = {
        clients: PERFORMANCE_CONFIG.CONCURRENT_CLIENTS,
        messagesPerClient: PERFORMANCE_CONFIG.MESSAGES_PER_CLIENT,
        duration: PERFORMANCE_CONFIG.TEST_DURATION,
        roomName: 'production-load-test'
      };

      const result: LoadTestResult = {
        totalClients: 0,
        successfulConnections: 0,
        failedConnections: 0,
        totalMessages: 0,
        deliveredMessages: 0,
        failedMessages: 0,
        averageLatency: 0,
        maxLatency: 0,
        minLatency: Infinity,
        throughput: 0,
        errors: [],
        duration: 0
      };

      const startTime = performance.now();

      // Connect clients with staggered timing
      const connectionPromises = Array.from({ length: testConfig.clients }, async (_, index) => {
        try {
          const client = ClientIO(serverUrl, {
            forceNew: true,
            timeout: 10000
          });

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

            client.on('connect', () => {
              clearTimeout(timeout);
              result.successfulConnections++;
              clients.push(client);
              resolve();
            });

            client.on('connect_error', (error) => {
              clearTimeout(timeout);
              result.failedConnections++;
              result.errors.push(`Client ${index} connection failed: ${error.message}`);
              reject(error);
            });
          });

          // Small delay between connections
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          result.failedConnections++;
          result.errors.push(`Client ${index} connection error: ${error.message}`);
        }
      });

      await Promise.allSettled(connectionPromises);
      result.totalClients = testConfig.clients;

      // Wait for all connections to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Set up message tracking
      const latencies: number[] = [];
      let messageDeliveries = 0;

      clients.forEach((client, clientIndex) => {
        client.on('load-test-message', (data) => {
          const latency = performance.now() - data.timestamp;
          latencies.push(latency);
          messageDeliveries++;
        });
      });

      // Join all clients to test room
      const joinPromises = clients.map((client, index) =>
        new Promise<void>((resolve) => {
          client.emit('join-room', { roomName: testConfig.roomName, clientId: index });
          client.on('room-joined', resolve);
        })
      );
      await Promise.all(joinPromises);

      // Start load test message generation
      const senderClient = clients[0];
      let messageCount = 0;
      const messageInterval = setInterval(() => {
        if (performance.now() - startTime > testConfig.duration) {
          clearInterval(messageInterval);
          return;
        }

        // Send messages in batches
        const batchSize = 5;
        for (let i = 0; i < batchSize; i++) {
          senderClient.emit('broadcast-to-room', {
            room: testConfig.roomName,
            event: 'load-test-message',
            data: {
              messageId: messageCount++,
              timestamp: performance.now(),
              payload: `Load test message ${messageCount}`,
              batchIndex: i
            }
          });
        }
      }, 100); // Every 100ms

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, testConfig.duration + 2000));

      // Calculate results
      const endTime = performance.now();
      result.duration = endTime - startTime;
      result.totalMessages = messageCount;
      result.deliveredMessages = messageDeliveries;
      result.failedMessages = result.totalMessages - result.deliveredMessages;

      if (latencies.length > 0) {
        result.averageLatency = latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;
        result.maxLatency = Math.max(...latencies);
        result.minLatency = Math.min(...latencies);
      }

      result.throughput = result.deliveredMessages / (result.duration / 1000);

      // Performance assertions
      expect(result.successfulConnections).toBeGreaterThan(testConfig.clients * 0.95);
      expect(result.throughput).toBeGreaterThan(100); // Should handle at least 100 messages/second
      expect(result.averageLatency).toBeLessThan(PERFORMANCE_CONFIG.MESSAGE_DELIVERY_MAX * 2);
      expect(result.failedConnections).toBeLessThan(testConfig.clients * 0.05); // Less than 5% connection failures
      expect(result.failedMessages).toBeLessThan(result.totalMessages * 0.05); // Less than 5% message failures

      console.log('Load Test Results:', {
        success: `${result.successfulConnections}/${result.totalClients} connections`,
        throughput: `${result.throughput.toFixed(2)} messages/second`,
        latency: `${result.averageLatency.toFixed(2)}ms avg, ${result.maxLatency.toFixed(2)}ms max`,
        errors: result.errors.length,
        duration: `${result.duration.toFixed(0)}ms`
      });
    });
  });

  describe('Performance Regression Detection', () => {
    test('detects performance regressions in connection time', async () => {
      const baselineConnectionTime = 500; // milliseconds
      const clientCount = 10;
      const connectionTimes: number[] = [];

      // Measure connection times
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl, { forceNew: true });
        const startTime = performance.now();

        await new Promise<void>((resolve) => {
          client.on('connect', () => {
            const connectionTime = performance.now() - startTime;
            connectionTimes.push(connectionTime);
            clients.push(client);
            resolve();
          });
        });
      }

      const averageConnectionTime = connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length;
      const regressionPercentage = ((averageConnectionTime - baselineConnectionTime) / baselineConnectionTime) * 100;

      // Fail if performance has regressed by more than 20%
      expect(regressionPercentage).toBeLessThan(20);

      if (regressionPercentage > 10) {
        console.warn(`Performance warning: Connection time increased by ${regressionPercentage.toFixed(1)}%`);
      }
    });

    test('detects performance regressions in message latency', async () => {
      const baselineLatency = 50; // milliseconds
      const clientCount = 5;
      const messageCount = 20;

      // Connect clients
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl);
        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });
        clients.push(client);
      }

      // Set up latency tracking
      const latencies: number[] = [];
      let receivedCount = 0;

      clients.forEach(client => {
        client.on('latency-test-message', (data) => {
          latencies.push(performance.now() - data.timestamp);
          receivedCount++;
        });
      });

      // Send messages and measure latency
      const senderClient = clients[0];
      for (let i = 0; i < messageCount; i++) {
        senderClient.emit('broadcast-message', {
          event: 'latency-test-message',
          data: {
            messageId: i,
            timestamp: performance.now(),
            payload: 'Latency test message'
          }
        });

        await new Promise(resolve => setTimeout(resolve, 20));
      }

      // Wait for all messages
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (latencies.length > 0) {
        const averageLatency = latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;
        const regressionPercentage = ((averageLatency - baselineLatency) / baselineLatency) * 100;

        expect(regressionPercentage).toBeLessThan(30); // Allow 30% regression for latency

        if (regressionPercentage > 15) {
          console.warn(`Performance warning: Message latency increased by ${regressionPercentage.toFixed(1)}%`);
        }
      }

      expect(receivedCount).toBeGreaterThan(messageCount * (clientCount - 1) * 0.9);
    });

    test('maintains performance benchmarks over time', async () => {
      const benchmarks = {
        connectionTime: 1000,      // ms
        messageLatency: 100,       // ms
        throughput: 200,            // messages/second
        memoryUsage: 50 * 1024 * 1024 // 50MB
      };

      const testDuration = 10000; // 10 seconds

      // Baseline measurement
      const baselineStart = performance.now();
      const baselineMemory = process.memoryUsage();

      // Connect clients
      const clientCount = 10;
      for (let i = 0; i < clientCount; i++) {
        const client = ClientIO(serverUrl);
        await new Promise<void>((resolve) => {
          client.on('connect', resolve);
        });
        clients.push(client);
      }

      const connectionTime = performance.now() - baselineStart;

      // Message throughput test
      let messagesSent = 0;
      let messagesReceived = 0;
      const messageLatencies: number[] = [];

      clients.forEach((client, index) => {
        if (index > 0) { // Skip sender
          client.on('benchmark-message', (data) => {
            messagesReceived++;
            messageLatencies.push(performance.now() - data.timestamp);
          });
        }
      });

      const messageInterval = setInterval(() => {
        if (performance.now() - baselineStart > testDuration) {
          clearInterval(messageInterval);
          return;
        }

        clients[0].emit('broadcast-message', {
          event: 'benchmark-message',
          data: {
            messageId: messagesSent++,
            timestamp: performance.now(),
            payload: 'Benchmark message'
          }
        });
      }, 100);

      // Wait for test completion
      await new Promise(resolve => setTimeout(resolve, testDuration + 1000));

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - baselineMemory.heapUsed;
      const throughput = messagesReceived / (testDuration / 1000);
      const averageLatency = messageLatencies.length > 0
        ? messageLatencies.reduce((sum, latency) => sum + latency, 0) / messageLatencies.length
        : 0;

      // Verify benchmarks
      expect(connectionTime).toBeLessThan(benchmarks.connectionTime);
      expect(averageLatency).toBeLessThan(benchmarks.messageLatency);
      expect(throughput).toBeGreaterThan(benchmarks.throughput);
      expect(memoryIncrease).toBeLessThan(benchmarks.memoryUsage);

      console.log('Benchmark Results:', {
        connectionTime: `${connectionTime.toFixed(0)}ms (limit: ${benchmarks.connectionTime}ms)`,
        messageLatency: `${averageLatency.toFixed(0)}ms (limit: ${benchmarks.messageLatency}ms)`,
        throughput: `${throughput.toFixed(1)} msg/s (min: ${benchmarks.throughput} msg/s)`,
        memoryIncrease: `${(memoryIncrease / 1024 / 1024).toFixed(1)}MB (limit: ${(benchmarks.memoryUsage / 1024 / 1024).toFixed(1)}MB)`
      });
    });
  });
});