/**
 * Phase 6 Insights Engine Demo
 * Demonstrates the integrated high-ROI insights engine functionality
 */

import InsightsEngine from './insights-engine.js';

async function runDemo() {
  console.log('🚀 Starting Phase 6 Insights Engine Demo...');
  
  const engine = new InsightsEngine({
    redis: {
      host: 'localhost',
      port: 6379
    },
    regions: ['us-east', 'us-west', 'eu-west', 'asia-pacific'],
    analysis: {
      interval: 10000 // 10 seconds for demo
    }
  });

  try {
    // Initialize the engine
    console.log('📋 Initializing insights engine...');
    await engine.initialize();
    
    // Set up event listeners
    engine.on('analysis-completed', (insights) => {
      console.log('📊 Analysis completed:', {
        totalInsights: insights.summary.totalInsights,
        highROIInsights: insights.summary.highROIInsights,
        recommendations: insights.summary.recommendations,
        estimatedValue: `$${insights.summary.estimatedValue.toLocaleString()}`
      });
    });

    engine.on('insights-published', (insights) => {
      console.log('📢 Insights published to Redis channel');
    });

    engine.on('error', (error) => {
      console.error('❌ Engine error:', error.message);
    });

    // Start the engine
    console.log('▶️ Starting insights engine...');
    await engine.start();
    
    // Let it run for a few cycles
    console.log('⏳ Running analysis cycles for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Get comprehensive report
    console.log('📈 Generating comprehensive report...');
    const report = await engine.getComprehensiveReport();
    
    console.log('\n=== PHASE 6 INSIGHTS ENGINE REPORT ===');
    console.log('Status:', report.status.isRunning ? 'ACTIVE' : 'INACTIVE');
    console.log('Analysis Cycles:', report.status.analysisCycles);
    console.log('Regions:', report.status.regions.join(', '));
    console.log('Uptime:', Math.round(report.status.uptime / 1000) + 's');
    
    if (report.insights.current) {
      console.log('\n📊 Latest Insights:');
      console.log('- Total Insights:', report.insights.current.summary.totalInsights);
      console.log('- High ROI Insights:', report.insights.current.summary.highROIInsights);
      console.log('- Recommendations:', report.insights.current.summary.recommendations);
      console.log('- Estimated Value:', `$${report.insights.current.summary.estimatedValue.toLocaleString()}`);
      
      if (report.insights.current.summary.fleetHealth) {
        console.log('- Fleet Health:', report.insights.current.summary.fleetHealth.status);
        console.log('- Fleet Health Score:', report.insights.current.summary.fleetHealth.score);
      }
    }
    
    if (report.fleet) {
      console.log('\n🌍 Fleet Overview:');
      console.log('- Total Regions:', report.fleet.summary.totalRegions);
      console.log('- Average Latency:', Math.round(report.fleet.summary.averageLatency) + 'ms');
      console.log('- Average CPU:', Math.round(report.fleet.summary.averageCPU) + '%');
      console.log('- Total Cost:', `$${report.fleet.summary.totalCost.toFixed(0)}`);
      console.log('- Total Alerts:', report.fleet.summary.totalAlerts);
    }
    
    if (report.regionalComparison) {
      console.log('\n📍 Regional Comparison:');
      Object.entries(report.regionalComparison).forEach(([region, data]) => {
        console.log(`- ${region}:`, {
          latency: Math.round(data.performance.latency) + 'ms',
          cpu: Math.round(data.performance.cpu) + '%',
          cost: '$' + data.costs.total.toFixed(0),
          alerts: data.alerts
        });
      });
    }
    
    if (report.swarmMemory) {
      console.log('\n🧠 Swarm Memory:');
      console.log('- Latest Analysis:', new Date(report.swarmMemory.timestamp).toISOString());
      console.log('- Insights Count:', report.swarmMemory.insightsCount);
      console.log('- Recommendations Count:', report.swarmMemory.recommendationsCount);
      console.log('- Overall Confidence:', Math.round(report.swarmMemory.confidence * 100) + '%');
    }
    
    // Stop the engine
    console.log('\n🛑 Stopping insights engine...');
    await engine.stop();
    
    console.log('✅ Demo completed successfully!');
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down demo...');
  process.exit(0);
});

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo();
}

export default runDemo;
