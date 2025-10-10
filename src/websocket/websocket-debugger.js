/**
 * Enhanced WebSocket Debugger and Connection Monitor
 * Provides comprehensive debugging capabilities for WebSocket connections
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';

export class WebSocketDebugger extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enabled: options.enabled ?? true,
      logLevel: options.logLevel ?? 'debug',
      maxHistory: options.maxHistory ?? 1000,
      pingInterval: options.pingInterval ?? 10000,
      reconnectAttempts: options.reconnectAttempts ?? 5,
      reconnectDelay: options.reconnectDelay ?? 1000,
      ...options
    };

    this.connections = new Map();
    this.connectionHistory = [];
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      totalMessages: 0,
      totalBytes: 0,
      avgLatency: 0,
      reconnectCount: 0
    };

    this.startTime = Date.now();
    this.lastCleanup = Date.now();

    if (this.options.enabled) {
      this.startMetricsCollection();
      this.startCleanup();
    }
  }

  /**
   * Create a debug wrapper for WebSocket connection
   */
  wrapConnection(socket, connectionId = null) {
    const id = connectionId || this.generateConnectionId();
    const debugSocket = new DebugSocket(socket, id, this);

    this.connections.set(id, debugSocket);
    this.recordConnection('connected', id, debugSocket);

    return debugSocket;
  }

  /**
   * Create a debug wrapper for Socket.IO connection
   */
  wrapSocketIO(socket, connectionId = null) {
    const id = connectionId || this.generateConnectionId();
    const debugSocket = new DebugSocketIO(socket, id, this);

    this.connections.set(id, debugSocket);
    this.recordConnection('connected', id, debugSocket);

    return debugSocket;
  }

  /**
   * Generate unique connection ID
   */
  generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record connection event
   */
  recordConnection(event, connectionId, socket = null) {
    const record = {
      timestamp: Date.now(),
      event,
      connectionId,
      socket: socket ? {
        readyState: socket.readyState,
        protocol: socket.protocol,
        extensions: socket.extensions,
        bufferedAmount: socket.bufferedAmount
      } : null
    };

    this.connectionHistory.push(record);

    // Keep history within limits
    if (this.connectionHistory.length > this.options.maxHistory) {
      this.connectionHistory = this.connectionHistory.slice(-this.options.maxHistory);
    }

    this.updateMetrics(event);
    this.emit('connection:event', record);

    this.log(`Connection ${event}: ${connectionId}`, 'info');
  }

  /**
   * Update connection metrics
   */
  updateMetrics(event) {
    switch (event) {
      case 'connected':
        this.metrics.totalConnections++;
        this.metrics.activeConnections++;
        break;
      case 'disconnected':
        this.metrics.activeConnections--;
        break;
      case 'failed':
        this.metrics.failedConnections++;
        break;
      case 'reconnected':
        this.metrics.reconnectCount++;
        break;
    }
  }

  /**
   * Record message metrics
   */
  recordMessage(connectionId, type, size, latency = 0) {
    this.metrics.totalMessages++;
    this.metrics.totalBytes += size;

    // Update average latency
    if (latency > 0) {
      this.metrics.avgLatency = (this.metrics.avgLatency + latency) / 2;
    }

    const record = {
      timestamp: Date.now(),
      connectionId,
      type, // 'sent' or 'received'
      size,
      latency
    };

    this.emit('message:record', record);
    this.log(`Message ${type}: ${connectionId} (${size} bytes, ${latency}ms)`, 'debug');
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      const metrics = {
        ...this.metrics,
        uptime: Date.now() - this.startTime,
        connections: this.getConnections().map(conn => conn.getInfo()),
        timestamp: Date.now()
      };

      this.emit('metrics:update', metrics);
    }, 1000);
  }

  /**
   * Start cleanup of old connections
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - (5 * 60 * 1000); // 5 minutes

      for (const [id, socket] of this.connections) {
        if (socket.lastActivity < cutoff && !socket.isConnected()) {
          this.connections.delete(id);
          this.log(`Cleaned up inactive connection: ${id}`, 'debug');
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Get all active connections
   */
  getConnections() {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection by ID
   */
  getConnection(id) {
    return this.connections.get(id);
  }

  /**
   * Get connection history
   */
  getHistory(limit = 100) {
    return this.connectionHistory.slice(-limit);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      activeConnections: this.connections.size,
      timestamp: Date.now()
    };
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    const connections = this.getConnections();
    const totalLatency = connections.reduce((sum, conn) => sum + conn.getAvgLatency(), 0);
    const avgLatency = connections.length > 0 ? totalLatency / connections.length : 0;

    return {
      avgLatency,
      minLatency: Math.min(...connections.map(conn => conn.getMinLatency())),
      maxLatency: Math.max(...connections.map(conn => conn.getMaxLatency())),
      messageRate: this.metrics.totalMessages / ((Date.now() - this.startTime) / 1000),
      byteRate: this.metrics.totalBytes / ((Date.now() - this.startTime) / 1000),
      errorRate: this.metrics.failedConnections / this.metrics.totalConnections
    };
  }

  /**
   * Get connection health report
   */
  getHealthReport() {
    const connections = this.getConnections();
    const healthy = connections.filter(conn => conn.isHealthy()).length;
    const unhealthy = connections.length - healthy;

    return {
      total: connections.length,
      healthy,
      unhealthy,
      healthRatio: connections.length > 0 ? healthy / connections.length : 1,
      metrics: this.getMetrics(),
      performance: this.getPerformanceStats(),
      timestamp: Date.now()
    };
  }

  /**
   * Simulate connection stress test
   */
  async stressTest(options = {}) {
    const {
      connections = 10,
      messages = 100,
      interval = 100,
      messageSize = 1024
    } = options;

    this.log(`Starting stress test: ${connections} connections, ${messages} messages each`, 'info');

    const testConnections = [];
    const startTime = performance.now();

    // Create test connections
    for (let i = 0; i < connections; i++) {
      const mockSocket = new MockWebSocket();
      const debugSocket = this.wrapConnection(mockSocket, `test_${i}`);
      testConnections.push(debugSocket);
    }

    // Send messages
    for (let i = 0; i < messages; i++) {
      for (const socket of testConnections) {
        const message = this.generateTestMessage(messageSize);
        socket.send(message);

        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    // Close connections
    testConnections.forEach(socket => socket.close());

    const endTime = performance.now();
    const duration = endTime - startTime;

    const report = {
      duration,
      connections,
      messages,
      messagesPerSecond: (connections * messages) / (duration / 1000),
      avgLatency: this.getPerformanceStats().avgLatency,
      throughput: (this.metrics.totalBytes) / (duration / 1000)
    };

    this.log(`Stress test completed: ${report.messagesPerSecond.toFixed(2)} msg/s`, 'info');
    this.emit('stress-test:completed', report);

    return report;
  }

  /**
   * Generate test message
   */
  generateTestMessage(size) {
    const data = new Array(size).fill(0).map(() => Math.random().toString(36).charAt(2)).join('');
    return JSON.stringify({
      type: 'test',
      timestamp: Date.now(),
      data: data.substring(0, size)
    });
  }

  /**
   * Enable detailed logging
   */
  enableDetailedLogging() {
    this.options.logLevel = 'debug';
    this.on('connection:event', (event) => {
      this.log(`Connection Event: ${JSON.stringify(event)}`, 'debug');
    });

    this.on('message:record', (record) => {
      this.log(`Message Record: ${JSON.stringify(record)}`, 'debug');
    });
  }

  /**
   * Log message with level
   */
  log(message, level = 'info') {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [WebSocket:${level.toUpperCase()}] ${message}`;

    console.log(logMessage);
    this.emit('log', { level, message, timestamp });
  }

  /**
   * Check if should log at level
   */
  shouldLog(level) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const currentLevel = levels[this.options.logLevel] || 2;
    const messageLevel = levels[level] || 2;
    return messageLevel <= currentLevel;
  }

  /**
   * Export debug data
   */
  exportData() {
    return {
      connections: this.getConnections().map(conn => conn.getInfo()),
      history: this.getHistory(),
      metrics: this.getMetrics(),
      performance: this.getPerformanceStats(),
      health: this.getHealthReport(),
      config: this.options,
      timestamp: Date.now()
    };
  }

  /**
   * Stop debugger
   */
  stop() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all connections
    for (const socket of this.connections.values()) {
      socket.close();
    }

    this.connections.clear();
    this.log('WebSocket debugger stopped', 'info');
  }
}

/**
 * Debug wrapper for WebSocket connections
 */
class DebugSocket extends EventEmitter {
  constructor(socket, id, debugger) {
    super();

    this.socket = socket;
    this.id = id;
    this.debugger = debugger;
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    this.messageCount = 0;
    this.byteCount = 0;
    this.latencyHistory = [];
    this.reconnectCount = 0;

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Wrap socket events
    this.socket.onopen = (event) => {
      this.lastActivity = Date.now();
      this.debugger.recordConnection('opened', this.id, this);
      this.emit('open', event);
    };

    this.socket.onclose = (event) => {
      this.debugger.recordConnection('closed', this.id, this);
      this.emit('close', event);
    };

    this.socket.onerror = (error) => {
      this.debugger.recordConnection('error', this.id, this);
      this.emit('error', error);
    };

    this.socket.onmessage = (event) => {
      this.lastActivity = Date.now();
      this.messageCount++;
      this.byteCount += event.data.length;

      // Calculate latency if message contains timestamp
      let latency = 0;
      try {
        const data = JSON.parse(event.data);
        if (data.timestamp) {
          latency = Date.now() - data.timestamp;
          this.latencyHistory.push(latency);
          if (this.latencyHistory.length > 100) {
            this.latencyHistory = this.latencyHistory.slice(-100);
          }
        }
      } catch (e) {
        // Not JSON, skip latency calculation
      }

      this.debugger.recordMessage(this.id, 'received', event.data.length, latency);
      this.emit('message', event);
    };
  }

  send(data) {
    if (this.socket.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      const size = message.length;

      this.socket.send(message);
      this.lastActivity = Date.now();
      this.messageCount++;
      this.byteCount += size;

      this.debugger.recordMessage(this.id, 'sent', size);
      return true;
    }
    return false;
  }

  close() {
    this.socket.close();
  }

  isConnected() {
    return this.socket.readyState === WebSocket.OPEN;
  }

  isHealthy() {
    return this.isConnected() &&
           (Date.now() - this.lastActivity) < 30000 && // Active in last 30s
           this.getAvgLatency() < 1000; // Latency under 1s
  }

  getAvgLatency() {
    if (this.latencyHistory.length === 0) return 0;
    return this.latencyHistory.reduce((sum, lat) => sum + lat, 0) / this.latencyHistory.length;
  }

  getMinLatency() {
    return this.latencyHistory.length > 0 ? Math.min(...this.latencyHistory) : 0;
  }

  getMaxLatency() {
    return this.latencyHistory.length > 0 ? Math.max(...this.latencyHistory) : 0;
  }

  getInfo() {
    return {
      id: this.id,
      readyState: this.socket.readyState,
      connected: this.isConnected(),
      healthy: this.isHealthy(),
      startTime: this.startTime,
      lastActivity: this.lastActivity,
      messageCount: this.messageCount,
      byteCount: this.byteCount,
      avgLatency: this.getAvgLatency(),
      reconnectCount: this.reconnectCount,
      uptime: Date.now() - this.startTime
    };
  }
}

/**
 * Debug wrapper for Socket.IO connections
 */
class DebugSocketIO extends DebugSocket {
  constructor(socket, id, debugger) {
    super(socket, id, debugger);
    this.setupSocketIOHandlers();
  }

  setupSocketIOHandlers() {
    // Socket.IO specific events
    this.socket.on('connect', () => {
      this.debugger.recordConnection('connected', this.id, this);
      this.emit('connect');
    });

    this.socket.on('disconnect', (reason) => {
      this.debugger.recordConnection('disconnected', this.id, this);
      this.emit('disconnect', reason);
    });

    this.socket.on('connect_error', (error) => {
      this.debugger.recordConnection('connect_error', this.id, this);
      this.emit('connect_error', error);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      this.reconnectCount++;
      this.debugger.recordConnection('reconnected', this.id, this);
      this.emit('reconnect', attemptNumber);
    });

    // Wrap emit method
    const originalEmit = this.socket.emit.bind(this.socket);
    this.socket.emit = (event, ...args) => {
      const size = JSON.stringify(args).length;
      this.debugger.recordMessage(this.id, 'sent', size);
      this.lastActivity = Date.now();
      this.messageCount++;
      this.byteCount += size;

      return originalEmit(event, ...args);
    };

    // Wrap event listeners
    const originalOn = this.socket.on.bind(this.socket);
    this.socket.on = (event, callback) => {
      const wrappedCallback = (...args) => {
        const size = JSON.stringify(args).length;
        this.debugger.recordMessage(this.id, 'received', size);
        this.lastActivity = Date.now();
        this.messageCount++;
        this.byteCount += size;

        return callback(...args);
      };

      return originalOn(event, wrappedCallback);
    };
  }

  emit(event, ...args) {
    return this.socket.emit(event, ...args);
  }

  on(event, callback) {
    return this.socket.on(event, callback);
  }

  off(event, callback) {
    return this.socket.off(event, callback);
  }

  isConnected() {
    return this.socket.connected;
  }
}

/**
 * Mock WebSocket for testing
 */
class MockWebSocket {
  constructor() {
    this.readyState = WebSocket.CONNECTING;
    this.protocol = '';
    this.extensions = '';
    this.bufferedAmount = 0;

    // Simulate connection
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 100);
  }

  send(data) {
    if (this.readyState === WebSocket.OPEN) {
      // Simulate message
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage({ data: `Echo: ${data}` });
        }
      }, 50);
    }
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }
}

export { WebSocketDebugger, DebugSocket, DebugSocketIO, MockWebSocket };