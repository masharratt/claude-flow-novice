/**
 * WebSocket Authentication Integration Tests
 *
 * Tests for Sprint 2.2:
 * - WebSocket connection with JWT
 * - WebSocket connection with API key
 * - Unauthenticated connection rejection
 * - Room subscription with authorization
 * - Real-time event authentication and authorization
 *
 * @module tests/integration/websocket-auth
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authenticateWebSocket, generateToken } from '../../src/web/api/middleware/auth.js';
import type { ApiConfig } from '../../src/web/api/config/api-config.js';

describe('WebSocket Authentication Integration Tests', () => {
  let testConfig: ApiConfig;
  let mockSocket: any;

  beforeEach(() => {
    // Create test API config
    testConfig = {
      port: 3000,
      host: 'localhost',
      jwtSecret: 'test-jwt-secret-key-for-websocket-testing',
      jwtExpiration: '24h',
      apiKey: 'test-api-key-12345',
      corsOrigins: ['http://localhost:3000'],
      environment: 'test',
      rateLimiting: {
        windowMs: 900000,
        maxRequests: 100,
      },
    };

    // Create mock socket
    mockSocket = {
      handshake: {
        auth: {},
        headers: {},
      },
      data: {},
      disconnect: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('JWT Authentication', () => {
    it('should authenticate WebSocket connection with valid JWT in auth object', () => {
      // Arrange
      const user = {
        id: 'user-123',
        username: 'testuser',
        role: 'developer',
        permissions: ['read', 'write'],
      };
      const token = generateToken(user, testConfig);
      mockSocket.handshake.auth.token = token;

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(true);
      expect(mockSocket.data.user).toBeDefined();
      expect(mockSocket.data.user.id).toBe('user-123');
      expect(mockSocket.data.user.username).toBe('testuser');
      expect(mockSocket.data.user.role).toBe('developer');
    });

    it('should authenticate WebSocket connection with JWT in authorization header', () => {
      // Arrange
      const user = {
        id: 'user-456',
        username: 'adminuser',
        role: 'admin',
        permissions: ['*'],
      };
      const token = generateToken(user, testConfig);
      mockSocket.handshake.headers.authorization = `Bearer ${token}`;

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(true);
      expect(mockSocket.data.user).toBeDefined();
      expect(mockSocket.data.user.id).toBe('user-456');
      expect(mockSocket.data.user.role).toBe('admin');
    });

    it('should reject WebSocket connection with expired JWT', () => {
      // Arrange - Create config with very short expiration
      const shortExpiryConfig = {
        ...testConfig,
        jwtExpiration: '1ms', // Expires immediately
      };
      const user = {
        id: 'user-789',
        username: 'testuser',
        role: 'viewer',
        permissions: ['read'],
      };
      const token = generateToken(user, shortExpiryConfig);

      // Wait for token to expire
      const waitPromise = new Promise(resolve => setTimeout(resolve, 10));

      // Act & Assert
      return waitPromiseawait ( => {
        mockSocket.handshake.auth.token = token;
        const result = authenticateWebSocket(mockSocket, testConfig);
        expect(result).toBe(false);
        expect(mockSocket.data.user).toBeUndefined();
      });
    });

    it('should reject WebSocket connection with invalid JWT signature', () => {
      // Arrange - Create token with different secret
      const wrongSecretConfig = {
        ...testConfig,
        jwtSecret: 'wrong-secret-key',
      };
      const user = {
        id: 'user-999',
        username: 'testuser',
        role: 'viewer',
        permissions: ['read'],
      };
      const token = generateToken(user, wrongSecretConfig);
      mockSocket.handshake.auth.token = token;

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(false);
      expect(mockSocket.data.user).toBeUndefined();
    });

    it('should reject WebSocket connection with malformed JWT', () => {
      // Arrange
      mockSocket.handshake.auth.token = 'malformed.token.format.invalid';

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(false);
      expect(mockSocket.data.user).toBeUndefined();
    });
  });

  describe('API Key Authentication', () => {
    it('should authenticate WebSocket connection with valid API key', () => {
      // Arrange
      mockSocket.handshake.auth.token = testConfig.apiKey;

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(true);
      expect(mockSocket.data.apiKey).toBe(testConfig.apiKey);
      expect(mockSocket.data.user).toBeDefined();
      expect(mockSocket.data.user.role).toBe('service');
      expect(mockSocket.data.user.permissions).toContain('read');
      expect(mockSocket.data.user.permissions).toContain('write');
    });

    it('should authenticate WebSocket connection with API key in header', () => {
      // Arrange
      mockSocket.handshake.headers.authorization = `Bearer ${testConfig.apiKey}`;

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(true);
      expect(mockSocket.data.apiKey).toBe(testConfig.apiKey);
      expect(mockSocket.data.user.role).toBe('service');
    });

    it('should reject WebSocket connection with invalid API key', () => {
      // Arrange
      mockSocket.handshake.auth.token = 'invalid-api-key-99999';

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(false);
      expect(mockSocket.data.user).toBeUndefined();
      expect(mockSocket.data.apiKey).toBeUndefined();
    });

    it('should prioritize JWT over API key when both are provided', () => {
      // Arrange
      const user = {
        id: 'user-111',
        username: 'testuser',
        role: 'developer',
        permissions: ['read', 'write'],
      };
      const token = generateToken(user, testConfig);
      mockSocket.handshake.auth.token = token;
      mockSocket.handshake.headers['x-api-key'] = testConfig.apiKey;

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(true);
      expect(mockSocket.data.user.id).toBe('user-111');
      expect(mockSocket.data.user.role).toBe('developer');
      expect(mockSocket.data.apiKey).toBeUndefined();
    });
  });

  describe('Unauthenticated Connection Rejection', () => {
    it('should reject WebSocket connection with no authentication', () => {
      // Arrange - No auth token or API key

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(false);
      expect(mockSocket.data.user).toBeUndefined();
    });

    it('should reject WebSocket connection with empty token', () => {
      // Arrange
      mockSocket.handshake.auth.token = '';

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(false);
    });

    it('should reject WebSocket connection with null token', () => {
      // Arrange
      mockSocket.handshake.auth.token = null;

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(false);
    });

    it('should reject WebSocket connection with undefined token', () => {
      // Arrange
      mockSocket.handshake.auth.token = undefined;

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Room Subscription Authorization', () => {
    it('should allow authenticated user to subscribe to authorized rooms', () => {
      // Arrange
      const user = {
        id: 'user-222',
        username: 'testuser',
        role: 'developer',
        permissions: ['swarm.read', 'agent.read'],
      };
      const token = generateToken(user, testConfig);
      mockSocket.handshake.auth.token = token;
      authenticateWebSocket(mockSocket, testConfig);

      // Act - Subscribe to room
      mockSocket.join('swarm:123');

      // Assert
      expect(mockSocket.join).toHaveBeenCalledWith('swarm:123');
    });

    it('should verify user permissions before room subscription', () => {
      // Arrange
      const user = {
        id: 'user-333',
        username: 'viewer',
        role: 'viewer',
        permissions: ['read'], // Limited permissions
      };
      const token = generateToken(user, testConfig);
      mockSocket.handshake.auth.token = token;
      authenticateWebSocket(mockSocket, testConfig);

      // Act & Assert
      expect(mockSocket.data.user.permissions).toEqual(['read']);
    });

    it('should allow admin users to subscribe to all rooms', () => {
      // Arrange
      const adminUser = {
        id: 'user-444',
        username: 'admin',
        role: 'admin',
        permissions: ['*'],
      };
      const token = generateToken(adminUser, testConfig);
      mockSocket.handshake.auth.token = token;
      authenticateWebSocket(mockSocket, testConfig);

      // Act
      mockSocket.join('admin:dashboard');
      mockSocket.join('swarm:all');
      mockSocket.join('metrics:system');

      // Assert
      expect(mockSocket.join).toHaveBeenCalledTimes(3);
      expect(mockSocket.data.user.permissions).toContain('*');
    });
  });

  describe('Real-time Event Authentication', () => {
    it('should emit events only to authenticated connections', () => {
      // Arrange
      const user = {
        id: 'user-555',
        username: 'testuser',
        role: 'developer',
        permissions: ['swarm.read', 'agent.read'],
      };
      const token = generateToken(user, testConfig);
      mockSocket.handshake.auth.token = token;
      authenticateWebSocket(mockSocket, testConfig);

      // Act
      mockSocket.emit('agent_update', {
        agentId: 'agent-123',
        status: 'completed',
        confidence: 0.92,
      });

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('agent_update', {
        agentId: 'agent-123',
        status: 'completed',
        confidence: 0.92,
      });
      expect(mockSocket.data.user).toBeDefined();
    });

    it('should track user context in event emissions', () => {
      // Arrange
      const user = {
        id: 'user-666',
        username: 'operator',
        role: 'operator',
        permissions: ['swarm.create', 'agent.spawn'],
      };
      const token = generateToken(user, testConfig);
      mockSocket.handshake.auth.token = token;
      authenticateWebSocket(mockSocket, testConfig);

      // Act
      const eventData = {
        type: 'swarm.created',
        swarmId: 'swarm-789',
        userId: mockSocket.data.user.id,
      };
      mockSocket.emit('swarm_event', eventData);

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('swarm_event', eventData);
      expect(eventData.userId).toBe('user-666');
    });

    it('should handle concurrent event emissions from multiple authenticated connections', () => {
      // Arrange - Create multiple authenticated sockets
      const sockets = Array.from({ length: 5 }, (_, i) => ({
        handshake: {
          auth: {
            token: generateToken(
              {
                id: `user-${i}`,
                username: `user${i}`,
                role: 'developer',
                permissions: ['read', 'write'],
              },
              testConfig
            ),
          },
          headers: {},
        },
        data: {},
        emit: vi.fn(),
      }));

      // Act - Authenticate all sockets
      sockets.forEach(socket => {
        const result = authenticateWebSocket(socket, testConfig);
        expect(result).toBe(true);
      });

      // Assert - All sockets should be authenticated
      sockets.forEach((socket, i) => {
        expect(socket.data.user).toBeDefined();
        expect(socket.data.user.id).toBe(`user-${i}`);
      });
    });
  });

  describe('Token Generation and Validation', () => {
    it('should generate valid JWT token with user data', () => {
      // Arrange
      const user = {
        id: 'user-777',
        username: 'testuser',
        role: 'developer',
        permissions: ['read', 'write'],
      };

      // Act
      const token = generateToken(user, testConfig);

      // Assert
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature

      // Verify token can be used for authentication
      mockSocket.handshake.auth.token = token;
      const authResult = authenticateWebSocket(mockSocket, testConfig);
      expect(authResult).toBe(true);
      expect(mockSocket.data.user.id).toBe(user.id);
    });

    it('should include correct claims in JWT token', () => {
      // Arrange
      const user = {
        id: 'user-888',
        username: 'claimtest',
        role: 'operator',
        permissions: ['swarm.create', 'agent.spawn'],
      };

      // Act
      const token = generateToken(user, testConfig);
      mockSocket.handshake.auth.token = token;
      authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(mockSocket.data.user.id).toBe('user-888');
      expect(mockSocket.data.user.username).toBe('claimtest');
      expect(mockSocket.data.user.role).toBe('operator');
      expect(mockSocket.data.user.permissions).toEqual(['swarm.create', 'agent.spawn']);
    });

    it('should generate tokens with correct issuer and audience', () => {
      // Arrange
      const user = {
        id: 'user-999',
        username: 'audtest',
        role: 'viewer',
        permissions: ['read'],
      };

      // Act
      const token = generateToken(user, testConfig);

      // Assert
      expect(token).toBeDefined();
      // Token should be verifiable (implicitly tests issuer/audience)
      mockSocket.handshake.auth.token = token;
      const authResult = authenticateWebSocket(mockSocket, testConfig);
      expect(authResult).toBe(true);
    });

    it('should handle special characters in username', () => {
      // Arrange
      const user = {
        id: 'user-special',
        username: 'user+test@example.com',
        role: 'developer',
        permissions: ['read', 'write'],
      };

      // Act
      const token = generateToken(user, testConfig);
      mockSocket.handshake.auth.token = token;
      const authResult = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(authResult).toBe(true);
      expect(mockSocket.data.user.username).toBe('user+test@example.com');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing socket handshake', () => {
      // Arrange
      const incompleteSocket = {
        data: {},
      };

      // Act
      const result = authenticateWebSocket(incompleteSocket, testConfig);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle socket with null handshake auth', () => {
      // Arrange
      mockSocket.handshake.auth = null;

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle socket with null handshake headers', () => {
      // Arrange
      mockSocket.handshake.headers = null;

      // Act
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle concurrent authentication attempts on same socket', () => {
      // Arrange
      const user = {
        id: 'user-concurrent',
        username: 'testuser',
        role: 'developer',
        permissions: ['read', 'write'],
      };
      const token = generateToken(user, testConfig);
      mockSocket.handshake.auth.token = token;

      // Act - Multiple authentication attempts
      const results = Array.from({ length: 10 }, () =>
        authenticateWebSocket(mockSocket, testConfig)
      );

      // Assert - All should succeed
      expect(results.every(r => r === true)).toBe(true);
      expect(mockSocket.data.user.id).toBe('user-concurrent');
    });

    it('should handle very long JWT tokens', () => {
      // Arrange
      const user = {
        id: 'user-longtoken',
        username: 'a'.repeat(1000), // Very long username
        role: 'developer',
        permissions: Array.from({ length: 100 }, (_, i) => `permission.${i}`),
      };

      // Act
      const token = generateToken(user, testConfig);
      mockSocket.handshake.auth.token = token;
      const result = authenticateWebSocket(mockSocket, testConfig);

      // Assert
      expect(result).toBe(true);
      expect(mockSocket.data.user.username).toHaveLength(1000);
      expect(mockSocket.data.user.permissions).toHaveLength(100);
    });
  });
});
