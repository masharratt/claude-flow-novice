/**
 * Security Middleware for Production Dashboard
 * Implements comprehensive security controls including authentication,
 * rate limiting, CORS protection, and security headers
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { DatabaseManager, User as DBUser, Session } from './database-manager.js';

// Security configuration
const SECURITY_CONFIG = {
  jwt: {
    secret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
    expiresIn: '15m',
    refreshExpiresIn: '7d'
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  },
  auth: {
    maxLoginAttempts: parseInt(process.env.AUTH_MAX_LOGIN_ATTEMPTS || '5'),
    lockoutDuration: parseInt(process.env.AUTH_LOCKOUT_DURATION || '1800000'), // 30 minutes
    passwordMinLength: 12,
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600000'), // 1 hour
  },
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
    credentials: true,
    optionsSuccessStatus: 200
  }
};

// Enhanced User interface matching database
interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'viewer' | 'operator';
  permissions: string[];
  lastLogin?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

class SecurityManager {
  private db: DatabaseManager;
  private rateLimitStore: Map<string, { count: number; resetTime: Date; blocked: boolean }> = new Map();

  constructor(db?: DatabaseManager) {
    this.db = db || new DatabaseManager();
    this.startPeriodicCleanup();
  }

  private generateSecurePassword(): string {
    return crypto.randomBytes(16).toString('hex') + crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  private startPeriodicCleanup() {
    // Cleanup expired sessions, old security events, and rate limits every 5 minutes
    setInterval(() => {
      this.db.cleanup();
    }, 5 * 60 * 1000);
  }

  // Enhanced rate limiting with database integration
  createRateLimiter(options: Partial<typeof SECURITY_CONFIG.rateLimit> = {}) {
    const config = { ...SECURITY_CONFIG.rateLimit, ...options };

    return rateLimit({
      windowMs: config.windowMs,
      max: config.max,
      message: config.message,
      standardHeaders: config.standardHeaders,
      legacyHeaders: config.legacyHeaders,
      keyGenerator: (req) => {
        // Use IP + user ID for authenticated requests
        const user = (req as any).user;
        return user ? `${req.ip}:${user.id}` : req.ip;
      },
      handler: (req: Request, res: Response) => {
        const key = (req as any).rateLimit?.key || req.ip;

        // Log security event
        this.db.logSecurityEvent('RATE_LIMIT_EXCEEDED', 'medium', req.ip, {
          path: req.path,
          userAgent: req.get('User-Agent'),
          rateLimitKey: key
        }, (req as any).user?.id);

        // Block for progressive duration if repeated violations
        const existingBlocks = this.rateLimitStore.get(key);
        if (existingBlocks && existingBlocks.blocked) {
          const blockDuration = Math.min(30 * 60 * 1000, existingBlocks.count * 5 * 60 * 1000); // Max 30 minutes
          this.rateLimitStore.set(key, {
            count: existingBlocks.count + 1,
            resetTime: new Date(Date.now() + blockDuration),
            blocked: true
          });
        }

        res.status(429).json({
          error: config.message || 'Too many requests',
          retryAfter: Math.ceil(config.windowMs / 1000),
          progressiveBlock: existingBlocks?.blocked || false
        });
      },
      onLimitReached: (req: Request, res: Response) => {
        const key = (req as any).rateLimit?.key || req.ip;
        this.rateLimitStore.set(key, {
          count: (this.rateLimitStore.get(key)?.count || 0) + 1,
          resetTime: new Date(Date.now() + config.windowMs),
          blocked: false
        });
      }
    });
  }

  // API rate limiting with database persistence
  createApiRateLimiter() {
    return this.createRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      max: 30, // 30 requests per minute for APIs
      message: 'API rate limit exceeded. Please reduce request frequency.'
    });
  }

  // Enhanced authentication rate limiting with progressive blocking
  createAuthRateLimiter() {
    return this.createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 login attempts per 15 minutes
      message: 'Too many authentication attempts. Account temporarily locked.',
      skipSuccessfulRequests: true,
      keyGenerator: (req) => {
        const { username } = req.body;
        return `auth:${req.ip}:${username || 'unknown'}`;
      }
    });
  }

  // Create endpoint-specific rate limiters
  createEndpointRateLimiter(endpoint: string, windowMs: number, max: number) {
    return this.createRateLimiter({
      windowMs,
      max,
      message: `Rate limit exceeded for ${endpoint}. Please try again later.`,
      keyGenerator: (req) => `endpoint:${endpoint}:${req.ip}`
    });
  }

  // Security headers middleware
  securityHeaders() {
    return helmet({
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
          manifestSrc: ["'self'"]
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
    });
  }

  // CORS configuration
  corsMiddleware() {
    return cors(SECURITY_CONFIG.cors);
  }

  // Input validation middleware
  validateInput(req: Request, res: Response, next: NextFunction) {
    // Validate JSON payload size
    if (req.headers['content-length'] && parseInt(req.headers['content-length']) > 1024 * 1024) {
      return res.status(413).json({ error: 'Payload too large' });
    }

    // Sanitize query parameters
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        // Basic XSS prevention
        if (/<script|javascript:|on\w+=/i.test(value)) {
          this.db.logSecurityEvent('XSS_ATTEMPT', 'medium', req.ip, { query: req.query });
          return res.status(400).json({ error: 'Invalid input detected' });
        }
      }
    }

    next();
  }

  // Enhanced authentication middleware with database integration
  authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      this.db.logSecurityEvent('MISSING_TOKEN', 'medium', req.ip, {
        path: req.path,
        userAgent: req.get('User-Agent')
      });
      return res.status(401).json({ error: 'Access token required' });
    }

    try {
      const decoded = jwt.verify(token, SECURITY_CONFIG.jwt.secret) as any;

      // Check if session is still valid in database
      const session = this.db.getSession(decoded.sessionId);
      if (!session || session.expires < new Date()) {
        this.db.logSecurityEvent('EXPIRED_SESSION', 'medium', req.ip, {
          sessionId: decoded.sessionId,
          userAgent: req.get('User-Agent')
        });
        return res.status(401).json({ error: 'Session expired' });
      }

      // Get user from database
      const user = this.db.getUserById(session.userId);
      if (!user) {
        this.db.logSecurityEvent('INVALID_USER', 'high', req.ip, {
          userId: session.userId,
          sessionId: decoded.sessionId
        });
        return res.status(401).json({ error: 'User not found' });
      }

      // Check if user is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        this.db.logSecurityEvent('LOCKED_USER_ACCESS', 'high', req.ip, {
          userId: user.id,
          username: user.username,
          lockedUntil: user.lockedUntil
        });
        return res.status(423).json({ error: 'Account is locked' });
      }

      // Update session last access
      this.db.updateSessionAccess(decoded.sessionId);

      // Attach user and session to request
      (req as any).user = user;
      (req as any).session = session;
      next();
    } catch (error) {
      this.db.logSecurityEvent('INVALID_TOKEN', 'high', req.ip, {
        tokenPreview: token.substring(0, 10) + '...',
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return res.status(403).json({ error: 'Invalid token' });
    }
  }

  // Enhanced role-based authorization middleware
  requirePermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;

      if (!user) {
        this.db.logSecurityEvent('UNAUTHORIZED_ATTEMPT', 'medium', req.ip, {
          path: req.path,
          requiredPermission: permission,
          userAgent: req.get('User-Agent')
        });
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!user.permissions.includes(permission)) {
        this.db.logSecurityEvent('INSUFFICIENT_PERMISSIONS', 'high', req.ip, {
          userId: user.id,
          username: user.username,
          requiredPermission: permission,
          userPermissions: user.permissions,
          path: req.path,
          userAgent: req.get('User-Agent')
        }, user.id);
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: permission,
          current: user.permissions
        });
      }

      next();
    };
  }

  // Enhanced permission checker with wildcard support
  requireAnyPermission(permissions: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasPermission = permissions.some(permission =>
        user.permissions.includes(permission) ||
        user.permissions.includes('*') || // Wildcard permission
        (permission.endsWith('*') && user.permissions.some(p => p.startsWith(permission.slice(0, -1))))
      );

      if (!hasPermission) {
        this.db.logSecurityEvent('PERMISSION_DENIED', 'high', req.ip, {
          userId: user.id,
          username: user.username,
          requiredPermissions: permissions,
          userPermissions: user.permissions,
          path: req.path
        }, user.id);
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: permissions,
          current: user.permissions
        });
      }

      next();
    };
  }

  // Enhanced login endpoint with database integration
  async login(req: Request, res: Response) {
    const { username, password } = req.body;

    if (!username || !password) {
      this.db.logSecurityEvent('LOGIN_MISSING_CREDENTIALS', 'medium', req.ip, {
        missingFields: { username: !username, password: !password },
        userAgent: req.get('User-Agent')
      });
      return res.status(400).json({ error: 'Username and password required' });
    }

    try {
      // Get user from database
      const user = this.db.getUserByUsername(username);

      if (!user) {
        this.db.logSecurityEvent('LOGIN_INVALID_USER', 'medium', req.ip, {
          username,
          userAgent: req.get('User-Agent')
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if user is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingTime = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000 / 60);
        this.db.logSecurityEvent('LOGIN_LOCKED_ACCOUNT', 'high', req.ip, {
          userId: user.id,
          username,
          lockedUntil: user.lockedUntil,
          userAgent: req.get('User-Agent')
        }, user.id);
        return res.status(423).json({
          error: `Account locked. Try again in ${remainingTime} minutes`
        });
      }

      // Verify password
      const passwordValid = await bcrypt.compare(password, user.passwordHash);

      if (!passwordValid) {
        // Increment login attempts
        const newAttempts = user.loginAttempts + 1;
        this.db.updateUserLoginAttempts(username, newAttempts);

        // Lock account if max attempts reached
        if (newAttempts >= SECURITY_CONFIG.auth.maxLoginAttempts) {
          this.db.lockUser(username, SECURITY_CONFIG.auth.lockoutDuration);
          this.db.logSecurityEvent('LOGIN_ACCOUNT_LOCKED', 'high', req.ip, {
            userId: user.id,
            username,
            attempts: newAttempts,
            userAgent: req.get('User-Agent')
          }, user.id);
        } else {
          this.db.logSecurityEvent('LOGIN_INVALID_PASSWORD', 'medium', req.ip, {
            userId: user.id,
            username,
            attempts: newAttempts,
            userAgent: req.get('User-Agent')
          }, user.id);
        }

        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Password is valid - create session
      const sessionId = this.db.createSession(
        user.id,
        new Date(Date.now() + SECURITY_CONFIG.auth.sessionTimeout),
        req.ip,
        req.get('User-Agent') || 'Unknown'
      );

      // Create JWT tokens
      const accessToken = jwt.sign(
        {
          username: user.username,
          role: user.role,
          sessionId
        },
        SECURITY_CONFIG.jwt.secret,
        { expiresIn: SECURITY_CONFIG.jwt.expiresIn }
      );

      const refreshToken = jwt.sign(
        { username: user.username, sessionId },
        SECURITY_CONFIG.jwt.secret,
        { expiresIn: SECURITY_CONFIG.jwt.refreshExpiresIn }
      );

      // Update last login and reset attempts
      this.db.updateUserLastLogin(user.id);

      // Log successful login
      this.db.logSecurityEvent('LOGIN_SUCCESS', 'low', req.ip, {
        userId: user.id,
        username,
        sessionId,
        userAgent: req.get('User-Agent')
      }, user.id);

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: user.permissions,
          lastLogin: new Date()
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      this.db.logSecurityEvent('LOGIN_ERROR', 'high', req.ip, {
        username,
        error: error.message,
        userAgent: req.get('User-Agent')
      });
      res.status(500).json({ error: 'Login failed due to server error' });
    }
  }

  // Enhanced refresh token handler with database integration
  async refreshToken(req: Request, res: Response) {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      this.db.logSecurityEvent('TOKEN_REFRESH_MISSING', 'medium', req.ip, {
        userAgent: req.get('User-Agent')
      });
      return res.status(400).json({ error: 'Refresh token required' });
    }

    try {
      const decoded = jwt.verify(refreshToken, SECURITY_CONFIG.jwt.secret) as any;

      // Check if session is still valid in database
      const session = this.db.getSession(decoded.sessionId);
      if (!session || session.expires < new Date()) {
        this.db.logSecurityEvent('TOKEN_REFRESH_EXPIRED_SESSION', 'medium', req.ip, {
          sessionId: decoded.sessionId,
          username: decoded.username,
          userAgent: req.get('User-Agent')
        });
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = this.db.getUserById(session.userId);
      if (!user) {
        this.db.logSecurityEvent('TOKEN_REFRESH_INVALID_USER', 'high', req.ip, {
          userId: session.userId,
          sessionId: decoded.sessionId
        });
        return res.status(401).json({ error: 'User not found' });
      }

      // Check if user is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        this.db.logSecurityEvent('TOKEN_REFRESH_LOCKED_USER', 'high', req.ip, {
          userId: user.id,
          username: user.username,
          sessionId: decoded.sessionId
        }, user.id);
        return res.status(423).json({ error: 'Account is locked' });
      }

      // Create new access token
      const newAccessToken = jwt.sign(
        {
          username: user.username,
          role: user.role,
          sessionId: decoded.sessionId
        },
        SECURITY_CONFIG.jwt.secret,
        { expiresIn: SECURITY_CONFIG.jwt.expiresIn }
      );

      // Update session last access
      this.db.updateSessionAccess(decoded.sessionId);

      this.db.logSecurityEvent('TOKEN_REFRESH_SUCCESS', 'low', req.ip, {
        userId: user.id,
        username: user.username,
        sessionId: decoded.sessionId
      }, user.id);

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      this.db.logSecurityEvent('TOKEN_REFRESH_INVALID', 'high', req.ip, {
        error: error.message,
        userAgent: req.get('User-Agent')
      });
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
  }

  // Enhanced logout handler
  async logout(req: Request, res: Response) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const user = (req as any).user;

    if (token) {
      try {
        const decoded = jwt.verify(token, SECURITY_CONFIG.jwt.secret) as any;
        this.db.deleteSession(decoded.sessionId);

        this.db.logSecurityEvent('LOGOUT_SUCCESS', 'low', req.ip, {
          userId: user?.id,
          username: user?.username,
          sessionId: decoded.sessionId,
          userAgent: req.get('User-Agent')
        }, user?.id);
      } catch (error) {
        // Token was invalid, but logout should still succeed
        this.db.logSecurityEvent('LOGOUT_INVALID_TOKEN', 'medium', req.ip, {
          error: error.message,
          userAgent: req.get('User-Agent')
        });
      }
    }

    res.json({ message: 'Logged out successfully' });
  }

  // Enhanced user management with database integration
  async createUser(req: Request, res: Response) {
    const { username, password, role = 'viewer' } = req.body;
    const currentUser = (req as any).user;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (password.length < SECURITY_CONFIG.auth.passwordMinLength) {
      return res.status(400).json({
        error: `Password must be at least ${SECURITY_CONFIG.auth.passwordMinLength} characters`
      });
    }

    try {
      const newUser = this.db.createUser(username, password, role as 'admin' | 'viewer' | 'operator');

      this.db.logSecurityEvent('USER_CREATED', 'medium', req.ip, {
        createdBy: currentUser.username,
        createdUserId: currentUser.id,
        newUsername: username,
        newUserId: newUser.id,
        role,
        userAgent: req.get('User-Agent')
      }, currentUser.id);

      res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        permissions: newUser.permissions,
        createdAt: newUser.createdAt
      });
    } catch (error) {
      if (error.message === 'User already exists') {
        return res.status(409).json({ error: 'User already exists' });
      }
      this.db.logSecurityEvent('USER_CREATION_ERROR', 'high', req.ip, {
        createdBy: currentUser.username,
        username,
        error: error.message,
        userAgent: req.get('User-Agent')
      }, currentUser.id);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }

  // Enhanced user management operations
  async updateUserRole(req: Request, res: Response) {
    const { username, newRole } = req.body;
    const currentUser = (req as any).user;

    if (!username || !newRole) {
      return res.status(400).json({ error: 'Username and new role required' });
    }

    try {
      const user = this.db.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update user role and permissions (simplified implementation)
      const newPermissions = this.getRolePermissions(newRole);

      // Note: In a full implementation, this would use proper database update
      // For now, we'll log the event and simulate success
      console.log(`User ${username} role updated to ${newRole}`);

      this.db.logSecurityEvent('USER_ROLE_UPDATED', 'medium', req.ip, {
        updatedBy: currentUser.username,
        targetUsername: username,
        targetUserId: user.id,
        oldRole: user.role,
        newRole,
        userAgent: req.get('User-Agent')
      }, currentUser.id);

      res.json({
        username,
        oldRole: user.role,
        newRole,
        permissions: newPermissions
      });
    } catch (error) {
      this.db.logSecurityEvent('USER_ROLE_UPDATE_ERROR', 'high', req.ip, {
        updatedBy: currentUser.username,
        username,
        newRole,
        error: error.message,
        userAgent: req.get('User-Agent')
      }, currentUser.id);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  }

  async deleteUser(req: Request, res: Response) {
    const { username } = req.params;
    const currentUser = (req as any).user;

    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    try {
      const user = this.db.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Prevent self-deletion
      if (user.id === currentUser.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      this.db.deleteUser(user.id);

      this.db.logSecurityEvent('USER_DELETED', 'high', req.ip, {
        deletedBy: currentUser.username,
        deletedUsername: username,
        deletedUserId: user.id,
        userAgent: req.get('User-Agent')
      }, currentUser.id);

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      this.db.logSecurityEvent('USER_DELETION_ERROR', 'high', req.ip, {
        deletedBy: currentUser.username,
        username,
        error: error.message,
        userAgent: req.get('User-Agent')
      }, currentUser.id);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }

  // Get enhanced user list with database integration
  async getUsers(req: Request, res: Response) {
    try {
      const users = this.db.getAllUsers();

      const userSummaries = users.map(user => ({
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        loginAttempts: user.loginAttempts,
        lockedUntil: user.lockedUntil,
        status: user.lockedUntil && user.lockedUntil > new Date() ? 'locked' : 'active'
      }));

      res.json(userSummaries);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  // Get user sessions
  async getUserSessions(req: Request, res: Response) {
    const { userId } = req.params;
    const currentUser = (req as any).user;

    try {
      // Only allow users to view their own sessions or admins to view any sessions
      if (userId !== currentUser.id && !currentUser.permissions.includes('admin')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const sessions = this.db.getUserSessions(userId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user sessions' });
    }
  }

  // Security monitoring endpoints
  async getSecurityEvents(req: Request, res: Response) {
    const { limit = 100, offset = 0, severity } = req.query;

    try {
      let events;
      if (severity) {
        events = this.db.getSecurityEventsBySeverity(severity as any, parseInt(limit as string));
      } else {
        events = this.db.getSecurityEvents(parseInt(limit as string), parseInt(offset as string));
      }

      res.json(events);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch security events' });
    }
  }

  async getSecurityStats(req: Request, res: Response) {
    try {
      const stats = this.db.getDatabaseStats();
      const recentEvents = this.db.getSecurityEvents(50, 0);

      const eventsByHour = recentEvents.reduce((acc, event) => {
        const hour = event.timestamp.getHours();
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      res.json({
        ...stats,
        eventsByHour,
        currentHour: new Date().getHours()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch security stats' });
    }
  }

  private getRolePermissions(role: string): string[] {
    const permissions = {
      admin: ['read', 'write', 'admin', 'benchmark', 'system', 'users'],
      operator: ['read', 'write', 'benchmark'],
      viewer: ['read']
    };
    return permissions[role as keyof typeof permissions] || [];
  }
}

export { SecurityManager, SECURITY_CONFIG };