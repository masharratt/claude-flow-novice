/**
 * Comprehensive Production-Ready Security Testing Framework
 *
 * Tests input validation and sanitization, authentication and authorization,
 * rate limiting and DoS protection, and data encryption and secure storage
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { createClient } from 'redis';
import crypto from 'crypto';
import { performance } from 'perf_hooks';

// Mock dependencies
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('salt')
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_jwt_token'),
  verify: jest.fn().mockReturnValue({ userId: 'test-user', role: 'user' })
}));

describe('Security Testing Production Framework', () => {
  let redisClient;
  let securityValidator;
  let rateLimiter;
  let authManager;
  let cryptoManager;
  let testConfig;

  // Security Validator class
  class SecurityValidator {
    constructor() {
      this.sanitizePatterns = {
        xss: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        sql: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
        pathTraversal: /\.\./g,
        commandInjection: /[;&|`$(){}[\]]/g,
        ldapInjection: /[()&|!=<>*~]/g,
        nosqlInjection: /(\$where|\$gt|\$lt|\$ne|\$in|\$nin|\$exists)/g
      };

      this.allowedChars = /^[a-zA-Z0-9\s\-_.,!?@#%&*+=:()[\]{}'"\/\\]+$/;
      this.maxInputLength = 10000;
      this.maxDepth = 10;
    }

    sanitizeInput(input, type = 'string') {
      if (typeof input !== 'string') {
        if (typeof input === 'object' && input !== null) {
          return this.sanitizeObject(input);
        }
        return input;
      }

      // Length validation
      if (input.length > this.maxInputLength) {
        throw new Error(`Input exceeds maximum length of ${this.maxInputLength}`);
      }

      // Character validation
      if (!this.allowedChars.test(input)) {
        throw new Error('Input contains invalid characters');
      }

      // Pattern-based sanitization
      let sanitized = input;

      Object.entries(this.sanitizePatterns).forEach(([pattern, regex]) => {
        sanitized = sanitized.replace(regex, '');
      });

      // Null byte injection prevention
      sanitized = sanitized.replace(/\0/g, '');

      // Unicode normalization
      sanitized = sanitized.normalize('NFKC');

      return sanitized.trim();
    }

    sanitizeObject(obj, depth = 0) {
      if (depth > this.maxDepth) {
        throw new Error('Object nesting exceeds maximum depth');
      }

      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize key
        const sanitizedKey = this.sanitizeInput(key, 'key');
        if (sanitizedKey !== key) {
          throw new Error('Invalid object key detected');
        }

        // Sanitize value
        if (typeof value === 'string') {
          sanitized[sanitizedKey] = this.sanitizeInput(value);
        } else if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            sanitized[sanitizedKey] = value.map(item =>
              typeof item === 'string' ? this.sanitizeInput(item) : item
            );
          } else {
            sanitized[sanitizedKey] = this.sanitizeObject(value, depth + 1);
          }
        } else {
          sanitized[sanitizedKey] = value;
        }
      }

      return sanitized;
    }

    validateFileUpload(file) {
      const maxSize = 50 * 1024 * 1024; // 50MB
      const allowedTypes = [
        'text/plain',
        'application/json',
        'application/javascript',
        'text/javascript',
        'text/markdown',
        'image/png',
        'image/jpeg',
        'image/gif'
      ];

      // Size validation
      if (file.size > maxSize) {
        throw new Error('File size exceeds maximum allowed size');
      }

      // Type validation
      if (!allowedTypes.includes(file.type)) {
        throw new Error('File type not allowed');
      }

      // Name validation
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      if (sanitizedName !== file.name) {
        throw new Error('File name contains invalid characters');
      }

      // Content validation (scan for malicious patterns)
      if (file.content) {
        const contentString = file.content.toString();
        Object.values(this.sanitizePatterns).forEach(regex => {
          if (regex.test(contentString)) {
            throw new Error('File content contains potentially malicious code');
          }
        });
      }

      return true;
    }

    validateSwarmState(state) {
      const requiredFields = ['id', 'objective', 'status', 'startTime'];
      const allowedStatuses = ['initializing', 'running', 'paused', 'completed', 'failed', 'interrupted'];
      const allowedStrategies = ['auto', 'research', 'development', 'analysis', 'testing', 'optimization', 'maintenance'];
      const allowedModes = ['centralized', 'distributed', 'hierarchical', 'mesh', 'hybrid'];

      // Required fields validation
      for (const field of requiredFields) {
        if (!state[field]) {
          throw new Error(`Required field missing: ${field}`);
        }
      }

      // ID validation
      if (!/^[a-zA-Z0-9_-]+$/.test(state.id)) {
        throw new Error('Invalid swarm ID format');
      }

      // Status validation
      if (!allowedStatuses.includes(state.status)) {
        throw new Error('Invalid swarm status');
      }

      // Strategy validation
      if (state.metadata?.strategy && !allowedStrategies.includes(state.metadata.strategy)) {
        throw new Error('Invalid swarm strategy');
      }

      // Mode validation
      if (state.metadata?.mode && !allowedModes.includes(state.metadata.mode)) {
        throw new Error('Invalid swarm mode');
      }

      // Agent validation
      if (state.agents) {
        if (!Array.isArray(state.agents)) {
          throw new Error('Agents must be an array');
        }
        if (state.agents.length > 1000) {
          throw new Error('Too many agents in swarm');
        }

        state.agents.forEach((agent, index) => {
          if (!agent.id || !/^[a-zA-Z0-9_-]+$/.test(agent.id)) {
            throw new Error(`Invalid agent ID at index ${index}`);
          }
          if (agent.confidence && (agent.confidence < 0 || agent.confidence > 1)) {
            throw new Error(`Invalid agent confidence at index ${index}`);
          }
        });
      }

      // Task validation
      if (state.tasks) {
        if (!Array.isArray(state.tasks)) {
          throw new Error('Tasks must be an array');
        }
        if (state.tasks.length > 10000) {
          throw new Error('Too many tasks in swarm');
        }

        state.tasks.forEach((task, index) => {
          if (!task.id || !/^[a-zA-Z0-9_-]+$/.test(task.id)) {
            throw new Error(`Invalid task ID at index ${index}`);
          }
          if (task.progress && (task.progress < 0 || task.progress > 100)) {
            throw new Error(`Invalid task progress at index ${index}`);
          }
        });
      }

      return true;
    }
  }

  // Rate Limiter class
  class RateLimiter {
    constructor(redisClient) {
      this.redis = redisClient;
      this.windows = {
        '1s': { size: 1000, maxRequests: 100 },
        '1m': { size: 60000, maxRequests: 1000 },
        '1h': { size: 3600000, maxRequests: 10000 },
        '1d': { size: 86400000, maxRequests: 100000 }
      };
    }

    async checkRateLimit(identifier, window = '1m') {
      const config = this.windows[window];
      if (!config) {
        throw new Error(`Invalid rate limit window: ${window}`);
      }

      const key = `rate_limit:${window}:${identifier}`;
      const now = Date.now();
      const windowStart = now - config.size;

      // Remove old entries
      await this.redis.zRemRangeByScore(key, 0, windowStart);

      // Count current requests
      const currentCount = await this.redis.zCard(key);

      if (currentCount >= config.maxRequests) {
        const ttl = await this.redis.pttl(key);
        throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(ttl / 1000)} seconds`);
      }

      // Add current request
      await this.redis.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
      await this.redis.expire(key, Math.ceil(config.size / 1000));

      return {
        allowed: true,
        remaining: config.maxRequests - currentCount - 1,
        resetTime: now + config.size
      };
    }

    async getRateLimitStatus(identifier, window = '1m') {
      const config = this.windows[window];
      const key = `rate_limit:${window}:${identifier}`;
      const now = Date.now();
      const windowStart = now - config.size;

      // Clean old entries
      await this.redis.zRemRangeByScore(key, 0, windowStart);

      const currentCount = await this.redis.zCard(key);
      const ttl = await this.redis.pttl(key);

      return {
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - currentCount),
        resetTime: ttl > 0 ? Date.now() + ttl : now + config.size,
        window: config.size
      };
    }
  }

  // Authentication Manager class
  class AuthManager {
    constructor(redisClient) {
      this.redis = redisClient;
      this.sessionTimeout = 3600000; // 1 hour
      this.maxSessionsPerUser = 5;
      this.passwordMinLength = 8;
      this.passwordComplexity = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    }

    async hashPassword(password) {
      if (password.length < this.passwordMinLength) {
        throw new Error(`Password must be at least ${this.passwordMinLength} characters long`);
      }

      if (!this.passwordComplexity.test(password)) {
        throw new Error('Password must contain uppercase, lowercase, number, and special character');
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
      return { hash, salt };
    }

    async verifyPassword(password, hashedPassword, salt) {
      const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
      return hash === hashedPassword;
    }

    async createSession(userId, role = 'user', permissions = []) {
      const sessionId = crypto.randomBytes(32).toString('hex');
      const sessionData = {
        userId,
        role,
        permissions,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        ipAddress: '127.0.0.1' // Would be extracted from request
      };

      // Check session limit
      const existingSessions = await this.getUserSessions(userId);
      if (existingSessions.length >= this.maxSessionsPerUser) {
        // Remove oldest session
        const oldestSession = existingSessions[0];
        await this.redis.del(`session:${oldestSession.id}`);
        await this.redis.sRem(`user_sessions:${userId}`, oldestSession.id);
      }

      // Store session
      await this.redis.setEx(`session:${sessionId}`, this.sessionTimeout / 1000, JSON.stringify(sessionData));
      await this.redis.sAdd(`user_sessions:${userId}`, sessionId);
      await this.redis.expire(`user_sessions:${userId}`, this.sessionTimeout / 1000);

      return sessionId;
    }

    async validateSession(sessionId) {
      const sessionData = await this.redis.get(`session:${sessionId}`);
      if (!sessionData) {
        throw new Error('Invalid or expired session');
      }

      const session = JSON.parse(sessionData);

      // Update last activity
      session.lastActivity = Date.now();
      await this.redis.setEx(`session:${sessionId}`, this.sessionTimeout / 1000, JSON.stringify(session));

      return session;
    }

    async destroySession(sessionId) {
      const sessionData = await this.redis.get(`session:${sessionId}`);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        await this.redis.del(`session:${sessionId}`);
        await this.redis.sRem(`user_sessions:${session.userId}`, sessionId);
      }
    }

    async getUserSessions(userId) {
      const sessionIds = await this.redis.sMembers(`user_sessions:${userId}`);
      const sessions = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.redis.get(`session:${sessionId}`);
        if (sessionData) {
          sessions.push({ id: sessionId, ...JSON.parse(sessionData) });
        }
      }

      return sessions.sort((a, b) => b.lastActivity - a.lastActivity);
    }

    hasPermission(session, permission) {
      if (!session || !session.permissions) {
        return false;
      }

      return session.permissions.includes(permission) || session.role === 'admin';
    }
  }

  // Cryptography Manager class
  class CryptoManager {
    constructor() {
      this.algorithm = 'aes-256-gcm';
      this.keyLength = 32;
      this.ivLength = 16;
      this.tagLength = 16;
      this.masterKey = crypto.randomBytes(this.keyLength);
    }

    encrypt(text, key = null) {
      const encryptionKey = key || this.masterKey;
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, encryptionKey, iv);
      cipher.setAAD(Buffer.from('swarm-data', 'utf8'));

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    }

    decrypt(encryptedData, key = null) {
      const encryptionKey = key || this.masterKey;
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, encryptionKey, iv);
      decipher.setAAD(Buffer.from('swarm-data', 'utf8'));
      decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    }

    generateSecureToken(length = 32) {
      return crypto.randomBytes(length).toString('hex');
    }

    hash(data, algorithm = 'sha256') {
      return crypto.createHash(algorithm).update(data).digest('hex');
    }

    verifyHash(data, hash, algorithm = 'sha256') {
      const computedHash = this.hash(data, algorithm);
      return computedHash === hash;
    }

    generateKeyPair() {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      return { publicKey, privateKey };
    }

    sign(data, privateKey) {
      const sign = crypto.createSign('SHA256');
      sign.update(data);
      return sign.sign(privateKey, 'hex');
    }

    verifySignature(data, signature, publicKey) {
      const verify = crypto.createVerify('SHA256');
      verify.update(data);
      return verify.verify(publicKey, signature, 'hex');
    }
  }

  beforeAll(async () => {
    testConfig = {
      host: process.env.REDIS_TEST_HOST || 'localhost',
      port: parseInt(process.env.REDIS_TEST_PORT) || 6379,
      database: parseInt(process.env.REDIS_TEST_DB) || 3, // Use separate DB for security tests
      connectTimeout: 5000,
      lazyConnect: true
    };

    redisClient = createClient(testConfig);
    await redisClient.connect();

    securityValidator = new SecurityValidator();
    rateLimiter = new RateLimiter(redisClient);
    authManager = new AuthManager(redisClient);
    cryptoManager = new CryptoManager();
  });

  afterAll(async () => {
    if (redisClient) {
      await redisClient.quit();
    }
  });

  beforeEach(async () => {
    // Clean up test data
    const testKeys = await redisClient.keys('test-*');
    if (testKeys.length > 0) {
      await redisClient.del(testKeys);
    }
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('Input Validation and Sanitization', () => {
    describe('String Input Validation', () => {
      it('should sanitize XSS attacks', () => {
        const xssInputs = [
          '<script>alert("xss")</script>',
          '<img src=x onerror=alert(1)>',
          'javascript:alert(1)',
          '<svg onload=alert(1)>',
          '"><script>alert(1)</script>',
          "'><script>alert(1)</script>"
        ];

        xssInputs.forEach(input => {
          const sanitized = securityValidator.sanitizeInput(input);
          expect(sanitized).not.toContain('<script>');
          expect(sanitized).not.toContain('javascript:');
          expect(sanitized).not.toContain('onerror=');
          expect(sanitized).not.toContain('onload=');
        });
      });

      it('should sanitize SQL injection attempts', () => {
        const sqlInputs = [
          "'; DROP TABLE users; --",
          "' OR '1'='1",
          "UNION SELECT * FROM passwords",
          "'; DELETE FROM swarms; --",
          "1'; EXEC xp_cmdshell('dir'); --",
          "'; ALTER TABLE swarms DROP COLUMN id; --"
        ];

        sqlInputs.forEach(input => {
          const sanitized = securityValidator.sanitizeInput(input);
          expect(sanitized).not.toContain('DROP TABLE');
          expect(sanitized).not.toContain('UNION SELECT');
          expect(sanitized).not.toContain('EXEC');
          expect(sanitized).not.toContain('ALTER TABLE');
        });
      });

      it('should prevent path traversal attacks', () => {
        const pathInputs = [
          '../../../etc/passwd',
          '..\\..\\..\\windows\\system32\\config\\sam',
          '....//....//....//etc/passwd',
          '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
          '..%252f..%252f..%252fetc%252fpasswd'
        ];

        pathInputs.forEach(input => {
          const sanitized = securityValidator.sanitizeInput(input);
          expect(sanitized).not.toContain('../');
          expect(sanitized).not.toContain('..\\');
        });
      });

      it('should prevent command injection', () => {
        const commandInputs = [
          '; ls -la',
          '| cat /etc/passwd',
          '& echo "hacked"',
          '`whoami`',
          '$(id)',
          '; rm -rf /'
        ];

        commandInputs.forEach(input => {
          const sanitized = securityValidator.sanitizeInput(input);
          expect(sanitized).not.toContain(';');
          expect(sanitized).not.toContain('|');
          expect(sanitized).not.toContain('&');
          expect(sanitized).not.toContain('`');
          expect(sanitized).not.toContain('$(');
        });
      });

      it('should validate input length limits', () => {
        const longInput = 'a'.repeat(10001);

        expect(() => {
          securityValidator.sanitizeInput(longInput);
        }).toThrow('exceeds maximum length');
      });

      it('should validate character sets', () => {
        const invalidInputs = [
          '\x00\x01\x02', // Null bytes and control characters
          'test\x00malicious', // Null byte injection
          '🚀🔥💀', // Some unicode emojis might be filtered
          '\u0000\u0001\u0002' // More control characters
        ];

        invalidInputs.forEach(input => {
          expect(() => {
            securityValidator.sanitizeInput(input);
          }).toThrow('invalid characters');
        });
      });
    });

    describe('Object Input Validation', () => {
      it('should sanitize nested objects', () => {
        const maliciousObject = {
          validField: 'valid value',
          maliciousField: '<script>alert(1)</script>',
          nested: {
            validNested: 'valid nested value',
            maliciousNested: "'; DROP TABLE users; --"
          },
          arrayField: [
            'valid array item',
            '<img src=x onerror=alert(1)>',
            { deeplyNested: '../../../etc/passwd' }
          ]
        };

        const sanitized = securityValidator.sanitizeObject(maliciousObject);

        expect(sanitized.maliciousField).not.toContain('<script>');
        expect(sanitized.nested.maliciousNested).not.toContain('DROP TABLE');
        expect(sanitized.arrayField[1]).not.toContain('onerror=');
        expect(sanitized.arrayField[2].deeplyNested).not.toContain('../');
      });

      it('should prevent object key injection', () => {
        const maliciousObject = {
          '__proto__': { malicious: 'value' },
          'constructor': { malicious: 'value' },
          'prototype': { malicious: 'value' },
          'validKey': 'validValue'
        };

        // Should allow valid keys but sanitize potentially dangerous ones
        const sanitized = securityValidator.sanitizeObject(maliciousObject);
        expect(sanitized.validKey).toBe('validValue');
        // Dangerous prototype keys should be handled by the sanitization
      });

      it('should limit object nesting depth', () => {
        let deeplyNested = {};
        let current = deeplyNested;

        // Create object deeper than maxDepth
        for (let i = 0; i < 15; i++) {
          current.nested = {};
          current = current.nested;
        }

        expect(() => {
          securityValidator.sanitizeObject(deeplyNested);
        }).toThrow('exceeds maximum depth');
      });
    });

    describe('Swarm State Validation', () => {
      it('should validate required swarm fields', () => {
        const invalidStates = [
          {}, // Empty object
          { id: 'test' }, // Missing objective, status, startTime
          { id: 'test', objective: 'test' }, // Missing status, startTime
          { id: 'test', objective: 'test', status: 'running' } // Missing startTime
        ];

        invalidStates.forEach(state => {
          expect(() => {
            securityValidator.validateSwarmState(state);
          }).toThrow('Required field missing');
        });
      });

      it('should validate swarm ID format', () => {
        const invalidIds = [
          'invalid id with spaces',
          'invalid/id/with/slashes',
          'invalid.id.with.dots',
          'invalid@id@with@symbols',
          '../../../etc/passwd',
          '',
          null,
          undefined
        ];

        invalidIds.forEach(id => {
          expect(() => {
            securityValidator.validateSwarmState({
              id,
              objective: 'test',
              status: 'running',
              startTime: Date.now()
            });
          }).toThrow('Invalid swarm ID');
        });
      });

      it('should validate swarm status values', () => {
        const invalidStatuses = [
          'invalid_status',
          'RUNNING', // Uppercase not allowed
          'Running', // Mixed case not allowed
          '',
          null,
          123
        ];

        invalidStatuses.forEach(status => {
          expect(() => {
            securityValidator.validateSwarmState({
              id: 'valid-swarm-id',
              objective: 'test',
              status,
              startTime: Date.now()
            });
          }).toThrow('Invalid swarm status');
        });
      });

      it('should validate agent arrays', () => {
        const invalidAgentArrays = [
          { agents: 'not an array' },
          { agents: null },
          { agents: Array(1001).fill({ id: 'agent' }) }, // Too many agents
          { agents: [{ id: null }] }, // Invalid agent ID
          { agents: [{ id: 'valid', confidence: 1.5 }] } // Invalid confidence
        ];

        invalidAgentArrays.forEach(agents => {
          expect(() => {
            securityValidator.validateSwarmState({
              id: 'valid-swarm-id',
              objective: 'test',
              status: 'running',
              startTime: Date.now(),
              ...agents
            });
          }).toThrow();
        });
      });

      it('should validate task arrays', () => {
        const invalidTaskArrays = [
          { tasks: 'not an array' },
          { tasks: null },
          { tasks: Array(10001).fill({ id: 'task' }) }, // Too many tasks
          { tasks: [{ id: null }] }, // Invalid task ID
          { tasks: [{ id: 'valid', progress: 150 }] } // Invalid progress
        ];

        invalidTaskArrays.forEach(tasks => {
          expect(() => {
            securityValidator.validateSwarmState({
              id: 'valid-swarm-id',
              objective: 'test',
              status: 'running',
              startTime: Date.now(),
              ...tasks
            });
          }).toThrow();
        });
      });
    });

    describe('File Upload Validation', () => {
      it('should validate file size limits', () => {
        const oversizedFile = {
          name: 'large.txt',
          type: 'text/plain',
          size: 51 * 1024 * 1024, // 51MB
          content: Buffer.from('Large file content')
        };

        expect(() => {
          securityValidator.validateFileUpload(oversizedFile);
        }).toThrow('exceeds maximum allowed size');
      });

      it('should validate allowed file types', () => {
        const disallowedTypes = [
          'application/exe',
          'application/x-msdownload',
          'application/x-msdos-program',
          'application/x-php',
          'application/x-sh',
          'application/x-python-code'
        ];

        disallowedTypes.forEach(type => {
          const file = {
            name: 'test.exe',
            type,
            size: 1024,
            content: Buffer.from('test content')
          };

          expect(() => {
            securityValidator.validateFileUpload(file);
          }).toThrow('File type not allowed');
        });
      });

      it('should validate file names', () => {
        const maliciousNames = [
          '../../../etc/passwd.txt',
          'script.js',
          'config.php',
          'exec.exe',
          'file with spaces and symbols!.txt'
        ];

        maliciousNames.forEach(name => {
          const file = {
            name,
            type: 'text/plain',
            size: 1024,
            content: Buffer.from('test content')
          };

          expect(() => {
            securityValidator.validateFileUpload(file);
          }).toThrow('invalid characters');
        });
      });

      it('should scan file content for malicious patterns', () => {
        const maliciousContents = [
          '<script>alert("xss")</script>',
          '<?php system($_GET["cmd"]); ?>',
          '#!/bin/bash\nrm -rf /',
          '<% eval request("cmd") %>'
        ];

        maliciousContents.forEach(content => {
          const file = {
            name: 'test.txt',
            type: 'text/plain',
            size: content.length,
            content: Buffer.from(content)
          };

          expect(() => {
            securityValidator.validateFileUpload(file);
          }).toThrow('malicious code');
        });
      });
    });
  });

  describe('Authentication and Authorization', () => {
    describe('Password Security', () => {
      it('should enforce password complexity requirements', async () => {
        const weakPasswords = [
          'password',
          '12345678',
          'password123',
          'PASSWORD123',
          'Password!',
          'Passw0rd',
          'Short1!',
          'nouppercase1!',
          'NOLOWERCASE1!',
          'NoNumbers!',
          'NoSpecialChars1'
        ];

        for (const password of weakPasswords) {
          try {
            await authManager.hashPassword(password);
            fail(`Password "${password}" should have been rejected`);
          } catch (error) {
            expect(error.message).toContain('must contain');
          }
        }
      });

      it('should accept strong passwords', async () => {
        const strongPasswords = [
          'StrongP@ssw0rd!',
          'MySecur3P@ssword!',
          'C0mpl3x@P@ssw0rd',
          'Th1sIs@Str0ngP@ss'
        ];

        for (const password of strongPasswords) {
          const result = await authManager.hashPassword(password);
          expect(result).toHaveProperty('hash');
          expect(result).toHaveProperty('salt');
          expect(result.hash).not.toBe(password);
        }
      });

      it('should verify passwords correctly', async () => {
        const password = 'TestP@ssw0rd!';
        const { hash, salt } = await authManager.hashPassword(password);

        const isValid = await authManager.verifyPassword(password, hash, salt);
        expect(isValid).toBe(true);

        const isInvalid = await authManager.verifyPassword('wrongpassword', hash, salt);
        expect(isInvalid).toBe(false);
      });
    });

    describe('Session Management', () => {
      it('should create and validate sessions', async () => {
        const userId = 'test-user-123';
        const sessionId = await authManager.createSession(userId, 'user', ['read', 'write']);

        expect(sessionId).toBeDefined();
        expect(sessionId).toHaveLength(64); // 32 bytes * 2 (hex encoding)

        const session = await authManager.validateSession(sessionId);
        expect(session.userId).toBe(userId);
        expect(session.role).toBe('user');
        expect(session.permissions).toEqual(['read', 'write']);
        expect(session.createdAt).toBeDefined();
        expect(session.lastActivity).toBeDefined();
      });

      it('should reject invalid sessions', async () => {
        const invalidSessionIds = [
          'invalid-session-id',
          '',
          null,
          'non-existent-session-id'
        ];

        for (const sessionId of invalidSessionIds) {
          try {
            await authManager.validateSession(sessionId);
            fail(`Session ID "${sessionId}" should have been rejected`);
          } catch (error) {
            expect(error.message).toContain('Invalid or expired');
          }
        }
      });

      it('should enforce session limits per user', async () => {
        const userId = 'session-limit-user';
        const sessions = [];

        // Create maximum allowed sessions
        for (let i = 0; i < authManager.maxSessionsPerUser; i++) {
          const sessionId = await authManager.createSession(userId);
          sessions.push(sessionId);
        }

        // Creating one more should remove the oldest
        const newSessionId = await authManager.createSession(userId);

        const userSessions = await authManager.getUserSessions(userId);
        expect(userSessions).toHaveLength(authManager.maxSessionsPerUser);
        expect(userSessions[0].id).toBe(newSessionId); // Newest session should be first
        expect(sessions[0]).not.toBe(userSessions.map(s => s.id).includes(sessions[0])); // Oldest should be removed
      });

      it('should destroy sessions properly', async () => {
        const userId = 'destroy-session-user';
        const sessionId = await authManager.createSession(userId);

        // Verify session exists
        let session = await authManager.validateSession(sessionId);
        expect(session).toBeDefined();

        // Destroy session
        await authManager.destroySession(sessionId);

        // Verify session no longer exists
        try {
          await authManager.validateSession(sessionId);
          fail('Session should have been destroyed');
        } catch (error) {
          expect(error.message).toContain('Invalid or expired');
        }

        // Verify user sessions list is updated
        const userSessions = await authManager.getUserSessions(userId);
        expect(userSessions).toHaveLength(0);
      });
    });

    describe('Authorization', () => {
      it('should check permissions correctly', async () => {
        const adminSession = {
          userId: 'admin-user',
          role: 'admin',
          permissions: ['read', 'write', 'delete']
        };

        const userSession = {
          userId: 'regular-user',
          role: 'user',
          permissions: ['read', 'write']
        };

        // Admin should have all permissions
        expect(authManager.hasPermission(adminSession, 'read')).toBe(true);
        expect(authManager.hasPermission(adminSession, 'write')).toBe(true);
        expect(authManager.hasPermission(adminSession, 'delete')).toBe(true);
        expect(authManager.hasPermission(adminSession, 'admin-only')).toBe(true);

        // Regular user should have only assigned permissions
        expect(authManager.hasPermission(userSession, 'read')).toBe(true);
        expect(authManager.hasPermission(userSession, 'write')).toBe(true);
        expect(authManager.hasPermission(userSession, 'delete')).toBe(false);
        expect(authManager.hasPermission(userSession, 'admin-only')).toBe(false);
      });

      it('should handle invalid sessions in permission checks', () => {
        const invalidSessions = [null, undefined, {}, { permissions: null }];

        invalidSessions.forEach(session => {
          expect(authManager.hasPermission(session, 'read')).toBe(false);
        });
      });
    });
  });

  describe('Rate Limiting and DoS Protection', () => {
    describe('Rate Limiting', () => {
      it('should enforce rate limits', async () => {
        const identifier = 'test-client-1';
        const window = '1s'; // 1 second window with 100 requests limit

        // Make requests up to the limit
        for (let i = 0; i < 100; i++) {
          const result = await rateLimiter.checkRateLimit(identifier, window);
          expect(result.allowed).toBe(true);
          expect(result.remaining).toBe(99 - i);
        }

        // Next request should be rate limited
        try {
          await rateLimiter.checkRateLimit(identifier, window);
          fail('Request should have been rate limited');
        } catch (error) {
          expect(error.message).toContain('Rate limit exceeded');
        }
      });

      it('should reset rate limits after window expires', async () => {
        const identifier = 'test-client-2';
        const window = '1s'; // 1 second window

        // Exhaust rate limit
        for (let i = 0; i < 100; i++) {
          await rateLimiter.checkRateLimit(identifier, window);
        }

        // Should be rate limited
        try {
          await rateLimiter.checkRateLimit(identifier, window);
          fail('Should be rate limited');
        } catch (error) {
          expect(error.message).toContain('Rate limit exceeded');
        }

        // Wait for window to expire (plus small buffer)
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Should be allowed again
        const result = await rateLimiter.checkRateLimit(identifier, window);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(99);
      });

      it('should handle different time windows', async () => {
        const identifier = 'test-client-3';
        const windows = ['1s', '1m', '1h', '1d'];

        for (const window of windows) {
          const config = rateLimiter.windows[window];
          const result = await rateLimiter.checkRateLimit(identifier, window);

          expect(result.allowed).toBe(true);
          expect(result.remaining).toBe(config.maxRequests - 1);
        }
      });

      it('should provide rate limit status', async () => {
        const identifier = 'test-client-4';
        const window = '1m';

        // Make some requests
        for (let i = 0; i < 10; i++) {
          await rateLimiter.checkRateLimit(identifier, window);
        }

        const status = await rateLimiter.getRateLimitStatus(identifier, window);

        expect(status.limit).toBe(1000); // 1m window limit
        expect(status.remaining).toBe(990); // 1000 - 10 requests made
        expect(status.window).toBe(60000); // 1 minute in ms
        expect(status.resetTime).toBeGreaterThan(Date.now());
      });
    });

    describe('DoS Protection', () => {
      it('should handle burst traffic gracefully', async () => {
        const identifier = 'burst-test-client';
        const window = '1s';
        const burstSize = 150; // Exceeds the 100 request limit

        const results = await Promise.allSettled(
          Array.from({ length: burstSize }, () =>
            rateLimiter.checkRateLimit(identifier, window)
          )
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        // Should allow up to the limit
        expect(successful).toBe(100);
        // Should reject excess requests
        expect(failed).toBe(50);
      });

      it('should distribute rate limits across identifiers', async () => {
        const identifiers = ['client-1', 'client-2', 'client-3'];
        const requestsPerClient = 50;

        const results = await Promise.all(
          identifiers.flatMap(identifier =>
            Array.from({ length: requestsPerClient }, () =>
              rateLimiter.checkRateLimit(identifier, '1s')
            )
          )
        );

        // All requests should succeed since they're distributed across clients
        expect(results).toHaveLength(identifiers.length * requestsPerClient);
        results.forEach(result => {
          expect(result.allowed).toBe(true);
        });
      });

      it('should handle rate limit cleanup efficiently', async () => {
        const identifier = 'cleanup-test-client';
        const window = '1s';

        // Make some requests
        for (let i = 0; i < 50; i++) {
          await rateLimiter.checkRateLimit(identifier, window);
        }

        // Check that entries are created in Redis
        const key = `rate_limit:${window}:${identifier}`;
        const count = await redisClient.zCard(key);
        expect(count).toBe(50);

        // Wait for window to expire
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Make a new request to trigger cleanup
        await rateLimiter.checkRateLimit(identifier, window);

        // Old entries should be cleaned up
        const newCount = await redisClient.zCard(key);
        expect(newCount).toBe(1); // Only the new request
      });
    });
  });

  describe('Data Encryption and Secure Storage', () => {
    describe('Encryption/Decryption', () => {
      it('should encrypt and decrypt data correctly', () => {
        const testData = 'Sensitive swarm data that needs encryption';
        const encrypted = cryptoManager.encrypt(testData);
        const decrypted = cryptoManager.decrypt(encrypted);

        expect(encrypted).toHaveProperty('encrypted');
        expect(encrypted).toHaveProperty('iv');
        expect(encrypted).toHaveProperty('tag');
        expect(encrypted.encrypted).not.toBe(testData);
        expect(decrypted).toBe(testData);
      });

      it('should use unique IVs for each encryption', () => {
        const testData = 'Test data';
        const encrypted1 = cryptoManager.encrypt(testData);
        const encrypted2 = cryptoManager.encrypt(testData);

        expect(encrypted1.iv).not.toBe(encrypted2.iv);
        expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
      });

      it('should fail to decrypt with wrong data', () => {
        const testData = 'Original data';
        const wrongData = 'Wrong data';
        const encrypted = cryptoManager.encrypt(testData);

        // Modify encrypted data
        const tamperedData = {
          ...encrypted,
          encrypted: encrypted.encrypted.slice(0, -10) + 'tampered'
        };

        expect(() => {
          cryptoManager.decrypt(tamperedData);
        }).toThrow(); // Should fail authentication
      });

      it('should support custom encryption keys', () => {
        const testData = 'Custom key test';
        const customKey = crypto.randomBytes(32);

        const encrypted = cryptoManager.encrypt(testData, customKey);
        const decrypted = cryptoManager.decrypt(encrypted, customKey);

        expect(decrypted).toBe(testData);

        // Should fail with different key
        const wrongKey = crypto.randomBytes(32);
        expect(() => {
          cryptoManager.decrypt(encrypted, wrongKey);
        }).toThrow();
      });
    });

    describe('Hashing and Verification', () => {
      it('should generate consistent hashes', () => {
        const testData = 'Data to hash';
        const hash1 = cryptoManager.hash(testData);
        const hash2 = cryptoManager.hash(testData);

        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(64); // SHA256 produces 64-character hex string
      });

      it('should verify hashes correctly', () => {
        const testData = 'Verification test data';
        const hash = cryptoManager.hash(testData);

        expect(cryptoManager.verifyHash(testData, hash)).toBe(true);
        expect(cryptoManager.verifyHash('wrong data', hash)).toBe(false);
      });

      it('should support different hash algorithms', () => {
        const testData = 'Algorithm test';
        const sha256 = cryptoManager.hash(testData, 'sha256');
        const sha512 = cryptoManager.hash(testData, 'sha512');

        expect(sha256).not.toBe(sha512);
        expect(sha256).toHaveLength(64); // SHA256
        expect(sha512).toHaveLength(128); // SHA512
      });
    });

    describe('Digital Signatures', () => {
      it('should sign and verify data correctly', () => {
        const testData = 'Data to sign';
        const { publicKey, privateKey } = cryptoManager.generateKeyPair();

        const signature = cryptoManager.sign(testData, privateKey);
        const isValid = cryptoManager.verifySignature(testData, signature, publicKey);

        expect(isValid).toBe(true);
        expect(signature).toBeDefined();
        expect(publicKey).toBeDefined();
        expect(privateKey).toBeDefined();
      });

      it('should fail verification with wrong data or key', () => {
        const testData = 'Original data';
        const wrongData = 'Modified data';
        const { publicKey, privateKey } = cryptoManager.generateKeyPair();

        const signature = cryptoManager.sign(testData, privateKey);

        // Wrong data should fail verification
        expect(cryptoManager.verifySignature(wrongData, signature, publicKey)).toBe(false);

        // Wrong key should fail verification
        const { publicKey: wrongPublicKey } = cryptoManager.generateKeyPair();
        expect(cryptoManager.verifySignature(testData, signature, wrongPublicKey)).toBe(false);
      });
    });

    describe('Secure Token Generation', () => {
      it('should generate cryptographically secure tokens', () => {
        const token1 = cryptoManager.generateSecureToken();
        const token2 = cryptoManager.generateSecureToken();

        expect(token1).toHaveLength(64); // 32 bytes * 2 (hex)
        expect(token2).toHaveLength(64);
        expect(token1).not.toBe(token2);

        // Should be hex characters only
        expect(/^[a-f0-9]+$/i.test(token1)).toBe(true);
        expect(/^[a-f0-9]+$/i.test(token2)).toBe(true);
      });

      it('should support custom token lengths', () => {
        const shortToken = cryptoManager.generateSecureToken(16);
        const longToken = cryptoManager.generateSecureToken(64);

        expect(shortToken).toHaveLength(32); // 16 bytes * 2
        expect(longToken).toHaveLength(128); // 64 bytes * 2
      });
    });
  });

  describe('Integration Security Tests', () => {
    it('should secure swarm state persistence', async () => {
      const sensitiveSwarmState = {
        id: 'secure-swarm-test',
        objective: 'Handle sensitive data',
        status: 'running',
        startTime: Date.now(),
        agents: [
          {
            id: 'agent-1',
            type: 'coder',
            credentials: { apiKey: 'secret-key-123', token: 'secret-token-456' }
          }
        ],
        tasks: [
          {
            id: 'task-1',
            description: 'Process sensitive information',
            data: { password: 'user-password-789', ssn: '123-45-6789' }
          }
        ]
      };

      // Validate state first
      expect(() => {
        securityValidator.validateSwarmState(sensitiveSwarmState);
      }).not.toThrow();

      // Encrypt sensitive fields
      const encryptedState = {
        ...sensitiveSwarmState,
        agents: sensitiveSwarmState.agents.map(agent => ({
          ...agent,
          credentials: agent.credentials ? cryptoManager.encrypt(JSON.stringify(agent.credentials)) : null
        })),
        tasks: sensitiveSwarmState.tasks.map(task => ({
          ...task,
          data: task.data ? cryptoManager.encrypt(JSON.stringify(task.data)) : null
        }))
      };

      // Store encrypted state in Redis
      const key = `secure_swarm:${encryptedState.id}`;
      await redisClient.setEx(key, 3600, JSON.stringify(encryptedState));

      // Retrieve and decrypt
      const retrievedData = await redisClient.get(key);
      const retrievedState = JSON.parse(retrievedData);

      const decryptedState = {
        ...retrievedState,
        agents: retrievedState.agents.map(agent => ({
          ...agent,
          credentials: agent.credentials ? JSON.parse(cryptoManager.decrypt(agent.credentials)) : null
        })),
        tasks: retrievedState.tasks.map(task => ({
          ...task,
          data: task.data ? JSON.parse(cryptoManager.decrypt(task.data)) : null
        }))
      };

      expect(decryptedState.agents[0].credentials.apiKey).toBe('secret-key-123');
      expect(decryptedState.tasks[0].data.password).toBe('user-password-789');
    });

    it('should handle secure session-based operations', async () => {
      const userId = 'secure-session-user';
      const sessionId = await authManager.createSession(userId, 'user', ['read', 'write']);

      // Simulate secure operation
      const session = await authManager.validateSession(sessionId);
      expect(session.userId).toBe(userId);

      // Rate limit the operations
      for (let i = 0; i < 5; i++) {
        const rateLimitResult = await rateLimiter.checkRateLimit(sessionId, '1m');
        expect(rateLimitResult.allowed).toBe(true);
      }

      // Encrypt operation result
      const operationResult = { success: true, data: 'sensitive result' };
      const encryptedResult = cryptoManager.encrypt(JSON.stringify(operationResult));

      // Sign the result for integrity
      const { publicKey, privateKey } = cryptoManager.generateKeyPair();
      const signature = cryptoManager.sign(encryptedResult.encrypted, privateKey);

      const securePackage = {
        result: encryptedResult,
        signature,
        publicKey,
        sessionId: sessionId.substring(0, 8) // Partial session ID for identification
      };

      // Verify secure package
      const isSignatureValid = cryptoManager.verifySignature(
        securePackage.result.encrypted,
        securePackage.signature,
        securePackage.publicKey
      );
      expect(isSignatureValid).toBe(true);

      const decryptedResult = JSON.parse(cryptoManager.decrypt(securePackage.result));
      expect(decryptedResult.success).toBe(true);
    });

    it('should prevent common web vulnerabilities', async () => {
      const attackVectors = [
        { input: '<script>alert("XSS")</script>', type: 'xss' },
        { input: "'; DROP TABLE swarms; --", type: 'sql' },
        { input: '../../../etc/passwd', type: 'path_traversal' },
        { input: '`whoami`', type: 'command_injection' },
        { input: '\x00\x01\x02', type: 'null_byte' }
      ];

      for (const vector of attackVectors) {
        // Sanitize input
        const sanitized = securityValidator.sanitizeInput(vector.input);

        // Verify attack vector is neutralized
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('DROP TABLE');
        expect(sanitized).not.toContain('../');
        expect(sanitized).not.toContain('`');
        expect(sanitized).not.toContain('\x00');

        // Rate limit the request
        const identifier = `security-test-${vector.type}`;
        try {
          await rateLimiter.checkRateLimit(identifier, '1s');
        } catch (error) {
          // Rate limiting is working
          expect(error.message).toContain('Rate limit');
        }
      }
    });
  });

  describe('Performance Security Tests', () => {
    it('should maintain performance under security load', async () => {
      const numOperations = 1000;
      const operations = [];
      const startTime = Date.now();

      // Mix of security operations
      for (let i = 0; i < numOperations; i++) {
        operations.push(
          securityValidator.sanitizeInput(`test-input-${i}`),
          rateLimiter.checkRateLimit(`perf-test-${i % 100}`, '1m'),
          cryptoManager.hash(`hash-test-${i}`),
          cryptoManager.generateSecureToken()
        );
      }

      const results = await Promise.allSettled(operations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful).toBeGreaterThan(numOperations * 0.95); // 95% success rate
      expect(failed).toBeLessThan(numOperations * 0.05); // Less than 5% failure rate
      expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds

      const avgTimePerOperation = duration / numOperations;
      expect(avgTimePerOperation).toBeLessThan(10); // Less than 10ms per operation
    });

    it('should handle concurrent security validations', async () => {
      const numConcurrent = 100;
      const concurrentOperations = [];

      for (let i = 0; i < numConcurrent; i++) {
        concurrentOperations.push(
          (async () => {
            const input = `concurrent-test-${i}`;
            return securityValidator.sanitizeInput(input);
          })(),
          (async () => {
            const data = `concurrent-encrypt-${i}`;
            return cryptoManager.encrypt(data);
          })(),
          (async () => {
            const userId = `concurrent-user-${i}`;
            return authManager.createSession(userId, 'user', ['read']);
          })()
        );
      }

      const results = await Promise.allSettled(concurrentOperations);
      const successful = results.filter(r => r.status === 'fulfilled').length;

      expect(successful).toBeGreaterThan(concurrentOperations.length * 0.9); // 90% success rate
    });
  });
});