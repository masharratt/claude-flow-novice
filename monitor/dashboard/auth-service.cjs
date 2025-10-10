/**
 * Dashboard Authentication Service
 * SECURITY FIX: JWT-based authentication replacing Base64 tokens
 * - JWT tokens with 1-hour expiration
 * - Proper signature validation
 * - Refresh token support
 * - bcrypt password hashing
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class AuthenticationService {
    constructor() {
        this.users = new Map();
        this.sessions = new Map();
        this.refreshTokens = new Map();
        this.revokedTokens = new Set();

        // SECURITY: JWT secret from environment
        this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

        // SECURITY: JWT configuration
        this.jwtConfig = {
            algorithm: 'HS256',
            accessTokenExpiry: '1h',      // 1 hour expiration
            refreshTokenExpiry: '7d',     // 7 days for refresh tokens
            issuer: 'claude-flow-dashboard',
            audience: 'dashboard-users'
        };

        this.sessionTimeout = parseInt(process.env.DASHBOARD_SESSION_TIMEOUT_HOURS || '24') * 60 * 60 * 1000;
        this.sessionSecret = process.env.DASHBOARD_SESSION_SECRET || '';

        this.initializeUsers();
        this.validateConfiguration();
    }

    /**
     * Initialize users from environment variables
     * @private
     */
    initializeUsers() {
        const users = [
            {
                username: process.env.DASHBOARD_ADMIN_USER,
                passwordHash: process.env.DASHBOARD_ADMIN_PASS_HASH,
                role: 'admin'
            },
            {
                username: process.env.DASHBOARD_MONITOR_USER,
                passwordHash: process.env.DASHBOARD_MONITOR_PASS_HASH,
                role: 'monitor'
            },
            {
                username: process.env.DASHBOARD_FLEET_USER,
                passwordHash: process.env.DASHBOARD_FLEET_PASS_HASH,
                role: 'fleet'
            }
        ];

        for (const user of users) {
            if (user.username && user.passwordHash) {
                this.users.set(user.username, {
                    passwordHash: user.passwordHash,
                    role: user.role
                });
            }
        }
    }

    /**
     * Validate configuration on startup
     * @throws {Error} If configuration is invalid
     */
    validateConfiguration() {
        if (this.users.size === 0) {
            throw new Error('Dashboard authentication not configured. Please set DASHBOARD_*_USER and DASHBOARD_*_PASS_HASH environment variables.');
        }

        if (!this.sessionSecret || this.sessionSecret.length < 32) {
            throw new Error('DASHBOARD_SESSION_SECRET must be at least 32 characters. Please set a secure session secret.');
        }

        // Validate that all users have proper bcrypt hashes
        for (const [username, user] of this.users) {
            if (!user.passwordHash || !this.isBcryptHash(user.passwordHash)) {
                throw new Error(`Invalid bcrypt hash for user: ${username}. Use: node -e "require('bcrypt').hash('password', 12).then(console.log)"`);
            }
        }

        console.log(`✅ Dashboard authentication configured for ${this.users.size} user(s)`);
    }

    /**
     * Check if a string is a valid bcrypt hash
     * @param {string} hash - Hash to validate
     * @returns {boolean}
     * @private
     */
    isBcryptHash(hash) {
        // Bcrypt hashes start with $2a$, $2b$, or $2y$ followed by cost factor
        return /^\$2[aby]\$\d{2}\$/.test(hash);
    }

    /**
     * Authenticate a user
     * @param {string} username - Username
     * @param {string} password - Plain text password
     * @returns {Promise<Object|null>} Authentication result or null if invalid
     */
    async authenticate(username, password) {
        if (!username || !password) {
            return null;
        }

        const user = this.users.get(username);
        if (!user) {
            // Constant-time comparison to prevent timing attacks
            await bcrypt.compare(password, '$2b$12$dummy.hash.to.prevent.timing.attacks.with.constant.time');
            return null;
        }

        try {
            const isValid = await bcrypt.compare(password, user.passwordHash);
            if (!isValid) {
                return null;
            }

            // SECURITY FIX: Generate JWT tokens instead of Base64
            const tokens = this.generateJWTTokenPair(username, user.role);

            // Store session for JWT token
            this.sessions.set(tokens.accessToken, {
                username,
                role: user.role,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 3600000) // 1 hour
            });

            // Clean up expired sessions
            this.cleanupExpiredSessions();

            return {
                success: true,
                message: 'Authentication successful',
                user: { username, role: user.role },
                token: tokens.accessToken,          // JWT access token (backward compatible)
                accessToken: tokens.accessToken,    // JWT access token
                refreshToken: tokens.refreshToken,  // JWT refresh token
                expiresIn: 3600,                    // 1 hour in seconds
                tokenType: 'Bearer',                // Standard Bearer token type
                expiresAt: new Date(Date.now() + 3600000).toISOString()
            };
        } catch (error) {
            console.error('Authentication error:', error);
            return null;
        }
    }

    /**
     * SECURITY FIX: Generate JWT token pair (access + refresh)
     * @param {string} username - Username
     * @param {string} role - User role
     * @returns {Object} Token pair with accessToken and refreshToken
     * @private
     */
    generateJWTTokenPair(username, role) {
        const agentId = crypto.randomUUID();
        const swarmId = 'dashboard-swarm';

        // SECURITY: Access token payload with 1-hour expiration
        const accessPayload = {
            sub: username,
            agentId,
            swarmId,
            permissions: [role],
            role,
            type: 'access',
            iat: Math.floor(Date.now() / 1000)
        };

        // SECURITY: Refresh token payload with 7-day expiration
        const refreshPayload = {
            sub: username,
            agentId,
            type: 'refresh',
            iat: Math.floor(Date.now() / 1000)
        };

        // SECURITY: Sign tokens with JWT secret
        const accessToken = jwt.sign(
            accessPayload,
            this.jwtSecret,
            {
                algorithm: this.jwtConfig.algorithm,
                expiresIn: this.jwtConfig.accessTokenExpiry,
                issuer: this.jwtConfig.issuer,
                audience: this.jwtConfig.audience
            }
        );

        const refreshToken = jwt.sign(
            refreshPayload,
            this.jwtSecret,
            {
                algorithm: this.jwtConfig.algorithm,
                expiresIn: this.jwtConfig.refreshTokenExpiry,
                issuer: this.jwtConfig.issuer,
                audience: this.jwtConfig.audience
            }
        );

        // Store refresh token
        this.refreshTokens.set(refreshToken, {
            username,
            agentId,
            createdAt: Date.now()
        });

        return { accessToken, refreshToken };
    }

    /**
     * DEPRECATED: Generate a secure session token (kept for backward compatibility)
     * @param {string} username - Username
     * @returns {string} Session token
     * @private
     * @deprecated Use generateJWTTokenPair instead
     */
    generateSessionToken(username) {
        const randomBytes = crypto.randomBytes(32).toString('hex');
        const timestamp = Date.now();
        const payload = `${username}:${timestamp}:${randomBytes}`;

        const hmac = crypto.createHmac('sha256', this.sessionSecret);
        hmac.update(payload);
        const signature = hmac.digest('hex');

        return `${Buffer.from(payload).toString('base64')}.${signature}`;
    }

    /**
     * Validate a session token
     * @param {string} token - Session token
     * @returns {Object|null} Session data or null if invalid
     */
    validateSession(token) {
        if (!token) {
            return null;
        }

        const session = this.sessions.get(token);
        if (!session) {
            return null;
        }

        // Check if session has expired
        if (new Date() > session.expiresAt) {
            this.sessions.delete(token);
            return null;
        }

        return session;
    }

    /**
     * Revoke a session
     * @param {string} token - Session token
     */
    revokeSession(token) {
        this.sessions.delete(token);
    }

    /**
     * Clean up expired sessions
     * @private
     */
    cleanupExpiredSessions() {
        const now = new Date();
        for (const [token, session] of this.sessions) {
            if (now > session.expiresAt) {
                this.sessions.delete(token);
            }
        }
    }

    /**
     * Generate a bcrypt hash for a password (utility method)
     * @param {string} password - Plain text password
     * @param {number} rounds - Cost factor (default: 12)
     * @returns {Promise<string>} Bcrypt hash
     */
    static async hashPassword(password, rounds = 12) {
        return bcrypt.hash(password, rounds);
    }

    /**
     * Get statistics about active sessions
     * @returns {Object} Session statistics
     */
    getSessionStatistics() {
        const now = new Date();
        let activeCount = 0;
        let expiredCount = 0;

        for (const session of this.sessions.values()) {
            if (now > session.expiresAt) {
                expiredCount++;
            } else {
                activeCount++;
            }
        }

        return {
            total: this.sessions.size,
            active: activeCount,
            expired: expiredCount,
            users: this.users.size,
            refreshTokens: this.refreshTokens.size,
            revokedTokens: this.revokedTokens.size
        };
    }

    /**
     * SECURITY FIX: Verify and validate JWT token
     * @param {string} token - JWT token
     * @returns {Promise<Object>} Validation result with user data or error
     */
    async verifyJWTToken(token) {
        try {
            // SECURITY: Check if token is revoked
            if (this.revokedTokens.has(token)) {
                return {
                    valid: false,
                    error: 'Token has been revoked'
                };
            }

            // SECURITY: Verify JWT signature and expiration
            const decoded = jwt.verify(token, this.jwtSecret, {
                algorithms: [this.jwtConfig.algorithm],
                issuer: this.jwtConfig.issuer,
                audience: this.jwtConfig.audience
            });

            // Validate token type
            if (decoded.type !== 'access') {
                return {
                    valid: false,
                    error: 'Invalid token type'
                };
            }

            return {
                valid: true,
                user: {
                    username: decoded.sub,
                    agentId: decoded.agentId,
                    swarmId: decoded.swarmId,
                    permissions: decoded.permissions,
                    role: decoded.role
                }
            };

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return {
                    valid: false,
                    error: 'Token expired',
                    expired: true
                };
            } else if (error.name === 'JsonWebTokenError') {
                return {
                    valid: false,
                    error: 'Invalid token signature'
                };
            }

            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * SECURITY FIX: Refresh access token using refresh token
     * @param {string} refreshToken - JWT refresh token
     * @returns {Promise<Object|null>} New access token or null if invalid
     */
    async refreshAccessToken(refreshToken) {
        try {
            // SECURITY: Check if refresh token is revoked
            if (this.revokedTokens.has(refreshToken)) {
                throw new Error('Refresh token has been revoked');
            }

            // Verify refresh token
            const decoded = jwt.verify(refreshToken, this.jwtSecret, {
                algorithms: [this.jwtConfig.algorithm],
                issuer: this.jwtConfig.issuer,
                audience: this.jwtConfig.audience
            });

            // Validate token type
            if (decoded.type !== 'refresh') {
                throw new Error('Invalid token type');
            }

            // Check if refresh token exists in storage
            if (!this.refreshTokens.has(refreshToken)) {
                throw new Error('Refresh token not found');
            }

            const tokenData = this.refreshTokens.get(refreshToken);
            const user = this.users.get(tokenData.username);

            if (!user) {
                throw new Error('User not found');
            }

            // Generate new access token
            const accessPayload = {
                sub: tokenData.username,
                agentId: tokenData.agentId,
                swarmId: 'dashboard-swarm',
                permissions: [user.role],
                role: user.role,
                type: 'access',
                iat: Math.floor(Date.now() / 1000)
            };

            const accessToken = jwt.sign(
                accessPayload,
                this.jwtSecret,
                {
                    algorithm: this.jwtConfig.algorithm,
                    expiresIn: this.jwtConfig.accessTokenExpiry,
                    issuer: this.jwtConfig.issuer,
                    audience: this.jwtConfig.audience
                }
            );

            return {
                success: true,
                accessToken,
                expiresIn: 3600,
                tokenType: 'Bearer'
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * SECURITY FIX: Revoke JWT token
     * @param {string} token - JWT token to revoke
     * @returns {Object} Revocation result
     */
    revokeJWTToken(token) {
        this.revokedTokens.add(token);

        // Remove from refresh tokens if it's a refresh token
        if (this.refreshTokens.has(token)) {
            this.refreshTokens.delete(token);
        }

        return {
            success: true,
            message: 'Token revoked successfully'
        };
    }

    /**
     * SECURITY FIX: Start cleanup process for expired tokens
     * @private
     */
    startCleanup() {
        setInterval(() => {
            // Clean up old revoked tokens (keep for 24 hours)
            if (this.revokedTokens.size > 1000) {
                this.revokedTokens.clear();
            }

            // Clean up old refresh tokens
            const now = Date.now();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;

            for (const [token, data] of this.refreshTokens.entries()) {
                if (now - data.createdAt > sevenDays) {
                    this.refreshTokens.delete(token);
                }
            }

            // Clean up expired sessions
            this.cleanupExpiredSessions();
        }, 60 * 60 * 1000); // Run every hour
    }
}

module.exports = AuthenticationService;
