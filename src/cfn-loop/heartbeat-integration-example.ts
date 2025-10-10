/**
 * Heartbeat Warning System Integration Example
 *
 * Demonstrates how to integrate heartbeat monitoring with blocking coordination
 * for dead coordinator detection in CFN Loop workflows.
 *
 * Sprint 1.2: Dead Coordinator Detection
 *
 * @module cfn-loop/heartbeat-integration-example
 */

import Redis from 'ioredis';
import {
  HeartbeatWarningSystem,
  createHeartbeatWarningSystem,
  type HeartbeatWarning,
} from './heartbeat-warning-system.js';
import {
  BlockingCoordinationSignals,
  createBlockingCoordinationSignals,
  SignalType,
} from './blocking-coordination-signals.js';

// ===== EXAMPLE USAGE =====

async function main() {
  console.log('🚀 Heartbeat Warning System Integration Example\n');

  // Initialize Redis client
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });

  await new Promise<void>((resolve, reject) => {
    redis.once('ready', resolve);
    redis.once('error', reject);
  });

  console.log('✅ Redis connected\n');

  // Initialize blocking coordination signals
  const signalSystem = createBlockingCoordinationSignals({
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379'),
    signalTTL: 86400, // 24 hours
    enableIdempotency: true,
  });

  await signalSystem.connect();

  console.log('✅ Blocking Coordination Signals initialized\n');

  // Initialize heartbeat warning system
  const warningSystem = createHeartbeatWarningSystem({
    redisClient: redis,
    monitorInterval: 10000, // 10 seconds
    staleThreshold: 120000, // 120 seconds (2 minutes)
    maxWarnings: 3, // 3 consecutive warnings before marking as DEAD
    autoCleanup: true,
    debug: true,
  });

  console.log('✅ Heartbeat Warning System initialized\n');

  // ===== SET UP EVENT LISTENERS =====

  // Listen for heartbeat warnings
  warningSystem.on('heartbeat:warning', (warning: HeartbeatWarning) => {
    console.log(`⚠️  HEARTBEAT WARNING:`, {
      coordinator: warning.coordinatorId,
      health: warning.health,
      staleDuration: `${Math.round(warning.staleDuration / 1000)}s`,
      consecutiveWarnings: `${warning.consecutiveWarnings}/3`,
      reason: warning.reason,
    });
  });

  // Listen for coordinator recovery
  warningSystem.on('coordinator:recovered', (event: any) => {
    console.log(`✅ Coordinator recovered:`, {
      coordinator: event.coordinatorId,
      previousWarnings: event.previousWarnings,
    });
  });

  // Listen for dead coordinator events
  warningSystem.on('coordinator:dead', (event: any) => {
    console.log(`💀 COORDINATOR DEAD:`, {
      coordinator: event.coordinatorId,
      reason: event.reason,
      consecutiveWarnings: event.consecutiveWarnings,
    });
  });

  // Listen for cleanup events
  warningSystem.on('cleanup:complete', (event: any) => {
    console.log(`🧹 Cleanup complete:`, {
      coordinator: event.coordinatorId,
      keysDeleted: event.keysDeleted,
    });
  });

  // Listen for continuity violations
  warningSystem.on('continuity:violation', (event: any) => {
    console.log(`⚠️  Heartbeat sequence gap:`, {
      coordinator: event.coordinatorId,
      expected: event.expectedSequence,
      received: event.receivedSequence,
      gap: event.gap,
    });
  });

  // Listen for critical errors
  warningSystem.on('error', (error: Error) => {
    console.error(`🚨 CRITICAL ERROR:`, error.message);
  });

  console.log('✅ Event listeners configured\n');

  // ===== START MONITORING =====

  console.log('🔍 Starting heartbeat monitoring...\n');
  warningSystem.startMonitoring();

  // ===== SIMULATE COORDINATOR ACTIVITY =====

  // Coordinator 1: Healthy coordinator sending regular heartbeats
  const coordinator1 = 'coordinator-healthy';
  let iteration1 = 0;

  const heartbeatTimer1 = setInterval(async () => {
    iteration1++;

    // Register heartbeat
    await warningSystem.registerHeartbeat(coordinator1, iteration1, {
      phase: 'auth',
      agentCount: 5,
      status: 'running',
    });

    // Send heartbeat signal
    await signalSystem.sendSignal(
      coordinator1,
      'coordinator-healthy',
      SignalType.HEARTBEAT,
      iteration1,
      { status: 'healthy' }
    );

    console.log(`💓 [${coordinator1}] Heartbeat sent (iteration ${iteration1})`);
  }, 30000); // Every 30 seconds (well within 120s threshold)

  // Coordinator 2: Coordinator that will go silent (simulate dead coordinator)
  const coordinator2 = 'coordinator-silent';
  let iteration2 = 0;

  // Send initial heartbeat
  await warningSystem.registerHeartbeat(coordinator2, iteration2, {
    phase: 'profile',
    agentCount: 3,
    status: 'running',
  });

  console.log(`💓 [${coordinator2}] Initial heartbeat sent\n`);

  // Coordinator 2 goes silent after initial heartbeat
  // Warning system will detect stale heartbeat after 120 seconds

  // ===== RUN FOR 5 MINUTES =====

  console.log('⏱️  Running example for 5 minutes...\n');
  console.log('Expected behavior:');
  console.log('  1. coordinator-healthy: Regular heartbeats every 30s (no warnings)');
  console.log('  2. coordinator-silent: No heartbeats → warnings after 120s → DEAD after 3 warnings\n');

  // Wait 5 minutes
  await new Promise((resolve) => setTimeout(resolve, 300000));

  // ===== CLEANUP =====

  console.log('\n🧹 Cleaning up...\n');

  clearInterval(heartbeatTimer1);
  warningSystem.stopMonitoring();

  // Show final statistics
  const stats = warningSystem.getStatistics();
  console.log('📊 Final Statistics:', stats);

  await signalSystem.disconnect();
  await redis.quit();

  console.log('\n✅ Example complete');
}

// ===== SIMPLIFIED USAGE EXAMPLE =====

/**
 * Basic usage pattern for heartbeat monitoring
 */
async function basicUsageExample() {
  // 1. Initialize Redis
  const redis = new Redis();

  // 2. Create heartbeat warning system
  const warningSystem = createHeartbeatWarningSystem({
    redisClient: redis,
    monitorInterval: 10000, // Check every 10 seconds
    staleThreshold: 120000, // Warn if >120 seconds without heartbeat
    maxWarnings: 3, // Mark as DEAD after 3 consecutive warnings
    autoCleanup: true, // Automatically cleanup dead coordinator state
  });

  // 3. Set up event listeners
  warningSystem.on('heartbeat:warning', (warning) => {
    console.log(`Warning: ${warning.coordinatorId} stale for ${warning.staleDuration}ms`);
  });

  warningSystem.on('coordinator:dead', (event) => {
    console.error(`CRITICAL: ${event.coordinatorId} marked as DEAD - ${event.reason}`);
    // Handle dead coordinator (e.g., spawn replacement, notify admin)
  });

  // 4. Start monitoring
  warningSystem.startMonitoring();

  // 5. Register heartbeats in your coordinator
  const coordinatorId = 'my-coordinator';
  let iteration = 0;

  setInterval(async () => {
    iteration++;
    await warningSystem.registerHeartbeat(coordinatorId, iteration, {
      phase: 'current-phase',
      agentCount: 5,
    });
  }, 30000); // Every 30 seconds

  // 6. Stop monitoring when done
  // warningSystem.stopMonitoring();
}

// ===== RUN EXAMPLE =====

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Example failed:', error);
    process.exit(1);
  });
}

export { main, basicUsageExample };
