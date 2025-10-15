/**
 * Redis Performance Enhancement Server
 * 
 * Main entry point for the Phase 4 Redis Transparency Enhancement system.
 * Provides historical performance analysis, collaboration tracking, and
 * anomaly detection capabilities.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

// Import routes and middleware
const performanceRoutes = require('./api/performance');
const PerformanceTrackingMiddleware = require('./middleware/PerformanceTrackingMiddleware');
const config = require('./config/redis-performance.config');

// Initialize Express app
const app = express();

// Configure logging
const logger = winston.createLogger({
  level: config.monitoring.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'redis-performance' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors(config.api.cors));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.api.rateLimit.windowMs,
  max: config.api.rateLimit.max,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.api.rateLimit.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Initialize performance tracking
const performanceTracker = new PerformanceTrackingMiddleware(config);

// Setup performance alerts
performanceTracker.setupAlerts({
  onAlert: (alert) => {
    logger.warn('Performance Alert', alert);
    // Here you could add additional alert handling like sending to Slack, email, etc.
  },
  onAnomaly: (data) => {
    logger.warn('Performance Anomaly Detected', data);
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await performanceTracker.healthCheck();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      performance: health
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Service unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api/performance', performanceRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Redis Performance Enhancement API',
    version: process.env.npm_package_version || '1.0.0',
    description: 'Phase 4 Redis Transparency Enhancement - Historical Performance Analysis',
    endpoints: {
      health: '/health',
      performance: '/api/performance',
      documentation: '/api/performance/docs'
    },
    features: {
      historicalAnalysis: true,
      anomalyDetection: true,
      collaborationTracking: true,
      performanceReporting: true,
      realTimeMonitoring: true
    }
  });
});

// API documentation (basic Swagger setup)
app.get('/api/performance/docs', (req, res) => {
  res.json({
    title: 'Redis Performance Enhancement API',
    version: '1.0.0',
    description: 'Comprehensive performance monitoring and analysis API',
    endpoints: {
      'GET /health': 'Health check endpoint',
      'GET /api/performance/health': 'Performance system health check',
      'GET /api/performance/agents/:agentId/history': 'Get agent performance history',
      'GET /api/performance/agents/:agentId/aggregates': 'Get agent performance aggregates',
      'GET /api/performance/agents/:agentId/patterns': 'Analyze agent performance patterns',
      'GET /api/performance/agents/:agentId/report': 'Generate performance report',
      'GET /api/performance/trends': 'Get system-wide performance trends',
      'GET /api/performance/system/stats': 'Get system performance statistics',
      'POST /api/performance/agents/:agentId/metrics': 'Record agent metrics',
      'POST /api/performance/tasks/:taskId/metrics': 'Record task metrics',
      'GET /api/performance/alerts': 'Get recent performance alerts',
      'GET /api/performance/anomalies': 'Get detected anomalies',
      'GET /api/performance/collaboration/:agentId': 'Get collaboration patterns',
      'GET /api/performance/dashboard': 'Get dashboard data',
      'POST /api/performance/cleanup': 'Trigger data cleanup',
      'GET /api/performance/export/:agentId': 'Export performance data'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    availableEndpoints: [
      '/health',
      '/api/performance',
      '/api/performance/docs'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    error: isDevelopment ? error.message : 'Internal Server Error',
    ...(isDevelopment && { stack: error.stack }),
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Close performance tracking
    await performanceTracker.shutdown();
    
    // Close server
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    
    // Force close after 30 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
    
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, async () => {
  logger.info(`Redis Performance Enhancement server started on ${HOST}:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check available at: http://${HOST}:${PORT}/health`);
  logger.info(`API documentation available at: http://${HOST}:${PORT}/api/performance/docs`);
  
  try {
    // Initialize performance tracking system
    await performanceTracker.initialize();
    logger.info('Performance tracking system initialized successfully');
    
    // Log system information
    const systemStats = await performanceTracker.getSystemStats();
    if (systemStats) {
      logger.info('System performance stats:', systemStats);
    }
    
  } catch (error) {
    logger.error('Failed to initialize performance tracking system:', error);
    // Don't exit the server, but log the error
  }
});

// Export for testing
module.exports = app;