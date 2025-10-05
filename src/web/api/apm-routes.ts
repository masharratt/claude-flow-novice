/**
 * APM API Routes
 * REST API endpoints for APM integration, health checks, and metrics
 */

import { Router } from 'express';
import { APMIntegration, createAPMIntegration } from '../../monitoring/apm/apm-integration.js';

const router = Router();

// Initialize APM integration with environment configuration
const apmIntegration = createAPMIntegration({
  dataDog: {
    enabled: process.env.DATADOG_ENABLED === 'true',
    apiKey: process.env.DATADOG_API_KEY,
    site: process.env.DATADOG_SITE || 'datadoghq.com',
    serviceName: process.env.DATADOG_SERVICE_NAME || 'claude-flow-novice',
    env: process.env.NODE_ENV || 'production',
    version: process.env.npm_package_version || '1.6.2'
  },
  newRelic: {
    enabled: process.env.NEWRELIC_ENABLED === 'true',
    licenseKey: process.env.NEWRELIC_LICENSE_KEY,
    appName: process.env.NEWRELIC_APP_NAME || 'Claude Flow Novice',
    accountId: process.env.NEWRELIC_ACCOUNT_ID
  },
  distributedTracing: {
    enabled: process.env.DISTRIBUTED_TRACING_ENABLED !== 'false',
    samplingRate: parseFloat(process.env.TRACE_SAMPLING_RATE || '1.0')
  },
  performanceOptimization: {
    enabled: process.env.PERFORMANCE_OPTIMIZATION_ENABLED !== 'false',
    monitoringInterval: parseInt(process.env.PERFORMANCE_MONITORING_INTERVAL || '5000')
  },
  customMetrics: {
    enabled: process.env.CUSTOM_METRICS_ENABLED !== 'false',
    interval: parseInt(process.env.CUSTOM_METRICS_INTERVAL || '10000')
  },
  alerting: {
    enabled: process.env.APM_ALERTING_ENABLED === 'true',
    webhookUrl: process.env.APM_WEBHOOK_URL,
    slackChannel: process.env.APM_SLACK_CHANNEL,
    emailRecipients: process.env.APM_EMAIL_RECIPIENTS?.split(',').filter(Boolean)
  }
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const health = await apmIntegration.getHealthStatus();
    const statusCode = health.overall === 'healthy' ? 200 :
                       health.overall === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      error: 'Health check failed',
      message: error.message
    });
  }
});

// Performance metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    const timeRange = req.query.timeRange as string || '1h';
    const analytics = apmIntegration.getPerformanceAnalytics();

    res.json({
      timeRange,
      timestamp: new Date().toISOString(),
      ...analytics
    });
  } catch (error) {
    console.error('Failed to fetch metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch metrics',
      message: error.message
    });
  }
});

// Custom metrics recording endpoint
router.post('/metrics/custom', async (req, res) => {
  try {
    const { metricName, value, tags, type } = req.body;

    if (!metricName || value === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: metricName, value'
      });
    }

    apmIntegration.recordBusinessMetric(metricName, value, tags, type);

    res.json({
      success: true,
      message: 'Custom metric recorded successfully',
      metricName,
      value,
      tags,
      type: type || 'gauge'
    });
  } catch (error) {
    console.error('Failed to record custom metric:', error);
    res.status(500).json({
      error: 'Failed to record custom metric',
      message: error.message
    });
  }
});

// Agent lifecycle tracing endpoint
router.post('/trace/agent', async (req, res) => {
  try {
    const { agentType, lifecycleEvent, agentId, metadata } = req.body;

    if (!agentType || !lifecycleEvent) {
      return res.status(400).json({
        error: 'Missing required fields: agentType, lifecycleEvent'
      });
    }

    apmIntegration.traceAgentLifecycle(agentType, lifecycleEvent, agentId, metadata);

    res.json({
      success: true,
      message: 'Agent lifecycle trace recorded successfully',
      agentType,
      lifecycleEvent,
      agentId,
      metadata
    });
  } catch (error) {
    console.error('Failed to trace agent lifecycle:', error);
    res.status(500).json({
      error: 'Failed to trace agent lifecycle',
      message: error.message
    });
  }
});

// Swarm activity tracing endpoint
router.post('/trace/swarm', async (req, res) => {
  try {
    const { swarmId, activity, topology, agentCount, metadata } = req.body;

    if (!swarmId || !activity || !topology) {
      return res.status(400).json({
        error: 'Missing required fields: swarmId, activity, topology'
      });
    }

    apmIntegration.traceSwarmActivity(swarmId, activity, topology, agentCount, metadata);

    res.json({
      success: true,
      message: 'Swarm activity trace recorded successfully',
      swarmId,
      activity,
      topology,
      agentCount,
      metadata
    });
  } catch (error) {
    console.error('Failed to trace swarm activity:', error);
    res.status(500).json({
      error: 'Failed to trace swarm activity',
      message: error.message
    });
  }
});

// WebSocket performance endpoint
router.post('/trace/websocket', async (req, res) => {
  try {
    const { operation, socketId, duration, success, metadata } = req.body;

    if (!operation || !socketId) {
      return res.status(400).json({
        error: 'Missing required fields: operation, socketId'
      });
    }

    apmIntegration.optimizeWebSocketPerformance(operation, socketId, duration, success, metadata);

    res.json({
      success: true,
      message: 'WebSocket performance trace recorded successfully',
      operation,
      socketId,
      duration,
      success,
      metadata
    });
  } catch (error) {
    console.error('Failed to trace WebSocket performance:', error);
    res.status(500).json({
      error: 'Failed to trace WebSocket performance',
      message: error.message
    });
  }
});

// Database performance monitoring endpoint
router.post('/trace/database', async (req, res) => {
  try {
    const { operation, query, duration, success, metadata } = req.body;

    if (!operation) {
      return res.status(400).json({
        error: 'Missing required field: operation'
      });
    }

    apmIntegration.monitorDatabasePerformance(operation, query, duration, success, metadata);

    res.json({
      success: true,
      message: 'Database performance trace recorded successfully',
      operation,
      query,
      duration,
      success,
      metadata
    });
  } catch (error) {
    console.error('Failed to monitor database performance:', error);
    res.status(500).json({
      error: 'Failed to monitor database performance',
      message: error.message
    });
  }
});

// Integration test endpoint
router.post('/test/integration', async (req, res) => {
  try {
    const results = await apmIntegration.runIntegrationTest();

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Integration test failed:', error);
    res.status(500).json({
      error: 'Integration test failed',
      message: error.message
    });
  }
});

// Disaster recovery test endpoint
router.post('/test/disaster-recovery', async (req, res) => {
  try {
    const results = await apmIntegration.runDisasterRecoveryTest();

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Disaster recovery test failed:', error);
    res.status(500).json({
      error: 'Disaster recovery test failed',
      message: error.message
    });
  }
});

// Configuration endpoint
router.get('/config', (req, res) => {
  try {
    const collectors = apmIntegration.getCollectors();

    res.json({
      dataDog: !!collectors.dataDog,
      newRelic: !!collectors.newRelic,
      distributedTracing: !!collectors.distributedTracer,
      performanceOptimizer: !!collectors.performanceOptimizer,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get APM config:', error);
    res.status(500).json({
      error: 'Failed to get APM configuration',
      message: error.message
    });
  }
});

// Recommendations endpoint
router.get('/recommendations', (req, res) => {
  try {
    const analytics = apmIntegration.getPerformanceAnalytics();

    res.json({
      recommendations: analytics.recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get recommendations:', error);
    res.status(500).json({
      error: 'Failed to get recommendations',
      message: error.message
    });
  }
});

// Slow queries endpoint
router.get('/slow-queries', (req, res) => {
  try {
    const collectors = apmIntegration.getCollectors();

    if (!collectors.performanceOptimizer) {
      return res.status(503).json({
        error: 'Performance optimizer not available'
      });
    }

    const slowQueries = collectors.performanceOptimizer.getSlowQueries();

    res.json({
      slowQueries,
      count: slowQueries.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get slow queries:', error);
    res.status(500).json({
      error: 'Failed to get slow queries',
      message: error.message
    });
  }
});

// Cache performance endpoint
router.get('/cache-performance', (req, res) => {
  try {
    const collectors = apmIntegration.getCollectors();

    if (!collectors.performanceOptimizer) {
      return res.status(503).json({
        error: 'Performance optimizer not available'
      });
    }

    const cacheHitRates = collectors.performanceOptimizer.getCacheHitRates();

    res.json({
      cacheHitRates: Object.fromEntries(cacheHitRates),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get cache performance:', error);
    res.status(500).json({
      error: 'Failed to get cache performance',
      message: error.message
    });
  }
});

// Middleware to add APM tracing to all requests
router.use((req, res, next) => {
  const startTime = Date.now();

  // Extract trace context from headers
  const traceContext = {
    traceId: req.headers['x-trace-id'] as string,
    spanId: req.headers['x-span-id'] as string,
    parentSpanId: req.headers['x-parent-span-id'] as string
  };

  // Record the request
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const success = res.statusCode < 400;

    // Record API call metrics
    if (traceContext.traceId) {
      // This is part of an existing trace
      apmIntegration.monitorDatabasePerformance('api_request', undefined, duration, success, {
        method: req.method,
        route: req.route?.path || req.path,
        statusCode: res.statusCode.toString(),
        userAgent: req.headers['user-agent']
      });
    } else {
      // Create a new trace for this request
      apmIntegration.traceAgentLifecycle('api-gateway', 'execute', undefined, {
        method: req.method,
        route: req.route?.path || req.path,
        statusCode: res.statusCode.toString(),
        duration: duration.toString()
      });
    }
  });

  next();
});

export default router;