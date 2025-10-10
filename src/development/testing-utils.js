/**
 * Development Testing Utilities for Real-Time Connections
 * Provides comprehensive testing capabilities for WebSocket and Socket.IO connections
 */

import EventEmitter from 'events';
import { WebSocketDebugger } from '../websocket/websocket-debugger.js';
import { ConnectionStatusManager } from './connection-status.js';

export class RealTimeTestingSuite extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      defaultTimeout: options.defaultTimeout || 10000,
      maxConnections: options.maxConnections || 100,
      messageInterval: options.messageInterval || 100,
      testDuration: options.testDuration || 30000,
      logLevel: options.logLevel || 'info',
      ...options
    };

    this.webSocketDebugger = null;
    this.connectionStatusManager = null;
    this.testResults = [];
    this.activeTests = new Map();
    this.testHistory = [];

    this.setupMonitoring();
  }

  /**
   * Setup monitoring infrastructure
   */
  setupMonitoring() {
    this.webSocketDebugger = new WebSocketDebugger({
      enabled: true,
      logLevel: this.options.logLevel,
      maxHistory: 1000
    });

    this.connectionStatusManager = new ConnectionStatusManager({
      heartbeatInterval: 5000,
      connectionTimeout: 15000,
      statusUpdateInterval: 1000
    });

    // Forward events
    this.webSocketDebugger.on('metrics:update', (metrics) => {
      this.emit('metrics:updated', metrics);
    });

    this.connectionStatusManager.on('connection:status:changed', (event) => {
      this.emit('connection:changed', event);
    });
  }

  /**
   * Run basic connection test
   */
  async runBasicConnectionTest(serverUrl, options = {}) {
    const testId = this.generateTestId();
    const test = {
      id: testId,
      type: 'basic-connection',
      serverUrl,
      options,
      startTime: Date.now(),
      status: 'running'
    };

    this.activeTests.set(testId, test);
    this.emit('test:started', test);

    try {
      const results = await this.performBasicConnectionTest(serverUrl, options);
      test.endTime = Date.now();
      test.duration = test.endTime - test.startTime;
      test.status = 'completed';
      test.results = results;

      this.testResults.push(test);
      this.emit('test:completed', test);

      return results;
    } catch (error) {
      test.endTime = Date.now();
      test.duration = test.endTime - test.startTime;
      test.status = 'failed';
      test.error = error.message;

      this.testResults.push(test);
      this.emit('test:failed', test);

      throw error;
    } finally {
      this.activeTests.delete(testId);
    }
  }

  /**
   * Perform basic connection test
   */
  async performBasicConnectionTest(serverUrl, options) {
    const { timeout = this.options.defaultTimeout } = options;
    const results = {
      connectionTime: 0,
      messageTime: 0,
      reconnectTime: 0,
      latency: 0,
      success: false
    };

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const socket = new WebSocket(serverUrl);
      let messageReceived = false;

      const timeoutId = setTimeout(() => {
        socket.close();
        reject(new Error('Connection timeout'));
      }, timeout);

      socket.onopen = () => {
        results.connectionTime = Date.now() - startTime;

        // Send test message
        const testMessage = JSON.stringify({
          type: 'test',
          timestamp: Date.now(),
          testId: this.generateTestId()
        });

        socket.send(testMessage);
      };

      socket.onmessage = (event) => {
        if (!messageReceived) {
          messageReceived = true;
          results.messageTime = Date.now() - startTime;

          try {
            const data = JSON.parse(event.data);
            if (data.timestamp) {
              results.latency = Date.now() - data.timestamp;
            }
          } catch (e) {
            // Ignore parsing errors
          }

          results.success = true;
          clearTimeout(timeoutId);
          socket.close();
          resolve(results);
        }
      };

      socket.onerror = (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Connection error: ${error}`));
      };

      socket.onclose = () => {
        if (!messageReceived) {
          clearTimeout(timeoutId);
          reject(new Error('Connection closed without receiving message'));
        }
      };
    });
  }

  /**
   * Run load test with multiple connections
   */
  async runLoadTest(serverUrl, options = {}) {
    const testId = this.generateTestId();
    const {
      connections = 10,
      messagesPerConnection = 10,
      messageInterval = this.options.messageInterval,
      testDuration = this.options.testDuration
    } = options;

    const test = {
      id: testId,
      type: 'load-test',
      serverUrl,
      options,
      startTime: Date.now(),
      status: 'running',
      connections: [],
      metrics: {
        totalConnections: connections,
        successfulConnections: 0,
        failedConnections: 0,
        totalMessages: 0,
        successfulMessages: 0,
        failedMessages: 0,
        avgLatency: 0,
        minLatency: Infinity,
        maxLatency: 0,
        throughput: 0
      }
    };

    this.activeTests.set(testId, test);
    this.emit('test:started', test);

    try {
      const results = await this.performLoadTest(serverUrl, options, test);
      test.endTime = Date.now();
      test.duration = test.endTime - test.startTime;
      test.status = 'completed';
      test.results = results;

      this.testResults.push(test);
      this.emit('test:completed', test);

      return results;
    } catch (error) {
      test.endTime = Date.now();
      test.duration = test.endTime - test.startTime;
      test.status = 'failed';
      test.error = error.message;

      this.testResults.push(test);
      this.emit('test:failed', test);

      throw error;
    } finally {
      this.activeTests.delete(testId);
    }
  }

  /**
   * Perform load test
   */
  async performLoadTest(serverUrl, options, test) {
    const { connections, messagesPerConnection, messageInterval } = options;
    const connectionPromises = [];

    for (let i = 0; i < connections; i++) {
      connectionPromises.push(this.createTestConnection(serverUrl, i, options, test));
    }

    const connectionResults = await Promise.allSettled(connectionPromises);

    // Calculate metrics
    let totalLatency = 0;
    let latencyCount = 0;

    connectionResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        test.metrics.successfulConnections++;
        test.metrics.totalMessages += result.value.messagesSent;
        test.metrics.successfulMessages += result.value.messagesReceived;

        if (result.value.latencies.length > 0) {
          const avgLatency = result.value.latencies.reduce((sum, lat) => sum + lat, 0) / result.value.latencies.length;
          totalLatency += avgLatency;
          latencyCount++;

          test.metrics.minLatency = Math.min(test.metrics.minLatency, ...result.value.latencies);
          test.metrics.maxLatency = Math.max(test.metrics.maxLatency, ...result.value.latencies);
        }
      } else {
        test.metrics.failedConnections++;
      }
    });

    test.metrics.avgLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;
    test.metrics.throughput = test.metrics.successfulMessages / (test.duration / 1000);

    return {
      ...test.metrics,
      connectionResults: connectionResults.map((result, index) => ({
        connectionId: index,
        status: result.status,
        value: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    };
  }

  /**
   * Create a test connection
   */
  async createTestConnection(serverUrl, connectionId, options, test) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(serverUrl);
      const connectionInfo = {
        connectionId,
        messagesSent: 0,
        messagesReceived: 0,
        latencies: [],
        startTime: Date.now(),
        errors: []
      };

      const debugSocket = this.webSocketDebugger.wrapConnection(socket, `test_${connectionId}`);
      this.connectionStatusManager.registerConnection(`test_${connectionId}`, socket, { testId: test.id });

      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error(`Connection ${connectionId} timeout`));
      }, this.options.defaultTimeout);

      socket.onopen = () => {
        clearTimeout(timeout);

        // Start sending messages
        const messageInterval = setInterval(() => {
          if (connectionInfo.messagesSent >= options.messagesPerConnection) {
            clearInterval(messageInterval);
            socket.close();
            return;
          }

          const message = JSON.stringify({
            type: 'test-message',
            connectionId,
            messageId: connectionInfo.messagesSent,
            timestamp: Date.now()
          });

          try {
            socket.send(message);
            connectionInfo.messagesSent++;
          } catch (error) {
            connectionInfo.errors.push(error.message);
            clearInterval(messageInterval);
            socket.close();
          }
        }, options.messageInterval);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.timestamp) {
            const latency = Date.now() - data.timestamp;
            connectionInfo.latencies.push(latency);
          }
          connectionInfo.messagesReceived++;
        } catch (e) {
          // Ignore parsing errors
        }
      };

      socket.onerror = (error) => {
        clearTimeout(timeout);
        connectionInfo.errors.push(error.message);
        reject(new Error(`Connection ${connectionId} error: ${error.message}`));
      };

      socket.onclose = () => {
        this.connectionStatusManager.removeConnection(`test_${connectionId}`);
        resolve(connectionInfo);
      };
    });
  }

  /**
   * Run stress test
   */
  async runStressTest(serverUrl, options = {}) {
    const testId = this.generateTestId();
    const {
      rampUpTime = 10000,
      peakConnections = 50,
      sustainedTime = 30000,
      rampDownTime = 10000,
      messageFrequency = 100
    } = options;

    const test = {
      id: testId,
      type: 'stress-test',
      serverUrl,
      options,
      startTime: Date.now(),
      status: 'running',
      phases: {
        rampUp: { duration: rampUpTime, connections: 0 },
        sustained: { duration: sustainedTime, connections: peakConnections },
        rampDown: { duration: rampDownTime, connections: 0 }
      },
      metrics: {
        maxConnectionsReached: 0,
        totalConnections: 0,
        errors: 0,
        avgLatency: 0,
        throughput: 0
      }
    };

    this.activeTests.set(testId, test);
    this.emit('test:started', test);

    try {
      const results = await this.performStressTest(serverUrl, options, test);
      test.endTime = Date.now();
      test.duration = test.endTime - test.startTime;
      test.status = 'completed';
      test.results = results;

      this.testResults.push(test);
      this.emit('test:completed', test);

      return results;
    } catch (error) {
      test.endTime = Date.now();
      test.duration = test.endTime - test.startTime;
      test.status = 'failed';
      test.error = error.message;

      this.testResults.push(test);
      this.emit('test:failed', test);

      throw error;
    } finally {
      this.activeTests.delete(testId);
    }
  }

  /**
   * Perform stress test
   */
  async performStressTest(serverUrl, options, test) {
    const { rampUpTime, peakConnections, sustainedTime, rampDownTime, messageFrequency } = options;
    const connections = [];
    let phase = 'rampUp';
    let phaseStartTime = Date.now();

    const addConnections = async (count) => {
      const promises = [];
      for (let i = 0; i < count; i++) {
        promises.push(this.createStressTestConnection(serverUrl, connections.length, options, test));
      }
      const results = await Promise.allSettled(promises);
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          connections.push(result.value);
        } else {
          test.metrics.errors++;
        }
      });
    };

    const removeConnections = async (count) => {
      const toRemove = connections.splice(0, Math.min(count, connections.length));
      await Promise.all(toRemove.map(conn => {
        if (conn.socket && conn.socket.readyState === WebSocket.OPEN) {
          conn.socket.close();
        }
        return Promise.resolve();
      }));
    };

    // Ramp up phase
    this.log(`Starting ramp-up phase: 0 -> ${peakConnections} connections over ${rampUpTime}ms`);
    const rampUpInterval = setInterval(async () => {
      const elapsed = Date.now() - phaseStartTime;
      const progress = Math.min(elapsed / rampUpTime, 1);
      const targetConnections = Math.floor(peakConnections * progress);
      const connectionsToAdd = targetConnections - connections.length;

      if (connectionsToAdd > 0) {
        await addConnections(connectionsToAdd);
        test.metrics.maxConnectionsReached = Math.max(test.metrics.maxConnectionsReached, connections.length);
      }

      if (progress >= 1) {
        clearInterval(rampUpInterval);
        phase = 'sustained';
        phaseStartTime = Date.now();
        this.log(`Ramp-up complete. Starting sustained phase with ${connections.length} connections`);
      }
    }, 100);

    // Wait for ramp-up to complete, then sustained phase
    await new Promise(resolve => setTimeout(resolve, rampUpTime + sustainedTime));

    // Ramp down phase
    this.log(`Starting ramp-down phase: ${connections.length} -> 0 connections over ${rampDownTime}ms`);
    const rampDownInterval = setInterval(async () => {
      const elapsed = Date.now() - phaseStartTime;
      const progress = Math.min(elapsed / rampDownTime, 1);
      const targetConnections = Math.floor(peakConnections * (1 - progress));
      const connectionsToRemove = connections.length - targetConnections;

      if (connectionsToRemove > 0) {
        await removeConnections(connectionsToRemove);
      }

      if (progress >= 1) {
        clearInterval(rampDownInterval);
        this.log(`Stress test completed`);
      }
    }, 100);

    // Wait for ramp-down to complete
    await new Promise(resolve => setTimeout(resolve, rampDownTime));

    // Calculate final metrics
    const latencies = connections.flatMap(conn => conn.latencies);
    test.metrics.avgLatency = latencies.length > 0 ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0;
    test.metrics.totalConnections = connections.length;
    test.metrics.throughput = connections.reduce((sum, conn) => sum + conn.messagesReceived, 0) / (test.duration / 1000);

    return {
      ...test.metrics,
      connections: connections.map(conn => ({
        connectionId: conn.connectionId,
        messagesSent: conn.messagesSent,
        messagesReceived: conn.messagesReceived,
        errors: conn.errors.length,
        avgLatency: conn.latencies.length > 0 ? conn.latencies.reduce((sum, lat) => sum + lat, 0) / conn.latencies.length : 0
      }))
    };
  }

  /**
   * Create stress test connection
   */
  async createStressTestConnection(serverUrl, connectionId, options, test) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(serverUrl);
      const connectionInfo = {
        connectionId,
        socket,
        messagesSent: 0,
        messagesReceived: 0,
        latencies: [],
        startTime: Date.now(),
        errors: []
      };

      const debugSocket = this.webSocketDebugger.wrapConnection(socket, `stress_${connectionId}`);
      this.connectionStatusManager.registerConnection(`stress_${connectionId}`, socket, { testId: test.id });

      const messageInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          const message = JSON.stringify({
            type: 'stress-test',
            connectionId,
            messageId: connectionInfo.messagesSent,
            timestamp: Date.now()
          });

          try {
            socket.send(message);
            connectionInfo.messagesSent++;
          } catch (error) {
            connectionInfo.errors.push(error.message);
          }
        }
      }, options.messageFrequency);

      socket.onopen = () => {
        resolve(connectionInfo);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.timestamp) {
            const latency = Date.now() - data.timestamp;
            connectionInfo.latencies.push(latency);
          }
          connectionInfo.messagesReceived++;
        } catch (e) {
          // Ignore parsing errors
        }
      };

      socket.onerror = (error) => {
        connectionInfo.errors.push(error.message);
      };

      socket.onclose = () => {
        clearInterval(messageInterval);
        this.connectionStatusManager.removeConnection(`stress_${connectionId}`);
      };

      // Add timeout
      setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }, options.rampUpTime + options.sustainedTime + options.rampDownTime + 5000);
    });
  }

  /**
   * Get comprehensive test report
   */
  getTestReport() {
    const completedTests = this.testResults.filter(test => test.status === 'completed');
    const failedTests = this.testResults.filter(test => test.status === 'failed');
    const activeTests = Array.from(this.activeTests.values());

    const testTypes = {};
    completedTests.forEach(test => {
      if (!testTypes[test.type]) {
        testTypes[test.type] = { count: 0, totalDuration: 0, avgDuration: 0 };
      }
      testTypes[test.type].count++;
      testTypes[test.type].totalDuration += test.duration;
      testTypes[test.type].avgDuration = testTypes[test.type].totalDuration / testTypes[test.type].count;
    });

    return {
      summary: {
        total: this.testResults.length,
        completed: completedTests.length,
        failed: failedTests.length,
        active: activeTests.length,
        successRate: this.testResults.length > 0 ? completedTests.length / this.testResults.length : 0
      },
      testTypes,
      activeTests: activeTests.map(test => ({
        id: test.id,
        type: test.type,
        duration: Date.now() - test.startTime,
        status: test.status
      })),
      recentTests: this.testResults.slice(-10).map(test => ({
        id: test.id,
        type: test.type,
        status: test.status,
        duration: test.duration,
        timestamp: test.startTime
      })),
      webSocketMetrics: this.webSocketDebugger ? this.webSocketDebugger.getMetrics() : null,
      connectionStatus: this.connectionStatusManager ? this.connectionStatusManager.getGlobalStatus() : null,
      timestamp: Date.now()
    };
  }

  /**
   * Get detailed test results
   */
  getTestResults(testId) {
    return this.testResults.find(test => test.id === testId);
  }

  /**
   * Get active test status
   */
  getActiveTestStatus(testId) {
    return this.activeTests.get(testId);
  }

  /**
   * Cancel active test
   */
  cancelTest(testId) {
    const test = this.activeTests.get(testId);
    if (test) {
      test.status = 'cancelled';
      test.endTime = Date.now();
      test.duration = test.endTime - test.startTime;

      this.activeTests.delete(testId);
      this.testResults.push(test);
      this.emit('test:cancelled', test);

      return true;
    }
    return false;
  }

  /**
   * Clear test history
   */
  clearHistory() {
    this.testResults = [];
    this.testHistory = [];
    this.emit('history:cleared');
  }

  /**
   * Generate test ID
   */
  generateTestId() {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log message
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [RealTimeTest:${level.toUpperCase()}] ${message}`);
    this.emit('log', { level, message, timestamp });
  }

  /**
   * Stop all testing
   */
  stop() {
    // Cancel all active tests
    for (const [testId, test] of this.activeTests) {
      this.cancelTest(testId);
    }

    // Stop monitoring
    if (this.webSocketDebugger) {
      this.webSocketDebugger.stop();
    }

    if (this.connectionStatusManager) {
      this.connectionStatusManager.stopMonitoring();
    }

    this.log('Real-time testing suite stopped');
  }
}

export { RealTimeTestingSuite };