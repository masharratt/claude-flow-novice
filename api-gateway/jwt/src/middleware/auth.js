const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../logger');

// In-memory token store for development (use Redis in production)
const tokenStore = new Map();
const blacklistedTokens = new Set();
const refreshTokens = new Map();

/**
 * Generate JWT access and refresh tokens
 * @param {Object} user - User object
 * @param {Object} payload - Additional payload data
 * @returns {Object} - Contains accessToken, refreshToken, and expires
 */
const generateTokens = (user, payload = {}) => {
  try {
    const tokenId = uuidv4();
    
    const accessTokenPayload = {
      sub: user.id || user.userId,
      email: user.email,
      roles: user.roles || [],
      permissions: user.permissions || [],
      tokenId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      ...payload
    };
    
    const accessToken = jwt.sign(accessTokenPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithm: config.jwt.algorithm
    });
    
    const refreshTokenPayload = {
      sub: user.id || user.userId,
      tokenId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000)
    };
    
    const refreshToken = jwt.sign(refreshTokenPayload, config.jwt.secret, {
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithm: config.jwt.algorithm
    });
    
    // Store refresh token (in production, use Redis)
    const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
    refreshTokens.set(tokenId, {
      token: refreshToken,
      userId: user.id || user.userId,
      expires: expiryTime,
      createdAt: new Date().toISOString()
    });
    
    // Limit refresh tokens per user
    const userRefreshTokens = Array.from(refreshTokens.values())
      .filter(rt => rt.userId === (user.id || user.userId));
    
    if (userRefreshTokens.length > config.token.maxRefreshTokensPerUser) {
      // Remove oldest tokens
      userRefreshTokens
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .slice(0, userRefreshTokens.length - config.token.maxRefreshTokensPerUser)
        .forEach(rt => {
          const rtTokenId = Array.from(refreshTokens.entries())
            .find(([_, v]) => v.token === rt.token)?.[0];
          if (rtTokenId) {
            refreshTokens.delete(rtTokenId);
          }
        });
    }
    
    const decoded = jwt.decode(accessToken);
    
    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.expiresIn,
      tokenType: 'Bearer',
      expires: new Date(decoded.exp * 1000).toISOString()
    };
  } catch (error) {
    logger.error('Token generation error:', error);
    throw new Error('Failed to generate tokens');
  }
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} - Decoded token payload
 */
const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: [config.jwt.algorithm]
    });
    
    // Check if token is blacklisted
    if (blacklistedTokens.has(token)) {
      throw new Error('Token has been revoked');
    }
    
    // For refresh tokens, check if they exist in store
    if (decoded.type === 'refresh') {
      const storedToken = refreshTokens.get(decoded.tokenId);
      if (!storedToken || storedToken.token !== token) {
        throw new Error('Invalid refresh token');
      }
      
      if (Date.now() > storedToken.expires) {
        refreshTokens.delete(decoded.tokenId);
        throw new Error('Refresh token expired');
      }
    }
    
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else {
      throw error;
    }
  }
};

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @param {Object} user - User object (optional)
 * @returns {Object} - New token set
 */
const refreshAccessToken = async (refreshToken, user = null) => {
  try {
    const decoded = jwt.verify(refreshToken, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: [config.jwt.algorithm]
    });
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }
    
    // Check if refresh token exists in store
    const storedToken = refreshTokens.get(decoded.tokenId);
    if (!storedToken || storedToken.token !== refreshToken) {
      throw new Error('Refresh token not found');
    }
    
    if (Date.now() > storedToken.expires) {
      refreshTokens.delete(decoded.tokenId);
      throw new Error('Refresh token expired');
    }
    
    // Use provided user or fetch from stored data
    const userPayload = user || { 
      id: decoded.sub, 
      email: decoded.email,
      roles: decoded.roles,
      permissions: decoded.permissions
    };
    
    // Generate new token set
    const tokens = generateTokens(userPayload);
    
    // Remove old refresh token
    refreshTokens.delete(decoded.tokenId);
    
    return tokens;
  } catch (error) {
    logger.error('Token refresh error:', error);
    throw new Error('Failed to refresh token');
  }
};

/**
 * Revoke JWT token
 * @param {string} token - JWT token to revoke
 * @returns {boolean} - Success status
 */
const revokeToken = async (token) => {
  try {
    const decoded = jwt.decode(token);
    
    if (!decoded) {
      return false;
    }
    
    // Add to blacklist
    blacklistedTokens.add(token);
    
    // Set TTL for blacklist entry (in production, use Redis)
    const ttl = decoded.exp ? (decoded.exp - Math.floor(Date.now() / 1000)) : config.token.blacklistTTL;
    
    setTimeout(() => {
      blacklistedTokens.delete(token);
    }, ttl * 1000);
    
    // If it's a refresh token, remove from store
    if (decoded.type === 'refresh' && decoded.tokenId) {
      refreshTokens.delete(decoded.tokenId);
    }
    
    logger.info('Token revoked successfully', { tokenId: decoded.tokenId });
    return true;
  } catch (error) {
    logger.error('Token revocation error:', error);
    return false;
  }
};

/**
 * Validate token for gateway authentication
 * @param {string} token - JWT token
 * @param {Object} redisClient - Redis client instance (optional)
 * @returns {Object} - Validation result
 */
const validateToken = async (token, redisClient = null) => {
  try {
    if (!token) {
      return {
        valid: false,
        error: 'No token provided'
      };
    }
    
    // Check blacklist (in Redis if available, otherwise in-memory)
    let isBlacklisted = blacklistedTokens.has(token);
    
    if (redisClient && redisClient.isOpen) {
      try {
        const blacklisted = await redisClient.get(`blacklist:${token}`);
        if (blacklisted) {
          isBlacklisted = true;
        }
      } catch (redisError) {
        logger.warn('Redis blacklist check failed:', redisError);
      }
    }
    
    if (isBlacklisted) {
      return {
        valid: false,
        error: 'Token has been revoked'
      };
    }
    
    const decoded = verifyToken(token);
    
    // Check if token is close to expiry
    const now = Math.floor(Date.now() / 1000);
    const timeToExpiry = decoded.exp - now;
    const warningThreshold = 300; // 5 minutes
    
    return {
      valid: true,
      user: {
        id: decoded.sub,
        email: decoded.email,
        roles: decoded.roles,
        permissions: decoded.permissions
      },
      expires: new Date(decoded.exp * 1000).toISOString(),
      expiresSoon: timeToExpiry < warningThreshold,
      tokenId: decoded.tokenId
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {string} - Hashed password
 */
const hashPassword = async (password) => {
  try {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    logger.error('Password hashing error:', error);
    throw new Error('Failed to hash password');
  }
};

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password
 * @returns {boolean} - Password match result
 */
const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    logger.error('Password comparison error:', error);
    return false;
  }
};

/**
 * Extract token from request headers
 * @param {Object} req - Express request object
 * @returns {string|null} - JWT token or null
 */
const extractTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check for token in query parameters (not recommended for production)
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  
  // Check for token in cookies
  if (req.cookies && req.cookies.jwt_token) {
    return req.cookies.jwt_token;
  }
  
  return null;
};

module.exports = {
  generateTokens,
  verifyToken,
  refreshAccessToken,
  revokeToken,
  validateToken,
  hashPassword,
  comparePassword,
  extractTokenFromRequest
};