/**
 * Authentication Service
 * 
 * Comprehensive authentication service with JWT tokens, refresh tokens,
 * session management, and security features.
 */

import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import { Database } from 'better-sqlite3';
import { createLogger } from '../lib/logging.js';
import { StandardError, ErrorCode } from '../lib/errors.js';
import { AuthMiddleware } from '../middleware/auth-middleware.js';

const logger = createLogger('authentication-service');

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  isActive?: boolean;
}

export interface UserRegistrationRequest {
  username: string;
  email: string;
  password: string;
  role?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface AuthConfig {
  redis: Redis;
  database: Database;
  jwtSecret: string;
  jwtExpiration?: string;
  refreshExpiration?: string;
  maxSessionsPerUser?: number;
  maxLoginAttempts?: number;
  lockoutDuration?: number;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: Date;
  lastLogin?: Date;
}

export class AuthenticationService {
  private redis: Redis;
  private database: Database;
  private authMiddleware: AuthMiddleware;
  private config: Required<Omit<AuthConfig, 'redis' | 'database' | 'authMiddleware'>>;

  constructor(config: AuthConfig) {
    this.redis = config.redis;
    this.database = config.database;
    this.authMiddleware = new AuthMiddleware(config.jwtSecret);
    
    this.config = {
      jwtExpiration: config.jwtExpiration || '15m',
      refreshExpiration: config.refreshExpiration || '7d',
      maxSessionsPerUser: config.maxSessionsPerUser || 3,
      maxLoginAttempts: config.maxLoginAttempts || 5,
      lockoutDuration: config.lockoutDuration || 15 * 60 * 1000, // 15 minutes
    };

    this.initializeDatabase();
  }

  /**
   * Initialize database tables for user management
   */
  private initializeDatabase(): void {
    try {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'developer',
          is_active BOOLEAN DEFAULT true,
          failed_login_attempts INTEGER DEFAULT 0,
          locked_until TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
      `);

      logger.info('Database tables initialized for authentication service');
    } catch (error) {
      logger.error('Failed to initialize database tables:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to initialize authentication service',
        {},
        error as Error
      );
    }
  }

  /**
   * Register a new user
   */
  async registerUser(userData: UserRegistrationRequest): Promise<{ user: UserProfile; tokens: TokenPair }> {
    try {
      // Validate input
      this.validateRegistrationData(userData);

      // Check if user already exists
      const existingUser = this.database.prepare(`
        SELECT id FROM users WHERE email = ? OR username = ?
      `).get(userData.email, userData.username);

      if (existingUser) {
        throw new StandardError(
          ErrorCode.CONFLICT,
          'User with this email or username already exists',
          { field: existingUser.id ? 'email' : 'username' }
        );
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, 12);

      // Create user
      const userId = this.generateId();
      const now = new Date().toISOString();

      this.database.prepare(`
        INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        userData.username,
        userData.email,
        passwordHash,
        userData.role || 'developer',
        now,
        now
      );

      const user: UserProfile = {
        id: userId,
        username: userData.username,
        email: userData.email,
        role: userData.role || 'developer',
        createdAt: new Date(now),
      };

      // Generate tokens
      const tokens = await this.generateTokenPair(user);

      logger.info('User registered successfully', { userId, email: userData.email });

      return { user, tokens };
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      logger.error('User registration failed:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Registration failed',
        {},
        error as Error
      );
    }
  }

  /**
   * Authenticate user and generate tokens
   */
  async loginUser(loginData: LoginRequest, ipAddress?: string, userAgent?: string): Promise<{ user: UserProfile; tokens: TokenPair }> {
    try {
      // Get user by email
      const user = this.database.prepare(`
        SELECT id, username, email, password_hash, role, is_active, failed_login_attempts, locked_until
        FROM users WHERE email = ?
      `).get(loginData.email) as any;

      if (!user) {
        await this.recordFailedLogin(loginData.email, ipAddress);
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Invalid email or password',
          { code: 'INVALID_CREDENTIALS' }
        );
      }

      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Account temporarily locked due to too many failed login attempts',
          { 
            code: 'ACCOUNT_LOCKED',
            lockedUntil: user.locked_until
          }
        );
      }

      // Check if account is active
      if (!user.is_active) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Account is deactivated',
          { code: 'ACCOUNT_DEACTIVATED' }
        );
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(loginData.password, user.password_hash);
      if (!isPasswordValid) {
        await this.recordFailedLogin(loginData.email, ipAddress);
        await this.incrementFailedAttempts(user.id);
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Invalid email or password',
          { code: 'INVALID_CREDENTIALS' }
        );
      }

      // Reset failed attempts on successful login
      await this.resetFailedAttempts(user.id);

      // Update last login
      this.database.prepare(`
        UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?
      `).run(new Date().toISOString(), new Date().toISOString(), user.id);

      const userProfile: UserProfile = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: new Date(user.created_at),
        lastLogin: new Date(),
      };

      // Manage concurrent sessions
      await this.manageConcurrentSessions(user.id);

      // Generate tokens
      const tokens = await this.generateTokenPair(userProfile, ipAddress, userAgent);

      logger.info('User logged in successfully', { 
        userId: user.id, 
        email: user.email,
        ipAddress 
      });

      return { user: userProfile, tokens };
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      logger.error('Login failed:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Login failed',
        {},
        error as Error
      );
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      // Validate refresh token
      const tokenData = await this.validateRefreshToken(refreshToken);
      
      // Get current user data
      const user = this.database.prepare(`
        SELECT id, username, email, role, is_active
        FROM users WHERE id = ? AND is_active = true
      `).get(tokenData.userId) as any;

      if (!user) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'User not found or inactive',
          { code: 'USER_INACTIVE' }
        );
      }

      const userProfile: UserProfile = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: new Date(),
      };

      // Generate new token pair (refresh token rotation)
      const tokens = await this.generateTokenPair(userProfile);

      // Invalidate old refresh token (rotation)
      await this.invalidateRefreshToken(refreshToken);

      logger.info('Token refreshed successfully', { userId: user.id });

      return tokens;
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      logger.error('Token refresh failed:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Token refresh failed',
        {},
        error as Error
      );
    }
  }

  /**
   * Logout user and invalidate tokens
   */
  async logout(userId: string, accessToken: string, refreshToken?: string): Promise<void> {
    try {
      const tokenPayload = this.authMiddleware.validateToken(accessToken);
      
      // Invalidate access token (add to blacklist)
      await this.addToBlacklist(accessToken, tokenPayload.exp);

      // Invalidate refresh token if provided
      if (refreshToken) {
        await this.invalidateRefreshToken(refreshToken);
      }

      // Remove session
      await this.removeSession(userId, tokenPayload.jti);

      logger.info('User logged out successfully', { userId });
    } catch (error) {
      logger.error('Logout failed:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Logout failed',
        {},
        error as Error
      );
    }
  }

  /**
   * Logout from all sessions
   */
  async logoutAllSessions(userId: string, accessToken: string): Promise<void> {
    try {
      // Get all user sessions
      const sessionKey = `sessions:${userId}`;
      const sessionIds = await this.redis.smembers(sessionKey);

      // Remove all sessions
      for (const sessionId of sessionIds) {
        await this.redis.del(`session:${sessionId}`);
      }

      // Clear session set
      await this.redis.del(sessionKey);

      // Blacklist current access token
      const tokenPayload = this.authMiddleware.validateToken(accessToken);
      await this.addToBlacklist(accessToken, tokenPayload.exp);

      logger.info('All sessions terminated', { userId, sessionCount: sessionIds.length });
    } catch (error) {
      logger.error('Logout all sessions failed:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to terminate all sessions',
        {},
        error as Error
      );
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    try {
      const user = this.database.prepare(`
        SELECT id, username, email, role, created_at, last_login
        FROM users WHERE id = ? AND is_active = true
      `).get(userId) as any;

      if (!user) {
        throw new StandardError(
          ErrorCode.NOT_FOUND,
          'User not found',
          { code: 'USER_NOT_FOUND' }
        );
      }

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: new Date(user.created_at),
        lastLogin: user.last_login ? new Date(user.last_login) : undefined,
      };
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      logger.error('Get user profile failed:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to get user profile',
        {},
        error as Error
      );
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: Partial<{ username: string; email: string }>): Promise<UserProfile> {
    try {
      // Validate updates
      if (updates.username) {
        this.validateUsername(updates.username);
        
        // Check if username is already taken
        const existingUser = this.database.prepare(`
          SELECT id FROM users WHERE username = ? AND id != ?
        `).get(updates.username, userId);

        if (existingUser) {
          throw new StandardError(
            ErrorCode.CONFLICT,
            'Username already taken',
            { field: 'username' }
          );
        }
      }

      if (updates.email) {
        this.validateEmail(updates.email);
        
        // Check if email is already taken
        const existingUser = this.database.prepare(`
          SELECT id FROM users WHERE email = ? AND id != ?
        `).get(updates.email, userId);

        if (existingUser) {
          throw new StandardError(
            ErrorCode.CONFLICT,
            'Email already taken',
            { field: 'email' }
          );
        }
      }

      // Build update query
      const fields = [];
      const values = [];
      
      if (updates.username) {
        fields.push('username = ?');
        values.push(updates.username);
      }
      
      if (updates.email) {
        fields.push('email = ?');
        values.push(updates.email);
      }
      
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(userId);

      // Update user
      if (fields.length > 1) {
        this.database.prepare(`
          UPDATE users SET ${fields.join(', ')} WHERE id = ?
        `).run(...values);
      }

      // Return updated profile
      return await this.getUserProfile(userId);
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      logger.error('Update user profile failed:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to update profile',
        {},
        error as Error
      );
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      // Validate new password
      this.validatePasswordStrength(newPassword);

      // Get current user
      const user = this.database.prepare(`
        SELECT id, password_hash
        FROM users WHERE id = ? AND is_active = true
      `).get(userId) as any;

      if (!user) {
        throw new StandardError(
          ErrorCode.NOT_FOUND,
          'User not found',
          { code: 'USER_NOT_FOUND' }
        );
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isCurrentPasswordValid) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Current password is incorrect',
          { code: 'INVALID_CURRENT_PASSWORD' }
        );
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      this.database.prepare(`
        UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
      `).run(newPasswordHash, new Date().toISOString(), userId);

      // Invalidate all sessions (force re-login)
      await this.logoutAllSessions(userId, '');

      logger.info('Password changed successfully', { userId });
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      logger.error('Change password failed:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to change password',
        {},
        error as Error
      );
    }
  }

  /**
   * Generate token pair for user
   */
  private async generateTokenPair(
    user: UserProfile, 
    ipAddress?: string, 
    userAgent?: string
  ): Promise<TokenPair> {
    try {
      // Generate access token
      const accessToken = this.authMiddleware.generateToken(
        user.id,
        user.username,
        user.role as any,
        user.email
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { 
          userId: user.id,
          type: 'refresh',
          sessionId: this.generateId(),
        },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: this.config.refreshExpiration }
      );

      // Store refresh token in Redis
      const refreshKey = `refresh:${refreshToken}`;
      const refreshData = {
        userId: user.id,
        type: 'refresh',
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
      };

      await this.redis.setex(
        refreshKey,
        this.parseExpiration(this.config.refreshExpiration),
        JSON.stringify(refreshData)
      );

      // Store session
      const sessionId = this.generateId();
      const sessionKey = `session:${sessionId}`;
      const sessionData = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
      };

      await this.redis.setex(
        sessionKey,
        this.parseExpiration(this.config.jwtExpiration),
        JSON.stringify(sessionData)
      );

      // Add session to user's session set
      await this.redis.sadd(`sessions:${user.id}`, sessionId);
      await this.redis.expire(`sessions:${user.id}`, this.parseExpiration(this.config.refreshExpiration));

      return {
        accessToken,
        refreshToken,
        expiresIn: this.parseExpiration(this.config.jwtExpiration),
        tokenType: 'Bearer',
      };
    } catch (error) {
      logger.error('Token generation failed:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to generate tokens',
        {},
        error as Error
      );
    }
  }

  /**
   * Validate refresh token
   */
  private async validateRefreshToken(refreshToken: string): Promise<any> {
    try {
      // Check if refresh token exists in Redis
      const refreshKey = `refresh:${refreshToken}`;
      const tokenData = await this.redis.get(refreshKey);

      if (!tokenData) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Invalid or expired refresh token',
          { code: 'INVALID_REFRESH_TOKEN' }
        );
      }

      // Verify JWT token
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'default-secret') as any;
      
      if (decoded.type !== 'refresh') {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Invalid token type',
          { code: 'INVALID_TOKEN_TYPE' }
        );
      }

      return decoded;
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Refresh token has expired',
          { code: 'REFRESH_TOKEN_EXPIRED' }
        );
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Invalid refresh token',
          { code: 'INVALID_REFRESH_TOKEN' }
        );
      }
      throw error;
    }
  }

  /**
   * Invalidate refresh token
   */
  private async invalidateRefreshToken(refreshToken: string): Promise<void> {
    try {
      const refreshKey = `refresh:${refreshToken}`;
      await this.redis.del(refreshKey);
    } catch (error) {
      logger.error('Failed to invalidate refresh token:', error);
    }
  }

  /**
   * Add token to blacklist
   */
  private async addToBlacklist(token: string, expirationTime: number): Promise<void> {
    try {
      const blacklistKey = `blacklist:${this.hashToken(token)}`;
      const ttl = expirationTime - Math.floor(Date.now() / 1000);
      
      if (ttl > 0) {
        await this.redis.setex(blacklistKey, ttl, '1');
      }
    } catch (error) {
      logger.error('Failed to add token to blacklist:', error);
    }
  }

  /**
   * Remove session
   */
  private async removeSession(userId: string, sessionId: string): Promise<void> {
    try {
      await this.redis.del(`session:${sessionId}`);
      await this.redis.srem(`sessions:${userId}`, sessionId);
    } catch (error) {
      logger.error('Failed to remove session:', error);
    }
  }

  /**
   * Manage concurrent sessions
   */
  private async manageConcurrentSessions(userId: string): Promise<void> {
    try {
      const sessionKey = `sessions:${userId}`;
      const sessionIds = await this.redis.smembers(sessionKey);

      if (sessionIds.length >= this.config.maxSessionsPerUser) {
        // Remove oldest session
        const oldestSessionId = sessionIds[0];
        await this.removeSession(userId, oldestSessionId);
      }
    } catch (error) {
      logger.error('Failed to manage concurrent sessions:', error);
    }
  }

  /**
   * Record failed login attempt
   */
  private async recordFailedLogin(email: string, ipAddress?: string): Promise<void> {
    try {
      const key = `failed_login:${email}:${ipAddress || 'unknown'}`;
      await this.redis.incr(key);
      await this.redis.expire(key, this.config.lockoutDuration / 1000);
    } catch (error) {
      logger.error('Failed to record failed login:', error);
    }
  }

  /**
   * Increment failed login attempts for user
   */
  private async incrementFailedAttempts(userId: string): Promise<void> {
    try {
      const user = this.database.prepare(`
        SELECT failed_login_attempts FROM users WHERE id = ?
      `).get(userId) as any;

      if (user) {
        const newAttempts = user.failed_login_attempts + 1;
        const lockedUntil = newAttempts >= this.config.maxLoginAttempts 
          ? new Date(Date.now() + this.config.lockoutDuration).toISOString()
          : null;

        this.database.prepare(`
          UPDATE users SET failed_login_attempts = ?, locked_until = ?, updated_at = ?
          WHERE id = ?
        `).run(newAttempts, lockedUntil, new Date().toISOString(), userId);
      }
    } catch (error) {
      logger.error('Failed to increment failed attempts:', error);
    }
  }

  /**
   * Reset failed login attempts for user
   */
  private async resetFailedAttempts(userId: string): Promise<void> {
    try {
      this.database.prepare(`
        UPDATE users SET failed_login_attempts = 0, locked_until = null, updated_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), userId);
    } catch (error) {
      logger.error('Failed to reset failed attempts:', error);
    }
  }

  /**
   * Validation methods
   */
  private validateRegistrationData(data: UserRegistrationRequest): void {
    if (!data.username || data.username.trim().length < 3) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Username must be at least 3 characters long',
        { field: 'username' }
      );
    }

    this.validateUsername(data.username);
    this.validateEmail(data.email);
    this.validatePasswordStrength(data.password);

    if (data.role && !['admin', 'developer', 'readonly'].includes(data.role)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Invalid role specified',
        { field: 'role' }
      );
    }
  }

  private validateUsername(username: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Username can only contain letters, numbers, underscores, and hyphens',
        { field: 'username' }
      );
    }
  }

  private validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Invalid email format',
        { field: 'email' }
      );
    }
  }

  private validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Password must be at least 8 characters long',
        { field: 'password' }
      );
    }

    if (!/[A-Z]/.test(password)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Password must contain at least one uppercase letter',
        { field: 'password' }
      );
    }

    if (!/[a-z]/.test(password)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Password must contain at least one lowercase letter',
        { field: 'password' }
      );
    }

    if (!/\d/.test(password)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Password must contain at least one number',
        { field: 'password' }
      );
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Password must contain at least one special character',
        { field: 'password' }
      );
    }
  }

  /**
   * Utility methods
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 3600; // Default to 1 hour
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 3600;
    }
  }

  private hashToken(token: string): string {
    return token.split('').reduce((acc, char) => {
      acc = ((acc << 5) - acc) + char.charCodeAt(0);
      return acc & acc;
    }, 0).toString(36);
  }
}