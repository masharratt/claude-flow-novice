/**
 * Claude Flow Personal Web Portal Server
 * Main server entry point with MCP integration and real-time WebSocket support
 */

import express, { Express, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs/promises';
import { WebPortalConfig, loadConfig } from '../config/web-portal-config.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface MCPConnection {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  lastPing?: Date;
  capabilities?: string[];
}

export interface SwarmMetrics {
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  memoryUsage: number;
  cpuUsage: number;
  networkLatency: number;
}

export class WebPortalServer {
  private app: Express;
  private server: HTTPServer;
  private io: SocketIOServer;
  private config: WebPortalConfig;
  private mcpConnections: Map<string, MCPConnection> = new Map();
  private swarmMetrics: SwarmMetrics = {
    activeAgents: 0,
    totalTasks: 0,
    completedTasks: 0,
    memoryUsage: 0,
    cpuUsage: 0,
    networkLatency: 0
  };

  constructor(config?: WebPortalConfig) {
    this.config = config || loadConfig();
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: this.config.cors.allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'", `ws://localhost:${this.config.server.port}`, `wss://localhost:${this.config.server.port}`]
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.cors.allowedOrigins,
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: this.config.security.rateLimit.maxRequests,
      message: 'Too many requests from this IP, please try again later.'
    });
    this.app.use('/api/', limiter);

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static files
    if (this.config.frontend.staticPath) {
      this.app.use(express.static(this.config.frontend.staticPath));
    }
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        mcpConnections: Array.from(this.mcpConnections.entries()).map(([name, conn]) => ({
          name,
          status: conn.status,
          lastPing: conn.lastPing
        }))
      });
    });

    // MCP status endpoint
    this.app.get('/api/mcp/status', (req: Request, res: Response) => {
      res.json({
        connections: Array.from(this.mcpConnections.entries()).map(([name, conn]) => ({
          name,
          status: conn.status,
          lastPing: conn.lastPing,
          capabilities: conn.capabilities || []
        }))
      });
    });

    // Swarm metrics endpoint
    this.app.get('/api/swarm/metrics', async (req: Request, res: Response) => {
      try {
        await this.updateSwarmMetrics();
        res.json(this.swarmMetrics);
      } catch (error) {
        console.error('Error fetching swarm metrics:', error);
        res.status(500).json({ error: 'Failed to fetch swarm metrics' });
      }
    });

    // Claude Flow commands endpoint
    this.app.post('/api/claude-flow/command', async (req: Request, res: Response) => {
      try {
        const { command, args = [] } = req.body;
        const result = await this.executeClaudeFlowCommand(command, args);
        res.json({ success: true, result });
      } catch (error) {
        console.error('Error executing Claude Flow command:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Ruv-Swarm commands endpoint
    this.app.post('/api/ruv-swarm/command', async (req: Request, res: Response) => {
      try {
        const { command, args = [] } = req.body;
        const result = await this.executeRuvSwarmCommand(command, args);
        res.json({ success: true, result });
      } catch (error) {
        console.error('Error executing Ruv-Swarm command:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // File management endpoints
    this.app.get('/api/files/list', async (req: Request, res: Response) => {
      try {
        const { path: dirPath = '.' } = req.query;
        const files = await this.listFiles(dirPath as string);
        res.json({ files });
      } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ error: 'Failed to list files' });
      }
    });

    // Serve React frontend
    this.app.get('*', (req: Request, res: Response) => {
      if (this.config.frontend.staticPath) {
        const indexPath = path.join(this.config.frontend.staticPath, 'index.html');
        res.sendFile(indexPath);
      } else {
        res.status(404).json({ error: 'Frontend not configured' });
      }
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Send initial state
      socket.emit('mcp-status', Array.from(this.mcpConnections.entries()));
      socket.emit('swarm-metrics', this.swarmMetrics);

      // Handle client requests
      socket.on('request-mcp-status', () => {
        socket.emit('mcp-status', Array.from(this.mcpConnections.entries()));
      });

      socket.on('request-swarm-metrics', async () => {
        try {
          await this.updateSwarmMetrics();
          socket.emit('swarm-metrics', this.swarmMetrics);
        } catch (error) {
          socket.emit('error', { message: 'Failed to fetch swarm metrics' });
        }
      });

      socket.on('execute-command', async (data: { service: 'claude-flow' | 'ruv-swarm', command: string, args?: any[] }) => {
        try {
          let result;
          if (data.service === 'claude-flow') {
            result = await this.executeClaudeFlowCommand(data.command, data.args || []);
          } else {
            result = await this.executeRuvSwarmCommand(data.command, data.args || []);
          }
          socket.emit('command-result', { success: true, result });
        } catch (error) {
          socket.emit('command-result', {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });

    // Broadcast updates periodically
    setInterval(async () => {
      try {
        await this.updateSwarmMetrics();
        await this.checkMCPConnections();
        this.io.emit('swarm-metrics', this.swarmMetrics);
        this.io.emit('mcp-status', Array.from(this.mcpConnections.entries()));
      } catch (error) {
        console.error('Error broadcasting updates:', error);
      }
    }, this.config.websocket.updateInterval);
  }

  private async executeClaudeFlowCommand(command: string, args: any[]): Promise<any> {
    const cmdString = `npx claude-flow@alpha ${command} ${args.join(' ')}`;
    console.log(`Executing Claude Flow command: ${cmdString}`);

    try {
      const { stdout, stderr } = await execAsync(cmdString, {
        timeout: 30000,
        cwd: process.cwd()
      });

      if (stderr && !stderr.includes('INFO') && !stderr.includes('WARN')) {
        throw new Error(stderr);
      }

      return { output: stdout, command: cmdString };
    } catch (error) {
      console.error(`Claude Flow command failed: ${error}`);
      throw error;
    }
  }

  private async executeRuvSwarmCommand(command: string, args: any[]): Promise<any> {
    const cmdString = `npx ruv-swarm ${command} ${args.join(' ')}`;
    console.log(`Executing Ruv-Swarm command: ${cmdString}`);

    try {
      const { stdout, stderr } = await execAsync(cmdString, {
        timeout: 30000,
        cwd: process.cwd()
      });

      if (stderr && !stderr.includes('INFO') && !stderr.includes('WARN')) {
        throw new Error(stderr);
      }

      return { output: stdout, command: cmdString };
    } catch (error) {
      console.error(`Ruv-Swarm command failed: ${error}`);
      throw error;
    }
  }

  private async updateSwarmMetrics(): Promise<void> {
    try {
      // Get Claude Flow metrics
      const cfMetrics = await this.executeClaudeFlowCommand('swarm status', []);

      // Get Ruv-Swarm metrics if available
      let rsMetrics;
      try {
        rsMetrics = await this.executeRuvSwarmCommand('status', []);
      } catch (error) {
        // Ruv-Swarm might not be available
        console.log('Ruv-Swarm not available for metrics');
      }

      // Parse and update metrics
      this.swarmMetrics = {
        activeAgents: this.parseActiveAgents(cfMetrics.output),
        totalTasks: this.parseTotalTasks(cfMetrics.output),
        completedTasks: this.parseCompletedTasks(cfMetrics.output),
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        cpuUsage: process.cpuUsage().user / 1000000,
        networkLatency: Date.now() % 100 // Placeholder
      };
    } catch (error) {
      console.error('Error updating swarm metrics:', error);
    }
  }

  private async checkMCPConnections(): Promise<void> {
    const connections = ['claude-flow', 'ruv-swarm'];

    for (const conn of connections) {
      try {
        // Test connection with a simple command
        const result = conn === 'claude-flow'
          ? await this.executeClaudeFlowCommand('--version', [])
          : await this.executeRuvSwarmCommand('--version', []);

        this.mcpConnections.set(conn, {
          name: conn,
          status: 'connected',
          lastPing: new Date(),
          capabilities: this.parseCapabilities(result.output)
        });
      } catch (error) {
        this.mcpConnections.set(conn, {
          name: conn,
          status: 'error',
          lastPing: new Date()
        });
      }
    }
  }

  private parseActiveAgents(output: string): number {
    const match = output.match(/(\d+)\s+active\s+agents?/i);
    return match ? parseInt(match[1]) : 0;
  }

  private parseTotalTasks(output: string): number {
    const match = output.match(/(\d+)\s+total\s+tasks?/i);
    return match ? parseInt(match[1]) : 0;
  }

  private parseCompletedTasks(output: string): number {
    const match = output.match(/(\d+)\s+completed\s+tasks?/i);
    return match ? parseInt(match[1]) : 0;
  }

  private parseCapabilities(output: string): string[] {
    // Basic capability parsing - extend as needed
    const capabilities = [];
    if (output.includes('swarm')) capabilities.push('swarm-coordination');
    if (output.includes('agent')) capabilities.push('agent-management');
    if (output.includes('task')) capabilities.push('task-orchestration');
    return capabilities;
  }

  private async listFiles(dirPath: string): Promise<any[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, entry.name)
      }));
    } catch (error) {
      throw new Error(`Failed to list files in ${dirPath}: ${error}`);
    }
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.server.port, this.config.server.host, async () => {
        console.log(`🚀 Claude Flow Personal Web Portal started`);
        console.log(`📡 Server: http://${this.config.server.host}:${this.config.server.port}`);
        console.log(`🔌 WebSocket: ws://${this.config.server.host}:${this.config.server.port}`);

        // Initialize MCP connections
        await this.checkMCPConnections();
        console.log(`🔗 MCP connections initialized`);

        resolve();
      });

      this.server.on('error', (error) => {
        console.error('Server error:', error);
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('🛑 Web Portal Server stopped');
        resolve();
      });
    });
  }

  public getApp(): Express {
    return this.app;
  }

  public getServer(): HTTPServer {
    return this.server;
  }

  public getIO(): SocketIOServer {
    return this.io;
  }
}

// Export for use as module
export default WebPortalServer;

// CLI entry point
if (require.main === module) {
  const server = new WebPortalServer();

  server.start().catch((error) => {
    console.error('Failed to start web portal:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}