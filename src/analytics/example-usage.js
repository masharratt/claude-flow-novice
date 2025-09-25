/**
 * Example usage of the Claude Flow Analytics Pipeline
 * This file demonstrates how to use the analytics system
 */

import AnalyticsPipeline from './index.js';

async function demonstrateAnalyticsPipeline() {
  console.log('🚀 Claude Flow Analytics Pipeline Demo\n');

  // Initialize the analytics pipeline
  const analytics = new AnalyticsPipeline({
    hiveDbPath: '.hive-mind/hive.db',
    swarmDbPath: '.swarm/memory.db',
    metricsPath: '.claude-flow/metrics',
    enableMonitoring: true,
    enableDashboard: true
  });

  try {
    // 1. Initialize the pipeline
    console.log('1️⃣  Initializing Analytics Pipeline');
    const initResult = await analytics.initialize();
    console.log('Result:', initResult.message);

    // 2. Get system status
    console.log('\n2️⃣  Checking System Status');
    const status = await analytics.getSystemStatus();
    console.log('System Status:', {
      databases_connected: status.analytics.databases_connected,
      monitoring_active: status.analytics.monitoring_active,
      memory_usage: `${status.metrics.memory_usage?.toFixed(1)}%`,
      cpu_load: status.metrics.cpu_load?.toFixed(2),
      alerts: status.alerts.length,
      recommendations: status.recommendations.length
    });

    // 3. Generate comprehensive report
    console.log('\n3️⃣  Generating Comprehensive Report');
    const report = await analytics.generateReport('json');
    console.log('Report Generated:', {
      timestamp: report.timestamp,
      components: Object.keys(report.components),
      has_optimizations: !!report.components.optimizations,
      has_personalized: !!report.components.personalized_suggestions
    });

    // 4. Get optimization suggestions
    console.log('\n4️⃣  Getting Optimization Suggestions');
    const optimizations = await analytics.getOptimizations('high', 'performance');
    console.log('High-Priority Performance Optimizations:', {
      total: optimizations.total,
      suggestions: optimizations.suggestions.slice(0, 2).map(s => s.title)
    });

    // 5. Get personalized suggestions
    console.log('\n5️⃣  Getting Personalized Suggestions');
    const personalized = await analytics.getPersonalizedSuggestions();
    console.log('Personalized Suggestions:', {
      user_profile: personalized.user?.experience_level,
      immediate_actions: personalized.suggestions.immediate?.length || 0,
      short_term_goals: personalized.suggestions.shortTerm?.length || 0,
      learning_opportunities: personalized.suggestions.learning?.length || 0
    });

    // 6. Learn from patterns
    console.log('\n6️⃣  Learning from Successful Patterns');
    const patterns = await analytics.updateLearningPatterns();
    console.log('Pattern Learning:', {
      successful_configs: patterns.successful_configurations?.length || 0,
      learned_insights: patterns.learned_insights?.length || 0,
      recommendations: patterns.recommendations?.length || 0
    });

    // 7. Export report
    console.log('\n7️⃣  Exporting Analytics Report');
    await analytics.exportReport('json', '.claude-flow/reports/demo-report.json');
    console.log('Report exported to: .claude-flow/reports/demo-report.json');

    // 8. Start dashboard (simulation)
    console.log('\n8️⃣  Dashboard Status');
    const dashboard = await analytics.startDashboard(3001);
    console.log('Dashboard Info:', {
      port: dashboard.port,
      path: dashboard.path,
      data_available: !!dashboard.data
    });

    // 9. Show CLI capabilities
    console.log('\n9️⃣  CLI Interface Available');
    console.log('Use the following commands:');
    console.log('  - analytics.cli.showAnalyticsSummary()');
    console.log('  - analytics.cli.showOptimizationSuggestions()');
    console.log('  - analytics.cli.showPersonalizedSuggestions()');
    console.log('  - analytics.cli.exportAnalyticsReport(format, path)');

    // 10. Cleanup
    console.log('\n🔟 Shutting Down');
    const shutdownResult = await analytics.shutdown();
    console.log('Shutdown:', shutdownResult.message);

    console.log('\n✅ Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

/**
 * Example CLI usage
 */
async function demonstrateCLIUsage() {
  console.log('\n🖥️  CLI Usage Examples\n');

  const analytics = new AnalyticsPipeline();
  await analytics.initialize();

  // Show analytics summary
  console.log('📊 Analytics Summary:');
  await analytics.cli.showAnalyticsSummary({ verbose: false });

  // Show optimization suggestions
  console.log('\n🚀 Optimization Suggestions:');
  await analytics.cli.showOptimizationSuggestions({ detailed: false });

  // Show personalized suggestions
  console.log('\n👤 Personalized Recommendations:');
  await analytics.cli.showPersonalizedSuggestions();

  await analytics.shutdown();
}

/**
 * Example of analyzing specific tasks
 */
async function demonstrateTaskAnalysis() {
  console.log('\n🔍 Task Analysis Examples\n');

  const analytics = new AnalyticsPipeline();
  await analytics.initialize();

  try {
    // This would work if you have actual task IDs in your database
    // const taskInsights = await analytics.analyzeTask('task-123');
    // console.log('Task Analysis:', taskInsights);

    // Show how to use CLI for task analysis
    console.log('CLI Task Analysis:');
    console.log('Use: analytics.cli.showTaskInsights("task-id")');

  } catch (error) {
    console.log('Note: Task analysis requires actual task data in the database');
    console.log('Error:', error.message);
  }

  await analytics.shutdown();
}

/**
 * Example of monitoring integration
 */
async function demonstrateMonitoring() {
  console.log('\n📈 Monitoring Integration Examples\n');

  const analytics = new AnalyticsPipeline({
    enableMonitoring: true
  });

  await analytics.initialize();

  // Set up event listeners
  analytics.monitoring.on('monitoring:started', () => {
    console.log('✅ Monitoring started');
  });

  analytics.monitoring.on('snapshot:captured', (snapshot) => {
    console.log('📸 Performance snapshot captured:', {
      timestamp: snapshot.timestamp,
      alerts: snapshot.alerts?.length || 0
    });
  });

  analytics.monitoring.on('alerts:triggered', (alerts) => {
    console.log('🚨 Alerts triggered:', alerts.length);
    alerts.forEach(alert => {
      console.log(`  - ${alert.severity.toUpperCase()}: ${alert.message}`);
    });
  });

  // Let monitoring run for a short time
  console.log('Monitoring will run for 10 seconds...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  await analytics.shutdown();
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runAllExamples() {
    try {
      await demonstrateAnalyticsPipeline();
      // await demonstrateCLIUsage();
      // await demonstrateTaskAnalysis();
      // await demonstrateMonitoring();
    } catch (error) {
      console.error('Example execution failed:', error.message);
    }
  }

  runAllExamples();
}

export {
  demonstrateAnalyticsPipeline,
  demonstrateCLIUsage,
  demonstrateTaskAnalysis,
  demonstrateMonitoring
};