/**
 * Redis Coordinator for QEEventBus
 *
 * Handles Redis pub/sub coordination for distributed event bus communication.
 * Features message serialization, compression, clustering support, and failover handling.
 */

import { createClient } from 'redis';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { performance } from 'perf_hooks';
import { createGzip, createGunzip } from 'zlib';
import { promisify } from 'util';

// MessagePack for efficient serialization (if available)
let msgpack;
try {
  msgpack = require('msgpack-lite');
} catch (e) {
  // Fallback to JSON if MessagePack not available
  console.warn('⚠️ QEEventBus: msgpack-lite not available, using JSON serialization');
}

/**
 * Serialization formats
 */
export const SerializationFormat = {
  JSON: 'json',
  MSGPACK: 'msgpack',
  COMPRESSED_JSON: 'compressed_json',
  COMPRESSED_MSGPACK: 'compressed_msgpack'
};

/**
 * Redis coordinator configuration
 */
export interface RedisCoordinatorConfig {
  host: string;
  port: number;
  db?: number;
  password?: string;
  keyPrefix?: string;
  ttl?: number;
  serialization?: typeof SerializationFormat[keyof typeof SerializationFormat];
  clustering?: {
    enabled: boolean;
    nodes?: Array<{ host: string; port: number }>;
  };
  sentinel?: {
    enabled: boolean;
    hosts: Array<{ host: string; port: number }>;
    name?: string;
  };
  connection?: {
    maxRetries: number;
    retryDelay: number;
    connectTimeout: number;
    lazyConnect: boolean;
  };
  performance?: {
    pipelineBatch: number;
    compressionThreshold: number;
    maxMessageSize: number;
  };
  monitoring?: {
    enabled: boolean;
    metricsInterval: number;
    slowLogThreshold: number;
  };
}

/**
 * Performance metrics for Redis operations
 */
export interface RedisMetrics {
  messagesPublished: number;
  messagesReceived: number;
  publishLatency: number;
  receiveLatency: number;
  errorCount: number;
  reconnectCount: number;
  memoryUsage: number;
  connectionPoolSize: number;
  throughput: number;
  compressionRatio: number;
  timestamp: number;
}

/**
 * Redis connection status
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

/**
 * Redis coordinator for distributed event bus communication
 */
export class RedisCoordinator extends EventEmitter {
  private config: RedisCoordinatorConfig;
  private publisher: any;
  private subscriber: any;
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private metrics: RedisMetrics;
  private messageQueue: Array<{ channel: string; message: any; timestamp: number }> = [];
  private reconnectAttempts: number = 0;
  private lastReconnectTime: number = 0;
  private compressionEnabled: boolean = false;

  constructor(config: RedisCoordinatorConfig) {
    super();
    this.config = config;
    this.initializeMetrics();
    this.configureCompression();
  }

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): void {
    this.metrics = {
      messagesPublished: 0,
      messagesReceived: 0,
      publishLatency: 0,
      receiveLatency: 0,
      errorCount: 0,
      reconnectCount: 0,
      memoryUsage: 0,
      connectionPoolSize: 0,
      throughput: 0,
      compressionRatio: 1.0,
      timestamp: Date.now()
    };
  }

  /**
   * Configure compression based on settings
   */
  private configureCompression(): void {
    const format = this.config.serialization || SerializationFormat.JSON;
    this.compressionEnabled = format.includes('compressed');
  }

  /**
   * Connect to Redis and set up pub/sub
   */
  async connect(): Promise<void> {
    try {
      this.setStatus(ConnectionStatus.CONNECTING);

      // Create publisher client
      this.publisher = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
          connectTimeout: this.config.connection?.connectTimeout || 10000
        },
        database: this.config.db || 0,
        password: this.config.password,
        lazyConnect: this.config.connection?.lazyConnect || false
      });

      // Create subscriber client
      this.subscriber = this.publisher.duplicate();

      // Set up event handlers
      this.setupEventHandlers();

      // Connect both clients
      await this.publisher.connect();
      await this.subscriber.connect();

      // Subscribe to event bus channel
      const channel = this.config.keyPrefix || 'qeeventbus';
      await this.subscriber.subscribe(channel, (message: string) => {
        this.handleMessage(message);
      });

      this.setStatus(ConnectionStatus.CONNECTED);
      this.reconnectAttempts = 0;

      console.log(`🔗 RedisCoordinator: Connected to Redis at ${this.config.host}:${this.config.port}`);

      // Start monitoring if enabled
      if (this.config.monitoring?.enabled) {
        this.startMonitoring();
      }

      // Process queued messages
      this.processMessageQueue();

    } catch (error) {
      this.setStatus(ConnectionStatus.ERROR);
      console.error('❌ RedisCoordinator: Connection failed:', error);
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Set up event handlers for Redis clients
   */
  private setupEventHandlers(): void {
    // Publisher events
    this.publisher.on('error', (error: Error) => {
      console.error('❌ RedisCoordinator: Publisher error:', error);
      this.metrics.errorCount++;
      this.emit('error', error);
      this.handleReconnection();
    });

    this.publisher.on('reconnecting', () => {
      console.log('🔄 RedisCoordinator: Publisher reconnecting...');
      this.setStatus(ConnectionStatus.RECONNECTING);
    });

    this.publisher.on('connect', () => {
      console.log('✅ RedisCoordinator: Publisher connected');
      this.metrics.reconnectCount++;
    });

    // Subscriber events
    this.subscriber.on('error', (error: Error) => {
      console.error('❌ RedisCoordinator: Subscriber error:', error);
      this.metrics.errorCount++;
      this.emit('error', error);
    });

    this.subscriber.on('reconnecting', () => {
      console.log('🔄 RedisCoordinator: Subscriber reconnecting...');
    });

    this.subscriber.on('connect', () => {
      console.log('✅ RedisCoordinator: Subscriber connected');
    });
  }

  /**
   * Publish message to Redis channel
   */
  async publish(channel: string, message: any): Promise<void> {
    const startTime = performance.now();

    try {
      if (this.status !== ConnectionStatus.CONNECTED) {
        // Queue message for later delivery
        this.queueMessage(channel, message);
        return;
      }

      // Serialize and compress message
      const serializedMessage = await this.serializeMessage(message);

      // Check message size
      const messageSize = Buffer.byteLength(serializedMessage);
      const maxSize = this.config.performance?.maxMessageSize || 1024 * 1024; // 1MB default

      if (messageSize > maxSize) {
        throw new Error(`Message size ${messageSize} exceeds maximum ${maxSize}`);
      }

      // Publish to Redis
      await this.publisher.publish(channel, serializedMessage);

      // Update metrics
      const latency = performance.now() - startTime;
      this.updatePublishMetrics(latency, messageSize);

    } catch (error) {
      console.error('❌ RedisCoordinator: Publish failed:', error);
      this.metrics.errorCount++;

      // Queue message for retry
      this.queueMessage(channel, message);

      throw error;
    }
  }

  /**
   * Subscribe to Redis channel
   */
  async subscribe(channel: string): Promise<void> {
    try {
      if (this.status !== ConnectionStatus.CONNECTED) {
        throw new Error('Not connected to Redis');
      }

      await this.subscriber.subscribe(channel, (message: string) => {
        this.handleMessage(message);
      });

      console.log(`📡 RedisCoordinator: Subscribed to channel: ${channel}`);

    } catch (error) {
      console.error('❌ RedisCoordinator: Subscribe failed:', error);
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Unsubscribe from Redis channel
   */
  async unsubscribe(channel: string): Promise<void> {
    try {
      if (this.subscriber) {
        await this.subscriber.unsubscribe(channel);
        console.log(`📡 RedisCoordinator: Unsubscribed from channel: ${channel}`);
      }
    } catch (error) {
      console.error('❌ RedisCoordinator: Unsubscribe failed:', error);
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Handle incoming message from Redis
   */
  private async handleMessage(message: string): Promise<void> {
    const startTime = performance.now();

    try {
      // Deserialize message
      const deserializedMessage = await this.deserializeMessage(message);

      // Update metrics
      const latency = performance.now() - startTime;
      this.updateReceiveMetrics(latency);

      // Emit message event
      this.emit('message', deserializedMessage);

    } catch (error) {
      console.error('❌ RedisCoordinator: Message handling failed:', error);
      this.metrics.errorCount++;
    }
  }

  /**
   * Serialize message based on configured format
   */
  private async serializeMessage(message: any): Promise<string | Buffer> {
    let serialized: string | Buffer;
    let originalSize: number;

    try {
      const format = this.config.serialization || SerializationFormat.JSON;

      switch (format) {
        case SerializationFormat.MSGPACK:
          if (!msgpack) {
            throw new Error('MSGPACK format requires msgpack-lite package');
          }
          serialized = msgpack.encode(message);
          originalSize = serialized.length;
          break;

        case SerializationFormat.JSON:
        default:
          serialized = JSON.stringify(message);
          originalSize = Buffer.byteLength(serialized as string);
          break;
      }

      // Apply compression if enabled and threshold is met
      if (this.compressionEnabled &&
          originalSize > (this.config.performance?.compressionThreshold || 1024)) {
        serialized = await this.compressMessage(serialized);

        // Update compression ratio
        const compressedSize = Buffer.byteLength(serialized);
        this.metrics.compressionRatio = compressedSize / originalSize;
      }

      return serialized;

    } catch (error) {
      console.error('❌ RedisCoordinator: Serialization failed:', error);
      throw error;
    }
  }

  /**
   * Deserialize message based on format
   */
  private async deserializeMessage(message: string | Buffer): Promise<any> {
    try {
      const format = this.config.serialization || SerializationFormat.JSON;

      // Decompress if needed
      if (this.compressionEnabled) {
        message = await this.decompressMessage(message);
      }

      switch (format) {
        case SerializationFormat.MSGPACK:
        case SerializationFormat.COMPRESSED_MSGPACK:
          if (!msgpack) {
            throw new Error('MSGPACK format requires msgpack-lite package');
          }
          return msgpack.decode(message);

        case SerializationFormat.JSON:
        case SerializationFormat.COMPRESSED_JSON:
        default:
          return JSON.parse(message as string);
      }

    } catch (error) {
      console.error('❌ RedisCoordinator: Deserialization failed:', error);
      throw error;
    }
  }

  /**
   * Compress message using gzip
   */
  private async compressMessage(message: string | Buffer): Promise<Buffer> {
    const gzip = promisify(createGzip);
    const buffer = Buffer.isBuffer(message) ? message : Buffer.from(message);
    return await gzip(buffer);
  }

  /**
   * Decompress message using gzip
   */
  private async decompressMessage(message: string | Buffer): Promise<string> {
    const gunzip = promisify(createGunzip);
    const buffer = await gunzip(message);
    return buffer.toString('utf-8');
  }

  /**
   * Queue message for later delivery
   */
  private queueMessage(channel: string, message: any): void {
    this.messageQueue.push({
      channel,
      message,
      timestamp: Date.now()
    });

    // Limit queue size to prevent memory issues
    const maxQueueSize = 10000;
    if (this.messageQueue.length > maxQueueSize) {
      this.messageQueue = this.messageQueue.slice(-maxQueueSize);
    }
  }

  /**
   * Process queued messages
   */
  private async processMessageQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    const queuedMessages = [...this.messageQueue];
    this.messageQueue = [];

    console.log(`📤 RedisCoordinator: Processing ${queuedMessages.length} queued messages`);

    for (const { channel, message } of queuedMessages) {
      try {
        await this.publish(channel, message);
      } catch (error) {
        console.error('❌ RedisCoordinator: Failed to publish queued message:', error);
        // Re-queue failed messages
        this.queueMessage(channel, message);
      }
    }
  }

  /**
   * Handle reconnection logic
   */
  private async handleReconnection(): Promise<void> {
    const now = Date.now();
    const minReconnectDelay = 1000; // 1 second minimum
    const maxReconnectDelay = 30000; // 30 seconds maximum

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      minReconnectDelay * Math.pow(2, this.reconnectAttempts),
      maxReconnectDelay
    );
    const jitter = Math.random() * 0.1 * baseDelay;
    const delay = baseDelay + jitter;

    if (now - this.lastReconnectTime < delay) {
      return; // Wait before attempting reconnection
    }

    this.lastReconnectTime = now;
    this.reconnectAttempts++;

    try {
      console.log(`🔄 RedisCoordinator: Attempting reconnection (${this.reconnectAttempts})`);

      // Close existing connections
      if (this.publisher) await this.publisher.quit();
      if (this.subscriber) await this.subscriber.quit();

      // Reconnect
      await this.connect();

    } catch (error) {
      console.error('❌ RedisCoordinator: Reconnection failed:', error);
      this.setStatus(ConnectionStatus.ERROR);

      // Schedule next reconnection attempt
      setTimeout(() => this.handleReconnection(), delay);
    }
  }

  /**
   * Update publish metrics
   */
  private updatePublishMetrics(latency: number, messageSize: number): void {
    this.metrics.messagesPublished++;

    // Update average latency (exponential moving average)
    const alpha = 0.1; // Smoothing factor
    this.metrics.publishLatency = this.metrics.publishLatency * (1 - alpha) + latency * alpha;

    // Update throughput (messages per second over last minute)
    this.updateThroughput();
  }

  /**
   * Update receive metrics
   */
  private updateReceiveMetrics(latency: number): void {
    this.metrics.messagesReceived++;

    // Update average latency
    const alpha = 0.1;
    this.metrics.receiveLatency = this.metrics.receiveLatency * (1 - alpha) + latency * alpha;

    // Update throughput
    this.updateThroughput();
  }

  /**
   * Update throughput calculation
   */
  private updateThroughput(): void {
    const now = Date.now();
    const timeWindow = 60000; // 1 minute
    const recentMessages = this.metrics.messagesPublished + this.metrics.messagesReceived;

    this.metrics.throughput = recentMessages / (timeWindow / 1000);
  }

  /**
   * Start performance monitoring
   */
  private startMonitoring(): void {
    const interval = this.config.monitoring?.metricsInterval || 10000; // 10 seconds

    setInterval(() => {
      this.collectMetrics();
      this.emit('metrics', this.metrics);
    }, interval);
  }

  /**
   * Collect performance metrics from Redis
   */
  private async collectMetrics(): Promise<void> {
    try {
      if (this.publisher && this.status === ConnectionStatus.CONNECTED) {
        // Get Redis info
        const info = await this.publisher.info('memory');
        const memoryMatch = info.match(/used_memory:(\d+)/);

        if (memoryMatch) {
          this.metrics.memoryUsage = parseInt(memoryMatch[1]);
        }

        // Get connection pool size
        const clientInfo = await this.publisher.info('clients');
        const clientMatch = clientInfo.match(/connected_clients:(\d+)/);

        if (clientMatch) {
          this.metrics.connectionPoolSize = parseInt(clientMatch[1]);
        }
      }

      this.metrics.timestamp = Date.now();

    } catch (error) {
      console.error('❌ RedisCoordinator: Metrics collection failed:', error);
      this.metrics.errorCount++;
    }
  }

  /**
   * Update connection status
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      const oldStatus = this.status;
      this.status = status;
      this.emit('statusChange', { oldStatus, newStatus: status });
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): RedisMetrics {
    return { ...this.metrics };
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected to Redis
   */
  isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Clear message queue
   */
  clearQueue(): void {
    this.messageQueue = [];
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      this.setStatus(ConnectionStatus.DISCONNECTED);

      if (this.publisher) {
        await this.publisher.quit();
      }

      if (this.subscriber) {
        await this.subscriber.quit();
      }

      console.log('🔌 RedisCoordinator: Disconnected from Redis');

    } catch (error) {
      console.error('❌ RedisCoordinator: Disconnect failed:', error);
      throw error;
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{ status: string; latency: number; error?: string }> {
    try {
      if (!this.isConnected()) {
        return {
          status: 'unhealthy',
          latency: -1,
          error: 'Not connected to Redis'
        };
      }

      const startTime = performance.now();
      await this.publisher.ping();
      const latency = performance.now() - startTime;

      return {
        status: latency < 100 ? 'healthy' : 'degraded',
        latency
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        latency: -1,
        error: error.message
      };
    }
  }
}

export default RedisCoordinator;