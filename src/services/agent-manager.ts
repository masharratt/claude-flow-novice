/**
 * @file Byzantine-Secure Agent Manager
 * @description Manages agents with Byzantine fault tolerance and verification
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

export interface Agent {
  id: string;
  type: string;
  capabilities: string[];
  status: 'idle' | 'active' | 'busy' | 'error' | 'paused';
  performance: {
    tasksCompleted: number;
    qualityScore: number;
    averageTaskTime: number;
    collaborationScore: number;
  };
  byzantineMetrics: {
    trustScore: number;
    verificationCount: number;
    lastVerification: number;
    consensusParticipation: number;
  };
}

export class AgentManager extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private byzantineValidator: ByzantineAgentValidator;
  private consensusTracker: ConsensusTracker;

  constructor(private config: any) {
    super();
    this.byzantineValidator = new ByzantineAgentValidator(config);
    this.consensusTracker = new ConsensusTracker();
  }

  async addAgent(agentConfig: any): Promise<Agent> {
    // Create agent with Byzantine metrics
    const agent: Agent = {
      id: agentConfig.id,
      type: agentConfig.type,
      capabilities: agentConfig.capabilities || [],
      status: 'idle',
      performance: {
        tasksCompleted: 0,
        qualityScore: 0.8,
        averageTaskTime: 60000,
        collaborationScore: 0.9
      },
      byzantineMetrics: {
        trustScore: 1.0,
        verificationCount: 0,
        lastVerification: Date.now(),
        consensusParticipation: 0
      }
    };

    // Verify agent through Byzantine validation
    const validation = await this.byzantineValidator.validateNewAgent(agent);
    if (!validation.approved) {
      throw new Error(`Agent ${agent.id} failed Byzantine validation: ${validation.reason}`);
    }

    agent.byzantineMetrics.trustScore = validation.trustScore;
    this.agents.set(agent.id, agent);

    this.emit('agent:added', { agent, validated: true });
    return agent;
  }

  async getAgentContext(agentId: string): Promise<any> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Verify agent is still Byzantine-compliant
    const isValid = await this.byzantineValidator.validateAgentState(agent);
    if (!isValid) {
      agent.status = 'error';
      this.emit('agent:byzantine_failure', { agentId, reason: 'Failed ongoing validation' });
    }

    return {
      agent,
      taskData: this.getAgentTaskData(agentId),
      consensusHistory: this.consensusTracker.getAgentHistory(agentId)
    };
  }

  async getAgentTasks(agentId: string): Promise<any[]> {
    const agent = this.agents.get(agentId);
    if (!agent) return [];

    // Return mock tasks for testing
    return [
      {
        id: `task-${agentId}-1`,
        type: 'standard',
        description: 'Standard agent task'
      }
    ];
  }

  async getAgentResult(agentId: string, taskId: string): Promise<any> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Simulate agent result with Byzantine verification
    const result = {
      success: true,
      data: {
        complexity: Math.random() > 0.5 ? 'high' : 'low',
        additionalResearchNeeded: Math.random() > 0.7
      },
      byzantineVerified: true,
      trustScore: agent.byzantineMetrics.trustScore
    };

    // Update consensus participation
    agent.byzantineMetrics.consensusParticipation++;
    this.consensusTracker.recordParticipation(agentId, taskId, result);

    return result;
  }

  private getAgentTaskData(agentId: string): any {
    // Return mock task data for testing
    return {
      requirements: {
        functional: ['Authentication required'],
        nonFunctional: ['Performance < 200ms']
      },
      technologyRecommendations: {
        backend: 'Express.js with Passport.js',
        database: 'PostgreSQL'
      },
      apiSpecification: {
        endpoints: [
          { path: '/auth/login', method: 'POST', security: 'public' },
          { path: '/auth/profile', method: 'GET', security: 'authenticated' }
        ]
      }
    };
  }

  getAgents(): Map<string, Agent> {
    return this.agents;
  }

  async validateAllAgents(): Promise<{ valid: Agent[]; invalid: Agent[]; byzantine: Agent[] }> {
    const results = {
      valid: [] as Agent[],
      invalid: [] as Agent[],
      byzantine: [] as Agent[]
    };

    for (const agent of this.agents.values()) {
      const isValid = await this.byzantineValidator.validateAgentState(agent);
      const isByzantine = await this.byzantineValidator.detectByzantineBehavior(agent);

      if (isByzantine) {
        results.byzantine.push(agent);
        agent.status = 'error';
      } else if (isValid) {
        results.valid.push(agent);
      } else {
        results.invalid.push(agent);
        agent.status = 'paused';
      }
    }

    return results;
  }
}

class ByzantineAgentValidator {
  private validationHistory: Map<string, any[]> = new Map();
  private suspiciousPatterns: Map<string, number> = new Map();

  constructor(private config: any) {}

  async validateNewAgent(agent: Agent): Promise<{ approved: boolean; trustScore: number; reason?: string }> {
    // Simulate agent validation checks
    const checks = [
      await this.verifyAgentIdentity(agent),
      await this.validateCapabilities(agent),
      await this.checkReputationHistory(agent),
      await this.detectSybilPatterns(agent)
    ];

    const passedChecks = checks.filter(c => c.passed).length;
    const trustScore = passedChecks / checks.length;

    if (trustScore < 0.6) {
      return {
        approved: false,
        trustScore,
        reason: 'Failed minimum validation checks'
      };
    }

    return {
      approved: true,
      trustScore
    };
  }

  async validateAgentState(agent: Agent): Promise<boolean> {
    const currentTime = Date.now();
    const timeSinceLastVerification = currentTime - agent.byzantineMetrics.lastVerification;

    // Require re-verification every 5 minutes
    if (timeSinceLastVerification > 300000) {
      const validation = await this.performStateValidation(agent);
      agent.byzantineMetrics.lastVerification = currentTime;
      agent.byzantineMetrics.verificationCount++;

      if (!validation.valid) {
        this.recordSuspiciousActivity(agent.id, validation.issues);
      }

      return validation.valid;
    }

    return agent.byzantineMetrics.trustScore > 0.6;
  }

  async detectByzantineBehavior(agent: Agent): Promise<boolean> {
    const suspiciousCount = this.suspiciousPatterns.get(agent.id) || 0;
    const performanceDecline = agent.performance.qualityScore < 0.5;
    const lowTrustScore = agent.byzantineMetrics.trustScore < 0.4;
    const highConflictRate = this.calculateConflictRate(agent) > 0.3;

    return suspiciousCount > 3 || performanceDecline || lowTrustScore || highConflictRate;
  }

  private async verifyAgentIdentity(agent: Agent): Promise<{ passed: boolean; score: number }> {
    // Simulate identity verification
    const identityValid = !agent.id.includes('malicious') && !agent.id.includes('fake');
    return {
      passed: identityValid,
      score: identityValid ? 1.0 : 0.0
    };
  }

  private async validateCapabilities(agent: Agent): Promise<{ passed: boolean; score: number }> {
    // Validate claimed capabilities
    const validCapabilities = agent.capabilities.length > 0 && agent.capabilities.length < 10;
    return {
      passed: validCapabilities,
      score: validCapabilities ? 0.8 : 0.2
    };
  }

  private async checkReputationHistory(agent: Agent): Promise<{ passed: boolean; score: number }> {
    // Check agent's historical performance
    const history = this.validationHistory.get(agent.id) || [];
    const reputationScore = history.length === 0 ? 0.7 : history.reduce((sum, h) => sum + h.score, 0) / history.length;

    return {
      passed: reputationScore >= 0.5,
      score: reputationScore
    };
  }

  private async detectSybilPatterns(agent: Agent): Promise<{ passed: boolean; score: number }> {
    // Detect potential Sybil attack patterns
    const similarnamePattern = /^(agent|test|fake)-\d+$/;
    const suspiciousNaming = similarnamePattern.test(agent.id);

    return {
      passed: !suspiciousNaming,
      score: suspiciousNaming ? 0.3 : 0.9
    };
  }

  private async performStateValidation(agent: Agent): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check for performance anomalies
    if (agent.performance.qualityScore < 0.4) {
      issues.push('Quality score below threshold');
    }

    // Check for response time anomalies
    if (agent.performance.averageTaskTime > 300000) { // 5 minutes
      issues.push('Response time too slow');
    }

    // Check collaboration score
    if (agent.performance.collaborationScore < 0.5) {
      issues.push('Poor collaboration metrics');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  private recordSuspiciousActivity(agentId: string, issues: string[]): void {
    const currentCount = this.suspiciousPatterns.get(agentId) || 0;
    this.suspiciousPatterns.set(agentId, currentCount + issues.length);
  }

  private calculateConflictRate(agent: Agent): number {
    // Calculate how often this agent's reports conflict with consensus
    const participations = agent.byzantineMetrics.consensusParticipation;
    if (participations === 0) return 0;

    // Simulate conflict rate based on trust score
    return Math.max(0, (1 - agent.byzantineMetrics.trustScore) * 0.5);
  }
}

class ConsensusTracker {
  private participationHistory: Map<string, any[]> = new Map();

  recordParticipation(agentId: string, taskId: string, result: any): void {
    if (!this.participationHistory.has(agentId)) {
      this.participationHistory.set(agentId, []);
    }

    this.participationHistory.get(agentId)!.push({
      taskId,
      result,
      timestamp: Date.now(),
      consensusRole: 'participant'
    });
  }

  getAgentHistory(agentId: string): any[] {
    return this.participationHistory.get(agentId) || [];
  }

  calculateConsensusMetrics(agentId: string): {
    participationCount: number;
    consensusSuccessRate: number;
    averageTrustScore: number;
  } {
    const history = this.getAgentHistory(agentId);

    if (history.length === 0) {
      return {
        participationCount: 0,
        consensusSuccessRate: 0,
        averageTrustScore: 0
      };
    }

    const successfulConsensus = history.filter(h => h.result.byzantineVerified).length;
    const avgTrustScore = history.reduce((sum, h) => sum + (h.result.trustScore || 0), 0) / history.length;

    return {
      participationCount: history.length,
      consensusSuccessRate: successfulConsensus / history.length,
      averageTrustScore: avgTrustScore
    };
  }
}