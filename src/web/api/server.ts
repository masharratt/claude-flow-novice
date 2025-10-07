/**
 * Express.js API Server for Transparency Dashboard
 *
 * Provides REST API endpoints and WebSocket server for real-time
 * transparency system data visualization and monitoring.
 *
 * @module web/api/server
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import type { Server as HttpServer } from 'http';

import { TransparencySystem } from '../../coordination/shared/transparency/transparency-system.js';
import type {
  ITransparencySystem,
  AgentHierarchyNode,
  AgentStatus,
  AgentLifecycleEvent,
  TransparencyMetrics
} from '../../coordination/shared/transparency/interfaces/transparency-system.js';

import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { cacheMiddleware } from './middleware/cache.js';
import { validationMiddleware } from './middleware/validation.js';
import {
  hierarchyRoutes,
  statusRoutes,
  eventsRoutes,
  metricsRoutes,
  analyticsRoutes,
  systemRoutes
} from './routes/index.js';
import { ApiConfig, createApiConfig } from './config/api-config.js';
import { Logger } from '../../core/logger.js';

/**
 * API Server Configuration
 */
interface ApiServerConfig extends ApiConfig {
  /** Transparency system instance */
  transparencySystem: ITransparencySystem;
  /** WebSocket authentication enabled */
  enableWebSocketAuth: boolean;
  /** API documentation enabled */
  enableApiDocs: boolean;
  /** Health check endpoint enabled */
  enableHealthCheck: boolean;
}

/**
 * API Server for Transparency Dashboard
 *
 * Provides comprehensive REST API and WebSocket server for:
 * - Agent hierarchy visualization
 * - Real-time agent status monitoring
 * - Lifecycle event streaming
 * - Performance metrics
 * - System analytics
 */
export class TransparencyApiServer {
  private app: Express;
  private server: HttpServer;
  private io: SocketIOServer;
  private config: ApiServerConfig;
  private logger: Logger;
  private isStarted = false;

  // Data cache for performance
  private dataCache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  constructor(config: Partial<ApiServerConfig> = {}) {
    this.config = {
      ...createApiConfig(),
      transparencySystem: new TransparencySystem(),
      enableWebSocketAuth: true,
      enableApiDocs: true,
      enableHealthCheck: true,
      ...config
    };

    this.logger = new Logger({
      level: this.config.logLevel,
      format: 'json',
      destination: 'console',
    });

    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: this.config.corsOrigins,
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      this.logger.warn('API server already started');
      return;
    }

    this.logger.info('Starting Transparency API Server', {
      port: this.config.port,
      host: this.config.host,
      environment: this.config.environment
    });

    // Initialize transparency system
    await this.config.transparencySystem.initialize({
      enableRealTimeMonitoring: true,
      enableEventStreaming: true,
      metricsUpdateIntervalMs: 5000,
      heartbeatIntervalMs: 10000
    });

    await this.config.transparencySystem.startMonitoring();

    // Start HTTP server
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, (err?: Error) => {
        if (err) {
          this.logger.error('Failed to start API server', err);
          reject(err);
          return;
        }

        this.isStarted = true;
        this.logger.info('Transparency API Server started successfully', {
          url: `http://${this.config.host}:${this.config.port}`,
          environment: this.config.environment,
          nodeVersion: process.version
        });

        resolve();
      });
    });
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info('Stopping Transparency API Server');

    // Stop transparency system
    await this.config.transparencySystem.stopMonitoring();
    await this.config.transparencySystem.cleanup();

    // Close WebSocket connections
    this.io.close();

    // Close HTTP server
    return new Promise((resolve) => {
      this.server.close(() => {
        this.isStarted = false;
        this.logger.info('Transparency API Server stopped');
        resolve();
      });
    });
  }

  /**
   * Get Express app instance (for testing)
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Get Socket.IO server instance
   */
  getSocketIOServer(): SocketIOServer {
    return this.io;
  }

  /**
   * Get server configuration
   */
  getConfig(): ApiServerConfig {
    return { ...this.config };
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true,
      preflightContinue: false,
      optionsSuccessStatus: 204
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(requestLogger(this.logger));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: this.config.rateLimitWindowMs,
      message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api', limiter);

    // Cache middleware for GET requests
    this.app.use('/api', cacheMiddleware(this.dataCache));

    // Authentication middleware (optional for public endpoints)
    this.app.use('/api/v1', authMiddleware(this.config));
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    if (this.config.enableHealthCheck) {
      this.app.get('/health', (req: Request, res: Response) => {
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0',
          environment: this.config.environment
        });
      });
    }

    // API documentation
    if (this.config.enableApiDocs) {
      this.app.get('/api', (req: Request, res: Response) => {
        res.json({
          name: 'Transparency API Server',
          version: '1.0.0',
          description: 'REST API for agent transparency system monitoring',
          endpoints: {
            hierarchy: '/api/v1/hierarchy',
            status: '/api/v1/status',
            events: '/api/v1/events',
            metrics: '/api/v1/metrics',
            analytics: '/api/v1/analytics',
            system: '/api/v1/system'
          },
          websocket: '/socket.io',
          documentation: '/api/docs'
        });
      });
    }

    // API version 1 routes
    this.app.use('/api/v1/hierarchy', hierarchyRoutes(this.config.transparencySystem, this.logger));
    this.app.use('/api/v1/status', statusRoutes(this.config.transparencySystem, this.logger));
    this.app.use('/api/v1/events', eventsRoutes(this.config.transparencySystem, this.logger));
    this.app.use('/api/v1/metrics', metricsRoutes(this.config.transparencySystem, this.logger));
    this.app.use('/api/v1/analytics', analyticsRoutes(this.config.transparencySystem, this.logger));
    this.app.use('/api/v1/system', systemRoutes(this.config, this.logger));

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Setup WebSocket server for real-time updates
   */
  private setupWebSocket(): void {
    this.logger.info('Setting up WebSocket server for real-time updates');

    // WebSocket authentication
    if (this.config.enableWebSocketAuth) {
      this.io.use(async (socket, next) => {
        try {
          const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

          if (!token) {
            return next(new Error('Authentication required'));
          }

          // Validate token (implement your token validation logic)
          // For now, we'll accept any non-empty token
          if (token.length > 0) {
            socket.data.userId = 'user-' + uuidv4().slice(0, 8);
            next();
          } else {
            next(new Error('Invalid token'));
          }
        } catch (error) {
          next(new Error('Authentication failed'));
        }
      });
    }

    // Handle WebSocket connections
    this.io.on('connection', (socket) => {
      this.logger.info('WebSocket client connected', {
        socketId: socket.id,
        userId: socket.data.userId
      });

      // Join rooms based on subscriptions
      socket.on('subscribe', (data: { channels: string[] }) => {
        const { channels } = data;

        if (Array.isArray(channels)) {
          channels.forEach(channel => {
            socket.join(channel);
            this.logger.debug('Client subscribed to channel', {
              socketId: socket.id,
              channel
            });
          });
        }
      });

      // Unsubscribe from channels
      socket.on('unsubscribe', (data: { channels: string[] }) => {
        const { channels } = data;

        if (Array.isArray(channels)) {
          channels.forEach(channel => {
            socket.leave(channel);
            this.logger.debug('Client unsubscribed from channel', {
              socketId: socket.id,
              channel
            });
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          reason
        });
      });
    });

    // Register transparency system event listeners for real-time updates
    this.setupTransparencyEventListeners();
  }

  /**
   * Setup transparency system event listeners for WebSocket broadcasts
   */
  private setupTransparencyEventListeners(): void {
    const transparency = this.config.transparencySystem;

    // Agent state changes
    transparency.on('agentStateChanged', (data) => {
      this.io.to('agent-status').emit('agentStateChange', {
        type: 'agent_state_change',
        data,
        timestamp: new Date().toISOString()
      });
    });

    // Agent hierarchy changes
    transparency.on('hierarchyChange', (data) => {
      this.io.to('hierarchy').emit('hierarchyChange', {
        type: 'hierarchy_change',
        data,
        timestamp: new Date().toISOString()
      });
    });

    // Lifecycle events
    transparency.on('lifecycleEvent', (data) => {
      this.io.to('events').emit('lifecycleEvent', {
        type: 'lifecycle_event',
        data,
        timestamp: new Date().toISOString()
      });
    });

    // Metrics updates
    transparency.on('metricsUpdate', (data) => {
      this.io.to('metrics').emit('metricsUpdate', {
        type: 'metrics_update',
        data,
        timestamp: new Date().toISOString()
      });
    });

    // Performance alerts
    transparency.on('performanceAlert', (data) => {
      this.io.to('alerts').emit('performanceAlert', {
        type: 'performance_alert',
        data,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // Global error handler
    this.app.use(errorHandler(this.logger));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Promise Rejection', { reason, promise });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception', error);
      process.exit(1);
    });
  }

  /**
   * Get cached data or fetch and cache new data
   */
  private async getCachedData<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 5000
  ): Promise<T> {
    const cached = this.dataCache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < cached.ttl) {
      return cached.data as T;
    }

    const data = await fetchFn();
    this.dataCache.set(key, {
      data,
      timestamp: now,
      ttl
    });

    return data;
  }

  /**
   * Clear cache for specific key or all cache
   */
  private clearCache(key?: string): void {
    if (key) {
      this.dataCache.delete(key);
    } else {
      this.dataCache.clear();
    }
  }
}

/**
 * Create and start API server with default configuration
 */
export async function createApiServer(
  config?: Partial<ApiServerConfig>
): Promise<TransparencyApiServer> {
  const server = new TransparencyApiServer(config);
  await server.start();
  return server;
}

/**
 * Default export
 */
export default TransparencyApiServer;