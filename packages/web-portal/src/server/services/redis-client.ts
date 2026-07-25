/**
 * Redis Client Service
 * Provides singleton Redis connection for pub/sub event capture
 *
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Graceful error handling
 * - Pub/Sub pattern subscription
 * - Connection health monitoring
 *
 * Environment Variables:
 * - REDIS_URL: Full connection URL (default: redis://localhost:6379)
 * - REDIS_HOST: Redis host (default: localhost)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Optional password
 * - REDIS_DB: Database number (default: 0)
 * - REDIS_PREFIX: Key prefix (default: cfn:)
 */

import { createClient, RedisClientType } from 'redis';

export type RedisClient = RedisClientType;
export type RedisSubscriber = RedisClientType;

interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  prefix?: string;
}

class RedisClientService {
  private client: RedisClient | null = null;
  private subscriber: RedisSubscriber | null = null;
  private isConnected = false;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 1000; // Base delay in ms

  /**
   * Initialize Redis client
   */
  public async connect(config?: RedisConfig): Promise<RedisClient> {
    if (this.client && this.isConnected) {
      return this.client;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      await this.waitForConnection();
      return this.client!;
    }

    this.isConnecting = true;

    try {
      const redisConfig = this.buildConfig(config);

      // Create main client
      this.client = createClient({
        url: redisConfig.url,
        password: redisConfig.password,
        database: redisConfig.db,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > this.maxReconnectAttempts) {
              console.error('[Redis] Max reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            const delay = Math.min(this.reconnectDelay * Math.pow(2, retries), 30000);
            console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${retries})`);
            return delay;
          }
        }
      });

      // Setup event handlers
      this.setupEventHandlers(this.client);

      // Connect
      await this.client.connect();
      this.isConnected = true;
      this.reconnectAttempts = 0;

      console.log('[Redis] Connected successfully');
      console.log(`[Redis] Host: ${redisConfig.url || `${redisConfig.host}:${redisConfig.port}`}`);
      console.log(`[Redis] Database: ${redisConfig.db}`);
      console.log(`[Redis] Prefix: ${redisConfig.prefix}`);

      return this.client;

    } catch (error) {
      this.isConnected = false;
      console.error('[Redis] Connection failed:', error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Get or create subscriber client for pub/sub
   */
  public async getSubscriber(): Promise<RedisSubscriber> {
    if (this.subscriber && this.subscriber.isOpen) {
      return this.subscriber;
    }

    // Ensure main client is connected first
    if (!this.client || !this.isConnected) {
      await this.connect();
    }

    try {
      // Create separate client for subscriptions (Redis requirement)
      this.subscriber = this.client!.duplicate();
      this.setupEventHandlers(this.subscriber);

      await this.subscriber.connect();
      console.log('[Redis] Subscriber client connected');

      return this.subscriber;

    } catch (error) {
      console.error('[Redis] Subscriber connection failed:', error);
      throw error;
    }
  }

  /**
   * Get main Redis client
   */
  public getClient(): RedisClient | null {
    return this.client;
  }

  /**
   * Check connection status
   */
  public isReady(): boolean {
    return this.isConnected && this.client !== null && this.client.isOpen;
  }

  /**
   * Graceful shutdown
   */
  public async disconnect(): Promise<void> {
    console.log('[Redis] Disconnecting...');

    try {
      if (this.subscriber && this.subscriber.isOpen) {
        await this.subscriber.quit();
        this.subscriber = null;
        console.log('[Redis] Subscriber disconnected');
      }

      if (this.client && this.client.isOpen) {
        await this.client.quit();
        this.client = null;
        console.log('[Redis] Main client disconnected');
      }

      this.isConnected = false;

    } catch (error) {
      console.error('[Redis] Error during disconnect:', error);
      // Force close if graceful quit fails
      if (this.subscriber) await this.subscriber.disconnect();
      if (this.client) await this.client.disconnect();
    }
  }

  /**
   * Build Redis configuration from environment
   */
  private buildConfig(config?: RedisConfig): Required<RedisConfig> {
    // Priority: explicit config > environment variables > defaults
    const url = config?.url || process.env.REDIS_URL;
    const host = config?.host || process.env.REDIS_HOST || 'localhost';
    const port = config?.port || parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = config?.password || process.env.REDIS_PASSWORD || undefined;
    const db = config?.db ?? parseInt(process.env.REDIS_DB || '0', 10);
    const prefix = config?.prefix || process.env.REDIS_PREFIX || 'cfn:';

    return {
      url: url || `redis://${host}:${port}`,
      host,
      port,
      password,
      db,
      prefix
    };
  }

  /**
   * Setup Redis client event handlers
   */
  private setupEventHandlers(client: RedisClient): void {
    client.on('error', (error) => {
      console.error('[Redis] Client error:', error);
      this.isConnected = false;
    });

    client.on('connect', () => {
      console.log('[Redis] Client connecting...');
    });

    client.on('ready', () => {
      console.log('[Redis] Client ready');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    client.on('reconnecting', () => {
      this.reconnectAttempts++;
      console.log(`[Redis] Reconnecting... (attempt ${this.reconnectAttempts})`);
    });

    client.on('end', () => {
      console.log('[Redis] Connection closed');
      this.isConnected = false;
    });
  }

  /**
   * Wait for connection to complete
   */
  private async waitForConnection(timeout = 10000): Promise<void> {
    const startTime = Date.now();

    while (this.isConnecting) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Redis connection timeout');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.isConnected) {
      throw new Error('Redis connection failed');
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; latency: number }> {
    if (!this.client || !this.isConnected) {
      return { status: 'disconnected', latency: -1 };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;

      return { status: 'healthy', latency };
    } catch (error) {
      console.error('[Redis] Health check failed:', error);
      return { status: 'unhealthy', latency: -1 };
    }
  }
}

// Export singleton instance
export const redisClientService = new RedisClientService();

// Export class for testing
export { RedisClientService };
