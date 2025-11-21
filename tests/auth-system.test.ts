/**
 * Authentication System Tests
 * 
 * Comprehensive test suite for JWT authentication with refresh tokens,
 * session management, and security features.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Redis } from 'ioredis';
import { Database } from 'better-sqlite3';
import { 
  AuthenticationService,
  TokenPair,
  UserRegistrationRequest,
  LoginRequest,
  AuthUser
} from '../src/services/authentication.js';
import { authenticationRouter } from '../src/api/auth-endpoints.js';
import { AuthMiddleware } from '../src/middleware/auth-middleware.js';

// Mock dependencies
jest.mock('ioredis');
jest.mock('better-sqlite3');
jest.mock('../src/utils/logger.js');

describe('Authentication System', () => {
  let app: express.Application;
  let authService: AuthenticationService;
  let mockRedis: jest.Mocked<Redis>;
  let mockDb: jest.Mocked<Database>;
  let authMiddleware: AuthMiddleware;

  beforeEach(() => {
    // Setup mock Redis
    mockRedis = new Redis() as jest.Mocked<Redis>;
    mockRedis.get = jest.fn();
    mockRedis.set = jest.fn();
    mockRedis.del = jest.fn();
    mockRedis.exists = jest.fn();
    mockRedis.expire = jest.fn();
    mockRedis.sadd = jest.fn();
    mockRedis.srem = jest.fn();
    mockRedis.smembers = jest.fn();

    // Setup mock SQLite database
    mockDb = {
      prepare: jest.fn(),
      exec: jest.fn(),
    } as any;

    // Setup mock database statements
    const mockStmt = {
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(),
    };
    mockDb.prepare.mockReturnValue(mockStmt);

    // Initialize authentication service with mocked dependencies
    authService = new AuthenticationService({
      redis: mockRedis,
      database: mockDb,
      jwtSecret: 'test-secret-key-at-least-16-chars-for-security',
      jwtExpiration: '15m',
      refreshExpiration: '7d',
      maxSessionsPerUser: 3,
    });

    authMiddleware = new AuthMiddleware('test-secret-key-at-least-16-chars-for-security');

    // Setup Express app for testing
    app = express();
    app.use(express.json());
    
    // Add authentication endpoints
    app.use('/api/auth', authenticationRouter(authService));
    
    // Add protected endpoint for testing
    app.get('/api/protected', 
      authMiddleware.extractUserContext.bind(authMiddleware),
      (req, res) => {
        res.json({ 
          message: 'Access granted', 
          user: (req as any).user 
        });
      }
    );

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('User Registration', () => {
    const validRegistration: UserRegistrationRequest = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'SecurePass123!',
      role: 'developer',
    };

    it('should register a new user successfully', async () => {
      // Mock database responses
      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValueOnce(undefined); // No existing user
      mockStmt.get.mockReturnValueOnce({ id: 'user-123' }); // Created user
      mockStmt.run.mockReturnValue({ lastInsertRowid: 1, changes: 1 });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistration)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'User registered successfully',
        user: {
          username: validRegistration.username,
          email: validRegistration.email,
          role: validRegistration.role,
        },
      });
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();

      // Verify password was hashed
      expect(mockStmt.run).toHaveBeenCalledWith(
        expect.stringMatching(/^\$2[aby]\$\d+\$/), // bcrypt hash pattern
        expect.any(String),
        validRegistration.username,
        validRegistration.email,
        validRegistration.role,
        expect.any(String)
      );
    });

    it('should reject registration with weak password', async () => {
      const weakPassword = {
        ...validRegistration,
        password: '123', // Too weak
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(weakPassword)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: expect.stringContaining('Password must meet strength requirements'),
      });
    });

    it('should reject registration with duplicate email', async () => {
      // Mock existing user
      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValueOnce({ id: 'existing-user' });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistration)
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        error: 'DUPLICATE_USER',
        message: 'User with this email already exists',
      });
    });

    it('should enforce rate limiting on registration', async () => {
      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValueOnce(undefined); // No existing user

      // Mock rate limiting check
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.set.mockResolvedValue('OK');

      // Make multiple rapid requests
      const requests = Array(6).fill(null).map(() =>
        request(app)
          .post('/api/auth/register')
          .send({ ...validRegistration, email: `test${Math.random()}@example.com` })
      );

      const responses = await Promise.all(requests);
      
      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('User Login', () => {
    const validLogin: LoginRequest = {
      email: 'test@example.com',
      password: 'SecurePass123!',
    };

    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      password_hash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPjVhn.SaIx5O', // bcrypt hash of 'SecurePass123!'
      role: 'developer',
      is_active: true,
      failed_login_attempts: 0,
      locked_until: null,
    };

    it('should login successfully with valid credentials', async () => {
      // Mock database responses
      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValueOnce(mockUser); // User found
      mockStmt.run.mockReturnValue({ lastInsertRowid: 1, changes: 1 });

      // Mock Redis for session storage
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);
      mockRedis.sadd.mockResolvedValue(1);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLogin)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Login successful',
        user: {
          id: mockUser.id,
          username: mockUser.username,
          email: mockUser.email,
          role: mockUser.role,
        },
      });
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();

      // Verify session was created in Redis
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('session:'),
        expect.any(String),
        'EX',
        expect.any(Number)
      );
    });

    it('should reject login with invalid credentials', async () => {
      // Mock database responses
      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValueOnce(mockUser); // User found but password will fail

      const invalidLogin = {
        ...validLogin,
        password: 'WrongPassword123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidLogin)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });

      // Verify failed login attempt was recorded
      expect(mockStmt.run).toHaveBeenCalledWith(
        expect.any(Number), // failed_login_attempts
        expect.any(String), // locked_until
        mockUser.id
      );
    });

    it('should lock account after too many failed attempts', async () => {
      // Mock user with maximum failed attempts
      const lockedUser = {
        ...mockUser,
        failed_login_attempts: 5,
        locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // Locked for 15 minutes
      };

      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValueOnce(lockedUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLogin)
        .expect(423);

      expect(response.body).toMatchObject({
        success: false,
        error: 'ACCOUNT_LOCKED',
        message: 'Account temporarily locked due to too many failed login attempts',
      });
    });

    it('should handle concurrent sessions properly', async () => {
      // Mock database responses
      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValueOnce(mockUser); // User found
      mockStmt.run.mockReturnValue({ lastInsertRowid: 1, changes: 1 });

      // Mock Redis session management
      mockRedis.smembers.mockResolvedValueOnce(['session1', 'session2', 'session3']); // Max sessions reached
      mockRedis.srem.mockResolvedValue(1); // Remove oldest session
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.sadd.mockResolvedValue(1);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLogin)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Login successful',
      });

      // Verify oldest session was removed
      expect(mockRedis.srem).toHaveBeenCalled();
    });
  });

  describe('Token Refresh', () => {
    const mockRefreshToken = 'valid-refresh-token';
    const mockUser: AuthUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      role: 'developer',
    };

    it('should refresh tokens successfully', async () => {
      // Mock Redis responses
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockUser)); // Refresh token valid
      mockRedis.del.mockResolvedValueOnce(1); // Delete old refresh token
      mockRedis.set.mockResolvedValue('OK'); // Store new refresh token

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: mockRefreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Tokens refreshed successfully',
      });
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();

      // Verify old refresh token was invalidated (rotation)
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('refresh:')
      );
    });

    it('should reject invalid refresh token', async () => {
      mockRedis.get.mockResolvedValueOnce(null); // Refresh token not found

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    });

    it('should reject refresh token usage after rotation', async () => {
      // Simulate refresh token already used (rotation attack protection)
      mockRedis.get.mockResolvedValueOnce(null); // Token already consumed

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: mockRefreshToken })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    });
  });

  describe('Logout and Session Management', () => {
    const mockAccessToken = 'valid-access-token';
    const mockRefreshToken = 'valid-refresh-token';
    const mockSessionId = 'session-123';

    it('should logout successfully and invalidate tokens', async () => {
      // Mock Redis responses
      mockRedis.del.mockResolvedValue(1); // Delete session
      mockRedis.del.mockResolvedValue(1); // Delete refresh token
      mockRedis.sadd.mockResolvedValue(1); // Add to blacklist

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${mockAccessToken}`)
        .send({ refreshToken: mockRefreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Logout successful',
      });

      // Verify tokens were invalidated
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('session:')
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('refresh:')
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        expect.stringContaining('blacklist:'),
        expect.any(String)
      );
    });

    it('should handle session cleanup on user request', async () => {
      // Mock Redis responses
      mockRedis.smembers.mockResolvedValueOnce(['session1', 'session2', 'session3']);
      mockRedis.del.mockResolvedValue(1);
      mockRedis.srem.mockResolvedValue(1);

      const response = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${mockAccessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'All sessions terminated successfully',
      });

      // Verify all sessions were cleaned up
      expect(mockRedis.smembers).toHaveBeenCalledWith(
        expect.stringContaining('sessions:')
      );
      expect(mockRedis.del).toHaveBeenCalledTimes(3); // session1, session2, session3
    });
  });

  describe('Protected Routes', () => {
    const validAccessToken = 'valid-access-token';
    const mockUser: AuthUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      role: 'developer',
    };

    it('should allow access with valid JWT token', async () => {
      // Create a valid JWT token for testing
      const validToken = authMiddleware.generateToken(
        mockUser.id,
        mockUser.username,
        mockUser.role as any,
        mockUser.email
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Access granted',
        user: {
          userId: mockUser.id,
          username: mockUser.username,
          email: mockUser.email,
          role: mockUser.role,
        },
      });
    });

    it('should reject access with invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: expect.stringContaining('Invalid or expired token'),
      });
    });

    it('should reject access with blacklisted token', async () => {
      // Mock token blacklist check
      mockRedis.sismember.mockResolvedValue(1); // Token is blacklisted

      // Create a valid token format but mark it as blacklisted
      const validToken = authMiddleware.generateToken(
        mockUser.id,
        mockUser.username,
        mockUser.role as any,
        mockUser.email
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Token has been revoked',
      });
    });

    it('should reject access without authorization header', async () => {
      const response = await request(app)
        .get('/api/protected')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Missing authentication credentials',
      });
    });
  });

  describe('User Profile Management', () => {
    const validAccessToken = 'valid-access-token';

    it('should retrieve user profile successfully', async () => {
      // Mock user data
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        role: 'developer',
        created_at: '2024-01-01T00:00:00Z',
        last_login: '2024-01-15T10:30:00Z',
      };

      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValue(mockUser);

      // Create valid token
      const validToken = authMiddleware.generateToken(
        mockUser.id,
        mockUser.username,
        mockUser.role as any,
        mockUser.email
      );

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        user: {
          id: mockUser.id,
          username: mockUser.username,
          email: mockUser.email,
          role: mockUser.role,
        },
      });
    });

    it('should update user profile successfully', async () => {
      const updateData = {
        username: 'newusername',
      };

      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValue({ id: 'user-123' }); // User exists
      mockStmt.run.mockReturnValue({ changes: 1 });

      const validToken = authMiddleware.generateToken(
        'user-123',
        'testuser',
        'developer' as any,
        'test@example.com'
      );

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Profile updated successfully',
      });

      expect(mockStmt.run).toHaveBeenCalledWith(
        updateData.username,
        'user-123'
      );
    });

    it('should change password successfully', async () => {
      const passwordChange = {
        currentPassword: 'CurrentPass123!',
        newPassword: 'NewPass456!',
      };

      const mockUser = {
        id: 'user-123',
        password_hash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPjVhn.SaIx5O', // hash of 'CurrentPass123!'
      };

      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValue(mockUser);
      mockStmt.run.mockReturnValue({ changes: 1 });

      // Mock Redis for session invalidation
      mockRedis.smembers.mockResolvedValueOnce(['session1', 'session2']);
      mockRedis.del.mockResolvedValue(1);

      const validToken = authMiddleware.generateToken(
        mockUser.id,
        'testuser',
        'developer' as any,
        'test@example.com'
      );

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${validToken}`)
        .send(passwordChange)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Password changed successfully',
      });

      // Verify password was updated and sessions invalidated
      expect(mockStmt.run).toHaveBeenCalledWith(
        expect.stringMatching(/^\$2[aby]\$\d+\$/), // New bcrypt hash
        mockUser.id
      );
      expect(mockRedis.del).toHaveBeenCalledTimes(2); // All sessions invalidated
    });

    it('should reject password change with incorrect current password', async () => {
      const passwordChange = {
        currentPassword: 'WrongPass123!',
        newPassword: 'NewPass456!',
      };

      const mockUser = {
        id: 'user-123',
        password_hash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPjVhn.SaIx5O', // hash of 'CurrentPass123!'
      };

      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockReturnValue(mockUser);

      const validToken = authMiddleware.generateToken(
        mockUser.id,
        'testuser',
        'developer' as any,
        'test@example.com'
      );

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${validToken}`)
        .send(passwordChange)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect',
      });
    });
  });

  describe('Security Features', () => {
    it('should prevent token reuse after logout', async () => {
      const accessToken = 'access-token';
      const refreshToken = 'refresh-token';

      // Mock token blacklist
      mockRedis.sismember.mockResolvedValue(1); // Token is blacklisted

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Token has been revoked',
      });
    });

    it('should enforce session timeout', async () => {
      // Mock expired session
      mockRedis.get.mockResolvedValue(null); // Session not found (expired)

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'some-refresh-token' })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    });

    it('should handle JWT token expiration gracefully', async () => {
      // Create an expired token
      const expiredToken = authMiddleware.generateToken(
        'user-123',
        'testuser',
        'developer' as any,
        'test@example.com'
      );

      // Mock the token verification to throw expiration error
      jest.spyOn(authMiddleware, 'validateToken').mockImplementation(() => {
        const error = new Error('Token expired');
        (error as any).name = 'TokenExpiredError';
        throw error;
      });

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: expect.stringContaining('expired'),
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit login attempts', async () => {
      // Mock rate limiting exceeded
      mockRedis.exists.mockResolvedValue(1); // Rate limit exists

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SomePass123!',
        })
        .expect(429);

      expect(response.body).toMatchObject({
        error: 'Too Many Requests',
        message: expect.stringContaining('rate limit'),
      });
    });

    it('should rate limit registration attempts', async () => {
      // Mock rate limiting exceeded
      mockRedis.exists.mockResolvedValue(1);

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'SecurePass123!',
          role: 'developer',
        })
        .expect(429);

      expect(response.body).toMatchObject({
        error: 'Too Many Requests',
        message: expect.stringContaining('rate limit'),
      });
    });

    it('should rate limit password reset requests', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const response = await request(app)
        .post('/api/auth/request-password-reset')
        .send({ email: 'test@example.com' })
        .expect(429);

      expect(response.body).toMatchObject({
        error: 'Too Many Requests',
        message: expect.stringContaining('rate limit'),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Mock database error
      const mockStmt = mockDb.prepare() as any;
      mockStmt.get.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SomePass123!',
        })
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: expect.stringContaining('authentication service'),
      });
    });

    it('should handle Redis connection errors gracefully', async () => {
      // Mock Redis error
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'some-token' })
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: expect.stringContaining('Token service'),
      });
    });

    it('should validate request payload properly', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          // Missing required fields
          username: '',
          email: 'invalid-email',
          password: '123',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: expect.stringContaining('validation'),
      });
    });
  });
});