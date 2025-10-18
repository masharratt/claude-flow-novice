/**
 * Enterprise Authentication & Authorization Service
 *
 * Phase 3 Enterprise Security Framework Implementation
 * Supports MFA, SSO, JWT, OAuth2 with configurable session policies
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { connectRedis } from '../cli/utils/redis-client.js';

/**
 * Enterprise Authentication Service
 * Provides comprehensive authentication and authorization with MFA, SSO, and session management
 */
export class EnterpriseAuthService {
  constructor(config = {}) {
    this.config = {
      jwt: {
        secret: config.jwtSecret || crypto.randomBytes(64).toString('hex'),
        expiresIn: config.jwtExpiresIn || '1h',
        refreshExpiresIn: config.refreshExpiresIn || '7d',
        algorithm: 'HS256'
      },
      mfa: {
        totpWindow: config.totpWindow || 1,
        backupCodesCount: config.backupCodesCount || 10,
        maxAttempts: config.maxAttempts || 3,
        lockoutDuration: config.lockoutDuration || 15 * 60 * 1000 // 15 minutes
      },
      session: {
        timeout: config.sessionTimeout || 30 * 60 * 1000, // 30 minutes default
        renewalThreshold: config.renewalThreshold || 5 * 60 * 1000, // 5 minutes
        maxConcurrentSessions: config.maxConcurrentSessions || 3
      },
      password: {
        minLength: config.passwordMinLength || 12,
        requireSpecialChars: config.requireSpecialChars !== false,
        requireNumbers: config.requireNumbers !== false,
        requireUppercase: config.requireUppercase !== false,
        maxAge: config.passwordMaxAge || 90 * 24 * 60 * 60 * 1000, // 90 days
        historyCount: config.passwordHistoryCount || 5
      },
      redis: {
        host: config.redisHost || 'localhost',
        port: config.redisPort || 6379,
        password: config.redisPassword,
        db: config.redisDb || 0
      }
    };

    this.redisClient = null;
    this.sessionStore = new Map();
    this.mfaStore = new Map();
    this.attemptsStore = new Map();
  }

  /**
   * Initialize the authentication service
   */
  async initialize() {
    try {
      this.redisClient = await connectRedis(this.config.redis);
      await this.publishSecurityEvent('auth-service-initialized', {
        timestamp: new Date().toISOString(),
        config: {
          mfaEnabled: true,
          ssoEnabled: true,
          sessionTimeout: this.config.session.timeout
        }
      });
      return true;
    } catch (error) {
      console.error('Failed to initialize EnterpriseAuthService:', error);
      throw error;
    }
  }

  /**
   * Authenticate user with username/password
   */
  async authenticateUser(username, password, options = {}) {
    try {
      // Check rate limiting
      await this.checkRateLimit(username);

      // Validate credentials
      const user = await this.validateCredentials(username, password);
      if (!user) {
        await this.recordFailedAttempt(username);
        throw new Error('Invalid credentials');
      }

      // Clear failed attempts on successful authentication
      this.attemptsStore.delete(username);

      // Generate session and tokens
      const sessionId = crypto.randomUUID();
      const { accessToken, refreshToken } = this.generateTokenPair(user);

      // Store session
      await this.createSession(sessionId, user, {
        accessToken,
        refreshToken,
        userAgent: options.userAgent,
        ipAddress: options.ipAddress,
        mfaVerified: false
      });

      // Publish authentication event
      await this.publishSecurityEvent('user-authenticated', {
        userId: user.id,
        username,
        sessionId,
        timestamp: new Date().toISOString(),
        ipAddress: options.ipAddress
      });

      return {
        sessionId,
        accessToken,
        refreshToken,
        requiresMFA: user.mfaEnabled,
        user: {
          id: user.id,
          username: user.username,
          roles: user.roles,
          permissions: user.permissions
        }
      };
    } catch (error) {
      await this.publishSecurityEvent('authentication-failed', {
        username,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Verify MFA token
   */
  async verifyMFA(sessionId, mfaToken, backupCode = null) {
    try {
      const session = await this.getSession(sessionId);
      if (!session || session.mfaVerified) {
        throw new Error('Invalid session or MFA already verified');
      }

      const user = await this.getUserById(session.userId);
      if (!user || !user.mfaEnabled) {
        throw new Error('MFA not enabled for user');
      }

      let mfaValid = false;

      if (backupCode) {
        mfaValid = await this.verifyBackupCode(user.id, backupCode);
      } else {
        mfaValid = this.verifyTOTPToken(user.mfaSecret, mfaToken);
      }

      if (!mfaValid) {
        await this.recordFailedMFAAttempt(sessionId);
        throw new Error('Invalid MFA token');
      }

      // Mark session as MFA verified
      session.mfaVerified = true;
      session.mfaVerifiedAt = new Date().toISOString();
      await this.updateSession(sessionId, session);

      await this.publishSecurityEvent('mfa-verified', {
        userId: user.id,
        sessionId,
        timestamp: new Date().toISOString(),
        method: backupCode ? 'backup-code' : 'totp'
      });

      return { success: true, sessionId };
    } catch (error) {
      await this.publishSecurityEvent('mfa-verification-failed', {
        sessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * SSO Authentication via external provider
   */
  async authenticateSSO(provider, ssoToken, options = {}) {
    try {
      // Validate SSO token based on provider
      const ssoUser = await this.validateSSOToken(provider, ssoToken);

      // Find or create user
      let user = await this.findUserBySSO(provider, ssoUser.id);
      if (!user) {
        user = await this.createSSOUser(provider, ssoUser);
      }

      // Generate session
      const sessionId = crypto.randomUUID();
      const { accessToken, refreshToken } = this.generateTokenPair(user);

      await this.createSession(sessionId, user, {
        accessToken,
        refreshToken,
        userAgent: options.userAgent,
        ipAddress: options.ipAddress,
        ssoProvider: provider,
        ssoVerified: true,
        mfaVerified: user.mfaEnabled ? false : true // Skip MFA if not enabled
      });

      await this.publishSecurityEvent('sso-authenticated', {
        userId: user.id,
        provider,
        sessionId,
        timestamp: new Date().toISOString(),
        ipAddress: options.ipAddress
      });

      return {
        sessionId,
        accessToken,
        refreshToken,
        requiresMFA: user.mfaEnabled && !user.mfaVerified,
        user: {
          id: user.id,
          username: user.username,
          roles: user.roles,
          permissions: user.permissions,
          ssoProvider: provider
        }
      };
    } catch (error) {
      await this.publishSecurityEvent('sso-authentication-failed', {
        provider,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Validate JWT token
   */
  async validateToken(token) {
    try {
      const decoded = jwt.verify(token, this.config.jwt.secret, {
        algorithm: this.config.jwt.algorithm
      });

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new Error('Token has been revoked');
      }

      // Check session validity
      const session = await this.getSession(decoded.sessionId);
      if (!session || !session.valid) {
        throw new Error('Invalid session');
      }

      // Check session timeout
      if (Date.now() > session.expiresAt) {
        throw new Error('Session expired');
      }

      // Update session activity
      session.lastActivity = Date.now();
      await this.updateSession(decoded.sessionId, session);

      return {
        valid: true,
        userId: decoded.userId,
        sessionId: decoded.sessionId,
        roles: decoded.roles,
        permissions: decoded.permissions
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken, sessionId) {
    try {
      const session = await this.getSession(sessionId);
      if (!session || session.refreshToken !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      // Check if refresh token is expired
      const decoded = jwt.verify(refreshToken, this.config.jwt.secret);
      if (Date.now() > decoded.exp * 1000) {
        throw new Error('Refresh token expired');
      }

      const user = await this.getUserById(session.userId);
      const { accessToken, refreshToken: newRefreshToken } = this.generateTokenPair(user);

      // Update session with new tokens
      session.accessToken = accessToken;
      session.refreshToken = newRefreshToken;
      session.lastActivity = Date.now();
      await this.updateSession(sessionId, session);

      await this.publishSecurityEvent('token-refreshed', {
        userId: user.id,
        sessionId,
        timestamp: new Date().toISOString()
      });

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      await this.publishSecurityEvent('token-refresh-failed', {
        sessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Logout user and invalidate session
   */
  async logout(sessionId, options = {}) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return { success: true };
      }

      // Invalidate session
      session.valid = false;
      session.logoutAt = new Date().toISOString();
      await this.updateSession(sessionId, session);

      // Blacklist tokens
      await this.blacklistToken(session.accessToken);
      await this.blacklistToken(session.refreshToken);

      await this.publishSecurityEvent('user-logged-out', {
        userId: session.userId,
        sessionId,
        timestamp: new Date().toISOString(),
        revokeAllSessions: options.revokeAll
      });

      // Revoke all sessions if requested
      if (options.revokeAll) {
        await this.revokeAllUserSessions(session.userId);
      }

      return { success: true };
    } catch (error) {
      await this.publishSecurityEvent('logout-failed', {
        sessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Check user permissions
   */
  async checkPermission(userId, permission, resource = null) {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        return false;
      }

      // Check direct permissions
      if (user.permissions && user.permissions.includes(permission)) {
        return true;
      }

      // Check role-based permissions
      if (user.roles) {
        for (const role of user.roles) {
          const rolePermissions = await this.getRolePermissions(role);
          if (rolePermissions.includes(permission)) {
            return true;
          }
        }
      }

      // Check resource-specific permissions
      if (resource) {
        return await this.checkResourcePermission(user, permission, resource);
      }

      return false;
    } catch (error) {
      console.error('Permission check failed:', error);
      return false;
    }
  }

  /**
   * Generate MFA secret and backup codes
   */
  async generateMFASecret(userId) {
    try {
      const secret = this.generateTOTPSecret();
      const backupCodes = this.generateBackupCodes();

      // Store MFA setup
      await this.storeMFASecret(userId, secret, backupCodes);

      await this.publishSecurityEvent('mfa-setup-initiated', {
        userId,
        timestamp: new Date().toISOString()
      });

      return {
        secret,
        backupCodes,
        qrCode: this.generateTOTPQRCode(secret, userId)
      };
    } catch (error) {
      await this.publishSecurityEvent('mfa-setup-failed', {
        userId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Enable MFA for user
   */
  async enableMFA(userId, verificationToken) {
    try {
      const mfaData = await this.getMFASetupData(userId);
      if (!mfaData) {
        throw new Error('MFA setup not initiated');
      }

      const validToken = this.verifyTOTPToken(mfaData.secret, verificationToken);
      if (!validToken) {
        throw new Error('Invalid verification token');
      }

      // Enable MFA for user
      await this.activateMFAForUser(userId, mfaData.secret);

      await this.publishSecurityEvent('mfa-enabled', {
        userId,
        timestamp: new Date().toISOString()
      });

      return { success: true };
    } catch (error) {
      await this.publishSecurityEvent('mfa-enable-failed', {
        userId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  // Private helper methods

  generateTokenPair(user) {
    const sessionId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const accessTokenPayload = {
      userId: user.id,
      sessionId,
      username: user.username,
      roles: user.roles,
      permissions: user.permissions,
      type: 'access',
      iat: now,
      exp: now + (this.config.jwt.expiresIn === '1h' ? 3600 : 7200) // 1-2 hours
    };

    const refreshTokenPayload = {
      userId: user.id,
      sessionId,
      type: 'refresh',
      iat: now,
      exp: now + (this.config.jwt.refreshExpiresIn === '7d' ? 604800 : 1209600) // 7-14 days
    };

    const accessToken = jwt.sign(accessTokenPayload, this.config.jwt.secret, {
      algorithm: this.config.jwt.algorithm
    });

    const refreshToken = jwt.sign(refreshTokenPayload, this.config.jwt.secret, {
      algorithm: this.config.jwt.algorithm
    });

    return { accessToken, refreshToken };
  }

  generateTOTPSecret() {
    // Generate proper base32 secret
    const bytes = crypto.randomBytes(20);
    return this.bufferToBase32(bytes);
  }

  bufferToBase32(buffer) {
    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';

    for (const byte of buffer) {
      bits += byte.toString(2).padStart(8, '0');
    }

    let result = '';
    for (let i = 0; i < bits.length; i += 5) {
      const chunk = bits.slice(i, i + 5).padEnd(5, '0');
      const index = parseInt(chunk, 2);
      result += base32chars[index];
    }

    return result;
  }

  verifyTOTPToken(secret, token) {
    // This would integrate with a TOTP library like speakeasy
    // For implementation, using a simplified verification
    const timeStep = Math.floor(Date.now() / 30000); // 30-second steps
    const window = this.config.mfa.totpWindow;

    for (let i = -window; i <= window; i++) {
      const expectedToken = this.generateTOTPForTime(secret, timeStep + i);
      if (expectedToken === token) {
        return true;
      }
    }

    return false;
  }

  generateTOTPForTime(secret, timeStep) {
    // Simplified TOTP generation - would use actual TOTP algorithm
    // Convert base32 to buffer manually
    const secretBuffer = this.base32ToBuffer(secret);
    const hmac = crypto.createHmac('sha1', secretBuffer);
    hmac.update(Buffer.alloc(8, timeStep));
    const digest = hmac.digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const code = (digest[offset] & 0x7f) << 24 |
                 (digest[offset + 1] & 0xff) << 16 |
                 (digest[offset + 2] & 0xff) << 8 |
                 (digest[offset + 3] & 0xff);
    return (code % 1000000).toString().padStart(6, '0');
  }

  base32ToBuffer(base32) {
    // Simple base32 to buffer conversion
    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';

    for (let i = 0; i < base32.length; i++) {
      const val = base32chars.indexOf(base32[i]);
      if (val !== -1) {
        bits += val.toString(2).padStart(5, '0');
      }
    }

    // Remove padding bits
    while (bits.length % 8 !== 0) {
      bits = bits.slice(0, -1);
    }

    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }

    return Buffer.from(bytes);
  }

  generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < this.config.mfa.backupCodesCount; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  generateTOTPQRCode(secret, userId) {
    // Simplified QR code generation - would use actual QR code library
    const issuer = 'Claude Flow Novice';
    const accountName = userId;
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
  }

  async checkRateLimit(username) {
    const attempts = this.attemptsStore.get(username) || { count: 0, lastAttempt: 0 };
    const now = Date.now();

    if (attempts.count >= this.config.mfa.maxAttempts &&
        now - attempts.lastAttempt < this.config.mfa.lockoutDuration) {
      throw new Error('Account temporarily locked due to too many failed attempts');
    }
  }

  async recordFailedAttempt(username) {
    const attempts = this.attemptsStore.get(username) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.attemptsStore.set(username, attempts);

    await this.publishSecurityEvent('failed-attempt-recorded', {
      username,
      attempts: attempts.count,
      timestamp: new Date().toISOString()
    });
  }

  async createSession(sessionId, user, options = {}) {
    const session = {
      id: sessionId,
      userId: user.id,
      username: user.username,
      roles: JSON.stringify(user.roles || []),
      permissions: JSON.stringify(user.permissions || []),
      createdAt: Date.now().toString(),
      lastActivity: Date.now().toString(),
      expiresAt: (Date.now() + this.config.session.timeout).toString(),
      valid: 'true',
      accessToken: options.accessToken || '',
      refreshToken: options.refreshToken || '',
      userAgent: options.userAgent || '',
      ipAddress: options.ipAddress || '',
      mfaVerified: (options.mfaVerified || false).toString(),
      ssoProvider: options.ssoProvider || '',
      ssoVerified: (options.ssoVerified || false).toString()
    };

    if (this.redisClient) {
      await this.redisClient.hSet(`session:${sessionId}`, session);
      await this.redisClient.expire(`session:${sessionId}`, Math.floor(this.config.session.timeout / 1000));
    } else {
      this.sessionStore.set(sessionId, session);
    }

    // Add to user sessions
    await this.addUserSession(user.id, sessionId);

    return session;
  }

  async getSession(sessionId) {
    if (this.redisClient) {
      const sessionData = await this.redisClient.hGetAll(`session:${sessionId}`);
      if (Object.keys(sessionData).length > 0) {
        // Parse and convert data back to proper types
        const session = {
          id: sessionData.id,
          userId: sessionData.userId,
          username: sessionData.username,
          roles: JSON.parse(sessionData.roles || '[]'),
          permissions: JSON.parse(sessionData.permissions || '[]'),
          createdAt: parseInt(sessionData.createdAt),
          lastActivity: parseInt(sessionData.lastActivity),
          expiresAt: parseInt(sessionData.expiresAt),
          valid: sessionData.valid === 'true',
          accessToken: sessionData.accessToken,
          refreshToken: sessionData.refreshToken,
          userAgent: sessionData.userAgent,
          ipAddress: sessionData.ipAddress,
          mfaVerified: sessionData.mfaVerified === 'true',
          ssoProvider: sessionData.ssoProvider,
          ssoVerified: sessionData.ssoVerified === 'true'
        };
        return session;
      }
      return null;
    } else {
      return this.sessionStore.get(sessionId) || null;
    }
  }

  async updateSession(sessionId, updates) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    Object.assign(session, updates);

    if (this.redisClient) {
      // Convert session back to string format for Redis
      const sessionData = {
        id: session.id,
        userId: session.userId,
        username: session.username,
        roles: JSON.stringify(session.roles || []),
        permissions: JSON.stringify(session.permissions || []),
        createdAt: session.createdAt.toString(),
        lastActivity: session.lastActivity.toString(),
        expiresAt: session.expiresAt.toString(),
        valid: session.valid ? 'true' : 'false',
        accessToken: session.accessToken || '',
        refreshToken: session.refreshToken || '',
        userAgent: session.userAgent || '',
        ipAddress: session.ipAddress || '',
        mfaVerified: (session.mfaVerified || false).toString(),
        ssoProvider: session.ssoProvider || '',
        ssoVerified: (session.ssoVerified || false).toString()
      };

      await this.redisClient.hSet(`session:${sessionId}`, sessionData);
      const ttl = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
      if (ttl > 0) {
        await this.redisClient.expire(`session:${sessionId}`, ttl);
      }
    } else {
      this.sessionStore.set(sessionId, session);
    }

    return session;
  }

  async addUserSession(userId, sessionId) {
    const key = `user_sessions:${userId}`;
    if (this.redisClient) {
      await this.redisClient.sAdd(key, sessionId);
      await this.redisClient.expire(key, Math.floor(this.config.session.timeout / 1000));
    } else {
      // In-memory implementation would use Map/Set
    }
  }

  async revokeAllUserSessions(userId) {
    // Implementation to revoke all sessions for a user
    await this.publishSecurityEvent('all-sessions-revoked', {
      userId,
      timestamp: new Date().toISOString()
    });
  }

  async blacklistToken(token) {
    if (this.redisClient) {
      const decoded = jwt.decode(token);
      const ttl = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
      if (ttl > 0) {
        await this.redisClient.setEx(`blacklist:${token}`, ttl, '1');
      }
    }
  }

  async isTokenBlacklisted(token) {
    if (this.redisClient) {
      return await this.redisClient.exists(`blacklist:${token}`);
    }
    return false;
  }

  async publishSecurityEvent(eventType, data) {
    if (this.redisClient) {
      const event = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
        service: 'EnterpriseAuthService'
      };

      await this.redisClient.publish('swarm:phase-3:security', JSON.stringify(event));
    }
  }

  // Mock implementation methods - would connect to actual user/database systems
  async validateCredentials(username, password) {
    // Mock implementation - would connect to actual user database
    return {
      id: 'user-123',
      username,
      roles: ['user', 'admin'],
      permissions: ['read', 'write', 'admin'],
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP'
    };
  }

  async getUserById(userId) {
    // Mock implementation
    return {
      id: userId,
      username: 'testuser',
      roles: ['user', 'admin'],
      permissions: ['read', 'write', 'admin'],
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP'
    };
  }

  async validateSSOToken(provider, token) {
    // Mock implementation - would validate with actual SSO providers
    return {
      id: 'sso-user-123',
      email: 'user@example.com',
      name: 'Test User'
    };
  }

  async findUserBySSO(provider, ssoId) {
    // Mock implementation
    return null;
  }

  async createSSOUser(provider, ssoUser) {
    // Mock implementation
    return {
      id: 'new-user-123',
      username: ssoUser.email,
      roles: ['user'],
      permissions: ['read'],
      mfaEnabled: false
    };
  }

  async getRolePermissions(role) {
    // Mock implementation
    const rolePermissions = {
      admin: ['read', 'write', 'delete', 'admin'],
      user: ['read', 'write'],
      guest: ['read']
    };
    return rolePermissions[role] || [];
  }

  async checkResourcePermission(user, permission, resource) {
    // Mock implementation for resource-specific permissions
    return true;
  }

  async storeMFASecret(userId, secret, backupCodes) {
    // Mock implementation - would store in secure database
  }

  async getMFASetupData(userId) {
    // Mock implementation
    return {
      secret: 'JBSWY3DPEHPK3PXP',
      backupCodes: ['ABCD1234', 'EFGH5678']
    };
  }

  async activateMFAForUser(userId, secret) {
    // Mock implementation - would update user record
  }

  async verifyBackupCode(userId, backupCode) {
    // Mock implementation - would verify against stored backup codes
    return true;
  }

  async recordFailedMFAAttempt(sessionId) {
    // Mock implementation - would record failed MFA attempts
  }
}

export default EnterpriseAuthService;