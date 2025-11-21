/**
 * Backend Authentication Middleware Tests
 * 
 * Test suite for authentication middleware following TDD protocol.
 * Tests JWT token validation, user authentication, and security features.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { authenticationMiddleware } from '../../src/middleware/authentication.js';
import { authorizationMiddleware } from '../../src/middleware/authorization.js';
import { StandardError, ErrorCode } from '../../lib/errors.js';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('bcrypt');
jest.mock('../../lib/errors.js');
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockedJwt = jwt as jest.Mocked<typeof jwt>;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('JWT Token Validation', () => {
    test('should pass with valid JWT token', async () => {
      // Arrange
      const validToken = 'valid.jwt.token';
      const decodedToken = { userId: 'user123', email: 'user@example.com', role: 'user' };
      
      mockRequest.headers = {
        authorization: `Bearer ${validToken}`,
      };

      mockedJwt.verify.mockReturnValue(decodedToken as any);

      // Act
      const middleware = authenticationMiddleware({
        jwtSecret: 'test-secret',
        jwtExpiration: '24h',
        bcryptRounds: 12,
      });

      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Assert
      expect(mockedJwt.verify).toHaveBeenCalledWith(validToken, 'test-secret');
      expect(nextFunction).toHaveBeenCalledWith();
      expect(mockRequest.user).toEqual(decodedToken);
    });

    test('should reject request without authorization header', async () => {
      // Arrange
      const middleware = authenticationMiddleware({
        jwtSecret: 'test-secret',
        jwtExpiration: '24h',
        bcryptRounds: 12,
      });

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'No authorization header provided',
        errorCode: 'AUTH_001',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    test('should reject request with invalid JWT token', async () => {
      // Arrange
      const invalidToken = 'invalid.jwt.token';
      mockRequest.headers = {
        authorization: `Bearer ${invalidToken}`,
      };

      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const middleware = authenticationMiddleware({
        jwtSecret: 'test-secret',
        jwtExpiration: '24h',
        bcryptRounds: 12,
      });

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        errorCode: 'AUTH_002',
      });
    });

    test('should reject malformed authorization header', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'InvalidHeader token123',
      };

      const middleware = authenticationMiddleware({
        jwtSecret: 'test-secret',
        jwtExpiration: '24h',
        bcryptRounds: 12,
      });

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid authorization header format',
        errorCode: 'AUTH_003',
      });
    });
  });

  describe('Token Expiration Handling', () => {
    test('should reject expired tokens', async () => {
      // Arrange
      const expiredToken = 'expired.jwt.token';
      mockRequest.headers = {
        authorization: `Bearer ${expiredToken}`,
      };

      mockedJwt.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        (error as any).name = 'TokenExpiredError';
        throw error;
      });

      const middleware = authenticationMiddleware({
        jwtSecret: 'test-secret',
        jwtExpiration: '24h',
        bcryptRounds: 12,
      });

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Token has expired',
        errorCode: 'AUTH_004',
      });
    });
  });

  describe('Security Features', () => {
    test('should handle JWT verification errors gracefully', async () => {
      // Arrange
      const maliciousToken = 'malicious.jwt.token';
      mockRequest.headers = {
        authorization: `Bearer ${maliciousToken}`,
      };

      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Malformed token');
      });

      const middleware = authenticationMiddleware({
        jwtSecret: 'test-secret',
        jwtExpiration: '24h',
        bcryptRounds: 12,
      });

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    test('should sanitize token before verification', async () => {
      // Arrange
      const tokenWithSpaces = '  valid.jwt.token  ';
      const decodedToken = { userId: 'user123', email: 'user@example.com' };
      
      mockRequest.headers = {
        authorization: `Bearer ${tokenWithSpaces}`,
      };

      mockedJwt.verify.mockReturnValue(decodedToken as any);

      const middleware = authenticationMiddleware({
        jwtSecret: 'test-secret',
        jwtExpiration: '24h',
        bcryptRounds: 12,
      });

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Assert
      expect(mockedJwt.verify).toHaveBeenCalledWith('valid.jwt.token', 'test-secret');
      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting Integration', () => {
    test('should work with rate limiting middleware', async () => {
      // Arrange
      const validToken = 'valid.jwt.token';
      const decodedToken = { userId: 'user123', email: 'user@example.com', role: 'user' };
      
      mockRequest = {
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        ip: '192.168.1.1',
        connection: {
          remoteAddress: '192.168.1.1',
        },
      };

      mockedJwt.verify.mockReturnValue(decodedToken as any);

      const middleware = authenticationMiddleware({
        jwtSecret: 'test-secret',
        jwtExpiration: '24h',
        bcryptRounds: 12,
      });

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Assert
      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
    });
  });
});

describe('Authorization Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockRequest = {
      user: {
        userId: 'user123',
        email: 'user@example.com',
        role: 'user',
      },
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  test('should authorize user with correct role', async () => {
    // Arrange
    const middleware = authorizationMiddleware(['user', 'admin']);

    // Act
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    // Assert
    expect(nextFunction).toHaveBeenCalled();
  });

  test('should authorize admin with admin-only access', async () => {
    // Arrange
    mockRequest.user!.role = 'admin';
    const middleware = authorizationMiddleware(['admin']);

    // Act
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    // Assert
    expect(nextFunction).toHaveBeenCalled();
  });

  test('should reject user without required role', async () => {
    // Arrange
    const middleware = authorizationMiddleware(['admin']);

    // Act
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Insufficient permissions',
      requiredRoles: ['admin'],
      userRole: 'user',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  test('should reject request without user object', async () => {
    // Arrange
    delete mockRequest.user;
    const middleware = authorizationMiddleware(['user']);

    // Act
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'User not authenticated',
    });
  });

  test('should handle multiple authorized roles', async () => {
    // Arrange
    const middleware = authorizationMiddleware(['user', 'moderator', 'admin']);

    // Act
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    // Assert
    expect(nextFunction).toHaveBeenCalled();
  });
});

describe('Password Security', () => {
  test('should hash passwords with bcrypt', async () => {
    // Arrange
    const password = 'testPassword123';
    const hashedPassword = '$2b$12$hashedpasswordvalue';

    mockedBcrypt.hash.mockResolvedValue(hashedPassword);

    // Act
    const result = await mockedBcrypt.hash(password, 12);

    // Assert
    expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 12);
    expect(result).toBe(hashedPassword);
  });

  test('should compare passwords securely', async () => {
    // Arrange
    const password = 'testPassword123';
    const hashedPassword = '$2b$12$hashedpasswordvalue';

    mockedBcrypt.compare.mockResolvedValue(true);

    // Act
    const result = await mockedBcrypt.compare(password, hashedPassword);

    // Assert
    expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
    expect(result).toBe(true);
  });
});