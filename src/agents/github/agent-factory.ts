/**
 * GitHub Agent Factory and Registration System
 * Main entry point for creating and managing GitHub agents
 */

import { GitHubConfig, LegacyAgentType, AgentCapabilities, Repository, GitHubError } from './types';

import { GitHubIntegrationManager } from './core/github-integration-manager';
import { GitHubCollaborationManager } from './core/github-collaboration-manager';
import { GitHubReleaseCoordinator } from './core/github-release-coordinator';
import { LegacyGitHubAgentProxy } from './compatibility/legacy-agent-proxy';
import { githubHooks } from './utils/hook-integration';
import { githubErrorHandler } from './utils/error-handling';
import { githubPerformanceOptimizer } from './utils/performance-optimizer';

export type ConsolidatedAgentType = 'integration' | 'collaboration' | 'release';

export interface AgentInstance {
  id: string;
  type: ConsolidatedAgentType | LegacyAgentType;
  agent: any;
  capabilities: AgentCapabilities;
  created_at: string;
  config: GitHubConfig;
  legacy: boolean;
}

export interface AgentRegistryStats {
  total_agents: number;
  active_agents: number;
  legacy_agents: number;
  consolidated_agents: number;
  by_type: Record<string, number>;
  memory_usage: number;
  performance_metrics: any;
}

export class GitHubAgentFactory {
  private agents: Map<string, AgentInstance> = new Map();
  private defaultConfig: GitHubConfig;
  private registryStats: AgentRegistryStats;

  constructor(defaultConfig: GitHubConfig) {
    this.defaultConfig = defaultConfig;
    this.registryStats = {
      total_agents: 0,
      active_agents: 0,
      legacy_agents: 0,
      consolidated_agents: 0,
      by_type: {},
      memory_usage: 0,
      performance_metrics: {},
    };

    this.setupFactory();
  }

  // =============================================================================
  // CONSOLIDATED AGENT CREATION
  // =============================================================================

  /**
   * Create a new consolidated GitHub agent
   */
  createConsolidatedAgent(
    type: ConsolidatedAgentType,
    config?: Partial<GitHubConfig>,
    customId?: string,
  ): string {
    const agentConfig = { ...this.defaultConfig, ...config };
    const agentId = customId || this.generateAgentId(type);

    let agent: any;
    let capabilities: AgentCapabilities;

    switch (type) {
      case 'integration':
        agent = new GitHubIntegrationManager(agentConfig, agentId);
        capabilities = agent.getCapabilities();
        break;

      case 'collaboration':
        agent = new GitHubCollaborationManager(agentConfig, agentId);
        capabilities = agent.getCapabilities();
        break;

      case 'release':
        agent = new GitHubReleaseCoordinator(agentConfig, agentId);
        capabilities = agent.getCapabilities();
        break;

      default:
        throw new Error(`Unknown consolidated agent type: ${type}`);
    }

    const instance: AgentInstance = {
      id: agentId,
      type,
      agent,
      capabilities,
      created_at: new Date().toISOString(),
      config: agentConfig,
      legacy: false,
    };

    this.agents.set(agentId, instance);
    this.updateRegistryStats();

    console.log(`[GitHubAgentFactory] Created consolidated agent: ${agentId} (${type})`);
    return agentId;
  }

  /**
   * Create a legacy agent (for backward compatibility)
   */
  createLegacyAgent(
    type: LegacyAgentType,
    config?: Partial<GitHubConfig>,
    customId?: string,
  ): string {
    const agentConfig = { ...this.defaultConfig, ...config };
    const agentId = customId || this.generateAgentId(type);

    const agent = new LegacyGitHubAgentProxy(agentConfig, type);
    const capabilities = this.getLegacyCapabilities(type);

    const instance: AgentInstance = {
      id: agentId,
      type,
      agent,
      capabilities,
      created_at: new Date().toISOString(),
      config: agentConfig,
      legacy: true,
    };

    this.agents.set(agentId, instance);
    this.updateRegistryStats();

    console.warn(
      `[GitHubAgentFactory] Created legacy agent: ${agentId} (${type}) - Consider migrating to consolidated agents`,
    );
    return agentId;
  }

  // =============================================================================
  // AGENT MANAGEMENT
  // =============================================================================

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): AgentInstance | null {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get all agents of a specific type
   */
  getAgentsByType(type: ConsolidatedAgentType | LegacyAgentType): AgentInstance[] {
    return Array.from(this.agents.values()).filter((instance) => instance.type === type);
  }

  /**
   * Get all consolidated agents
   */
  getConsolidatedAgents(): AgentInstance[] {
    return Array.from(this.agents.values()).filter((instance) => !instance.legacy);
  }

  /**
   * Get all legacy agents
   */
  getLegacyAgents(): AgentInstance[] {
    return Array.from(this.agents.values()).filter((instance) => instance.legacy);
  }

  /**
   * Remove an agent from the registry
   */
  removeAgent(agentId: string): boolean {
    const removed = this.agents.delete(agentId);
    if (removed) {
      this.updateRegistryStats();
      console.log(`[GitHubAgentFactory] Removed agent: ${agentId}`);
    }
    return removed;
  }

  /**
   * Update agent configuration
   */
  updateAgentConfig(agentId: string, config: Partial<GitHubConfig>): boolean {
    const instance = this.agents.get(agentId);
    if (!instance) return false;

    instance.config = { ...instance.config, ...config };
    console.log(`[GitHubAgentFactory] Updated configuration for agent: ${agentId}`);
    return true;
  }

  // =============================================================================
  // SMART AGENT SELECTION
  // =============================================================================

  /**
   * Get the best agent for a specific operation
   */
  getBestAgentForOperation(
    operation: string,
    context?: {
      repository?: Repository;
      priority?: 'speed' | 'features' | 'compatibility';
    },
  ): AgentInstance | null {
    const availableAgents = Array.from(this.agents.values());

    // Filter agents that can handle the operation
    const capableAgents = availableAgents.filter((instance) =>
      this.canHandleOperation(instance, operation),
    );

    if (capableAgents.length === 0) {
      return null;
    }

    // Select based on priority
    const priority = context?.priority || 'features';

    switch (priority) {
      case 'speed':
        // Prefer consolidated agents for performance
        return capableAgents.find((a) => !a.legacy) || capableAgents[0];

      case 'features':
        // Prefer agents with most capabilities
        return capableAgents.sort(
          (a, b) => this.countCapabilities(b.capabilities) - this.countCapabilities(a.capabilities),
        )[0];

      case 'compatibility':
        // Prefer legacy agents if available for maximum compatibility
        return capableAgents.find((a) => a.legacy) || capableAgents[0];

      default:
        return capableAgents[0];
    }
  }

  /**
   * Auto-create agent based on operation requirements
   */
  createAgentForOperation(operation: string, config?: Partial<GitHubConfig>): string {
    const requiredType = this.determineAgentTypeForOperation(operation);

    if (this.isConsolidatedType(requiredType)) {
      return this.createConsolidatedAgent(requiredType as ConsolidatedAgentType, config);
    } else {
      return this.createLegacyAgent(requiredType as LegacyAgentType, config);
    }
  }

  // =============================================================================
  // AGENT ORCHESTRATION
  // =============================================================================

  /**
   * Execute operation across multiple agents
   */
  async executeMultiAgentOperation(
    operation: string,
    data: any,
    options: {
      agents?: string[];
      parallel?: boolean;
      failFast?: boolean;
    } = {},
  ): Promise<any[]> {
    const targetAgents = options.agents
      ? (options.agents.map((id) => this.getAgent(id)).filter(Boolean) as AgentInstance[])
      : this.getCapableAgents(operation);

    if (targetAgents.length === 0) {
      throw new Error(`No agents available for operation: ${operation}`);
    }

    const executeOnAgent = async (instance: AgentInstance) => {
      try {
        const method = instance.agent[operation];
        if (typeof method !== 'function') {
          throw new Error(`Operation ${operation} not supported by agent ${instance.id}`);
        }

        const result = await method.call(instance.agent, data);
        return { agent_id: instance.id, success: true, result };
      } catch (error) {
        const gitHubError = githubErrorHandler.handleError(
          error,
          operation,
          instance.id,
          data.repository,
          { multi_agent: true },
        );

        if (options.failFast) {
          throw gitHubError;
        }

        return { agent_id: instance.id, success: false, error: gitHubError };
      }
    };

    if (options.parallel) {
      const promises = targetAgents.map(executeOnAgent);
      return await Promise.all(promises);
    } else {
      const results = [];
      for (const agent of targetAgents) {
        const result = await executeOnAgent(agent);
        results.push(result);

        if (!result.success && options.failFast) {
          break;
        }
      }
      return results;
    }
  }

  /**
   * Coordinate agents for complex workflows
   */
  async coordinateAgents(
    workflow: Array<{
      operation: string;
      data: any;
      agents?: string[];
      dependencies?: string[];
    }>,
  ): Promise<any> {
    const results: Record<string, any> = {};
    const completedSteps = new Set<string>();

    for (const [index, step] of workflow.entries()) {
      const stepId = `step_${index}`;

      // Wait for dependencies
      if (step.dependencies) {
        const missingDeps = step.dependencies.filter((dep) => !completedSteps.has(dep));
        if (missingDeps.length > 0) {
          throw new Error(`Step ${stepId} has missing dependencies: ${missingDeps.join(', ')}`);
        }
      }

      try {
        const result = await this.executeMultiAgentOperation(step.operation, step.data, {
          agents: step.agents,
          parallel: true,
          failFast: true,
        });

        results[stepId] = result;
        completedSteps.add(stepId);

        console.log(`[GitHubAgentFactory] Completed workflow step: ${stepId}`);
      } catch (error) {
        console.error(`[GitHubAgentFactory] Workflow step failed: ${stepId}`, error);
        throw error;
      }
    }

    return results;
  }

  // =============================================================================
  // REGISTRY MANAGEMENT
  // =============================================================================

  /**
   * Get registry statistics
   */
  getRegistryStats(): AgentRegistryStats {
    this.updateRegistryStats();
    return { ...this.registryStats };
  }

  /**
   * Export agent registry configuration
   */
  exportRegistry(): any {
    return {
      timestamp: new Date().toISOString(),
      agents: Array.from(this.agents.values()).map((instance) => ({
        id: instance.id,
        type: instance.type,
        capabilities: instance.capabilities,
        created_at: instance.created_at,
        legacy: instance.legacy,
      })),
      stats: this.getRegistryStats(),
    };
  }

  /**
   * Import agent registry configuration
   */
  importRegistry(registryData: any): number {
    let imported = 0;

    for (const agentData of registryData.agents || []) {
      try {
        if (agentData.legacy) {
          this.createLegacyAgent(agentData.type, {}, agentData.id);
        } else {
          this.createConsolidatedAgent(agentData.type, {}, agentData.id);
        }
        imported++;
      } catch (error) {
        console.warn(`[GitHubAgentFactory] Failed to import agent ${agentData.id}:`, error);
      }
    }

    console.log(`[GitHubAgentFactory] Imported ${imported} agents`);
    return imported;
  }

  /**
   * Clear all agents from registry
   */
  clearRegistry(): number {
    const count = this.agents.size;
    this.agents.clear();
    this.updateRegistryStats();
    console.log(`[GitHubAgentFactory] Cleared ${count} agents from registry`);
    return count;
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private setupFactory(): void {
    console.log('[GitHubAgentFactory] Initializing GitHub Agent Factory');

    // Setup global error handling
    process.on('uncaughtException', (error) => {
      console.error('[GitHubAgentFactory] Uncaught exception:', error);
    });

    // Setup performance monitoring
    setInterval(() => {
      this.updateRegistryStats();
    }, 60000); // Update stats every minute
  }

  private generateAgentId(type: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}-${timestamp}-${random}`;
  }

  private getLegacyCapabilities(type: LegacyAgentType): AgentCapabilities {
    // Define capabilities for legacy agents based on their type
    const capabilityMap: Record<LegacyAgentType, AgentCapabilities> = {
      'github-modes': {
        repositories: true,
        pull_requests: false,
        issues: false,
        workflows: true,
        releases: false,
        multi_repo: true,
      },
      'pr-manager': {
        repositories: false,
        pull_requests: true,
        issues: false,
        workflows: false,
        releases: false,
        multi_repo: false,
      },
      'code-review-swarm': {
        repositories: false,
        pull_requests: true,
        issues: false,
        workflows: false,
        releases: false,
        multi_repo: false,
      },
      'issue-tracker': {
        repositories: false,
        pull_requests: false,
        issues: true,
        workflows: false,
        releases: false,
        multi_repo: false,
      },
      'release-manager': {
        repositories: false,
        pull_requests: false,
        issues: false,
        workflows: false,
        releases: true,
        multi_repo: false,
      },
      'workflow-automation': {
        repositories: false,
        pull_requests: false,
        issues: false,
        workflows: true,
        releases: false,
        multi_repo: false,
      },
      'project-board-sync': {
        repositories: false,
        pull_requests: true,
        issues: true,
        workflows: false,
        releases: false,
        multi_repo: false,
      },
      'repo-architect': {
        repositories: true,
        pull_requests: false,
        issues: false,
        workflows: false,
        releases: false,
        multi_repo: false,
      },
      'multi-repo-swarm': {
        repositories: true,
        pull_requests: false,
        issues: false,
        workflows: false,
        releases: true,
        multi_repo: true,
      },
      'github-integration': {
        repositories: true,
        pull_requests: false,
        issues: false,
        workflows: true,
        releases: false,
        multi_repo: true,
      },
      'github-analytics': {
        repositories: true,
        pull_requests: true,
        issues: true,
        workflows: true,
        releases: true,
        multi_repo: true,
      },
      'github-security': {
        repositories: true,
        pull_requests: true,
        issues: true,
        workflows: false,
        releases: false,
        multi_repo: false,
      },
    };

    return (
      capabilityMap[type] || {
        repositories: false,
        pull_requests: false,
        issues: false,
        workflows: false,
        releases: false,
        multi_repo: false,
      }
    );
  }

  private canHandleOperation(instance: AgentInstance, operation: string): boolean {
    // Check if agent has the required capabilities for the operation
    const operationCapabilityMap: Record<string, keyof AgentCapabilities> = {
      analyzeRepository: 'repositories',
      getRepositoryStructure: 'repositories',
      createPullRequest: 'pull_requests',
      getPullRequests: 'pull_requests',
      createIssue: 'issues',
      getIssues: 'issues',
      getWorkflows: 'workflows',
      triggerWorkflow: 'workflows',
      createRelease: 'releases',
      getReleases: 'releases',
      coordinateMultiRepoRelease: 'multi_repo',
    };

    const requiredCapability = operationCapabilityMap[operation];
    if (!requiredCapability) {
      // If operation not mapped, assume agent can handle it
      return true;
    }

    return instance.capabilities[requiredCapability];
  }

  private countCapabilities(capabilities: AgentCapabilities): number {
    return Object.values(capabilities).filter(Boolean).length;
  }

  private determineAgentTypeForOperation(
    operation: string,
  ): ConsolidatedAgentType | LegacyAgentType {
    // Map operations to preferred agent types
    const operationAgentMap: Record<string, ConsolidatedAgentType> = {
      analyzeRepository: 'integration',
      getRepositoryStructure: 'integration',
      configureRepository: 'integration',
      getWorkflows: 'integration',
      triggerWorkflow: 'integration',
      monitorWorkflows: 'integration',
      executeMultiRepoOperation: 'integration',
      analyzeArchitecture: 'integration',

      createPullRequest: 'collaboration',
      getPullRequests: 'collaboration',
      updatePullRequest: 'collaboration',
      mergePullRequest: 'collaboration',
      createCodeReview: 'collaboration',
      createIssue: 'collaboration',
      getIssues: 'collaboration',
      updateIssue: 'collaboration',
      triageIssues: 'collaboration',
      syncWithProjectBoards: 'collaboration',

      createRelease: 'release',
      getReleases: 'release',
      updateRelease: 'release',
      deleteRelease: 'release',
      coordinateMultiRepoRelease: 'release',
      syncReleases: 'release',
      triggerDeployments: 'release',
      monitorDeployments: 'release',
      generateReleaseAnalytics: 'release',
    };

    return operationAgentMap[operation] || 'integration';
  }

  private isConsolidatedType(type: string): boolean {
    return ['integration', 'collaboration', 'release'].includes(type);
  }

  private getCapableAgents(operation: string): AgentInstance[] {
    return Array.from(this.agents.values()).filter((instance) =>
      this.canHandleOperation(instance, operation),
    );
  }

  private updateRegistryStats(): void {
    const agents = Array.from(this.agents.values());

    this.registryStats = {
      total_agents: agents.length,
      active_agents: agents.length, // All registered agents are considered active
      legacy_agents: agents.filter((a) => a.legacy).length,
      consolidated_agents: agents.filter((a) => !a.legacy).length,
      by_type: {},
      memory_usage: this.estimateMemoryUsage(),
      performance_metrics: githubPerformanceOptimizer.getMetrics(),
    };

    // Count by type
    for (const agent of agents) {
      this.registryStats.by_type[agent.type] = (this.registryStats.by_type[agent.type] || 0) + 1;
    }
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage
    return this.agents.size * 1024 * 100; // Assume ~100KB per agent
  }
}

// Factory singleton with default configuration
let factoryInstance: GitHubAgentFactory | null = null;

export function getGitHubAgentFactory(config?: GitHubConfig): GitHubAgentFactory {
  if (!factoryInstance) {
    if (!config) {
      throw new Error('GitHubAgentFactory requires initial configuration');
    }
    factoryInstance = new GitHubAgentFactory(config);
  }
  return factoryInstance;
}

export function createGitHubAgent(
  type: ConsolidatedAgentType | LegacyAgentType,
  config?: Partial<GitHubConfig>,
): string {
  const factory = getGitHubAgentFactory();

  if (['integration', 'collaboration', 'release'].includes(type)) {
    return factory.createConsolidatedAgent(type as ConsolidatedAgentType, config);
  } else {
    return factory.createLegacyAgent(type as LegacyAgentType, config);
  }
}
