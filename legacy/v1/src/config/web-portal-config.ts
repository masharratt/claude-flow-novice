/**
 * Claude Flow Personal Web Portal Configuration
 * Comprehensive configuration management for web portal startup
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

export interface ServerConfig {
  host: string;
  port: number;
  environment: 'development' | 'production' | 'test';
  cluster: boolean;
  workers?: number;
}

export interface MCPConfig {
  claudeFlow: {
    enabled: boolean;
    command: string;
    args: string[];
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
  };
  ruvSwarm: {
    enabled: boolean;
    command: string;
    args: string[];
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
  };
}

export interface WebSocketConfig {
  enabled: boolean;
  path: string;
  updateInterval: number;
  maxConnections: number;
  pingTimeout: number;
  pingInterval: number;
}

export interface DatabaseConfig {
  type: 'sqlite' | 'postgresql' | 'mysql';
  connection: {
    filename?: string; // For SQLite
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
  };
  pool?: {
    min: number;
    max: number;
    acquireTimeoutMillis: number;
    idleTimeoutMillis: number;
  };
  migrations?: {
    directory: string;
    tableName: string;
  };
}

export interface SecurityConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    issuer: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
  };
  encryption: {
    algorithm: string;
    keyLength: number;
  };
  session: {
    secret: string;
    maxAge: number;
    secure: boolean;
    httpOnly: boolean;
  };
}

export interface FrontendConfig {
  enabled: boolean;
  buildPath: string;
  staticPath: string;
  indexFile: string;
  devServer?: {
    port: number;
    proxy: boolean;
  };
}

export interface CorsConfig {
  enabled: boolean;
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

export interface WebPortalLoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'text';
  outputs: Array<'console' | 'file' | 'syslog'>;
  files?: {
    error: string;
    combined: string;
    maxSize: string;
    maxFiles: number;
  };
}

export interface MonitoringConfig {
  metrics: {
    enabled: boolean;
    interval: number;
    retention: number;
  };
  health: {
    enabled: boolean;
    endpoint: string;
    checks: string[];
  };
  profiling: {
    enabled: boolean;
    interval: number;
  };
}

export interface WebPortalConfig {
  server: ServerConfig;
  mcp: MCPConfig;
  websocket: WebSocketConfig;
  database: DatabaseConfig;
  security: SecurityConfig;
  frontend: FrontendConfig;
  cors: CorsConfig;
  logging: WebPortalLoggingConfig;
  monitoring: MonitoringConfig;
}

// Default configuration
const defaultConfig: WebPortalConfig = {
  server: {
    host: process.env.WEB_PORTAL_HOST || 'localhost',
    port: parseInt(process.env.WEB_PORTAL_PORT || '3000'),
    environment: (process.env.NODE_ENV as any) || 'development',
    cluster: process.env.WEB_PORTAL_CLUSTER === 'true',
    workers: parseInt(process.env.WEB_PORTAL_WORKERS || String(os.cpus().length)),
  },

  mcp: {
    claudeFlow: {
      enabled: process.env.CLAUDE_FLOW_ENABLED !== 'false',
      command: 'npx',
      args: ['claude-flow@alpha'],
      timeout: parseInt(process.env.CLAUDE_FLOW_TIMEOUT || '30000'),
      retryAttempts: parseInt(process.env.CLAUDE_FLOW_RETRY_ATTEMPTS || '3'),
      retryDelay: parseInt(process.env.CLAUDE_FLOW_RETRY_DELAY || '1000'),
    },
    ruvSwarm: {
      enabled: process.env.RUV_SWARM_ENABLED !== 'false',
      command: 'npx',
      args: ['ruv-swarm'],
      timeout: parseInt(process.env.RUV_SWARM_TIMEOUT || '30000'),
      retryAttempts: parseInt(process.env.RUV_SWARM_RETRY_ATTEMPTS || '3'),
      retryDelay: parseInt(process.env.RUV_SWARM_RETRY_DELAY || '1000'),
    },
  },

  websocket: {
    enabled: process.env.WEBSOCKET_ENABLED !== 'false',
    path: process.env.WEBSOCKET_PATH || '/socket.io',
    updateInterval: parseInt(process.env.WEBSOCKET_UPDATE_INTERVAL || '5000'),
    maxConnections: parseInt(process.env.WEBSOCKET_MAX_CONNECTIONS || '100'),
    pingTimeout: parseInt(process.env.WEBSOCKET_PING_TIMEOUT || '60000'),
    pingInterval: parseInt(process.env.WEBSOCKET_PING_INTERVAL || '25000'),
  },

  database: {
    type: (process.env.DB_TYPE as any) || 'sqlite',
    connection: {
      filename: process.env.DB_FILENAME || path.join(process.cwd(), '.swarm', 'portal.db'),
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '30000'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    },
    migrations: {
      directory: process.env.DB_MIGRATIONS_DIR || path.join(process.cwd(), 'migrations'),
      tableName: process.env.DB_MIGRATIONS_TABLE || 'migrations',
    },
  },

  security: {
    jwt: {
      secret: process.env.JWT_SECRET || generateSecretKey(),
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: process.env.JWT_ISSUER || 'claude-flow-portal',
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
    },
    encryption: {
      algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
      keyLength: parseInt(process.env.ENCRYPTION_KEY_LENGTH || '32'),
    },
    session: {
      secret: process.env.SESSION_SECRET || generateSecretKey(),
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000'), // 24 hours
      secure: process.env.SESSION_SECURE === 'true',
      httpOnly: process.env.SESSION_HTTP_ONLY !== 'false',
    },
  },

  frontend: {
    enabled: process.env.FRONTEND_ENABLED !== 'false',
    buildPath:
      process.env.FRONTEND_BUILD_PATH || path.join(process.cwd(), 'src/web/frontend/build'),
    staticPath:
      process.env.FRONTEND_STATIC_PATH || path.join(process.cwd(), 'src/web/frontend/build'),
    indexFile: process.env.FRONTEND_INDEX_FILE || 'index.html',
    devServer: {
      port: parseInt(process.env.FRONTEND_DEV_PORT || '3001'),
      proxy: process.env.FRONTEND_DEV_PROXY === 'true',
    },
  },

  cors: {
    enabled: process.env.CORS_ENABLED !== 'false',
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:3001'],
    allowedMethods: process.env.CORS_ALLOWED_METHODS
      ? process.env.CORS_ALLOWED_METHODS.split(',')
      : ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: process.env.CORS_ALLOWED_HEADERS
      ? process.env.CORS_ALLOWED_HEADERS.split(',')
      : ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
    maxAge: parseInt(process.env.CORS_MAX_AGE || '86400'),
  },

  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    format: (process.env.LOG_FORMAT as any) || 'json',
    outputs: process.env.LOG_OUTPUTS ? (process.env.LOG_OUTPUTS.split(',') as any) : ['console'],
    files: {
      error: process.env.LOG_ERROR_FILE || path.join(process.cwd(), 'logs', 'error.log'),
      combined: process.env.LOG_COMBINED_FILE || path.join(process.cwd(), 'logs', 'combined.log'),
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '14'),
    },
  },

  monitoring: {
    metrics: {
      enabled: process.env.METRICS_ENABLED !== 'false',
      interval: parseInt(process.env.METRICS_INTERVAL || '30000'),
      retention: parseInt(process.env.METRICS_RETENTION || '86400000'), // 24 hours
    },
    health: {
      enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
      endpoint: process.env.HEALTH_CHECK_ENDPOINT || '/health',
      checks: process.env.HEALTH_CHECKS
        ? process.env.HEALTH_CHECKS.split(',')
        : ['database', 'mcp', 'memory', 'disk'],
    },
    profiling: {
      enabled: process.env.PROFILING_ENABLED === 'true',
      interval: parseInt(process.env.PROFILING_INTERVAL || '60000'),
    },
  },
};

// Configuration loading functions
export function loadConfig(configPath?: string): WebPortalConfig {
  const config = { ...defaultConfig };

  // Load from config file if specified
  if (configPath && fs.existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      mergeDeep(config, fileConfig);
    } catch (error) {
      console.error(`Failed to load config from ${configPath}:`, error);
    }
  }

  // Load from package-specific config file
  const packageConfigPath = path.join(process.cwd(), 'web-portal.config.json');
  if (fs.existsSync(packageConfigPath)) {
    try {
      const packageConfig = JSON.parse(fs.readFileSync(packageConfigPath, 'utf8'));
      mergeDeep(config, packageConfig);
    } catch (error) {
      console.error(`Failed to load package config:`, error);
    }
  }

  // Validate configuration
  validateConfig(config);

  return config;
}

export function saveConfig(config: WebPortalConfig, configPath: string): void {
  try {
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(`Failed to save config to ${configPath}: ${error}`);
  }
}

export function validateConfig(config: WebPortalConfig): void {
  // Server validation
  if (!config.server.host || !config.server.port) {
    throw new Error('Server host and port must be specified');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('Server port must be between 1 and 65535');
  }

  // Security validation
  if (config.server.environment === 'production') {
    if (
      config.security.jwt.secret === generateSecretKey() ||
      config.security.jwt.secret.length < 32
    ) {
      throw new Error('JWT secret must be at least 32 characters in production');
    }

    if (!config.security.session.secure) {
      console.warn('Warning: Session cookies should be secure in production');
    }
  }

  // Database validation
  if (config.database.type === 'sqlite' && !config.database.connection.filename) {
    throw new Error('SQLite database filename must be specified');
  }

  if (
    ['postgresql', 'mysql'].includes(config.database.type) &&
    (!config.database.connection.host || !config.database.connection.database)
  ) {
    throw new Error('Database host and database name must be specified for PostgreSQL/MySQL');
  }

  // Frontend validation
  if (config.frontend.enabled && !fs.existsSync(config.frontend.staticPath)) {
    console.warn(`Warning: Frontend static path does not exist: ${config.frontend.staticPath}`);
  }
}

export function getEnvironmentConfig(): Partial<WebPortalConfig> {
  const envConfig: any = {};

  // Parse environment variables into config structure
  Object.keys(process.env).forEach((key) => {
    if (key.startsWith('WEB_PORTAL_')) {
      const configKey = key.replace('WEB_PORTAL_', '').toLowerCase();
      const value = process.env[key];

      // Convert string values to appropriate types
      let parsedValue: any = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (/^\d+$/.test(value)) parsedValue = parseInt(value);
      else if (/^\d+\.\d+$/.test(value)) parsedValue = parseFloat(value);

      setNestedValue(envConfig, configKey, parsedValue);
    }
  });

  return envConfig;
}

// Utility functions
function generateSecretKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

function mergeDeep(target: any, source: any): void {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('_');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }

  current[keys[keys.length - 1]] = value;
}

// Export configuration presets
export const developmentConfig: Partial<WebPortalConfig> = {
  server: {
    environment: 'development',
    cluster: false,
  },
  logging: {
    level: 'debug',
    outputs: ['console'],
  },
  security: {
    session: {
      secure: false,
    },
  },
};

export const productionConfig: Partial<WebPortalConfig> = {
  server: {
    environment: 'production',
    cluster: true,
  },
  logging: {
    level: 'warn',
    outputs: ['file'],
  },
  security: {
    session: {
      secure: true,
    },
  },
  cors: {
    allowedOrigins: [], // Must be explicitly configured
  },
};

export const testConfig: Partial<WebPortalConfig> = {
  server: {
    environment: 'test',
    port: 0, // Use random port
  },
  database: {
    connection: {
      filename: ':memory:', // In-memory SQLite for tests
    },
  },
  logging: {
    level: 'error',
    outputs: ['console'],
  },
};

export default {
  loadConfig,
  saveConfig,
  validateConfig,
  getEnvironmentConfig,
  developmentConfig,
  productionConfig,
  testConfig,
};
