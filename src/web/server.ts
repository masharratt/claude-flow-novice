/**
 * Claude Flow Personal - Transparent Web Portal Server
 * Real-time agent message display with human intervention capabilities
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { SwarmMessageRouter } from './messaging/swarm-message-router.js';
import { HumanInterventionSystem } from './messaging/human-intervention-system.js';
import { TransparencyLogger } from './messaging/transparency-logger.js';
import { MessageFilter } from './messaging/message-filter.js';
import { AgentStatusTracker } from './messaging/agent-status-tracker.js';
import { WebSocketManager } from './websocket/websocket-manager.js';
import { ILogger } from '../core/logger.js';
import { ConfigManager } from '../config/config-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WebPortalConfig {
  port: number;
  host: string;
  enableCors: boolean;
  corsOrigins: string[];
  staticPath?: string;
  maxMessageHistory: number;
  enableAuth: boolean;
  authSecret?: string;
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    logToFile: boolean;
    logPath?: string;
  };
}

export class WebPortalServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private messageRouter: SwarmMessageRouter;
  private interventionSystem: HumanInterventionSystem;
  private transparencyLogger: TransparencyLogger;
  private messageFilter: MessageFilter;
  private statusTracker: AgentStatusTracker;
  private wsManager: WebSocketManager;

  constructor(
    private config: WebPortalConfig,
    private logger: ILogger,
    private configManager: ConfigManager
  ) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: this.config.corsOrigins || ["*"],
        methods: ["GET", "POST"]
      }
    });

    this.initializeComponents();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private initializeComponents(): void {
    this.messageRouter = new SwarmMessageRouter(this.logger);
    this.interventionSystem = new HumanInterventionSystem(this.logger);
    this.transparencyLogger = new TransparencyLogger(this.config.logging, this.logger);
    this.messageFilter = new MessageFilter();
    this.statusTracker = new AgentStatusTracker(this.logger);
    this.wsManager = new WebSocketManager(this.io, this.logger);
  }

  private setupMiddleware(): void {
    // CORS
    if (this.config.enableCors) {
      this.app.use(cors({
        origin: this.config.corsOrigins || ["*"],
        credentials: true
      }));
    }

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.debug('HTTP Request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // Static files
    const staticPath = this.config.staticPath || path.join(__dirname, 'public');
    this.app.use(express.static(staticPath));

    // Error handling
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Express error', { error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Agent messages API
    this.app.get('/api/messages', async (req, res) => {
      try {
        const { swarmId, agentId, messageType, limit, offset } = req.query;
        const messages = await this.messageRouter.getMessages({
          swarmId: swarmId as string,
          agentId: agentId as string,
          messageType: messageType as string,
          limit: parseInt(limit as string) || 100,
          offset: parseInt(offset as string) || 0
        });
        res.json({ messages, total: messages.length });
      } catch (error) {
        this.logger.error('Error fetching messages', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
      }
    });

    // Send human intervention message
    this.app.post('/api/intervention', async (req, res) => {
      try {
        const { swarmId, agentId, message, action } = req.body;

        if (!swarmId || !message) {
          return res.status(400).json({ error: 'swarmId and message are required' });
        }

        const interventionId = await this.interventionSystem.sendIntervention({
          swarmId,
          agentId,
          message,
          action: action || 'redirect',
          timestamp: new Date().toISOString(),
          userId: req.ip // Simple user identification
        });

        res.json({ interventionId, status: 'sent' });
      } catch (error) {
        this.logger.error('Error sending intervention', error);
        res.status(500).json({ error: 'Failed to send intervention' });
      }
    });

    // Get agent status
    this.app.get('/api/agents/status', async (req, res) => {
      try {
        const { swarmId } = req.query;
        const status = await this.statusTracker.getSwarmStatus(swarmId as string);
        res.json(status);
      } catch (error) {
        this.logger.error('Error fetching agent status', error);
        res.status(500).json({ error: 'Failed to fetch agent status' });
      }
    });

    // Get message statistics
    this.app.get('/api/stats', async (req, res) => {
      try {
        const { swarmId, timeRange } = req.query;
        const stats = await this.transparencyLogger.getMessageStats(
          swarmId as string,
          timeRange as string
        );
        res.json(stats);
      } catch (error) {
        this.logger.error('Error fetching stats', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
      }
    });

    // Serve React app
    this.app.get('*', (req, res) => {
      const staticPath = this.config.staticPath || path.join(__dirname, 'public');
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      this.logger.info('Client connected', { socketId: socket.id });

      // Handle room joining (for swarm-specific updates)
      socket.on('join-swarm', (swarmId: string) => {
        socket.join(`swarm-${swarmId}`);
        this.logger.debug('Client joined swarm room', { socketId: socket.id, swarmId });
      });

      // Handle leaving swarm rooms
      socket.on('leave-swarm', (swarmId: string) => {
        socket.leave(`swarm-${swarmId}`);
        this.logger.debug('Client left swarm room', { socketId: socket.id, swarmId });
      });

      // Handle message filtering preferences
      socket.on('set-filter', (filterConfig: any) => {
        this.messageFilter.setUserFilter(socket.id, filterConfig);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.logger.info('Client disconnected', { socketId: socket.id });
        this.messageFilter.removeUserFilter(socket.id);
      });
    });

    // Set up message broadcasting
    this.setupMessageBroadcasting();
  }

  private setupMessageBroadcasting(): void {
    // Agent messages
    this.messageRouter.on('message', (data) => {
      const filteredData = this.messageFilter.filterMessage(data);

      // Broadcast to all clients in the swarm room
      this.io.to(`swarm-${data.swarmId}`).emit('agent-message', filteredData);

      // Log for transparency
      this.transparencyLogger.logMessage(data);
    });

    // Agent status updates
    this.statusTracker.on('status-change', (data) => {
      this.io.to(`swarm-${data.swarmId}`).emit('agent-status', data);
    });

    // Human interventions
    this.interventionSystem.on('intervention-sent', (data) => {
      this.io.to(`swarm-${data.swarmId}`).emit('human-intervention', data);
    });

    // Transparency insights
    this.transparencyLogger.on('insight', (data) => {
      this.io.to(`swarm-${data.swarmId}`).emit('transparency-insight', data);
    });
  }

  /**
   * Connect to swarm coordination system
   */
  public connectToSwarmSystem(coordinator: any): void {
    // Hook into the existing swarm coordinator
    coordinator.on('agent-message', (message: any) => {
      this.messageRouter.handleAgentMessage(message);
    });

    coordinator.on('agent-status-change', (status: any) => {
      this.statusTracker.updateAgentStatus(status);
    });

    coordinator.on('task-progress', (progress: any) => {
      this.transparencyLogger.logTaskProgress(progress);
    });

    // Set up intervention handling
    this.interventionSystem.on('intervention', (intervention: any) => {
      coordinator.sendHumanMessage(intervention);
    });
  }

  /**
   * Start the web portal server
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, (error?: Error) => {
        if (error) {
          this.logger.error('Failed to start web portal server', error);
          reject(error);
        } else {
          this.logger.info('Web portal server started', {
            host: this.config.host,
            port: this.config.port,
            url: `http://${this.config.host}:${this.config.port}`
          });
          resolve();
        }
      });
    });
  }

  /**
   * Stop the web portal server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('Web portal server stopped');
        resolve();
      });
    });
  }

  /**
   * Get server metrics
   */
  public getMetrics() {
    return {
      connectedClients: this.io.engine.clientsCount,
      totalMessages: this.messageRouter.getMessageCount(),
      activeSwarms: this.statusTracker.getActiveSwarmCount(),
      interventions: this.interventionSystem.getInterventionCount(),
      uptime: process.uptime()
    };
  }
}