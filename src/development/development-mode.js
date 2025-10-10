/**
 * Development Mode Implementation
 * Provides relaxed security settings and enhanced debugging capabilities
 */

import { developmentConfig, productionConfig, isDevelopment, isProduction } from '../../config/development-server.js';
import { WebSocketDebugger } from '../websocket/websocket-debugger.js';

export class DevelopmentMode {
  constructor(app, server, options = {}) {
    this.app = app;
    this.server = server;
    this.options = {
      enabled: options.enabled ?? isDevelopment,
      autoReload: options.autoReload ?? true,
      debugMode: options.debugMode ?? true,
      mockData: options.mockData ?? true,
      bypassAuth: options.bypassAuth ?? true,
      enhancedLogging: options.enhancedLogging ?? true,
      ...options
    };

    this.webSocketDebugger = null;
    this.mockDataStore = new Map();
    this.devTools = {
      autoReload: null,
      fileWatcher: null,
      hotReload: null
    };

    if (this.options.enabled) {
      this.initialize();
    }
  }

  /**
   * Initialize development mode
   */
  async initialize() {
    console.log('🚀 Initializing Development Mode...');

    // Apply development configuration
    this.applyDevelopmentConfig();

    // Setup enhanced security middleware
    this.setupDevelopmentSecurity();

    // Setup WebSocket debugging
    this.setupWebSocketDebugging();

    // Setup mock data endpoints
    if (this.options.mockData) {
      this.setupMockDataEndpoints();
    }

    // Setup development tools
    this.setupDevelopmentTools();

    // Setup enhanced error handling
    this.setupEnhancedErrorHandling();

    // Setup development monitoring
    this.setupDevelopmentMonitoring();

    // Add development routes
    this.addDevelopmentRoutes();

    console.log('✅ Development Mode initialized successfully');
  }

  /**
   * Apply development configuration
   */
  applyDevelopmentConfig() {
    const config = developmentConfig;

    // Set development headers
    this.app.use((req, res, next) => {
      res.set('X-Development-Mode', 'true');
      res.set('X-Debug-Enabled', this.options.debugMode ? 'true' : 'false');
      res.set('X-Environment', 'development');
      res.set('X-Server-Start-Time', new Date().toISOString());

      // Add CORS bypass for development
      res.set('Access-Control-Max-Age', '86400'); // 24 hours
      res.set('Access-Control-Allow-Credentials', 'true');

      // Remove caching in development
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      next();
    });

    // Relaxed CSP for development
    this.app.use((req, res, next) => {
      const csp = config.csp.development.directives;
      const cspString = Object.entries(csp)
        .map(([key, values]) => `${key} ${values.join(' ')}`)
        .join('; ');

      res.set('Content-Security-Policy', cspString);
      next();
    });
  }

  /**
   * Setup development security with relaxed policies
   */
  setupDevelopmentSecurity() {
    // Development auth bypass
    if (this.options.bypassAuth) {
      this.app.use('/api', (req, res, next) => {
        const bypassToken = req.headers['x-dev-bypass'] || req.query.dev_bypass;
        const validTokens = [
          'dev-bypass-2025',
          'development-mode',
          'test-token',
          process.env.DEV_BYPASS_TOKEN
        ].filter(Boolean);

        if (validTokens.includes(bypassToken)) {
          req.user = {
            id: 'dev-user',
            username: 'developer',
            role: 'admin',
            development: true
          };
          return next();
        }

        // Allow requests from localhost without auth
        const isLocalhost = req.hostname === 'localhost' ||
                          req.hostname === '127.0.0.1' ||
                          req.ip === '127.0.0.1' ||
                          req.ip === '::1';

        if (isLocalhost) {
          req.user = {
            id: 'local-dev',
            username: 'local-developer',
            role: 'admin',
            development: true
          };
          return next();
        }

        next();
      });
    }

    // Relaxed rate limiting
    this.app.use((req, res, next) => {
      res.set('X-RateLimit-Limit', '10000');
      res.set('X-RateLimit-Remaining', '9999');
      res.set('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + 900);
      next();
    });
  }

  /**
   * Setup WebSocket debugging
   */
  setupWebSocketDebugging() {
    if (!this.server) return;

    this.webSocketDebugger = new WebSocketDebugger({
      enabled: true,
      logLevel: 'debug',
      maxHistory: 1000
    });

    // Wrap Socket.IO if available
    if (this.server.io) {
      this.server.io.use((socket, next) => {
        const debugSocket = this.webSocketDebugger.wrapSocketIO(socket);
        socket.debugger = debugSocket;
        next();
      });
    }

    // Add WebSocket debugging endpoints
    this.app.get('/api/debug/websocket', (req, res) => {
      res.json({
        connections: this.webSocketDebugger.getConnections().map(conn => conn.getInfo()),
        metrics: this.webSocketDebugger.getMetrics(),
        performance: this.webSocketDebugger.getPerformanceStats(),
        health: this.webSocketDebugger.getHealthReport()
      });
    });

    this.app.post('/api/debug/websocket/stress-test', async (req, res) => {
      try {
        const options = req.body;
        const results = await this.webSocketDebugger.stressTest(options);
        res.json({ success: true, results });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Setup mock data endpoints
   */
  setupMockDataEndpoints() {
    // Mock data management
    this.app.post('/api/dev/mock/:key', (req, res) => {
      const { key } = req.params;
      const data = req.body;
      this.mockDataStore.set(key, {
        data,
        timestamp: Date.now(),
        endpoint: req.path
      });
      res.json({ success: true, key, stored: true });
    });

    this.app.get('/api/dev/mock/:key', (req, res) => {
      const { key } = req.params;
      const mockData = this.mockDataStore.get(key);

      if (mockData) {
        res.json({
          ...mockData.data,
          _mock: true,
          _timestamp: mockData.timestamp
        });
      } else {
        res.status(404).json({ error: 'Mock data not found' });
      }
    });

    this.app.get('/api/dev/mock', (req, res) => {
      const allMocks = {};
      for (const [key, value] of this.mockDataStore) {
        allMocks[key] = value;
      }
      res.json({
        mocks: allMocks,
        count: this.mockDataStore.size
      });
    });

    this.app.delete('/api/dev/mock/:key', (req, res) => {
      const { key } = req.params;
      const deleted = this.mockDataStore.delete(key);
      res.json({ success: true, deleted, key });
    });

    this.app.delete('/api/dev/mock', (req, res) => {
      this.mockDataStore.clear();
      res.json({ success: true, message: 'All mock data cleared' });
    });

    // Load predefined mock data
    this.loadPredefinedMocks();
  }

  /**
   * Setup development tools
   */
  setupDevelopmentTools() {
    // Auto-reload configuration
    if (this.options.autoReload) {
      this.app.get('/api/dev/reload-config', (req, res) => {
        // Reload configuration (implementation depends on your setup)
        res.json({
          success: true,
          message: 'Configuration reloaded',
          timestamp: new Date().toISOString()
        });
      });
    }

    // Development status endpoint
    this.app.get('/api/dev/status', (req, res) => {
      res.json({
        developmentMode: {
          enabled: this.options.enabled,
          autoReload: this.options.autoReload,
          debugMode: this.options.debugMode,
          mockData: this.options.mockData,
          bypassAuth: this.options.bypassAuth,
          enhancedLogging: this.options.enhancedLogging
        },
        environment: {
          nodeEnv: process.env.NODE_ENV,
          isDevelopment: isDevelopment,
          isProduction: isProduction
        },
        features: {
          webSocketDebugger: !!this.webSocketDebugger,
          mockDataCount: this.mockDataStore.size
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Development tools configuration
    this.app.get('/api/dev/tools', (req, res) => {
      res.json({
        tools: {
          mockData: {
            enabled: this.options.mockData,
            endpoints: [
              'GET /api/dev/mock',
              'POST /api/dev/mock/:key',
              'GET /api/dev/mock/:key',
              'DELETE /api/dev/mock/:key'
            ]
          },
          webSocketDebugger: {
            enabled: !!this.webSocketDebugger,
            endpoints: [
              'GET /api/debug/websocket',
              'POST /api/debug/websocket/stress-test'
            ]
          },
          autoReload: {
            enabled: this.options.autoReload,
            endpoint: 'GET /api/dev/reload-config'
          }
        }
      });
    });
  }

  /**
   * Setup enhanced error handling
   */
  setupEnhancedErrorHandling() {
    // Development error middleware
    this.app.use((error, req, res, next) => {
      if (this.options.debugMode) {
        console.error('Development Error:', error);

        res.status(error.status || 500).json({
          error: {
            message: error.message,
            stack: error.stack,
            status: error.status || 500,
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method,
            headers: req.headers,
            query: req.query,
            body: req.body,
            development: true
          }
        });
      } else {
        next(error);
      }
    });

    // Catch-all for development debugging
    this.app.use((req, res) => {
      if (this.options.debugMode) {
        res.status(404).json({
          error: 'Route not found',
          path: req.path,
          method: req.method,
          availableRoutes: this.getAvailableRoutes(),
          timestamp: new Date().toISOString(),
          development: true
        });
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    });
  }

  /**
   * Setup development monitoring
   */
  setupDevelopmentMonitoring() {
    if (!this.options.enhancedLogging) return;

    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration: `${duration}ms`,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          timestamp: new Date().toISOString()
        };

        if (this.options.debugMode) {
          console.log('🔍 DEV Request:', logData);
        }
      });

      next();
    });

    // Development metrics endpoint
    this.app.get('/api/dev/metrics', (req, res) => {
      const metrics = {
        process: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          pid: process.pid,
          version: process.version,
          platform: process.platform
        },
        server: {
          connections: this.server ? this.server.listener?.socket?.connections || 0 : 0,
          timestamp: new Date().toISOString()
        },
        webSocket: this.webSocketDebugger ? {
          connections: this.webSocketDebugger.getConnections().length,
          metrics: this.webSocketDebugger.getMetrics()
        } : null,
        mockData: {
          count: this.mockDataStore.size,
          keys: Array.from(this.mockDataStore.keys())
        }
      };

      res.json(metrics);
    });
  }

  /**
   * Add development-specific routes
   */
  addDevelopmentRoutes() {
    // Configuration viewer
    this.app.get('/api/dev/config', (req, res) => {
      const config = {
        development: developmentConfig,
        current: {
          development: isDevelopment,
          production: isProduction
        }
      };
      res.json(config);
    });

    // Environment variables (safe for development)
    this.app.get('/api/dev/env', (req, res) => {
      const safeEnv = {};
      const allowedPrefixes = ['NODE_', 'DEV_', 'PORT', 'HOST'];

      for (const [key, value] of Object.entries(process.env)) {
        if (allowedPrefixes.some(prefix => key.startsWith(prefix))) {
          safeEnv[key] = value;
        }
      }

      res.json({
        environment: safeEnv,
        timestamp: new Date().toISOString()
      });
    });

    // Development utilities
    this.app.post('/api/dev/utils/timestamp', (req, res) => {
      res.json({
        timestamp: Date.now(),
        iso: new Date().toISOString(),
        utc: new Date().toUTCString(),
        local: new Date().toString()
      });
    });

    this.app.post('/api/dev/utils/echo', (req, res) => {
      res.json({
        echo: req.body,
        timestamp: new Date().toISOString(),
        headers: req.headers
      });
    });

    // Development testing endpoint
    this.app.post('/api/dev/test/:type', (req, res) => {
      const { type } = req.params;
      const data = req.body;

      switch (type) {
        case 'delay':
          const delay = data.delay || 1000;
          setTimeout(() => {
            res.json({
              type: 'delay-test',
              delay,
              timestamp: new Date().toISOString()
            });
          }, delay);
          break;

        case 'error':
          const statusCode = data.statusCode || 500;
          const message = data.message || 'Development test error';
          res.status(statusCode).json({
            error: message,
            type: 'error-test',
            timestamp: new Date().toISOString()
          });
          break;

        case 'success':
          res.json({
            type: 'success-test',
            data,
            timestamp: new Date().toISOString()
          });
          break;

        default:
          res.status(400).json({
            error: 'Unknown test type',
            availableTypes: ['delay', 'error', 'success']
          });
      }
    });
  }

  /**
   * Load predefined mock data
   */
  loadPredefinedMocks() {
    // Sample user data
    this.mockDataStore.set('users', {
      data: [
        { id: 1, name: 'Dev User', email: 'dev@example.com', role: 'developer' },
        { id: 2, name: 'Test User', email: 'test@example.com', role: 'tester' },
        { id: 3, name: 'Admin User', email: 'admin@example.com', role: 'admin' }
      ],
      timestamp: Date.now(),
      endpoint: '/api/users'
    });

    // Sample metrics data
    this.mockDataStore.set('metrics', {
      data: {
        cpu: 45.2,
        memory: 62.8,
        disk: 78.1,
        network: { in: 1024, out: 2048 },
        timestamp: Date.now()
      },
      timestamp: Date.now(),
      endpoint: '/api/metrics'
    });

    // Sample swarm data
    this.mockDataStore.set('swarm', {
      data: {
        activeAgents: 12,
        totalTasks: 45,
        completedTasks: 38,
        failedTasks: 2,
        averageConfidence: 0.87
      },
      timestamp: Date.now(),
      endpoint: '/api/swarm'
    });
  }

  /**
   * Get available routes (simplified version)
   */
  getAvailableRoutes() {
    return [
      'GET /api/dev/status',
      'GET /api/dev/tools',
      'GET /api/dev/metrics',
      'GET /api/dev/config',
      'GET /api/dev/mock',
      'GET /api/dev/mock/:key',
      'POST /api/dev/mock/:key',
      'DELETE /api/dev/mock/:key',
      'GET /api/debug/websocket',
      'POST /api/debug/websocket/stress-test'
    ];
  }

  /**
   * Get development status
   */
  getStatus() {
    return {
      enabled: this.options.enabled,
      features: {
        webSocketDebugger: !!this.webSocketDebugger,
        mockDataCount: this.mockDataStore.size,
        autoReload: this.options.autoReload,
        bypassAuth: this.options.bypassAuth
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Stop development mode
   */
  stop() {
    if (this.webSocketDebugger) {
      this.webSocketDebugger.stop();
    }

    this.mockDataStore.clear();

    // Stop development tools
    Object.values(this.devTools).forEach(tool => {
      if (tool && typeof tool.stop === 'function') {
        tool.stop();
      }
    });

    console.log('🛑 Development mode stopped');
  }
}

export default DevelopmentMode;