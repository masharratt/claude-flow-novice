/**
 * API Server Configuration
 *
 * Configuration settings for the transparency API server
 * including security, CORS, rate limiting, and other options.
 *
 * @module web/api/config/api-config
 */

import type { CorsOptions } from 'cors';

/**
 * Base API Configuration
 */
export interface ApiConfig {
  /** Server port */
  port: number;

  /** Server host */
  host: string;

  /** Environment (development, production, test) */
  environment: 'development' | 'production' | 'test';

  /** CORS origins */
  corsOrigins: string[];

  /** Rate limiting window in milliseconds */
  rateLimitWindowMs: number;

  /** Maximum requests per window */
  rateLimitMax: number;

  /** Session secret */
  sessionSecret: string;

  /** JWT secret */
  jwtSecret: string;

  /** JWT expiration time */
  jwtExpiration: string;

  /** API key for authentication */
  apiKey: string;

  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  /** Cache TTL in milliseconds */
  cacheTtl: number;

  /** Enable request compression */
  enableCompression: boolean;

  /** Enable HTTPS */
  enableHttps: boolean;

  /** SSL certificate path (if HTTPS enabled) */
  sslCertPath?: string;

  /** SSL key path (if HTTPS enabled) */
  sslKeyPath?: string;

  /** Enable API metrics */
  enableMetrics: boolean;

  /** Metrics collection interval in milliseconds */
  metricsIntervalMs: number;

  /** Maximum request body size */
  maxRequestBodySize: string;

  /** Request timeout in milliseconds */
  requestTimeoutMs: number;

  /** WebSocket ping timeout in milliseconds */
  websocketPingTimeoutMs: number;

  /** WebSocket ping interval in milliseconds */
  websocketPingIntervalMs: number;

  /** Maximum WebSocket connections */
  maxWebSocketConnections: number;

  /** Enable request logging */
  enableRequestLogging: boolean;

  /** Enable detailed error responses */
  enableDetailedErrors: boolean;

  /** API version */
  apiVersion: string;

  /** Server name for headers */
  serverName: string;
}

/**
 * Create default API configuration
 */
export function createApiConfig(): ApiConfig {
  const env = process.env.NODE_ENV || 'development';

  return {
    port: parseInt(process.env.API_PORT || '3001', 10),
    host: process.env.API_HOST || 'localhost',
    environment: env as 'development' | 'production' | 'test',

    // CORS configuration
    corsOrigins: env === 'production'
      ? (process.env.CORS_ORIGINS?.split(',') || ['https://localhost:3000'])
      : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],

    // Rate limiting
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),

    // Security
    sessionSecret: process.env.SESSION_SECRET || 'change-me-in-production',
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
    jwtExpiration: process.env.JWT_EXPIRATION || '24h',
    apiKey: process.env.API_KEY || 'change-me-in-production',

    // Logging
    logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',

    // Performance
    cacheTtl: parseInt(process.env.CACHE_TTL || '5000', 10), // 5 seconds
    enableCompression: process.env.ENABLE_COMPRESSION !== 'false',

    // HTTPS
    enableHttps: process.env.ENABLE_HTTPS === 'true',
    sslCertPath: process.env.SSL_CERT_PATH,
    sslKeyPath: process.env.SSL_KEY_PATH,

    // Metrics
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
    metricsIntervalMs: parseInt(process.env.METRICS_INTERVAL_MS || '60000', 10), // 1 minute

    // Request handling
    maxRequestBodySize: process.env.MAX_REQUEST_BODY_SIZE || '10mb',
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10), // 30 seconds

    // WebSocket
    websocketPingTimeoutMs: parseInt(process.env.WS_PING_TIMEOUT_MS || '60000', 10), // 1 minute
    websocketPingIntervalMs: parseInt(process.env.WS_PING_INTERVAL_MS || '25000', 10), // 25 seconds
    maxWebSocketConnections: parseInt(process.env.MAX_WS_CONNECTIONS || '100', 10),

    // Features
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',
    enableDetailedErrors: env === 'development',

    // API info
    apiVersion: process.env.API_VERSION || '1.0.0',
    serverName: process.env.SERVER_NAME || 'Transparency API Server',
  };
}

/**
 * Validate API configuration
 */
export function validateApiConfig(config: ApiConfig): string[] {
  const errors: string[] = [];

  if (config.port < 1 || config.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  if (config.rateLimitWindowMs < 1000) {
    errors.push('Rate limit window must be at least 1000ms');
  }

  if (config.rateLimitMax < 1) {
    errors.push('Rate limit max must be at least 1');
  }

  if (config.cacheTtl < 0) {
    errors.push('Cache TTL cannot be negative');
  }

  if (config.requestTimeoutMs < 1000) {
    errors.push('Request timeout must be at least 1000ms');
  }

  if (config.websocketPingTimeoutMs < 5000) {
    errors.push('WebSocket ping timeout must be at least 5000ms');
  }

  if (config.websocketPingIntervalMs < 1000) {
    errors.push('WebSocket ping interval must be at least 1000ms');
  }

  if (config.maxWebSocketConnections < 1) {
    errors.push('Max WebSocket connections must be at least 1');
  }

  if (config.enableHttps && (!config.sslCertPath || !config.sslKeyPath)) {
    errors.push('SSL certificate and key paths are required when HTTPS is enabled');
  }

  // In production, check for proper security settings
  if (config.environment === 'production') {
    const insecureDefaults = [
      config.sessionSecret === 'change-me-in-production',
      config.jwtSecret === 'change-me-in-production',
      config.apiKey === 'change-me-in-production'
    ];

    if (insecureDefaults.some(Boolean)) {
      errors.push('Production environment requires secure secrets and API keys');
    }

    if (config.corsOrigins.includes('*') || config.corsOrigins.includes('http://localhost:*')) {
      errors.push('Production environment should not use wildcard or localhost CORS origins');
    }

    if (config.enableDetailedErrors) {
      errors.push('Detailed errors should be disabled in production');
    }
  }

  return errors;
}

/**
 * Create CORS options from configuration
 */
export function createCorsOptions(config: ApiConfig): CorsOptions {
  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (config.corsOrigins.includes('*') ||
          config.corsOrigins.includes(origin) ||
          config.corsOrigins.some(allowed => {
            // Support wildcard patterns like http://localhost:*
            if (allowed.includes('*')) {
              const pattern = allowed.replace('*', '.*');
              const regex = new RegExp(`^${pattern}$`);
              return regex.test(origin);
            }
            return false;
          })) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  };
}

/**
 * Get environment-specific configuration overrides
 */
export function getEnvironmentOverrides(env: string): Partial<ApiConfig> {
  switch (env) {
    case 'production':
      return {
        logLevel: 'warn',
        enableDetailedErrors: false,
        enableRequestLogging: false,
        cacheTtl: 30000, // 30 seconds
        rateLimitMax: 1000,
        requestTimeoutMs: 60000, // 1 minute
      };

    case 'test':
      return {
        port: 0, // Random port for testing
        host: '127.0.0.1',
        logLevel: 'error',
        enableRequestLogging: false,
        enableMetrics: false,
        cacheTtl: 100,
        rateLimitMax: 1000,
        maxWebSocketConnections: 10,
      };

    case 'development':
    default:
      return {
        logLevel: 'debug',
        enableDetailedErrors: true,
        enableRequestLogging: true,
        enableMetrics: true,
        cacheTtl: 5000, // 5 seconds
        rateLimitMax: 1000,
      };
  }
}