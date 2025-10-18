/**
 * Persistent Metrics Demo
 *
 * Demonstrates:
 * 1. Metrics persist across restarts (stored in SQLite)
 * 2. Query historical metrics
 * 3. Aggregate metrics from multiple runs
 */

import { incrementMetric, trackProviderRouting } from '../src/observability/metrics-counter.js';
import { getGlobalMetricsStorage } from '../src/observability/metrics-storage.js';

async function demo() {
  console.log('📊 Persistent Metrics Demo\n');
  console.log('=' .repeat(60));

  const storage = getGlobalMetricsStorage();

  // Show database stats FIRST (to see if we have previous data)
  const stats = storage.getStats();
  console.log('\n📈 Database Stats (BEFORE adding new metrics):');
  console.log(`  Total metrics stored: ${stats.totalMetrics}`);
  console.log(`  Unique metric names: ${stats.uniqueNames}`);
  console.log(`  Oldest metric: ${stats.oldestMetric || 'N/A'}`);
  console.log(`  Newest metric: ${stats.newestMetric || 'N/A'}`);
  console.log(`  Database size: ${stats.dbSizeMB} MB`);

  if (stats.totalMetrics > 0) {
    console.log('\n✅ Found previous metrics! They persisted across restarts.');
  } else {
    console.log('\n🆕 No previous metrics found. This is a fresh database.');
  }

  // Add new metrics in THIS run
  console.log('\n➕ Adding new metrics in THIS run...');

  incrementMetric('demo.run.count');
  incrementMetric('user.actions', 1, { action: 'click', page: 'home' });
  incrementMetric('user.actions', 1, { action: 'submit', page: 'form' });

  trackProviderRouting('custom', 'Tier 2: Z.ai', 'coder', 'fallback');
  trackProviderRouting('anthropic', 'Tier 1: Subscription', 'coordinator', 'tier-config');

  console.log('  ✅ Added 5 metrics');

  // Query metrics from ALL time (including previous runs)
  console.log('\n🔍 Querying ALL historical metrics...');

  const totalRuns = storage.getCounterTotal('demo.run.count');
  console.log(`\n  Total demo runs (across ALL sessions): ${totalRuns}`);

  const userActions = storage.getSummary('user.actions');
  if (userActions) {
    console.log(`\n  User actions summary:`);
    console.log(`    Total actions: ${userActions.count}`);
    console.log(`    By action type:`);
    Object.entries(userActions.tags.action || {}).forEach(([action, count]) => {
      console.log(`      ${action}: ${count}`);
    });
  }

  const providerBreakdown = storage.getBreakdown('provider.request', 'provider');
  console.log(`\n  Provider routing breakdown (ALL time):`);
  Object.entries(providerBreakdown).forEach(([provider, count]) => {
    const name = provider === 'custom' ? 'Z.ai' : provider;
    console.log(`    ${name}: ${count} requests`);
  });

  // Show final stats
  const finalStats = storage.getStats();
  console.log('\n📊 Database Stats (AFTER adding new metrics):');
  console.log(`  Total metrics stored: ${finalStats.totalMetrics}`);
  console.log(`  Database size: ${finalStats.dbSizeMB} MB`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Demo complete!\n');
  console.log('💡 TIP: Run this script multiple times to see metrics accumulate:');
  console.log('   npx tsx examples/persistent-metrics-demo.ts\n');
  console.log('📂 Database location: .claude-flow/metrics.db\n');
}

// Run demo
demo().catch(console.error);
