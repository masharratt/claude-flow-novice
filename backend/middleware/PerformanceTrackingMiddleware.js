/**
 * Performance Tracking Middleware
 * 
 * Express middleware for automatically tracking agent performance metrics
 * and integrating with the Redis Performance Analyzer.
 */

const RedisPerformanceAnalyzer = require('../services/RedisPerformanceAnalyzer');

class PerformanceTrackingMiddleware {
  constructor(config = {}) {
    this.analyzer = new RedisPerformanceAnalyzer(config);
    this.config = {
      trackResponseTime: true,
      trackConfidence: true,
      trackErrors: true,
      trackCollaboration: true,
      autoInitialize: true,
      ...config
    };
    
    if (this.config.autoInitialize) {
      this.initialize();
    }
  }
  
  async initialize() {
    try {
      await this.analyzer.initialize();
      console.log('Performance Tracking Middleware initialized');
    } catch (error) {
      console.error('Failed to initialize Performance Tracking Middleware:', error);
    }
  }
  
  /**
   * Express middleware function for tracking request performance
   */
  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      const agentId = this.extractAgentId(req);
      const taskId = this.extractTaskId(req);
      
      // Store start time on request object
      req.performanceStartTime = startTime;
      req.agentId = agentId;
      req.taskId = taskId;
      
      // Track response
      const originalSend = res.send;
      res.send = function(data) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        // Record metrics after response is sent
        setImmediate(() => {
          this.recordRequestMetrics(req, res, responseTime);
        }.bind(this));
        
        originalSend.call(this, data);
      }.bind(res);
      
      next();
    };
  }
  
  /**
   * Extract agent ID from request
   */
  extractAgentId(req) {
    return req.headers['x-agent-id'] || 
           req.user?.agentId || 
           req.body?.agentId || 
           req.params?.agentId ||
           req.query?.agentId ||
           'anonymous-agent';
  }
  
  /**
   * Extract task ID from request
   */
  extractTaskId(req) {
    return req.headers['x-task-id'] ||
           req.body?.taskId ||
           req.params?.taskId ||
           req.query?.taskId ||
           `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Record request metrics
   */
  async recordRequestMetrics(req, res, responseTime) {
    try {
      const agentId = req.agentId;
      const taskId = req.taskId;
      
      const metrics = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime,
        timestamp: Date.now(),
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress,
        contentType: res.getHeader('content-type'),
        contentLength: res.getHeader('content-length')
      };
      
      // Determine success/error status
      const status = res.statusCode >= 400 ? 'error' : 'success';
      metrics.status = status;
      
      // Extract confidence from response or request
      if (req.body?.confidence) {
        metrics.confidence = req.body.confidence;
      } else if (res.locals?.confidence) {
        metrics.confidence = res.locals.confidence;
      }
      
      // Extract task type from route or body
      metrics.taskType = this.extractTaskType(req);
      
      // Record agent metrics
      await this.analyzer.recordAgentMetrics(agentId, metrics);
      
      // Record task metrics if taskId is available
      if (taskId && taskId !== `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`) {
        await this.analyzer.recordTaskMetrics(taskId, agentId, {
          ...metrics,
          startTime: req.performanceStartTime,
          endTime: Date.now()
        });
      }
      
      // Track collaboration if relevant
      if (this.config.trackCollaboration) {
        await this.trackCollaboration(req, agentId, metrics);
      }
      
    } catch (error) {
      console.error('Failed to record performance metrics:', error);
    }
  }
  
  /**
   * Extract task type from request
   */
  extractTaskType(req) {
    const pathSegments = req.path.split('/').filter(s => s);
    
    // Try to determine task type from URL path
    if (pathSegments.includes('api')) {
      const apiIndex = pathSegments.indexOf('api');
      if (apiIndex >= 0 && pathSegments[apiIndex + 1]) {
        return pathSegments[apiIndex + 1];
      }
    }
    
    // Fallback to request body or query parameters
    return req.body?.taskType ||
           req.query?.taskType ||
           req.headers['x-task-type'] ||
           'unknown';
  }
  
  /**
   * Track collaboration between agents
   */
  async trackCollaboration(req, agentId, metrics) {
    try {
      const collaboratorId = req.headers['x-collaborator-id'] ||
                            req.body?.collaboratorId ||
                            req.query?.collaboratorId;
      
      if (collaboratorId && collaboratorId !== agentId) {
        const collaborationMetrics = {
          agentId,
          collaboratorId,
          timestamp: Date.now(),
          duration: metrics.responseTime,
          status: metrics.status,
          taskType: metrics.taskType,
          method: metrics.method,
          url: metrics.url
        };
        
        // Store collaboration event
        const collabKey = `collaboration:agent:${agentId}`;
        await this.analyzer.redis.zadd(
          collabKey,
          collaborationMetrics.timestamp,
          JSON.stringify(collaborationMetrics)
        );
        
        // Set expiration
        await this.analyzer.redis.expire(collabKey, 7 * 24 * 60 * 60); // 7 days
      }
    } catch (error) {
      console.error('Failed to track collaboration:', error);
    }
  }
  
  /**
   * Middleware for manual performance tracking
   */
  trackPerformance(agentId, metrics) {
    return async (req, res, next) => {
      try {
        await this.analyzer.recordAgentMetrics(agentId, {
          ...metrics,
          timestamp: Date.now(),
          method: req.method,
          url: req.url,
          ip: req.ip
        });
      } catch (error) {
        console.error('Manual performance tracking failed:', error);
      }
      
      next();
    };
  }
  
  /**
   * Get performance statistics for an agent
   */
  async getAgentStats(agentId, timeRange = '24h') {
    try {
      return await this.analyzer.getAgentPerformanceHistory(agentId, {
        startTime: Date.now() - this.parseTimeRange(timeRange),
        endTime: Date.now()
      });
    } catch (error) {
      console.error('Failed to get agent stats:', error);
      return null;
    }
  }
  
  /**
   * Get system-wide performance statistics
   */
  async getSystemStats() {
    try {
      return await this.analyzer.getSystemPerformanceStats();
    } catch (error) {
      console.error('Failed to get system stats:', error);
      return null;
    }
  }
  
  /**
   * Generate performance report for an agent
   */
  async generateReport(agentId, timeRange = '7d') {
    try {
      return await this.analyzer.generatePerformanceReport(agentId, timeRange);
    } catch ( error ) {
      console.error('Failed to generate performance report:', error);
      return null;
    }
  }
  
  /**
   * Setup performance monitoring alerts
   */
  setupAlerts(alertConfig = {}) {
    this.analyzer.on('alert', (alert) => {
      console.warn('Performance Alert:', alert);
      
      // Emit alert event for external handlers
      if (alertConfig.onAlert) {
        alertConfig.onAlert(alert);
      }
      
      // Store alert for dashboard
      this.storeAlert(alert);
    });
    
    this.analyzer.on('anomalies:detected', (data) => {
      console.warn('Performance Anomalies Detected:', data);
      
      if (alertConfig.onAnomaly) {
        alertConfig.onAnomaly(data);
      }
    });
  }
  
  /**
   * Store alert for dashboard visualization
   */
  async storeAlert(alert) {
    try {
      const alertKey = `alerts:performance:${Date.now()}`;
      await this.analyzer.redis.setex(alertKey, 24 * 60 * 60, JSON.stringify(alert));
    } catch (error) {
      console.error('Failed to store alert:', error);
    }
  }
  
  /**
   * Get recent alerts
   */
  async getRecentAlerts(limit = 50) {
    try {
      const alertKeys = await this.analyzer.redis.keys('alerts:performance:*');
      const recentKeys = alertKeys.slice(-limit);
      
      const alerts = [];
      for (const key of recentKeys) {
        const alert = await this.analyzer.redis.get(key);
        if (alert) {
          alerts.push(JSON.parse(alert));
        }
      }
      
      return alerts.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to get recent alerts:', error);
      return [];
    }
  }
  
  /**
   * Parse time range string to milliseconds
   */
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
  
  /**
   * Health check for the performance tracking system
   */
  async healthCheck() {
    try {
      const stats = await this.analyzer.getSystemPerformanceStats();
      const redisStatus = this.analyzer.redis.status === 'ready';
      
      return {
        status: 'healthy',
        redis: redisStatus ? 'connected' : 'disconnected',
        systemStats: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      await this.analyzer.close();
      console.log('Performance Tracking Middleware shutdown complete');
    } catch (error) {
      console.error('Error during Performance Tracking Middleware shutdown:', error);
    }
  }
}

module.exports = PerformanceTrackingMiddleware;