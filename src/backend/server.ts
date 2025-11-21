/**
 * Backend Server Application
 *
 * Production-ready Express server with comprehensive API endpoints,
 * middleware, error handling, and monitoring capabilities.
 *
 * Features:
 * - RESTful API endpoints for task and agent management
 * - Real-time progress tracking via WebSocket
 * - Comprehensive health checks
 * - Authentication and authorization middleware
 * - Rate limiting and request validation
 * - Structured logging and error handling
 * - Database integration with connection pooling
 * - Redis coordination for CFN Loop workflows
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';

// Import API routes
import { createHealthEndpoints } from '../api/health-endpoints.js';
import { createTaskEndpoints } from '../api/task-endpoints.js';
import { createProgressEndpoints } from '../api/progress-endpoints.js';
import { createAgentEndpoints } from '../api/agent-endpoints.js';

// Import middleware
import { authenticationMiddleware } from '../middleware/authentication.js';
import { authorizationMiddleware } from '../middleware/authorization.js';
import { requestValidationMiddleware } from '../middleware/request-validation.js';
import { errorHandlingMiddleware } from '../middleware/error-handling.js';
import { loggingMiddleware } from '../middleware/logging.js';
import { rateLimitingMiddleware } from '../middleware/rate-limiting.js';

// Import services
import { getDatabaseService } from '../../lib/database-service.js';
import { RedisQueueManager } from '../../lib/redis-queue-manager.js';
import { WebSocketManager } from './websocket-manager.js';
import { TaskManager } from './task-manager.js';
import { AgentManager } from './agent-manager.js';

// Import configuration and types
import { ServerConfig, AppConfig } from '../types/server-config.js';
import { StandardError, ErrorCode } from '../../lib/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Backend server class that encapsulates all server functionality
 */
export class BackendServer {
  private app: Application;
  private server: http.Server;
  private io: SocketIOServer;
  private config: AppConfig;
  private wsManager: WebSocketManager;
  private taskManager: TaskManager;
  private agentManager: AgentManager;
  private redisManager: RedisQueueManager | null = null;

  constructor(config?: Partial<ServerConfig>) {
    // Initialize configuration
    this.config = this.initializeConfig(config);
    
    // Initialize Express app
    this.app = express();
    this.server = http.createServer(this.app);
    
    // Initialize Socket.IO
    this.io = new SocketIOServer(this.server, {
      cors: this.config.socketIO.cors,
      transports: ['websocket', 'polling'],
    });

    // Initialize managers
    this.wsManager = new WebSocketManager(this.io);
    this.taskManager = new TaskManager(this.wsManager);
    this.agentManager = new AgentManager(this.wsManager);

    // Initialize Redis manager
    this.initializeRedisManager();

    // Setup server
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupWebSocket();
  }

  /**
   * Initialize server configuration with defaults
   */
  private initializeConfig(config?: Partial<ServerConfig>): AppConfig {
    const defaultConfig: ServerConfig = {
      port: parseInt(process.env.PORT || '3001', 10),
      host: process.env.HOST || '0.0.0.0',
      env: process.env.NODE_ENV || 'development',
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'cfn_loop',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0', 10),
      },
      auth: {
        jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
        jwtExpiration: process.env.JWT_EXPIRATION || '24h',
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
        message: 'Too many requests from this IP',
      },
      socketIO: {
        cors: {
          origin: process.env.CORS_ORIGIN || '*',
          methods: ['GET', 'POST'],
          credentials: true,
        },
      },
    };

    return { ...defaultConfig, ...config };
  }

  /**
   * Initialize Redis manager for coordination
   */
  private initializeRedisManager(): void {
    try {
      this.redisManager = new RedisQueueManager();
      logger.info('Redis manager initialized successfully');
    } catch (error) {
      logger.warn('Redis manager initialization failed:', error);
      // Continue without Redis - some features may be limited
    }
  }

  /**
   * Setup all middleware
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
        },
      },
    }));

    // CORS middleware
    this.app.use(cors({
      origin: this.config.env === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') || []
        : '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Compression middleware
    this.app.use(compression());

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging middleware
    this.app.use(morgan('combined', {
      stream: {
        write: (message: string) => {
          logger.info(message.trim());
        },
      },
    }));

    // Custom logging middleware
    this.app.use(loggingMiddleware);

    // Rate limiting
    this.app.use(rateLimitingMiddleware(this.config.rateLimit));

    // Request ID middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
      res.setHeader('X-Request-ID', req.headers['x-request-id']);
      next();
    });

    // Request validation middleware
    this.app.use(requestValidationMiddleware);

    // Authentication middleware (optional for public endpoints)
    this.app.use('/api', authenticationMiddleware(this.config.auth));
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check endpoints (public)
    const healthEndpoints = createHealthEndpoints();
    this.app.use('/health', healthEndpoints.getRouter());

    // API versioning
    const apiRouter = express.Router();

    // Task management endpoints
    const taskEndpoints = createTaskEndpoints(this.taskManager);
    apiRouter.use('/tasks', taskEndpoints.getRouter());

    // Progress tracking endpoints
    const progressEndpoints = createProgressEndpoints(this.taskManager);
    apiRouter.use('/progress', progressEndpoints.getRouter());

    // Agent management endpoints
    const agentEndpoints = createAgentEndpoints(this.agentManager);
    apiRouter.use('/agents', agentEndpoints.getRouter());

    // Apply authorization middleware to protected routes
    apiRouter.use('/tasks', authorizationMiddleware(['user', 'admin']));
    apiRouter.use('/agents', authorizationMiddleware(['admin']));

    // Mount API routes
    this.app.use('/api/v1', apiRouter);

    // API documentation endpoint
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        name: 'CFN Loop Backend API',
        version: '1.0.0',
        description: 'Backend API for CFN Loop agent orchestration system',
        endpoints: {
          health: '/health',
          tasks: '/api/v1/tasks',
          progress: '/api/v1/progress',
          agents: '/api/v1/agents',
        },
        documentation: '/api/docs',
        version: '1.0.0',
      });
    });

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'CFN Loop Backend Server',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        environment: this.config.env,
      });
    });
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      });
    });

    // Global error handler
    this.app.use(errorHandlingMiddleware);
  }

  /**
   * Setup WebSocket handlers
   */
  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`);

      // Handle task subscriptions
      socket.on('subscribe-task', (taskId: string) => {
        this.wsManager.subscribeToTask(socket, taskId);
      });

      socket.on('unsubscribe-task', (taskId: string) => {
        this.wsManager.unsubscribeFromTask(socket, taskId);
      });

      // Handle agent subscriptions
      socket.on('subscribe-agent', (agentId: string) => {
        this.wsManager.subscribeToAgent(socket, agentId);
      });

      socket.on('unsubscribe-agent', (agentId: string) => {
        this.wsManager.unsubscribeFromAgent(socket, agentId);
      });

      // Handle disconnection
      socket.on('disconnect', (reason: string) => {
        logger.info(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`);
        this.wsManager.handleDisconnection(socket);
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        logger.error(`WebSocket error for client ${socket.id}:`, error);
      });
    });
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Test database connection
      const db = getDatabaseService();
      await db.query('SELECT 1');
      logger.info('Database connection verified');

      // Start HTTP server
      this.server.listen(this.config.port, this.config.host, () => {
        logger.info(`Backend server started on ${this.config.host}:${this.config.port}`);
        logger.info(`Environment: ${this.config.env}`);
        logger.info(`API endpoints: http://${this.config.host}:${this.config.port}/api/v1`);
        logger.info(`Health checks: http://${this.config.host}:${this.config.port}/health`);
        logger.info(`WebSocket server ready`);
      });

      // Handle server errors
      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${this.config.port} is already in use`);
        } else {
          logger.error('Server error:', error);
        }
        throw error;
      });

    } catch (error) {
      logger.error('Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  public async stop(): Promise<void> {
    logger.info('Starting graceful shutdown...');

    // Stop accepting new connections
    this.server.close(async (err) => {
      if (err) {
        logger.error('Error during server shutdown:', err);
      } else {
        logger.info('HTTP server closed');
      }

      // Close WebSocket connections
      this.io.close(() => {
        logger.info('WebSocket server closed');
      });

      // Close Redis connections
      if (this.redisManager) {
        try {
          await this.redisManager.disconnect();
          logger.info('Redis connections closed');
        } catch (error) {
          logger.error('Error closing Redis connections:', error);
        }
      }

      // Close database connections
      try {
        const db = getDatabaseService();
        await db.close();
        logger.info('Database connections closed');
      } catch (error) {
        logger.error('Error closing database connections:', error);
      }

      logger.info('Graceful shutdown completed');
    });
  }

  /**
   * Get server instance
   */
  public getServer(): http.Server {
    return this.server;
  }

  /**
   * Get Express app instance
   */
  public getApp(): Application {
    return this.app;
  }

  /**
   * Get Socket.IO instance
   */
  public getIO(): SocketIOServer {
    return this.io;
  }

  /**
   * Get configuration
   */
  public getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Get managers
   */
  public getManagers() {
    return {
      taskManager: this.taskManager,
      agentManager: this.agentManager,
      wsManager: this.wsManager,
      redisManager: this.redisManager,
    };
  }
}

/**
 * Create and configure a backend server instance
 */
export function createBackendServer(config?: Partial<ServerConfig>): BackendServer {
  return new BackendServer(config);
}

/**
 * Default export for backward compatibility
 */
export default BackendServer;