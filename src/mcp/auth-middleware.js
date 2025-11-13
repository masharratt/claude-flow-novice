/**
 * MCP Authentication Middleware
 * Token-based authentication and authorization for MCP containers
 */

const crypto = require('crypto');
const Redis = require('redis');
const fs = require('fs').promises;
const path = require('path');

class MCPAuthMiddleware {
  constructor(options = {}) {
    this.redis = null;
    this.options = {
      redisUrl: options.redisUrl || process.env.CFN_REDIS_URL || process.env.MCP_REDIS_URL || `redis://${process.env.CFN_REDIS_HOST || 'cfn-redis'}:${process.env.CFN_REDIS_PORT || 6379}`,
      tokenExpiry: options.tokenExpiry || '24h',
      authRequired: options.authRequired !== false,
      rateLimitWindow: options.rateLimitWindow || 60, // seconds
      rateLimitMax: options.rateLimitMax || 100,
      agentConfigPath: options.agentConfigPath || './config/agent-whitelist.json',
      skillConfigPath: options.skillConfigPath || './config/skill-requirements.json',
      ...options
    };

    this.agentWhitelist = new Map();
    this.skillRequirements = new Map();
    this.rateLimitCache = new Map();
  }

  /**
   * Initialize authentication middleware
   */
  async initialize() {
    try {
      // Connect to Redis
      this.redis = Redis.createClient({ url: this.options.redisUrl });
      await this.redis.connect();

      console.log('[MCPAuth] Connected to Redis for authentication');

      // Load configuration
      await this.loadAgentWhitelist();
      await this.loadSkillRequirements();

      // Start cleanup interval
      this.startCleanupInterval();

      console.log('[MCPAuth] Authentication middleware initialized successfully');
    } catch (error) {
      console.error('[MCPAuth] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Load agent whitelist from configuration
   */
  async loadAgentWhitelist() {
    try {
      const configPath = path.resolve(this.options.agentConfigPath);
      const config = await fs.readFile(configPath, 'utf8');
      const whitelist = JSON.parse(config);

      this.agentWhitelist.clear();
      for (const agent of whitelist.agents) {
        this.agentWhitelist.set(agent.type, agent);
      }

      console.log(`[MCPAuth] Loaded ${this.agentWhitelist.size} agent configurations`);
    } catch (error) {
      console.warn('[MCPAuth] Failed to load agent whitelist:', error.message);
      // Default to empty whitelist (deny all)
      this.agentWhitelist.clear();
    }
  }

  /**
   * Load skill requirements from configuration
   */
  async loadSkillRequirements() {
    try {
      const configPath = path.resolve(this.options.skillConfigPath);
      const config = await fs.readFile(configPath, 'utf8');
      const requirements = JSON.parse(config);

      this.skillRequirements.clear();
      for (const [tool, req] of Object.entries(requirements.tools)) {
        this.skillRequirements.set(tool, req);
      }

      console.log(`[MCPAuth] Loaded ${this.skillRequirements.size} tool skill requirements`);
    } catch (error) {
      console.warn('[MCPAuth] Failed to load skill requirements:', error.message);
      this.skillRequirements.clear();
    }
  }

  /**
   * Authenticate agent request
   */
  async authenticateRequest(request, response, next) {
    try {
      // Skip authentication if not required
      if (!this.options.authRequired) {
        return next();
      }

      // Extract authentication headers
      const agentToken = request.headers['x-agent-token'];
      const agentType = request.headers['x-agent-type'];
      const toolName = request.body?.name || request.params?.toolName;

      // Validate required headers
      if (!agentToken || !agentType) {
        return this.sendErrorResponse(response, 401, 'Missing authentication headers', {
          required: ['x-agent-token', 'x-agent-type']
        });
      }

      // Validate token in Redis
      const tokenData = await this.validateToken(agentToken, agentType);
      if (!tokenData) {
        return this.sendErrorResponse(response, 401, 'Invalid or expired token', {
          agentType,
          tokenValid: false
        });
      }

      // Validate agent type against whitelist
      if (!this.isAgentAuthorized(agentType)) {
        return this.sendErrorResponse(response, 403, 'Agent type not authorized', {
          agentType,
          allowedTypes: Array.from(this.agentWhitelist.keys())
        });
      }

      // Validate skill-based tool access
      if (toolName && !this.authorizeToolAccess(agentType, toolName)) {
        const toolRequirements = this.skillRequirements.get(toolName);
        return this.sendErrorResponse(response, 403, 'Insufficient skills for tool access', {
          agentType,
          toolName,
          requiredSkills: toolRequirements?.requiredSkills || [],
          agentSkills: tokenData.skills || []
        });
      }

      // Check rate limits
      if (!this.checkRateLimit(agentType, agentToken)) {
        return this.sendErrorResponse(response, 429, 'Rate limit exceeded', {
          agentType,
          window: this.options.rateLimitWindow,
          maxRequests: this.options.rateLimitMax
        });
      }

      // Add agent context to request
      request.agentContext = {
        agentType,
        agentToken,
        skills: tokenData.skills || [],
        authenticated: true,
        timestamp: Date.now()
      };

      // Update last activity
      await this.updateAgentActivity(agentToken, agentType);

      return next();

    } catch (error) {
      console.error('[MCPAuth] Authentication error:', error);
      return this.sendErrorResponse(response, 500, 'Authentication error', {
        error: error.message
      });
    }
  }

  /**
   * Validate token against Redis
   */
  async validateToken(token, agentType) {
    try {
      const key = `mcp:agent:${agentType}:${token}`;
      const tokenData = await this.redis.get(key);

      if (!tokenData) {
        return null;
      }

      const data = JSON.parse(tokenData);

      // Check expiration
      if (Date.now() > data.expiresAt) {
        await this.redis.del(key);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[MCPAuth] Token validation error:', error);
      return null;
    }
  }

  /**
   * Check if agent type is authorized
   */
  isAgentAuthorized(agentType) {
    return this.agentWhitelist.has(agentType);
  }

  /**
   * Authorize tool access based on skills
   */
  authorizeToolAccess(agentType, toolName) {
    const toolRequirements = this.skillRequirements.get(toolName);
    if (!toolRequirements) {
      // No skill requirements defined - allow access
      return true;
    }

    const agentConfig = this.agentWhitelist.get(agentType);
    if (!agentConfig) {
      return false;
    }

    const requiredSkills = toolRequirements.requiredSkills || [];
    const agentSkills = agentConfig.skills || [];

    // Check if agent has all required skills
    return requiredSkills.every(skill => agentSkills.includes(skill));
  }

  /**
   * Check rate limits for agent
   */
  checkRateLimit(agentType, token) {
    const now = Date.now();
    const windowStart = now - (this.options.rateLimitWindow * 1000);
    const key = `${agentType}:${token}`;

    if (!this.rateLimitCache.has(key)) {
      this.rateLimitCache.set(key, []);
    }

    const requests = this.rateLimitCache.get(key);

    // Remove old requests outside window
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    this.rateLimitCache.set(key, validRequests);

    // Check if under limit
    if (validRequests.length >= this.options.rateLimitMax) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    return true;
  }

  /**
   * Update agent activity in Redis
   */
  async updateAgentActivity(token, agentType) {
    try {
      const key = `mcp:agent:${agentType}:${token}`;
      const activity = {
        lastActivity: Date.now(),
        requestCount: 1
      };

      await this.redis.hIncrBy(key, 'requestCount', 1);
      await this.redis.hSet(key, 'lastActivity', Date.now().toString());
      await this.redis.expire(key, this.parseExpiry(this.options.tokenExpiry));
    } catch (error) {
      console.error('[MCPAuth] Failed to update activity:', error);
    }
  }

  /**
   * Generate agent token
   */
  generateAgentToken(agentType, skills = [], expiresIn = null) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (this.parseExpiry(expiresIn || this.options.tokenExpiry) * 1000);

    return {
      token,
      agentType,
      skills,
      expiresAt,
      createdAt: Date.now()
    };
  }

  /**
   * Register agent token in Redis
   */
  async registerAgentToken(tokenData) {
    try {
      const key = `mcp:agent:${tokenData.agentType}:${tokenData.token}`;
      const value = JSON.stringify(tokenData);

      await this.redis.setEx(key, this.parseExpiry(this.options.tokenExpiry), value);

      console.log(`[MCPAuth] Registered token for agent: ${tokenData.agentType}`);
      return tokenData;
    } catch (error) {
      console.error('[MCPAuth] Failed to register token:', error);
      throw error;
    }
  }

  /**
   * Revoke agent token
   */
  async revokeAgentToken(agentType, token) {
    try {
      const key = `mcp:agent:${agentType}:${token}`;
      await this.redis.del(key);

      console.log(`[MCPAuth] Revoked token for agent: ${agentType}`);
      return true;
    } catch (error) {
      console.error('[MCPAuth] Failed to revoke token:', error);
      return false;
    }
  }

  /**
   * Send error response
   */
  sendErrorResponse(response, statusCode, message, details = null) {
    const errorResponse = {
      jsonrpc: '2.0',
      error: {
        code: statusCode === 401 ? -32001 : statusCode === 403 ? -32002 : -32003,
        message,
        ...(details && { details })
      },
      id: response.body?.id || null
    };

    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(errorResponse));
  }

  /**
   * Parse expiry string to seconds
   */
  parseExpiry(expiry) {
    if (typeof expiry === 'number') {
      return expiry;
    }

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 3600; // Default to 1 hour
    }

    const value = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };

    return value * (multipliers[unit] || 3600);
  }

  /**
   * Start cleanup interval for rate limit cache
   */
  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      const windowStart = now - (this.options.rateLimitWindow * 1000);

      for (const [key, requests] of this.rateLimitCache.entries()) {
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        if (validRequests.length === 0) {
          this.rateLimitCache.delete(key);
        } else {
          this.rateLimitCache.set(key, validRequests);
        }
      }
    }, 60000); // Clean up every minute
  }

  /**
   * Get authentication statistics
   */
  async getStats() {
    try {
      const stats = {
        registeredAgents: this.agentWhitelist.size,
        configuredTools: this.skillRequirements.size,
        rateLimitedClients: this.rateLimitCache.size,
        redisConnected: this.redis?.isOpen || false
      };

      // Get active tokens count
      if (this.redis?.isOpen) {
        const keys = await this.redis.keys('mcp:agent:*');
        stats.activeTokens = keys.length;
      }

      return stats;
    } catch (error) {
      console.error('[MCPAuth] Failed to get stats:', error);
      return { error: error.message };
    }
  }

  /**
   * Shutdown authentication middleware
   */
  async shutdown() {
    try {
      if (this.redis) {
        await this.redis.quit();
        this.redis = null;
      }
      console.log('[MCPAuth] Authentication middleware shutdown complete');
    } catch (error) {
      console.error('[MCPAuth] Shutdown error:', error);
    }
  }
}

module.exports = MCPAuthMiddleware;