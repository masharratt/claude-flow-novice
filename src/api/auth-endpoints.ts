/**
 * Authentication API Endpoints
 * 
 * RESTful API endpoints for user authentication, registration,
 * token management, and user profile operations.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { 
  AuthenticationService, 
  UserRegistrationRequest, 
  LoginRequest,
  AuthMiddleware 
} from '../services/authentication.js';
import { createLogger } from '../lib/logging.js';
import { StandardError, ErrorCode } from '../lib/errors.js';

const logger = createLogger('auth-endpoints');

// Extend Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        email: string;
        role: string;
      };
    }
  }
}

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username too long'),
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/\d/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
  role: z.enum(['admin', 'developer', 'readonly']).optional().default('developer'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'New password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'New password must contain at least one lowercase letter')
    .regex(/\d/, 'New password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'New password must contain at least one special character'),
});

const updateProfileSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username too long').optional(),
  email: z.string().email('Invalid email format').optional(),
}).refine(data => data.username || data.email, {
  message: 'At least one field must be provided for update',
});

// Rate limiting utilities
class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number }>();

  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const request = this.requests.get(key);

    if (!request || now > request.resetTime) {
      this.requests.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return true;
    }

    if (request.count >= limit) {
      return false;
    }

    request.count++;
    return true;
  }
}

const rateLimiter = new RateLimiter();

// Rate limiting middleware
function rateLimit(limit: number, windowMs: number, keyGenerator: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    
    if (!rateLimiter.isAllowed(key, limit, windowMs)) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again later.`,
        retryAfter: Math.ceil(windowMs / 1000),
      });
      return;
    }

    next();
  };
}

// Error handling middleware
function handleAuthError(error: any, req: Request, res: Response, next: NextFunction): void {
  logger.error('Authentication error:', error);

  if (error instanceof StandardError) {
    const statusCode = error.code === ErrorCode.CONFLICT ? 409 :
                      error.code === ErrorCode.NOT_FOUND ? 404 :
                      error.code === ErrorCode.VALIDATION_FAILED ? 400 :
                      error.code === ErrorCode.UNAUTHORIZED ? 401 :
                      error.code === ErrorCode.FORBIDDEN ? 403 :
                      error.code === ErrorCode.CONFLICT ? 409 : 500;

    res.status(statusCode).json({
      success: false,
      error: error.code,
      message: error.message,
      ...(error.metadata && { details: error.metadata }),
    });
    return;
  }

  // Zod validation errors
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      })),
    });
    return;
  }

  // Generic error
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}

// Authentication middleware
function authenticateUser(authMiddleware: AuthMiddleware) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Missing authentication credentials',
        });
        return;
      }

      const userContext = authMiddleware.extractUserContext(authHeader);
      
      // Attach user to request
      req.user = {
        userId: userContext.userId,
        username: userContext.username,
        email: userContext.email,
        role: userContext.role,
      };

      next();
    } catch (error) {
      if (error instanceof StandardError) {
        res.status(401).json({
          success: false,
          error: error.code,
          message: error.message,
        });
        return;
      }

      res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Invalid authentication token',
      });
    }
  };
}

// Authorization middleware
function authorizeUser(requiredRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      return;
    }

    if (!requiredRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Insufficient permissions',
        requiredRoles,
        userRole: req.user.role,
      });
      return;
    }

    next();
  };
}

/**
 * Create authentication router
 */
export function authenticationRouter(authService: AuthenticationService): Router {
  const router = Router();

  // Apply error handling middleware
  router.use(handleAuthError);

  // Initialize auth middleware for token validation
  const authMiddleware = new AuthMiddleware(
    process.env.JWT_SECRET || 'default-secret-change-in-production'
  );

  // POST /api/auth/register - Register new user
  router.post('/register',
    rateLimit(5, 15 * 60 * 1000, (req) => `register:${req.ip}`), // 5 attempts per 15 minutes per IP
    async (req: Request, res: Response): Promise<void> => {
      const validatedData = registerSchema.parse(req.body);

      try {
        const result = await authService.registerUser(validatedData);

        res.status(201).json({
          success: true,
          message: 'User registered successfully',
          user: {
            id: result.user.id,
            username: result.user.username,
            email: result.user.email,
            role: result.user.role,
            createdAt: result.user.createdAt,
          },
          tokens: result.tokens,
        });

        logger.info('User registration successful', { 
          userId: result.user.id, 
          email: result.user.email,
          ip: req.ip 
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/auth/login - User login
  router.post('/login',
    rateLimit(10, 15 * 60 * 1000, (req) => `login:${req.body.email || req.ip}`), // 10 attempts per 15 minutes per email/IP
    async (req: Request, res: Response): Promise<void> => {
      const validatedData = loginSchema.parse(req.body);

      try {
        const result = await authService.loginUser(
          validatedData, 
          req.ip, 
          req.headers['user-agent']
        );

        res.json({
          success: true,
          message: 'Login successful',
          user: {
            id: result.user.id,
            username: result.user.username,
            email: result.user.email,
            role: result.user.role,
            createdAt: result.user.createdAt,
            lastLogin: result.user.lastLogin,
          },
          tokens: result.tokens,
        });

        logger.info('User login successful', { 
          userId: result.user.id, 
          email: result.user.email,
          ip: req.ip 
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/auth/refresh - Refresh access token
  router.post('/refresh',
    rateLimit(20, 15 * 60 * 1000, (req) => `refresh:${req.ip}`), // 20 attempts per 15 minutes per IP
    async (req: Request, res: Response): Promise<void> => {
      const validatedData = refreshTokenSchema.parse(req.body);

      try {
        const tokens = await authService.refreshToken(validatedData.refreshToken);

        res.json({
          success: true,
          message: 'Tokens refreshed successfully',
          tokens,
        });

        logger.info('Token refresh successful', { ip: req.ip });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/auth/logout - User logout
  router.post('/logout',
    authenticateUser(authMiddleware),
    async (req: Request, res: Response): Promise<void> => {
      const { refreshToken } = req.body;
      const accessToken = req.headers.authorization!;

      try {
        await authService.logout(req.user!.userId, accessToken, refreshToken);

        res.json({
          success: true,
          message: 'Logout successful',
        });

        logger.info('User logout successful', { 
          userId: req.user!.userId,
          ip: req.ip 
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/auth/logout-all - Logout from all sessions
  router.post('/logout-all',
    authenticateUser(authMiddleware),
    async (req: Request, res: Response): Promise<void> => {
      const accessToken = req.headers.authorization!;

      try {
        await authService.logoutAllSessions(req.user!.userId, accessToken);

        res.json({
          success: true,
          message: 'All sessions terminated successfully',
        });

        logger.info('All sessions terminated', { 
          userId: req.user!.userId,
          ip: req.ip 
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /api/auth/profile - Get user profile
  router.get('/profile',
    authenticateUser(authMiddleware),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const profile = await authService.getUserProfile(req.user!.userId);

        res.json({
          success: true,
          user: profile,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // PUT /api/auth/profile - Update user profile
  router.put('/profile',
    authenticateUser(authMiddleware),
    rateLimit(5, 15 * 60 * 1000, (req) => `profile:${req.user!.userId}`), // 5 updates per 15 minutes per user
    async (req: Request, res: Response): Promise<void> => {
      const validatedData = updateProfileSchema.parse(req.body);

      try {
        const updatedProfile = await authService.updateUserProfile(
          req.user!.userId, 
          validatedData
        );

        res.json({
          success: true,
          message: 'Profile updated successfully',
          user: updatedProfile,
        });

        logger.info('Profile updated successfully', { 
          userId: req.user!.userId,
          ip: req.ip 
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/auth/change-password - Change password
  router.post('/change-password',
    authenticateUser(authMiddleware),
    rateLimit(3, 15 * 60 * 1000, (req) => `password:${req.user!.userId}`), // 3 attempts per 15 minutes per user
    async (req: Request, res: Response): Promise<void> => {
      const validatedData = changePasswordSchema.parse(req.body);

      try {
        await authService.changePassword(
          req.user!.userId,
          validatedData.currentPassword,
          validatedData.newPassword
        );

        res.json({
          success: true,
          message: 'Password changed successfully',
        });

        logger.info('Password changed successfully', { 
          userId: req.user!.userId,
          ip: req.ip 
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /api/auth/sessions - Get active sessions
  router.get('/sessions',
    authenticateUser(authMiddleware),
    async (req: Request, res: Response): Promise<void> => {
      try {
        // This would require extending the authentication service
        // to support session listing functionality
        res.json({
          success: true,
          message: 'Session listing not yet implemented',
          sessions: [],
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // DELETE /api/auth/sessions/:sessionId - Terminate specific session
  router.delete('/sessions/:sessionId',
    authenticateUser(authMiddleware),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { sessionId } = req.params;
        
        // This would require extending the authentication service
        // to support specific session termination
        res.json({
          success: true,
          message: 'Session termination not yet implemented',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/auth/request-password-reset - Request password reset
  router.post('/request-password-reset',
    rateLimit(3, 15 * 60 * 1000, (req) => `reset:${req.body.email || req.ip}`), // 3 attempts per 15 minutes per email/IP
    async (req: Request, res: Response): Promise<void> => {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Email is required',
        });
        return;
      }

      // This would require implementing password reset functionality
      res.json({
        success: true,
        message: 'Password reset functionality not yet implemented',
      });

      logger.info('Password reset requested', { email, ip: req.ip });
    }
  );

  // POST /api/auth/reset-password - Reset password with token
  router.post('/reset-password',
    rateLimit(5, 60 * 60 * 1000, (req) => `reset-confirm:${req.ip}`), // 5 attempts per hour per IP
    async (req: Request, res: Response): Promise<void> => {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Reset token and new password are required',
        });
        return;
      }

      // This would require implementing password reset confirmation
      res.json({
        success: true,
        message: 'Password reset confirmation not yet implemented',
      });

      logger.info('Password reset confirmation attempted', { ip: req.ip });
    }
  );

  // GET /api/auth/verify-token - Verify token validity
  router.get('/verify-token',
    authenticateUser(authMiddleware),
    async (req: Request, res: Response): Promise<void> => {
      res.json({
        success: true,
        message: 'Token is valid',
        user: req.user,
      });
    }
  );

  return router;
}

export {
  authenticateUser,
  authorizeUser,
  rateLimit,
  handleAuthError,
};