/**
 * Production Security Configuration
 * Comprehensive security settings for production environments
 */

import { randomBytes, createHash } from 'crypto';

/**
 * Production security configuration
 */
const PRODUCTION_SECURITY_CONFIG = {
  // Environment settings
  environment: 'production',

  // Redis Security Configuration
  redis: {
    // Authentication
    auth: {
      enabled: true,
      password: process.env.REDIS_PASSWORD,
      username: process.env.REDIS_USERNAME || 'default',

      // Password policy
      passwordPolicy: {
        minLength: 32,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        rotationInterval: 90 * 24 * 60 * 60 * 1000, // 90 days
        preventReuse: 5 // Last 5 passwords cannot be reused
      }
    },

    // TLS/SSL Configuration
    tls: {
      enabled: true,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',

      // Cipher suites (ordered by preference)
      ciphers: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA384'
      ],

      // Certificate settings
      certFile: process.env.REDIS_TLS_CERT,
      keyFile: process.env.REDIS_TLS_KEY,
      caFile: process.env.REDIS_TLS_CA,

      // Certificate validation
      rejectUnauthorized: true,
      requestCert: true,
      verifyClient: true,

      // OCSP stapling
      enableOCSPStapling: true,

      // HSTS
      enableHSTS: true,
      hstsMaxAge: 31536000, // 1 year
      hstsIncludeSubdomains: true,
      hstsPreload: true
    },

    // Network Security
    network: {
      // IP Whitelisting
      allowedIPs: process.env.REDIS_ALLOWED_IPS?.split(',') || ['127.0.0.1', '::1'],

      // Port configuration
      port: parseInt(process.env.REDIS_PORT) || 6380, // Use non-standard port

      // Connection limits
      maxConnections: parseInt(process.env.REDIS_MAX_CONNECTIONS) || 100,
      connectionTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 10000,

      // Rate limiting
      rateLimiting: {
        enabled: true,
        windowMs: 60000, // 1 minute
        maxRequests: parseInt(process.env.REDIS_RATE_LIMIT) || 1000,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      }
    },

    // Data Encryption
    encryption: {
      // At-rest encryption
      atRest: {
        enabled: true,
        algorithm: 'aes-256-gcm',
        keyRotationInterval: 30 * 24 * 60 * 60 * 1000, // 30 days
        keyDerivation: {
          algorithm: 'pbkdf2',
          iterations: 100000,
          saltLength: 32,
          keyLength: 32
        }
      },

      // In-transit encryption (handled by TLS)
      inTransit: {
        enabled: true,
        enforced: true
      }
    },

    // Access Control
    accessControl: {
      // Role-based access control
      rbac: {
        enabled: true,
        roles: {
          admin: {
            permissions: ['*'],
            description: 'Full administrative access'
          },
          swarm_coordinator: {
            permissions: [
              'swarm:read', 'swarm:write', 'swarm:delete',
              'memory:read', 'memory:write',
              'metrics:read'
            ],
            description: 'Swarm coordination access'
          },
          agent: {
            permissions: [
              'memory:read', 'memory:write',
              'swarm:read'
            ],
            description: 'Agent-specific access'
          },
          readonly: {
            permissions: ['swarm:read', 'metrics:read'],
            description: 'Read-only access'
          }
        }
      },

      // Attribute-based access control
      abac: {
        enabled: true,
        attributes: {
          department: ['engineering', 'operations', 'security'],
          clearance: ['confidential', 'secret', 'top-secret'],
          location: ['us-east-1', 'us-west-2', 'eu-west-1']
        }
      }
    },

    // Audit and Logging
    audit: {
      enabled: true,
      logLevel: 'info',

      // Audit events
      events: {
        authentication: {
          success: true,
          failure: true,
          passwordChange: true,
          roleChange: true
        },
        authorization: {
          success: true,
          failure: true,
          privilegeEscalation: true
        },
        dataAccess: {
          read: true,
          write: true,
          delete: true,
          export: true
        },
        systemEvents: {
          configuration: true,
          startup: true,
          shutdown: true,
          errors: true
        }
      },

      // Log retention
      retention: {
        auditLogs: 365 * 24 * 60 * 60 * 1000, // 1 year
        accessLogs: 90 * 24 * 60 * 60 * 1000,  // 90 days
        errorLogs: 30 * 24 * 60 * 60 * 1000    // 30 days
      },

      // Log protection
      protection: {
        encryption: true,
        integrity: true,
        tamperProtection: true,
        secureStorage: true
      }
    },

    // Input Validation and Sanitization
    inputValidation: {
      // Key validation
      keys: {
        maxLength: 256,
        allowedPatterns: [
          /^[a-zA-Z0-9:_\-\.]+$/,
          /^swarm:[a-zA-Z0-9_\-\.]+$/,
          /^memory:[a-zA-Z0-9_\-\.]+$/,
          /^metrics:[a-zA-Z0-9_\-\.]+$/
        ],
        forbiddenPatterns: [
          /\.\./,           // Path traversal
          /[<>]/,           // HTML injection
          /javascript:/i,   // JavaScript injection
          /data:/i,         // Data URI
          /vbscript:/i      // VBScript injection
        ]
      },

      // Value validation
      values: {
        maxSize: 10 * 1024 * 1024, // 10MB
        maxStringLength: 1000000,   // 1M characters

        // Content filtering
        contentFilters: {
          sqlInjection: true,
          xss: true,
          pathTraversal: true,
          commandInjection: true,
          ldapInjection: true
        }
      },

      // Command validation
      commands: {
        allowedCommands: [
          'get', 'set', 'setEx', 'del', 'exists',
          'hGet', 'hSet', 'hDel', 'hGetAll',
          'sAdd', 'sRem', 'sMembers', 'sIsMember',
          'lPush', 'lPop', 'rPush', 'rPop',
          'incr', 'decr', 'incrBy', 'decrBy',
          'ping', 'info', 'config', 'client'
        ],

        forbiddenCommands: [
          'eval', 'evalsha', 'script',       // Script execution
          'config', 'shutdown', 'debug',      // System control
          'flushdb', 'flushall',              // Data deletion
          'save', 'bgsave', 'bgrewriteaof'    // Persistence control
        ],

        // Command rate limiting
        rateLimiting: {
          enabled: true,
          windows: {
            'get': { windowMs: 60000, maxRequests: 10000 },
            'set': { windowMs: 60000, maxRequests: 5000 },
            'del': { windowMs: 60000, maxRequests: 1000 }
          }
        }
      }
    },

    // Security Headers and Policies
    securityHeaders: {
      // HTTP headers
      headers: {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'",
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
      },

      // CORS policy
      cors: {
        enabled: true,
        allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || [],
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
        maxAge: 86400
      }
    },

    // Monitoring and Alerting
    monitoring: {
      // Security metrics
      metrics: {
        authenticationAttempts: true,
        authorizationFailures: true,
        suspiciousActivity: true,
        performanceMetrics: true,
        errorRates: true
      },

      // Alert thresholds
      alerts: {
        failedAuthentications: {
          threshold: 10,
          windowMs: 300000, // 5 minutes
          severity: 'warning'
        },
        suspiciousPatterns: {
          threshold: 5,
          windowMs: 300000,
          severity: 'critical'
        },
        unusualResourceUsage: {
          threshold: 0.8, // 80%
          windowMs: 600000, // 10 minutes
          severity: 'warning'
        }
      },

      // Notification channels
      notifications: {
        email: {
          enabled: process.env.SECURITY_EMAIL_ENABLED === 'true',
          recipients: process.env.SECURITY_EMAIL_RECIPIENTS?.split(',') || [],
          smtp: {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD
            }
          }
        },
        slack: {
          enabled: process.env.SLACK_ENABLED === 'true',
          webhook: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_SECURITY_CHANNEL || '#security-alerts'
        },
        pagerduty: {
          enabled: process.env.PAGERDUTY_ENABLED === 'true',
          integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
          severity: ['critical', 'high']
        }
      }
    },

    // Backup and Disaster Recovery
    backup: {
      // Backup configuration
      schedule: {
        frequency: 'daily',
        time: '02:00', // 2 AM UTC
        retention: {
          daily: 30,    // Keep 30 daily backups
          weekly: 12,   // Keep 12 weekly backups
          monthly: 24   // Keep 24 monthly backups
        }
      },

      // Backup encryption
      encryption: {
        enabled: true,
        algorithm: 'aes-256-gcm',
        keyManagement: 'kms' // or 'local'
      },

      // Backup storage
      storage: {
        type: 's3', // or 'gcs', 'azure', 'local'
        config: {
          bucket: process.env.BACKUP_BUCKET,
          region: process.env.BACKUP_REGION,
          accessKey: process.env.BACKUP_ACCESS_KEY,
          secretKey: process.env.BACKUP_SECRET_KEY,
          encryption: true
        }
      },

      // Backup verification
      verification: {
        enabled: true,
        integrityCheck: true,
        restoreTest: true,
        frequency: 'weekly'
      }
    },

    // Compliance and Governance
    compliance: {
      // Standards compliance
      standards: {
        SOC2: {
          enabled: true,
          controls: ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy']
        },
        ISO27001: {
          enabled: true,
          controls: ['A.9', 'A.10', 'A.12', 'A.14', 'A.18']
        },
        GDPR: {
          enabled: true,
          dataProtection: true,
          consentManagement: true,
          dataSubjectRights: true,
          breachNotification: true
        },
        HIPAA: {
          enabled: process.env.HIPAA_ENABLED === 'true',
          safeguards: ['administrative', 'physical', 'technical'],
          auditControls: true,
          integrityControls: true
        }
      },

      // Data classification
      dataClassification: {
        public: {
          retention: 365 * 24 * 60 * 60 * 1000, // 1 year
          encryption: false,
          auditLevel: 'minimal'
        },
        internal: {
          retention: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
          encryption: true,
          auditLevel: 'standard'
        },
        confidential: {
          retention: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
          encryption: true,
          auditLevel: 'detailed'
        },
        restricted: {
          retention: 'permanent',
          encryption: true,
          auditLevel: 'comprehensive',
          accessControl: 'strict'
        }
      }
    }
  },

  // Application Security
  application: {
    // Session security
    session: {
      timeout: 30 * 60 * 1000, // 30 minutes
      renewal: 5 * 60 * 1000,  // Renew within 5 minutes
      secure: true,
      httpOnly: true,
      sameSite: 'strict',

      // Session storage
      storage: {
        type: 'redis',
        encryption: true,
        ttl: 30 * 60 * 1000
      }
    },

    // CSRF protection
    csrf: {
      enabled: true,
      tokenLength: 32,
      tokenExpiration: 60 * 60 * 1000, // 1 hour
      regenerateOnLogin: true
    },

    // Content Security Policy
    csp: {
      enabled: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'"],
        'font-src': ["'self'"],
        'object-src': ["'none'"],
        'media-src': ["'self'"],
        'frame-src': ["'none'"],
        'child-src': ["'none'"],
        'worker-src': ["'self'"],
        'manifest-src': ["'self'"],
        'upgrade-insecure-requests': []
      }
    },

    // API security
    api: {
      // Rate limiting
      rateLimiting: {
        enabled: true,
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100,

        // Tiered limits
        tiers: {
          default: { maxRequests: 100 },
          premium: { maxRequests: 1000 },
          enterprise: { maxRequests: 10000 }
        }
      },

      // API key management
      apiKeys: {
        enabled: true,
        minLength: 32,
        includePrefix: true,
        rotationInterval: 90 * 24 * 60 * 60 * 1000, // 90 days

        // Key permissions
        permissions: {
          read: ['GET'],
          write: ['POST', 'PUT', 'PATCH'],
          delete: ['DELETE'],
          admin: ['*']
        }
      },

      // Request validation
      requestValidation: {
        maxSize: '10mb',
        allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],

        // Input sanitization
        sanitization: {
          enabled: true,
          stripHTML: true,
          normalizeWhitespace: true,
          validateJSON: true
        }
      }
    }
  },

  // Infrastructure Security
  infrastructure: {
    // Container security
    containers: {
      securityContext: {
        runAsNonRoot: true,
        runAsUser: 1000,
        runAsGroup: 1000,
        readOnlyRootFilesystem: true,
        allowPrivilegeEscalation: false,
        dropAllCapabilities: true,
        addCapabilities: [],

        // Seccomp profile
        seccompProfile: {
          type: 'RuntimeDefault'
        },

        // AppArmor profile
        appArmorProfile: {
          type: 'RuntimeDefault'
        }
      },

      // Resource limits
      resources: {
        limits: {
          cpu: '500m',
          memory: '512Mi'
        },
        requests: {
          cpu: '100m',
          memory: '128Mi'
        }
      },

      // Network policies
      networkPolicy: {
        enabled: true,
        ingress: [
          {
            from: [{ namespaceSelector: { matchLabels: { name: 'frontend' } } }],
            ports: [{ protocol: 'TCP', port: 8080 }]
          }
        ],
        egress: [
          {
            to: [{ namespaceSelector: { matchLabels: { name: 'redis' } } }],
            ports: [{ protocol: 'TCP', port: 6379 }]
          }
        ]
      }
    },

    // Network security
    network: {
      // Service mesh
      serviceMesh: {
        enabled: true,
        mtls: {
          mode: 'STRICT',
          certificates: {
            rotationInterval: 24 * 60 * 60 * 1000 // 24 hours
          }
        }
      },

      // Firewall rules
      firewall: {
        enabled: true,
        defaultPolicy: 'DENY',

        rules: [
          {
            name: 'allow-frontend-to-backend',
            source: 'frontend',
            destination: 'backend',
            ports: [8080],
            protocol: 'TCP'
          },
          {
            name: 'allow-backend-to-redis',
            source: 'backend',
            destination: 'redis',
            ports: [6379],
            protocol: 'TCP'
          }
        ]
      },

      // DDoS protection
      ddosProtection: {
        enabled: true,
        threshold: 1000, // requests per second
        burstLimit: 2000,

        // Mitigation strategies
        mitigation: {
          rateLimiting: true,
          challengePages: true,
          ipBlocking: true,
          trafficFiltering: true
        }
      }
    },

    // Secret management
    secrets: {
      // Secret store
      store: {
        type: 'vault', // or 'aws-secrets', 'azure-keyvault', 'gcp-secret-manager'
        config: {
          address: process.env.VAULT_ADDRESS,
          token: process.env.VAULT_TOKEN,
          namespace: process.env.VAULT_NAMESPACE
        }
      },

      // Secret rotation
      rotation: {
        enabled: true,
        interval: 30 * 24 * 60 * 60 * 1000, // 30 days
        autoRotation: true,

        // Rotation notification
        notification: {
          email: true,
          slack: true,
          advanceNotice: 7 * 24 * 60 * 60 * 1000 // 7 days
        }
      },

      // Secret access control
      accessControl: {
        principleOfLeastPrivilege: true,
        timeBoundAccess: true,
        approvalRequired: true,
        auditAccess: true
      }
    }
  }
};

/**
 * Security utility functions
 */
export class SecurityUtils {
  /**
   * Generate secure random string
   */
  static generateSecureRandom(length = 32) {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generate password hash
   */
  static hashPassword(password, salt = null) {
    if (!salt) {
      salt = randomBytes(16).toString('hex');
    }

    const hash = createHash('sha256')
      .update(password + salt)
      .digest('hex');

    return { hash, salt };
  }

  /**
   * Verify password
   */
  static verifyPassword(password, hash, salt) {
    const computedHash = createHash('sha256')
      .update(password + salt)
      .digest('hex');

    return computedHash === hash;
  }

  /**
   * Validate key against security patterns
   */
  static validateKey(key, patterns) {
    if (typeof key !== 'string') {
      return { valid: false, error: 'Key must be a string' };
    }

    if (key.length > 256) {
      return { valid: false, error: 'Key too long' };
    }

    // Check forbidden patterns
    for (const forbidden of patterns.forbiddenPatterns) {
      if (forbidden.test(key)) {
        return { valid: false, error: 'Key contains forbidden pattern' };
      }
    }

    // Check allowed patterns
    const isValidPattern = patterns.allowedPatterns.some(allowed =>
      allowed.test(key)
    );

    if (!isValidPattern) {
      return { valid: false, error: 'Key does not match allowed pattern' };
    }

    return { valid: true };
  }

  /**
   * Sanitize input value
   */
  static sanitizeValue(value, maxSize) {
    if (typeof value === 'string') {
      // Remove potentially dangerous content
      value = value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/vbscript:/gi, '')
        .replace(/onload=/gi, '')
        .replace(/onerror=/gi, '');

      // Truncate if too long
      if (value.length > maxSize) {
        value = value.substring(0, maxSize);
      }
    }

    return value;
  }

  /**
   * Generate secure token
   */
  static generateSecureToken(payload, secret, expiresIn = '1h') {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, secret, { expiresIn });
  }

  /**
   * Verify secure token
   */
  static verifySecureToken(token, secret) {
    const jwt = require('jsonwebtoken');
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      return null;
    }
  }
}

/**
 * Security middleware factory
 */
export class SecurityMiddleware {
  /**
   * Rate limiting middleware
   */
  static rateLimit(options = {}) {
    const config = { ...PRODUCTION_SECURITY_CONFIG.redis.network.rateLimiting, ...options };

    return (req, res, next) => {
      // Implementation would use a rate limiting library like express-rate-limit
      // This is a placeholder for the actual implementation
      next();
    };
  }

  /**
   * Input validation middleware
   */
  static inputValidation(options = {}) {
    const config = { ...PRODUCTION_SECURITY_CONFIG.inputValidation, ...options };

    return (req, res, next) => {
      // Validate request body, params, and query
      // This is a placeholder for the actual implementation
      next();
    };
  }

  /**
   * Security headers middleware
   */
  static securityHeaders() {
    return (req, res, next) => {
      const headers = PRODUCTION_SECURITY_CONFIG.securityHeaders.headers;

      Object.entries(headers).forEach(([header, value]) => {
        res.setHeader(header, value);
      });

      next();
    };
  }

  /**
   * CORS middleware
   */
  static cors(options = {}) {
    const config = { ...PRODUCTION_SECURITY_CONFIG.securityHeaders.cors, ...options };

    return (req, res, next) => {
      // CORS implementation
      // This is a placeholder for the actual implementation
      next();
    };
  }
}

export default PRODUCTION_SECURITY_CONFIG;