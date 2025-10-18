/**
 * Development Server Configuration
 * Relaxed CSP policies and enhanced debugging capabilities
 */

export const developmentConfig = {
  // Server settings
  server: {
    port: process.env.DEV_PORT || 3001,
    host: process.env.DEV_HOST || 'localhost',
    cors: {
      origin: "*", // Allow all origins in development
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization", "X-Dev-Mode"],
      credentials: true
    },
    timeout: 30000 // Longer timeout for debugging
  },

  // Relaxed CSP policies for development
  csp: {
    development: {
      directives: {
        "default-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "data:", "blob:"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "data:", "blob:", "http://localhost:*", "ws://localhost:*", "wss://localhost:*"],
        "style-src": ["'self'", "'unsafe-inline'", "data:", "blob:"],
        "img-src": ["'self'", "data:", "blob:", "http://localhost:*", "https://*"],
        "connect-src": ["'self'", "data:", "blob:", "http://localhost:*", "https://*", "ws://localhost:*", "wss://localhost:*"],
        "font-src": ["'self'", "data:", "blob:", "http://localhost:*"],
        "object-src": ["'none'"],
        "media-src": ["'self'", "data:", "blob:", "http://localhost:*"],
        "frame-src": ["'self'", "data:", "blob:"],
        "worker-src": ["'self'", "blob:", "data:"]
      },
      reportOnly: false // Enforce in development
    }
  },

  // Enhanced logging configuration
  logging: {
    level: "debug",
    format: "dev",
    colorize: true,
    timestamp: true,
    showRequestId: true,
    logRequestBody: true,
    logResponseBody: false,
    excludeRoutes: ["/health", "/favicon.ico"],
    customLogger: {
      websocket: true,
      metrics: true,
      performance: true,
      errors: true,
      security: true
    }
  },

  // WebSocket debugging configuration
  websocket: {
    debug: true,
    logLevel: "debug",
    enablePing: true,
    pingInterval: 10000,
    pingTimeout: 5000,
    perMessageDeflate: false, // Disable for easier debugging
    maxHttpBufferSize: 1e8, // 100 MB for testing large payloads
    transports: ["websocket", "polling"],
    allowEIO3: true,
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    // Enhanced debugging options
    debugFlags: [
      "socket.io:socket",
      "socket.io:client",
      "socket.io:parser",
      "socket.io:engine"
    ]
  },

  // Performance monitoring (enhanced for development)
  performance: {
    enabled: true,
    interval: 1000, // 1 second updates
    historySize: 3600, // 1 hour of history
    thresholds: {
      responseTime: 500, // ms
      memoryUsage: 80, // %
      cpuUsage: 85, // %
      errorRate: 5 // %
    },
    alerts: {
      enabled: true,
      threshold: 0.8,
      cooldown: 5000
    }
  },

  // Security settings (relaxed for development)
  security: {
    helmet: {
      contentSecurityPolicy: false, // Use custom CSP above
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10000, // Very high limit for development
      message: "Too many requests from this IP in development",
      standardHeaders: true,
      legacyHeaders: false
    },
    auth: {
      enabled: true, // Keep auth for testing
      bypassToken: process.env.DEV_BYPASS_TOKEN || "dev-bypass-2025",
      sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours
    }
  },

  // Database configuration (development)
  database: {
    type: "sqlite",
    database: ":memory:", // In-memory for development
    logging: true,
    synchronize: true,
    dropSchema: true, // Reset on each start
    entities: ["src/**/*.entity.ts"],
    migrations: ["src/migrations/*.ts"],
    seeds: ["src/seeds/*.ts"]
  },

  // Redis configuration (development)
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    db: process.env.REDIS_DB || 1, // Separate DB for development
    password: process.env.REDIS_PASSWORD || null,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 5000,
    debug: true
  },

  // File serving configuration
  static: {
    root: "public",
    maxAge: 0, // No caching in development
    etag: true,
    lastModified: true,
    setHeaders: (res, path, stat) => {
      // Add debugging headers
      res.set("X-Dev-Mode", "true");
      res.set("X-Debug-Timestamp", new Date().toISOString());
      res.set("X-Server-Info", "development");
    }
  },

  // API configuration
  api: {
    version: "v1",
    prefix: "/api",
    documentation: {
      enabled: true,
      path: "/api/docs",
      exposeSpec: true,
      specPath: "/api/spec.json"
    },
    validation: {
      strict: false, // More lenient validation in development
      stripUnknown: false,
      abortEarly: false
    },
    pagination: {
      default: 20,
      max: 1000
    },
    timeout: 30000
  },

  // Error handling configuration
  errorHandling: {
    showStack: true,
    logErrors: true,
    sendErrorReports: false, // Don't send to external services in dev
    fallbackMessage: "Development error occurred",
    includeRequestDetails: true,
    includeUserDetails: false
  },

  // Development tools configuration
  devTools: {
    enabled: true,
    hotReload: true,
    livereload: {
      enabled: true,
      port: 35729,
      exclusions: ["node_modules/**", ".git/**", "*.log"]
    },
    proxy: {
      enabled: true,
      targets: [
        {
          source: "/api/*",
          target: "http://localhost:3001",
          changeOrigin: true
        }
      ]
    },
    mockData: {
      enabled: true,
      directory: "mocks",
      autoLoad: true
    }
  },

  // Monitoring and metrics
  monitoring: {
    enabled: true,
    metrics: {
      enabled: true,
      interval: 1000,
      collectDefaultMetrics: true,
      prefix: "claude_flow_dev_"
    },
    healthCheck: {
      enabled: true,
      path: "/health",
      detailed: true,
      includeDependencies: true
    },
    profiling: {
      enabled: true,
      sampleRate: 1.0, // 100% sampling in development
      maxSamples: 1000
    }
  },

  // Testing configuration
  testing: {
    enabled: true,
    endpoints: {
      reset: "/api/test/reset",
      seed: "/api/test/seed",
      mock: "/api/test/mock",
      fixtures: "/api/test/fixtures"
    },
    database: {
      reset: true,
      seed: true,
      migrations: true
    },
    mockData: {
      enabled: true,
      directory: "test/fixtures",
      autoLoad: true
    }
  }
};

// Production configuration for comparison
export const productionConfig = {
  ...developmentConfig,
  server: {
    ...developmentConfig.server,
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(",") || ["https://yourdomain.com"],
      methods: ["GET", "POST"],
      allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
      credentials: true
    }
  },
  csp: {
    production: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "https:"],
        "font-src": ["'self'", "data:"],
        "object-src": ["'none'"],
        "media-src": ["'self'"],
        "frame-src": ["'none'"],
        "worker-src": ["'self'"]
      },
      reportOnly: false
    }
  },
  security: {
    ...developmentConfig.security,
    helmet: {
      contentSecurityPolicy: true,
      crossOriginEmbedderPolicy: true,
      crossOriginResourcePolicy: true,
      crossOriginOpenerPolicy: true
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: "Too many requests",
      standardHeaders: true,
      legacyHeaders: false
    }
  },
  logging: {
    level: "info",
    format: "json",
    colorize: false,
    timestamp: true,
    showRequestId: true,
    logRequestBody: false,
    logResponseBody: false,
    excludeRoutes: ["/health", "/metrics", "/favicon.ico"]
  },
  websocket: {
    ...developmentConfig.websocket,
    debug: false,
    logLevel: "error",
    perMessageDeflate: true
  },
  devTools: {
    enabled: false,
    hotReload: false,
    livereload: { enabled: false },
    proxy: { enabled: false },
    mockData: { enabled: false }
  }
};

// Environment detection
export const isDevelopment = process.env.NODE_ENV === "development" || process.env.DEV_MODE === "true";
export const isProduction = process.env.NODE_ENV === "production";
export const isTest = process.env.NODE_ENV === "test";

// Get appropriate configuration
export const getConfig = () => {
  if (isDevelopment) return developmentConfig;
  if (isProduction) return productionConfig;
  return developmentConfig; // Default to development
};

// Configuration validation
export const validateConfig = (config) => {
  const errors = [];

  if (!config.server.port) {
    errors.push("Server port is required");
  }

  if (!config.database.type) {
    errors.push("Database type is required");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors.join(", ")}`);
  }

  return true;
};

export default {
  developmentConfig,
  productionConfig,
  isDevelopment,
  isProduction,
  isTest,
  getConfig,
  validateConfig
};