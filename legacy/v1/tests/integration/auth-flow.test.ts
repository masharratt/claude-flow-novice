/**
 * Authentication Flow Integration Tests
 *
 * Tests for Sprint 2.2:
 * - User authentication flow (login → JWT → protected endpoint)
 * - API key authentication flow
 * - Token refresh flow (logout old token, get new token)
 * - Role-based access (admin vs user endpoints)
 *
 * @module tests/integration/auth-flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService, AuthConfig, User, UserRole } from '../../src/api/auth-service.js';
import { Logger } from '../../src/core/logger.js';

describe('Authentication Flow Integration Tests', () => {
  let authService: AuthService;
  let testLogger: any;
  let testUser: User;

  beforeEach(async () => { try {
    // Create test logger
    testLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    // Create auth service with test config
    const config: AuthConfig = {
      jwtSecret: 'test-secret-key-for-jwt-signing',
      jwtExpiresIn: '24h',
      apiKeyLength: 32,
      sessionTimeout: 3600000, // 1 hour
      maxLoginAttempts: 5,
      lockoutDuration: 900000, // 15 minutes
      requireMFA: false,
    };

    authService = new AuthService(config, testLogger);

    // Create test user
    testUser = await authService.createUser({
      email: 'test@example.com',
      password: 'SecurePassword123!',
      role: 'developer' as UserRole,
      isActive: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('User Authentication Flow', () => {
    it('should authenticate user with valid credentials and return JWT', async () => { try {
      // Act
      const result = await authService.authenticateUser('test@example.com', 'SecurePassword123!', {
        userAgent: 'Mozilla/5.0',
        ip: '127.0.0.1',
        device: 'Desktop',
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('developer');
      expect(result.token).toBeDefined();
      expect(result.token).toContain('.'); // JWT format
      expect(result.session).toBeDefined();
      expect(result.session.isActive).toBe(true);
      expect(testLogger.info).toHaveBeenCalledWith(
        'User authenticated successfully',
        expect.objectContaining({
          userId: testUser.id,
          email: 'test@example.com',
        }),
      );
    });

    it('should verify JWT and retrieve user data', async () => { try {
      // Arrange
      const authResult = await authService.authenticateUser('test@example.com', 'SecurePassword123!');
      const token = authResult.token;

      // Act
      const verifyResult = await authService.verifyJWT(token);

      // Assert
      expect(verifyResult).toBeDefined();
      expect(verifyResult.user).toBeDefined();
      expect(verifyResult.user.id).toBe(testUser.id);
      expect(verifyResult.user.email).toBe('test@example.com');
      expect(verifyResult.session).toBeDefined();
      expect(verifyResult.session.isActive).toBe(true);
    });

    it('should reject invalid credentials', async () => { try {
      // Act & Assert
      await expect(
        authService.authenticateUser('test@example.com', 'WrongPassword')
      ).rejects.toThrow('Invalid credentials');

      expect(testLogger.error).toHaveBeenCalledWith(
        'Authentication failed',
        expect.objectContaining({
          email: 'test@example.com',
        }),
      );
    });

    it('should reject authentication for non-existent user', async () => { try {
      // Act & Assert
      await expect(
        authService.authenticateUser('nonexistent@example.com', 'password')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should reject authentication for inactive user', async () => { try {
      // Arrange
      const inactiveUser = await authService.createUser({
        email: 'inactive@example.com',
        password: 'password123',
        role: 'viewer',
        isActive: false,
      });

      // Act & Assert
      await expect(
        authService.authenticateUser('inactive@example.com', 'password123')
      ).rejects.toThrow('Account is disabled');
    });

    it('should handle rate limiting after multiple failed attempts', async () => { try {
      // Arrange - Attempt login 5 times with wrong password
      for (let i = 0; i < 5; i++) {
        try {
          await authService.authenticateUser('test@example.com', 'WrongPassword');
        } catch (error) {
          // Expected to fail
        }
      }

      // Act & Assert - 6th attempt should be rate limited
      await expect(
        authService.authenticateUser('test@example.com', 'WrongPassword')
      ).rejects.toThrow('Too many failed login attempts');
    });

    it('should reset login attempts after successful authentication', async () => { try {
      // Arrange - Failed attempts
      for (let i = 0; i < 3; i++) {
        try {
          await authService.authenticateUser('test@example.com', 'WrongPassword');
        } catch (error) {
          // Expected to fail
        }
      }

      // Act - Successful login
      const result = await authService.authenticateUser('test@example.com', 'SecurePassword123!');

      // Assert
      expect(result.user.loginAttempts).toBe(0);
      expect(result.user.lockedUntil).toBeUndefined();
    });
  });

  describe('API Key Authentication Flow', () => {
    it('should create API key for user', async () => { try {
      // Act
      const result = await authService.createApiKey(testUser.id, {
        name: 'Test API Key',
        permissions: ['swarm.read', 'agent.read'],
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey.name).toBe('Test API Key');
      expect(result.apiKey.permissions).toContain('swarm.read');
      expect(result.key).toBeDefined();
      expect(result.key.length).toBeGreaterThan(20);
      expect(testLogger.info).toHaveBeenCalledWith(
        'API key created',
        expect.objectContaining({
          userId: testUser.id,
          keyName: 'Test API Key',
        }),
      );
    });

    it('should authenticate with valid API key', async () => { try {
      // Arrange
      const { key } = await authService.createApiKey(testUser.id, {
        name: 'Test API Key',
      });

      // Act
      const result = await authService.authenticateApiKey(key);

      // Assert
      expect(result).toBeDefined();
      expect(result.key).toBeDefined();
      expect(result.key.name).toBe('Test API Key');
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe(testUser.id);
    });

    it('should reject invalid API key', async () => { try {
      // Act & Assert
      await expect(
        authService.authenticateApiKey('invalid-api-key-12345')
      ).rejects.toThrow('Invalid API key');
    });

    it('should reject disabled API key', async () => { try {
      // Arrange
      const { key, apiKey } = await authService.createApiKey(testUser.id, {
        name: 'Test API Key',
      });
      await authService.revokeApiKey(apiKey.id);

      // Act & Assert
      await expect(
        authService.authenticateApiKey(key)
      ).rejects.toThrow('API key is disabled');
    });

    it('should reject expired API key', async () => { try {
      // Arrange
      const expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago
      const { key } = await authService.createApiKey(testUser.id, {
        name: 'Test API Key',
        expiresAt,
      });

      // Act & Assert
      await expect(
        authService.authenticateApiKey(key)
      ).rejects.toThrow('API key has expired');
    });

    it('should update lastUsed timestamp on API key authentication', async () => { try {
      // Arrange
      const { key, apiKey } = await authService.createApiKey(testUser.id, {
        name: 'Test API Key',
      });
      const originalLastUsed = apiKey.lastUsed;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act
      await authService.authenticateApiKey(key);

      // Assert
      expect(apiKey.lastUsed).toBeDefined();
      if (originalLastUsed) {
        expect(apiKey.lastUsed!.getTime()).toBeGreaterThan(originalLastUsed.getTime());
      }
    });
  });

  describe('Token Refresh Flow', () => {
    it('should invalidate old session and create new token', async () => { try {
      // Arrange - First authentication
      const firstAuth = await authService.authenticateUser('test@example.com', 'SecurePassword123!');
      const firstToken = firstAuth.token;
      const firstSession = firstAuth.session;

      // Act - Logout (invalidate session)
      await authService.invalidateSession(firstSession.id);

      // Assert - Old token should be invalid
      await expect(authService.verifyJWT(firstToken)).rejects.toThrow();

      // Act - Create new session
      const secondAuth = await authService.authenticateUser('test@example.com', 'SecurePassword123!');

      // Assert - New token should be valid
      expect(secondAuth.token).toBeDefined();
      expect(secondAuth.token).not.toBe(firstToken);
      const verifyResult = await authService.verifyJWT(secondAuth.token);
      expect(verifyResult.user.id).toBe(testUser.id);
    });

    it('should reject expired JWT token', async () => { try {
      // Arrange - Create auth service with very short expiration
      const shortExpiryConfig: AuthConfig = {
        jwtSecret: 'test-secret',
        jwtExpiresIn: '1ms', // Expires immediately
        sessionTimeout: 1, // 1ms session
      };
      const shortExpiryAuth = new AuthService(shortExpiryConfig, testLogger);
      const shortUser = await shortExpiryAuth.createUser({
        email: 'short@example.com',
        password: 'password',
        role: 'viewer',
      });
      const authResult = await shortExpiryAuth.authenticateUser('short@example.com', 'password');

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act & Assert
      await expect(
        shortExpiryAuth.verifyJWT(authResult.token)
      ).rejects.toThrow();
    });

    it('should reject JWT with tampered signature', async () => { try {
      // Arrange
      const authResult = await authService.authenticateUser('test@example.com', 'SecurePassword123!');
      const token = authResult.token;

      // Tamper with the token signature
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.tampered-signature`;

      // Act & Assert
      await expect(authService.verifyJWT(tamperedToken)).rejects.toThrow();
    });
  });

  describe('Role-Based Access Control', () => {
    let adminUser: User;
    let operatorUser: User;
    let viewerUser: User;

    beforeEach(async () => { try {
      adminUser = await authService.createUser({
        email: 'admin@example.com',
        password: 'AdminPassword123!',
        role: 'admin',
      });

      operatorUser = await authService.createUser({
        email: 'operator@example.com',
        password: 'OperatorPassword123!',
        role: 'operator',
      });

      viewerUser = await authService.createUser({
        email: 'viewer@example.com',
        password: 'ViewerPassword123!',
        role: 'viewer',
      });
    });

    it('should grant admin full permissions', async () => { try {
      // Act
      const hasSystemAdmin = authService.hasPermission(adminUser, 'system.admin');
      const hasSwarmCreate = authService.hasPermission(adminUser, 'swarm.create');
      const hasAgentTerminate = authService.hasPermission(adminUser, 'agent.terminate');

      // Assert
      expect(hasSystemAdmin).toBe(true);
      expect(hasSwarmCreate).toBe(true);
      expect(hasAgentTerminate).toBe(true);
    });

    it('should grant operator limited permissions', async () => { try {
      // Act
      const hasSwarmCreate = authService.hasPermission(operatorUser, 'swarm.create');
      const hasAgentSpawn = authService.hasPermission(operatorUser, 'agent.spawn');
      const hasSystemAdmin = authService.hasPermission(operatorUser, 'system.admin');

      // Assert
      expect(hasSwarmCreate).toBe(true);
      expect(hasAgentSpawn).toBe(true);
      expect(hasSystemAdmin).toBe(false);
    });

    it('should grant developer task management permissions', async () => { try {
      // Act
      const hasTaskCreate = authService.hasPermission(testUser, 'task.create');
      const hasSwarmRead = authService.hasPermission(testUser, 'swarm.read');
      const hasSwarmDelete = authService.hasPermission(testUser, 'swarm.delete');

      // Assert
      expect(hasTaskCreate).toBe(true);
      expect(hasSwarmRead).toBe(true);
      expect(hasSwarmDelete).toBe(false);
    });

    it('should grant viewer only read permissions', async () => { try {
      // Act
      const hasSwarmRead = authService.hasPermission(viewerUser, 'swarm.read');
      const hasMetricsRead = authService.hasPermission(viewerUser, 'metrics.read');
      const hasTaskCreate = authService.hasPermission(viewerUser, 'task.create');

      // Assert
      expect(hasSwarmRead).toBe(true);
      expect(hasMetricsRead).toBe(true);
      expect(hasTaskCreate).toBe(false);
    });

    it('should authenticate users with different roles independently', async () => { try {
      // Act
      const adminAuth = await authService.authenticateUser('admin@example.com', 'AdminPassword123!');
      const viewerAuth = await authService.authenticateUser('viewer@example.com', 'ViewerPassword123!');

      // Assert
      expect(adminAuth.user.role).toBe('admin');
      expect(viewerAuth.user.role).toBe('viewer');

      // Verify tokens are different
      expect(adminAuth.token).not.toBe(viewerAuth.token);

      // Verify both tokens are valid
      const adminVerify = await authService.verifyJWT(adminAuth.token);
      const viewerVerify = await authService.verifyJWT(viewerAuth.token);

      expect(adminVerify.user.id).toBe(adminUser.id);
      expect(viewerVerify.user.id).toBe(viewerUser.id);
    });
  });

  describe('Session Management', () => {
    it('should track client information in session', async () => { try {
      // Arrange
      const clientInfo = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ip: '192.168.1.100',
        device: 'Desktop Chrome',
      };

      // Act
      const result = await authService.authenticateUser('test@example.com', 'SecurePassword123!', clientInfo);

      // Assert
      expect(result.session.clientInfo).toEqual(clientInfo);
    });

    it('should update session timestamp on token verification', async () => { try {
      // Arrange
      const authResult = await authService.authenticateUser('test@example.com', 'SecurePassword123!');
      const originalUpdatedAt = authResult.session.updatedAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act
      await authService.verifyJWT(authResult.token);

      // Assert
      expect(authResult.session.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should cleanup expired sessions', async () => { try {
      // Arrange - Create sessions with very short timeout
      const shortSessionConfig: AuthConfig = {
        jwtSecret: 'test-secret',
        sessionTimeout: 1, // 1ms
      };
      const shortSessionAuth = new AuthService(shortSessionConfig, testLogger);
      const user = await shortSessionAuth.createUser({
        email: 'session@example.com',
        password: 'password',
        role: 'viewer',
      });
      await shortSessionAuth.authenticateUser('session@example.com', 'password');

      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act
      await shortSessionAuth.cleanupSessions();

      // Assert
      expect(testLogger.info).toHaveBeenCalledWith(
        'Cleaned up expired sessions',
        expect.objectContaining({
          count: expect.any(Number),
        }),
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing JWT payload fields', async () => { try {
      // Arrange - Create malformed token
      const malformedToken = 'invalid.token.format';

      // Act & Assert
      await expect(authService.verifyJWT(malformedToken)).rejects.toThrow();
    });

    it('should handle concurrent authentication requests', async () => { try {
      // Act - Multiple concurrent authentications
      const promises = Array.from({ length: 10 }, () =>
        authService.authenticateUser('test@example.com', 'SecurePassword123!')
      );

      const results = await Promise.all(promises);

      // Assert - All should succeed with valid tokens
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.token).toBeDefined();
        expect(result.session).toBeDefined();
      });

      // All sessions should be unique
      const sessionIds = results.map(r => r.session.id);
      const uniqueSessionIds = new Set(sessionIds);
      expect(uniqueSessionIds.size).toBe(10);
    });

    it('should handle special characters in email', async () => { try {
      // Arrange
      const specialUser = await authService.createUser({
        email: 'test+tag@example.com',
        password: 'password',
        role: 'viewer',
      });

      // Act
      const result = await authService.authenticateUser('test+tag@example.com', 'password');

      // Assert
      expect(result.user.email).toBe('test+tag@example.com');
    });

    it('should prevent duplicate email registration', async () => { try {
      // Act & Assert
      await expect(
        authService.createUser({
          email: 'test@example.com', // Already exists
          password: 'password',
          role: 'viewer',
        })
      ).rejects.toThrow('Email already exists');
    });
  });
});
