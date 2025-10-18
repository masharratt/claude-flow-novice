/**
 * Test Provider Routing Telemetry
 *
 * Tests tiered routing with telemetry to measure API calls to:
 * - Z.ai (Tier 2 default)
 * - Anthropic subscription (Tier 1)
 * - Anthropic explicit (Tier 3)
 */

const { TelemetrySystem } = require('../.claude-flow-novice/dist/src/observability/telemetry.js');
const { TieredProviderRouter } = require('../.claude-flow-novice/dist/src/providers/tiered-router.js');

async function testRoutingTelemetry() {
  console.log('🔬 Testing Provider Routing Telemetry\n');

  // Initialize telemetry
  const telemetry = new TelemetrySystem({
    enableTracing: true,
    enableMetrics: true,
    enableStructuredLogging: true,
  });

  telemetry.initialize();

  // Listen to metric events
  const metricEvents = [];
  telemetry.on('metric:counter', (metric) => {
    if (metric.name === 'provider.request') {
      metricEvents.push(metric);
      console.log(`📊 Metric: ${metric.tags.provider} via ${metric.tags.tier} (agent: ${metric.tags.agentType})`);
    }
  });

  telemetry.on('metric:gauge', (metric) => {
    if (metric.name === 'subscription.usage') {
      console.log(`📈 Subscription: ${metric.value}/${metric.tags.limit} (${metric.tags.remaining} remaining)`);
    }
  });

  // Create tiered router with injected telemetry instance
  const router = new TieredProviderRouter(
    undefined, // Use default tier config
    { used: 0, limit: 5 }, // Mock subscription: 5 requests limit
    undefined, // Use default agents directory
    telemetry // Inject telemetry instance to capture metrics
  );

  console.log('🎯 Test Scenario: Simulate 10 agent requests\n');

  // Test 1: Default agents (should use Z.ai)
  console.log('--- Test 1: Default agents (Z.ai expected) ---');
  for (let i = 0; i < 3; i++) {
    await router.selectProvider('coder');
  }

  // Test 2: Coordinator agents (should use subscription until exhausted)
  console.log('\n--- Test 2: Coordinator agents (subscription expected) ---');
  for (let i = 0; i < 4; i++) {
    await router.selectProvider('coordinator');
  }

  // Test 3: More coordinator agents (subscription exhausted, fallback to Z.ai)
  console.log('\n--- Test 3: More coordinators (fallback to Z.ai expected) ---');
  for (let i = 0; i < 3; i++) {
    await router.selectProvider('coordinator');
  }

  // Wait for metrics flush
  await new Promise(resolve => setTimeout(resolve, 100));

  // Analyze results
  console.log('\n📊 === TELEMETRY RESULTS ===\n');

  const providerBreakdown = {};
  const tierBreakdown = {};
  const sourceBreakdown = {};

  metricEvents.forEach(metric => {
    const provider = metric.tags.provider;
    const tier = metric.tags.tier;
    const source = metric.tags.source;

    providerBreakdown[provider] = (providerBreakdown[provider] || 0) + metric.value;
    tierBreakdown[tier] = (tierBreakdown[tier] || 0) + metric.value;
    sourceBreakdown[source] = (sourceBreakdown[source] || 0) + metric.value;
  });

  console.log('By Provider:');
  Object.entries(providerBreakdown).forEach(([provider, count]) => {
    console.log(`  ${provider}: ${count} requests`);
  });

  console.log('\nBy Tier:');
  Object.entries(tierBreakdown).forEach(([tier, count]) => {
    console.log(`  ${tier}: ${count} requests`);
  });

  console.log('\nBy Source:');
  Object.entries(sourceBreakdown).forEach(([source, count]) => {
    console.log(`  ${source}: ${count} requests`);
  });

  // Get subscription usage
  const subUsage = router.getSubscriptionUsage();
  console.log('\n📊 Subscription Usage:');
  console.log(`  Used: ${subUsage.used}/${subUsage.limit}`);
  console.log(`  Remaining: ${subUsage.limit - subUsage.used}`);

  // Validate expectations
  console.log('\n✅ === VALIDATION ===\n');

  const zaiCount = providerBreakdown['custom'] || 0;
  const anthropicCount = providerBreakdown['anthropic'] || 0;

  console.log(`Z.ai requests: ${zaiCount} (expected: 5 - 3 coder + 2 fallback)`);
  console.log(`Anthropic requests: ${anthropicCount} (expected: 5 - subscription limit reached)`);

  if (zaiCount === 5 && anthropicCount === 5) {
    console.log('\n✅ SUCCESS: Telemetry correctly tracked routing decisions!');
    console.log('   - Z.ai received 3 coder requests via profile override');
    console.log('   - Subscription tier consumed all 5 slots for coordinators');
    console.log('   - 2 coordinator requests fell back to Z.ai after limit');
    console.log('   - All 10 requests were measured correctly');
  } else {
    console.log('\n❌ UNEXPECTED: Metric counts differ from expected');
  }

  // Query telemetry directly
  console.log('\n📈 === TELEMETRY QUERY ===\n');
  const providerMetrics = telemetry.getMetrics('provider.request');
  console.log(`Total provider.request metrics: ${providerMetrics.length}`);

  const throughput = telemetry.getThroughputMetrics('provider.request', 60000);
  console.log(`Throughput: ${throughput.requestsPerSecond.toFixed(2)} req/s`);
  console.log(`Success rate: ${(throughput.successRate * 100).toFixed(1)}%`);

  // Cleanup
  telemetry.shutdown();

  console.log('\n🎉 Test complete!\n');
}

// Run test
testRoutingTelemetry().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
