#!/usr/bin/env node

/**
 * Swarm Visualization WebSocket Server Launcher
 *
 * This script starts the WebSocket server for real-time swarm visualization
 * and publishes coordination events to Redis for swarm synchronization.
 */

import { createClient, RedisClientType } from 'redis';
import SwarmWebSocketServer from '../websocket/swarmWebSocketServer';

interface ServerConfig {
  port: number;
  redisHost: string;
  redisPort: number;
  enableRedisCoordination: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const DEFAULT_CONFIG: ServerConfig = {
  port: parseInt(process.env.WS_PORT || '8080'),
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379'),
  enableRedisCoordination: process.env.ENABLE_REDIS_COORDINATION !== 'false',
  logLevel: (process.env.LOG_LEVEL as any) || 'info'
};

class VisualizationServerLauncher {
  private config: ServerConfig;
  private wsServer: any;
  private redisClient: RedisClientType | null = null;
  private redisPublisher: RedisClientType | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Swarm Visualization Server...');
      console.log(`📊 WebSocket Port: ${this.config.port}`);
      console.log(`🔴 Redis Host: ${this.config.redisHost}:${this.config.redisPort}`);
      console.log(`🔄 Redis Coordination: ${this.config.enableRedisCoordination ? 'Enabled' : 'Disabled'}`);

      // Initialize Redis coordination if enabled
      if (this.config.enableRedisCoordination) {
        await this.initializeRedisCoordination();
      }

      // Start WebSocket server
      const { getSwarmWebSocketServer } = await import('../websocket/swarmWebSocketServer');
      this.wsServer = getSwarmWebSocketServer(this.config.port);

      // Set up event listeners
      this.setupEventListeners();

      // Start the server
      await this.wsServer.start();

      // Publish server start event
      if (this.config.enableRedisCoordination) {
        await this.publishServerEvent('started', {
          port: this.config.port,
          timestamp: new Date().toISOString(),
          config: this.config
        });
      }

      this.isRunning = true;
      console.log('✅ Swarm Visualization Server started successfully!');

      // Set up graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      console.error('❌ Failed to start visualization server:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Swarm Visualization Server...');

    try {
      // Stop WebSocket server
      if (this.wsServer) {
        await this.wsServer.stop();
      }

      // Close Redis connections
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      if (this.redisPublisher) {
        await this.redisPublisher.quit();
      }

      // Publish server stop event
      if (this.config.enableRedisCoordination && this.redisPublisher) {
        await this.publishServerEvent('stopped', {
          timestamp: new Date().toISOString()
        });
      }

      this.isRunning = false;
      console.log('✅ Swarm Visualization Server stopped successfully!');

    } catch (error) {
      console.error('❌ Error stopping visualization server:', error);
    }
  }

  private async initializeRedisCoordination(): Promise<void> {
    try {
      // Redis client for subscribing
      this.redisClient = createClient({
        socket: {
          host: this.config.redisHost,
          port: this.config.redisPort
        }
      });

      // Redis publisher for broadcasting
      this.redisPublisher = createClient({
        socket: {
          host: this.config.redisHost,
          port: this.config.redisPort
        }
      });

      await Promise.all([
        this.redisClient.connect(),
        this.redisPublisher.connect()
      ]);

      // Set up Redis subscriptions for swarm events
      await this.setupRedisSubscriptions();

      console.log('✅ Redis coordination initialized');

    } catch (error) {
      console.error('❌ Failed to initialize Redis coordination:', error);
      throw error;
    }
  }

  private async setupRedisSubscriptions(): Promise<void> {
    if (!this.redisClient) return;

    // Subscribe to swarm coordination channels
    const channels = [
      'swarm:phase-6:visualization',
      'swarm:updates',
      'swarm:status'
    ];

    for (const channel of channels) {
      await this.redisClient.subscribe(channel, (message) => {
        try {
          const data = JSON.parse(message);
          this.handleSwarmEvent(data);
        } catch (error) {
          console.error(`❌ Error parsing message from ${channel}:`, error);
        }
      });

      console.log(`📡 Subscribed to Redis channel: ${channel}`);
    }
  }

  private handleSwarmEvent(eventData: any): void {
    const { type, swarmId, data } = eventData;

    switch (type) {
      case 'swarm-started':
        console.log(`🐝 Swarm started: ${swarmId}`);
        this.notifyWebSocketClients('swarm-started', { swarmId, data });
        break;

      case 'agent-spawned':
        console.log(`🤖 Agent spawned: ${data.agentName} (${data.agentRole})`);
        this.notifyWebSocketClients('agent-spawned', { swarmId, data });
        break;

      case 'agent-updated':
        this.notifyWebSocketClients('agent-updated', { swarmId, data });
        break;

      case 'task-created':
        console.log(`📋 Task created: ${data.taskTitle}`);
        this.notifyWebSocketClients('task-created', { swarmId, data });
        break;

      case 'task-updated':
        this.notifyWebSocketClients('task-updated', { swarmId, data });
        break;

      case 'swarm-completed':
        console.log(`✅ Swarm completed: ${swarmId}`);
        this.notifyWebSocketClients('swarm-completed', { swarmId, data });
        break;

      case 'consensus-reached':
        console.log(`🎯 Consensus reached: ${data.consensus} (confidence: ${data.confidence})`);
        this.notifyWebSocketClients('consensus-reached', { swarmId, data });
        break;

      default:
        console.log(`📨 Unknown event type: ${type}`);
    }
  }

  private notifyWebSocketClients(type: string, data: any): void {
    // Forward Redis events to WebSocket clients
    if (this.wsServer && this.wsServer.updateSwarmData) {
      this.wsServer.updateSwarmData(data.swarmId, data);
    }
  }

  private async publishServerEvent(event: string, data: any): Promise<void> {
    if (!this.redisPublisher) return;

    try {
      const message = JSON.stringify({
        type: `visualization-server-${event}`,
        timestamp: new Date().toISOString(),
        data
      });

      await this.redisPublisher.publish('swarm:visualization-server', message);
      console.log(`📤 Published server event: ${event}`);

    } catch (error) {
      console.error(`❌ Failed to publish server event: ${event}`, error);
    }
  }

  private setupEventListeners(): void {
    if (!this.wsServer) return;

    this.wsServer.on('started', () => {
      console.log('🌐 WebSocket server started');
    });

    this.wsServer.on('stopped', () => {
      console.log('🌐 WebSocket server stopped');
    });

    this.wsServer.on('error', (error: Error) => {
      console.error('❌ WebSocket server error:', error);
    });

    this.wsServer.on('connection', (connectionId: string) => {
      console.log(`🔗 New connection: ${connectionId}`);
    });

    this.wsServer.on('disconnection', (connectionId: string) => {
      console.log(`❌ Connection closed: ${connectionId}`);
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon restarts
  }
}

// CLI execution
if (require.main === module) {
  const launcher = new VisualizationServerLauncher();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  if (portIndex !== -1 && args[portIndex + 1]) {
    const config = { port: parseInt(args[portIndex + 1]) };
    new VisualizationServerLauncher(config).start().catch(console.error);
  } else {
    launcher.start().catch(console.error);
  }
}

export default VisualizationServerLauncher;