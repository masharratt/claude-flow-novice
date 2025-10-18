/**
 * Redis Health Monitor with Auto-Reconnect
 *
 * Sprint 1.3: Production-ready Redis health monitoring with:
 * - Automatic reconnection with exponential backoff
 * - Connection state event emission
 * - Graceful degradation on Redis unavailable
 * - Health check API endpoints
 * - Integration with event bus coordination
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
import { performance } from 'perf_hooks';

/**
 * Connection status states
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

/**
 * Health check configuration
 */
export interface HealthMonitorConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    database?: number;
  };
  health: {
    checkInterval: number;      // Health check interval (default: 5000ms)
    checkTimeout: number;        // Health check timeout (default: 2000ms)
    failureThreshold: number;    // Consecutive failures before reconnect (default: 3)
  };
  reconnect: {
    maxAttempts: number;         // Max reconnect attempts (default: 3)
    delays: number[];            // Backoff delays in ms [1000, 2000, 4000, 8000]
    resetOnSuccess: boolean;     // Reset attempt counter on success (default: true)
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number;     // Metrics collection interval (default: 10000ms)
  };
}

/**
 * Health metrics
 */
export interface HealthMetrics {
  status: ConnectionStatus;
  lastCheckTime: number;
  lastSuccessTime: number;
  consecutiveFailures: number;
  totalChecks: number;
  totalFailures: number;
  reconnectAttempts: number;
  reconnectSuccess: number;
  reconnectFailures: number;
  averageLatency: number;
  uptime: number;
  lastError?: string;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  latency: number;
  timestamp: number;
  error?: string;
}

/**
 * Redis Health Monitor with automatic reconnection
 */
export class RedisHealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private client: RedisClientType | null = null;
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private metrics: HealthMetrics;

  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private isReconnecting = false;
  private startTime = 0;

  // Default configuration
  private static readonly DEFAULT_CONFIG: Partial<HealthMonitorConfig> = {
    health: {
      checkInterval: 5000,
      checkTimeout: 2000,
      failureThreshold: 3
    },
    reconnect: {
      maxAttempts: 3,
      delays: [1000, 2000, 4000, 8000],
      resetOnSuccess: true
    },
    monitoring: {
      enabled: true,
      metricsInterval: 10000
    }
  };

  constructor(config: Partial<HealthMonitorConfig>) {
    super();

    // Merge with defaults
    this.config = {
      redis: config.redis!,
      health: { ...RedisHealthMonitor.DEFAULT_CONFIG.health!, ...config.health },
      reconnect: { ...RedisHealthMonitor.DEFAULT_CONFIG.reconnect!, ...config.reconnect },
      monitoring: { ...RedisHealthMonitor.DEFAULT_CONFIG.monitoring!, ...config.monitoring }
    };

    this.initializeMetrics();
  }

  /**
   * Initialize health metrics
   */
  private initializeMetrics(): void {
    this.metrics = {
      status: ConnectionStatus.DISCONNECTED,
      lastCheckTime: 0,
      lastSuccessTime: 0,
      consecutiveFailures: 0,
      totalChecks: 0,
      totalFailures: 0,
      reconnectAttempts: 0,
      reconnectSuccess: 0,
      reconnectFailures: 0,
      averageLatency: 0,
      uptime: 0
    };
  }

  /**
   * Initialize and connect to Redis
   */
  async connect(): Promise<void> {
    try {
      this.setStatus(ConnectionStatus.CONNECTING);
      this.startTime = Date.now();

      // Create Redis client
      this.client = createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port,
          connectTimeout: 10000
        },
        password: this.config.redis.password,
        database: this.config.redis.database || 0
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Connect
      await this.client.connect();

      // Verify connection
      await this.client.ping();

      this.setStatus(ConnectionStatus.CONNECTED);
      this.metrics.lastSuccessTime = Date.now();
      this.reconnectAttempts = 0;

      // Start health monitoring
      this.startHealthChecks();

      // Start metrics collection
      if (this.config.monitoring.enabled) {
        this.startMetricsCollection();
      }

      this.emit('redis:connected', {
        host: this.config.redis.host,
        port: this.config.redis.port,
        timestamp: Date.now()
      });

      console.log(`✅ Redis Health Monitor: Connected to ${this.config.redis.host}:${this.config.redis.port}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.setStatus(ConnectionStatus.FAILED);
      this.metrics.lastError = errorMessage;

      this.emit('redis:connection:failed', {
        error: errorMessage,
        timestamp: Date.now()
      });

      throw new Error(`Redis connection failed: ${errorMessage}`);
    }
  }

  /**
   * Set up Redis event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('error', (error: Error) => {
      console.error('❌ Redis error:', error.message);
      this.metrics.lastError = error.message;
      this.emit('redis:error', { error: error.message, timestamp: Date.now() });

      // Trigger reconnection on error
      if (this.status === ConnectionStatus.CONNECTED) {
        this.handleConnectionLoss();
      }
    });

    this.client.on('end', () => {
      console.log('🔌 Redis connection ended');
      this.handleConnectionLoss();
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
      this.setStatus(ConnectionStatus.RECONNECTING);
    });

    this.client.on('ready', () => {
      console.log('✅ Redis ready');
      if (this.status !== ConnectionStatus.CONNECTED) {
        this.setStatus(ConnectionStatus.CONNECTED);
        this.metrics.reconnectSuccess++;
      }
    });
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    // Clear existing interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.health.checkInterval);

    console.log(`🏥 Health checks started (interval: ${this.config.health.checkInterval}ms)`);
  }

  /**
   * Stop health checks
   */
  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    this.metrics.totalChecks++;
    this.metrics.lastCheckTime = Date.now();

    try {
      if (!this.client || this.status !== ConnectionStatus.CONNECTED) {
        throw new Error('Redis client not connected');
      }

      // Perform PING with timeout
      const pingPromise = this.client.ping();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), this.config.health.checkTimeout)
      );

      await Promise.race([pingPromise, timeoutPromise]);

      const latency = performance.now() - startTime;

      // Update metrics
      this.updateLatencyMetrics(latency);
      this.metrics.consecutiveFailures = 0;
      this.metrics.lastSuccessTime = Date.now();

      this.emit('redis:health:check', {
        healthy: true,
        latency,
        timestamp: Date.now()
      });

      return {
        healthy: true,
        latency,
        timestamp: Date.now()
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.metrics.consecutiveFailures++;
      this.metrics.totalFailures++;
      this.metrics.lastError = errorMessage;

      this.emit('redis:health:check', {
        healthy: false,
        latency: -1,
        timestamp: Date.now(),
        error: errorMessage
      });

      // Trigger reconnection if threshold exceeded
      if (this.metrics.consecutiveFailures >= this.config.health.failureThreshold) {
        console.warn(`⚠️ Health check failure threshold reached (${this.metrics.consecutiveFailures})`);
        this.handleConnectionLoss();
      }

      return {
        healthy: false,
        latency: -1,
        timestamp: Date.now(),
        error: errorMessage
      };
    }
  }

  /**
   * Handle connection loss and trigger reconnection
   */
  private handleConnectionLoss(): void {
    if (this.isReconnecting) {
      return; // Already attempting reconnection
    }

    this.setStatus(ConnectionStatus.DISCONNECTED);
    this.stopHealthChecks();

    this.emit('redis:connection:lost', {
      consecutiveFailures: this.metrics.consecutiveFailures,
      timestamp: Date.now()
    });

    console.log('🔌 Redis connection lost, initiating reconnection...');

    // Start reconnection attempts
    this.attemptReconnect();
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private async attemptReconnect(): Promise<boolean> {
    if (this.isReconnecting) {
      return false;
    }

    this.isReconnecting = true;
    this.setStatus(ConnectionStatus.RECONNECTING);
    const delays = this.config.reconnect.delays;

    for (let i = 0; i < delays.length && i < this.config.reconnect.maxAttempts; i++) {
      const delay = delays[i];
      this.reconnectAttempts++;
      this.metrics.reconnectAttempts++;

      this.emit('redis:reconnecting', {
        attempt: i + 1,
        maxAttempts: this.config.reconnect.maxAttempts,
        delay,
        timestamp: Date.now()
      });

      console.log(`🔄 Reconnection attempt ${i + 1}/${this.config.reconnect.maxAttempts} (delay: ${delay}ms)`);

      // Wait for backoff delay
      await this.sleep(delay);

      try {
        // Close existing client
        if (this.client) {
          try {
            await this.client.quit();
          } catch (error) {
            // Ignore errors on quit
          }
          this.client = null;
        }

        // Attempt reconnection
        await this.connect();

        // Success!
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.metrics.reconnectSuccess++;

        this.emit('redis:reconnected', {
          attempt: i + 1,
          totalAttempts: i + 1,
          timestamp: Date.now()
        });

        console.log(`✅ Reconnection successful after ${i + 1} attempts`);
        return true;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`❌ Reconnection attempt ${i + 1} failed: ${errorMessage}`);
        this.metrics.lastError = errorMessage;
      }
    }

    // All attempts failed
    this.isReconnecting = false;
    this.metrics.reconnectFailures++;
    this.setStatus(ConnectionStatus.FAILED);

    this.emit('redis:failed', {
      totalAttempts: this.reconnectAttempts,
      lastError: this.metrics.lastError,
      timestamp: Date.now()
    });

    console.error(`❌ Reconnection failed after ${this.config.reconnect.maxAttempts} attempts`);
    return false;
  }

  /**
   * Update latency metrics with exponential moving average
   */
  private updateLatencyMetrics(latency: number): void {
    const alpha = 0.2; // Smoothing factor
    if (this.metrics.averageLatency === 0) {
      this.metrics.averageLatency = latency;
    } else {
      this.metrics.averageLatency = (alpha * latency) + ((1 - alpha) * this.metrics.averageLatency);
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoring.metricsInterval);
  }

  /**
   * Collect and emit metrics
   */
  private collectMetrics(): void {
    this.metrics.uptime = this.startTime > 0 ? Date.now() - this.startTime : 0;
    this.metrics.status = this.status;

    this.emit('redis:metrics', {
      ...this.metrics,
      timestamp: Date.now()
    });
  }

  /**
   * Update connection status and emit event
   */
  private setStatus(status: ConnectionStatus): void {
    const previousStatus = this.status;
    this.status = status;
    this.metrics.status = status;

    if (previousStatus !== status) {
      this.emit('redis:status:changed', {
        previousStatus,
        currentStatus: status,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get current health metrics
   */
  getMetrics(): HealthMetrics {
    return {
      ...this.metrics,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0
    };
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED;
  }

  /**
   * Get Redis client (use with caution during reconnection)
   */
  getClient(): RedisClientType | null {
    return this.client;
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    console.log('🔌 Disconnecting Redis Health Monitor...');

    this.stopHealthChecks();

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    if (this.client) {
      try {
        await this.client.quit();
      } catch (error) {
        console.warn('Warning during disconnect:', error);
      }
      this.client = null;
    }

    this.setStatus(ConnectionStatus.DISCONNECTED);

    this.emit('redis:disconnected', {
      timestamp: Date.now()
    });

    console.log('✅ Redis Health Monitor disconnected');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default RedisHealthMonitor;
