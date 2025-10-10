/**
 * Fleet Monitoring Integration Test
 *
 * Comprehensive test for the complete Phase 4 Fleet Monitoring System
 * Tests all components: Dashboard, Predictive Maintenance, Automated Healing, Alert System
 */

import { FleetMonitoringDashboard } from './FleetMonitoringDashboard.js';
import { PredictiveMaintenance } from './PredictiveMaintenance.js';
import { AutomatedHealing } from './AutomatedHealing.js';
import { AlertSystem } from './AlertSystem.js';
import { createClient } from 'redis';

/**
 * Fleet Monitoring Integration Test Suite
 */
export class FleetMonitoringIntegrationTest {
  constructor(config = {}) {
    this.config = {
      redis: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379,
        password: config.redis?.password || null,
        db: config.redis?.db || 0
      },
      testDuration: config.testDuration || 60000, // 1 minute
      dataDir: config.dataDir || './data/fleet-monitoring-test'
    };

    // Test components
    this.dashboard = null;
    this.predictiveMaintenance = null;
    this.automatedHealing = null;
    this.alertSystem = null;
    this.redisClient = null;

    // Test state
    this.isRunning = false;
    this.testResults = {
      startTime: null,
      endTime: null,
      metricsCollected: 0,
      predictionsGenerated: 0,
      healingActions: 0,
      alertsSent: 0,
      errors: [],
      successes: []
    };

    // Monitoring
    this.testMetrics = {
      dashboardUpdates: 0,
      predictionsProcessed: 0,
      healingWorkflows: 0,
      alertsProcessed: 0,
      redisMessages: 0
    };
  }

  /**
   * Run comprehensive integration test
   */
  async runIntegrationTest() {
    console.log('🧪 Starting Fleet Monitoring Integration Test...');

    try {
      this.testResults.startTime = Date.now();
      this.isRunning = true;

      // Initialize all components
      await this.initializeComponents();

      // Start all components
      await this.startComponents();

      // Run test scenarios
      await this.runTestScenarios();

      // Wait for test duration
      await this.waitForTestCompletion();

      // Collect test results
      await this.collectTestResults();

      // Validate integration
      const validationResults = await this.validateIntegration();

      // Generate test report
      const testReport = this.generateTestReport(validationResults);

      console.log('✅ Fleet Monitoring Integration Test completed');
      console.log('📊 Test Report:', testReport.summary);

      return testReport;

    } catch (error) {
      console.error('❌ Integration test failed:', error);
      this.testResults.errors.push({
        timestamp: Date.now(),
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Initialize all monitoring components
   */
  async initializeComponents() {
    console.log('🔧 Initializing monitoring components...');

    // Initialize Redis client for testing
    this.redisClient = createClient(this.config.redis);
    await this.redisClient.connect();

    // Initialize Fleet Monitoring Dashboard
    this.dashboard = new FleetMonitoringDashboard({
      redis: this.config.redis,
      dataDir: `${this.config.dataDir}/dashboard`,
      updateInterval: 1000, // 1-second updates
      logLevel: 'info'
    });
    await this.dashboard.initialize();

    // Initialize Predictive Maintenance
    this.predictiveMaintenance = new PredictiveMaintenance({
      redis: this.config.redis,
      dataDir: `${this.config.dataDir}/predictive`
    });
    await this.predictiveMaintenance.initialize();

    // Initialize Automated Healing
    this.automatedHealing = new AutomatedHealing({
      redis: this.config.redis,
      dataDir: `${this.config.dataDir}/healing`
    });
    await this.automatedHealing.initialize();

    // Initialize Alert System
    this.alertSystem = new AlertSystem({
      redis: this.config.redis,
      dataDir: `${this.config.dataDir}/alerts`,
      thresholds: {
        performance: { latency: 100, throughput: 1000, errorRate: 5.0 },
        health: { availability: 99.9, diskUsage: 85, memoryUsage: 85, cpuUsage: 80 },
        utilization: { nodeUtilization: 90, clusterUtilization: 85 },
        cost: { hourlyCost: 100, dailyBudget: 2000 }
      }
    });
    await this.alertSystem.initialize();

    console.log('✅ All components initialized');
  }

  /**
   * Start all monitoring components
   */
  async startComponents() {
    console.log('▶️ Starting monitoring components...');

    // Set up event listeners for monitoring
    this.setupEventListeners();

    // Start components
    await this.dashboard.start();
    await this.predictiveMaintenance.start();
    await this.automatedHealing.start();
    await this.alertSystem.start();

    console.log('✅ All components started');
  }

  /**
   * Set up event listeners for monitoring integration
   */
  setupEventListeners() {
    // Dashboard events
    this.dashboard.on('metrics', (metrics) => {
      this.testMetrics.dashboardUpdates++;
      this.testResults.metricsCollected++;

      // Process metrics through predictive maintenance
      if (this.predictiveMaintenance) {
        this.predictiveMaintenance.analyzeMetrics(metrics);
      }
    });

    this.dashboard.on('alert', (alert) => {
      if (this.alertSystem) {
        this.alertSystem.sendAlert(alert);
      }
    });

    // Predictive maintenance events
    this.predictiveMaintenance.on('prediction', (prediction) => {
      this.testMetrics.predictionsProcessed++;
      this.testResults.predictionsGenerated++;

      // Send healing request if critical prediction
      if (prediction.severity === 'CRITICAL' && this.automatedHealing) {
        this.automatedHealing.processHealingRequest({
          type: prediction.type,
          nodeId: prediction.nodeId,
          severity: prediction.severity,
          confidence: prediction.confidence,
          recommendations: prediction.recommendations
        });
      }

      // Send alert for prediction
      if (this.alertSystem) {
        this.alertSystem.sendAlert({
          type: 'PREDICTION_ALERT',
          severity: prediction.severity,
          title: `ML Prediction: ${prediction.type}`,
          message: prediction.message,
          nodeId: prediction.nodeId,
          value: prediction.confidence,
          threshold: 0.7
        });
      }
    });

    // Automated healing events
    this.automatedHealing.on('workflow_started', (workflow) => {
      this.testMetrics.healingWorkflows++;
      this.testResults.healingActions++;
    });

    this.automatedHealing.on('workflow_completed', (workflow) => {
      if (workflow.status === 'COMPLETED') {
        this.testResults.successes.push({
          timestamp: Date.now(),
          type: 'healing_workflow',
          workflowId: workflow.id,
          action: workflow.action
        });
      }
    });

    // Alert system events
    this.alertSystem.on('alert_sent', (alert) => {
      this.testMetrics.alertsProcessed++;
      this.testResults.alertsSent++;
    });

    // Redis message monitoring
    this.monitorRedisMessages();
  }

  /**
   * Monitor Redis messages for coordination
   */
  async monitorRedisMessages() {
    const subscriber = this.redisClient.duplicate();
    await subscriber.connect();

    // Subscribe to monitoring channels
    await subscriber.subscribe('swarm:phase-4:monitoring', (message) => {
      this.testMetrics.redisMessages++;
    });

    await subscriber.subscribe('swarm:phase-4:alerts', (message) => {
      this.testMetrics.redisMessages++;
    });

    await subscriber.subscribe('swarm:phase-4:healing', (message) => {
      this.testMetrics.redisMessages++;
    });
  }

  /**
   * Run test scenarios
   */
  async runTestScenarios() {
    console.log('🎭 Running test scenarios...');

    // Scenario 1: Node failure prediction
    await this.testNodeFailurePrediction();

    // Scenario 2: Performance anomaly detection
    await this.testPerformanceAnomaly();

    // Scenario 3: Fleet-wide stress test
    await this.testFleetStress();

    // Scenario 4: Alert escalation
    await this.testAlertEscalation();

    // Scenario 5: Healing workflow execution
    await this.testHealingWorkflow();

    console.log('✅ Test scenarios completed');
  }

  /**
   * Test node failure prediction
   */
  async testNodeFailurePrediction() {
    console.log('🔮 Testing node failure prediction...');

    // Create high-risk node metrics
    const highRiskMetrics = {
      timestamp: Date.now(),
      nodes: [{
        id: 'test-node-001',
        name: 'Test Node 1',
        type: 'worker',
        metrics: {
          performance: {
            latency: 200, // High latency
            throughput: 500, // Low throughput
            errorRate: 15, // High error rate
            cpuUsage: 95, // Critical CPU usage
            memoryUsage: 90, // High memory usage
            diskUsage: 95, // Critical disk usage
            operations: 5000
          },
          health: {
            status: 'degraded',
            availability: 85, // Low availability
            uptime: 100000
          },
          utilization: {
            overall: 93,
            cpu: 95,
            memory: 90,
            disk: 95,
            network: 80
          },
          cost: {
            hourly: 10,
            daily: 240
          }
        }
      }],
      fleet: {
        totalNodes: 1,
        healthyNodes: 0,
        averageLatency: 200,
        totalThroughput: 500,
        availability: 85,
        utilization: 93,
        hourlyCost: 10
      }
    };

    // Process metrics through predictive maintenance
    const predictions = await this.predictiveMaintenance.analyzeMetrics(highRiskMetrics);

    // Verify predictions were generated
    if (predictions.length > 0) {
      console.log(`✅ Generated ${predictions.length} failure predictions`);
      this.testResults.successes.push({
        timestamp: Date.now(),
        type: 'node_failure_prediction',
        predictions: predictions.length
      });
    } else {
      console.warn('⚠️ No failure predictions generated for high-risk node');
    }
  }

  /**
   * Test performance anomaly detection
   */
  async testPerformanceAnomaly() {
    console.log('🔍 Testing performance anomaly detection...');

    // Create anomalous metrics
    const anomalousMetrics = {
      timestamp: Date.now(),
      nodes: [{
        id: 'test-node-002',
        name: 'Test Node 2',
        type: 'worker',
        metrics: {
          performance: {
            latency: 500, // Extremely high latency (anomaly)
            throughput: 2000, // High throughput (normal)
            errorRate: 2, // Normal error rate
            cpuUsage: 60, // Normal CPU
            memoryUsage: 50, // Normal memory
            diskUsage: 40, // Normal disk
            operations: 8000
          }
        }
      }],
      fleet: {
        totalNodes: 1,
        healthyNodes: 1,
        averageLatency: 500,
        totalThroughput: 2000,
        availability: 99.5,
        utilization: 50,
        hourlyCost: 8
      }
    };

    // Process through predictive maintenance for anomaly detection
    const anomalies = await this.predictiveMaintenance.detectAnomalies(anomalousMetrics);

    // Verify anomalies were detected
    if (anomalies.length > 0) {
      console.log(`✅ Detected ${anomalies.length} performance anomalies`);
      this.testResults.successes.push({
        timestamp: Date.now(),
        type: 'performance_anomaly_detection',
        anomalies: anomalies.length
      });
    } else {
      console.warn('⚠️ No performance anomalies detected');
    }
  }

  /**
   * Test fleet-wide stress
   */
  async testFleetStress() {
    console.log('🌪️ Testing fleet-wide stress scenario...');

    // Create stressed fleet metrics
    const stressedFleetMetrics = {
      timestamp: Date.now(),
      nodes: Array.from({ length: 10 }, (_, i) => ({
        id: `stress-node-${i.toString().padStart(3, '0')}`,
        name: `Stress Node ${i + 1}`,
        type: i < 7 ? 'worker' : 'master',
        metrics: {
          performance: {
            latency: 150 + Math.random() * 100,
            throughput: 600 + Math.random() * 400,
            errorRate: 3 + Math.random() * 7,
            cpuUsage: 75 + Math.random() * 20,
            memoryUsage: 70 + Math.random() * 25,
            diskUsage: 60 + Math.random() * 30,
            operations: 5000 + Math.random() * 5000
          }
        }
      })),
      fleet: {
        totalNodes: 10,
        healthyNodes: 6,
        averageLatency: 200,
        totalThroughput: 8000,
        availability: 92, // Low availability
        utilization: 85, // High utilization
        hourlyCost: 120 // High cost
      }
    };

    // Process through predictive maintenance for fleet analysis
    const predictions = await this.predictiveMaintenance.analyzeMetrics(stressedFleetMetrics);

    // Check for fleet-level predictions
    const fleetPredictions = predictions.filter(p => p.type === 'FLEET_FAILURE_PREDICTION');
    if (fleetPredictions.length > 0) {
      console.log(`✅ Generated ${fleetPredictions.length} fleet-level predictions`);
      this.testResults.successes.push({
        timestamp: Date.now(),
        type: 'fleet_stress_prediction',
        predictions: fleetPredictions.length
      });
    }
  }

  /**
   * Test alert escalation
   */
  async testAlertEscalation() {
    console.log('📈 Testing alert escalation...');

    // Send critical alert
    const criticalAlert = {
      type: 'CRITICAL_PERFORMANCE',
      severity: 'CRITICAL',
      title: 'Critical Performance Degradation',
      message: 'Fleet performance has critically degraded',
      source: 'integration-test',
      value: 95,
      threshold: 90
    };

    await this.alertSystem.sendAlert(criticalAlert);

    // Send high-priority alert
    const highAlert = {
      type: 'HIGH_ERROR_RATE',
      severity: 'HIGH',
      title: 'High Error Rate Detected',
      message: 'Error rate has exceeded acceptable thresholds',
      source: 'integration-test',
      value: 12,
      threshold: 10
    };

    await this.alertSystem.sendAlert(highAlert);

    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check alert status
    const activeAlerts = this.alertSystem.getActiveAlerts();
    if (activeAlerts.length >= 2) {
      console.log(`✅ Alert escalation working with ${activeAlerts.length} active alerts`);
      this.testResults.successes.push({
        timestamp: Date.now(),
        type: 'alert_escalation',
        activeAlerts: activeAlerts.length
      });
    }
  }

  /**
   * Test healing workflow execution
   */
  async testHealingWorkflow() {
    console.log('🔧 Testing healing workflow execution...');

    // Create healing request for node restart
    const healingRequest = {
      type: 'NODE_FAILURE_PREDICTION',
      nodeId: 'test-node-healing',
      severity: 'HIGH',
      confidence: 0.8,
      recommendations: [{
        priority: 'HIGH',
        action: 'Restart node',
        description: 'Node showing signs of failure',
        automation: 'restart_node'
      }]
    };

    await this.automatedHealing.processHealingRequest(healingRequest);

    // Wait for workflow processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check healing status
    const healingStatus = this.automatedHealing.getHealingStatus();
    if (healingStatus.totalWorkflows > 0) {
      console.log(`✅ Healing workflow executed with ${healingStatus.totalWorkflows} total workflows`);
      this.testResults.successes.push({
        timestamp: Date.now(),
        type: 'healing_workflow_execution',
        workflows: healingStatus.totalWorkflows
      });
    }
  }

  /**
   * Wait for test completion
   */
  async waitForTestCompletion() {
    console.log(`⏳ Waiting for test completion (${this.config.testDuration}ms)...`);

    return new Promise(resolve => {
      setTimeout(async () => {
        console.log('⏰ Test duration completed, collecting results...');
        resolve();
      }, this.config.testDuration);
    });
  }

  /**
   * Collect test results
   */
  async collectTestResults() {
    console.log('📊 Collecting test results...');

    this.testResults.endTime = Date.now();

    // Get final metrics from each component
    if (this.dashboard) {
      const dashboardStatus = this.dashboard.getStatus();
      this.testResults.dashboardStatus = dashboardStatus;
    }

    if (this.predictiveMaintenance) {
      this.testResults.predictiveMaintenanceMetrics = {
        predictions: this.predictiveMaintenance.predictions.length,
        anomalies: this.predictiveMaintenance.anomalies.length
      };
    }

    if (this.automatedHealing) {
      const healingStatus = this.automatedHealing.getHealingStatus();
      this.testResults.healingStatus = healingStatus;
    }

    if (this.alertSystem) {
      const alertStatus = this.alertSystem.getStatus();
      this.testResults.alertStatus = alertStatus;
    }

    console.log('✅ Test results collected');
  }

  /**
   * Validate integration
   */
  async validateIntegration() {
    console.log('🔍 Validating system integration...');

    const validation = {
      dashboard: this.validateDashboardIntegration(),
      predictiveMaintenance: this.validatePredictiveMaintenanceIntegration(),
      automatedHealing: this.validateAutomatedHealingIntegration(),
      alertSystem: this.validateAlertSystemIntegration(),
      redisCoordination: this.validateRedisCoordination(),
      overall: {
        score: 0,
        issues: [],
        recommendations: []
      }
    };

    // Calculate overall score
    const scores = [
      validation.dashboard.score,
      validation.predictiveMaintenance.score,
      validation.automatedHealing.score,
      validation.alertSystem.score,
      validation.redisCoordination.score
    ];

    validation.overall.score = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    // Check for integration issues
    if (this.testResults.metricsCollected === 0) {
      validation.overall.issues.push('No metrics collected from dashboard');
    }

    if (this.testResults.alertsSent === 0) {
      validation.overall.issues.push('No alerts sent during test');
    }

    if (this.testResults.errors.length > 0) {
      validation.overall.issues.push(`${this.testResults.errors.length} errors occurred during test`);
    }

    // Generate recommendations
    if (validation.overall.score < 0.8) {
      validation.overall.recommendations.push('Overall integration score below 80%, review component configuration');
    }

    if (validation.redisCoordination.score < 0.9) {
      validation.overall.recommendations.push('Redis coordination issues detected, check Redis connectivity');
    }

    return validation;
  }

  /**
   * Validate dashboard integration
   */
  validateDashboardIntegration() {
    const status = this.testResults.dashboardStatus;

    if (!status) {
      return { score: 0, issues: ['Dashboard status not available'] };
    }

    const issues = [];
    let score = 1.0;

    if (!status.isRunning) {
      issues.push('Dashboard not running');
      score -= 0.3;
    }

    if (status.metricsCount === 0) {
      issues.push('No metrics collected');
      score -= 0.3;
    }

    if (status.updateCount < 10) { // Should have at least 10 updates in test duration
      issues.push('Insufficient dashboard updates');
      score -= 0.2;
    }

    return { score: Math.max(0, score), issues };
  }

  /**
   * Validate predictive maintenance integration
   */
  validatePredictiveMaintenanceIntegration() {
    const metrics = this.testResults.predictiveMaintenanceMetrics;

    if (!metrics) {
      return { score: 0, issues: ['Predictive maintenance metrics not available'] };
    }

    const issues = [];
    let score = 1.0;

    if (this.testResults.predictionsGenerated === 0) {
      issues.push('No predictions generated');
      score -= 0.4;
    }

    if (metrics.predictions === 0 && this.testResults.predictionsGenerated > 0) {
      issues.push('Predictions not stored properly');
      score -= 0.2;
    }

    return { score: Math.max(0, score), issues };
  }

  /**
   * Validate automated healing integration
   */
  validateAutomatedHealingIntegration() {
    const status = this.testResults.healingStatus;

    if (!status) {
      return { score: 0, issues: ['Automated healing status not available'] };
    }

    const issues = [];
    let score = 1.0;

    if (!status.isRunning) {
      issues.push('Automated healing not running');
      score -= 0.3;
    }

    if (status.totalWorkflows === 0) {
      issues.push('No healing workflows executed');
      score -= 0.4;
    }

    return { score: Math.max(0, score), issues };
  }

  /**
   * Validate alert system integration
   */
  validateAlertSystemIntegration() {
    const status = this.testResults.alertStatus;

    if (!status) {
      return { score: 0, issues: ['Alert system status not available'] };
    }

    const issues = [];
    let score = 1.0;

    if (!status.isRunning) {
      issues.push('Alert system not running');
      score -= 0.3;
    }

    if (status.totalAlerts === 0) {
      issues.push('No alerts processed');
      score -= 0.4;
    }

    return { score: Math.max(0, score), issues };
  }

  /**
   * Validate Redis coordination
   */
  validateRedisCoordination() {
    const issues = [];
    let score = 1.0;

    if (this.testMetrics.redisMessages === 0) {
      issues.push('No Redis messages exchanged');
      score -= 0.5;
    }

    if (this.testMetrics.redisMessages < 10) {
      issues.push('Low Redis message activity');
      score -= 0.2;
    }

    return { score: Math.max(0, score), issues };
  }

  /**
   * Generate comprehensive test report
   */
  generateTestReport(validationResults) {
    const duration = this.testResults.endTime - this.testResults.startTime;

    const report = {
      summary: {
        testName: 'Fleet Monitoring Integration Test',
        duration: duration,
        startTime: new Date(this.testResults.startTime).toISOString(),
        endTime: new Date(this.testResults.endTime).toISOString(),
        overallScore: validationResults.overall.score,
        status: validationResults.overall.score >= 0.8 ? 'PASS' : 'FAIL'
      },
      metrics: {
        dashboard: {
          updates: this.testMetrics.dashboardUpdates,
          metricsCollected: this.testResults.metricsCollected
        },
        predictiveMaintenance: {
          predictionsProcessed: this.testMetrics.predictionsProcessed,
          predictionsGenerated: this.testResults.predictionsGenerated
        },
        automatedHealing: {
          healingWorkflows: this.testMetrics.healingWorkflows,
          healingActions: this.testResults.healingActions
        },
        alertSystem: {
          alertsProcessed: this.testMetrics.alertsProcessed,
          alertsSent: this.testResults.alertsSent
        },
        redis: {
          messagesExchanged: this.testMetrics.redisMessages
        }
      },
      results: {
        successes: this.testResults.successes.length,
        errors: this.testResults.errors.length,
        details: {
          successes: this.testResults.successes,
          errors: this.testResults.errors
        }
      },
      validation: validationResults,
      recommendations: validationResults.overall.recommendations
    };

    // Save test report
    this.saveTestReport(report);

    return report;
  }

  /**
   * Save test report to file
   */
  async saveTestReport(report) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const reportDir = this.config.dataDir;
      const reportFile = path.join(reportDir, `integration-test-report-${Date.now()}.json`);

      await fs.mkdir(reportDir, { recursive: true });
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

      console.log(`📄 Test report saved to: ${reportFile}`);
    } catch (error) {
      console.error('❌ Error saving test report:', error);
    }
  }

  /**
   * Cleanup test resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up test resources...');

    this.isRunning = false;

    try {
      // Stop all components
      if (this.dashboard) {
        await this.dashboard.stop();
      }

      if (this.predictiveMaintenance) {
        await this.predictiveMaintenance.stop();
      }

      if (this.automatedHealing) {
        await this.automatedHealing.stop();
      }

      if (this.alertSystem) {
        await this.alertSystem.stop();
      }

      // Cleanup Redis
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }
}

/**
 * Run integration test if this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new FleetMonitoringIntegrationTest({
    testDuration: 30000, // 30 seconds for quick test
    redis: {
      host: 'localhost',
      port: 6379
    }
  });

  test.runIntegrationTest()
    .then(report => {
      console.log('\n🎉 Integration Test Results:');
      console.log(`Overall Score: ${(report.summary.overallScore * 100).toFixed(1)}%`);
      console.log(`Status: ${report.summary.status}`);
      console.log(`Duration: ${report.summary.duration}ms`);
      console.log(`Successes: ${report.results.successes}`);
      console.log(`Errors: ${report.results.errors}`);

      if (report.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        report.recommendations.forEach(rec => console.log(`- ${rec}`));
      }
    })
    .catch(error => {
      console.error('❌ Integration test failed:', error);
      process.exit(1);
    });
}

export default FleetMonitoringIntegrationTest;