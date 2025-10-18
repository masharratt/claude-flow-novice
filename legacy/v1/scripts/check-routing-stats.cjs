/**
 * Check Provider Routing Statistics
 *
 * Queries telemetry to show routing breakdown from recent swarm execution
 */

const { TelemetrySystem, getGlobalTelemetry } = require('../.claude-flow-novice/dist/src/observability/telemetry.js');

async function checkRoutingStats() {
  console.log('📊 Provider Routing Statistics\n');
  console.log('=' .repeat(60));

  try {
    // Get global telemetry instance
    const telemetry = getGlobalTelemetry();

    // Query provider request metrics
    const providerMetrics = telemetry.getMetrics('provider.request', 300000); // Last 5 minutes

    if (providerMetrics.length === 0) {
      console.log('\n⚠️  No routing metrics found in the last 5 minutes.');
      console.log('   This may be because:');
      console.log('   - Telemetry was initialized in a different process');
      console.log('   - No tiered routing requests were made');
      console.log('   - Metrics have expired (5 min window)');
      console.log('\nTo test routing, run: node scripts/test-routing-telemetry.cjs\n');
      return;
    }

    console.log(`\n✅ Found ${providerMetrics.length} routing metrics\n`);

    // Aggregate by provider
    const providerBreakdown = {};
    const tierBreakdown = {};
    const agentTypeBreakdown = {};
    const sourceBreakdown = {};

    providerMetrics.forEach(metric => {
      const provider = metric.tags.provider || 'unknown';
      const tier = metric.tags.tier || 'unknown';
      const agentType = metric.tags.agentType || 'unknown';
      const source = metric.tags.source || 'unknown';

      providerBreakdown[provider] = (providerBreakdown[provider] || 0) + metric.value;
      tierBreakdown[tier] = (tierBreakdown[tier] || 0) + metric.value;
      agentTypeBreakdown[agentType] = (agentTypeBreakdown[agentType] || 0) + metric.value;
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + metric.value;
    });

    // Display results
    console.log('📍 BY PROVIDER:');
    console.log('-'.repeat(60));
    Object.entries(providerBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([provider, count]) => {
        const percentage = ((count / providerMetrics.length) * 100).toFixed(1);
        const providerName = provider === 'custom' ? 'Z.ai (free tier)' :
                           provider === 'anthropic' ? 'Anthropic API' : provider;
        console.log(`  ${providerName.padEnd(30)} ${count.toString().padStart(3)} requests (${percentage}%)`);
      });

    console.log('\n🎯 BY TIER:');
    console.log('-'.repeat(60));
    Object.entries(tierBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([tier, count]) => {
        const percentage = ((count / providerMetrics.length) * 100).toFixed(1);
        console.log(`  ${tier.padEnd(30)} ${count.toString().padStart(3)} requests (${percentage}%)`);
      });

    console.log('\n🤖 BY AGENT TYPE:');
    console.log('-'.repeat(60));
    Object.entries(agentTypeBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([agentType, count]) => {
        const percentage = ((count / providerMetrics.length) * 100).toFixed(1);
        console.log(`  ${agentType.padEnd(30)} ${count.toString().padStart(3)} requests (${percentage}%)`);
      });

    console.log('\n🔀 BY ROUTING SOURCE:');
    console.log('-'.repeat(60));
    Object.entries(sourceBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([source, count]) => {
        const percentage = ((count / providerMetrics.length) * 100).toFixed(1);
        console.log(`  ${source.padEnd(30)} ${count.toString().padStart(3)} requests (${percentage}%)`);
      });

    // Check for subscription metrics
    const subMetrics = telemetry.getMetrics('subscription.usage', 300000);
    if (subMetrics.length > 0) {
      const latestSub = subMetrics[subMetrics.length - 1];
      console.log('\n📈 SUBSCRIPTION USAGE:');
      console.log('-'.repeat(60));
      console.log(`  Used:      ${latestSub.value}/${latestSub.tags.limit}`);
      console.log(`  Remaining: ${latestSub.tags.remaining}`);
      console.log(`  Status:    ${latestSub.value >= parseInt(latestSub.tags.limit) ? '⚠️  LIMIT REACHED' : '✅ Available'}`);
    }

    // Throughput analysis
    const throughput = telemetry.getThroughputMetrics('provider.request', 300000);
    console.log('\n⚡ THROUGHPUT ANALYSIS:');
    console.log('-'.repeat(60));
    console.log(`  Total requests:    ${throughput.totalRequests}`);
    console.log(`  Requests/sec:      ${throughput.requestsPerSecond.toFixed(2)}`);
    console.log(`  Time window:       Last 5 minutes`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Routing statistics retrieved successfully\n');

  } catch (error) {
    console.error('❌ Error retrieving routing statistics:', error.message);
    console.error('\nThis may happen if telemetry is not initialized.');
    console.error('Try running a routing test first: node scripts/test-routing-telemetry.cjs\n');
  }
}

// Run stats check
checkRoutingStats().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
