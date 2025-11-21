/**
 * User Service
 *
 * Comprehensive user management service with authentication, authorization,
 * and security features for the CFN Loop system.
 */

import { DatabaseService } from '../lib/database-service/index.js';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, UserStatus, CreateUserRequest, UpdateUserRequest, UserSecurity } from '../types/user.js';
import { PasswordUtils, JWTUtils, AuthRateLimit } from '../middleware/authentication.js';
import { AuthMiddleware, UserContext, RBACEnforcer, PromotionOperation } from '../middleware/auth-middleware.js';
import { createLogger } from '../lib/logging.js';
import { StandardError, ErrorCode } from '../lib/errors.js';

const logger = createLogger('user-service');

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName?: string;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  profile: {
    displayName: string;
    firstName: string;
    lastName: string;
    bio?: string;
    avatar?: string;
  };
  security: {
    emailVerified: boolean;
    twoFactorEnabled: boolean;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserServiceConfig {
  jwtSecret: string;
  jwtExpiration: string;
  refreshExpiration: string;
  bcryptRounds: number;
  maxLoginAttempts: number;
  loginLockoutMs: number;
  emailVerificationRequired: boolean;
  twoFactorRequired: boolean;
}

/**
 * User Service Class
 *
 * Manages user lifecycle, authentication, and authorization.
 */
export class UserService {
  private db: DatabaseService;
  private authMiddleware: AuthMiddleware;
  private rbacEnforcer: RBACEnforcer;
  private config: UserServiceConfig;

  constructor(db: DatabaseService, config: UserServiceConfig) {
    this.db = db;
    this.config = config;
    this.authMiddleware = new AuthMiddleware(config.jwtSecret);
    this.rbacEnforcer = new RBACEnforcer(this.authMiddleware);
  }

  /**
   * Initialize the user service
   * Creates necessary tables and indexes if they don't exist
   */
  async initialize(): Promise<void> {
    try {
      const sqliteAdapter = this.db.getAdapter('sqlite');
      
      // Create users table
      await sqliteAdapter.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          status TEXT NOT NULL DEFAULT 'pending_verification',
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          profile_json TEXT NOT NULL,
          privacy_json TEXT NOT NULL,
          preferences_json TEXT NOT NULL,
          security_json TEXT NOT NULL,
          stats_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_login_at INTEGER,
          email_verified_at INTEGER,
          phone_verified_at INTEGER
        )
      `);

      // Create refresh tokens table
      await sqliteAdapter.execute(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          last_used_at INTEGER,
          is_revoked BOOLEAN DEFAULT FALSE,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create password reset tokens table
      await sqliteAdapter.execute(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          used_at INTEGER,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create email verification tokens table
      await sqliteAdapter.execute(`
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          email TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          verified_at INTEGER,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create indexes
      await sqliteAdapter.execute('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)');
      await sqliteAdapter.execute('CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)');
      await sqliteAdapter.execute('CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)');
      await sqliteAdapter.execute('CREATE INDEX IF NOT EXISTS idx_users_status ON users (status)');
      await sqliteAdapter.execute('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id)');
      await sqliteAdapter.execute('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at)');

      logger.info('User service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize user service:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to initialize user service',
        {},
        error as Error
      );
    }
  }

  /**
   * Register a new user
   */
  async register(request: RegisterRequest): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const { username, email, password, firstName, lastName, displayName } = request;

    try {
      // Validate input
      this.validateEmail(email);
      this.validateUsername(username);
      this.validatePassword(password);

      // Check if user already exists
      const existingUser = await this.findUserByEmailOrUsername(email, username);
      if (existingUser) {
        throw new StandardError(
          ErrorCode.CONFLICT,
          existingUser.email === email ? 'Email already registered' : 'Username already taken',
          { field: existingUser.email === email ? 'email' : 'username' }
        );
      }

      // Hash password
      const salt = await PasswordUtils.generateSalt();
      const passwordHash = await PasswordUtils.hashPassword(password, this.config.bcryptRounds);

      // Create user
      const now = Math.floor(Date.now() / 1000);
      const userId = uuidv4();

      const user: User = {
        id: userId,
        username,
        email,
        role: UserRole.USER,
        status: this.config.emailVerificationRequired ? UserStatus.PENDING_VERIFICATION : UserStatus.ACTIVE,
        profile: {
          firstName,
          lastName,
          displayName: displayName || `${firstName} ${lastName}`,
        },
        privacy: {
          profileVisibility: 'public',
          allowFriendRequests: true,
          allowMessages: true,
          allowStoryTagging: true,
          allowLocationSharing: false,
          showOnlineStatus: true,
        },
        preferences: {
          theme: 'auto',
          language: 'en',
          timezone: 'UTC',
          emailNotifications: true,
          pushNotifications: true,
          autoSaveStories: true,
          storyVisibilityDefault: 'private',
        },
        security: {
          email,
          emailVerified: !this.config.emailVerificationRequired,
          twoFactorEnabled: false,
          loginAttempts: 0,
        },
        stats: {
          storiesCount: 0,
          friendsCount: 0,
          followersCount: 0,
          followingCount: 0,
        },
        createdAt: new Date(now * 1000),
        updatedAt: new Date(now * 1000),
      };

      // Save user to database
      await this.saveUser(user, passwordHash, salt);

      // Create email verification token if required
      if (this.config.emailVerificationRequired) {
        await this.createEmailVerificationToken(userId, email);
      }

      // Generate tokens
      const tokens = await this.generateAuthTokens(user);

      // Log user registration
      logger.info('User registered successfully', { userId, username, email });

      return {
        user: this.toPublicUser(user),
        tokens,
      };
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      logger.error('User registration failed:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'User registration failed',
        {},
        error as Error
      );
    }
  }

  /**
   * Authenticate user and generate tokens
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    const { email, password, rememberMe } = request;

    try {
      // Check rate limiting
      if (AuthRateLimit.hasExceededAttempts(email, this.config.maxLoginAttempts, this.config.loginLockoutMs)) {
        throw new StandardError(
          ErrorCode.TOO_MANY_REQUESTS,
          'Too many login attempts. Please try again later.',
          { retryAfter: Math.ceil(this.config.loginLockoutMs / 1000) }
        );
      }

      // Find user by email
      const user = await this.findUserByEmail(email);
      if (!user) {
        AuthRateLimit.hasExceededAttempts(email, this.config.maxLoginAttempts, this.config.loginLockoutMs);
        throw new StandardError(
          ErrorCode.NOT_FOUND,
          'Invalid email or password'
        );
      }

      // Check user status
      if (user.status === UserStatus.SUSPENDED) {
        throw new StandardError(
          ErrorCode.FORBIDDEN,
          'Account suspended. Please contact support.'
        );
      }

      if (user.status === UserStatus.INACTIVE) {
        throw new StandardError(
          ErrorCode.FORBIDDEN,
          'Account inactive. Please contact support.'
        );
      }

      // Get user credentials
      const credentials = await this.getUserCredentials(user.id);
      if (!credentials) {
        throw new StandardError(
          ErrorCode.INTERNAL_ERROR,
          'User credentials not found'
        );
      }

      // Verify password
      const isPasswordValid = await PasswordUtils.comparePassword(password, credentials.passwordHash);
      if (!isPasswordValid) {
        AuthRateLimit.hasExceededAttempts(email, this.config.maxLoginAttempts, this.config.loginLockoutMs);
        
        // Update failed login attempts
        await this.updateFailedLoginAttempts(user.id, user.security.loginAttempts + 1);
        
        throw new StandardError(
          ErrorCode.NOT_FOUND,
          'Invalid email or password'
        );
      }

      // Clear failed login attempts
      AuthRateLimit.clearAttempts(email);
      await this.updateFailedLoginAttempts(user.id, 0);

      // Update last login
      await this.updateLastLogin(user.id);

      // Generate tokens
      const tokens = await this.generateAuthTokens(user, rememberMe);

      // Log successful login
      logger.info('User logged in successfully', { userId: user.id, email });

      return {
        user: this.toPublicUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      };
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
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      // Validate refresh token
      const payload = JWTUtils.verifyToken(refreshToken, this.config.jwtSecret);
      if (payload.type !== 'refresh') {
        throw new StandardError(
          ErrorCode.INVALID_TOKEN,
          'Invalid refresh token'
        );
      }

      // Check if refresh token exists and is not revoked
      const tokenRecord = await this.findRefreshToken(payload.jti!, payload.userId);
      if (!tokenRecord || tokenRecord.isRevoked) {
        throw new StandardError(
          ErrorCode.INVALID_TOKEN,
          'Invalid or revoked refresh token'
        );
      }

      // Find user
      const user = await this.findUserById(payload.userId);
      if (!user) {
        throw new StandardError(
          ErrorCode.NOT_FOUND,
          'User not found'
        );
      }

      // Check user status
      if (user.status !== UserStatus.ACTIVE) {
        throw new StandardError(
          ErrorCode.FORBIDDEN,
          'Account is not active'
        );
      }

      // Revoke old refresh token
      await this.revokeRefreshToken(payload.jti!);

      // Generate new tokens
      const tokens = await this.generateAuthTokens(user);

      // Update last used timestamp
      await this.updateRefreshTokenLastUsed(payload.jti!);

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
   * Logout user and revoke tokens
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      // Validate refresh token
      const payload = JWTUtils.decodeToken(refreshToken);
      if (!payload || payload.type !== 'refresh') {
        return; // Invalid token, just return success
      }

      // Revoke refresh token
      if (payload.jti) {
        await this.revokeRefreshToken(payload.jti);
      }

      logger.info('User logged out successfully', { userId: payload.userId });
    } catch (error) {
      logger.error('Logout failed:', error);
      // Don't throw error on logout to prevent client issues
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<PublicUser | null> {
    try {
      const user = await this.findUserById(userId);
      return user ? this.toPublicUser(user) : null;
    } catch (error) {
      logger.error('Failed to get user by ID:', error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: UpdateUserRequest): Promise<PublicUser> {
    try {
      const user = await this.findUserById(userId);
      if (!user) {
        throw new StandardError(
          ErrorCode.NOT_FOUND,
          'User not found'
        );
      }

      // Update user
      const updatedUser = {
        ...user,
        profile: {
          ...user.profile,
          ...updates.profile,
        },
        privacy: {
          ...user.privacy,
          ...updates.privacy,
        },
        preferences: {
          ...user.preferences,
          ...updates.preferences,
        },
        updatedAt: new Date(),
      };

      await this.saveUser(updatedUser);

      logger.info('User profile updated successfully', { userId });

      return this.toPublicUser(updatedUser);
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      logger.error('Failed to update user profile:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to update user profile',
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
      this.validatePassword(newPassword);

      // Get current credentials
      const credentials = await this.getUserCredentials(userId);
      if (!credentials) {
        throw new StandardError(
          ErrorCode.NOT_FOUND,
          'User not found'
        );
      }

      // Verify current password
      const isCurrentPasswordValid = await PasswordUtils.comparePassword(currentPassword, credentials.passwordHash);
      if (!isCurrentPasswordValid) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Current password is incorrect'
        );
      }

      // Hash new password
      const salt = await PasswordUtils.generateSalt();
      const newPasswordHash = await PasswordUtils.hashPassword(newPassword, this.config.bcryptRounds);

      // Update password
      await this.updateUserPassword(userId, newPasswordHash, salt);

      // Revoke all refresh tokens for this user
      await this.revokeAllUserRefreshTokens(userId);

      logger.info('Password changed successfully', { userId });
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      logger.error('Failed to change password:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to change password',
        {},
        error as Error
      );
    }
  }

  /**
   * Validate JWT token and return user context
   */
  async validateToken(token: string): Promise<UserContext> {
    try {
      return this.authMiddleware.validateToken(token);
    } catch (error) {
      throw new StandardError(
        ErrorCode.INVALID_TOKEN,
        'Invalid authentication token',
        {},
        error as Error
      );
    }
  }

  /**
   * Check if user has permission for an operation
   */
  async checkPermission(userContext: UserContext, operation: PromotionOperation): Promise<boolean> {
    try {
      return this.rbacEnforcer.hasPermission(userContext, operation);
    } catch (error) {
      logger.error('Permission check failed:', error);
      return false;
    }
  }

  /**
   * Enforce permission check - throws if user lacks permission
   */
  async enforcePermission(userContext: UserContext, operation: PromotionOperation, skillId?: string): Promise<void> {
    try {
      this.rbacEnforcer.enforcePermission(userContext, operation, skillId);
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }
      throw new StandardError(
        ErrorCode.FORBIDDEN,
        'Permission check failed',
        {},
        error as Error
      );
    }
  }

  // Private helper methods

  private validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Invalid email format'
      );
    }
  }

  private validateUsername(username: string): void {
    if (username.length < 3 || username.length > 30) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Username must be between 3 and 30 characters'
      );
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Username can only contain letters, numbers, underscores, and hyphens'
      );
    }
  }

  private validatePassword(password: string): void {
    if (!PasswordUtils.validatePasswordStrength(password)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character'
      );
    }
  }

  private async generateAuthTokens(user: User, rememberMe: boolean = false): Promise<AuthTokens> {
    const expiresIn = rememberMe ? '30d' : this.config.jwtExpiration;
    const refreshExpiresIn = rememberMe ? '90d' : this.config.refreshExpiration;

    // Generate access token
    const accessTokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };
    const accessToken = JWTUtils.generateToken(accessTokenPayload, this.config.jwtSecret, expiresIn);

    // Generate refresh token
    const refreshTokenId = uuidv4();
    const refreshTokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
      jti: refreshTokenId,
    };
    const refreshToken = JWTUtils.generateToken(refreshTokenPayload, this.config.jwtSecret, refreshExpiresIn);

    // Save refresh token to database
    const now = Math.floor(Date.now() / 1000);
    const refreshTokenHash = await PasswordUtils.hashPassword(refreshToken, 10);
    const expiresAt = now + (rememberMe ? 90 * 24 * 60 * 60 : 7 * 24 * 60 * 60); // 90 days or 7 days

    await this.saveRefreshToken(refreshTokenId, user.id, refreshTokenHash, expiresAt);

    // Calculate expiresIn in seconds
    const expiresInSeconds = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60; // 30 days or 24 hours

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresInSeconds,
    };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      profile: {
        displayName: user.profile.displayName,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        bio: user.profile.bio,
        avatar: user.profile.avatar,
      },
      security: {
        emailVerified: user.security.emailVerified,
        twoFactorEnabled: user.security.twoFactorEnabled,
      },
    };
  }

  // Database helper methods

  private async findUserById(userId: string): Promise<User | null> {
    const adapter = this.db.getAdapter('sqlite');
    const row = await adapter.get(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
    return row ? this.rowToUser(row) : null;
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    const adapter = this.db.getAdapter('sqlite');
    const row = await adapter.get(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return row ? this.rowToUser(row) : null;
  }

  private async findUserByEmailOrUsername(email: string, username: string): Promise<User | null> {
    const adapter = this.db.getAdapter('sqlite');
    const row = await adapter.get(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    return row ? this.rowToUser(row) : null;
  }

  private async getUserCredentials(userId: string): Promise<{ passwordHash: string; salt: string } | null> {
    const adapter = this.db.getAdapter('sqlite');
    const row = await adapter.get(
      'SELECT password_hash, salt FROM users WHERE id = ?',
      [userId]
    );
    return row ? { passwordHash: row.password_hash, salt: row.salt } : null;
  }

  private async saveUser(user: User, passwordHash?: string, salt?: string): Promise<void> {
    const adapter = this.db.getAdapter('sqlite');
    const now = Math.floor(Date.now() / 1000);

    await adapter.execute(`
      INSERT OR REPLACE INTO users (
        id, username, email, role, status, password_hash, salt,
        profile_json, privacy_json, preferences_json, security_json, stats_json,
        created_at, updated_at, last_login_at, email_verified_at, phone_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      user.id,
      user.username,
      user.email,
      user.role,
      user.status,
      passwordHash,
      salt,
      JSON.stringify(user.profile),
      JSON.stringify(user.privacy),
      JSON.stringify(user.preferences),
      JSON.stringify(user.security),
      JSON.stringify(user.stats),
      Math.floor(user.createdAt.getTime() / 1000),
      now,
      user.updatedAt ? Math.floor(user.updatedAt.getTime() / 1000) : now,
      user.security.emailVerifiedAt ? Math.floor(user.security.emailVerifiedAt.getTime() / 1000) : null,
      user.security.phoneVerifiedAt ? Math.floor(user.security.phoneVerifiedAt.getTime() / 1000) : null,
    ]);
  }

  private async updateFailedLoginAttempts(userId: string, attempts: number): Promise<void> {
    const adapter = this.db.getAdapter('sqlite');
    const lockedUntil = attempts >= this.config.maxLoginAttempts ? 
      Math.floor(Date.now() / 1000) + Math.floor(this.config.loginLockoutMs / 1000) : null;

    await adapter.execute(`
      UPDATE users 
      SET security_json = json_set(
        json_set(security_json, '$.loginAttempts', ?),
        '$.lockedUntil',
        ?
      )
      WHERE id = ?
    `, [attempts, lockedUntil, userId]);
  }

  private async updateLastLogin(userId: string): Promise<void> {
    const adapter = this.db.getAdapter('sqlite');
    const now = Math.floor(Date.now() / 1000);

    await adapter.execute(`
      UPDATE users 
      SET last_login_at = ?, updated_at = ?
      WHERE id = ?
    `, [now, now, userId]);
  }

  private async updateRefreshTokenLastUsed(tokenId: string): Promise<void> {
    const adapter = this.db.getAdapter('sqlite');
    const now = Math.floor(Date.now() / 1000);

    await adapter.execute(`
      UPDATE refresh_tokens 
      SET last_used_at = ?
      WHERE id = ?
    `, [now, tokenId]);
  }

  private async saveRefreshToken(
    tokenId: string,
    userId: string,
    tokenHash: string,
    expiresAt: number
  ): Promise<void> {
    const adapter = this.db.getAdapter('sqlite');
    const now = Math.floor(Date.now() / 1000);

    await adapter.execute(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [tokenId, userId, tokenHash, expiresAt, now]);
  }

  private async findRefreshToken(tokenId: string, userId: string): Promise<{ id: string; isRevoked: boolean } | null> {
    const adapter = this.db.getAdapter('sqlite');
    const row = await adapter.get(
      'SELECT id, is_revoked FROM refresh_tokens WHERE id = ? AND user_id = ? AND expires_at > ?',
      [tokenId, userId, Math.floor(Date.now() / 1000)]
    );
    return row;
  }

  private async revokeRefreshToken(tokenId: string): Promise<void> {
    const adapter = this.db.getAdapter('sqlite');
    await adapter.execute(
      'UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = ?',
      [tokenId]
    );
  }

  private async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    const adapter = this.db.getAdapter('sqlite');
    await adapter.execute(
      'UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = ?',
      [userId]
    );
  }

  private async updateUserPassword(userId: string, passwordHash: string, salt: string): Promise<void> {
    const adapter = this.db.getAdapter('sqlite');
    const now = Math.floor(Date.now() / 1000);

    await adapter.execute(`
      UPDATE users 
      SET password_hash = ?, salt = ?, updated_at = ?,
          security_json = json_set(security_json, '$.lastPasswordChange', ?)
      WHERE id = ?
    `, [passwordHash, salt, now, now, userId]);
  }

  private async createEmailVerificationToken(userId: string, email: string): Promise<void> {
    const adapter = this.db.getAdapter('sqlite');
    const tokenId = uuidv4();
    const token = uuidv4();
    const tokenHash = await PasswordUtils.hashPassword(token, 10);
    const expiresAt = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours

    await adapter.execute(`
      INSERT INTO email_verification_tokens (id, user_id, email, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [tokenId, userId, email, tokenHash, expiresAt, Math.floor(Date.now() / 1000)]);

    // In a real implementation, send email with token
    logger.info('Email verification token created', { userId, email, token });
  }

  private rowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as UserRole,
      status: row.status as UserStatus,
      profile: JSON.parse(row.profile_json),
      privacy: JSON.parse(row.privacy_json),
      preferences: JSON.parse(row.preferences_json),
      security: JSON.parse(row.security_json),
      stats: JSON.parse(row.stats_json),
      createdAt: new Date(row.created_at * 1000),
      updatedAt: new Date(row.updated_at * 1000),
    };
  }
}

export default UserService;