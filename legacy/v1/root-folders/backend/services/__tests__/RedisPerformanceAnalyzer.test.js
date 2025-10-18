/**
 * Redis Performance Analyzer Tests
 * 
 * Comprehensive test suite for the Redis Performance Analyzer service
 * covering historical performance analysis, metrics aggregation, and anomaly detection.
 */

const RedisPerformanceAnalyzer = require('../RedisPerformanceAnalyzer');
const Redis = require('ioredis');

describe('RedisPerformanceAnalyzer', () => {
  let analyzer;
  let redisClient;
  
  beforeAll(async () => {
    // Setup test Redis connection
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      db: 15 // Use dedicated test database
    });
    
    analyzer = new RedisPerformanceAnalyzer({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        db: 15
      },
      retentionDays: 7, // Shorter retention for tests
      alertThresholds: {
        responseTime: 500, // Lower threshold for tests
        errorRate: 0.1,
        memoryUsage: 0.8
      }
    });
    
    await analyzer.initialize();
  });
  
  afterAll(async () => {
    // Cleanup test data
    await redisClient.flushdb();
    await analyzer.close();
    await redisClient.quit();
  });
  
  beforeEach(async () => {
    // Clean up before each test
    await redisClient.flushdb();
  });
  
  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      const testAnalyzer = new RedisPerformanceAnalyzer({
        redis: { db: 15 }
      });
      
      const result = await testAnalyzer.initialize();
      expect(result).toBe(true);
      
      await testAnalyzer.close();
    });
    
    test('should emit connected event', (done) => {
      const testAnalyzer = new RedisPerformanceAnalyzer({
        redis: { db: 15 }
      });
      
      testAnalyzer.on('connected', () => {
        testAnalyzer.close();
        done();
      });
      
      testAnalyzer.initialize().catch(console.error);
    });
  });
  
  describe('Agent Metrics Recording', () => {
    test('should record agent metrics successfully', async () => {
      const agentId = 'test-agent-1';
      const metrics = {
        responseTime: 150,
        confidence: 0.85,
        status: 'success',
        taskType: 'analysis'
      };
      
      const result = await analyzer.recordAgentMetrics(agentId, metrics);
      
      expect(result).toMatchObject({
        agentId,
        responseTime: 150,
        confidence: 0.85,
        status: 'success',
        taskType: 'analysis'
      });
      expect(result.timestamp).toBeDefined();
      expect(result.id).toBe(`${agentId}:${result.timestamp}`);
    });
    
    test('should store metrics in Redis', async () => {
      const agentId = 'test-agent-2';
      const metrics = {
        responseTime: 200,
        confidence: 0.9,
        status: 'success'
      };
      
      await analyzer.recordAgentMetrics(agentId, metrics);
      
      // Verify storage in Redis
      const storedMetrics = await redisClient.zrange(`performance:agent:${agentId}`, 0, -1);
      expect(storedMetrics).toHaveLength(1);
      
      const parsed = JSON.parse(storedMetrics[0]);
      expect(parsed.agentId).toBe(agentId);
      expect(parsed.responseTime).toBe(200);
    });
    
    test('should emit metrics recorded event', (done) => {
      const agentId = 'test-agent-3';
      const metrics = { responseTime: 100, status: 'success' };
      
      analyzer.on('metrics:recorded', (data) => {
        expect(data.agentId).toBe(agentId);
        expect(data.metrics.responseTime).toBe(100);
        done();
      });
      
      analyzer.recordAgentMetrics(agentId, metrics);
    });
  });
  
  describe('Task Metrics Recording', () => {
    test('should record task metrics successfully', async () => {
      const taskId = 'task-123';
      const agentId = 'agent-456';
      const metrics = {
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        status: 'success',
        confidence: 0.88
      };
      
      const result = await analyzer.recordTaskMetrics(taskId, agentId, metrics);
      
      expect(result).toMatchObject({
        taskId,
        agentId,
        status: 'success',
        confidence: 0.88
      });
      expect(result.id).toBe(`task:${taskId}:${result.timestamp}`);
    });
    
    test('should update agent aggregates', async () => {
      const agentId = 'agent-aggregate-test';
      
      // Record multiple tasks
      await analyzer.recordTaskMetrics('task1', agentId, {
        status: 'success',
        responseTime: 100,
        confidence: 0.9
      });
      
      await analyzer.recordTaskMetrics('task2', agentId, {
        status: 'error',
        responseTime: 200,
        confidence: 0.3
      });
      
      // Check aggregates
      const aggregatesKey = `aggregates:agent:${agentId}:current`;
      const aggregates = JSON.parse(await redisClient.get(aggregatesKey));
      
      expect(aggregates.totalTasks).toBe(2);
      expect(aggregates.successfulTasks).toBe(1);
      expect(aggregates.failedTasks).toBe(1);
    });
  });
  
  describe('Performance History Retrieval', () => {
    beforeEach(async () => {
      // Setup test data
      const agentId = 'history-test-agent';
      const now = Date.now();
      
      for (let i = 0; i < 10; i++) {
        await analyzer.recordAgentMetrics(agentId, {
          responseTime: 100 + i * 10,
          confidence: 0.8 + i * 0.01,
          status: i % 4 === 0 ? 'error' : 'success',
          timestamp: now - (9 - i) * 60 * 60 * 1000 // 1 hour intervals
        });
      }
    });
    
    test('should retrieve agent performance history', async () => {
      const agentId = 'history-test-agent';
      const history = await analyzer.getAgentPerformanceHistory(agentId);
      
      expect(history.agentId).toBe(agentId);
      expect(history.metrics).toHaveLength(10);
      expect(history.totalRecords).toBe(10);
      expect(history.aggregates).toBeDefined();
      expect(history.trends).toBeDefined();
    });
    
    test('should respect time range filters', async () => {
      const agentId = 'history-test-agent';
      const now = Date.now();
      const sixHoursAgo = now - 6 * 60 * 60 * 1000;
      
      const history = await analyzer.getAgentPerformanceHistory(agentId, {
        startTime: sixHoursAgo,
        endTime: now
      });
      
      expect(history.metrics.length).toBeLessThanOrEqual(6);
    });
    
    test('should calculate aggregates correctly', async () => {
      const agentId = 'history-test-agent';
      const aggregates = await analyzer.calculateAgentAggregates(
        agentId,
        Date.now() - 24 * 60 * 60 * 1000,
        Date.now()
      );
      
      expect(aggregates.totalTasks).toBe(10);
      expect(aggregates.successfulTasks).toBe(7);
      expect(aggregates.failedTasks).toBe(3);
      expect(aggregates.errorRate).toBe(0.3);
      expect(aggregates.performanceScore).toBeGreaterThan(0);
    });
  });
  
  describe('Performance Trends Analysis', () => {
    beforeEach(async () => {
      // Create trending data
      const agentId = 'trend-test-agent';
      const now = Date.now();
      
      for (let i = 0; i < 24; i++) {
        await analyzer.recordAgentMetrics(agentId, {
          responseTime: 200 - i * 5, // Improving response times
          confidence: 0.7 + i * 0.01, // Improving confidence
          status: i % 5 === 0 ? 'error' : 'success',
          timestamp: now - (23 - i) * 60 * 60 * 1000 // Hourly
        });
      }
    });
    
    test('should analyze performance trends', async () => {
      const trends = await analyzer.getPerformanceTrends('1d');
      
      expect(trends.timeRange).toBeDefined();
      expect(trends.intervals).toContain('1h');
      expect(trends.trends).toBeDefined();
      expect(trends.summary).toBeDefined();
    });
    
    test('should detect improving trends', async () => {
      const agentId = 'trend-test-agent';
      const patterns = await analyzer.analyzePerformancePatterns(agentId, '1d');
      
      expect(patterns.agentId).toBe(agentId);
      expect(patterns.patterns.responseTimePatterns.trend).toBe('improving');
    });
  });
  
  describe('Anomaly Detection', () => {
    test('should detect response time anomalies', async () => {
      const agentId = 'anomaly-test-agent';
      
      // Record normal metrics
      for (let i = 0; i < 10; i++) {
        await analyzer.recordAgentMetrics(agentId, {
          responseTime: 100,
          status: 'success',
          confidence: 0.8
        });
      }
      
      // Record anomalous metric
      await analyzer.recordAgentMetrics(agentId, {
        responseTime: 2000, // Much higher than normal
        status: 'success',
        confidence: 0.9
      });
      
      const history = await analyzer.getAgentPerformanceHistory(agentId);
      const anomalies = await analyzer.detectAnomalies(agentId, history.metrics);
      
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].type).toBe('response_time');
      expect(anomalies[0].severity).toBe('high');
    });
    
    test('should detect error rate anomalies', async () => {
      const agentId = 'error-anomaly-agent';
      
      // Record high error rate
      for (let i = 0; i < 15; i++) {
        await analyzer.recordAgentMetrics(agentId, {
          responseTime: 150,
          status: i < 12 ? 'error' : 'success', // 80% error rate
          confidence: 0.3
        });
      }
      
      const history = await analyzer.getAgentPerformanceHistory(agentId);
      const anomalies = await analyzer.detectAnomalies(agentId, history.metrics);
      
      const errorAnomalies = anomalies.filter(a => a.type === 'error_rate');
      expect(errorAnomalies.length).toBeGreaterThan(0);
    });
    
    test('should detect confidence anomalies', async () => {
      const agentId = 'confidence-anomaly-agent';
      
      await analyzer.recordAgentMetrics(agentId, {
        responseTime: 100,
        status: 'success',
        confidence: 0.2 // Very low confidence
      });
      
      const history = await analyzer.getAgentPerformanceHistory(agentId);
      const anomalies = await analyzer.detectAnomalies(agentId, history.metrics);
      
      const confidenceAnomalies = anomalies.filter(a => a.type === 'low_confidence');
      expect(confidenceAnomalies.length).toBeGreaterThan(0);
    });
  });
  
  describe('Performance Reports', () => {
    beforeEach(async () => {
      const agentId = 'report-test-agent';
      const now = Date.now();
      
      // Create comprehensive test data
      for (let i = 0; i < 50; i++) {
        await analyzer.recordAgentMetrics(agentId, {
          responseTime: 100 + Math.random() * 200,
          confidence: 0.7 + Math.random() * 0.3,
          status: Math.random() > 0.1 ? 'success' : 'error',
          timestamp: now - (49 - i) * 60 * 60 * 1000
        });
      }
    });
    
    test('should generate comprehensive performance report', async () => {
      const agentId = 'report-test-agent';
      const report = await analyzer.generatePerformanceReport(agentId, '1d');
      
      expect(report.agentId).toBe(agentId);
      expect(report.reportGenerated).toBeDefined();
      expect(report.executiveSummary).toBeDefined();
      expect(report.performanceMetrics).toBeDefined();
      expect(report.anomalies).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.insights).toBeDefined();
    });
    
    test('should include executive summary', async () => {
      const agentId = 'report-test-agent';
      const report = await analyzer.generatePerformanceReport(agentId, '1d');
      
      const summary = report.executiveSummary;
      expect(summary.overallPerformance).toBeDefined();
      expect(summary.performanceScore).toBeDefined();
      expect(summary.keyMetrics).toBeDefined();
    });
    
    test('should generate actionable recommendations', async () => {
      const agentId = 'report-test-agent';
      const report = await analyzer.generatePerformanceReport(agentId, '1d');
      
      expect(report.recommendations).toBeInstanceOf(Array);
      if (report.recommendations.length > 0) {
        const rec = report.recommendations[0];
        expect(rec.type).toBeDefined();
        expect(rec.priority).toBeDefined();
        expect(rec.title).toBeDefined();
        expect(rec.action).toBeDefined();
      }
    });
  });
  
  describe('System Performance Statistics', () => {
    test('should get system-wide performance stats', async () => {
      // Create data for multiple agents
      for (let i = 1; i <= 3; i++) {
        await analyzer.recordAgentMetrics(`agent-${i}`, {
          responseTime: 100 + i * 50,
          status: 'success',
          confidence: 0.8 + i * 0.05
        });
      }
      
      const stats = await analyzer.getSystemPerformanceStats();
      
      expect(stats.totalAgents).toBe(3);
      expect(stats.activeAgents).toBe(3);
      expect(stats.totalMetrics).toBe(3);
      expect(stats.systemHealth).toBeDefined();
    });
  });
  
  describe('Data Retention and Cleanup', () => {
    test('should respect retention period', async () => {
      const agentId = 'retention-test-agent';
      
      await analyzer.recordAgentMetrics(agentId, {
        responseTime: 100,
        status: 'success'
      });
      
      // Check TTL is set
      const ttl = await redisClient.ttl(`performance:agent:${agentId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(7 * 24 * 60 * 60); // 7 days
    });
  });
  
  describe('Error Handling', () => {
    test('should handle Redis connection errors gracefully', async () => {
      const faultyAnalyzer = new RedisPerformanceAnalyzer({
        redis: {
          host: 'nonexistent-host',
          port: 9999
        }
      });
      
      // Should not throw immediately
      await expect(faultyAnalyzer.initialize()).rejects.toThrow();
      
      await faultyAnalyzer.close();
    });
    
    test('should handle invalid time ranges', async () => {
      await expect(analyzer.parseTimeRange('invalid')).rejects.toThrow();
    });
    
    test('should handle empty metrics gracefully', async () => {
      const aggregates = await analyzer.calculateAgentAggregates(
        'nonexistent-agent',
        Date.now() - 60000,
        Date.now()
      );
      
      expect(aggregates).toBeNull();
    });
  });
  
  describe('Configuration', () => {
    test('should use custom configuration', async () => {
      const customAnalyzer = new RedisPerformanceAnalyzer({
        retentionDays: 14,
        alertThresholds: {
          responseTime: 2000,
          errorRate: 0.2
        }
      });
      
      expect(customAnalyzer.config.retentionDays).toBe(14);
      expect(customAnalyzer.config.alertThresholds.responseTime).toBe(2000);
      expect(customAnalyzer.config.alertThresholds.errorRate).toBe(0.2);
      
      await customAnalyzer.close();
    });
  });
  
  describe('Integration Tests', () => {
    test('should handle complete performance tracking workflow', async () => {
      const agentId = 'integration-test-agent';
      
      // Simulate complete workflow
      const metrics = [];
      
      // Record multiple performance events
      for (let i = 0; i < 20; i++) {
        const metric = await analyzer.recordAgentMetrics(agentId, {
          responseTime: 100 + Math.random() * 100,
          confidence: 0.7 + Math.random() * 0.3,
          status: Math.random() > 0.15 ? 'success' : 'error',
          taskType: ['analysis', 'development', 'testing'][Math.floor(Math.random() * 3)]
        });
        metrics.push(metric);
      }
      
      // Analyze performance
      const history = await analyzer.getAgentPerformanceHistory(agentId);
      const patterns = await analyzer.analyzePerformancePatterns(agentId, '1d');
      const report = await analyzer.generatePerformanceReport(agentId, '1d');
      
      // Verify workflow completeness
      expect(history.metrics).toHaveLength(20);
      expect(patterns.patterns).toBeDefined();
      expect(patterns.anomalies).toBeDefined();
      expect(report.executiveSummary).toBeDefined();
      
      // Verify data consistency
      expect(report.performanceMetrics.aggregates.totalTasks).toBe(20);
    });
  });
});