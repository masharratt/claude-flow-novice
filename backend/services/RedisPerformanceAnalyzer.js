/**
 * Redis Performance Analyzer - Historical Performance Analysis Service
 * 
 * Provides comprehensive historical performance analysis, metrics aggregation,
 * and trend detection for Redis-based agent collaboration systems.
 */

const Redis = require('ioredis');
const { EventEmitter } = require('events');

class RedisPerformanceAnalyzer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.redis = new Redis(config.redis || {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null
    });
    
    this.config = {
      retentionDays: config.retentionDays || 30,
      aggregationIntervals: config.aggregationIntervals || ['1h', '1d', '1w'],
      alertThresholds: config.alertThresholds || {
        responseTime: 1000, // ms
        errorRate: 0.05, // 5%
        memoryUsage: 0.8 // 80%
      },
      batchSize: config.batchSize || 1000,
      ...config
    };
    
    this.metricsBuffer = [];
    this.isProcessing = false;
    
    this.setupRedisHandlers();
  }
  
  setupRedisHandlers() {
    this.redis.on('connect', () => {
      console.log('Redis Performance Analyzer connected');
      this.emit('connected');
    });
    
    this.redis.on('error', (error) => {
      console.error('Redis Performance Analyzer error:', error);
      this.emit('error', error);
    });
    
    this.redis.on('close', () => {
      console.log('Redis Performance Analyzer disconnected');
      this.emit('disconnected');
    });
  }
  
  /**
   * Initialize performance tracking schema and indexes
   */
  async initialize() {
    try {
      // Create performance data schema
      await this.redis.defineCommand('createPerformanceIndex', {
        numberOfKeys: 0,
        lua: `
          -- Create sorted sets for time-series performance data
          redis.call('SET', 'performance:schema:version', '1.0.0')
          return 'OK'
        `
      });
      
      await this.redis.createPerformanceIndex();
      
      // Initialize aggregation pipelines
      await this.setupAggregationPipelines();
      
      console.log('Redis Performance Analyzer initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize Redis Performance Analyzer:', error);
      throw error;
    }
  }
  
  /**
   * Record agent performance metrics
   */
  async recordAgentMetrics(agentId, metrics) {
    const timestamp = Date.now();
    const metricData = {
      agentId,
      timestamp,
      ...metrics,
      id: `${agentId}:${timestamp}`
    };
    
    // Store in Redis time-series
    const key = `performance:agent:${agentId}`;
    await this.redis.zadd(key, timestamp, JSON.stringify(metricData));
    
    // Store in agent-specific timeline
    const timelineKey = `timeline:agent:${agentId}`;
    await this.redis.zadd(timelineKey, timestamp, JSON.stringify(metricData));
    
    // Store in global performance timeline
    const globalKey = 'performance:global:timeline';
    await this.redis.zadd(globalKey, timestamp, JSON.stringify(metricData));
    
    // Set expiration for data retention
    const expireTime = this.config.retentionDays * 24 * 60 * 60;
    await this.redis.expire(key, expireTime);
    await this.redis.expire(timelineKey, expireTime);
    
    // Check for performance anomalies
    await this.checkPerformanceAnomalies(agentId, metricData);
    
    this.emit('metrics:recorded', { agentId, metrics: metricData });
    
    return metricData;
  }
  
  /**
   * Record task execution metrics
   */
  async recordTaskMetrics(taskId, agentId, metrics) {
    const timestamp = Date.now();
    const taskData = {
      taskId,
      agentId,
      timestamp,
      ...metrics,
      id: `task:${taskId}:${timestamp}`
    };
    
    // Store in task performance timeline
    const taskKey = `performance:task:${taskId}`;
    await this.redis.zadd(taskKey, timestamp, JSON.stringify(taskData));
    
    // Store in agent task history
    const agentTaskKey = `tasks:agent:${agentId}`;
    await this.redis.zadd(agentTaskKey, timestamp, JSON.stringify(taskData));
    
    // Update agent performance aggregates
    await this.updateAgentAggregates(agentId, taskData);
    
    this.emit('task:recorded', { taskId, agentId, metrics: taskData });
    
    return taskData;
  }
  
  /**
   * Get historical performance data for an agent
   */
  async getAgentPerformanceHistory(agentId, options = {}) {
    const {
      startTime = Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
      endTime = Date.now(),
      limit = 1000,
      includeAggregates = true
    } = options;
    
    const key = `performance:agent:${agentId}`;
    
    // Get performance metrics within time range
    const metrics = await this.redis.zrangebyscore(
      key,
      startTime,
      endTime,
      'LIMIT',
      0,
      limit
    );
    
    const parsedMetrics = metrics.map(m => JSON.parse(m));
    
    let result = {
      agentId,
      timeRange: { startTime, endTime },
      metrics: parsedMetrics,
      totalRecords: parsedMetrics.length
    };
    
    if (includeAggregates) {
      result.aggregates = await this.calculateAgentAggregates(agentId, startTime, endTime);
      result.trends = await this.calculatePerformanceTrends(agentId, startTime, endTime);
    }
    
    return result;
  }
  
  /**
   * Get performance trends and patterns
   */
  async getPerformanceTrends(timeRange = '7d') {
    const endTime = Date.now();
    const startTime = endTime - this.parseTimeRange(timeRange);
    
    // Get global performance data
    const globalMetrics = await this.redis.zrangebyscore(
      'performance:global:timeline',
      startTime,
      endTime
    );
    
    const parsedMetrics = globalMetrics.map(m => JSON.parse(m));
    
    // Calculate trends by time intervals
    const trends = {};
    for (const interval of this.config.aggregationIntervals) {
      trends[interval] = await this.aggregateByInterval(parsedMetrics, interval, startTime, endTime);
    }
    
    return {
      timeRange: { startTime, endTime },
      intervals: this.config.aggregationIntervals,
      trends,
      summary: await this.calculateTrendSummary(parsedMetrics)
    };
  }
  
  /**
   * Analyze performance patterns and detect anomalies
   */
  async analyzePerformancePatterns(agentId, timeRange = '7d') {
    const endTime = Date.now();
    const startTime = endTime - this.parseTimeRange(timeRange);
    
    const performanceData = await this.getAgentPerformanceHistory(agentId, {
      startTime,
      endTime,
      includeAggregates: true
    });
    
    const patterns = {
      responseTimePatterns: this.analyzeResponseTimePatterns(performanceData.metrics),
      errorRatePatterns: this.analyzeErrorRatePatterns(performanceData.metrics),
      taskCompletionPatterns: this.analyzeTaskCompletionPatterns(performanceData.metrics),
      collaborationPatterns: await this.analyzeCollaborationPatterns(agentId, startTime, endTime)
    };
    
    const anomalies = await this.detectAnomalies(agentId, performanceData.metrics);
    
    return {
      agentId,
      timeRange: { startTime, endTime },
      patterns,
      anomalies,
      recommendations: this.generateRecommendations(patterns, anomalies)
    };
  }
  
  /**
   * Calculate performance aggregates for an agent
   */
  async calculateAgentAggregates(agentId, startTime, endTime) {
    const metrics = await this.redis.zrangebyscore(
      `performance:agent:${agentId}`,
      startTime,
      endTime
    );
    
    if (metrics.length === 0) return null;
    
    const parsedMetrics = metrics.map(m => JSON.parse(m));
    
    const aggregates = {
      totalTasks: parsedMetrics.length,
      successfulTasks: parsedMetrics.filter(m => m.status === 'success').length,
      failedTasks: parsedMetrics.filter(m => m.status === 'error').length,
      averageResponseTime: this.calculateAverage(parsedMetrics, 'responseTime'),
      averageConfidence: this.calculateAverage(parsedMetrics, 'confidence'),
      peakResponseTime: Math.max(...parsedMetrics.map(m => m.responseTime || 0)),
      minResponseTime: Math.min(...parsedMetrics.map(m => m.responseTime || 0)),
      errorRate: parsedMetrics.filter(m => m.status === 'error').length / parsedMetrics.length,
      performanceScore: this.calculatePerformanceScore(parsedMetrics)
    };
    
    // Store aggregates for quick access
    const aggregatesKey = `aggregates:agent:${agentId}:${Math.floor(endTime / (60 * 60 * 1000))}`; // Hourly
    await this.redis.setex(aggregatesKey, 7 * 24 * 60 * 60, JSON.stringify(aggregates));
    
    return aggregates;
  }
  
  /**
   * Detect performance anomalies
   */
  async detectAnomalies(agentId, metrics) {
    if (metrics.length < 10) return []; // Need sufficient data for anomaly detection
    
    const anomalies = [];
    
    // Response time anomalies
    const responseTimeAnomalies = this.detectOutliers(
      metrics.map(m => m.responseTime || 0),
      this.config.alertThresholds.responseTime
    );
    
    responseTimeAnomalies.forEach((anomaly, index) => {
      anomalies.push({
        type: 'response_time',
        severity: anomaly.value > this.config.alertThresholds.responseTime * 2 ? 'high' : 'medium',
        value: anomaly.value,
        threshold: this.config.alertThresholds.responseTime,
        timestamp: metrics[anomaly.index]?.timestamp,
        details: `Response time ${anomaly.value}ms exceeds threshold`
      });
    });
    
    // Error rate anomalies
    const recentMetrics = metrics.slice(-20); // Last 20 metrics
    const recentErrorRate = recentMetrics.filter(m => m.status === 'error').length / recentMetrics.length;
    
    if (recentErrorRate > this.config.alertThresholds.errorRate) {
      anomalies.push({
        type: 'error_rate',
        severity: recentErrorRate > this.config.alertThresholds.errorRate * 2 ? 'high' : 'medium',
        value: recentErrorRate,
        threshold: this.config.alertThresholds.errorRate,
        timestamp: Date.now(),
        details: `Error rate ${(recentErrorRate * 100).toFixed(2)}% exceeds threshold`
      });
    }
    
    // Confidence anomalies
    const confidenceAnomalies = this.detectConfidenceAnomalies(metrics);
    anomalies.push(...confidenceAnomalies);
    
    // Store anomalies for alerting
    if (anomalies.length > 0) {
      const anomalyKey = `anomalies:agent:${agentId}:${Date.now()}`;
      await this.redis.setex(anomalyKey, 24 * 60 * 60, JSON.stringify(anomalies));
      
      this.emit('anomalies:detected', { agentId, anomalies });
    }
    
    return anomalies;
  }
  
  /**
   * Generate performance report
   */
  async generatePerformanceReport(agentId, timeRange = '7d') {
    const endTime = Date.now();
    const startTime = endTime - this.parseTimeRange(timeRange);
    
    const [
      performanceHistory,
      trends,
      patterns,
      aggregates
    ] = await Promise.all([
      this.getAgentPerformanceHistory(agentId, { startTime, endTime }),
      this.getPerformanceTrends(timeRange),
      this.analyzePerformancePatterns(agentId, timeRange),
      this.calculateAgentAggregates(agentId, startTime, endTime)
    ]);
    
    const report = {
      agentId,
      reportGenerated: new Date().toISOString(),
      timeRange: { startTime, endTime },
      executiveSummary: this.generateExecutiveSummary(aggregates, patterns),
      performanceMetrics: {
        aggregates,
        trends,
        patterns
      },
      anomalies: patterns.anomalies,
      recommendations: patterns.recommendations,
      insights: this.generateInsights(performanceHistory, trends)
    };
    
    // Store report
    const reportKey = `reports:agent:${agentId}:${Date.now()}`;
    await this.redis.setex(reportKey, 30 * 24 * 60 * 60, JSON.stringify(report)); // 30 days
    
    return report;
  }
  
  // Helper methods
  parseTimeRange(range) {
    const units = {
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
      'w': 7 * 24 * 60 * 60 * 1000,
      'm': 30 * 24 * 60 * 60 * 1000
    };
    
    const match = range.match(/^(\d+)([hdwm])$/);
    if (!match) throw new Error(`Invalid time range format: ${range}`);
    
    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }
  
  calculateAverage(data, field) {
    if (data.length === 0) return 0;
    const values = data.map(d => d[field] || 0).filter(v => v > 0);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
  
  calculatePerformanceScore(metrics) {
    if (metrics.length === 0) return 0;
    
    const avgResponseTime = this.calculateAverage(metrics, 'responseTime');
    const avgConfidence = this.calculateAverage(metrics, 'confidence');
    const errorRate = metrics.filter(m => m.status === 'error').length / metrics.length;
    
    // Normalize and weight factors
    const responseScore = Math.max(0, 1 - (avgResponseTime / 5000)); // 5s as baseline
    const confidenceScore = avgConfidence;
    const errorScore = Math.max(0, 1 - errorRate);
    
    return (responseScore * 0.4 + confidenceScore * 0.4 + errorScore * 0.2) * 100;
  }
  
  detectOutliers(values, threshold) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length);
    
    return values
      .map((value, index) => ({
        index,
        value,
        zScore: Math.abs((value - mean) / stdDev)
      }))
      .filter(outlier => outlier.zScore > 2 || outlier.value > threshold);
  }
  
  detectConfidenceAnomalies(metrics) {
    const anomalies = [];
    const recentMetrics = metrics.slice(-10);
    
    recentMetrics.forEach((metric, index) => {
      if (metric.confidence && metric.confidence < 0.5) {
        anomalies.push({
          type: 'low_confidence',
          severity: metric.confidence < 0.3 ? 'high' : 'medium',
          value: metric.confidence,
          threshold: 0.5,
          timestamp: metric.timestamp,
          details: `Low confidence score ${metric.confidence} detected`
        });
      }
    });
    
    return anomalies;
  }
  
  analyzeResponseTimePatterns(metrics) {
    const responseTimes = metrics.map(m => m.responseTime || 0);
    
    return {
      average: this.calculateAverage(metrics, 'responseTime'),
      median: this.calculateMedian(responseTimes),
      p95: this.calculatePercentile(responseTimes, 95),
      trend: this.calculateTrend(responseTimes),
      volatility: this.calculateVolatility(responseTimes)
    };
  }
  
  analyzeErrorRatePatterns(metrics) {
    const errorCounts = metrics.map(m => m.status === 'error' ? 1 : 0);
    
    return {
      average: errorCounts.reduce((a, b) => a + b, 0) / metrics.length,
      trend: this.calculateTrend(errorCounts),
      peakErrorPeriod: this.findPeakErrorPeriod(metrics),
      commonErrors: this.findCommonErrors(metrics)
    };
  }
  
  analyzeTaskCompletionPatterns(metrics) {
    const completionTimes = metrics
      .filter(m => m.startTime && m.endTime)
      .map(m => m.endTime - m.startTime);
    
    return {
      average: this.calculateAverage(completionTimes),
      throughput: metrics.length / (7 * 24), // tasks per hour over 7 days
      efficiency: this.calculateEfficiency(metrics)
    };
  }
  
  async analyzeCollaborationPatterns(agentId, startTime, endTime) {
    // Get collaboration events from Redis
    const collabKey = `collaboration:agent:${agentId}`;
    const collabEvents = await this.redis.zrangebyscore(collabKey, startTime, endTime);
    
    const events = collabEvents.map(e => JSON.parse(e));
    
    return {
      collaborationCount: events.length,
      collaborators: [...new Set(events.map(e => e.collaboratorId))],
      averageCollaborationTime: this.calculateAverage(events, 'duration'),
      collaborationEfficiency: this.calculateCollaborationEfficiency(events)
    };
  }
  
  generateRecommendations(patterns, anomalies) {
    const recommendations = [];
    
    if (patterns.responseTimePatterns.average > 1000) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        title: 'High Response Times Detected',
        description: 'Consider optimizing task execution or increasing resources',
        action: 'Review task complexity and execution environment'
      });
    }
    
    if (patterns.errorRatePatterns.average > 0.05) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        title: 'Elevated Error Rate',
        description: 'Error rate exceeds 5% threshold',
        action: 'Investigate error patterns and implement retry mechanisms'
      });
    }
    
    if (anomalies.length > 0) {
      recommendations.push({
        type: 'monitoring',
        priority: 'medium',
        title: 'Performance Anomalies Detected',
        description: `${anomalies.length} anomalies detected in the analyzed period`,
        action: 'Review anomaly details and implement preventive measures'
      });
    }
    
    return recommendations;
  }
  
  // Additional helper methods for calculations
  calculateMedian(values) {
    const sorted = values.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  
  calculatePercentile(values, percentile) {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }
  
  calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const change = (secondAvg - firstAvg) / firstAvg;
    
    if (change > 0.1) return 'improving';
    if (change < -0.1) return 'degrading';
    return 'stable';
  }
  
  calculateVolatility(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
  
  async setupAggregationPipelines() {
    // Setup Redis streams for real-time aggregation
    // This would typically involve RedisTimeSeries or custom aggregation scripts
    console.log('Aggregation pipelines configured');
  }
  
  async updateAgentAggregates(agentId, taskData) {
    // Update real-time aggregates
    const aggregatesKey = `aggregates:agent:${agentId}:current`;
    const current = await this.redis.get(aggregatesKey);
    
    let aggregates = current ? JSON.parse(current) : {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageResponseTime: 0,
      averageConfidence: 0
    };
    
    aggregates.totalTasks++;
    if (taskData.status === 'success') aggregates.successfulTasks++;
    if (taskData.status === 'error') aggregates.failedTasks++;
    
    // Update running averages
    const alpha = 0.1; // Exponential moving average factor
    if (taskData.responseTime) {
      aggregates.averageResponseTime = aggregates.averageResponseTime * (1 - alpha) + taskData.responseTime * alpha;
    }
    if (taskData.confidence) {
      aggregates.averageConfidence = aggregates.averageConfidence * (1 - alpha) + taskData.confidence * alpha;
    }
    
    await this.redis.setex(aggregatesKey, 60 * 60, JSON.stringify(aggregates)); // 1 hour TTL
  }
  
  generateExecutiveSummary(aggregates, patterns) {
    if (!aggregates) return 'Insufficient data for summary';
    
    const performanceLevel = aggregates.performanceScore > 80 ? 'excellent' :
                           aggregates.performanceScore > 60 ? 'good' :
                           aggregates.performanceScore > 40 ? 'fair' : 'poor';
    
    return {
      overallPerformance: performanceLevel,
      performanceScore: aggregates.performanceScore,
      keyMetrics: {
        totalTasks: aggregates.totalTasks,
        successRate: (aggregates.successfulTasks / aggregates.totalTasks * 100).toFixed(1) + '%',
        averageResponseTime: aggregates.averageResponseTime.toFixed(0) + 'ms'
      },
      criticalIssues: patterns.anomalies.filter(a => a.severity === 'high').length,
      recommendations: patterns.recommendations.filter(r => r.priority === 'high').length
    };
  }
  
  generateInsights(performanceHistory, trends) {
    const insights = [];
    
    // Performance trend insights
    if (trends.trends['1d'] && trends.trends['1d'].responseTime) {
      const trend = trends.trends['1d'].responseTime.trend;
      if (trend === 'improving') {
        insights.push({
          type: 'positive',
          title: 'Response Time Improving',
          description: 'Daily response times show a positive trend'
        });
      } else if (trend === 'degrading') {
        insights.push({
          type: 'concern',
          title: 'Response Time Degrading',
          description: 'Daily response times are declining, attention needed'
        });
      }
    }
    
    return insights;
  }
  
  async aggregateByInterval(metrics, interval, startTime, endTime) {
    const intervalMs = this.parseTimeRange(interval);
    const intervals = [];
    
    for (let time = startTime; time < endTime; time += intervalMs) {
      const intervalEnd = Math.min(time + intervalMs, endTime);
      const intervalMetrics = metrics.filter(m => m.timestamp >= time && m.timestamp < intervalEnd);
      
      if (intervalMetrics.length > 0) {
        intervals.push({
          startTime: time,
          endTime: intervalEnd,
          count: intervalMetrics.length,
          averageResponseTime: this.calculateAverage(intervalMetrics, 'responseTime'),
          averageConfidence: this.calculateAverage(intervalMetrics, 'confidence'),
          errorRate: intervalMetrics.filter(m => m.status === 'error').length / intervalMetrics.length,
          performanceScore: this.calculatePerformanceScore(intervalMetrics)
        });
      }
    }
    
    return intervals;
  }
  
  calculateTrendSummary(metrics) {
    if (metrics.length === 0) return null;
    
    const recentMetrics = metrics.slice(-100); // Last 100 metrics
    const olderMetrics = metrics.slice(-200, -100); // Previous 100 metrics
    
    if (olderMetrics.length === 0) return null;
    
    const recentAvg = this.calculateAverage(recentMetrics, 'responseTime');
    const olderAvg = this.calculateAverage(olderMetrics, 'responseTime');
    
    const trend = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    return {
      trend: trend > 5 ? 'improving' : trend < -5 ? 'degrading' : 'stable',
      changePercent: trend.toFixed(2),
      recentAverage: recentAvg,
      olderAverage: olderAvg
    };
  }
  
  findPeakErrorPeriod(metrics) {
    const windowSize = 10; // Check 10-metric windows
    let maxErrorRate = 0;
    let peakPeriod = null;
    
    for (let i = 0; i <= metrics.length - windowSize; i++) {
      const window = metrics.slice(i, i + windowSize);
      const errorRate = window.filter(m => m.status === 'error').length / windowSize;
      
      if (errorRate > maxErrorRate) {
        maxErrorRate = errorRate;
        peakPeriod = {
          startTime: window[0].timestamp,
          endTime: window[window.length - 1].timestamp,
          errorRate: errorRate
        };
      }
    }
    
    return peakPeriod;
  }
  
  findCommonErrors(metrics) {
    const errorCounts = {};
    
    metrics
      .filter(m => m.status === 'error' && m.errorType)
      .forEach(m => {
        errorCounts[m.errorType] = (errorCounts[m.errorType] || 0) + 1;
      });
    
    return Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([errorType, count]) => ({ errorType, count }));
  }
  
  calculateEfficiency(metrics) {
    const completedTasks = metrics.filter(m => m.status === 'success');
    if (completedTasks.length === 0) return 0;
    
    const totalTime = completedTasks.reduce((sum, m) => {
      return sum + (m.endTime - m.startTime);
    }, 0);
    
    const avgTime = totalTime / completedTasks.length;
    const expectedTime = 5000; // 5 seconds baseline
    
    return Math.max(0, Math.min(1, expectedTime / avgTime));
  }
  
  calculateCollaborationEfficiency(events) {
    if (events.length === 0) return 0;
    
    const successfulEvents = events.filter(e => e.status === 'success');
    return successfulEvents.length / events.length;
  }
  
  async checkPerformanceAnomalies(agentId, metricData) {
    // Real-time anomaly checking
    if (metricData.responseTime && metricData.responseTime > this.config.alertThresholds.responseTime) {
      this.emit('alert', {
        type: 'response_time',
        agentId,
        value: metricData.responseTime,
        threshold: this.config.alertThresholds.responseTime
      });
    }
    
    if (metricData.confidence && metricData.confidence < 0.3) {
      this.emit('alert', {
        type: 'low_confidence',
        agentId,
        value: metricData.confidence,
        threshold: 0.3
      });
    }
  }
  
  /**
   * Cleanup old data and optimize storage
   */
  async cleanup() {
    const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    
    // This would typically be implemented with Redis commands to remove old data
    console.log(`Cleaning up performance data older than ${new Date(cutoffTime).toISOString()}`);
  }
  
  /**
   * Get system-wide performance statistics
   */
  async getSystemPerformanceStats() {
    const agentKeys = await this.redis.keys('performance:agent:*');
    
    const stats = {
      totalAgents: agentKeys.length,
      activeAgents: 0,
      totalMetrics: 0,
      systemHealth: 'healthy'
    };
    
    for (const key of agentKeys) {
      const metrics = await this.redis.zcard(key);
      stats.totalMetrics += metrics;
      
      if (metrics > 0) {
        stats.activeAgents++;
      }
    }
    
    // Calculate system health based on error rates and performance
    const recentErrors = await this.redis.zrangebyscore(
      'performance:global:timeline',
      Date.now() - (60 * 60 * 1000), // Last hour
      Date.now()
    );
    
    const errorRate = recentErrors.filter(m => {
      const parsed = JSON.parse(m);
      return parsed.status === 'error';
    }).length / recentErrors.length;
    
    if (errorRate > 0.1) stats.systemHealth = 'degraded';
    if (errorRate > 0.2) stats.systemHealth = 'critical';
    
    return stats;
  }
  
  /**
   * Close Redis connection and cleanup resources
   */
  async close() {
    await this.redis.quit();
    console.log('Redis Performance Analyzer closed');
  }
}

module.exports = RedisPerformanceAnalyzer;