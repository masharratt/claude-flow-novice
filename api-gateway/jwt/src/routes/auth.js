const express = require('express');
const Joi = require('joi');
const { 
  generateTokens, 
  verifyToken, 
  refreshAccessToken, 
  revokeToken,
  hashPassword,
  comparePassword
} = require('../middleware/auth');
const { authenticateRequest, requireRoles } = require('../middleware/token-management');
const config = require('../config');
const logger = require('../logger');

const router = express.Router();

// Mock user database (in production, use actual database)
const users = new Map([
  ['admin@example.com', {
    id: '1',
    email: 'admin@example.com',
    password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPjPoxEHWpMJ2', // 'admin123'
    roles: ['admin'],
    permissions: ['read', 'write', 'delete', 'manage_users']
  }],
  ['user@example.com', {
    id: '2',
    email: 'user@example.com',
    password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPjPoxEHWpMJ2', // 'password'
    roles: ['user'],
    permissions: ['read', 'write']
  }]
]);

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required()
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

/**
 * POST /api/auth/login
 * User login
 */
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message,
        requestId: req.requestId
      });
    }

    const { email, password } = value;
    
    // Find user in database
    const user = users.get(email);
    if (!user) {
      logger.warn('Login attempt with non-existent email', { 
        email, 
        requestId: req.requestId 
      });
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
        requestId: req.requestId
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      logger.warn('Login attempt with invalid password', { 
        email, 
        requestId: req.requestId 
      });
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
        requestId: req.requestId
      });
    }

    // Generate tokens
    const tokens = generateTokens(user);

    // Log successful login
    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      roles: user.roles,
      requestId: req.requestId
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions
      },
      ...tokens
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during login',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/auth/register
 * User registration
 */
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message,
        requestId: req.requestId
      });
    }

    const { email, password, firstName, lastName } = value;

    // Check if user already exists
    if (users.has(email)) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email already exists',
        requestId: req.requestId
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create new user
    const newUser = {
      id: Date.now().toString(),
      email,
      password: hashedPassword,
      firstName,
      lastName,
      roles: ['user'],
      permissions: ['read', 'write'],
      createdAt: new Date().toISOString()
    };

    // Save user
    users.set(email, newUser);

    // Generate tokens
    const tokens = generateTokens(newUser);

    // Log successful registration
    logger.info('User registered successfully', {
      userId: newUser.id,
      email: newUser.email,
      roles: newUser.roles,
      requestId: req.requestId
    });

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        roles: newUser.roles,
        permissions: newUser.permissions
      },
      ...tokens
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during registration',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/auth/logout
 * User logout
 */
router.post('/logout', authenticateRequest(), async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      // Revoke the token
      await revokeToken(token);
    }

    logger.info('User logged out successfully', {
      userId: req.user.sub,
      requestId: req.requestId
    });

    res.json({
      message: 'Logout successful'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during logout',
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', authenticateRequest(), async (req, res) => {
  try {
    // Find user details
    let user = null;
    for (const [email, userData] of users.entries()) {
      if (userData.id === req.user.sub) {
        user = userData;
        break;
      }
    }

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
        requestId: req.requestId
      });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        permissions: user.permissions,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error('Get user info error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching user information',
      requestId: req.requestId
    });
  }
});

/**
 * PUT /api/auth/change-password
 * Change user password
 */
router.put('/change-password', authenticateRequest(), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Current password and new password are required',
        requestId: req.requestId
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'New password must be at least 8 characters long',
        requestId: req.requestId
      });
    }

    // Find user
    let user = null;
    for (const [email, userData] of users.entries()) {
      if (userData.id === req.user.sub) {
        user = { email, ...userData };
        break;
      }
    }

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
        requestId: req.requestId
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        error: 'Invalid password',
        message: 'Current password is incorrect',
        requestId: req.requestId
      });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    user.password = hashedNewPassword;
    users.set(user.email, user);

    logger.info('Password changed successfully', {
      userId: user.id,
      requestId: req.requestId
    });

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while changing password',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/auth/verify
 * Verify token validity
 */
router.post('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Authorization header with Bearer token is required',
        requestId: req.requestId
      });
    }

    const decoded = verifyToken(token);

    res.json({
      valid: true,
      user: {
        id: decoded.sub,
        email: decoded.email,
        roles: decoded.roles,
        permissions: decoded.permissions
      },
      expires: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (error) {
    if (error.message === 'Token expired') {
      return res.status(401).json({
        valid: false,
        error: 'Token expired',
        message: 'The provided token has expired',
        requestId: req.requestId
      });
    }

    res.status(401).json({
      valid: false,
      error: 'Invalid token',
      message: 'The provided token is invalid',
      requestId: req.requestId
    });
  }
});

module.exports = router;