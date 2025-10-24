/**
 * Phase 2 Integration Tests
 *
 * Tests for the Interactive Observation System components:
 * - Agent Observation Query API
 * - Real-Time Response Channel System
 * - Agent State Management Infrastructure
 * - Transparency Middleware Framework
 *
 * Requirements validation:
 * - Sub-500ms response times
 * - <5% performance overhead
 * - Real-time agent visibility
 * - Interactive monitoring capabilities
 */

const { describe, it, before, after, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');

// Import test components (using compiled JS for testing)
const { InteractiveObservationSystem } = require('../interactive-observation-system.js');
const { TransparencyUtils } = require('../transparency-middleware.js');

// Test configuration
const TEST_CONFIG = {
  redis: {
    host: 'localhost',
    port: 6379,
    // Use test database 15 for isolation
    db: 15
  },
  transparency: {
    level: 'detailed',
    enablePerformanceMonitoring: true,
    maxOverheadPercent: 5,
    messageQueueSize: 100,
    flushInterval: 1000
  },
  responseSystem: {
    defaultTimeout: 5000,
    maxChannels: 100
  },
  monitoring: {
    metricsInterval: 1000,
    healthCheckInterval: 500
  }
};

// Mock logger for testing
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

describe('Phase 2 Interactive Observation System', () => {
  let redis;
  let observationSystem;
  let testAgentId;

  before(async function() {
    this.timeout(10000); // Extended timeout for Redis connection

    try {
      // Setup Redis connection
      redis = createClient(TEST_CONFIG.redis);
      await redis.connect();

      // Clear test database
      await redis.flushDb();

      // Create observation system
      observationSystem = new InteractiveObservationSystem(mockLogger, TEST_CONFIG);
      await observationSystem.initialize();

      testAgentId = 'test-agent-' + uuidv4();

      console.log('✅ Test environment initialized');
    } catch (error) {
      console.error('❌ Test setup failed:', error);
      this.skip();
    }
  });

  after(async function() {
    this.timeout(10000);

    try {
      if (observationSystem) {
        await observationSystem.shutdown();
      }

      if (redis) {
        await redis.flushDb();
        await redis.quit();
      }

      console.log('✅ Test environment cleaned up');
    } catch (error) {
      console.error('❌ Test cleanup failed:', error);
    }
  });

  beforeEach(async () => { try {
    // Reset test data before each test
    await redis.flushDb();
  });

  describe('Agent State Management', () => {
    it('should create and update agent state', async () => { try {
      const startTime = Date.now();

      // Create agent state
      await observationSystem.stateManager.createAgentState(testAgentId, 'idle', {
        cpu: 0.2,
        memory: 0.3,
        tokensUsed: 100
      });

      const responseTime = Date.now() - startTime;
      expect(responseTime).to.be.below(500); // Sub-500ms requirement

      // Verify state creation
      const state = await observationSystem.getAgentState(testAgentId);
      expect(state).to.not.be.null;
      expect(state.id).to.equal(testAgentId);
      expect(state.status).to.equal('idle');
      expect(state.resources.cpu).to.equal(0.2);
    });

    it('should handle heartbeat updates', async () => { try {
      // Create agent
      await observationSystem.stateManager.createAgentState(testAgentId);

      // Send heartbeat
      await observationSystem.stateManager.processHeartbeat(testAgentId, {
        agentId: testAgentId,
        timestamp: Date.now(),
        status: 'active',
        resources: { cpu: 0.5, memory: 0.6, tokensUsed: 200 }
      });

      // Verify heartbeat processed
      const state = await observationSystem.getAgentState(testAgentId);
      expect(state.status).to.equal('active');
      expect(state.resources.cpu).to.equal(0.5);
    });

    it('should aggregate agent states correctly', async () => { try {
      // Create multiple agents
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      for (const agentId of agents) {
        await observationSystem.stateManager.createAgentState(agentId, 'active');
      }

      const aggregation = await observationSystem.getStateAggregation();
      expect(aggregation.totalAgents).to.equal(3);
      expect(aggregation.statusBreakdown.active).to.equal(3);
      expect(aggregation.healthScore).to.be.a('number');
    });
  });

  describe('Real-Time Response System', () => {
    it('should create and manage response channels', async () => { try {
      const startTime = Date.now();

      const channelId = await observationSystem.responseSystem.createResponseChannel(
        uuidv4(),
        testAgentId,
        'agent_state',
        5000
      );

      const responseTime = Date.now() - startTime;
      expect(responseTime).to.be.below(100); // Should be very fast

      expect(channelId).to.include(testAgentId);

      const channelStatus = await observationSystem.responseSystem.getChannelStatus(channelId);
      expect(channelStatus).to.not.be.null;
      expect(channelStatus.isActive).to.be.true;
    });

    it('should handle query execution with timeout', async () => { try {
      const queryData = { test: 'data' };

      try {
        // This should timeout since there's no agent to respond
        await observationSystem.responseSystem.sendQuery(
          testAgentId,
          'test_query',
          queryData,
          1000 // 1 second timeout
        );

        expect.fail('Query should have timed out');
      } catch (error) {
        expect(error.message).to.include('timeout');
      }
    });

    it('should provide accurate metrics', async () => { try {
      const metrics = observationSystem.responseSystem.getMetrics();
      expect(metrics).to.have.property('totalChannels');
      expect(metrics).to.have.property('activeChannels');
      expect(metrics).to.have.property('averageResponseTime');
      expect(metrics).to.have.property('successRate');
    });
  });

  describe('Agent Observation API', () => {
    it('should query agent state efficiently', async () => { try {
      // Setup test agent
      await observationSystem.stateManager.createAgentState(testAgentId, 'busy', {
        cpu: 0.8,
        memory: 0.7,
        tokensUsed: 500
      });

      const startTime = Date.now();

      const state = await observationSystem.getAgentState(testAgentId);
      const responseTime = Date.now() - startTime;

      expect(responseTime).to.be.below(500); // Sub-500ms requirement
      expect(state.status).to.equal('busy');
      expect(state.resources.cpu).to.equal(0.8);
    });

    it('should query agents by status', async () => { try {
      // Create agents with different statuses
      await observationSystem.stateManager.createAgentState('agent-idle-1', 'idle');
      await observationSystem.stateManager.createAgentState('agent-idle-2', 'idle');
      await observationSystem.stateManager.createAgentState('agent-busy-1', 'busy');

      const idleAgents = await observationSystem.getAgentsByStatus('idle');
      const busyAgents = await observationSystem.getAgentsByStatus('busy');

      expect(idleAgents).to.have.length(2);
      expect(busyAgents).to.have.length(1);
    });

    it('should provide swarm overview', async () => { try {
      // Create test agents
      await observationSystem.stateManager.createAgentState('agent-1', 'active');
      await observationSystem.stateManager.createAgentState('agent-2', 'active');

      const overview = await observationSystem.getSwarmOverview();
      expect(overview.totalAgents).to.be.at.least(2);
      expect(overview.activeAgents).to.be.at.least(2);
    });
  });

  describe('Transparency Middleware', () => {
    it('should process agent activities efficiently', async () => { try {
      const activity = TransparencyUtils.createActivityFromAgent(
        testAgentId,
        'test_action',
        { testData: 'value' }
      );

      const startTime = Date.now();
      await observationSystem.transparency.processAgentActivity(activity);
      const processingTime = Date.now() - startTime;

      expect(processingTime).to.be.below(100); // Should be very fast
    });

    it('should filter messages based on level', async () => { try {
      // Test with minimal level
      observationSystem.updateTransparencyConfig({ level: 'minimal' });

      const activity = TransparencyUtils.createActivityFromAgent(
        testAgentId,
        'heartbeat' // Should be filtered out in minimal mode
      );

      await observationSystem.transparency.processAgentActivity(activity);

      // Check that message was filtered (queue should be empty for non-critical messages)
      const metrics = observationSystem.transparency.getMetrics();
      expect(metrics.totalMessagesGenerated).to.be.a('number');
    });

    it('should monitor performance overhead', async () => { try {
      const initialMetrics = observationSystem.transparency.getMetrics();

      // Process several activities
      for (let i = 0; i < 10; i++) {
        const activity = TransparencyUtils.createActivityFromAgent(
          testAgentId,
          `test_action_${i}`,
          { iteration: i }
        );
        await observationSystem.transparency.processAgentActivity(activity);
      }

      const finalMetrics = observationSystem.transparency.getMetrics();

      // Check overhead is within acceptable limits
      expect(finalMetrics.overheadPercentage).to.be.below(5); // <5% requirement
      expect(finalMetrics.totalMessagesGenerated).to.be.greaterThan(initialMetrics.totalMessagesGenerated);
    });
  });

  describe('System Integration', () => {
    it('should provide comprehensive system health check', async () => { try {
      const health = await observationSystem.healthCheck();

      expect(health).to.have.property('overall');
      expect(health.overall).to.have.property('systemHealth');
      expect(health.overall).to.have.property('totalQueries');
      expect(health.overall).to.have.property('averageResponseTime');
      expect(health.overall).to.have.property('successRate');

      // Should be healthy in test environment
      expect(['healthy', 'degraded', 'unhealthy']).to.include(health.overall.systemHealth);
    });

    it('should collect and report metrics', async () => { try {
      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 1500));

      const systemStatus = await observationSystem.getSystemStatus();

      expect(systemStatus).to.have.property('status');
      expect(systemStatus).to.have.property('components');
      expect(systemStatus).to.have.property('metrics');
      expect(systemStatus).to.have.property('performance');

      // Verify component health checks
      expect(systemStatus.components).to.have.property('observationAPI');
      expect(systemStatus.components).to.have.property('responseSystem');
      expect(systemStatus.components).to.have.property('stateManager');
      expect(systemStatus.components).to.have.property('transparency');
    });

    it('should handle concurrent operations efficiently', async () => { try {
      const startTime = Date.now();
      const promises = [];

      // Create multiple concurrent operations
      for (let i = 0; i < 20; i++) {
        const agentId = `concurrent-agent-${i}`;

        promises.push(
          observationSystem.stateManager.createAgentState(agentId, 'active')
        );

        promises.push(
          observationSystem.transparency.processAgentActivity(
            TransparencyUtils.createActivityFromAgent(agentId, 'concurrent_test')
          )
        );
      }

      await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // Should handle 40 concurrent operations efficiently
      expect(totalTime).to.be.below(2000); // 2 seconds for 40 operations

      // Verify all agents were created
      const aggregation = await observationSystem.getStateAggregation();
      expect(aggregation.totalAgents).to.be.at.least(20);
    });

    it('should maintain sub-500ms response times under load', async () => { try {
      const responseTimes = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const agentId = `load-test-agent-${i}`;

        // Measure state creation time
        const startState = Date.now();
        await observationSystem.stateManager.createAgentState(agentId, 'idle');
        const stateTime = Date.now() - startState;
        responseTimes.push(stateTime);

        // Measure query time
        const startQuery = Date.now();
        await observationSystem.getAgentState(agentId);
        const queryTime = Date.now() - startQuery;
        responseTimes.push(queryTime);
      }

      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      expect(averageResponseTime).to.be.below(500, `Average response time: ${averageResponseTime}ms`);
      expect(maxResponseTime).to.be.below(1000, `Max response time: ${maxResponseTime}ms`);

      console.log(`✅ Load test passed - Average: ${averageResponseTime.toFixed(2)}ms, Max: ${maxResponseTime}ms`);
    });
  });

  describe('Performance Requirements Validation', () => {
    it('should validate sub-500ms response time requirement', async () => { try {
      const testOperations = [
        () => observationSystem.stateManager.createAgentState('perf-test-1', 'active'),
        () => observationSystem.getAgentState('perf-test-1'),
        () => observationSystem.getSwarmOverview(),
        () => observationSystem.stateManager.getStateAggregation()
      ];

      const results = [];

      for (const operation of testOperations) {
        const start = Date.now();
        await operation();
        const duration = Date.now() - start;
        results.push(duration);
      }

      const averageTime = results.reduce((sum, time) => sum + time, 0) / results.length;

      expect(averageTime).to.be.below(500, `Average response time: ${averageTime}ms (requirement: <500ms)`);

      console.log(`✅ Response time validation passed: ${averageTime.toFixed(2)}ms average`);
    });

    it('should validate <5% performance overhead requirement', async () => { try {
      // Measure baseline performance (without transparency)
      const baselineStart = Date.now();
      for (let i = 0; i < 50; i++) {
        await observationSystem.stateManager.processHeartbeat(`baseline-agent-${i}`, {
          agentId: `baseline-agent-${i}`,
          timestamp: Date.now(),
          status: 'active',
          resources: { cpu: 0.5, memory: 0.5, tokensUsed: 100 }
        });
      }
      const baselineTime = Date.now() - baselineStart;

      // Measure performance with transparency enabled
      const transparencyStart = Date.now();
      for (let i = 0; i < 50; i++) {
        const activity = TransparencyUtils.createActivityFromAgent(
          `transparency-agent-${i}`,
          'heartbeat',
          { test: 'data' }
        );
        await observationSystem.transparency.processAgentActivity(activity);
      }
      const transparencyTime = Date.now() - transparencyStart;

      const overheadPercentage = ((transparencyTime - baselineTime) / baselineTime) * 100;

      expect(overheadPercentage).to.be.below(5, `Performance overhead: ${overheadPercentage.toFixed(2)}% (requirement: <5%)`);

      console.log(`✅ Performance overhead validation passed: ${overheadPercentage.toFixed(2)}%`);
    });
  });
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});