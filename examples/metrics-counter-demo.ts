/**
 * Metrics Counter Demo
 *
 * Demonstrates how to use the simple metrics counter API
 */

import {
  incrementMetric,
  recordGauge,
  recordTiming,
  measureExecution,
  trackProviderRouting,
  trackAgentSpawn,
  trackAPICall,
  trackError,
  getMetricValue,
  getMetricBreakdown,
} from '../src/observability/metrics-counter.js';

async function demo() {
  console.log('📊 Metrics Counter Demo\n');

  // ===== EXAMPLE 1: Simple Counter =====
  console.log('1️⃣  Simple Counters:');
  incrementMetric('user.login');
  incrementMetric('user.login');
  incrementMetric('user.login');
  console.log('   ✅ Tracked 3 user logins');

  // ===== EXAMPLE 2: Counter with Tags =====
  console.log('\n2️⃣  Counters with Tags:');
  incrementMetric('api.requests', 1, { endpoint: '/users', method: 'GET' });
  incrementMetric('api.requests', 1, { endpoint: '/users', method: 'POST' });
  incrementMetric('api.requests', 1, { endpoint: '/posts', method: 'GET' });
  console.log('   ✅ Tracked API requests with endpoint/method tags');

  // ===== EXAMPLE 3: Gauge Values =====
  console.log('\n3️⃣  Gauge Values:');
  recordGauge('queue.size', 42);
  recordGauge('active.connections', 15, { region: 'us-east-1' });
  recordGauge('cpu.usage', 67.5, { unit: 'percent' });
  console.log('   ✅ Recorded queue size, connections, CPU usage');

  // ===== EXAMPLE 4: Timing Metrics =====
  console.log('\n4️⃣  Timing Metrics:');
  recordTiming('database.query', 45, { query: 'SELECT' });
  recordTiming('database.query', 120, { query: 'INSERT' });
  console.log('   ✅ Recorded database query timings');

  // ===== EXAMPLE 5: Automatic Timing with measureExecution =====
  console.log('\n5️⃣  Automatic Execution Timing:');
  const result = await measureExecution('task.process', async () => {
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
    return { processed: 100 };
  }, { taskType: 'data-import' });
  console.log(`   ✅ Measured execution: ${result.processed} items processed`);

  // ===== EXAMPLE 6: Provider Routing Tracking =====
  console.log('\n6️⃣  Provider Routing:');
  trackProviderRouting('custom', 'Tier 2: Z.ai', 'coder', 'fallback');
  trackProviderRouting('custom', 'Tier 2: Z.ai', 'researcher', 'fallback');
  trackProviderRouting('anthropic', 'Tier 1: Subscription', 'coordinator', 'tier-config');
  console.log('   ✅ Tracked 3 provider routing decisions');

  // ===== EXAMPLE 7: Agent Lifecycle Tracking =====
  console.log('\n7️⃣  Agent Lifecycle:');
  trackAgentSpawn('coder', 'swarm-123', 'mesh');
  trackAgentSpawn('tester', 'swarm-123', 'mesh');
  console.log('   ✅ Tracked 2 agent spawns');

  // ===== EXAMPLE 8: API Call Tracking =====
  console.log('\n8️⃣  API Call Tracking:');
  trackAPICall('/api/users', 'GET', 200, 45);
  trackAPICall('/api/users', 'POST', 201, 120);
  trackAPICall('/api/posts', 'GET', 200, 30);
  console.log('   ✅ Tracked 3 API calls with status codes');

  // ===== EXAMPLE 9: Error Tracking =====
  console.log('\n9️⃣  Error Tracking:');
  trackError('ValidationError', 'user-service', 'low');
  trackError('DatabaseConnectionError', 'database', 'critical');
  console.log('   ✅ Tracked 2 errors with severity levels');

  // ===== EXAMPLE 10: Query Metrics =====
  console.log('\n🔟 Query Metrics:');
  const loginCount = getMetricValue('user.login');
  console.log(`   Login count: ${loginCount}`);

  const apiBreakdown = getMetricBreakdown('api.requests', 'endpoint');
  console.log('   API requests by endpoint:');
  Object.entries(apiBreakdown).forEach(([endpoint, count]) => {
    console.log(`     ${endpoint}: ${count} requests`);
  });

  const providerBreakdown = getMetricBreakdown('provider.request', 'provider');
  console.log('   Provider routing breakdown:');
  Object.entries(providerBreakdown).forEach(([provider, count]) => {
    const name = provider === 'custom' ? 'Z.ai' : provider;
    console.log(`     ${name}: ${count} requests`);
  });

  console.log('\n✅ Demo complete! All metrics tracked successfully.\n');
}

// Run demo
demo().catch(console.error);
