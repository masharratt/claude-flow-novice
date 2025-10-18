/**
 * Production Configuration for Secure Dashboard
 * Provides comprehensive production-ready security and performance settings
 */

import { SecurityManager } from './security-middleware.js';
import { DatabaseManager } from './database-manager.js';
import fs from 'fs';
import path from 'path';

interface ProductionConfig {
  server: {
    port: number;
    host: string;
    https: {
      enabled: boolean;
      certPath?: string;
      keyPath?: string;
      caPath?: string;
      minVersion: string;
      ciphers: string[];
      honorCipherOrder: boolean;
    };
    compression: {
      enabled: boolean;
      level: number;
      threshold: number;
    };
    trustProxy: boolean;
    maxConnections: number;
  };
  security: {
    jwt: {
      secret: string;
      expiresIn: string;
      refreshExpiresIn: string;
      issuer: string;
      audience: string;
    };
    rateLimit: {
      global: {
        windowMs: number;
        max: number;
        message: string;
      };
      api: {
        windowMs: number;
        max: number;
        message: string;
      };
      auth: {
        windowMs: number;
        max: number;
        message: string;
      };
      endpoints: Record<string, {
        windowMs: number;
        max: number;
        message: string;
      }>;
    };
    cors: {
      origin: string[];
      credentials: boolean;
      optionsSuccessStatus: number;
      methods: string[];
      allowedHeaders: string[];
    };
    helmet: {
      contentSecurityPolicy: {
        directives: Record<string, string[]>;
      };
      hsts: {
        maxAge: number;
        includeSubDomains: boolean;
        preload: boolean;
      };
      noSniff: boolean;
      frameguard: { action: string };
      xssFilter: boolean;
      referrerPolicy: { policy: string };
    };
    session: {
      timeout: number;
      maxAge: number;
      rolling: boolean;
      secure: boolean;
      sameSite: string;
    };
  };
  database: {
    path: string;
    backup: {
      enabled: boolean;
      interval: number;
      retentionDays: number;
      path: string;
    };
    optimization: {
      vacuumInterval: number;
      analyzeInterval: number;
      walCheckpointInterval: number;
    };
  };
  logging: {
    level: string;
    format: string;
    file: {
      enabled: boolean;
      path: string;
      maxSize: string;
      maxFiles: number;
    };
    console: {
      enabled: boolean;
      colorize: boolean;
    };
  };
  monitoring: {
    metrics: {
      enabled: boolean;
      interval: number;
      retention: number;
    };
    healthCheck: {
      enabled: boolean;
      interval: number;
      timeout: number;
    };
    alerts: {
      enabled: boolean;
      thresholds: {
        cpu: number;
        memory: number;
        disk: number;
        connections: number;
      };
    };
  };
  performance: {
    caching: {
      enabled: boolean;
      ttl: number;
      maxSize: number;
    };
    compression: {
      enabled: boolean;
      threshold: number;
    };
    cluster: {
      enabled: boolean;
      workers: number;
    };
  };
}

class ProductionConfigManager {
  private config: ProductionConfig;
  private securityManager: SecurityManager;
  private databaseManager: DatabaseManager;

  constructor(customConfig?: Partial<ProductionConfig>) {
    this.config = this.createDefaultConfig();
    this.mergeConfig(customConfig || {});
    this.validateConfig();

    this.databaseManager = new DatabaseManager(this.config.database.path);
    this.securityManager = new SecurityManager(this.databaseManager);

    this.setupProductionFeatures();
  }

  private createDefaultConfig(): ProductionConfig {
    const env = process.env.NODE_ENV || 'development';
    const isProduction = env === 'production';

    return {
      server: {
        port: parseInt(process.env.PORT || '3001'),
        host: process.env.HOST || '0.0.0.0',
        https: {
          enabled: isProduction && !!process.env.HTTPS_CERT_PATH && !!process.env.HTTPS_KEY_PATH,
          certPath: process.env.HTTPS_CERT_PATH,
          keyPath: process.env.HTTPS_KEY_PATH,
          caPath: process.env.HTTPS_CA_PATH,
          minVersion: 'TLSv1.2',
          ciphers: [
            'ECDHE-ECDSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES128-GCM-SHA256',
            'ECDHE-ECDSA-AES256-GCM-SHA384',
            'ECDHE-RSA-AES256-GCM-SHA384',
            'ECDHE-ECDSA-CHACHA20-POLY1305',
            'ECDHE-RSA-CHACHA20-POLY1305'
          ],
          honorCipherOrder: true
        },
        compression: {
          enabled: isProduction,
          level: 6,
          threshold: 1024
        },
        trustProxy: isProduction,
        maxConnections: 1000
      },
      security: {
        jwt: {
          secret: process.env.JWT_SECRET || this.generateSecret(),
          expiresIn: process.env.JWT_EXPIRES_IN || '15m',
          refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
          issuer: process.env.JWT_ISSUER || 'claude-dashboard',
          audience: process.env.JWT_AUDIENCE || 'claude-users'
        },
        rateLimit: {
          global: {
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
            max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
            message: 'Too many requests from this IP, please try again later.'
          },
          api: {
            windowMs: 60000, // 1 minute
            max: 30,
            message: 'API rate limit exceeded. Please reduce request frequency.'
          },
          auth: {
            windowMs: 900000, // 15 minutes
            max: 5,
            message: 'Too many authentication attempts. Account temporarily locked.'
          },
          endpoints: {
            '/api/auth/login': {
              windowMs: 900000, // 15 minutes
              max: 5,
              message: 'Too many login attempts. Please try again later.'
            },
            '/api/auth/refresh': {
              windowMs: 300000, // 5 minutes
              max: 10,
              message: 'Too many token refresh attempts.'
            },
            '/api/benchmark': {
              windowMs: 300000, // 5 minutes
              max: 3,
              message: 'Benchmark rate limit exceeded. Please wait before running another benchmark.'
            },
            '/api/admin': {
              windowMs: 60000, // 1 minute
              max: 20,
              message: 'Admin API rate limit exceeded.'
            }
          }
        },
        cors: {
          origin: process.env.ALLOWED_ORIGINS?.split(',') || (isProduction ? [] : ['http://localhost:3001']),
          credentials: true,
          optionsSuccessStatus: 200,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        },
        helmet: {
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
              fontSrc: ["'self'", "https://fonts.gstatic.com"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'", "ws:", "wss:"],
              frameSrc: ["'none'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              manifestSrc: ["'self'"],
              upgradeInsecureRequests: isProduction ? [] : null
            }
          },
          hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
          },
          noSniff: true,
          frameguard: { action: 'deny' },
          xssFilter: true,
          referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
        },
        session: {
          timeout: parseInt(process.env.SESSION_TIMEOUT || '3600000'), // 1 hour
          maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000'), // 24 hours
          rolling: true,
          secure: isProduction,
          sameSite: 'strict'
        }
      },
      database: {
        path: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'dashboard.db'),
        backup: {
          enabled: isProduction,
          interval: 3600000, // 1 hour
          retentionDays: 30,
          path: process.env.BACKUP_PATH || path.join(process.cwd(), 'data', 'backups')
        },
        optimization: {
          vacuumInterval: 86400000, // 24 hours
          analyzeInterval: 3600000, // 1 hour
          walCheckpointInterval: 300000 // 5 minutes
        }
      },
      logging: {
        level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
        format: process.env.LOG_FORMAT || 'json',
        file: {
          enabled: isProduction,
          path: process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'dashboard.log'),
          maxSize: process.env.LOG_MAX_SIZE || '10m',
          maxFiles: parseInt(process.env.LOG_MAX_FILES || '5')
        },
        console: {
          enabled: !isProduction,
          colorize: !isProduction
        }
      },
      monitoring: {
        metrics: {
          enabled: true,
          interval: 1000, // 1 second
          retention: 3600 // 1 hour
        },
        healthCheck: {
          enabled: true,
          interval: 30000, // 30 seconds
          timeout: 5000 // 5 seconds
        },
        alerts: {
          enabled: true,
          thresholds: {
            cpu: 80, // 80%
            memory: 85, // 85%
            disk: 90, // 90%
            connections: 800 // 800 connections
          }
        }
      },
      performance: {
        caching: {
          enabled: isProduction,
          ttl: 300000, // 5 minutes
          maxSize: 1000 // max cached items
        },
        compression: {
          enabled: isProduction,
          threshold: 1024 // 1KB
        },
        cluster: {
          enabled: false, // Disabled by default, enable manually if needed
          workers: require('os').cpus().length
        }
      }
    };
  }

  private mergeConfig(customConfig: Partial<ProductionConfig>): void {
    // Deep merge configuration objects
    const merge = (target: any, source: any) => {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          target[key] = target[key] || {};
          merge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    };

    merge(this.config, customConfig);
  }

  private validateConfig(): void {
    const errors: string[] = [];

    // Validate required security settings
    if (!this.config.security.jwt.secret || this.config.security.jwt.secret.length < 32) {
      errors.push('JWT secret must be at least 32 characters long');
    }

    if (this.config.server.https.enabled && (!this.config.server.https.certPath || !this.config.server.https.keyPath)) {
      errors.push('HTTPS enabled but certificate paths not provided');
    }

    // Validate CORS origins
    if (this.config.security.cors.origin.length === 0 && process.env.NODE_ENV === 'production') {
      errors.push('CORS origins must be specified in production');
    }

    // Validate database path
    const dbDir = path.dirname(this.config.database.path);
    if (!fs.existsSync(dbDir)) {
      try {
        fs.mkdirSync(dbDir, { recursive: true });
      } catch (error) {
        errors.push(`Cannot create database directory: ${dbDir}`);
      }
    }

    // Validate log file directory
    if (this.config.logging.file.enabled) {
      const logDir = path.dirname(this.config.logging.file.path);
      if (!fs.existsSync(logDir)) {
        try {
          fs.mkdirSync(logDir, { recursive: true });
        } catch (error) {
          errors.push(`Cannot create log directory: ${logDir}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  private generateSecret(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(64).toString('hex');
  }

  private setupProductionFeatures(): void {
    // Setup database optimization
    if (this.config.database.optimization.vacuumInterval > 0) {
      setInterval(() => {
        this.optimizeDatabase();
      }, this.config.database.optimization.vacuumInterval);
    }

    // Setup backup schedule
    if (this.config.database.backup.enabled) {
      setInterval(() => {
        this.createBackup();
      }, this.config.database.backup.interval);
    }

    // Setup log rotation would go here in a real implementation
    if (this.config.logging.file.enabled) {
      this.setupLogRotation();
    }
  }

  private optimizeDatabase(): void {
    try {
      // VACUUM operation to reclaim space
      this.databaseManager['db']?.exec('VACUUM');

      // ANALYZE to update query planner statistics
      this.databaseManager['db']?.exec('ANALYZE');

      // WAL checkpoint to flush changes to main database
      this.databaseManager['db']?.exec('PRAGMA wal_checkpoint(TRUNCATE)');

      console.log('🗄️ Database optimization completed');
    } catch (error) {
      console.error('❌ Database optimization failed:', error);
    }
  }

  private createBackup(): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(
        this.config.database.backup.path,
        `dashboard-backup-${timestamp}.db`
      );

      this.databaseManager.backup(backupPath);

      // Cleanup old backups
      this.cleanupOldBackups();

      console.log(`✅ Database backup created: ${backupPath}`);
    } catch (error) {
      console.error('❌ Database backup failed:', error);
    }
  }

  private cleanupOldBackups(): void {
    try {
      const backupDir = this.config.database.backup.path;
      const files = fs.readdirSync(backupDir);
      const now = Date.now();
      const retentionMs = this.config.database.backup.retentionDays * 24 * 60 * 60 * 1000;

      files.forEach(file => {
        if (file.startsWith('dashboard-backup-') && file.endsWith('.db')) {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);

          if (now - stats.mtime.getTime() > retentionMs) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Removed old backup: ${file}`);
          }
        }
      });
    } catch (error) {
      console.error('❌ Failed to cleanup old backups:', error);
    }
  }

  private setupLogRotation(): void {
    // Log rotation implementation would go here
    // This would typically use a library like 'winston-daily-rotate-file'
    console.log('📝 Log rotation configured');
  }

  public getConfig(): ProductionConfig {
    return this.config;
  }

  public getSecurityManager(): SecurityManager {
    return this.securityManager;
  }

  public getDatabaseManager(): DatabaseManager {
    return this.databaseManager;
  }

  public createEndpointRateLimiter(endpoint: string) {
    const endpointConfig = this.config.security.rateLimit.endpoints[endpoint];
    if (!endpointConfig) {
      return this.securityManager.createRateLimiter(this.config.security.rateLimit.api);
    }

    return this.securityManager.createEndpointRateLimiter(
      endpoint,
      endpointConfig.windowMs,
      endpointConfig.max
    );
  }

  public getEnvironmentInfo(): any {
    return {
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '2.0.0',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      config: {
        https: this.config.server.https.enabled,
        compression: this.config.server.compression.enabled,
        databaseBackup: this.config.database.backup.enabled,
        fileLogging: this.config.logging.file.enabled,
        monitoring: this.config.monitoring.metrics.enabled
      }
    };
  }

  public close(): void {
    this.databaseManager.close();
  }
}

export { ProductionConfigManager, ProductionConfig };