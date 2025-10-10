/**
 * Real-time Communication Server
 * Supports WebSocket, Server-Sent Events, and Custom Sync methods
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerConfig {
  port?: number;
  enableWebSocket?: boolean;
  enableSSE?: boolean;
  enableCustomSync?: boolean;
  corsOrigins?: string[];
  heartbeatInterval?: number;
  maxConnections?: number;
  enableCompression?: boolean;
  enableMetrics?: boolean;
}

export interface ClientConnection {
  id: string;
  protocol: 'websocket' | 'sse' | 'custom-sync';
  connected: boolean;
  lastPing: Date;
  messagesSent: number;
  messagesReceived: number;
  bytesTransferred: number;
  metadata: any;
}

export interface ServerMetrics {
  totalConnections: number;
  activeConnections: number;
  totalMessages: number;
  messagesPerSecond: number;
  bandwidthUsage: number;
  protocolDistribution: Record<string, number>;
  uptime: number;
  errors: number;
}

export class RealtimeServer {
  private app: express.Application;
  private server: any;
  private wsServer: WebSocketServer | null = null;
  private config: Required<ServerConfig>;
  private connections: Map<string, ClientConnection> = new Map();
  private sseClients: Map<string, any> = new Map();
  private metrics: ServerMetrics;
  private messageHistory: any[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private startTime: Date = new Date();

  constructor(config: ServerConfig = {}) {
    this.config = {
      port: config.port ?? 3001,
      enableWebSocket: config.enableWebSocket ?? true,
      enableSSE: config.enableSSE ?? true,
      enableCustomSync: config.enableCustomSync ?? true,
      corsOrigins: config.corsOrigins ?? ['*'],
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      maxConnections: config.maxConnections ?? 1000,
      enableCompression: config.enableCompression ?? true,
      enableMetrics: config.enableMetrics ?? true
    };

    this.app = express();
    this.server = createServer(this.app);

    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      totalMessages: 0,
      messagesPerSecond: 0,
      bandwidthUsage: 0,
      protocolDistribution: { websocket: 0, sse: 0, 'custom-sync': 0 },
      uptime: 0,
      errors: 0
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.startHeartbeat();
    this.startMetricsCollection();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS middleware
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (this.config.corsOrigins.includes('*') || (origin && this.config.corsOrigins.includes(origin))) {
        res.header('Access-Control-Allow-Origin', origin || '*');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
      res.header('Access-Control-Allow-Credentials', 'true');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: this.metrics.uptime,
        connections: this.metrics.activeConnections,
        protocols: this.config
      });
    });

    // Server metrics
    this.app.get('/api/metrics', (req, res) => {
      res.json(this.getMetrics());
    });

    // Protocol comparison endpoint
    this.app.get('/api/protocols/compare', (req, res) => {
      res.json({
        supported: {
          websocket: this.config.enableWebSocket,
          sse: this.config.enableSSE,
          'custom-sync': this.config.enableCustomSync
        },
        usage: this.metrics.protocolDistribution,
        recommendations: this.getProtocolRecommendations()
      });
    });

    // SSE endpoint
    if (this.config.enableSSE) {
      this.setupSSEEndpoint();
    }

    // Custom Sync endpoints
    if (this.config.enableCustomSync) {
      this.setupCustomSyncEndpoints();
    }

    // WebSocket benchmark endpoint
    this.app.get('/ws-benchmark', (req, res) => {
      res.status(200).json({
        message: 'WebSocket endpoint available',
        url: `ws://localhost:${this.config.port}/ws-benchmark`,
        timestamp: new Date().toISOString()
      });
    });

    // Static files for dashboard
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocket(): void {
    if (!this.config.enableWebSocket) return;

    this.wsServer = new WebSocketServer({
      server: this.server,
      path: '/ws',
      perMessageDeflate: this.config.enableCompression
    });

    this.wsServer.on('connection', (ws: WebSocket, req) => {
      this.handleWebSocketConnection(ws, req);
    });

    this.wsServer.on('error', (error) => {
      console.error('WebSocket server error:', error);
      this.metrics.errors++;
    });

    console.log(`🔌 WebSocket server enabled on path: /ws`);
  }

  /**
   * Handle WebSocket connection
   */
  private handleWebSocketConnection(ws: WebSocket, req: any): void {
    const clientId = this.generateClientId();
    const connection: ClientConnection = {
      id: clientId,
      protocol: 'websocket',
      connected: true,
      lastPing: new Date(),
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0,
      metadata: {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        connectedAt: new Date()
      }
    };

    this.connections.set(clientId, connection);
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
    this.metrics.protocolDistribution.websocket++;

    console.log(`📡 WebSocket client connected: ${clientId}`);

    // Send welcome message
    this.sendWebSocketMessage(ws, {
      type: 'welcome',
      payload: {
        clientId,
        serverTime: new Date().toISOString(),
        protocol: 'websocket'
      }
    });

    // Handle messages
    ws.on('message', (data: Buffer) => {
      this.handleWebSocketMessage(ws, connection, data);
    });

    // Handle ping/pong
    ws.on('ping', () => {
      connection.lastPing = new Date();
      ws.pong();
    });

    ws.on('pong', () => {
      connection.lastPing = new Date();
    });

    // Handle disconnection
    ws.on('close', (code, reason) => {
      this.handleWebSocketDisconnection(connection, code, reason);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${clientId}:`, error);
      this.metrics.errors++;
    });

    // Send initial data
    this.sendInitialData(ws, connection);
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(ws: WebSocket, connection: ClientConnection, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      connection.messagesReceived++;
      connection.bytesTransferred += data.length;

      this.metrics.totalMessages++;

      // Handle different message types
      switch (message.type) {
        case 'ping':
          this.sendWebSocketMessage(ws, {
            type: 'pong',
            payload: {
              timestamp: message.timestamp || Date.now(),
              messageId: message.messageId
            }
          });
          break;

        case 'benchmark':
          this.handleBenchmarkMessage(ws, connection, message);
          break;

        case 'latency_test':
          this.handleLatencyTest(ws, connection, message);
          break;

        case 'subscribe':
          this.handleSubscription(ws, connection, message);
          break;

        case 'request_initial_data':
          this.sendInitialData(ws, connection);
          break;

        default:
          console.log(`Unknown WebSocket message type: ${message.type}`);
      }

    } catch (error) {
      console.error(`Error parsing WebSocket message:`, error);
      this.metrics.errors++;
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleWebSocketDisconnection(connection: ClientConnection, code: number, reason: Buffer): void {
    console.log(`📡 WebSocket client disconnected: ${connection.id} (${code})`);

    connection.connected = false;
    this.metrics.activeConnections--;
    this.metrics.protocolDistribution.websocket--;

    this.connections.delete(connection.id);
  }

  /**
   * Setup Server-Sent Events endpoint
   */
  private setupSSEEndpoint(): void {
    this.app.get('/api/events', (req, res) => {
      const clientId = this.generateClientId();

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Create client connection
      const connection: ClientConnection = {
        id: clientId,
        protocol: 'sse',
        connected: true,
        lastPing: new Date(),
        messagesSent: 0,
        messagesReceived: 0,
        bytesTransferred: 0,
        metadata: {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          connectedAt: new Date()
        }
      };

      this.connections.set(clientId, connection);
      this.sseClients.set(clientId, res);

      this.metrics.totalConnections++;
      this.metrics.activeConnections++;
      this.metrics.protocolDistribution.sse++;

      console.log(`📡 SSE client connected: ${clientId}`);

      // Send welcome event
      this.sendSSEEvent(res, 'welcome', {
        clientId,
        serverTime: new Date().toISOString(),
        protocol: 'sse'
      });

      // Send initial data
      this.sendInitialSSEData(res, connection);

      // Handle client disconnection
      req.on('close', () => {
        console.log(`📡 SSE client disconnected: ${clientId}`);
        connection.connected = false;
        this.metrics.activeConnections--;
        this.metrics.protocolDistribution.sse--;
        this.connections.delete(clientId);
        this.sseClients.delete(clientId);
      });
    });

    console.log(`📡 SSE endpoint enabled: /api/events`);
  }

  /**
   * Setup Custom Sync endpoints
   */
  private setupCustomSyncEndpoints(): void {
    // Main sync endpoint
    this.app.post('/api/sync', async (req, res) => {
      try {
        const { lastSync, version, enableDelta, batchSize, checksum } = req.body;

        // Generate sync data
        const syncData = await this.generateSyncData(lastSync, version, enableDelta);

        res.json({
          type: enableDelta && lastSync ? 'delta_sync' : 'full_sync',
          payload: syncData,
          checksum: this.generateChecksum(syncData),
          version: syncData.version || (version + 1),
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({
          type: 'error',
          payload: { message: 'Sync failed' }
        });
      }
    });

    // Full sync endpoint
    this.app.get('/api/sync/full', async (req, res) => {
      try {
        const fullData = await this.generateFullSyncData();
        res.json(fullData);
      } catch (error) {
        res.status(500).json({ error: 'Full sync failed' });
      }
    });

    // Queue endpoint for client messages
    this.app.post('/api/sync/queue', async (req, res) => {
      try {
        const { messages } = req.body;
        // Process queued messages
        await this.processQueuedMessages(messages);
        res.json({ processed: messages.length });
      } catch (error) {
        res.status(500).json({ error: 'Queue processing failed' });
      }
    });

    console.log(`📡 Custom Sync endpoints enabled`);
  }

  /**
   * Send WebSocket message
   */
  private sendWebSocketMessage(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(message);
      ws.send(data);

      // Update metrics
      const connection = Array.from(this.connections.values()).find(c => c.connected);
      if (connection) {
        connection.messagesSent++;
        connection.bytesTransferred += data.length;
      }
    }
  }

  /**
   * Send SSE event
   */
  private sendSSEEvent(res: any, event: string, data: any): void {
    const eventData = JSON.stringify(data);
    const message = `event: ${event}\ndata: ${eventData}\n\n`;

    res.write(message);

    // Update metrics
    const connection = Array.from(this.connections.values()).find(c => c.protocol === 'sse' && c.connected);
    if (connection) {
      connection.messagesSent++;
      connection.bytesTransferred += message.length;
    }
  }

  /**
   * Send initial data to WebSocket client
   */
  private sendInitialData(ws: WebSocket, connection: ClientConnection): void {
    const initialData = {
      type: 'initial_data',
      payload: {
        serverInfo: {
          version: '1.0.0',
          uptime: this.metrics.uptime,
          supportedProtocols: ['websocket', 'sse', 'custom-sync']
        },
        metrics: this.getMetrics(),
        timestamp: new Date().toISOString()
      }
    };

    this.sendWebSocketMessage(ws, initialData);
  }

  /**
   * Send initial data to SSE client
   */
  private sendInitialSSEData(res: any, connection: ClientConnection): void {
    this.sendSSEEvent(res, 'initial_data', {
      serverInfo: {
        version: '1.0.0',
        uptime: this.metrics.uptime,
        supportedProtocols: ['websocket', 'sse', 'custom-sync']
      },
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle benchmark messages
   */
  private handleBenchmarkMessage(ws: WebSocket, connection: ClientConnection, message: any): void {
    // Echo benchmark message for testing
    this.sendWebSocketMessage(ws, {
      type: 'benchmark_response',
      payload: {
        originalMessage: message,
        receivedAt: new Date().toISOString(),
        connectionId: connection.id
      }
    });
  }

  /**
   * Handle latency test messages
   */
  private handleLatencyTest(ws: WebSocket, connection: ClientConnection, message: any): void {
    this.sendWebSocketMessage(ws, {
      type: 'latency_response',
      payload: {
        originalTimestamp: message.timestamp,
        receivedAt: Date.now(),
        messageId: message.messageId
      }
    });
  }

  /**
   * Handle subscription requests
   */
  private handleSubscription(ws: WebSocket, connection: ClientConnection, message: any): void {
    console.log(`Client ${connection.id} subscribed to: ${message.channels}`);
    // In a real implementation, you would manage subscriptions here
  }

  /**
   * Generate sync data
   */
  private async generateSyncData(lastSync?: string, version?: number, enableDelta?: boolean): Promise<any> {
    // Mock implementation - in real scenario, this would fetch actual data
    const baseData = {
      agents: [],
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString()
    };

    if (enableDelta && lastSync) {
      // Return delta changes
      return {
        operations: [
          { type: 'update', path: 'metrics', data: this.getMetrics() }
        ],
        version: (version || 0) + 1
      };
    }

    return {
      ...baseData,
      version: 1
    };
  }

  /**
   * Generate full sync data
   */
  private async generateFullSyncData(): Promise<any> {
    return {
      type: 'full_sync',
      payload: await this.generateSyncData(),
      checksum: this.generateChecksum({}),
      version: 1,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Process queued messages
   */
  private async processQueuedMessages(messages: any[]): Promise<void> {
    // Mock implementation - in real scenario, process actual client messages
    console.log(`Processing ${messages.length} queued messages`);
  }

  /**
   * Generate checksum
   */
  private generateChecksum(data: any): string {
    // Simple checksum implementation
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.broadcastHeartbeat();
      this.cleanupStaleConnections();
    }, this.config.heartbeatInterval);
  }

  /**
   * Broadcast heartbeat to all clients
   */
  private broadcastHeartbeat(): void {
    const heartbeatMessage = {
      type: 'heartbeat',
      payload: {
        timestamp: new Date().toISOString(),
        activeConnections: this.metrics.activeConnections
      }
    };

    // Send to WebSocket clients
    if (this.wsServer) {
      this.wsServer.clients.forEach((ws: WebSocket) => {
        if (ws.readyState === WebSocket.OPEN) {
          this.sendWebSocketMessage(ws, heartbeatMessage);
        }
      });
    }

    // Send to SSE clients
    this.sseClients.forEach((res) => {
      this.sendSSEEvent(res, 'heartbeat', heartbeatMessage.payload);
    });
  }

  /**
   * Cleanup stale connections
   */
  private cleanupStaleConnections(): void {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    this.connections.forEach((connection, id) => {
      if (now.getTime() - connection.lastPing.getTime() > staleThreshold) {
        console.log(`Cleaning up stale connection: ${id}`);
        connection.connected = false;
        this.metrics.activeConnections--;
        this.connections.delete(id);
      }
    });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 1000); // Update every second
  }

  /**
   * Update server metrics
   */
  private updateMetrics(): void {
    this.metrics.uptime = Date.now() - this.startTime.getTime();

    // Calculate messages per second
    const recentMessages = this.messageHistory.filter(
      m => Date.now() - m.timestamp < 1000
    ).length;
    this.metrics.messagesPerSecond = recentMessages;

    // Add to history
    this.messageHistory.push({
      timestamp: Date.now(),
      count: recentMessages
    });

    // Keep only last 60 seconds of history
    if (this.messageHistory.length > 60) {
      this.messageHistory = this.messageHistory.slice(-60);
    }
  }

  /**
   * Get current metrics
   */
  private getMetrics(): ServerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get protocol recommendations
   */
  private getProtocolRecommendations(): any {
    return {
      bestForLowLatency: 'websocket',
      bestForSimplicity: 'sse',
      bestForCompatibility: 'custom-sync',
      currentLoad: {
        websocket: this.metrics.protocolDistribution.websocket,
        sse: this.metrics.protocolDistribution.sse,
        'custom-sync': this.metrics.protocolDistribution['custom-sync']
      }
    };
  }

  /**
   * Generate client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start the server
   */
  start(port?: number): void {
    const serverPort = port || this.config.port;

    this.server.listen(serverPort, () => {
      console.log(`🚀 Real-time Communication Server running on port ${serverPort}`);
      console.log(`📊 WebSocket: ws://localhost:${serverPort}/ws`);
      console.log(`📡 SSE: http://localhost:${serverPort}/api/events`);
      console.log(`🔄 Custom Sync: http://localhost:${serverPort}/api/sync`);
      console.log(`📈 Metrics: http://localhost:${serverPort}/api/metrics`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('Shutting down gracefully...');
      this.shutdown();
    });

    process.on('SIGINT', () => {
      console.log('Shutting down gracefully...');
      this.shutdown();
    });
  }

  /**
   * Shutdown the server
   */
  private shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    if (this.wsServer) {
      this.wsServer.close();
    }

    this.server.close(() => {
      console.log('Server shutdown complete');
      process.exit(0);
    });
  }
}

export default RealtimeServer;