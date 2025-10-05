/**
 * Session Pool Optimizer - Usage Examples
 *
 * Demonstrates how to use the SessionPoolOptimizer for managing
 * 50+ concurrent agent sessions with efficient resource management.
 */

import { SessionPoolOptimizer } from '../src/coordination/v2/sdk/session-pool-optimizer.js';
import type { SessionRequest, PoolMetrics } from '../src/coordination/v2/sdk/session-pool-optimizer.js';

/**
 * Example 1: Basic Session Pool Setup
 */
async function basicPoolSetup() {
  console.log('=== Example 1: Basic Session Pool Setup ===\n');

  // Initialize pool with default configuration
  const pool = new SessionPoolOptimizer({
    maxPoolSize: 60,
    minPoolSize: 10,
    autoScaleThreshold: 80,
  });

  await pool.initialize();

  // Acquire session for an agent
  const session = await pool.acquireSession({
    agentId: 'agent-1',
    priority: 8,
    metadata: { task: 'feature-development' },
  });

  console.log(`Session acquired: ${session.sessionId}`);
  console.log(`Agent ID: ${session.agentId}`);
  console.log(`Priority: ${session.metadata.priority}`);

  // Release session
  await pool.releaseSession(session.sessionId);
  console.log('Session released back to pool\n');

  await pool.shutdown();
}

/**
 * Example 2: Handling 50+ Concurrent Agents
 */
async function handleConcurrentAgents() {
  console.log('=== Example 2: Handling 50+ Concurrent Agents ===\n');

  const pool = new SessionPoolOptimizer({
    maxPoolSize: 70,
    minPoolSize: 15,
    throttleLimit: 10,
  });

  await pool.initialize();

  // Simulate 55 concurrent agents
  const agentRequests: SessionRequest[] = [];
  for (let i = 0; i < 55; i++) {
    agentRequests.push({
      agentId: `concurrent-agent-${i}`,
      priority: Math.floor(Math.random() * 10),
      metadata: { index: i },
    });
  }

  // Acquire sessions concurrently
  console.log('Acquiring 55 sessions concurrently...');
  const sessions = await Promise.all(
    agentRequests.map((req) => pool.acquireSession(req))
  );

  const metrics = pool.getMetrics();
  console.log(`\nPool Metrics:`);
  console.log(`- Current pool size: ${metrics.currentPoolSize}`);
  console.log(`- Active sessions: ${metrics.activeSessions}`);
  console.log(`- Utilization: ${metrics.utilizationPercent.toFixed(1)}%`);
  console.log(`- Auto-scale events: ${metrics.autoScaleEvents}`);

  // Release all sessions
  await Promise.all(sessions.map((s) => pool.releaseSession(s.sessionId)));
  console.log('\nAll sessions released\n');

  await pool.shutdown();
}

/**
 * Example 3: Session Reuse and Efficiency
 */
async function sessionReuseExample() {
  console.log('=== Example 3: Session Reuse and Efficiency ===\n');

  const pool = new SessionPoolOptimizer({
    maxPoolSize: 30,
    minPoolSize: 5,
    enableReuse: true,
  });

  await pool.initialize();

  // Create and release sessions
  const session1 = await pool.acquireSession({
    agentId: 'agent-reuse-1',
    priority: 5,
  });
  console.log(`Session 1 created: ${session1.sessionId}`);
  await pool.releaseSession(session1.sessionId);

  // Acquire new session (should reuse idle session)
  const session2 = await pool.acquireSession({
    agentId: 'agent-reuse-2',
    priority: 6,
  });

  const metrics = pool.getMetrics();
  console.log(`\nReuse Statistics:`);
  console.log(`- Total sessions created: ${metrics.totalCreated}`);
  console.log(`- Total reuses: ${metrics.totalReuses}`);
  console.log(`- Idle sessions: ${metrics.idleSessions}`);

  await pool.releaseSession(session2.sessionId);
  await pool.shutdown();
}

/**
 * Example 4: Health Checks and Auto-Recovery
 */
async function healthCheckExample() {
  console.log('\n=== Example 4: Health Checks and Auto-Recovery ===\n');

  const pool = new SessionPoolOptimizer({
    maxPoolSize: 25,
    minPoolSize: 5,
    healthCheckIntervalMs: 5000, // 5 seconds
    enableAutoRecovery: true,
  });

  await pool.initialize();

  // Listen for health check events
  pool.on('health:checked', (event) => {
    console.log(`Health Check: ${event.healthyCount}/${event.totalChecked} healthy (${event.passRate.toFixed(1)}%)`);
  });

  // Create some sessions
  await pool.acquireSession({ agentId: 'health-agent-1', priority: 5 });
  await pool.acquireSession({ agentId: 'health-agent-2', priority: 6 });

  console.log('Waiting for health checks...');
  await new Promise((resolve) => setTimeout(resolve, 6000));

  const metrics = pool.getMetrics();
  console.log(`\nHealth Metrics:`);
  console.log(`- Health check pass rate: ${metrics.healthCheckPassRate.toFixed(1)}%`);
  console.log(`- Unhealthy sessions: ${metrics.unhealthySessions}`);

  await pool.shutdown();
}

/**
 * Example 5: Session Pinning for Critical Sessions
 */
async function sessionPinningExample() {
  console.log('\n=== Example 5: Session Pinning for Critical Sessions ===\n');

  const pool = new SessionPoolOptimizer({
    maxPoolSize: 20,
    minPoolSize: 5,
  });

  await pool.initialize();

  // Acquire critical session
  const criticalSession = await pool.acquireSession({
    agentId: 'critical-agent',
    priority: 10,
    metadata: { critical: true },
  });

  // Pin session to prevent eviction
  pool.pinSession(criticalSession.sessionId);
  console.log(`Critical session pinned: ${criticalSession.sessionId}`);

  const session = pool.getSession(criticalSession.sessionId);
  console.log(`Is pinned: ${session?.metadata.isPinned}`);

  // Later, unpin when no longer critical
  pool.unpinSession(criticalSession.sessionId);
  console.log('Session unpinned\n');

  await pool.releaseSession(criticalSession.sessionId);
  await pool.shutdown();
}

/**
 * Example 6: Metrics Monitoring
 */
async function metricsMonitoringExample() {
  console.log('=== Example 6: Metrics Monitoring ===\n');

  const pool = new SessionPoolOptimizer({
    maxPoolSize: 40,
    minPoolSize: 10,
  });

  await pool.initialize();

  // Create workload
  for (let i = 0; i < 15; i++) {
    await pool.acquireSession({
      agentId: `metrics-agent-${i}`,
      priority: Math.floor(Math.random() * 10),
    });
  }

  const metrics = pool.getMetrics();

  console.log('Pool Metrics Dashboard:');
  console.log('========================');
  console.log(`Pool Size: ${metrics.currentPoolSize} (max: 40)`);
  console.log(`Active Sessions: ${metrics.activeSessions}`);
  console.log(`Idle Sessions: ${metrics.idleSessions}`);
  console.log(`Utilization: ${metrics.utilizationPercent.toFixed(1)}%`);
  console.log(`\nLifetime Statistics:`);
  console.log(`Total Created: ${metrics.totalCreated}`);
  console.log(`Total Evicted: ${metrics.totalEvicted}`);
  console.log(`Total Reuses: ${metrics.totalReuses}`);
  console.log(`Avg Lifetime: ${(metrics.averageLifetimeMs / 1000).toFixed(2)}s`);
  console.log(`\nPerformance:`);
  console.log(`Request Rate: ${metrics.requestRate} req/s`);
  console.log(`Health Pass Rate: ${metrics.healthCheckPassRate.toFixed(1)}%`);
  console.log(`Auto-scale Events: ${metrics.autoScaleEvents}\n`);

  await pool.shutdown();
}

/**
 * Example 7: Event-Driven Architecture
 */
async function eventDrivenExample() {
  console.log('=== Example 7: Event-Driven Architecture ===\n');

  const pool = new SessionPoolOptimizer({
    maxPoolSize: 30,
    minPoolSize: 8,
  });

  // Set up event listeners
  pool.on('session:created', (event) => {
    console.log(`✓ Session created: ${event.sessionId} for ${event.agentId}`);
  });

  pool.on('session:reused', (event) => {
    console.log(`♻️  Session reused: ${event.sessionId} for ${event.agentId}`);
  });

  pool.on('session:released', (event) => {
    console.log(`↓ Session released: ${event.sessionId}`);
  });

  pool.on('pool:autoscaled', (event) => {
    console.log(`📈 Pool auto-scaled: ${event.previousSize} → ${event.newSize}`);
  });

  await pool.initialize();

  // Trigger events
  const session1 = await pool.acquireSession({ agentId: 'event-agent-1', priority: 7 });
  await pool.releaseSession(session1.sessionId);

  const session2 = await pool.acquireSession({ agentId: 'event-agent-2', priority: 8 });
  await pool.releaseSession(session2.sessionId);

  console.log('');
  await pool.shutdown();
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await basicPoolSetup();
    await handleConcurrentAgents();
    await sessionReuseExample();
    await healthCheckExample();
    await sessionPinningExample();
    await metricsMonitoringExample();
    await eventDrivenExample();

    console.log('✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  basicPoolSetup,
  handleConcurrentAgents,
  sessionReuseExample,
  healthCheckExample,
  sessionPinningExample,
  metricsMonitoringExample,
  eventDrivenExample,
};
