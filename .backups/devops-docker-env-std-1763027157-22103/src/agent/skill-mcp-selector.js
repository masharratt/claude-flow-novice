/**
 * Skill-based MCP Selection System
 * Automatically selects MCP servers based on agent skills and requirements
 */

const fs = require('fs').promises;
const path = require('path');
const AgentTokenManager = require('../cli/agent-token-manager.js');

class SkillMCPSelector {
  constructor(options = {}) {
    this.tokenManager = new AgentTokenManager(options);
    this.agentConfigPath = options.agentConfigPath || './config/agent-whitelist.json';
    this.skillConfigPath = options.skillConfigPath || './config/skill-requirements.json';
    this.mcpServersPath = options.mcpServersPath || './config/mcp-servers.json';

    this.agentWhitelist = new Map();
    this.skillRequirements = new Map();
    this.mcpServers = new Map();
  }

  async initialize() {
    await this.tokenManager.initialize();
    await this.loadConfigurations();
    console.log('[SkillMCPSelector] Initialized successfully');
  }

  async loadConfigurations() {
    // Load agent whitelist
    const agentConfig = await this.loadJson(this.agentConfigPath);
    this.agentWhitelist.clear();
    for (const agent of agentConfig.agents) {
      this.agentWhitelist.set(agent.type, agent);
    }

    // Load skill requirements
    const skillConfig = await this.loadJson(this.skillConfigPath);
    this.skillRequirements.clear();
    for (const [tool, requirements] of Object.entries(skillConfig.tools)) {
      this.skillRequirements.set(tool, requirements);
    }

    // Load MCP server configurations
    try {
      const mcpConfig = await this.loadJson(this.mcpServersPath);
      for (const [name, config] of Object.entries(mcpConfig.servers)) {
        this.mcpServers.set(name, config);
      }
    } catch (error) {
      console.warn('[SkillMCPSelector] MCP servers config not found, using defaults');
      this.initializeDefaultMCPServers();
    }
  }

  async loadJson(filePath) {
    const resolvedPath = path.resolve(filePath);
    const content = await fs.readFile(resolvedPath, 'utf8');
    return JSON.parse(content);
  }

  initializeDefaultMCPServers() {
    // Default MCP server configurations
    const defaultServers = {
      'playwright': {
        name: 'playwright',
        displayName: 'Playwright Browser Automation',
        description: 'Browser automation and screenshot capabilities',
        containerImage: 'claude-flow-novice:mcp-playwright',
        tools: ['take_screenshot', 'search_google', 'navigate_and_interact'],
        skills: ['browser-automation', 'screenshot-capture', 'web-interaction'],
        resourceRequirements: {
          memoryMB: 1024,
          cpuUnits: 2
        }
      },
      'redis': {
        name: 'redis',
        displayName: 'Redis Database',
        description: 'Redis key-value store operations',
        containerImage: 'claude-flow-novice:mcp-redis',
        tools: ['redis_get', 'redis_set', 'redis_keys'],
        skills: ['redis-operations', 'cache-management'],
        resourceRequirements: {
          memoryMB: 256,
          cpuUnits: 1
        }
      },
      'postgres': {
        name: 'postgres',
        displayName: 'PostgreSQL Database',
        description: 'PostgreSQL database operations',
        containerImage: 'claude-flow-novice:mcp-postgres',
        tools: ['postgres_query', 'postgres_schema', 'postgres_migrate'],
        skills: ['database-design', 'sql-operations'],
        resourceRequirements: {
          memoryMB: 512,
          cpuUnits: 2
        }
      },
      'security-scanner': {
        name: 'security-scanner',
        displayName: 'Security Scanner',
        description: 'Security vulnerability scanning and analysis',
        containerImage: 'claude-flow-novice:mcp-security',
        tools: ['security_scan', 'vulnerability_check', 'compliance_validate'],
        skills: ['security-auditing', 'vulnerability-scanning'],
        resourceRequirements: {
          memoryMB: 1536,
          cpuUnits: 4
        }
      }
    };

    for (const [name, config] of Object.entries(defaultServers)) {
      this.mcpServers.set(name, config);
    }
  }

  /**
   * Determine which MCP servers an agent needs based on their skills
   */
  selectMCPServers(agentType, agentSkills = null) {
    const agentConfig = this.agentWhitelist.get(agentType);
    if (!agentConfig) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    // Use provided skills or fall back to agent config
    const skills = agentSkills || agentConfig.skills;

    // Determine required MCP servers based on skills
    const requiredMCPServers = new Set();
    const skillToMCPServerMap = this.getSkillToMCPServerMapping();

    // Map skills to required MCP servers
    for (const skill of skills) {
      if (skillToMCPServerMap.has(skill)) {
        const servers = skillToMCPServerMap.get(skill);
        servers.forEach(server => requiredMCPServers.add(server));
      }
    }

    // Add explicitly allowed MCP servers from agent config
    if (agentConfig.allowedMcpServers) {
      agentConfig.allowedMcpServers.forEach(server => requiredMCPServers.add(server));
    }

    // Convert to array and sort by priority
    const selectedServers = Array.from(requiredMCPServers)
      .filter(server => this.mcpServers.has(server))
      .sort((a, b) => {
        const priorityA = this.mcpServers.get(a).priority || 999;
        const priorityB = this.mcpServers.get(b).priority || 999;
        return priorityA - priorityB;
      });

    return {
      agentType,
      agentSkills: skills,
      selectedMCPServers,
      serverDetails: selectedServers.map(server => this.mcpServers.get(server)),
      totalMemoryRequired: selectedServers.reduce((sum, server) =>
        sum + (this.mcpServers.get(server).resourceRequirements?.memoryMB || 512), 0),
      totalCPURequired: selectedServers.reduce((sum, server) =>
        sum + (this.mcpServers.get(server).resourceRequirements?.cpuUnits || 1), 0)
    };
  }

  /**
   * Get mapping from skills to required MCP servers
   */
  getSkillToMCPServerMapping() {
    const skillMap = new Map();

    // Build mapping from MCP server configurations
    for (const [serverName, serverConfig] of this.mcpServers.entries()) {
      for (const skill of serverConfig.skills || []) {
        if (!skillMap.has(skill)) {
          skillMap.set(skill, new Set());
        }
        skillMap.get(skill).add(serverName);
      }
    }

    // Also add mappings from tool requirements
    for (const [toolName, toolConfig] of this.skillRequirements.entries()) {
      for (const skill of toolConfig.requiredSkills || []) {
        // Find MCP servers that provide this tool
        for (const [serverName, serverConfig] of this.mcpServers.entries()) {
          if (serverConfig.tools?.includes(toolName)) {
            if (!skillMap.has(skill)) {
              skillMap.set(skill, new Set());
            }
            skillMap.get(skill).add(serverName);
          }
        }
      }
    }

    return skillMap;
  }

  /**
   * Generate tokens for selected MCP servers
   */
  async generateMCPTokens(agentType, selectedServers, options = {}) {
    const tokens = [];

    for (const serverName of selectedServers) {
      try {
        const serverConfig = this.mcpServers.get(serverName);
        if (!serverConfig) {
          console.warn(`[SkillMCPSelector] Server configuration not found: ${serverName}`);
          continue;
        }

        // Generate server-specific token
        const tokenData = await this.tokenManager.registerAgentToken(agentType, {
          expiresIn: options.expiresIn || '24h',
          description: `Token for ${serverConfig.displayName}`,
          createdBy: 'skill-mcp-selector',
          mcpServer: serverName
        });

        tokens.push({
          serverName,
          displayName: serverConfig.displayName,
          token: tokenData.token,
          expiresAt: tokenData.expiresAt,
          containerImage: serverConfig.containerImage,
          connectionInfo: this.generateConnectionInfo(serverName, serverConfig, tokenData.token)
        });

        console.log(`[SkillMCPSelector] Generated token for ${agentType} → ${serverName}`);
      } catch (error) {
        console.error(`[SkillMCPSelector] Failed to generate token for ${serverName}:`, error);
      }
    }

    return tokens;
  }

  /**
   * Generate connection information for MCP server
   */
  generateConnectionInfo(serverName, serverConfig, token) {
    const baseInfo = {
      serverName,
      token,
      authentication: {
        type: 'token-based',
        header: 'x-agent-token',
        agentTypeHeader: 'x-agent-type'
      }
    };

    // Add server-specific connection details
    if (serverConfig.connectionType === 'docker') {
      return {
        ...baseInfo,
        type: 'docker-container',
        containerName: `mcp-${serverName}`,
        containerImage: serverConfig.containerImage,
        dockerArgs: [
          'run', '--rm', '--init',
          '--name', `mcp-${serverName}`,
          '--memory', `${serverConfig.resourceRequirements?.memoryMB || 512}m`,
          '--cpus', `${serverConfig.resourceRequirements?.cpuUnits || 1}`,
          '-e', `MCP_SERVER=${serverName}`,
          '-e', `MCP_AUTH_REQUIRED=true`,
          '-e', `MCP_REDIS_URL=${process.env.MCP_REDIS_URL || 'redis://localhost:6379'}`,
          serverConfig.containerImage,
          'node', `/app/mcp-${serverName}-server.js`
        ]
      };
    } else {
      return {
        ...baseInfo,
        type: 'http-endpoint',
        url: serverConfig.url || `http://localhost:${3000 + this.mcpServers.size}`,
        headers: {
          'Content-Type': 'application/json',
          'x-agent-token': token,
          'x-agent-type': 'dynamic'
        }
      };
    }
  }

  /**
   * Get complete MCP configuration for an agent
   */
  async getAgentMCPConfiguration(agentType, agentSkills = null, options = {}) {
    try {
      // Select required MCP servers
      const selection = this.selectMCPServers(agentType, agentSkills);

      // Generate tokens for selected servers
      const tokens = await this.generateMCPTokens(
        agentType,
        selection.selectedMCPServers,
        options
      );

      return {
        agentType,
        agentSkills: selection.agentSkills,
        mcpConfiguration: {
          mcpServers: tokens.reduce((config, tokenInfo) => {
            config[tokenInfo.serverName] = {
              command: 'docker',
              args: tokenInfo.connectionInfo.dockerArgs,
              env: {
                'MCP_SERVER': tokenInfo.serverName,
                'MCP_AUTH_REQUIRED': 'true',
                'AGENT_TOKEN': tokenInfo.token
              }
            };
            return config;
          }, {})
        },
        selection,
        tokens,
        resourceSummary: {
          totalMemoryMB: selection.totalMemoryRequired,
          totalCPUUnits: selection.totalCPUUnits,
          serverCount: selection.selectedMCPServers.length
        }
      };
    } catch (error) {
      console.error(`[SkillMCPSelector] Failed to get MCP configuration for ${agentType}:`, error);
      throw error;
    }
  }

  /**
   * Generate Docker Compose configuration for agent with MCP servers
   */
  async generateDockerComposeConfiguration(agentType, agentSkills = null, options = {}) {
    const config = await this.getAgentMCPConfiguration(agentType, agentSkills, options);

    const dockerCompose = {
      version: '3.8',
      services: {},
      networks: {
        'mcp-network': {
          driver: 'bridge'
        }
      }
    };

    // Add agent service
    dockerCompose.services[`${agentType}-agent`] = {
      image: 'claude-flow-novice:agent-container',
      container_name: `agent-${agentType}-${Date.now()}`,
      networks: ['mcp-network'],
      environment: {
        'AGENT_TYPE': agentType,
        'AGENT_MODE': 'containerized',
        'MCP_AUTH_ENABLED': 'true',
        'REDIS_URL': process.env.MCP_REDIS_URL || 'redis://redis:6379'
      },
      volumes: [
        '${PWD}/.claude:/app/.claude:ro',
        '${PWD}/screenshots:/app/screenshots'
      ],
      mem_limit: `${config.resourceSummary.totalMemoryMB + 512}m`,
      depends_on: config.selection.selectedMCPServers.map(server => `mcp-${server}`).join(' ')
    };

    // Add MCP server services
    for (const tokenInfo of config.tokens) {
      const serverName = `mcp-${tokenInfo.serverName}`;
      const serverConfig = this.mcpServers.get(tokenInfo.serverName);

      dockerCompose.services[serverName] = {
        image: tokenInfo.containerImage,
        container_name: `${serverName}-${Date.now()}`,
        networks: ['mcp-network'],
        environment: {
          'MCP_SERVER': tokenInfo.serverName,
          'MCP_AUTH_REQUIRED': 'true',
          'MCP_REDIS_URL': process.env.MCP_REDIS_URL || 'redis://redis:6379',
          'AGENT_TOKEN': tokenInfo.token
        },
        volumes: [
          '${PWD}/screenshots:/app/screenshots'
        ],
        mem_limit: `${serverConfig.resourceRequirements?.memoryMB || 512}m`,
        cpus: `${(serverConfig.resourceRequirements?.cpuUnits || 1) / 4}`
      };
    }

    // Add Redis service if not present
    if (!dockerCompose.services.redis) {
      dockerCompose.services.redis = {
        image: 'redis:7-alpine',
        container_name: 'mcp-redis',
        networks: ['mcp-network'],
        volumes: ['redis-data:/data'],
        mem_limit: '256m'
      };
      dockerCompose.volumes = {
        'redis-data': {}
      };
    }

    return dockerCompose;
  }

  /**
   * Get statistics about skill-MCP mappings
   */
  getStatistics() {
    const skillMap = this.getSkillToMCPServerMapping();

    return {
      totalAgents: this.agentWhitelist.size,
      totalMCPServers: this.mcpServers.size,
      totalSkills: skillMap.size,
      agentTypes: Array.from(this.agentWhitelist.keys()),
      mcpServerNames: Array.from(this.mcpServers.keys()),
      skillCoverage: Array.from(skillMap.entries()).map(([skill, servers]) => ({
        skill,
        requiredServers: Array.from(servers),
        serverCount: servers.size
      }))
    };
  }

  /**
   * Validate agent-MCP configuration
   */
  validateConfiguration(agentType, mcpConfiguration) {
    const agentConfig = this.agentWhitelist.get(agentType);
    if (!agentConfig) {
      return { valid: false, errors: [`Unknown agent type: ${agentType}`] };
    }

    const errors = [];
    const warnings = [];

    // Check required MCP servers
    const requiredServers = agentConfig.allowedMcpServers || [];
    const configuredServers = Object.keys(mcpConfiguration.mcpServers || {});

    for (const server of requiredServers) {
      if (!configuredServers.includes(server)) {
        errors.push(`Required MCP server missing: ${server}`);
      }
    }

    // Check for unauthorized servers
    for (const server of configuredServers) {
      if (!requiredServers.includes(server)) {
        warnings.push(`Potentially unauthorized MCP server: ${server}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  async shutdown() {
    await this.tokenManager.shutdown();
  }
}

module.exports = SkillMCPSelector;