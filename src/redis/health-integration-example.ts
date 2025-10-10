/**
 * Redis Health Monitor Integration Example
 *
 * Demonstrates how to integrate RedisHealthMonitor with:
 * - Blocking Coordination Manager
 * - Event Bus Coordination
 * - Fleet Health Monitoring
 * - CFN Loop Orchestration
 */

import { RedisHealthMonitor, ConnectionStatus } from './RedisHealthMonitor';
import { EventEmitter } from 'events';

/**
 * Example: Integration with Blocking Coordination
 */
export class CoordinationWithHealthMonitor extends EventEmitter {
  private healthMonitor: RedisHealthMonitor;
  private isPaused = false;
  private operationQueue: Array<() => Promise<void>> = [];

  constructor() {
    super();

    // Initialize health monitor
    this.healthMonitor = new RedisHealthMonitor({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      },
      health: {
        checkInterval: 5000,      // 5 seconds
        checkTimeout: 2000,       // 2 seconds
        failureThreshold: 3       // 3 consecutive failures
      },
      reconnect: {
        maxAttempts: 3,
        delays: [1000, 2000, 4000, 8000], // Exponential backoff
        resetOnSuccess: true
      },
      monitoring: {
        enabled: true,
        metricsInterval: 10000    // 10 seconds
      }
    });

    this.setupHealthListeners();
  }

  /**
   * Set up health event listeners
   */
  private setupHealthListeners(): void {
    // Connection established
    this.healthMonitor.on('redis:connected', (event) => {
      console.log('✅ Redis connected:', event);
      this.resumeOperations();
    });

    // Connection lost - pause coordination
    this.healthMonitor.on('redis:connection:lost', (event) => {
      console.warn('⚠️ Redis connection lost:', event);
      this.pauseOperations();
    });

    // Reconnection in progress
    this.healthMonitor.on('redis:reconnecting', (event) => {
      console.log(`🔄 Reconnecting (attempt ${event.attempt}/${event.maxAttempts})...`);
    });

    // Reconnection successful
    this.healthMonitor.on('redis:reconnected', (event) => {
      console.log(`✅ Reconnected after ${event.totalAttempts} attempts`);
      this.resumeOperations();
    });

    // All reconnection attempts failed
    this.healthMonitor.on('redis:failed', (event) => {
      console.error('❌ Redis reconnection failed:', event);
      this.emit('coordination:critical', {
        reason: 'redis_unavailable',
        error: event.lastError
      });
    });

    // Health check results
    this.healthMonitor.on('redis:health:check', (result) => {
      if (!result.healthy) {
        console.warn('⚠️ Health check failed:', result.error);
      }
    });

    // Metrics for monitoring
    this.healthMonitor.on('redis:metrics', (metrics) => {
      this.emit('coordination:metrics', {
        redis: metrics,
        queuedOperations: this.operationQueue.length,
        isPaused: this.isPaused
      });
    });
  }

  /**
   * Start coordination with health monitoring
   */
  async start(): Promise<void> {
    console.log('🚀 Starting coordination with health monitoring...');
    await this.healthMonitor.connect();
  }

  /**
   * Pause operations during Redis unavailability
   */
  private pauseOperations(): void {
    if (this.isPaused) return;

    this.isPaused = true;
    console.log('⏸️ Pausing coordination operations');

    this.emit('coordination:paused', {
      reason: 'redis_unavailable',
      queuedOperations: this.operationQueue.length,
      timestamp: Date.now()
    });
  }

  /**
   * Resume operations after reconnection
   */
  private async resumeOperations(): Promise<void> {
    if (!this.isPaused) return;

    this.isPaused = false;
    console.log('▶️ Resuming coordination operations');

    // Process queued operations
    const queuedCount = this.operationQueue.length;
    if (queuedCount > 0) {
      console.log(`📤 Processing ${queuedCount} queued operations...`);

      const queue = [...this.operationQueue];
      this.operationQueue = [];

      for (const operation of queue) {
        try {
          await operation();
        } catch (error) {
          console.error('❌ Failed to process queued operation:', error);
          // Re-queue if still failing
          this.operationQueue.push(operation);
        }
      }
    }

    this.emit('coordination:resumed', {
      processedOperations: queuedCount - this.operationQueue.length,
      remainingQueue: this.operationQueue.length,
      timestamp: Date.now()
    });
  }

  /**
   * Execute coordination operation with graceful degradation
   */
  async executeOperation(operation: () => Promise<void>): Promise<void> {
    // If Redis is unavailable, queue the operation
    if (this.isPaused || !this.healthMonitor.isConnected()) {
      console.log('📥 Queueing operation (Redis unavailable)');
      this.operationQueue.push(operation);
      return;
    }

    // Execute immediately
    try {
      await operation();
    } catch (error) {
      console.error('❌ Operation failed:', error);

      // Check if Redis is still healthy
      const healthCheck = await this.healthMonitor.performHealthCheck();
      if (!healthCheck.healthy) {
        // Re-queue for later
        this.operationQueue.push(operation);
      } else {
        // Operation failed for other reasons
        throw error;
      }
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return {
      connected: this.healthMonitor.isConnected(),
      status: this.healthMonitor.getStatus(),
      metrics: this.healthMonitor.getMetrics(),
      isPaused: this.isPaused,
      queuedOperations: this.operationQueue.length
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down coordination...');

    // Process remaining queued operations with timeout
    if (this.operationQueue.length > 0) {
      console.log(`📤 Processing ${this.operationQueue.length} remaining operations...`);

      const timeout = 30000; // 30 seconds
      const deadline = Date.now() + timeout;

      while (this.operationQueue.length > 0 && Date.now() < deadline) {
        const operation = this.operationQueue.shift();
        if (operation) {
          try {
            await operation();
          } catch (error) {
            console.error('❌ Failed to process operation during shutdown:', error);
          }
        }
      }

      if (this.operationQueue.length > 0) {
        console.warn(`⚠️ ${this.operationQueue.length} operations remaining (timeout reached)`);
      }
    }

    await this.healthMonitor.disconnect();
    console.log('✅ Coordination shutdown complete');
  }
}

/**
 * Example: Usage with CFN Loop Orchestration
 */
export async function exampleCFNLoopIntegration() {
  const coordination = new CoordinationWithHealthMonitor();

  // Listen to coordination events
  coordination.on('coordination:critical', (event) => {
    console.error('🚨 CRITICAL: Coordination failure', event);
    // Escalate to Loop 4 Product Owner
  });

  coordination.on('coordination:metrics', (metrics) => {
    // Send metrics to monitoring dashboard
    console.log('📊 Coordination metrics:', {
      redisStatus: metrics.redis.status,
      redisLatency: metrics.redis.averageLatency.toFixed(2) + 'ms',
      queuedOps: metrics.queuedOperations,
      paused: metrics.isPaused
    });
  });

  // Start coordination
  await coordination.start();

  // Example: Execute blocking coordination ACK
  await coordination.executeOperation(async () => {
    console.log('📡 Publishing coordination ACK...');
    // Actual Redis pub/sub operation here
  });

  // Example: Check health before critical operation
  const health = coordination.getHealthStatus();
  if (!health.connected) {
    console.warn('⚠️ Redis not connected, operation queued');
  }

  // Graceful shutdown
  await coordination.shutdown();
}

/**
 * Example: Standalone health monitoring
 */
export async function exampleStandaloneHealthMonitoring() {
  const monitor = new RedisHealthMonitor({
    redis: {
      host: 'localhost',
      port: 6379
    }
  });

  // Set up event listeners
  monitor.on('redis:connected', () => {
    console.log('✅ Connected to Redis');
  });

  monitor.on('redis:reconnecting', (event) => {
    console.log(`🔄 Reconnecting... (attempt ${event.attempt}, delay ${event.delay}ms)`);
  });

  monitor.on('redis:reconnected', (event) => {
    console.log(`✅ Reconnected after ${event.totalAttempts} attempts`);
  });

  monitor.on('redis:failed', (event) => {
    console.error(`❌ Connection failed after ${event.totalAttempts} attempts`);
    console.error('Last error:', event.lastError);
  });

  monitor.on('redis:metrics', (metrics) => {
    console.log('📊 Metrics:', {
      status: metrics.status,
      uptime: (metrics.uptime / 1000).toFixed(1) + 's',
      avgLatency: metrics.averageLatency.toFixed(2) + 'ms',
      checks: metrics.totalChecks,
      failures: metrics.totalFailures,
      reconnects: `${metrics.reconnectSuccess}/${metrics.reconnectAttempts}`
    });
  });

  // Connect
  await monitor.connect();

  // Get current metrics
  const metrics = monitor.getMetrics();
  console.log('Current metrics:', metrics);

  // Perform manual health check
  const healthCheck = await monitor.performHealthCheck();
  console.log('Health check:', healthCheck);

  // Later: disconnect
  await monitor.disconnect();
}

/**
 * Example: Integration with Fleet Health Monitor
 */
export class FleetHealthIntegration {
  private redisHealth: RedisHealthMonitor;
  private fleetHealth: Map<string, any> = new Map();

  constructor() {
    this.redisHealth = new RedisHealthMonitor({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379')
      }
    });

    // Integrate with fleet monitoring
    this.redisHealth.on('redis:metrics', (metrics) => {
      this.updateFleetHealth('redis', metrics);
    });

    this.redisHealth.on('redis:connection:lost', () => {
      this.updateFleetHealth('redis', { status: 'critical', issue: 'connection_lost' });
    });
  }

  async start() {
    await this.redisHealth.connect();
  }

  private updateFleetHealth(component: string, health: any) {
    this.fleetHealth.set(component, {
      ...health,
      timestamp: Date.now()
    });

    // Emit aggregated fleet health
    console.log('Fleet health updated:', {
      component,
      status: health.status || health.issue,
      timestamp: Date.now()
    });
  }

  getAggregatedHealth() {
    return {
      redis: this.redisHealth.getMetrics(),
      fleet: Object.fromEntries(this.fleetHealth),
      overallStatus: this.calculateOverallStatus()
    };
  }

  private calculateOverallStatus(): string {
    const redisHealth = this.redisHealth.getStatus();

    if (redisHealth === ConnectionStatus.CONNECTED) {
      return 'healthy';
    } else if (redisHealth === ConnectionStatus.RECONNECTING) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }
}

// Export examples for documentation
export default {
  CoordinationWithHealthMonitor,
  exampleCFNLoopIntegration,
  exampleStandaloneHealthMonitoring,
  FleetHealthIntegration
};
