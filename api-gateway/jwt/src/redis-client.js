const Redis = require('redis');
const config = require('./config');
const logger = require('./logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = Redis.createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port,
          connectTimeout: config.redis.connectTimeout,
          keepAlive: config.redis.keepAlive
        },
        password: config.redis.password,
        database: config.redis.db,
        lazyConnect: config.redis.lazyConnect
      });

      // Event handlers
      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        logger.warn('Redis client disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.disconnect();
        this.isConnected = false;
        logger.info('Redis client disconnected');
      }
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  isReady() {
    return this.isConnected && this.client;
  }

  // Token blacklist operations
  async addToBlacklist(jti, ttl = null) {
    if (!this.isReady()) {
      throw new Error('Redis client not connected');
    }

    try {
      const key = `${config.redis.keyPrefix}blacklist:${jti}`;
      const expiration = ttl || config.token.blacklistTTL;
      
      await this.client.setEx(key, expiration, '1');
      logger.debug(`Token ${jti} added to blacklist`);
      return true;
    } catch (error) {
      logger.error('Failed to add token to blacklist:', error);
      throw error;
    }
  }

  async isTokenBlacklisted(jti) {
    if (!this.isReady()) {
      logger.warn('Redis not available, assuming token is not blacklisted');
      return false;
    }

    try {
      const key = `${config.redis.keyPrefix}blacklist:${jti}`;
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Failed to check blacklist status:', error);
      // Fail open - allow token if Redis is unavailable
      return false;
    }
  }

  // Refresh token operations
  async storeRefreshToken(userId, tokenId, tokenData, ttl = null) {
    if (!this.isReady()) {
      throw new Error('Redis client not connected');
    }

    try {
      const key = `${config.redis.keyPrefix}refresh:${userId}:${tokenId}`;
      const expiration = ttl || this.parseTTL(config.jwt.refreshExpiresIn);
      
      // Store token data
      await this.client.hSet(key, {
        ...tokenData,
        createdAt: Date.now(),
        userId: userId,
        tokenId: tokenId
      });
      
      // Set expiration
      await this.client.expire(key, expiration);
      
      // Add to user's refresh token list
      await this.addToUserRefreshList(userId, tokenId);
      
      logger.debug(`Refresh token stored for user ${userId}, token ${tokenId}`);
      return true;
    } catch (error) {
      logger.error('Failed to store refresh token:', error);
      throw error;
    }
  }

  async getRefreshToken(userId, tokenId) {
    if (!this.isReady()) {
      throw new Error('Redis client not connected');
    }

    try {
      const key = `${config.redis.keyPrefix}refresh:${userId}:${tokenId}`;
      const tokenData = await this.client.hGetAll(key);
      
      if (!tokenData || Object.keys(tokenData).length === 0) {
        return null;
      }
      
      return tokenData;
    } catch (error) {
      logger.error('Failed to get refresh token:', error);
      throw error;
    }
  }

  async revokeRefreshToken(userId, tokenId) {
    if (!this.isReady()) {
      throw new Error('Redis client not connected');
    }

    try {
      const key = `${config.redis.keyPrefix}refresh:${userId}:${tokenId}`;
      
      // Delete the token
      await this.client.del(key);
      
      // Remove from user's refresh token list
      await this.removeFromUserRefreshList(userId, tokenId);
      
      logger.debug(`Refresh token revoked for user ${userId}, token ${tokenId}`);
      return true;
    } catch (error) {
      logger.error('Failed to revoke refresh token:', error);
      throw error;
    }
  }

  async revokeAllUserTokens(userId) {
    if (!this.isReady()) {
      throw new Error('Redis client not connected');
    }

    try {
      const listKey = `${config.redis.keyPrefix}user_refresh:${userId}`;
      const tokenIds = await this.client.lRange(listKey, 0, -1);
      
      // Delete all refresh tokens
      for (const tokenId of tokenIds) {
        const key = `${config.redis.keyPrefix}refresh:${userId}:${tokenId}`;
        await this.client.del(key);
      }
      
      // Clear the user's refresh token list
      await this.client.del(listKey);
      
      logger.debug(`All refresh tokens revoked for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Failed to revoke all user tokens:', error);
      throw error;
    }
  }

  async addToUserRefreshList(userId, tokenId) {
    if (!this.isReady()) return;

    try {
      const listKey = `${config.redis.keyPrefix}user_refresh:${userId}`;
      
      // Add to list
      await this.client.lPush(listKey, tokenId);
      
      // Trim list to max size
      await this.client.lTrim(listKey, 0, config.token.maxRefreshTokensPerUser - 1);
      
      // Set expiration on the list
      await this.client.expire(listKey, this.parseTTL(config.jwt.refreshExpiresIn));
    } catch (error) {
      logger.error('Failed to add to user refresh list:', error);
    }
  }

  async removeFromUserRefreshList(userId, tokenId) {
    if (!this.isReady()) return;

    try {
      const listKey = `${config.redis.keyPrefix}user_refresh:${userId}`;
      await this.client.lRem(listKey, 1, tokenId);
    } catch (error) {
      logger.error('Failed to remove from user refresh list:', error);
    }
  }

  parseTTL(ttlString) {
    // Parse time strings like '7d', '24h', '60m', '3600s'
    const match = ttlString.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400
    };

    return value * multipliers[unit];
  }

  // Health check
  async healthCheck() {
    if (!this.isReady()) {
      return { status: 'unhealthy', message: 'Redis client not connected' };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency: `${latency}ms`,
        message: 'Redis connection is working'
      };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return {
        status: 'unhealthy',
        message: error.message
      };
    }
  }
}

// Create singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;