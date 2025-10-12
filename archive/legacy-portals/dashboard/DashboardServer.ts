/**
 * Fleet Dashboard Server
 * Standalone server for real-time fleet monitoring
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { MetricsCollector } from '../../monitor/collectors/metrics-collector.js';
import { AlertManager } from '../../monitor/alerts/alert-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DashboardServerConfig {
  /** Server port (default: 3001) */
  port?: number;
  /** Enable CORS (default: true) */
  cors?: boolean;
  /** CORS origin (default: '*') */
  corsOrigin?: string;
  /** Metrics collection interval in ms (default: 1000) */
  metricsInterval?: number;
  /** Enable authentication (default: false) */
  enableAuth?: boolean;
  /** Authentication tokens */
  authTokens?: string[];
  /** Enable security headers (default: true) */
  securityHeaders?: boolean;
  /** Serve static files from directory */
  staticDir?: string;
}

/**
 * Fleet Dashboard Server
 * Provides real-time metrics API and WebSocket server
 */
export class DashboardServer {
  private app: Express;
  private httpServer: HTTPServer;
  private io: SocketIOServer;
  private metricsCollector: MetricsCollector;
  private alertManager: AlertManager;
  private config: Required<DashboardServerConfig>;
  private metricsTimer: NodeJS.Timeout | null = null;
  private connectedClients: Set<any> = new Set();

  constructor(config: DashboardServerConfig = {}) {
    this.config = {
      port: config.port || 3001,
      cors: config.cors !== false,
      corsOrigin: config.corsOrigin || '*',
      metricsInterval: config.metricsInterval || 1000,
      enableAuth: config.enableAuth || false,
      authTokens: config.authTokens || [],
      securityHeaders: config.securityHeaders !== false,
      staticDir: config.staticDir || path.join(__dirname, 'components')
    };

    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: this.config.cors
        ? {
            origin: this.config.corsOrigin,
            methods: ['GET', 'POST']
          }
        : undefined
    });

    this.metricsCollector = new MetricsCollector();
    this.alertManager = new AlertManager();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    if (this.config.cors) {
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        res.header('Access-Control-Allow-Origin', this.config.corsOrigin);
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header(
          'Access-Control-Allow-Headers',
          'Origin, X-Requested-With, Content-Type, Accept, Authorization'
        );
        next();
      });
    }

    // Security headers
    if (this.config.securityHeaders) {
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        res.header('X-Content-Type-Options', 'nosniff');
        res.header('X-Frame-Options', 'DENY');
        res.header('X-XSS-Protection', '1; mode=block');
        res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        next();
      });
    }

    // Authentication middleware
    if (this.config.enableAuth) {
      this.app.use('/api/*', (req: Request, res: Response, next: NextFunction) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token || !this.config.authTokens.includes(token)) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
      });
    }

    // Static files
    if (this.config.staticDir) {
      this.app.use(express.static(this.config.staticDir));
    }

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        connectedClients: this.connectedClients.size
      });
    });

    // Get latest metrics
    this.app.get('/api/metrics', async (req: Request, res: Response) => {
      try {
        const metrics = await this.metricsCollector.getLatestMetrics();
        res.json(metrics);
      } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
      }
    });

    // Get swarm metrics
    this.app.get('/api/swarms', async (req: Request, res: Response) => {
      try {
        const swarms = await this.metricsCollector.getSwarmMetrics();
        res.json(swarms);
      } catch (error) {
        console.error('Error fetching swarm metrics:', error);
        res.status(500).json({ error: 'Failed to fetch swarm metrics' });
      }
    });

    // Get alerts
    this.app.get('/api/alerts', (req: Request, res: Response) => {
      try {
        const alerts = this.alertManager.getActiveAlerts();
        res.json(alerts);
      } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
      }
    });

    // Acknowledge alert
    this.app.post('/api/alerts/:id/acknowledge', (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const result = this.alertManager.acknowledgeAlert(id);
        res.json({ success: result });
      } catch (error) {
        console.error('Error acknowledging alert:', error);
        res.status(500).json({ error: 'Failed to acknowledge alert' });
      }
    });

    // Error handling
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Server error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: err.message
      });
    });
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocket(): void {
    this.io.on('connection', (socket: any) => {
      console.log(`Client connected: ${socket.id}`);
      this.connectedClients.add(socket);

      // Send initial metrics
      this.sendMetricsToClient(socket);

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket);
      });

      socket.on('refresh', () => {
        this.sendMetricsToClient(socket);
      });

      socket.on('subscribe', (channels: string[]) => {
        channels.forEach(channel => {
          socket.join(channel);
        });
      });
    });
  }

  /**
   * Send metrics to specific client
   */
  private async sendMetricsToClient(socket: any): Promise<void> {
    try {
      const metrics = await this.metricsCollector.getLatestMetrics();
      socket.emit('metrics', metrics);
    } catch (error) {
      console.error('Failed to send metrics to client:', error);
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    console.log('Starting real-time metrics collection...');

    this.metricsTimer = setInterval(async () => {
      try {
        // Collect metrics
        const metrics = await this.metricsCollector.collectMetrics();

        // Broadcast to all connected clients
        this.io.emit('metrics', metrics);

        // Check for alerts
        const alerts = this.alertManager.checkMetrics(metrics);
        alerts.forEach(alert => {
          this.io.emit('alert', alert);
        });
      } catch (error) {
        console.error('Error in metrics collection:', error);
      }
    }, this.config.metricsInterval);
  }

  /**
   * Stop metrics collection
   */
  private stopMetricsCollection(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  /**
   * Start the server
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        console.log(`\n🚀 Fleet Dashboard Server started`);
        console.log(`📊 Dashboard URL: http://localhost:${this.config.port}`);
        console.log(`🔌 WebSocket: ws://localhost:${this.config.port}`);
        console.log(`⚡ Metrics interval: ${this.config.metricsInterval}ms`);
        console.log(`🔒 Authentication: ${this.config.enableAuth ? 'Enabled' : 'Disabled'}\n`);

        this.startMetricsCollection();
        resolve();
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.stop());
      process.on('SIGINT', () => this.stop());
    });
  }

  /**
   * Stop the server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      console.log('\nShutting down gracefully...');

      this.stopMetricsCollection();

      this.httpServer.close(() => {
        console.log('Server closed');
        resolve();
        process.exit(0);
      });
    });
  }

  /**
   * Get server configuration
   */
  getConfig(): DashboardServerConfig {
    return { ...this.config };
  }

  /**
   * Get metrics collector instance
   */
  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  /**
   * Get alert manager instance
   */
  getAlertManager(): AlertManager {
    return this.alertManager;
  }
}

/**
 * Create and start a dashboard server
 */
export async function createDashboardServer(
  config?: DashboardServerConfig
): Promise<DashboardServer> {
  const server = new DashboardServer(config);
  await server.start();
  return server;
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.PORT || '3001', 10);
  const server = new DashboardServer({ port });
  server.start();
}

export default DashboardServer;
