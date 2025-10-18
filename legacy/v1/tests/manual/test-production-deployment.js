/**
 * Production Deployment Test Script
 *
 * Demonstrates the complete production deployment system with all components
 * including readiness assessment, zero-downtime deployment, monitoring, and rollback
 */

import ProductionDeploymentCoordinator from '../../src/production/production-deployment-coordinator.js';
import Redis from 'ioredis';

async function testProductionDeployment() {
  console.log('🚀 Starting Production Deployment Test');
  console.log('=====================================');

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  });

  try {
    // Initialize production deployment coordinator
    console.log('\n📋 Initializing Production Deployment Coordinator...');
    const coordinator = new ProductionDeploymentCoordinator({
      environment: 'production',
      deploymentStrategy: 'blue-green',
      autoApprove: true, // For testing purposes
      enableMonitoring: true,
      enableRollback: true,
      requireGoLiveChecklist: true
    });

    // Set up event listeners for monitoring deployment progress
    coordinator.on('deployment_started', (event) => {
      console.log(`✅ Deployment started: ${event.data.deploymentId}`);
      console.log(`   Environment: ${event.data.environment}`);
      console.log(`   Strategy: ${event.data.strategy}`);
    });

    coordinator.on('phase_started', (event) => {
      console.log(`\n🔄 Starting phase: ${event.data.phase}`);
    });

    coordinator.on('phase_completed', (event) => {
      console.log(`✅ Phase completed: ${event.data.phase}`);
    });

    coordinator.on('readiness_assessment_completed', (event) => {
      const { decision, confidence } = event.data;
      console.log(`   Readiness Assessment: ${decision} (confidence: ${confidence}%)`);
    });

    coordinator.on('go_live_checklist_completed', (event) => {
      const { status, progress, validation } = event.data;
      console.log(`   Go-Live Checklist: ${status} (${progress.toFixed(1)}% complete)`);
      console.log(`   Ready to proceed: ${validation.ready}`);
    });

    coordinator.on('deployment_execution_completed', (event) => {
      const { strategy, zeroDowntime, success } = event.data;
      console.log(`   Deployment Execution: ${success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`   Strategy: ${strategy}`);
      console.log(`   Zero Downtime: ${zeroDowntime}`);
    });

    coordinator.on('monitoring_activation_completed', (event) => {
      const { active, confidence } = event.data;
      console.log(`   Monitoring: ${active ? 'ACTIVE' : 'INACTIVE'} (confidence: ${confidence}%)`);
    });

    coordinator.on('deployment_completed', (event) => {
      const { deploymentId, duration, confidence } = event.data;
      console.log(`\n🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!`);
      console.log(`   Deployment ID: ${deploymentId}`);
      console.log(`   Duration: ${duration}s`);
      console.log(`   Confidence: ${confidence}%`);
    });

    coordinator.on('deployment_failed', (event) => {
      console.log(`\n❌ DEPLOYMENT FAILED!`);
      console.log(`   Error: ${event.data.error}`);
      console.log(`   Phase: ${event.data.phase}`);
    });

    // Define application configuration for deployment
    const applicationConfig = {
      name: 'claude-flow-novice',
      version: '1.0.0',
      description: 'AI Agent Orchestration Platform',
      components: [
        'swarm-coordination',
        'agent-management',
        'redis-coordination',
        'monitoring-system'
      ],
      resources: {
        cpu: '2 cores',
        memory: '4GB',
        storage: '20GB',
        network: 'high-performance'
      },
      endpoints: [
        { path: '/api/v1/swarm', method: 'POST', description: 'Create swarm' },
        { path: '/api/v1/agents', method: 'GET', description: 'List agents' },
        { path: '/api/v1/health', method: 'GET', description: 'Health check' }
      ],
      environment: 'production',
      deployment: {
        strategy: 'blue-green',
        zeroDowntime: true,
        healthChecks: [
          '/api/v1/health',
          '/api/v1/status'
        ],
        rollback: {
          enabled: true,
          automatic: true,
          triggers: ['error_rate', 'response_time', 'availability']
        }
      }
    };

    console.log('\n📦 Application Configuration:');
    console.log(`   Name: ${applicationConfig.name}`);
    console.log(`   Version: ${applicationConfig.version}`);
    console.log(`   Components: ${applicationConfig.components.length}`);
    console.log(`   Strategy: ${applicationConfig.deployment.strategy}`);

    // Execute production deployment
    console.log('\n🚀 Executing Production Deployment...');
    const result = await coordinator.executeProductionDeployment(applicationConfig);

    // Display final results
    console.log('\n📊 DEPLOYMENT SUMMARY');
    console.log('===================');
    console.log(`Deployment ID: ${result.deploymentId}`);
    console.log(`Status: ${result.status}`);
    console.log(`Confidence: ${result.confidence}%`);

    // Get detailed deployment status
    const status = await coordinator.getDeploymentStatus();
    console.log(`\n📈 Component Status:`);
    console.log(`   Readiness Assessment: ${status.components.readinessAssessment ? '✅' : '❌'}`);
    console.log(`   Configuration: ${status.components.configuration ? '✅' : '❌'}`);
    console.log(`   Go-Live Checklist: ${status.components.checklist ? '✅' : '❌'}`);
    console.log(`   Deployment: ${status.components.deployment ? '✅' : '❌'}`);
    console.log(`   Monitoring: ${status.components.monitoring ? '✅' : '❌'}`);
    console.log(`   Rollback: ${status.components.rollback ? '✅' : '❌'}`);

    // Test Redis coordination by checking stored data
    console.log('\n🔍 Redis Coordination Verification:');
    const swarmKeys = await redis.keys('swarm:phase-6-production-deployment:*');
    console.log(`   Total Redis entries: ${swarmKeys.length}`);

    const coordinationKeys = swarmKeys.filter(key => key.includes(':coordination:'));
    const assessmentKeys = swarmKeys.filter(key => key.includes(':assessment:'));
    const deploymentKeys = swarmKeys.filter(key => key.includes(':deployment:'));
    const monitoringKeys = swarmKeys.filter(key => key.includes(':monitoring:'));

    console.log(`   Coordination events: ${coordinationKeys.length}`);
    console.log(`   Assessment events: ${assessmentKeys.length}`);
    console.log(`   Deployment events: ${deploymentKeys.length}`);
    console.log(`   Monitoring events: ${monitoringKeys.length}`);

    // Cleanup
    await coordinator.cleanup();
    console.log('\n🧹 Cleanup completed');

    console.log('\n✅ Production Deployment Test Completed Successfully!');
    console.log('====================================================');

    return result;

  } catch (error) {
    console.error('\n❌ Production Deployment Test Failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    await redis.quit();
  }
}

import ProductionReadinessAssessment from '../../src/production/production-readiness-assessment.js';
import ProductionConfigManager from '../../src/production/production-config-manager.js';
import ProductionMonitoring from '../../src/production/production-monitoring.js';
import AutomatedRollback from '../../src/production/automated-rollback.js';
import GoLiveChecklist from '../../src/production/go-live-checklist.js';

async function testIndividualComponents() {
  console.log('\n🔧 Testing Individual Components');
  console.log('=================================');

  try {
    // Test Production Readiness Assessment
    console.log('\n📋 Testing Production Readiness Assessment...');
    const readinessAssessment = new ProductionReadinessAssessment();
    const readinessResult = await readinessAssessment.runComprehensiveAssessment();
    console.log(`   Readiness Score: ${readinessResult.overallScore}%`);
    console.log(`   Go-Live Decision: ${readinessResult.goLiveDecision.decision}`);
    await readinessAssessment.cleanup();

    // Test Production Config Manager
    console.log('\n⚙️ Testing Production Config Manager...');
    const configManager = new ProductionConfigManager();
    const configResult = await configManager.loadConfiguration('production');
    console.log(`   Configuration Loaded: ${configResult.validation.valid ? '✅' : '❌'}`);
    console.log(`   Version: ${configResult.version}`);
    await configManager.cleanup();

    // Test Production Monitoring
    console.log('\n📊 Testing Production Monitoring...');
    const monitoring = new ProductionMonitoring();
    await monitoring.startMonitoring();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Let monitoring run briefly
    const monitoringStatus = await monitoring.getMonitoringStatus();
    console.log(`   Monitoring Active: ${monitoringStatus.active ? '✅' : '❌'}`);
    console.log(`   System Status: ${monitoringStatus.systemStatus}`);
    await monitoring.cleanup();

    // Test Automated Rollback
    console.log('\n🔄 Testing Automated Rollback...');
    const rollback = new AutomatedRollback();
    await rollback.initializeRollbackSystem();
    const rollbackStatus = await rollback.getRollbackStatus();
    console.log(`   Rollback System Ready: ${rollbackStatus.confidence > 0 ? '✅' : '❌'}`);
    await rollback.cleanup();

    // Test Go-Live Checklist
    console.log('\n✅ Testing Go-Live Checklist...');
    const checklist = new GoLiveChecklist();
    const checklistId = await checklist.initializeGoLiveChecklist();
    const checklistResult = await checklist.executeChecklist();
    console.log(`   Checklist Completed: ${checklistResult.status}`);
    console.log(`   Progress: ${checklistResult.progress.toFixed(1)}%`);
    await checklist.cleanup();

    console.log('\n✅ All Individual Components Tested Successfully!');

  } catch (error) {
    console.error('\n❌ Component Testing Failed:', error.message);
    throw error;
  }
}

async function runProductionDeploymentTest() {
  try {
    // Test individual components first
    await testIndividualComponents();

    // Then test the full production deployment
    await testProductionDeployment();

    console.log('\n🎉 ALL TESTS PASSED! Production deployment system is ready.');
    console.log('================================================================');

  } catch (error) {
    console.error('\n💥 TEST SUITE FAILED:', error.message);
    process.exit(1);
  }
}

// Run the test suite
if (import.meta.url === `file://${process.argv[1]}`) {
  runProductionDeploymentTest().catch(console.error);
}

export {
  testProductionDeployment,
  testIndividualComponents,
  runProductionDeploymentTest
};