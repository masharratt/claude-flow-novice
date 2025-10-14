/**
 * Secure Logger Tests - VULN-005 Mitigation Validation
 *
 * Tests secure error logging to prevent information disclosure (CVSS 5.3)
 *
 * Test Coverage:
 * 1. File path sanitization
 * 2. Credential/secret redaction
 * 3. Stack trace sanitization and depth limiting
 * 4. Structured security audit logging
 * 5. Rate limiting functionality
 * 6. Object sanitization (recursive)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecureLogger, createSecureLogger } from '../../src/security/secure-logger.js';

describe('SecureLogger - VULN-005 Mitigation', () => {
  let logger;

  beforeEach(() => {
    logger = new SecureLogger('test-component', {
      enableDebug: true,
      enableRateLimiting: false // Disable for testing
    });
  });

  describe('File Path Sanitization', () => {
    it('should redact absolute Unix paths', () => {
      const input = '/mnt/c/Users/username/project/file.js contains error';
      const sanitized = logger.sanitize(input);

      expect(sanitized).not.toContain('/mnt/c/Users/username');
      expect(sanitized).toContain('[USER_DIR]');
    });

    it('should redact absolute home paths', () => {
      const input = '/home/username/project/file.js contains error';
      const sanitized = logger.sanitize(input);

      expect(sanitized).not.toContain('/home/username');
      expect(sanitized).toContain('[USER_DIR]');
    });

    it('should redact Windows paths', () => {
      const input = 'C:\\Users\\username\\project\\file.js contains error';
      const sanitized = logger.sanitize(input);

      expect(sanitized).not.toContain('C:\\Users\\username');
      expect(sanitized).toContain('[USER_DIR]');
    });

    it('should redact nested file paths', () => {
      const input = '/app/src/components/auth/login.js line 42';
      const sanitized = logger.sanitize(input);

      expect(sanitized).toContain('[PATH]');
      expect(sanitized).not.toContain('/app/src/components');
    });
  });

  describe('Credential and Secret Redaction', () => {
    it('should redact password fields', () => {
      const input = 'password=secret123 in authentication';
      const sanitized = logger.sanitize(input);

      expect(sanitized).not.toContain('secret123');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should redact API keys', () => {
      const input = 'api_key=abc123xyz in request';
      const sanitized = logger.sanitize(input);

      expect(sanitized).not.toContain('abc123xyz');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should redact secret tokens', () => {
      const input = 'secret=mysecrettoken for auth';
      const sanitized = logger.sanitize(input);

      expect(sanitized).not.toContain('mysecrettoken');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should redact bearer tokens', () => {
      const input = 'Authorization: bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const sanitized = logger.sanitize(input);

      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should redact authorization headers', () => {
      const input = 'authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=';
      const sanitized = logger.sanitize(input);

      expect(sanitized).not.toContain('dXNlcm5hbWU6cGFzc3dvcmQ=');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should redact connection strings', () => {
      const input = 'mongodb://user:pass@localhost:27017/db';
      const sanitized = logger.sanitize(input);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('user:pass@localhost');
    });
  });

  describe('Stack Trace Sanitization', () => {
    it('should sanitize error stack traces', () => {
      const error = new Error('Test error with /home/user/project/file.js:42');
      error.stack = `Error: Test error
        at /home/user/project/file.js:42:15
        at /home/user/project/handler.js:10:5
        at /home/user/node_modules/lib.js:100:20`;

      const sanitized = logger.sanitizeError(error);

      expect(sanitized.stack).not.toContain('/home/user/project');
      expect(sanitized.stack).toContain('[USER_DIR]');
    });

    it('should limit stack trace depth', () => {
      const error = new Error('Deep stack error');
      error.stack = Array.from({ length: 20 }, (_, i) =>
        `  at someFunction${i} (/path/file${i}.js:${i}:${i})`
      ).join('\n');

      const sanitized = logger.sanitizeError(error);
      const stackLines = sanitized.stack.split('\n');

      expect(stackLines.length).toBeLessThanOrEqual(5);
    });

    it('should handle non-Error objects gracefully', () => {
      const notAnError = { message: 'Not an error', path: '/home/user/file.js' };
      const sanitized = logger.sanitizeError(notAnError);

      expect(sanitized).toHaveProperty('message');
      expect(sanitized).toHaveProperty('type');
      expect(sanitized).toHaveProperty('timestamp');
      expect(sanitized.message).toContain('[USER_DIR]');
    });
  });

  describe('Object Sanitization (Recursive)', () => {
    it('should sanitize nested objects', () => {
      const data = {
        user: 'test',
        config: {
          password: 'secret123',
          apiKey: 'xyz789',
          database: {
            connectionString: 'mongodb://user:pass@localhost:27017/db'
          }
        }
      };

      const sanitized = logger.sanitizeObject(data);

      expect(sanitized.config.password).toBe('[REDACTED]');
      expect(sanitized.config.apiKey).toBe('[REDACTED]');
      expect(sanitized.config.database.connectionString).toContain('[REDACTED]');
    });

    it('should sanitize arrays', () => {
      const data = {
        paths: ['/home/user/file1.js', '/home/user/file2.js'],
        secrets: ['secret1', 'secret2']
      };

      const sanitized = logger.sanitizeObject(data);

      expect(sanitized.paths[0]).toContain('[USER_DIR]');
      expect(sanitized.paths[1]).toContain('[USER_DIR]');
    });

    it('should prevent deep recursion attacks', () => {
      const circular = { a: 1 };
      circular.self = circular;

      // Should not throw or hang
      const sanitized = logger.sanitizeObject(circular);
      expect(sanitized).toBeDefined();
    });

    it('should redact keys containing sensitive keywords', () => {
      const data = {
        username: 'testuser',
        password: 'mysecret',
        apiKey: 'abc123',
        publicKey: 'should-be-visible',
        secretToken: 'xyz789'
      };

      const sanitized = logger.sanitizeObject(data);

      expect(sanitized.username).toBe('testuser');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.publicKey).toBe('should-be-visible'); // publicKey should not be redacted
      expect(sanitized.secretToken).toBe('[REDACTED]');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits when enabled', () => {
      const rateLimitedLogger = new SecureLogger('rate-test', {
        enableRateLimiting: true,
        rateLimitMax: 5,
        rateLimitWindow: 1000
      });

      // Log 10 messages quickly
      for (let i = 0; i < 10; i++) {
        rateLimitedLogger.info(`Message ${i}`);
      }

      const stats = rateLimitedLogger.getStats();
      expect(stats.messagesLogged).toBeLessThanOrEqual(5);
    });

    it('should reset rate limit window after expiration', async () => {
      const rateLimitedLogger = new SecureLogger('rate-test', {
        enableRateLimiting: true,
        rateLimitMax: 2,
        rateLimitWindow: 100
      });

      // Log 2 messages (should succeed)
      rateLimitedLogger.info('Message 1');
      rateLimitedLogger.info('Message 2');

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Log 2 more messages (should succeed after reset)
      rateLimitedLogger.info('Message 3');
      rateLimitedLogger.info('Message 4');

      const stats = rateLimitedLogger.getStats();
      expect(stats.messagesLogged).toBeGreaterThanOrEqual(3);
    });

    it('should track suppressed message count', () => {
      const rateLimitedLogger = new SecureLogger('rate-test', {
        enableRateLimiting: true,
        rateLimitMax: 2,
        rateLimitWindow: 1000
      });

      // Attempt to log 5 messages
      for (let i = 0; i < 5; i++) {
        rateLimitedLogger.info(`Message ${i}`);
      }

      const stats = rateLimitedLogger.getStats();
      expect(stats.rateLimitState.suppressedCount).toBeGreaterThan(0);
    });
  });

  describe('Structured Security Audit Logging', () => {
    it('should log security events with structured format', () => {
      const events = [];
      const originalLog = console.log;
      console.log = (msg) => events.push(msg);

      logger.security('authentication_failed', {
        userId: 'user123',
        ip: '192.168.1.1',
        reason: 'invalid_password'
      });

      console.log = originalLog;

      expect(events.length).toBeGreaterThan(0);
      const loggedEvent = events[0];
      expect(loggedEvent).toContain('SECURITY');
      expect(loggedEvent).toContain('authentication_failed');
    });

    it('should sanitize security event data', () => {
      const events = [];
      const originalLog = console.log;
      console.log = (msg) => events.push(msg);

      logger.security('data_breach_attempt', {
        file: '/home/user/sensitive.db',
        credentials: 'password=secret123'
      });

      console.log = originalLog;

      const loggedEvent = events[0];
      expect(loggedEvent).not.toContain('/home/user/sensitive.db');
      expect(loggedEvent).not.toContain('secret123');
      expect(loggedEvent).toContain('[USER_DIR]');
      expect(loggedEvent).toContain('[REDACTED]');
    });

    it('should track security event statistics', () => {
      logger.security('event1', { data: 'test' });
      logger.security('event2', { data: 'test' });

      const stats = logger.getStats();
      expect(stats.securityEventsLogged).toBe(2);
    });
  });

  describe('Logger Statistics', () => {
    it('should track messages logged', () => {
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      const stats = logger.getStats();
      expect(stats.messagesLogged).toBeGreaterThanOrEqual(3);
    });

    it('should track sensitive data redactions', () => {
      logger.sanitize('password=secret api_key=xyz');

      const stats = logger.getStats();
      expect(stats.sensitiveDataRedacted).toBeGreaterThan(0);
    });

    it('should allow statistics reset', () => {
      logger.info('Message');
      logger.resetStats();

      const stats = logger.getStats();
      expect(stats.messagesLogged).toBe(0);
      expect(stats.sensitiveDataRedacted).toBe(0);
    });
  });

  describe('Factory Function', () => {
    it('should create logger with createSecureLogger', () => {
      const factoryLogger = createSecureLogger('factory-test');

      expect(factoryLogger).toBeInstanceOf(SecureLogger);
      expect(factoryLogger.componentId).toBe('factory-test');
    });

    it('should accept options in factory function', () => {
      const factoryLogger = createSecureLogger('factory-test', {
        enableDebug: true,
        maxStackDepth: 10
      });

      expect(factoryLogger.options.enableDebug).toBe(true);
      expect(factoryLogger.options.maxStackDepth).toBe(10);
    });
  });

  describe('Integration Tests', () => {
    it('should handle real-world error scenario', () => {
      const realError = new Error('Database connection failed');
      realError.stack = `Error: Database connection failed
        at Database.connect (/home/user/project/src/database.js:42:15)
        at handler (/home/user/project/src/api/handler.js:10:5)
        password=mysecret api_key=xyz123`;

      const sanitized = logger.sanitizeError(realError);

      expect(sanitized.message).not.toContain('/home/user/project');
      expect(sanitized.stack).not.toContain('password=mysecret');
      expect(sanitized.stack).not.toContain('api_key=xyz123');
      expect(sanitized.stack).toContain('[REDACTED]');
    });

    it('should sanitize complex nested error data', () => {
      const complexData = {
        error: 'Authentication failed',
        user: {
          username: 'testuser',
          password: 'secret123',
          email: 'user@example.com'
        },
        config: {
          database: 'mongodb://admin:pass@localhost:27017/db',
          apiKey: 'xyz-secret-key',
          paths: ['/home/user/app/config.js', '/home/user/app/db.js']
        }
      };

      const sanitized = logger.sanitizeObject(complexData);

      expect(sanitized.user.password).toBe('[REDACTED]');
      expect(sanitized.user.email).toBe('[EMAIL_REDACTED]');
      expect(sanitized.config.database).toContain('[REDACTED]');
      expect(sanitized.config.apiKey).toBe('[REDACTED]');
      expect(sanitized.config.paths[0]).toContain('[USER_DIR]');
    });
  });
});
