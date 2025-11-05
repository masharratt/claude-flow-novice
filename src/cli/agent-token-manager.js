#!/usr/bin/env node

/**
 * Agent Token Management CLI
 * Generate, register, and manage agent tokens for MCP authentication
 */

const crypto = require('crypto');
const Redis = require('redis');
const fs = require('fs').promises;
const path = require('path');

class AgentTokenManager {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || process.env.MCP_REDIS_URL || 'redis://localhost:6379';
    this.redis = null;
    this.agentConfigPath = options.agentConfigPath || './config/agent-whitelist.json';
    this.defaultExpiry = options.defaultExpiry || '24h';
  }

  async initialize() {
    try {
      this.redis = Redis.createClient({ url: this.redisUrl });
      await this.redis.connect();
      console.log('Connected to Redis for token management');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async loadAgentConfig() {
    try {
      const configPath = path.resolve(this.agentConfigPath);
      const config = await fs.readFile(configPath, 'utf8');
      return JSON.parse(config);
    } catch (error) {
      console.error('Failed to load agent config:', error);
      throw error;
    }
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  parseExpiry(expiry) {
    if (typeof expiry === 'number') {
      return expiry;
    }

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 86400; // Default to 24 hours
    }

    const value = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };

    return value * (multipliers[unit] || 86400);
  }

  async registerAgentToken(agentType, options = {}) {
    try {
      const config = await this.loadAgentConfig();
      const agentConfig = config.agents.find(a => a.type === agentType);

      if (!agentConfig) {
        throw new Error(`Unknown agent type: ${agentType}. Available types: ${config.agents.map(a => a.type).join(', ')}`);
      }

      const token = this.generateToken();
      const expiresIn = options.expiresIn || this.defaultExpiry;
      const expiresAt = Date.now() + (this.parseExpiry(expiresIn) * 1000);

      const tokenData = {
        token,
        agentType,
        displayName: agentConfig.displayName,
        skills: agentConfig.skills,
        allowedMcpServers: agentConfig.allowedMcpServers,
        resourceLimits: agentConfig.resourceLimits,
        expiresAt,
        createdAt: Date.now(),
        createdBy: options.createdBy || 'cli',
        description: options.description || `Token for ${agentConfig.displayName}`
      };

      // Store in Redis
      const key = `mcp:agent:${agentType}:${token}`;
      const value = JSON.stringify(tokenData);
      const ttlSeconds = this.parseExpiry(expiresIn);

      await this.redis.setEx(key, ttlSeconds, value);

      console.log(`✅ Token registered successfully!`);
      console.log(`   Agent Type: ${agentConfig.displayName} (${agentType})`);
      console.log(`   Token: ${token}`);
      console.log(`   Skills: ${agentConfig.skills.join(', ')}`);
      console.log(`   Allowed MCP Servers: ${agentConfig.allowedMcpServers.join(', ')}`);
      console.log(`   Expires: ${new Date(expiresAt).toISOString()}`);
      console.log(`   Memory Limit: ${agentConfig.resourceLimits.maxMemoryMB}MB`);
      console.log(`   Rate Limit: ${agentConfig.resourceLimits.maxRequestsPerMinute}/min`);

      return tokenData;

    } catch (error) {
      console.error('❌ Failed to register token:', error.message);
      throw error;
    }
  }

  async listActiveTokens(agentType = null) {
    try {
      const pattern = agentType ? `mcp:agent:${agentType}:*` : 'mcp:agent:*';
      const keys = await this.redis.keys(pattern);
      const tokens = [];

      for (const key of keys) {
        const value = await this.redis.get(key);
        if (value) {
          const tokenData = JSON.parse(value);
          tokens.push({
            ...tokenData,
            key,
            status: tokenData.expiresAt > Date.now() ? 'active' : 'expired'
          });
        }
      }

      if (tokens.length === 0) {
        console.log('No active tokens found');
        return [];
      }

      console.log(`\nActive Tokens (${tokens.length}):\n`);
      console.log('Agent Type          | Token                              | Expires At                    | Status');
      console.log('-------------------|------------------------------------|------------------------------|--------');

      for (const token of tokens) {
        const expiresAt = new Date(token.expiresAt).toISOString();
        const tokenShort = token.token.substring(0, 32);
        console.log(`${token.agentType.padEnd(17)} | ${tokenShort} | ${expiresAt} | ${token.status}`);
      }

      return tokens;

    } catch (error) {
      console.error('❌ Failed to list tokens:', error.message);
      throw error;
    }
  }

  async revokeToken(agentType, token) {
    try {
      const key = `mcp:agent:${agentType}:${token}`;
      const exists = await this.redis.exists(key);

      if (!exists) {
        throw new Error(`Token not found for agent ${agentType}`);
      }

      await this.redis.del(key);
      console.log(`✅ Token revoked successfully for agent ${agentType}`);
      console.log(`   Token: ${token}`);

    } catch (error) {
      console.error('❌ Failed to revoke token:', error.message);
      throw error;
    }
  }

  async revokeAllTokens(agentType = null) {
    try {
      const pattern = agentType ? `mcp:agent:${agentType}:*` : 'mcp:agent:*';
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        console.log('No tokens found to revoke');
        return 0;
      }

      await this.redis.del(keys);
      console.log(`✅ Revoked ${keys.length} tokens${agentType ? ` for agent ${agentType}` : ''}`);
      return keys.length;

    } catch (error) {
      console.error('❌ Failed to revoke tokens:', error.message);
      throw error;
    }
  }

  async validateToken(agentType, token) {
    try {
      const key = `mcp:agent:${agentType}:${token}`;
      const value = await this.redis.get(key);

      if (!value) {
        return { valid: false, reason: 'Token not found' };
      }

      const tokenData = JSON.parse(value);

      if (Date.now() > tokenData.expiresAt) {
        await this.redis.del(key);
        return { valid: false, reason: 'Token expired' };
      }

      return {
        valid: true,
        tokenData
      };

    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }

  async getAgentInfo(agentType) {
    try {
      const config = await this.loadAgentConfig();
      const agentConfig = config.agents.find(a => a.type === agentType);

      if (!agentConfig) {
        throw new Error(`Unknown agent type: ${agentType}`);
      }

      console.log(`\nAgent Information: ${agentConfig.displayName}`);
      console.log('='.repeat(50));
      console.log(`Type: ${agentConfig.type}`);
      console.log(`Skills: ${agentConfig.skills.join(', ')}`);
      console.log(`Allowed MCP Servers: ${agentConfig.allowedMcpServers.join(', ')}`);
      console.log(`Memory Limit: ${agentConfig.resourceLimits.maxMemoryMB}MB`);
      console.log(`Rate Limit: ${agentConfig.resourceLimits.maxRequestsPerMinute}/min`);
      console.log(`Max Concurrent: ${agentConfig.resourceLimits.maxConcurrentRequests}`);
      console.log(`Description: ${agentConfig.description}`);

      return agentConfig;

    } catch (error) {
      console.error('❌ Failed to get agent info:', error.message);
      throw error;
    }
  }

  async listAgentTypes() {
    try {
      const config = await this.loadAgentConfig();

      console.log(`\nAvailable Agent Types (${config.agents.length}):\n`);
      console.log('Agent Type              | Display Name                    | Skills Count');
      console.log('------------------------|--------------------------------|-------------');

      for (const agent of config.agents) {
        const type = agent.type.padEnd(22);
        const name = agent.displayName.padEnd(32);
        const skills = agent.skills.length;
        console.log(`${type} | ${name} | ${skills}`);
      }

      return config.agents.map(a => a.type);

    } catch (error) {
      console.error('❌ Failed to list agent types:', error.message);
      throw error;
    }
  }

  async shutdown() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Agent Token Management CLI

Usage: node agent-token-manager.js <command> [options]

Commands:
  register <agent-type> [options]     Register a new token for an agent
  list [agent-type]                    List active tokens
  revoke <agent-type> <token>          Revoke a specific token
  revoke-all [agent-type]              Revoke all tokens (optionally for specific agent)
  validate <agent-type> <token>        Validate a token
  info <agent-type>                    Show agent information
  types                               List available agent types

Options for 'register' command:
  --expires-in <duration>              Token expiry (e.g., 1h, 30m, 7d) [default: 24h]
  --description <text>                 Token description
  --created-by <identifier>            Creator identifier

Examples:
  # Register token for frontend engineer
  node agent-token-manager.js register react-frontend-engineer

  # Register token with custom expiry
  node agent-token-manager.js register backend-developer --expires-in 2h

  # List all active tokens
  node agent-token-manager.js list

  # List tokens for specific agent
  node agent-token-manager.js list react-frontend-engineer

  # Revoke a specific token
  node agent-token-manager.js revoke react-frontend-engineer abc123...

  # Get agent information
  node agent-token-manager.js info security-specialist
`);
    process.exit(0);
  }

  const tokenManager = new AgentTokenManager();

  try {
    await tokenManager.initialize();

    switch (command) {
      case 'register': {
        const agentType = args[1];
        if (!agentType) {
          throw new Error('Agent type is required for register command');
        }

        const options = {};
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--expires-in') {
            options.expiresIn = args[++i];
          } else if (args[i] === '--description') {
            options.description = args[++i];
          } else if (args[i] === '--created-by') {
            options.createdBy = args[++i];
          }
        }

        await tokenManager.registerAgentToken(agentType, options);
        break;
      }

      case 'list': {
        const agentType = args[1];
        await tokenManager.listActiveTokens(agentType);
        break;
      }

      case 'revoke': {
        const agentType = args[1];
        const token = args[2];
        if (!agentType || !token) {
          throw new Error('Agent type and token are required for revoke command');
        }
        await tokenManager.revokeToken(agentType, token);
        break;
      }

      case 'revoke-all': {
        const agentType = args[1];
        const count = await tokenManager.revokeAllTokens(agentType);
        console.log(`Revoked ${count} tokens`);
        break;
      }

      case 'validate': {
        const agentType = args[1];
        const token = args[2];
        if (!agentType || !token) {
          throw new Error('Agent type and token are required for validate command');
        }

        const result = await tokenManager.validateToken(agentType, token);
        if (result.valid) {
          console.log('✅ Token is valid');
          console.log(`   Agent Type: ${result.tokenData.agentType}`);
          console.log(`   Skills: ${result.tokenData.skills.join(', ')}`);
          console.log(`   Expires: ${new Date(result.tokenData.expiresAt).toISOString()}`);
        } else {
          console.log('❌ Token is invalid');
          console.log(`   Reason: ${result.reason}`);
        }
        break;
      }

      case 'info': {
        const agentType = args[1];
        if (!agentType) {
          throw new Error('Agent type is required for info command');
        }
        await tokenManager.getAgentInfo(agentType);
        break;
      }

      case 'types': {
        await tokenManager.listAgentTypes();
        break;
      }

      default:
        throw new Error(`Unknown command: ${command}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await tokenManager.shutdown();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = AgentTokenManager;