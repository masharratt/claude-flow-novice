/**
 * Performance API Routes
 * 
 * RESTful API endpoints for accessing performance analytics,
 * historical data, and system health metrics.
 */

const express = require('express');
const router = express.Router();
const RedisPerformanceAnalyzer = require('../services/RedisPerformanceAnalyzer');
const PerformanceTrackingMiddleware = require('../middleware/PerformanceTrackingMiddleware');

// Initialize performance tracking
const performanceTracker = new PerformanceTrackingMiddleware();
const analyzer = performanceTracker.analyzer;

// Apply performance tracking to all routes
router.use(performanceTracker.middleware());

/**
 * GET /api/performance/health
 * Health check endpoint for performance monitoring system
 */
router.get('/health', async (req, res) => {
  try {
    const health = await performanceTracker.healthCheck();
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/agents/:agentId/history
 * Get performance history for a specific agent
 */
router.get('/agents/:agentId/history', async (req, res) => {
  try {
    const { agentId } = req.params;
    const {
      startTime,
      endTime,
      limit = 1000,
      includeAggregates = 'true'
    } = req.query;
    
    const options = {
      limit: parseInt(limit),
      includeAggregates: includeAggregates === 'true'
    };
    
    if (startTime) {
      options.startTime = parseInt(startTime);
    }
    if (endTime) {
      options.endTime = parseInt(endTime);
    }
    
    const history = await analyzer.getAgentPerformanceHistory(agentId, options);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/agents/:agentId/aggregates
 * Get performance aggregates for a specific agent
 */
router.get('/agents/:agentId/aggregates', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { startTime, endTime } = req.query;
    
    const start = startTime ? parseInt(startTime) : Date.now() - (24 * 60 * 60 * 1000);
    const end = endTime ? parseInt(endTime) : Date.now();
    
    const aggregates = await analyzer.calculateAgentAggregates(agentId, start, end);
    
    res.json({
      success: true,
      data: aggregates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/agents/:agentId/patterns
 * Analyze performance patterns for a specific agent
 */
router.get('/agents/:agentId/patterns', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { timeRange = '7d' } = req.query;
    
    const patterns = await analyzer.analyzePerformancePatterns(agentId, timeRange);
    
    res.json({
      success: true,
      data: patterns
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/agents/:agentId/report
 * Generate comprehensive performance report for an agent
 */
router.get('/agents/:agentId/report', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { timeRange = '7d' } = req.query;
    
    const report = await analyzer.generatePerformanceReport(agentId, timeRange);
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/trends
 * Get system-wide performance trends
 */
router.get('/trends', async (req, res) => {
  try {
    const { timeRange = '7d' } = req.query;
    
    const trends = await analyzer.getPerformanceTrends(timeRange);
    
    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/system/stats
 * Get system-wide performance statistics
 */
router.get('/system/stats', async (req, res) => {
  try {
    const stats = await analyzer.getSystemPerformanceStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/performance/agents/:agentId/metrics
 * Manually record performance metrics for an agent
 */
router.post('/agents/:agentId/metrics', async (req, res) => {
  try {
    const { agentId } = req.params;
    const metrics = req.body;
    
    // Validate required fields
    if (!metrics || typeof metrics !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Metrics object is required'
      });
    }
    
    const result = await analyzer.recordAgentMetrics(agentId, metrics);
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/performance/tasks/:taskId/metrics
 * Record task execution metrics
 */
router.post('/tasks/:taskId/metrics', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agentId, ...metrics } = req.body;
    
    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'Agent ID is required'
      });
    }
    
    const result = await analyzer.recordTaskMetrics(taskId, agentId, metrics);
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/alerts
 * Get recent performance alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const alerts = await performanceTracker.getRecentAlerts(parseInt(limit));
    
    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/anomalies
 * Get detected performance anomalies
 */
router.get('/anomalies', async (req, res) => {
  try {
    const { agentId, timeRange = '24h' } = req.query;
    
    if (agentId) {
      // Get anomalies for specific agent
      const endTime = Date.now();
      const startTime = endTime - performanceTracker.parseTimeRange(timeRange);
      
      const history = await analyzer.getAgentPerformanceHistory(agentId, {
        startTime,
        endTime
      });
      
      const anomalies = await analyzer.detectAnomalies(agentId, history.metrics);
      
      res.json({
        success: true,
        data: {
          agentId,
          timeRange: { startTime, endTime },
          anomalies
        }
      });
    } else {
      // Get system-wide anomalies (would need to be implemented)
      res.json({
        success: true,
        data: {
          message: 'System-wide anomaly detection not implemented yet',
          suggestion: 'Specify an agentId to get anomalies for a specific agent'
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/collaboration/:agentId
 * Get collaboration patterns for an agent
 */
router.get('/collaboration/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { timeRange = '7d' } = req.query;
    
    const endTime = Date.now();
    const startTime = endTime - performanceTracker.parseTimeRange(timeRange);
    
    const collaborationPatterns = await analyzer.analyzeCollaborationPatterns(
      agentId,
      startTime,
      endTime
    );
    
    res.json({
      success: true,
      data: collaborationPatterns
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/dashboard
 * Get dashboard data (summary of key metrics)
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    // Get system stats
    const systemStats = await analyzer.getSystemPerformanceStats();
    
    // Get recent alerts
    const alerts = await performanceTracker.getRecentAlerts(10);
    
    // Get trends
    const trends = await analyzer.getPerformanceTrends(timeRange);
    
    // Get top performing agents (would need to be implemented)
    const topAgents = await getTopPerformingAgents(timeRange);
    
    const dashboardData = {
      systemStats,
      recentAlerts: alerts,
      trends,
      topAgents,
      lastUpdated: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/performance/cleanup
 * Trigger cleanup of old performance data
 */
router.post('/cleanup', async (req, res) => {
  try {
    await analyzer.cleanup();
    
    res.json({
      success: true,
      message: 'Performance data cleanup completed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/export/:agentId
 * Export performance data for an agent
 */
router.get('/export/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { timeRange = '7d', format = 'json' } = req.query;
    
    const report = await analyzer.generatePerformanceReport(agentId, timeRange);
    
    if (format === 'csv') {
      // Convert to CSV format (simplified)
      const csv = convertToCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${agentId}-performance.csv"`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${agentId}-performance.json"`);
      res.json(report);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper functions
async function getTopPerformingAgents(timeRange) {
  try {
    // This would need to be implemented to get top performing agents
    // For now, return empty array
    return [];
  } catch (error) {
    console.error('Failed to get top performing agents:', error);
    return [];
  }
}

function convertToCSV(report) {
  // Simplified CSV conversion
  const headers = ['Agent ID', 'Performance Score', 'Total Tasks', 'Success Rate', 'Avg Response Time'];
  const row = [
    report.agentId,
    report.executiveSummary.performanceScore,
    report.executiveSummary.keyMetrics.totalTasks,
    report.executiveSummary.keyMetrics.successRate,
    report.executiveSummary.keyMetrics.averageResponseTime
  ];
  
  return [headers.join(','), row.join(',')].join('\n');
}

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Performance API Error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    requestId: req.id
  });
});

module.exports = router;