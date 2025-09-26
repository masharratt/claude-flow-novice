/**
 * Dynamic Agent Spawner - Intelligent agent pool management and team formation
 * Scales from 2-20 agents based on feature complexity and requirements
 */

import { EventEmitter } from 'events';
import {
  FullStackAgentType,
  SwarmTeamComposition,
  FullStackAgent,
  ComplexityLevel,
  ResourceLimits,
} from '../types/index.js';
import { ILogger } from '../../core/logger.js';

export interface AgentSpawningConfig {
  maxWarmAgents: number;
  maxColdAgents: number;
  spawningTimeout: number;
  recycleThreshold: number;
  performanceThresholds: {
    minSuccessRate: number;
    maxAverageTime: number;
    minQualityScore: number;
  };
  complexityWeights: {
    simple: number;
    moderate: number;
    complex: number;
    enterprise: number;
  };
}

export interface FeatureComplexityAnalysis {
  score: number;
  factors: {
    uiComplexity: number;
    backendComplexity: number;
    dataComplexity: number;
    integrationComplexity: number;
    securityRequirements: number;
    performanceRequirements: number;
  };
  requiredSkills: string[];
  estimatedDuration: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface TeamCompositionPlan {
  totalAgents: number;
  agentTypes: {
    type: FullStackAgentType;
    count: number;
    priority: number;
    justification: string;
  }[];
  phases: {
    name: string;
    agents: FullStackAgentType[];
    duration: number;
    dependencies: string[];
  }[];
  resourceEstimate: {
    cpu: number;
    memory: number;
    duration: number;
  };
}

export class DynamicAgentSpawner extends EventEmitter {
  private config: AgentSpawningConfig;
  private warmPool = new Map<FullStackAgentType, FullStackAgent[]>();
  private coldPool = new Map<FullStackAgentType, number>();
  private activeSwarms = new Map<string, SwarmTeamComposition>();
  private performanceHistory = new Map<string, any[]>();
  private spawningQueue: Array<{
    swarmId: string;
    plan: TeamCompositionPlan;
    resolve: Function;
    reject: Function;
  }> = [];
  private isProcessingQueue = false;

  constructor(
    config: Partial<AgentSpawningConfig>,
    private logger: ILogger,
  ) {
    super();
    this.config = {
      maxWarmAgents: 50,
      maxColdAgents: 100,
      spawningTimeout: 30000,
      recycleThreshold: 0.8,
      performanceThresholds: {
        minSuccessRate: 0.85,
        maxAverageTime: 300000, // 5 minutes
        minQualityScore: 0.8,
      },
      complexityWeights: {
        simple: 1.0,
        moderate: 1.5,
        complex: 2.0,
        enterprise: 3.0,
      },
      ...config,
    };

    this.initializeAgentPools();
    this.startPoolMaintenance();
  }

  /**
   * Analyze feature complexity and generate team composition plan
   */
  async analyzeFeatureAndPlanTeam(featureSpec: {
    name: string;
    description: string;
    requirements: {
      frontend?: string[];
      backend?: string[];
      database?: string[];
      testing?: string[];
      deployment?: string[];
    };
    constraints: {
      timeline?: number; // days
      budget?: number;
      quality?: 'standard' | 'high' | 'enterprise';
    };
    integrations?: string[];
    securityLevel?: 'basic' | 'standard' | 'high' | 'enterprise';
  }): Promise<{
    complexity: FeatureComplexityAnalysis;
    teamPlan: TeamCompositionPlan;
  }> {
    try {
      this.logger.info('Analyzing feature complexity', {
        feature: featureSpec.name,
        requirements: Object.keys(featureSpec.requirements),
      });

      // Analyze complexity
      const complexity = this.analyzeComplexity(featureSpec);

      // Generate optimal team composition
      const teamPlan = this.generateTeamComposition(complexity, featureSpec);

      this.logger.info('Feature analysis completed', {
        feature: featureSpec.name,
        complexityScore: complexity.score,
        recommendedAgents: teamPlan.totalAgents,
        estimatedDuration: complexity.estimatedDuration,
      });

      return { complexity, teamPlan };
    } catch (error) {
      this.logger.error('Feature analysis failed', { error, feature: featureSpec.name });
      throw error;
    }
  }

  /**
   * Spawn complete swarm team based on composition plan
   */
  async spawnSwarmTeam(
    swarmId: string,
    teamPlan: TeamCompositionPlan,
    featureSpec: any,
  ): Promise<SwarmTeamComposition> {
    return new Promise((resolve, reject) => {
      // Add to spawning queue
      this.spawningQueue.push({ swarmId, plan: teamPlan, resolve, reject });

      // Start processing queue
      this.processSpawningQueue();

      // Set timeout
      setTimeout(() => {
        reject(new Error(`Swarm team spawning timed out for ${swarmId}`));
      }, this.config.spawningTimeout);
    });
  }

  /**
   * Scale existing swarm team (add/remove agents)
   */
  async scaleSwarmTeam(
    swarmId: string,
    scalingAction: {
      action: 'scale-up' | 'scale-down' | 'rebalance';
      targetSize?: number;
      addAgentTypes?: FullStackAgentType[];
      removeAgentIds?: string[];
      reason: string;
    },
  ): Promise<SwarmTeamComposition> {
    const existingTeam = this.activeSwarms.get(swarmId);
    if (!existingTeam) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    try {
      this.logger.info('Scaling swarm team', {
        swarmId,
        action: scalingAction.action,
        currentSize: existingTeam.agents.length,
        targetSize: scalingAction.targetSize,
      });

      let updatedTeam = { ...existingTeam };

      switch (scalingAction.action) {
        case 'scale-up':
          updatedTeam = await this.scaleUp(updatedTeam, scalingAction);
          break;
        case 'scale-down':
          updatedTeam = await this.scaleDown(updatedTeam, scalingAction);
          break;
        case 'rebalance':
          updatedTeam = await this.rebalanceTeam(updatedTeam, scalingAction);
          break;
      }

      // Update active swarms
      this.activeSwarms.set(swarmId, updatedTeam);

      this.emit('swarm-scaled', {
        swarmId,
        action: scalingAction.action,
        oldSize: existingTeam.agents.length,
        newSize: updatedTeam.agents.length,
        reason: scalingAction.reason,
      });

      return updatedTeam;
    } catch (error) {
      this.logger.error('Swarm scaling failed', { error, swarmId, action: scalingAction.action });
      throw error;
    }
  }

  /**
   * Recycle underperforming agents
   */
  async recycleAgent(agentId: string, reason: string): Promise<void> {
    try {
      // Find agent in active swarms
      let foundAgent: FullStackAgent | null = null;
      let swarmId: string | null = null;

      for (const [sid, team] of Array.from(this.activeSwarms.entries())) {
        const agent = team.agents.find((a) => a.id === agentId);
        if (agent) {
          foundAgent = agent;
          swarmId = sid;
          break;
        }
      }

      if (!foundAgent || !swarmId) {
        throw new Error(`Agent ${agentId} not found in active swarms`);
      }

      this.logger.info('Recycling agent', {
        agentId,
        agentType: foundAgent.type,
        reason,
        performance: foundAgent.performance,
      });

      // Remove from active swarm
      const team = this.activeSwarms.get(swarmId)!;
      team.agents = team.agents.filter((a) => a.id !== agentId);

      // Return to warm pool (if performance is acceptable) or cold pool
      if (this.isAgentPerformanceAcceptable(foundAgent)) {
        const warmAgents = this.warmPool.get(foundAgent.type) || [];
        warmAgents.push(foundAgent);
        this.warmPool.set(foundAgent.type, warmAgents);
      } else {
        // Add to cold pool for recreation
        const coldCount = this.coldPool.get(foundAgent.type) || 0;
        this.coldPool.set(foundAgent.type, coldCount + 1);
      }

      this.emit('agent-recycled', {
        agentId,
        agentType: foundAgent.type,
        swarmId,
        reason,
        returnedToWarmPool: this.isAgentPerformanceAcceptable(foundAgent),
      });
    } catch (error) {
      this.logger.error('Agent recycling failed', { error, agentId, reason });
      throw error;
    }
  }

  /**
   * Get spawner status and statistics
   */
  getSpawnerStatus(): {
    pools: {
      warm: Record<string, number>;
      cold: Record<string, number>;
    };
    activeSwarms: number;
    totalActiveAgents: number;
    queuedRequests: number;
    performance: {
      averageSpawningTime: number;
      successRate: number;
      poolUtilization: number;
    };
  } {
    const warmCounts: Record<string, number> = {};
    const coldCounts: Record<string, number> = {};

    this.warmPool.forEach((agents, type) => {
      warmCounts[type] = agents.length;
    });

    this.coldPool.forEach((count, type) => {
      coldCounts[type] = count;
    });

    const totalActiveAgents = Array.from(this.activeSwarms.values()).reduce(
      (sum, team) => sum + team.agents.length,
      0,
    );

    return {
      pools: {
        warm: warmCounts,
        cold: coldCounts,
      },
      activeSwarms: this.activeSwarms.size,
      totalActiveAgents,
      queuedRequests: this.spawningQueue.length,
      performance: {
        averageSpawningTime: this.calculateAverageSpawningTime(),
        successRate: this.calculateSuccessRate(),
        poolUtilization: this.calculatePoolUtilization(),
      },
    };
  }

  /**
   * Analyze feature complexity
   */
  private analyzeComplexity(featureSpec: any): FeatureComplexityAnalysis {
    const factors = {
      uiComplexity: this.analyzeUIComplexity(featureSpec.requirements.frontend || []),
      backendComplexity: this.analyzeBackendComplexity(featureSpec.requirements.backend || []),
      dataComplexity: this.analyzeDataComplexity(featureSpec.requirements.database || []),
      integrationComplexity: this.analyzeIntegrationComplexity(featureSpec.integrations || []),
      securityRequirements: this.analyzeSecurityRequirements(featureSpec.securityLevel || 'basic'),
      performanceRequirements: this.analyzePerformanceRequirements(
        featureSpec.constraints.quality || 'standard',
      ),
    };

    const score =
      Object.values(factors).reduce((sum, value) => sum + value, 0) / Object.keys(factors).length;

    const requiredSkills = this.extractRequiredSkills(featureSpec, factors);
    const estimatedDuration = this.estimateDuration(score, featureSpec.constraints.timeline);
    const riskLevel = this.assessRiskLevel(score, factors);

    return {
      score,
      factors,
      requiredSkills,
      estimatedDuration,
      riskLevel,
    };
  }

  /**
   * Generate optimal team composition based on complexity analysis
   */
  private generateTeamComposition(
    complexity: FeatureComplexityAnalysis,
    featureSpec: any,
  ): TeamCompositionPlan {
    const baseAgentCount = Math.ceil(complexity.score * 2); // Base calculation
    const adjustedAgentCount = Math.max(2, Math.min(20, baseAgentCount)); // Enforce limits

    const agentTypes: TeamCompositionPlan['agentTypes'] = [];
    let totalAgents = 0;

    // Always include coordinator for teams > 5
    if (adjustedAgentCount > 5) {
      agentTypes.push({
        type: 'project-coordinator',
        count: 1,
        priority: 10,
        justification: 'Large team requires coordination',
      });
      totalAgents += 1;
    }

    // Frontend agents
    if (featureSpec.requirements.frontend && featureSpec.requirements.frontend.length > 0) {
      const frontendCount = Math.ceil(complexity.factors.uiComplexity / 2);
      agentTypes.push({
        type: 'frontend-developer',
        count: frontendCount,
        priority: 8,
        justification: 'Frontend requirements detected',
      });
      totalAgents += frontendCount;

      if (complexity.factors.uiComplexity > 3) {
        agentTypes.push({
          type: 'ui-designer',
          count: 1,
          priority: 6,
          justification: 'High UI complexity requires design specialist',
        });
        totalAgents += 1;
      }
    }

    // Backend agents
    if (featureSpec.requirements.backend && featureSpec.requirements.backend.length > 0) {
      const backendCount = Math.ceil(complexity.factors.backendComplexity / 2);
      agentTypes.push({
        type: 'backend-developer',
        count: backendCount,
        priority: 8,
        justification: 'Backend requirements detected',
      });
      totalAgents += backendCount;
    }

    // Database agents
    if (featureSpec.requirements.database && featureSpec.requirements.database.length > 0) {
      agentTypes.push({
        type: 'database-developer',
        count: 1,
        priority: 7,
        justification: 'Database requirements detected',
      });
      totalAgents += 1;
    }

    // QA agents (always include)
    const qaCount = Math.max(1, Math.ceil(totalAgents / 4));
    agentTypes.push({
      type: 'qa-engineer',
      count: qaCount,
      priority: 7,
      justification: 'Quality assurance required',
    });
    totalAgents += qaCount;

    // DevOps agents (for deployment requirements)
    if (featureSpec.requirements.deployment || adjustedAgentCount > 8) {
      agentTypes.push({
        type: 'devops-engineer',
        count: 1,
        priority: 6,
        justification: 'Deployment automation required',
      });
      totalAgents += 1;
    }

    // Security agents (for high security requirements)
    if (complexity.factors.securityRequirements > 3) {
      agentTypes.push({
        type: 'security-tester',
        count: 1,
        priority: 8,
        justification: 'High security requirements',
      });
      totalAgents += 1;
    }

    // Generate phases
    const phases = this.generateDevelopmentPhases(agentTypes, complexity);

    // Estimate resources
    const resourceEstimate = {
      cpu: totalAgents * 0.5, // 0.5 CPU per agent
      memory: totalAgents * 512, // 512MB per agent
      duration: complexity.estimatedDuration,
    };

    return {
      totalAgents,
      agentTypes,
      phases,
      resourceEstimate,
    };
  }

  /**
   * Process agent spawning queue
   */
  private async processSpawningQueue(): Promise<void> {
    if (this.isProcessingQueue || this.spawningQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.spawningQueue.length > 0) {
        const request = this.spawningQueue.shift()!;

        try {
          const team = await this.spawnTeamFromPlan(request.swarmId, request.plan);
          request.resolve(team);
        } catch (error) {
          request.reject(error);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Spawn team from composition plan
   */
  private async spawnTeamFromPlan(
    swarmId: string,
    plan: TeamCompositionPlan,
  ): Promise<SwarmTeamComposition> {
    const agents: FullStackAgent[] = [];

    for (const agentSpec of plan.agentTypes) {
      for (let i = 0; i < agentSpec.count; i++) {
        const agent = await this.getOrCreateAgent(agentSpec.type);
        agents.push(agent);
      }
    }

    const team: SwarmTeamComposition = {
      swarmId,
      feature: 'dynamic-feature',
      complexity: this.scoreToComplexity(plan.resourceEstimate.duration),
      agents,
      estimatedDuration: plan.resourceEstimate.duration,
      requiredSkills: plan.agentTypes.flatMap((at) => this.getSkillsForAgentType(at.type)),
      resourceLimits: {
        maxAgents: plan.totalAgents,
        maxCpuPerAgent: 1.0,
        maxMemoryPerAgent: 1024,
        timeoutMinutes: plan.resourceEstimate.duration,
      },
    };

    this.activeSwarms.set(swarmId, team);

    this.emit('swarm-spawned', {
      swarmId,
      agentCount: agents.length,
      agentTypes: plan.agentTypes.map((at) => at.type),
      estimatedDuration: plan.resourceEstimate.duration,
    });

    return team;
  }

  /**
   * Get or create agent from pools
   */
  private async getOrCreateAgent(agentType: FullStackAgentType): Promise<FullStackAgent> {
    // Try warm pool first
    const warmAgents = this.warmPool.get(agentType) || [];
    if (warmAgents.length > 0) {
      const agent = warmAgents.pop()!;
      this.warmPool.set(agentType, warmAgents);
      return this.prepareAgentForWork(agent);
    }

    // Create new agent
    return this.createNewAgent(agentType);
  }

  /**
   * Create new agent instance
   */
  private createNewAgent(agentType: FullStackAgentType): FullStackAgent {
    const agent: FullStackAgent = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: agentType,
      capabilities: this.getSkillsForAgentType(agentType),
      status: 'idle',
      performance: {
        tasksCompleted: 0,
        successRate: 1.0,
        averageTime: 0,
        qualityScore: 1.0,
      },
      resources: {
        cpuUsage: 0.1,
        memoryUsage: 128,
        activeTasks: 0,
      },
    };

    this.logger.debug('Created new agent', {
      agentId: agent.id,
      agentType: agent.type,
      capabilities: agent.capabilities,
    });

    return agent;
  }

  /**
   * Initialize agent pools with warm agents
   */
  private initializeAgentPools(): void {
    const commonTypes: FullStackAgentType[] = [
      'frontend-developer',
      'backend-developer',
      'qa-engineer',
      'devops-engineer',
      'project-coordinator',
    ];

    commonTypes.forEach((type) => {
      this.warmPool.set(type, []);
      this.coldPool.set(type, 3); // 3 cold agents per common type

      // Pre-warm with 2 agents per type
      for (let i = 0; i < 2; i++) {
        const agent = this.createNewAgent(type);
        const agents = this.warmPool.get(type) || [];
        agents.push(agent);
        this.warmPool.set(type, agents);
      }
    });

    this.logger.info('Agent pools initialized', {
      warmTypes: commonTypes.length,
      warmAgentsPerType: 2,
      coldAgentsPerType: 3,
    });
  }

  /**
   * Start pool maintenance background process
   */
  private startPoolMaintenance(): void {
    setInterval(() => {
      this.maintainPools();
    }, 30000); // Every 30 seconds
  }

  /**
   * Maintain agent pools (cleanup, rebalancing)
   */
  private maintainPools(): void {
    // Remove idle agents from warm pool if over capacity
    this.warmPool.forEach((agents, type) => {
      if (agents.length > this.config.maxWarmAgents / 10) {
        // 10 agent types max
        const excess = agents.length - Math.floor(this.config.maxWarmAgents / 10);
        agents.splice(0, excess);
      }
    });

    // Clean up underperforming agents
    this.activeSwarms.forEach((team, swarmId) => {
      team.agents.forEach((agent) => {
        if (!this.isAgentPerformanceAcceptable(agent)) {
          this.recycleAgent(agent.id, 'poor performance detected');
        }
      });
    });
  }

  // Utility methods
  private analyzeUIComplexity(requirements: string[]): number {
    return Math.min(5, requirements.length * 0.5 + (requirements.includes('complex-ui') ? 2 : 0));
  }

  private analyzeBackendComplexity(requirements: string[]): number {
    return Math.min(
      5,
      requirements.length * 0.4 + (requirements.includes('microservices') ? 2 : 0),
    );
  }

  private analyzeDataComplexity(requirements: string[]): number {
    return Math.min(
      5,
      requirements.length * 0.6 + (requirements.includes('complex-queries') ? 1.5 : 0),
    );
  }

  private analyzeIntegrationComplexity(integrations: string[]): number {
    return Math.min(5, integrations.length * 0.8);
  }

  private analyzeSecurityRequirements(level: string): number {
    const levels: Record<string, number> = {
      basic: 1,
      standard: 2,
      high: 4,
      enterprise: 5,
    };
    return levels[level] || 1;
  }

  private analyzePerformanceRequirements(quality: string): number {
    const qualities: Record<string, number> = {
      standard: 2,
      high: 3,
      enterprise: 5,
    };
    return qualities[quality] || 2;
  }

  private extractRequiredSkills(featureSpec: any, factors: any): string[] {
    const skills = new Set<string>();

    if (featureSpec.requirements.frontend) skills.add('frontend');
    if (featureSpec.requirements.backend) skills.add('backend');
    if (featureSpec.requirements.database) skills.add('database');
    if (factors.securityRequirements > 3) skills.add('security');
    if (factors.performanceRequirements > 3) skills.add('performance');

    return Array.from(skills);
  }

  private estimateDuration(score: number, timeline?: number): number {
    const baseEstimate = Math.ceil(score * 7); // 7 days per complexity point
    return timeline ? Math.min(baseEstimate, timeline) : baseEstimate;
  }

  private assessRiskLevel(score: number, factors: any): 'low' | 'medium' | 'high' {
    if (score > 4) return 'high';
    if (score > 2.5) return 'medium';
    return 'low';
  }

  private generateDevelopmentPhases(
    agentTypes: any[],
    complexity: FeatureComplexityAnalysis,
  ): any[] {
    return [
      {
        name: 'Planning & Architecture',
        agents: ['project-coordinator'],
        duration: Math.ceil(complexity.estimatedDuration * 0.1),
        dependencies: [],
      },
      {
        name: 'Development',
        agents: agentTypes.filter((at) => at.type.includes('developer')).map((at) => at.type),
        duration: Math.ceil(complexity.estimatedDuration * 0.6),
        dependencies: ['Planning & Architecture'],
      },
      {
        name: 'Testing & QA',
        agents: ['qa-engineer', 'security-tester'],
        duration: Math.ceil(complexity.estimatedDuration * 0.2),
        dependencies: ['Development'],
      },
      {
        name: 'Deployment',
        agents: ['devops-engineer'],
        duration: Math.ceil(complexity.estimatedDuration * 0.1),
        dependencies: ['Testing & QA'],
      },
    ];
  }

  private scoreToComplexity(duration: number): ComplexityLevel {
    if (duration > 30) return 'enterprise';
    if (duration > 14) return 'complex';
    if (duration > 7) return 'moderate';
    return 'simple';
  }

  private getSkillsForAgentType(agentType: FullStackAgentType): string[] {
    const skillMap: Record<string, string[]> = {
      'frontend-developer': ['react', 'typescript', 'css', 'testing'],
      'backend-developer': ['nodejs', 'api', 'database', 'security'],
      'qa-engineer': ['testing', 'automation', 'quality-assurance'],
      'devops-engineer': ['deployment', 'ci-cd', 'monitoring'],
      'project-coordinator': ['coordination', 'planning', 'communication'],
      'ui-designer': ['design', 'ux', 'accessibility'],
      'database-developer': ['sql', 'optimization', 'migration'],
      'security-tester': ['security', 'penetration-testing'],
      'performance-tester': ['performance', 'load-testing'],
    };

    return skillMap[agentType] || ['general'];
  }

  private prepareAgentForWork(agent: FullStackAgent): FullStackAgent {
    agent.status = 'active';
    agent.resources.cpuUsage = 0.1;
    agent.resources.activeTasks = 0;
    return agent;
  }

  private isAgentPerformanceAcceptable(agent: FullStackAgent): boolean {
    return (
      agent.performance.successRate >= this.config.performanceThresholds.minSuccessRate &&
      agent.performance.averageTime <= this.config.performanceThresholds.maxAverageTime &&
      agent.performance.qualityScore >= this.config.performanceThresholds.minQualityScore
    );
  }

  private async scaleUp(team: SwarmTeamComposition, action: any): Promise<SwarmTeamComposition> {
    const newAgents: FullStackAgent[] = [];

    if (action.addAgentTypes) {
      for (const agentType of action.addAgentTypes) {
        const agent = await this.getOrCreateAgent(agentType);
        newAgents.push(agent);
      }
    }

    return {
      ...team,
      agents: [...team.agents, ...newAgents],
    };
  }

  private async scaleDown(team: SwarmTeamComposition, action: any): Promise<SwarmTeamComposition> {
    if (action.removeAgentIds) {
      const remainingAgents = team.agents.filter((a) => !action.removeAgentIds.includes(a.id));
      return {
        ...team,
        agents: remainingAgents,
      };
    }

    return team;
  }

  private async rebalanceTeam(
    team: SwarmTeamComposition,
    action: any,
  ): Promise<SwarmTeamComposition> {
    // Rebalancing logic would go here
    return team;
  }

  private calculateAverageSpawningTime(): number {
    // Would calculate from performance history
    return 5000; // 5 seconds average
  }

  private calculateSuccessRate(): number {
    // Would calculate from performance history
    return 0.95; // 95% success rate
  }

  private calculatePoolUtilization(): number {
    const totalWarmAgents = Array.from(this.warmPool.values()).reduce(
      (sum, agents) => sum + agents.length,
      0,
    );
    const maxWarmAgents = this.config.maxWarmAgents;
    return totalWarmAgents / maxWarmAgents;
  }
}
