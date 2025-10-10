/**
 * Redis Health Monitor Integration Example - Sprint 1.3
 *
 * Demonstrates how to integrate Redis health monitoring with blocking coordination.
 * Shows proper health check setup, event handling, and graceful degradation.
 *
 * Epic: production-blocking-coordination
 * Sprint: 1.3 - Redis Health Check
 *
 * @module cfn-loop/redis-health-integration-example
 */

import Redis from 'ioredis';
import {
  RedisHealthMonitor,
  RedisConnectionState,
  createRedisHealthMonitor,
} from './redis-health-monitor.js';
import { BlockingCoordinationManager } from './blocking-coordination.js';
import { HeartbeatWarningSystem } from './heartbeat-warning-system.js';

// ===== CONFIGURATION =====

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  retryStrategy: (times: number) => {
    // Exponential backoff with max 5s delay
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
};

// ===== INTEGRATION EXAMPLE =====

async function main() {
  console.log('🚀 Starting Redis Health Monitor Integration Example\n');

  // Step 1: Create Redis client
  console.log('📡 Step 1: Creating Redis client...');
  const redis = new Redis(REDIS_CONFIG);

  // Step 2: Create health monitor
  console.log('🏥 Step 2: Creating Redis health monitor...');
  const healthMonitor = createRedisHealthMonitor({
    redisClient: redis,
    healthCheckInterval: 50000, // 50 seconds (10 iterations × 5s)
    pingTimeout: 5000, // 5 second detection target
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectDelayMs: 5000, // 5 second delay between attempts
    debug: true,
  });

  // Step 3: Set up event listeners
  console.log('👂 Step 3: Setting up event listeners...\n');

  healthMonitor.on('redis:connected', (event) => {
    console.log('✅ Redis Connected:', event);
  });

  healthMonitor.on('redis:disconnected', (event) => {
    console.log('❌ Redis Disconnected:', event);
  });

  healthMonitor.on('redis:reconnecting', (event) => {
    console.log(
      `🔄 Redis Reconnecting (attempt ${event.attempt}/${event.maxAttempts}):`,
      event
    );
  });

  healthMonitor.on('redis:state:change', (change) => {
    console.log('🔀 Redis State Changed:', {
      from: change.previousState,
      to: change.newState,
      reason: change.reason,
    });
  });

  healthMonitor.on('redis:reconnect:failed', (event) => {
    console.log('💥 Redis Reconnect Failed:', event);
  });

  healthMonitor.on('monitoring:started', (event) => {
    console.log('🎯 Monitoring Started:', event);
  });

  healthMonitor.on('monitoring:stopped', (event) => {
    console.log('⏹️  Monitoring Stopped:', event);
  });

  // Step 4: Wait for initial connection
  console.log('⏳ Step 4: Waiting for Redis connection...');
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Redis connection timeout'));
    }, 10000);

    redis.once('ready', () => {
      clearTimeout(timeout);
      console.log('✅ Redis connection established\n');
      resolve();
    });

    redis.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  // Step 5: Perform initial health check
  console.log('🔍 Step 5: Performing initial health check...');
  const initialCheck = await healthMonitor.performHealthCheck();
  console.log('Health Check Result:', initialCheck);
  console.log('Connection State:', healthMonitor.getConnectionState());
  console.log('Statistics:', healthMonitor.getStatistics(), '\n');

  // Step 6: Start periodic monitoring
  console.log('🔄 Step 6: Starting periodic health monitoring...');
  healthMonitor.startMonitoring();

  // Step 7: Create blocking coordination manager (optional integration)
  console.log('🔗 Step 7: Creating blocking coordination manager...');
  const blockingCoordination = new BlockingCoordinationManager({
    redisClient: redis,
    coordinatorId: 'example-coordinator-1',
    ackTtl: 3600,
    debug: true,
    hmacSecret: process.env.BLOCKING_COORDINATION_SECRET || 'test-secret-key-123',
  });

  // Step 8: Create heartbeat warning system (optional integration)
  console.log('💓 Step 8: Creating heartbeat warning system...');
  const heartbeatSystem = new HeartbeatWarningSystem({
    redisClient: redis,
    monitorInterval: 10000, // 10 seconds
    staleThreshold: 120000, // 2 minutes
    maxWarnings: 3,
    autoCleanup: true,
    debug: true,
  });

  // Start heartbeat monitoring
  heartbeatSystem.startMonitoring();

  // Step 9: Demonstrate health-aware operations
  console.log('\n🎭 Step 9: Demonstrating health-aware operations...\n');

  // Perform operations with health check
  async function performHealthAwareOperation(operation: () => Promise<void>, name: string) {
    console.log(`📝 Attempting operation: ${name}`);

    if (!healthMonitor.isHealthy()) {
      console.log(`⚠️  Redis unhealthy, operation deferred: ${name}`);
      return;
    }

    try {
      await operation();
      console.log(`✅ Operation succeeded: ${name}\n`);
    } catch (error) {
      console.log(`❌ Operation failed: ${name}`, error instanceof Error ? error.message : error, '\n');
    }
  }

  // Example operations
  await performHealthAwareOperation(async () => {
    await redis.set('test:key1', 'value1');
  }, 'Set test key');

  await performHealthAwareOperation(async () => {
    const value = await redis.get('test:key1');
    console.log(`   Retrieved value: ${value}`);
  }, 'Get test key');

  await performHealthAwareOperation(async () => {
    await heartbeatSystem.registerHeartbeat('example-coordinator-1', 1, {
      phase: 'example',
      agentCount: 1,
      status: 'running',
    });
  }, 'Register heartbeat');

  // Step 10: Simulate disconnection and reconnection
  console.log('🔌 Step 10: Simulating disconnection and reconnection...\n');

  console.log('Disconnecting Redis in 3 seconds...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('💔 Disconnecting...');
  await redis.disconnect();

  console.log('Waiting 2 seconds...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('Checking health after disconnect...');
  const disconnectedCheck = await healthMonitor.performHealthCheck();
  console.log('Health Check Result:', disconnectedCheck);
  console.log('Connection State:', healthMonitor.getConnectionState(), '\n');

  console.log('Reconnecting Redis...');
  await redis.connect();

  console.log('Waiting 2 seconds...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('Checking health after reconnect...');
  const reconnectedCheck = await healthMonitor.performHealthCheck();
  console.log('Health Check Result:', reconnectedCheck);
  console.log('Connection State:', healthMonitor.getConnectionState(), '\n');

  // Step 11: Display final statistics
  console.log('📊 Step 11: Final Statistics\n');

  const healthStats = healthMonitor.getStatistics();
  console.log('Health Monitor Statistics:', {
    totalChecks: healthStats.totalHealthChecks,
    successfulChecks: healthStats.successfulChecks,
    failedChecks: healthStats.failedChecks,
    successRate: `${(healthStats.successRate * 100).toFixed(1)}%`,
    reconnectAttempts: healthStats.reconnectAttempts,
    successfulReconnects: healthStats.successfulReconnects,
    reconnectSuccessRate: `${(healthStats.reconnectSuccessRate * 100).toFixed(1)}%`,
    averageLatency: `${healthStats.averageLatencyMs.toFixed(2)}ms`,
    currentState: healthStats.currentState,
  });

  const heartbeatStats = heartbeatSystem.getStatistics();
  console.log('\nHeartbeat System Statistics:', heartbeatStats);

  // Step 12: Cleanup
  console.log('\n🧹 Step 12: Cleaning up...');

  // Stop monitoring
  heartbeatSystem.stopMonitoring();
  healthMonitor.stopMonitoring();

  // Cleanup resources
  await blockingCoordination.cleanup();
  await healthMonitor.cleanup();

  // Close Redis connection
  await redis.quit();

  console.log('✅ Cleanup complete\n');
  console.log('🎉 Integration example complete!');
}

// ===== ERROR HANDLING WRAPPER =====

async function runWithErrorHandling() {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error('💥 Integration example failed:', error);
    process.exit(1);
  }
}

// ===== EXECUTION =====

// Run example if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runWithErrorHandling();
}

// ===== EXPORTS =====

export { main as runRedisHealthIntegrationExample };
