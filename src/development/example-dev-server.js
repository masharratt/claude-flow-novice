/**
 * Example Development Server with Enhanced Debugging Capabilities
 * Demonstrates usage of all development environment components
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import development components
import { developmentConfig, productionConfig } from '../../config/development-server.js';
import ConfigurationSwitcher from './config-switcher.js';
import { WebSocketDebugger } from '../websocket/websocket-debugger.js';
import { ConnectionStatusManager } from './connection-status.js';
import { RealTimeTestingSuite } from './testing-utils.js';
import DevelopmentMode from './development-mode.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ExampleDevelopmentServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 3001,
      environment: options.environment || 'development',
      autoDetect: options.autoDetect ?? true,
      enableAllFeatures: options.enableAllFeatures ?? true,
      ...options
    };

    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });

    // Initialize components
    this.configSwitcher = null;
    this.developmentMode = null;
    this.webSocketDebugger = null;
    this.connectionStatusManager = null;
    this.testingSuite = null;

    this.setupServer();
  }

  /**
   * Setup server with all development features
   */
  async setupServer() {
    console.log('🚀 Initializing Example Development Server...');

    // Initialize configuration switcher
    this.configSwitcher = new ConfigurationSwitcher(this.app, this.server, {
      autoDetect: this.options.autoDetect,
      allowHotSwap: true
    });

    // Get current environment
    const currentEnv = this.configSwitcher.currentEnvironment;
    console.log(`📊 Current Environment: ${currentEnv}`);

    // Initialize development components if in development mode
    if (currentEnv === 'development' && this.options.enableAllFeatures) {
      await this.initializeDevelopmentComponents();
    }

    // Setup routes
    this.setupRoutes();
    this.setupSocketHandlers();

    // Add development middleware
    this.addDevelopmentMiddleware();

    console.log('✅ Development server initialized successfully');
  }

  /**
   * Initialize development-specific components
   */
  async initializeDevelopmentComponents() {
    // Initialize WebSocket debugger
    this.webSocketDebugger = new WebSocketDebugger({
      enabled: true,
      logLevel: 'debug',
      maxHistory: 1000
    });

    // Initialize connection status manager
    this.connectionStatusManager = new ConnectionStatusManager({
      heartbeatInterval: 5000,
      connectionTimeout: 15000,
      statusUpdateInterval: 1000
    });

    // Initialize testing suite
    this.testingSuite = new RealTimeTestingSuite({
      defaultTimeout: 10000,
      maxConnections: 100,
      messageInterval: 100,
      testDuration: 30000,
      logLevel: 'debug'
    });

    // Initialize development mode
    this.developmentMode = this.configSwitcher.getDevelopmentMode();

    // Setup component integration
    this.setupComponentIntegration();

    console.log('🛠️  Development components initialized');
  }

  /**
   * Setup integration between components
   */
  setupComponentIntegration() {
    if (!this.webSocketDebugger || !this.connectionStatusManager) return;

    // Forward WebSocket events to connection status manager
    this.webSocketDebugger.on('connection:event', (event) => {
      if (event.event === 'connected' && event.socket) {
        this.connectionStatusManager.registerConnection(
          event.connectionId,
          event.socket,
          { source: 'websocket-debugger' }
        );
      }
    });

    // Setup event logging
    this.webSocketDebugger.on('metrics:update', (metrics) => {
      console.log('📊 WebSocket Metrics Updated:', {
        activeConnections: metrics.activeConnections,
        totalMessages: metrics.totalMessages,
        avgLatency: `${metrics.avgLatency?.toFixed(2)}ms`
      });
    });

    this.connectionStatusManager.on('connection:status:changed', (event) => {
      console.log('🔄 Connection Status Changed:', {
        connectionId: event.connectionId,
        from: event.oldStatus,
        to: event.newStatus
      });
    });

    this.testingSuite.on('test:completed', (test) => {
      console.log('✅ Test Completed:', {
        id: test.id,
        type: test.type,
        duration: `${test.duration}ms`,
        success: test.status === 'completed'
      });
    });
  }

  /**
   * Add development middleware
   */
  addDevelopmentMiddleware() {
    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`🔍 ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      });

      next();
    });

    // Development headers
    this.app.use((req, res, next) => {
      res.set('X-Development-Server', 'true');
      res.set('X-Features', JSON.stringify({
        webSocketDebugger: !!this.webSocketDebugger,
        connectionStatusManager: !!this.connectionStatusManager,
        testingSuite: !!this.testingSuite,
        configSwitcher: !!this.configSwitcher
      }));
      next();
    });
  }

  /**
   * Setup server routes
   */
  setupRoutes() {
    // Root endpoint with server information
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Example Development Server',
        version: '1.0.0',
        environment: this.configSwitcher.currentEnvironment,
        features: {
          webSocketDebugger: !!this.webSocketDebugger,
          connectionStatusManager: !!this.connectionStatusManager,
          testingSuite: !!this.testingSuite,
          developmentMode: !!this.developmentMode
        },
        endpoints: {
          configuration: '/api/config/*',
          debugging: '/api/debug/*',
          testing: '/api/test/*',
          monitoring: '/api/monitor/*'
        },
        timestamp: new Date().toISOString()
      });
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        environment: this.configSwitcher.currentEnvironment,
        timestamp: new Date().toISOString()
      });
    });

    // Debugging endpoints
    this.setupDebuggingRoutes();

    // Testing endpoints
    this.setupTestingRoutes();

    // Monitoring endpoints
    this.setupMonitoringRoutes();

    // Development tools endpoints
    this.setupDevToolsRoutes();
  }

  /**
   * Setup debugging routes
   */
  setupDebuggingRoutes() {
    if (!this.webSocketDebugger) return;

    // WebSocket debugging endpoints
    this.app.get('/api/debug/websocket', (req, res) => {
      res.json({
        connections: this.webSocketDebugger.getConnections().map(conn => conn.getInfo()),
        metrics: this.webSocketDebugger.getMetrics(),
        performance: this.webSocketDebugger.getPerformanceStats(),
        health: this.webSocketDebugger.getHealthReport(),
        timestamp: new Date().toISOString()
      });
    });

    this.app.post('/api/debug/websocket/stress-test', async (req, res) => {
      try {
        const options = req.body;
        const results = await this.webSocketDebugger.stressTest(options);
        res.json({ success: true, results, timestamp: new Date().toISOString() });
      } catch (error) {
        res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
      }
    });

    // Connection status endpoints
    if (this.connectionStatusManager) {
      this.app.get('/api/debug/connections', (req, res) => {
        res.json({
          status: this.connectionStatusManager.getGlobalStatus(),
          connections: this.connectionStatusManager.getAllConnections(),
          health: this.connectionStatusManager.getHealthSummary(),
          performance: this.connectionStatusManager.getPerformanceMetrics(),
          timestamp: new Date().toISOString()
        });
      });

      this.app.get('/api/debug/connections/:id', (req, res) => {
        const connection = this.connectionStatusManager.getConnectionInfo(req.params.id);
        if (connection) {
          res.json(connection);
        } else {
          res.status(404).json({ error: 'Connection not found' });
        }
      });
    }
  }

  /**
   * Setup testing routes
   */
  setupTestingRoutes() {
    if (!this.testingSuite) return;

    // Get testing suite status
    this.app.get('/api/test/status', (req, res) => {
      res.json({
        report: this.testingSuite.getTestReport(),
        activeTests: Array.from(this.testingSuite.activeTests.keys()),
        timestamp: new Date().toISOString()
      });
    });

    // Run basic connection test
    this.app.post('/api/test/basic', async (req, res) => {
      try {
        const { serverUrl = `ws://localhost:${this.options.port}`, options = {} } = req.body;
        const results = await this.testingSuite.runBasicConnectionTest(serverUrl, options);
        res.json({ success: true, results, timestamp: new Date().toISOString() });
      } catch (error) {
        res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
      }
    });

    // Run load test
    this.app.post('/api/test/load', async (req, res) => {
      try {
        const { serverUrl = `ws://localhost:${this.options.port}`, options = {} } = req.body;
        const results = await this.testingSuite.runLoadTest(serverUrl, options);
        res.json({ success: true, results, timestamp: new Date().toISOString() });
      } catch (error) {
        res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
      }
    });

    // Run stress test
    this.app.post('/api/test/stress', async (req, res) => {
      try {
        const { serverUrl = `ws://localhost:${this.options.port}`, options = {} } = req.body;
        const results = await this.testingSuite.runStressTest(serverUrl, options);
        res.json({ success: true, results, timestamp: new Date().toISOString() });
      } catch (error) {
        res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
      }
    });

    // Cancel test
    this.app.delete('/api/test/:testId', (req, res) => {
      const cancelled = this.testingSuite.cancelTest(req.params.testId);
      res.json({ success: cancelled, testId: req.params.testId, timestamp: new Date().toISOString() });
    });

    // Clear test history
    this.app.delete('/api/test/history', (req, res) => {
      this.testingSuite.clearHistory();
      res.json({ success: true, message: 'Test history cleared', timestamp: new Date().toISOString() });
    });
  }

  /**
   * Setup monitoring routes
   */
  setupMonitoringRoutes() {
    this.app.get('/api/monitor/system', (req, res) => {
      res.json({
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          version: process.version,
          platform: process.platform
        },
        server: {
          connections: this.server.listener?.socket?.connections || 0,
          address: this.server.address(),
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/api/monitor/performance', (req, res) => {
      const performance = {
        websocket: this.webSocketDebugger ? this.webSocketDebugger.getPerformanceStats() : null,
        connections: this.connectionStatusManager ? this.connectionStatusManager.getPerformanceMetrics() : null,
        testing: this.testingSuite ? this.testingSuite.getTestReport() : null,
        timestamp: new Date().toISOString()
      };

      res.json(performance);
    });

    this.app.get('/api/monitor/health', (req, res) => {
      const health = {
        status: 'healthy',
        checks: {
          server: { status: 'healthy', uptime: process.uptime() },
          websocket: this.webSocketDebugger ? {
            status: this.webSocketDebugger.getHealthReport().healthRatio > 0.8 ? 'healthy' : 'warning',
            ratio: this.webSocketDebugger.getHealthReport().healthRatio
          } : { status: 'disabled' },
          connections: this.connectionStatusManager ? {
            status: this.connectionStatusManager.getHealthSummary().healthRatio > 0.8 ? 'healthy' : 'warning',
            ratio: this.connectionStatusManager.getHealthSummary().healthRatio
          } : { status: 'disabled' }
        },
        timestamp: new Date().toISOString()
      };

      const overallStatus = Object.values(health.checks).every(check =>
        check.status === 'healthy' || check.status === 'disabled'
      ) ? 'healthy' : 'warning';

      health.status = overallStatus;
      res.json(health);
    });
  }

  /**
   * Setup development tools routes
   */
  setupDevToolsRoutes() {
    // Echo endpoint for testing
    this.app.post('/api/dev/echo', (req, res) => {
      res.json({
        echo: req.body,
        headers: req.headers,
        timestamp: new Date().toISOString()
      });
    });

    // Test endpoint for various HTTP methods
    this.app.all('/api/dev/test/:type', (req, res) => {
      const { type } = req.params;
      const delay = parseInt(req.query.delay) || 0;

      setTimeout(() => {
        switch (type) {
          case 'success':
            res.json({
              type: 'success',
              method: req.method,
              query: req.query,
              body: req.body,
              timestamp: new Date().toISOString()
            });
            break;

          case 'error':
            res.status(500).json({
              type: 'error',
              message: 'Test error',
              method: req.method,
              timestamp: new Date().toISOString()
            });
            break;

          case 'delay':
            res.json({
              type: 'delay',
              delay,
              timestamp: new Date().toISOString()
            });
            break;

          default:
            res.status(400).json({
              error: 'Unknown test type',
              availableTypes: ['success', 'error', 'delay']
            });
        }
      }, delay);
    });

    // Mock data endpoints
    this.app.get('/api/dev/mock/:type', (req, res) => {
      const { type } = req.params;
      const mockData = this.generateMockData(type);
      res.json(mockData);
    });
  }

  /**
   * Setup Socket.IO handlers
   */
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 Socket connected: ${socket.id}`);

      // Wrap socket with debugger if available
      if (this.webSocketDebugger) {
        this.webSocketDebugger.wrapSocketIO(socket, socket.id);
      }

      // Register with connection status manager if available
      if (this.connectionStatusManager) {
        this.connectionStatusManager.registerConnection(socket.id, socket, {
          source: 'socket.io',
          userAgent: socket.handshake.headers['user-agent']
        });
      }

      // Handle development commands
      socket.on('dev:command', (command, callback) => {
        this.handleDevCommand(socket, command, callback);
      });

      // Handle test messages
      socket.on('test:message', (data, callback) => {
        const response = {
          echo: data,
          timestamp: Date.now(),
          socketId: socket.id
        };

        if (callback) {
          callback(response);
        } else {
          socket.emit('test:response', response);
        }
      });

      // Handle ping
      socket.on('ping', (callback) => {
        if (callback) {
          callback(Date.now());
        } else {
          socket.emit('pong', Date.now());
        }
      });

      socket.on('disconnect', (reason) => {
        console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);

        // Remove from connection status manager if available
        if (this.connectionStatusManager) {
          this.connectionStatusManager.removeConnection(socket.id);
        }
      });
    });
  }

  /**
   * Handle development commands from Socket.IO
   */
  handleDevCommand(socket, command, callback) {
    const { type, data } = command;

    switch (type) {
      case 'get_status':
        const status = {
          environment: this.configSwitcher.currentEnvironment,
          connections: this.connectionStatusManager ? this.connectionStatusManager.getGlobalStatus() : null,
          websocket: this.webSocketDebugger ? this.webSocketDebugger.getMetrics() : null,
          testing: this.testingSuite ? this.testingSuite.getTestReport() : null,
          timestamp: Date.now()
        };

        if (callback) callback(status);
        break;

      case 'switch_environment':
        this.configSwitcher.switchEnvironment(data.environment, data.options)
          .then(() => {
            if (callback) callback({ success: true, environment: this.configSwitcher.currentEnvironment });
          })
          .catch(error => {
            if (callback) callback({ success: false, error: error.message });
          });
        break;

      case 'run_test':
        if (this.testingSuite) {
          const testMethod = this.testingSuite[`run${data.testType.charAt(0).toUpperCase() + data.testType.slice(1)}Test`];
          if (testMethod) {
            testMethod.call(this.testingSuite, data.serverUrl, data.options)
              .then(results => {
                if (callback) callback({ success: true, results });
              })
              .catch(error => {
                if (callback) callback({ success: false, error: error.message });
              });
          } else {
            if (callback) callback({ success: false, error: `Unknown test type: ${data.testType}` });
          }
        } else {
          if (callback) callback({ success: false, error: 'Testing suite not available' });
        }
        break;

      default:
        if (callback) callback({ success: false, error: `Unknown command type: ${type}` });
    }
  }

  /**
   * Generate mock data for development
   */
  generateMockData(type) {
    const now = Date.now();

    switch (type) {
      case 'metrics':
        return {
          cpu: Math.random() * 100,
          memory: Math.random() * 100,
          disk: Math.random() * 100,
          network: {
            in: Math.random() * 1000000,
            out: Math.random() * 1000000
          },
          timestamp: now
        };

      case 'swarm':
        return {
          activeAgents: Math.floor(Math.random() * 20) + 5,
          totalTasks: Math.floor(Math.random() * 100) + 20,
          completedTasks: Math.floor(Math.random() * 80) + 10,
          failedTasks: Math.floor(Math.random() * 5),
          averageConfidence: Math.random() * 0.3 + 0.7,
          timestamp: now
        };

      case 'alerts':
        return {
          active: Math.floor(Math.random() * 5),
          total: Math.floor(Math.random() * 20) + 5,
          recent: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, (_, i) => ({
            id: `alert_${now}_${i}`,
            type: ['warning', 'error', 'info'][Math.floor(Math.random() * 3)],
            message: `Test alert ${i + 1}`,
            timestamp: now - (i * 60000)
          })),
          timestamp: now
        };

      default:
        return {
          type,
          message: `Mock data for ${type}`,
          timestamp: now
        };
    }
  }

  /**
   * Start the server
   */
  start() {
    this.server.listen(this.options.port, () => {
      console.log(`🚀 Example Development Server running on port ${this.options.port}`);
      console.log(`📊 Environment: ${this.configSwitcher.currentEnvironment}`);
      console.log(`🔗 Dashboard: http://localhost:${this.options.port}`);
      console.log(`💡 Features: ${this.options.enableAllFeatures ? 'All development features enabled' : 'Basic server'}`);
      console.log(`⚡ Socket.IO: Available`);
      console.log(`🛠️  Debug endpoints: /api/debug/*`);
      console.log(`🧪 Testing endpoints: /api/test/*`);
      console.log(`📈 Monitoring endpoints: /api/monitor/*`);
      console.log(`🔧 Dev tools: /api/dev/*`);
      console.log(`⚙️  Configuration: /api/config/*`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🛑 Shutting down gracefully...');
      this.stop();
    });

    process.on('SIGINT', () => {
      console.log('🛑 Shutting down gracefully...');
      this.stop();
    });
  }

  /**
   * Stop the server
   */
  stop() {
    // Stop development components
    if (this.testingSuite) {
      this.testingSuite.stop();
    }

    if (this.webSocketDebugger) {
      this.webSocketDebugger.stop();
    }

    if (this.connectionStatusManager) {
      this.connectionStatusManager.stopMonitoring();
    }

    if (this.developmentMode) {
      this.developmentMode.stop();
    }

    // Close server
    this.server.close(() => {
      console.log('✅ Server stopped gracefully');
      process.exit(0);
    });
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ExampleDevelopmentServer({
    port: process.env.PORT || 3001,
    environment: process.env.NODE_ENV || 'development',
    enableAllFeatures: true
  });

  server.start();
}

export default ExampleDevelopmentServer;