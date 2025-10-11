/**
 * AgentRegistry - Registry for swarm agents with ACL management
 * Phase 1 Foundation Infrastructure & Event Bus Architecture
 *
 * Manages agent registration, capabilities, permissions, and coordination
 * within the swarm memory system.
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class AgentRegistry extends EventEmitter {
  constructor(options = {}) {
    super();

    this.swarmId = options.swarmId || 'phase-1-foundation-infrastructure';
    this.namespace = options.namespace || 'agent-registry';

    // In-memory agent cache
    this.agents = new Map();
    this.teams = new Map();
    this.permissions = new Map();

    // Default agent types and their base capabilities
    this.defaultCapabilities = {
      'architect': ['design', 'plan', 'coordinate', 'validate', 'system-access'],
      'coder': ['code', 'test', 'debug', 'deploy', 'memory-write'],
      'tester': ['test', 'validate', 'quality', 'metrics', 'memory-read'],
      'reviewer': ['review', 'validate', 'approve', 'audit', 'memory-read'],
      'backend-dev': ['api', 'database', 'security', 'performance', 'memory-write'],
      'frontend-dev': ['ui', 'ux', 'client', 'integration', 'memory-write'],
      'security-specialist': ['security', 'audit', 'penetration', 'compliance', 'system-access'],
      'perf-analyzer': ['performance', 'metrics', 'optimization', 'monitoring', 'memory-read'],
      'api-docs': ['documentation', 'api', 'specification', 'examples', 'memory-write'],
      'researcher': ['research', 'analysis', 'discovery', 'knowledge', 'memory-write'],
      'planner': ['plan', 'coordinate', 'schedule', 'resources', 'memory-write'],
      'devops-engineer': ['deployment', 'infrastructure', 'monitoring', 'automation', 'system-access'],
      'cicd-engineer': ['pipeline', 'automation', 'testing', 'deployment', 'system-access']
    };

    // Default ACL levels for agent types
    this.defaultAclLevels = {
      'architect': 4,      // public
      'coder': 2,          // team
      'tester': 3,         // swarm
      'reviewer': 3,       // swarm
      'backend-dev': 2,    // team
      'frontend-dev': 2,   // team
      'security-specialist': 5, // system
      'perf-analyzer': 3,  // swarm
      'api-docs': 3,       // swarm
      'researcher': 3,     // swarm
      'planner': 4,        // public
      'devops-engineer': 5, // system
      'cicd-engineer': 5   // system
    };

    // Registry state
    this.isInitialized = false;
    this.metrics = {
      agentsRegistered: 0,
      agentsActive: 0,
      permissionsGranted: 0,
      teamsCreated: 0,
      operations: 0
    };
  }

  /**
   * Initialize the agent registry
   */
  async initialize(memoryManager) {
    if (this.isInitialized) {
      return this;
    }

    this.memoryManager = memoryManager;

    // Load existing agents from memory
    await this.loadAgents();

    // Load existing teams from memory
    await this.loadTeams();

    // Load existing permissions from memory
    await this.loadPermissions();

    this.isInitialized = true;
    this.emit('initialized');

    return this;
  }

  /**
   * Register a new agent
   */
  async registerAgent(agentInfo) {
    const agentId = agentInfo.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const agent = {
      id: agentId,
      name: agentInfo.name || `Agent-${agentId.substring(0, 8)}`,
      type: agentInfo.type || 'coder',
      status: 'active',
      swarmId: this.swarmId,
      teamId: agentInfo.teamId || null,
      capabilities: agentInfo.capabilities || this.defaultCapabilities[agentInfo.type] || [],
      metadata: agentInfo.metadata || {},
      aclLevel: agentInfo.aclLevel || this.defaultAclLevels[agentInfo.type] || 2,
      createdAt: now,
      updatedAt: now,
      lastSeen: now,
      performanceMetrics: {
        tasksCompleted: 0,
        averageConfidence: 0,
        responseTime: 0,
        errorRate: 0
      }
    };

    // Store in memory
    this.agents.set(agentId, agent);

    // Persist to memory store
    await this.memoryManager.set(`agent:${agentId}`, agent, {
      namespace: this.namespace,
      type: 'state',
      aclLevel: 3, // swarm level
      agentId: 'system'
    });

    // Grant default permissions
    await this.grantDefaultPermissions(agent);

    // Update metrics
    this.metrics.agentsRegistered++;
    this.metrics.agentsActive++;

    this.emit('agentRegistered', agent);
    return agent;
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Update status
    agent.status = 'inactive';
    agent.updatedAt = new Date().toISOString();

    // Update in memory
    this.agents.set(agentId, agent);

    // Persist changes
    await this.memoryManager.set(`agent:${agentId}`, agent, {
      namespace: this.namespace,
      type: 'state',
      aclLevel: 3,
      agentId: 'system'
    });

    // Remove from active count
    this.metrics.agentsActive--;

    this.emit('agentUnregistered', agent);
    return agent;
  }

  /**
   * Update agent information
   */
  async updateAgent(agentId, updates) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Apply updates
    const updatedAgent = {
      ...agent,
      ...updates,
      updatedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };

    // Update in memory
    this.agents.set(agentId, updatedAgent);

    // Persist changes
    await this.memoryManager.set(`agent:${agentId}`, updatedAgent, {
      namespace: this.namespace,
      type: 'state',
      aclLevel: 3,
      agentId: 'system'
    });

    this.emit('agentUpdated', updatedAgent);
    return updatedAgent;
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId) {
    // Try memory cache first
    let agent = this.agents.get(agentId);

    // If not in cache, try memory store
    if (!agent) {
      try {
        agent = await this.memoryManager.get(`agent:${agentId}`, {
          namespace: this.namespace,
          agentId: 'system'
        });

        if (agent) {
          this.agents.set(agentId, agent);
        }
      } catch (error) {
        // Agent not found in memory store
      }
    }

    return agent;
  }

  /**
   * List all agents
   */
  async listAgents(filter = {}) {
    const agents = Array.from(this.agents.values());

    // Apply filters
    let filtered = agents;

    if (filter.type) {
      filtered = filtered.filter(agent => agent.type === filter.type);
    }

    if (filter.status) {
      filtered = filtered.filter(agent => agent.status === filter.status);
    }

    if (filter.teamId) {
      filtered = filtered.filter(agent => agent.teamId === filter.teamId);
    }

    if (filter.capability) {
      filtered = filtered.filter(agent =>
        agent.capabilities.includes(filter.capability)
      );
    }

    return filtered;
  }

  /**
   * Create a team
   */
  async createTeam(teamInfo) {
    const teamId = teamInfo.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const team = {
      id: teamId,
      name: teamInfo.name || `Team-${teamId.substring(0, 8)}`,
      description: teamInfo.description || '',
      swarmId: this.swarmId,
      leaderId: teamInfo.leaderId || null,
      members: teamInfo.members || [],
      capabilities: teamInfo.capabilities || [],
      metadata: teamInfo.metadata || {},
      aclLevel: teamInfo.aclLevel || 2, // team level by default
      createdAt: now,
      updatedAt: now
    };

    // Store in memory
    this.teams.set(teamId, team);

    // Persist to memory store
    await this.memoryManager.set(`team:${teamId}`, team, {
      namespace: this.namespace,
      type: 'state',
      aclLevel: 3,
      agentId: 'system'
    });

    // Update metrics
    this.metrics.teamsCreated++;

    this.emit('teamCreated', team);
    return team;
  }

  /**
   * Add agent to team
   */
  async addAgentToTeam(agentId, teamId) {
    const agent = await this.getAgent(agentId);
    const team = this.teams.get(teamId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    // Update agent
    agent.teamId = teamId;
    agent.updatedAt = new Date().toISOString();

    // Update team
    if (!team.members.includes(agentId)) {
      team.members.push(agentId);
      team.updatedAt = new Date().toISOString();
    }

    // Persist changes
    await Promise.all([
      this.memoryManager.set(`agent:${agentId}`, agent, {
        namespace: this.namespace,
        type: 'state',
        aclLevel: 3,
        agentId: 'system'
      }),
      this.memoryManager.set(`team:${teamId}`, team, {
        namespace: this.namespace,
        type: 'state',
        aclLevel: 3,
        agentId: 'system'
      })
    ]);

    // Update memory cache
    this.agents.set(agentId, agent);
    this.teams.set(teamId, team);

    this.emit('agentAddedToTeam', { agent, team });
    return { agent, team };
  }

  /**
   * Remove agent from team
   */
  async removeAgentFromTeam(agentId, teamId) {
    const agent = await this.getAgent(agentId);
    const team = this.teams.get(teamId);

    if (!agent || !team) {
      throw new Error('Agent or team not found');
    }

    // Update agent
    agent.teamId = null;
    agent.updatedAt = new Date().toISOString();

    // Update team
    const memberIndex = team.members.indexOf(agentId);
    if (memberIndex > -1) {
      team.members.splice(memberIndex, 1);
      team.updatedAt = new Date().toISOString();
    }

    // Persist changes
    await Promise.all([
      this.memoryManager.set(`agent:${agentId}`, agent, {
        namespace: this.namespace,
        type: 'state',
        aclLevel: 3,
        agentId: 'system'
      }),
      this.memoryManager.set(`team:${teamId}`, team, {
        namespace: this.namespace,
        type: 'state',
        aclLevel: 3,
        agentId: 'system'
      })
    ]);

    // Update memory cache
    this.agents.set(agentId, agent);
    this.teams.set(teamId, team);

    this.emit('agentRemovedFromTeam', { agent, team });
    return { agent, team };
  }

  /**
   * Grant permission to agent
   */
  async grantPermission(agentId, resourceType, permissionLevel, actions = []) {
    const permissionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const permission = {
      id: permissionId,
      entityId: agentId,
      entityType: 'agent',
      resourceType,
      resourceId: null, // Type-wide permission
      permissionLevel,
      actions: Array.isArray(actions) ? actions : [actions],
      conditions: {},
      grantedBy: 'system',
      expiresAt: null,
      isActive: true,
      metadata: {},
      createdAt: now,
      updatedAt: now
    };

    // Store in memory
    const key = `${agentId}:${resourceType}:${permissionLevel}`;
    this.permissions.set(key, permission);

    // Persist to memory store
    await this.memoryManager.set(`permission:${permissionId}`, permission, {
      namespace: this.namespace,
      type: 'state',
      aclLevel: 5, // system level
      agentId: 'system'
    });

    // Update metrics
    this.metrics.permissionsGranted++;

    this.emit('permissionGranted', permission);
    return permission;
  }

  /**
   * Check if agent has permission
   */
  async hasPermission(agentId, resourceType, action, permissionLevel = 3) {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      return false;
    }

    // Check agent's default ACL level
    if (agent.aclLevel >= permissionLevel) {
      // Check if agent has the specific action capability
      if (agent.capabilities.includes(action) || agent.capabilities.includes('*')) {
        return true;
      }
    }

    // Check explicit permissions
    const key = `${agentId}:${resourceType}:${permissionLevel}`;
    const permission = this.permissions.get(key);

    if (permission && permission.isActive) {
      return permission.actions.includes(action) || permission.actions.includes('*');
    }

    // Check team permissions if agent is in a team
    if (agent.teamId) {
      const team = this.teams.get(agent.teamId);
      if (team && team.aclLevel >= permissionLevel) {
        return team.capabilities.includes(action) || team.capabilities.includes('*');
      }
    }

    return false;
  }

  /**
   * Grant default permissions to agent
   */
  async grantDefaultPermissions(agent) {
    const defaultPermissions = [
      { resourceType: 'memory', permissionLevel: agent.aclLevel, actions: ['read', 'write'] },
      { resourceType: 'task', permissionLevel: agent.aclLevel, actions: ['read', 'write'] },
      { resourceType: 'event', permissionLevel: agent.aclLevel, actions: ['read', 'write'] },
      { resourceType: 'consensus', permissionLevel: agent.aclLevel, actions: ['read', 'vote'] }
    ];

    for (const perm of defaultPermissions) {
      await this.grantPermission(agent.id, perm.resourceType, perm.permissionLevel, perm.actions);
    }
  }

  /**
   * Update agent performance metrics
   */
  async updatePerformanceMetrics(agentId, metrics) {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Update performance metrics
    agent.performanceMetrics = {
      ...agent.performanceMetrics,
      ...metrics,
      lastUpdated: new Date().toISOString()
    };

    agent.lastSeen = new Date().toISOString();
    agent.updatedAt = new Date().toISOString();

    // Update in memory
    this.agents.set(agentId, agent);

    // Persist changes
    await this.memoryManager.set(`agent:${agentId}`, agent, {
      namespace: this.namespace,
      type: 'state',
      aclLevel: 3,
      agentId: 'system'
    });

    this.emit('metricsUpdated', { agentId, metrics });
    return agent;
  }

  /**
   * Get agents by capability
   */
  async getAgentsByCapability(capability) {
    const agents = await this.listAgents();
    return agents.filter(agent =>
      agent.capabilities.includes(capability) &&
      agent.status === 'active'
    );
  }

  /**
   * Get agents by type
   */
  async getAgentsByType(type) {
    const agents = await this.listAgents();
    return agents.filter(agent =>
      agent.type === type &&
      agent.status === 'active'
    );
  }

  /**
   * Get team members
   */
  async getTeamMembers(teamId) {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const members = [];
    for (const agentId of team.members) {
      const agent = await this.getAgent(agentId);
      if (agent) {
        members.push(agent);
      }
    }

    return members;
  }

  /**
   * Load agents from memory store
   */
  async loadAgents() {
    try {
      // In a real implementation, this would query the memory store
      // For now, we'll start with an empty registry
      console.log('📋 Loading agents from memory store...');
    } catch (error) {
      console.error('❌ Failed to load agents:', error);
    }
  }

  /**
   * Load teams from memory store
   */
  async loadTeams() {
    try {
      console.log('👥 Loading teams from memory store...');
    } catch (error) {
      console.error('❌ Failed to load teams:', error);
    }
  }

  /**
   * Load permissions from memory store
   */
  async loadPermissions() {
    try {
      console.log('🔐 Loading permissions from memory store...');
    } catch (error) {
      console.error('❌ Failed to load permissions:', error);
    }
  }

  /**
   * Get registry metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      agentsInCache: this.agents.size,
      teamsInCache: this.teams.size,
      permissionsInCache: this.permissions.size,
      activeAgents: Array.from(this.agents.values()).filter(agent => agent.status === 'active').length
    };
  }

  /**
   * Clean up inactive agents
   */
  async cleanupInactiveAgents(maxInactiveTime = 3600000) { // 1 hour
    const now = Date.now();
    const inactiveAgents = [];

    for (const [agentId, agent] of this.agents.entries()) {
      const lastSeen = new Date(agent.lastSeen).getTime();
      if (now - lastSeen > maxInactiveTime && agent.status === 'active') {
        inactiveAgents.push(agentId);
      }
    }

    for (const agentId of inactiveAgents) {
      await this.unregisterAgent(agentId);
    }

    this.emit('cleanup', { cleanedAgents: inactiveAgents });
    return inactiveAgents;
  }

  /**
   * Export registry state
   */
  async exportState() {
    const agents = Array.from(this.agents.values());
    const teams = Array.from(this.teams.values());
    const permissions = Array.from(this.permissions.values());

    return {
      swarmId: this.swarmId,
      exportedAt: new Date().toISOString(),
      agents,
      teams,
      permissions,
      metrics: this.getMetrics()
    };
  }

  /**
   * Import registry state
   */
  async importState(state) {
    if (state.swarmId !== this.swarmId) {
      throw new Error('State swarm ID mismatch');
    }

    // Import agents
    for (const agent of state.agents) {
      this.agents.set(agent.id, agent);
      await this.memoryManager.set(`agent:${agent.id}`, agent, {
        namespace: this.namespace,
        type: 'state',
        aclLevel: 3,
        agentId: 'system'
      });
    }

    // Import teams
    for (const team of state.teams) {
      this.teams.set(team.id, team);
      await this.memoryManager.set(`team:${team.id}`, team, {
        namespace: this.namespace,
        type: 'state',
        aclLevel: 3,
        agentId: 'system'
      });
    }

    // Import permissions
    for (const permission of state.permissions) {
      const key = `${permission.entityId}:${permission.resourceType}:${permission.permissionLevel}`;
      this.permissions.set(key, permission);
      await this.memoryManager.set(`permission:${permission.id}`, permission, {
        namespace: this.namespace,
        type: 'state',
        aclLevel: 5,
        agentId: 'system'
      });
    }

    this.emit('stateImported', state);
  }
}

module.exports = AgentRegistry;