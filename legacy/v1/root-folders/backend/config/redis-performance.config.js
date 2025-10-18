/**
 * Redis Performance Configuration
 * 
 * Configuration settings for Redis-based performance tracking,
 * monitoring, and analytics system.
 */

module.exports = {
  // Redis connection configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: process.env.REDIS_DB || 0,
    
    // Connection pool settings
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxLoadingTimeout: 5000,
    
    // Connection timeout settings
    connectTimeout: 10000,
    commandTimeout: 5000,
    
    // Reconnection settings
    lazyConnect: true,
    keepAlive: 30000,
    
    // Sentinel configuration (if using Redis Sentinel)
    sentinels: process.env.REDIS_SENTINELS ? 
      process.env.REDIS_SENTINELS.split(',').map(addr => {
        const [host, port] = addr.split(':');
        return { host, port: parseInt(port) };
      }) : null,
    sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD || null,
    name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
    
    // Cluster configuration (if using Redis Cluster)
    cluster: process.env.REDIS_CLUSTER_NODES ? {
      nodes: process.env.REDIS_CLUSTER_NODES.split(',').map(addr => {
        const [host, port] = addr.split(':');
        return { host, port: parseInt(port) };
      }),
      options: {
        redisOptions: {
          password: process.env.REDIS_PASSWORD
        },
        maxRedirections: 16,
        retryDelayOnFailover: 100,
        enableOfflineQueue: false
      }
    } : null
  },
  
  // Performance tracking configuration
  performance: {
    // Data retention settings
    retentionDays: parseInt(process.env.PERFORMANCE_RETENTION_DAYS) || 30,
    
    // Aggregation intervals
    aggregationIntervals: ['1h', '1d', '1w'],
    
    // Alert thresholds
    alertThresholds: {
      responseTime: parseInt(process.env.ALERT_RESPONSE_TIME) || 1000, // ms
      errorRate: parseFloat(process.env.ALERT_ERROR_RATE) || 0.05, // 5%
      memoryUsage: parseFloat(process.env.ALERT_MEMORY_USAGE) || 0.8, // 80%
      confidence: parseFloat(process.env.ALERT_CONFIDENCE) || 0.3
    },
    
    // Batch processing settings
    batchSize: parseInt(process.env.PERFORMANCE_BATCH_SIZE) || 1000,
    batchInterval: parseInt(process.env.PERFORMANCE_BATCH_INTERVAL) || 5000, // ms
    
    // Metrics collection settings
    collectDetailedMetrics: process.env.COLLECT_DETAILED_METRICS !== 'false',
    collectCollaborationMetrics: process.env.COLLECT_COLLABORATION_METRICS !== 'false',
    collectSystemMetrics: process.env.COLLECT_SYSTEM_METRICS !== 'false'
  },
  
  // Anomaly detection configuration
  anomalyDetection: {
    enabled: process.env.ANOMALY_DETECTION_ENABLED !== 'false',
    
    // Statistical thresholds
    zScoreThreshold: parseFloat(process.env.ANOMALY_Z_SCORE_THRESHOLD) || 2.0,
    minDataPoints: parseInt(process.env.ANOMALY_MIN_DATA_POINTS) || 10,
    
    // Detection methods
    methods: {
      statistical: true,
      mlBased: process.env.ANOMALY_ML_ENABLED === 'true',
      threshold: true
    },
    
    // Alert settings
    alertCooldown: parseInt(process.env.ANOMALY_ALERT_COOLDOWN) || 300000, // 5 minutes
    maxAlertsPerHour: parseInt(process.env.ANOMALY_MAX_ALERTS_PER_HOUR) || 10
  },
  
  // Dashboard configuration
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED !== 'false',
    
    // Refresh intervals
    refreshInterval: parseInt(process.env.DASHBOARD_REFRESH_INTERVAL) || 30000, // 30 seconds
    
    // Data limits
    maxDataPoints: parseInt(process.env.DASHBOARD_MAX_DATA_POINTS) || 1000,
    maxAgents: parseInt(process.env.DASHBOARD_MAX_AGENTS) || 50,
    
    // Export settings
    exportFormats: ['json', 'csv'],
    maxExportRecords: parseInt(process.env.MAX_EXPORT_RECORDS) || 10000
  },
  
  // API configuration
  api: {
    // Rate limiting
    rateLimit: {
      windowMs: parseInt(process.env.API_RATE_WINDOW) || 900000, // 15 minutes
      max: parseInt(process.env.API_RATE_MAX) || 100
    },
    
    // CORS settings
    cors: {
      origin: process.env.API_CORS_ORIGIN || '*',
      credentials: process.env.API_CORS_CREDENTIALS === 'true'
    },
    
    // Pagination
    defaultPageSize: parseInt(process.env.API_DEFAULT_PAGE_SIZE) || 50,
    maxPageSize: parseInt(process.env.API_MAX_PAGE_SIZE) || 1000
  },
  
  // Monitoring and health checks
  monitoring: {
    enabled: process.env.MONITORING_ENABLED !== 'false',
    
    // Health check intervals
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000, // 1 minute
    
    // Metrics collection
    collectSystemMetrics: process.env.COLLECT_SYSTEM_METRICS !== 'false',
    collectRedisMetrics: process.env.COLLECT_REDIS_METRICS !== 'false',
    
    // Logging
    logLevel: process.env.PERFORMANCE_LOG_LEVEL || 'info',
    logSlowQueries: process.env.LOG_SLOW_QUERIES === 'true',
    slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD) || 1000 // ms
  },
  
  // Security configuration
  security: {
    // Authentication
    requireAuth: process.env.PERFORMANCE_AUTH_REQUIRED === 'true',
    authSecret: process.env.PERFORMANCE_AUTH_SECRET,
    
    // API key settings
    requireApiKey: process.env.PERFORMANCE_API_KEY_REQUIRED === 'true',
    apiKeys: process.env.PERFORMANCE_API_KEYS ? 
      process.env.PERFORMANCE_API_KEYS.split(',') : [],
    
    // IP whitelisting
    ipWhitelist: process.env.PERFORMANCE_IP_WHITELIST ? 
      process.env.PERFORMANCE_IP_WHITELIST.split(',') : []
  },
  
  // Development/Testing configuration
  development: {
    enabled: process.env.NODE_ENV === 'development',
    
    // Debug settings
    debugQueries: process.env.DEBUG_QUERIES === 'true',
    mockData: process.env.USE_MOCK_PERFORMANCE_DATA === 'true',
    
    // Test database
    testRedisDb: parseInt(process.env.TEST_REDIS_DB) || 15
  },
  
  // Feature flags
  features: {
    // Enable/disable specific features
    realTimeAlerts: process.env.FEATURE_REAL_TIME_ALERTS !== 'false',
    predictiveAnalytics: process.env.FEATURE_PREDICTIVE_ANALYTICS === 'true',
    collaborationTracking: process.env.FEATURE_COLLABORATION_TRACKING !== 'false',
    performanceScoring: process.env.FEATURE_PERFORMANCE_SCORING !== 'false',
    automatedReports: process.env.FEATURE_AUTOMATED_REPORTS === 'true',
    
    // Experimental features
    mlAnomalyDetection: process.env.FEATURE_ML_ANOMALY_DETECTION === 'true',
    performanceForecasting: process.env.FEATURE_PERFORMANCE_FORECASTING === 'true'
  },
  
  // Integration settings
  integrations: {
    // External monitoring services
    prometheus: {
      enabled: process.env.PROMETHEUS_ENABLED === 'true',
      port: parseInt(process.env.PROMETHEUS_PORT) || 9090,
      endpoint: process.env.PROMETHEUS_ENDPOINT || '/metrics'
    },
    
    // Logging services
    elk: {
      enabled: process.env.ELK_ENABLED === 'true',
      host: process.env.ELK_HOST || 'localhost',
      port: parseInt(process.env.ELK_PORT) || 9200,
      index: process.env.ELK_INDEX || 'performance-metrics'
    },
    
    // Notification services
    slack: {
      enabled: process.env.SLACK_ENABLED === 'true',
      webhook: process.env.SLACK_WEBHOOK_URL,
      channel: process.env.SLACK_CHANNEL || '#performance-alerts'
    },
    
    // Email notifications
    email: {
      enabled: process.env.EMAIL_ENABLED === 'true',
      smtp: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      },
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO ? process.env.EMAIL_TO.split(',') : []
    }
  },
  
  // Performance optimization settings
  optimization: {
    // Caching
    enableCaching: process.env.ENABLE_PERFORMANCE_CACHE !== 'false',
    cacheTTL: parseInt(process.env.PERFORMANCE_CACHE_TTL) || 300, // 5 minutes
    
    // Connection pooling
    connectionPoolSize: parseInt(process.env.REDIS_POOL_SIZE) || 10,
    
    // Data compression
    compressData: process.env.COMPRESS_PERFORMANCE_DATA === 'true',
    compressionThreshold: parseInt(process.env.COMPRESSION_THRESHOLD) || 1024 // bytes
  }
};

// Environment-specific overrides
const environment = process.env.NODE_ENV || 'development';

if (environment === 'production') {
  // Production-specific settings
  module.exports.redis.maxRetriesPerRequest = 5;
  module.exports.redis.connectTimeout = 15000;
  module.exports.performance.retentionDays = 90;
  module.exports.monitoring.collectSystemMetrics = true;
  module.exports.security.requireAuth = true;
} else if (environment === 'test') {
  // Test-specific settings
  module.exports.redis.db = 15;
  module.exports.performance.retentionDays = 1;
  module.exports.anomalyDetection.enabled = false;
  module.exports.development.mockData = true;
  module.exports.features.realTimeAlerts = false;
}

// Validate critical configuration
function validateConfig() {
  const errors = [];
  
  // Check Redis configuration
  if (!module.exports.redis.host) {
    errors.push('Redis host is required');
  }
  
  if (!module.exports.redis.port) {
    errors.push('Redis port is required');
  }
  
  // Check security configuration for production
  if (environment === 'production') {
    if (!module.exports.security.requireAuth) {
      console.warn('Warning: Authentication should be required in production');
    }
    
    if (!module.exports.security.apiKeys.length && module.exports.security.requireApiKey) {
      errors.push('API keys are required when API key authentication is enabled');
    }
  }
  
  // Check integration configurations
  if (module.exports.integrations.email.enabled) {
    if (!module.exports.integrations.email.smtp.host) {
      errors.push('SMTP host is required when email integration is enabled');
    }
    
    if (!module.exports.integrations.email.from) {
      errors.push('Email from address is required when email integration is enabled');
    }
  }
  
  if (module.exports.integrations.slack.enabled && !module.exports.integrations.slack.webhook) {
    errors.push('Slack webhook URL is required when Slack integration is enabled');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Validate configuration on load
try {
  validateConfig();
} catch (error) {
  console.error('Configuration validation error:', error.message);
  if (environment === 'production') {
    process.exit(1);
  }
}

module.exports.validateConfig = validateConfig;