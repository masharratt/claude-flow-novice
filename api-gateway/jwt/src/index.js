const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const config = require('./config');
const logger = require('./logger');
const { createRedisClient } = require('./redis-client');
const { 
  generateTokens, 
  verifyToken, 
  refreshAccessToken, 
  revokeToken,
  validateToken 
} = require('./middleware/auth');
const { authenticateRequest } = require('./middleware/token-management');

const app = express();
const PORT = config.port;

// Initialize Redis client
let redisClient;
let isRedisConnected = false;

async function initializeRedis() {
  try {
    redisClient = await createRedisClient();
    isRedisConnected = true;
    logger.info('Redis client connected successfully');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    logger.warn('Continuing without Redis - some features may be limited');
  }
}

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
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://app.example.com',
      'https://dashboard.example.com',
      'https://admin.example.com',
      'http://localhost:3000',
      'http://localhost:3001'
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress;
  }
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    memory: process.memoryUsage(),
    redis: isRedisConnected ? 'connected' : 'disconnected'
  };
  
  res.status(200).json(health);
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tokens', require('./routes/tokens'));
app.use('/api/users', require('./routes/users'));

// Authentication validation endpoint (for gateway)
app.post('/validate', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        valid: false,
        error: 'No token provided'
      });
    }
    
    const result = await validateToken(token, redisClient);
    
    if (result.valid) {
      res.json({
        valid: true,
        user: result.user,
        expires: result.expires
      });
    } else {
      res.status(401).json({
        valid: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Token validation error:', error);
    res.status(500).json({
      valid: false,
      error: 'Internal server error'
    });
  }
});

// Metrics endpoint for monitoring
app.get('/metrics', (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    requests: {
      total: req.app.locals.requestCount || 0,
      errors: req.app.locals.errorCount || 0
    },
    redis: {
      connected: isRedisConnected,
      status: redisClient?.status || 'disconnected'
    }
  };
  
  res.json(metrics);
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    requestId: req.requestId,
    url: req.url,
    method: req.method
  });
  
  req.app.locals.errorCount = (req.app.locals.errorCount || 0) + 1;
  
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    requestId: req.requestId
  });
});

// Request counter middleware
app.use((req, res, next) => {
  req.app.locals.requestCount = (req.app.locals.requestCount || 0) + 1;
  next();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  if (redisClient) {
    redisClient.quit();
  }
  
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  if (redisClient) {
    redisClient.quit();
  }
  
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    await initializeRedis();
    
    const server = app.listen(PORT, () => {
      logger.info(`JWT Authentication Service started on port ${PORT}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Redis Status: ${isRedisConnected ? 'Connected' : 'Disconnected'}`);
    });
    
    // Set server timeout
    server.timeout = 30000; // 30 seconds
    
    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };