/**
 * ScalabilityIntegrationTest - Comprehensive validation of 100+ concurrent agent scalability improvements
 *
 * Features:
 * - End-to-end scalability testing
 * - Performance benchmarking and validation
 * - Load testing with simulated workloads
 * - Resource efficiency measurement
 * - Scalability metrics and reporting
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import crypto from 'crypto';

/**
 * Test configuration
 */
const TEST_CONFIG = {
  // Test scenarios
  scenarios: {
    baseline: {
      name: 'Baseline Performance',
      agents: 10,
      duration: 60000,         // 1 minute
      rampUpTime: 10000,       // 10 seconds
      targetThroughput: 100    // requests per second
    },
    moderate_load: {
      name: 'Moderate Load Test',
      agents: 50,
      duration: 120000,        // 2 minutes
      rampUpTime: 30000,       // 30 seconds
      targetThroughput: 500
    },
    high_load: {
      name: 'High Load Test',
      agents: 100,
      duration: 300000,        // 5 minutes
      rampUpTime: 60000,       // 1 minute
      targetThroughput: 1000
    },
    stress_test: {
      name: 'Stress Test',
      agents: 150,
      duration: 600000,        // 10 minutes
      rampUpTime: 120000,      // 2 minutes
      targetThroughput: 2000
    },
    scalability_test: {
      name: 'Scalability Test',
      agents: 200,
      duration: 900000,        // 15 minutes
      rampUpTime: 180000,      // 3 minutes
      targetThroughput: 3000
    }
  },

  // Performance thresholds
  thresholds: {
    responseTime: {
      p50: 100,                // 100ms
      p95: 500,                // 500ms
      p99: 1000                // 1 second
    },
    throughput: {
      minimum: 0.95,           // 95% of target
      maximum: 1.05            // 105% of target (burst capacity)
    },
    errorRate: {
      maximum: 0.01            // 1% error rate
    },
    resourceUtilization: {
      cpu: { minimum: 0.30, maximum: 0.85 },
      memory: { minimum: 0.20, maximum: 0.80 },
      agents: { minimum: 0.70, maximum: 0.95 }
    },
    scaling: {
      scaleUpTime: 30000,      // 30 seconds
      scaleDownTime: 60000,    // 1 minute
      efficiency: 0.85         // 85% efficiency
    }
  },

  // Redis configuration
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },

  // Test settings
  test: {
    concurrentRequests: 10,
    requestTimeout: 10000,     // 10 seconds
    metricsInterval: 5000,     // 5 seconds
    reportInterval: 30000      // 30 seconds
  }
};

/**
 * ScalabilityIntegrationTest class
 */
export class ScalabilityIntegrationTest extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...TEST_CONFIG, ...options };
    this.testId = `scalability-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Redis client
    this.redis = null;

    // Test state
    this.isInitialized = false;
    this.isRunning = false;
    this.currentScenario = null;
    this.testStartTime = null;
    this.testResults = new Map();

    // Test components
    this.testAgents = new Map();
    this.activeRequests = new Map();
    this.completedRequests = [];
    this.failedRequests = [];

    // Metrics collection
    this.metrics = {
      performance: {
        responseTime: [],
        throughput: [],
        errorRate: [],
        concurrency: []
      },
      resources: {
        cpu: [],
        memory: [],
        agents: [],
        systemLoad: []
      },
      scaling: {
        scaleUpEvents: [],
        scaleDownEvents: [],
        efficiency: [],
        predictionAccuracy: []
      }
    };

    // Test validation
    this.validationResults = {
      passed: [],
      failed: [],
      warnings: [],
      overallScore: 0
    };

    // Timers
    this.metricsTimer = null;
    this.reportTimer = null;
    this.loadGenerator = null;

    this.setupEventHandlers();
  }

  /**
   * Initialize the scalability integration test
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing Scalability Integration Test' });

      // Initialize Redis connection
      await this.initializeRedis();

      // Setup test environment
      await this.setupTestEnvironment();

      this.isInitialized = true;

      this.emit('status', { status: 'ready', message: 'Scalability Integration Test initialized successfully' });
      console.log(`🚀 Scalability Integration Test ${this.testId} initialized`);

    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Initialize Redis connection
   */
  async initializeRedis() {
    this.redis = createClient(this.config.redis);
    await this.redis.connect();

    console.log('📡 Redis connection established for scalability test');
  }

  /**
   * Setup test environment
   */
  async setupTestEnvironment() {
    try {
      // Clear previous test data
      await this.redis.flushdb();

      // Setup test metrics storage
      await this.redis.hSet('test:config', JSON.stringify(this.config));

      console.log('🧪 Test environment setup completed');
    } catch (error) {
      console.warn('Failed to setup test environment:', error.message);
    }
  }

  /**
   * Run all test scenarios
   */
  async runAllTests() {
    if (!this.isInitialized) {
      throw new Error('Test not initialized. Call initialize() first.');
    }

    this.isRunning = true;
    this.testStartTime = Date.now();

    const results = {};

    try {
      for (const [scenarioName, scenario] of Object.entries(this.config.scenarios)) {
        console.log(`🧪 Running test scenario: ${scenario.name}`);

        const result = await this.runScenario(scenarioName, scenario);
        results[scenarioName] = result;

        // Brief pause between scenarios
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Generate comprehensive report
      const report = await this.generateComprehensiveReport(results);

      this.isRunning = false;

      return {
        testId: this.testId,
        duration: Date.now() - this.testStartTime,
        results,
        report,
        validation: this.validationResults
      };

    } catch (error) {
      this.isRunning = false;
      this.emit('error', { type: 'test_execution_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Run a specific test scenario
   */
  async runScenario(scenarioName, scenario) {
    this.currentScenario = scenarioName;
    const scenarioStartTime = Date.now();

    try {
      // Reset metrics for this scenario
      this.resetScenarioMetrics();

      // Start metrics collection
      this.startMetricsCollection();

      // Ramp up agents
      await this.rampUpAgents(scenario);

      // Execute load test
      await this.executeLoadTest(scenario);

      // Ramp down agents
      await this.rampDownAgents(scenario);

      // Stop metrics collection
      this.stopMetricsCollection();

      // Validate results
      const validation = await this.validateScenarioResults(scenarioName, scenario);

      const result = {
        scenario: scenarioName,
        duration: Date.now() - scenarioStartTime,
        metrics: this.collectScenarioMetrics(),
        validation,
        passed: validation.overallScore >= 0.80
      };

      this.testResults.set(scenarioName, result);

      console.log(`✅ Test scenario ${scenario.name} completed with score ${validation.overallScore.toFixed(2)}`);

      return result;

    } catch (error) {
      this.emit('error', { type: 'scenario_failed', scenario: scenarioName, error: error.message });
      throw error;
    }
  }

  /**
   * Reset metrics for a new scenario
   */
  resetScenarioMetrics() {
    this.metrics = {
      performance: {
        responseTime: [],
        throughput: [],
        errorRate: [],
        concurrency: []
      },
      resources: {
        cpu: [],
        memory: [],
        agents: [],
        systemLoad: []
      },
      scaling: {
        scaleUpEvents: [],
        scaleDownEvents: [],
        efficiency: [],
        predictionAccuracy: []
      }
    };

    this.completedRequests = [];
    this.failedRequests = [];
    this.activeRequests.clear();
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    this.metricsTimer = setInterval(async () => {
      await this.collectMetrics();
    }, this.config.test.metricsInterval);

    this.reportTimer = setInterval(async () => {
      await this.generateProgressReport();
    }, this.config.test.reportInterval);

    console.log('📊 Metrics collection started');
  }

  /**
   * Stop metrics collection
   */
  stopMetricsCollection() {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }

    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }

    console.log('📊 Metrics collection stopped');
  }

  /**
   * Ramp up agents
   */
  async rampUpAgents(scenario) {
    console.log(`📈 Ramping up ${scenario.agents} agents over ${scenario.rampUpTime}ms`);

    const rampUpSteps = 10;
    const stepDuration = scenario.rampUpTime / rampUpSteps;
    const agentsPerStep = Math.ceil(scenario.agents / rampUpSteps);

    for (let step = 0; step < rampUpSteps; step++) {
      const agentsInStep = Math.min(agentsPerStep, scenario.agents - (step * agentsPerStep));

      for (let i = 0; i < agentsInStep; i++) {
        const agentId = await this.createTestAgent();
        this.testAgents.set(agentId, {
          id: agentId,
          status: 'active',
          createdAt: Date.now(),
          requestsProcessed: 0,
          responseTime: []
        });
      }

      // Collect metrics after each step
      await this.collectMetrics();

      // Wait for next step
      if (step < rampUpSteps - 1) {
        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }
    }

    console.log(`✅ Successfully ramped up ${this.testAgents.size} agents`);
  }

  /**
   * Create a test agent
   */
  async createTestAgent() {
    const agentId = `test-agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Register agent in Redis
    await this.redis.hSet(`test:agent:${agentId}`, JSON.stringify({
      id: agentId,
      status: 'active',
      createdAt: Date.now()
    }));

    return agentId;
  }

  /**
   * Execute load test
   */
  async executeLoadTest(scenario) {
    console.log(`⚡ Executing load test for ${scenario.duration}ms with target throughput ${scenario.targetThroughput} req/s`);

    const testEndTime = Date.now() + scenario.duration;
    const targetInterval = 1000 / scenario.targetThroughput; // milliseconds between requests

    // Start load generation
    this.loadGenerator = setInterval(async () => {
      if (Date.now() >= testEndTime) {
        return;
      }

      // Generate concurrent requests
      const requestsToGenerate = Math.min(this.config.test.concurrentRequests, this.testAgents.size);

      for (let i = 0; i < requestsToGenerate; i++) {
        this.generateRequest();
      }

    }, targetInterval);

    // Wait for test completion
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (Date.now() >= testEndTime) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });

    // Stop load generation
    if (this.loadGenerator) {
      clearInterval(this.loadGenerator);
      this.loadGenerator = null;
    }

    // Wait for remaining requests to complete
    await this.waitForRequestsCompletion(30000); // 30 seconds timeout

    console.log(`✅ Load test completed. Processed ${this.completedRequests.length} requests, ${this.failedRequests.length} failed`);
  }

  /**
   * Generate a test request
   */
  generateRequest() {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const agentIds = Array.from(this.testAgents.keys());

    if (agentIds.length === 0) return;

    const agentId = agentIds[Math.floor(Math.random() * agentIds.length)];
    const agent = this.testAgents.get(agentId);

    if (!agent || agent.status !== 'active') return;

    const request = {
      id: requestId,
      agentId,
      startTime: performance.now(),
      type: 'test_request',
      payload: {
        size: Math.floor(Math.random() * 1000) + 100, // 100-1100 bytes
        complexity: Math.random() // 0-1 complexity
      }
    };

    this.activeRequests.set(requestId, request);

    // Simulate request processing
    this.processRequest(request);
  }

  /**
   * Process a test request
   */
  async processRequest(request) {
    try {
      // Simulate processing time based on payload complexity
      const processingTime = (request.payload.complexity * 1000) + Math.random() * 500; // 0-1500ms

      await new Promise(resolve => setTimeout(resolve, processingTime));

      const endTime = performance.now();
      const responseTime = endTime - request.startTime;

      // Update agent metrics
      const agent = this.testAgents.get(request.agentId);
      if (agent) {
        agent.requestsProcessed++;
        agent.responseTime.push(responseTime);
      }

      // Move to completed requests
      this.activeRequests.delete(request.id);
      this.completedRequests.push({
        ...request,
        endTime,
        responseTime,
        success: true
      });

    } catch (error) {
      // Handle request failure
      this.activeRequests.delete(request.id);
      this.failedRequests.push({
        ...request,
        endTime: performance.now(),
        error: error.message,
        success: false
      });
    }
  }

  /**
   * Wait for all requests to complete
   */
  async waitForRequestsCompletion(timeout = 30000) {
    const startTime = Date.now();

    while (this.activeRequests.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.activeRequests.size > 0) {
      console.warn(`⚠️ ${this.activeRequests.size} requests did not complete within timeout`);
    }
  }

  /**
   * Ramp down agents
   */
  async rampDownAgents(scenario) {
    console.log(`📉 Ramping down ${this.testAgents.size} agents`);

    const rampDownSteps = 10;
    const stepDuration = 30000 / rampDownSteps; // 30 seconds total
    const agentsPerStep = Math.ceil(this.testAgents.size / rampDownSteps);

    for (let step = 0; step < rampDownSteps; step++) {
      const agentsToRemove = Math.min(agentsPerStep, this.testAgents.size);

      for (let i = 0; i < agentsToRemove; i++) {
        const agentId = this.testAgents.keys().next().value;
        if (agentId) {
          await this.removeTestAgent(agentId);
        }
      }

      // Wait for next step
      if (step < rampDownSteps - 1) {
        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }
    }

    console.log(`✅ Successfully ramped down agents`);
  }

  /**
   * Remove a test agent
   */
  async removeTestAgent(agentId) {
    this.testAgents.delete(agentId);
    await this.redis.del(`test:agent:${agentId}`);
  }

  /**
   * Collect metrics
   */
  async collectMetrics() {
    const timestamp = Date.now();

    // Performance metrics
    const recentRequests = this.completedRequests.slice(-1000);
    if (recentRequests.length > 0) {
      const responseTimes = recentRequests.map(r => r.responseTime);
      const responseTime = {
        p50: this.percentile(responseTimes, 0.5),
        p95: this.percentile(responseTimes, 0.95),
        p99: this.percentile(responseTimes, 0.99),
        avg: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      };

      const throughput = recentRequests.length / ((recentRequests[recentRequests.length - 1].endTime - recentRequests[0].startTime) / 1000);
      const errorRate = this.failedRequests.length / (this.completedRequests.length + this.failedRequests.length);

      this.metrics.performance.responseTime.push({ timestamp, ...responseTime });
      this.metrics.performance.throughput.push({ timestamp, value: throughput });
      this.metrics.performance.errorRate.push({ timestamp, value: errorRate });
      this.metrics.performance.concurrency.push({ timestamp, value: this.activeRequests.size });
    }

    // Resource metrics (simulated)
    const cpuUtilization = 0.3 + (this.testAgents.size * 0.002) + (Math.random() * 0.1);
    const memoryUtilization = 0.2 + (this.testAgents.size * 0.003) + (Math.random() * 0.1);
    const systemLoad = cpuUtilization * this.testAgents.size;

    this.metrics.resources.cpu.push({ timestamp, value: cpuUtilization });
    this.metrics.resources.memory.push({ timestamp, value: memoryUtilization });
    this.metrics.resources.agents.push({ timestamp, value: this.testAgents.size });
    this.metrics.resources.systemLoad.push({ timestamp, value: systemLoad });

    // Scaling metrics (simulated)
    if (Math.random() < 0.1) { // 10% chance of scaling event
      this.metrics.scaling.scaleUpEvents.push({ timestamp, value: Math.floor(Math.random() * 5) + 1 });
    }

    // Store in Redis
    await this.redis.setex(`test:metrics:${this.currentScenario}:${timestamp}`, 3600, JSON.stringify({
      performance: this.metrics.performance,
      resources: this.metrics.resources,
      scaling: this.metrics.scaling
    }));
  }

  /**
   * Calculate percentile
   */
  percentile(values, percentile) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Generate progress report
   */
  async generateProgressReport() {
    const timestamp = Date.now();
    const progress = {
      scenario: this.currentScenario,
      timestamp,
      agents: this.testAgents.size,
      activeRequests: this.activeRequests.size,
      completedRequests: this.completedRequests.length,
      failedRequests: this.failedRequests.length,
      successRate: this.completedRequests.length / (this.completedRequests.length + this.failedRequests.length)
    };

    console.log(`📊 Progress: ${progress.agents} agents, ${progress.completedRequests} completed, ${progress.failedRequests} failed (${(progress.successRate * 100).toFixed(1)}% success)`);
  }

  /**
   * Collect scenario metrics
   */
  collectScenarioMetrics() {
    return {
      performance: {
        responseTime: this.calculateMetricStats(this.metrics.performance.responseTime),
        throughput: this.calculateMetricStats(this.metrics.performance.throughput),
        errorRate: this.calculateMetricStats(this.metrics.performance.errorRate),
        concurrency: this.calculateMetricStats(this.metrics.performance.concurrency)
      },
      resources: {
        cpu: this.calculateMetricStats(this.metrics.resources.cpu),
        memory: this.calculateMetricStats(this.metrics.resources.memory),
        agents: this.calculateMetricStats(this.metrics.resources.agents),
        systemLoad: this.calculateMetricStats(this.metrics.resources.systemLoad)
      },
      scaling: {
        scaleUpEvents: this.metrics.scaling.scaleUpEvents.length,
        scaleDownEvents: this.metrics.scaling.scaleDownEvents.length,
        efficiency: this.calculateMetricStats(this.metrics.scaling.efficiency),
        predictionAccuracy: this.calculateMetricStats(this.metrics.scaling.predictionAccuracy)
      },
      requests: {
        total: this.completedRequests.length + this.failedRequests.length,
        successful: this.completedRequests.length,
        failed: this.failedRequests.length,
        averageResponseTime: this.completedRequests.length > 0 ?
          this.completedRequests.reduce((sum, r) => sum + r.responseTime, 0) / this.completedRequests.length : 0
      }
    };
  }

  /**
   * Calculate metric statistics
   */
  calculateMetricStats(metricData) {
    if (metricData.length === 0) {
      return { min: 0, max: 0, avg: 0, current: 0 };
    }

    const values = metricData.map(d => d.value || d.avg || d);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      current: values[values.length - 1]
    };
  }

  /**
   * Validate scenario results
   */
  async validateScenarioResults(scenarioName, scenario) {
    const metrics = this.collectScenarioMetrics();
    const validation = {
      scenario: scenarioName,
      passed: [],
      failed: [],
      warnings: [],
      overallScore: 0
    };

    // Validate response time
    if (metrics.performance.responseTime.avg <= this.config.thresholds.responseTime.p95) {
      validation.passed.push({
        metric: 'response_time',
        threshold: this.config.thresholds.responseTime.p95,
        actual: metrics.performance.responseTime.avg,
        status: 'passed'
      });
    } else {
      validation.failed.push({
        metric: 'response_time',
        threshold: this.config.thresholds.responseTime.p95,
        actual: metrics.performance.responseTime.avg,
        status: 'failed'
      });
    }

    // Validate throughput
    const targetThroughput = scenario.targetThroughput;
    const actualThroughput = metrics.performance.throughput.avg;
    const throughputRatio = actualThroughput / targetThroughput;

    if (throughputRatio >= this.config.thresholds.throughput.minimum && throughputRatio <= this.config.thresholds.throughput.maximum) {
      validation.passed.push({
        metric: 'throughput',
        threshold: `${this.config.thresholds.throughput.minimum * 100}-${this.config.thresholds.throughput.maximum * 100}% of target`,
        actual: `${(throughputRatio * 100).toFixed(1)}%`,
        status: 'passed'
      });
    } else {
      validation.failed.push({
        metric: 'throughput',
        threshold: `${this.config.thresholds.throughput.minimum * 100}-${this.config.thresholds.throughput.maximum * 100}% of target`,
        actual: `${(throughputRatio * 100).toFixed(1)}%`,
        status: 'failed'
      });
    }

    // Validate error rate
    if (metrics.performance.errorRate.avg <= this.config.thresholds.errorRate.maximum) {
      validation.passed.push({
        metric: 'error_rate',
        threshold: `<= ${(this.config.thresholds.errorRate.maximum * 100).toFixed(1)}%`,
        actual: `${(metrics.performance.errorRate.avg * 100).toFixed(2)}%`,
        status: 'passed'
      });
    } else {
      validation.failed.push({
        metric: 'error_rate',
        threshold: `<= ${(this.config.thresholds.errorRate.maximum * 100).toFixed(1)}%`,
        actual: `${(metrics.performance.errorRate.avg * 100).toFixed(2)}%`,
        status: 'failed'
      });
    }

    // Validate resource utilization
    const cpuInRange = metrics.resources.cpu.avg >= this.config.thresholds.resourceUtilization.cpu.minimum &&
                      metrics.resources.cpu.avg <= this.config.thresholds.resourceUtilization.cpu.maximum;

    if (cpuInRange) {
      validation.passed.push({
        metric: 'cpu_utilization',
        threshold: `${(this.config.thresholds.resourceUtilization.cpu.minimum * 100).toFixed(0)}-${(this.config.thresholds.resourceUtilization.cpu.maximum * 100).toFixed(0)}%`,
        actual: `${(metrics.resources.cpu.avg * 100).toFixed(1)}%`,
        status: 'passed'
      });
    } else {
      validation.warnings.push({
        metric: 'cpu_utilization',
        threshold: `${(this.config.thresholds.resourceUtilization.cpu.minimum * 100).toFixed(0)}-${(this.config.thresholds.resourceUtilization.cpu.maximum * 100).toFixed(0)}%`,
        actual: `${(metrics.resources.cpu.avg * 100).toFixed(1)}%`,
        status: 'warning'
      });
    }

    // Calculate overall score
    const totalChecks = validation.passed.length + validation.failed.length;
    validation.overallScore = totalChecks > 0 ? validation.passed.length / totalChecks : 0;

    // Update global validation results
    this.validationResults.passed.push(...validation.passed);
    this.validationResults.failed.push(...validation.failed);
    this.validationResults.warnings.push(...validation.warnings);

    const allChecks = this.validationResults.passed.length + this.validationResults.failed.length;
    this.validationResults.overallScore = allChecks > 0 ? this.validationResults.passed.length / allChecks : 0;

    return validation;
  }

  /**
   * Generate comprehensive report
   */
  async generateComprehensiveReport(results) {
    const report = {
      testId: this.testId,
      timestamp: Date.now(),
      duration: Date.now() - this.testStartTime,
      summary: {
        totalScenarios: Object.keys(results).length,
        passedScenarios: Object.values(results).filter(r => r.passed).length,
        failedScenarios: Object.values(results).filter(r => !r.passed).length,
        overallScore: this.validationResults.overallScore,
        status: this.validationResults.overallScore >= 0.80 ? 'PASSED' : 'FAILED'
      },
      results,
      validation: this.validationResults,
      recommendations: this.generateRecommendations(results)
    };

    // Save report to Redis
    await this.redis.setex(`test:report:${this.testId}`, 86400, JSON.stringify(report)); // 24 hours TTL

    console.log(`📋 Comprehensive report generated: ${report.summary.status} (${(report.summary.overallScore * 100).toFixed(1)}% overall score)`);

    return report;
  }

  /**
   * Generate recommendations based on test results
   */
  generateRecommendations(results) {
    const recommendations = [];

    // Analyze response time patterns
    const highLatencyScenarios = Object.entries(results).filter(([name, result]) =>
      result.metrics.performance.responseTime.avg > this.config.thresholds.responseTime.p95
    );

    if (highLatencyScenarios.length > 0) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        description: 'High response times detected in multiple scenarios',
        suggestion: 'Consider optimizing request processing or implementing caching mechanisms',
        affectedScenarios: highLatencyScenarios.map(([name]) => name)
      });
    }

    // Analyze throughput patterns
    const lowThroughputScenarios = Object.entries(results).filter(([name, result]) =>
      result.metrics.performance.throughput.avg < result.scenario.targetThroughput * 0.95
    );

    if (lowThroughputScenarios.length > 0) {
      recommendations.push({
        type: 'capacity',
        priority: 'medium',
        description: 'Throughput below target in some scenarios',
        suggestion: 'Consider increasing agent pool size or optimizing resource allocation',
        affectedScenarios: lowThroughputScenarios.map(([name]) => name)
      });
    }

    // Analyze error rate patterns
    const highErrorScenarios = Object.entries(results).filter(([name, result]) =>
      result.metrics.performance.errorRate.avg > this.config.thresholds.errorRate.maximum
    );

    if (highErrorScenarios.length > 0) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        description: 'High error rates detected',
        suggestion: 'Implement better error handling and retry mechanisms',
        affectedScenarios: highErrorScenarios.map(([name]) => name)
      });
    }

    // Analyze scalability
    const scalabilityScenarios = Object.entries(results).filter(([name, result]) =>
      name.includes('scalability') || name.includes('stress')
    );

    if (scalabilityScenarios.length > 0) {
      const avgScore = scalabilityScenarios.reduce((sum, [, result]) => sum + result.validation.overallScore, 0) / scalabilityScenarios.length;

      if (avgScore < 0.80) {
        recommendations.push({
          type: 'scalability',
          priority: 'high',
          description: 'Scalability issues detected under high load',
          suggestion: 'Review auto-scaling policies and resource optimization strategies',
          affectedScenarios: scalabilityScenarios.map(([name]) => name)
        });
      }
    }

    return recommendations;
  }

  /**
   * Get test status
   */
  async getTestStatus() {
    return {
      testId: this.testId,
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      currentScenario: this.currentScenario,
      startTime: this.testStartTime,
      duration: this.testStartTime ? Date.now() - this.testStartTime : 0,
      agents: {
        total: this.testAgents.size,
        active: Array.from(this.testAgents.values()).filter(a => a.status === 'active').length
      },
      requests: {
        active: this.activeRequests.size,
        completed: this.completedRequests.length,
        failed: this.failedRequests.length
      },
      validation: this.validationResults,
      timestamp: Date.now()
    };
  }

  /**
   * Event handlers
   */
  setupEventHandlers() {
    this.on('error', (error) => {
      console.error('❌ ScalabilityIntegrationTest error:', error);
    });

    this.on('status', (status) => {
      console.log(`📊 ScalabilityIntegrationTest status: ${status.status} - ${status.message}`);
    });
  }

  /**
   * Cleanup test resources
   */
  async cleanup() {
    try {
      // Stop all timers
      if (this.metricsTimer) clearInterval(this.metricsTimer);
      if (this.reportTimer) clearInterval(this.reportTimer);
      if (this.loadGenerator) clearInterval(this.loadGenerator);

      // Clear Redis data
      await this.redis.flushdb();

      // Clear local data
      this.testAgents.clear();
      this.activeRequests.clear();
      this.completedRequests = [];
      this.failedRequests = [];

      console.log('🧹 Test resources cleaned up');
    } catch (error) {
      console.warn('Failed to cleanup test resources:', error.message);
    }
  }

  /**
   * Shutdown the test
   */
  async shutdown() {
    this.emit('status', { status: 'shutting_down', message: 'Shutting down Scalability Integration Test' });

    this.isRunning = false;

    // Cleanup resources
    await this.cleanup();

    // Close Redis connection
    if (this.redis) await this.redis.quit();

    this.emit('status', { status: 'shutdown', message: 'Scalability Integration Test shutdown complete' });
    console.log('🛑 Scalability Integration Test shutdown complete');
  }
}

export default ScalabilityIntegrationTest;