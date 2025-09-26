import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';

export interface FeatureLifecycleState {
  id: string;
  name: string;
  phase: 'planning' | 'development' | 'testing' | 'review' | 'staging' | 'production' | 'rollback';
  agents: string[];
  dependencies: string[];
  progressMetrics: {
    testsCount: number;
    testsPassing: number;
    coverage: number;
    qualityScore: number;
    performanceScore: number;
  };
  startTime: Date;
  lastUpdate: Date;
  rollbackPoints: RollbackPoint[];
  coordination: {
    frontend: AgentStatus;
    backend: AgentStatus;
    testing: AgentStatus;
    review: AgentStatus;
  };
}

export interface RollbackPoint {
  id: string;
  timestamp: Date;
  phase: string;
  commitHash: string;
  dbSnapshot?: string;
  configSnapshot: any;
  healthMetrics: any;
}

export interface AgentStatus {
  agentId: string;
  status: 'idle' | 'working' | 'blocked' | 'completed' | 'failed';
  currentTask: string;
  progress: number;
  lastUpdate: Date;
  dependencies: string[];
}

export interface QualityGate {
  name: string;
  type: 'unit-tests' | 'integration-tests' | 'e2e-tests' | 'code-review' | 'security-scan' | 'performance-test';
  threshold: number;
  currentValue: number;
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  blocksProgression: boolean;
  automatedCheck: boolean;
}

export class FeatureLifecycleManager extends EventEmitter {
  private features: Map<string, FeatureLifecycleState> = new Map();
  private workflowConfig: any;
  private metricsHistory: Map<string, any[]> = new Map();

  constructor(private configPath: string) {
    super();
    this.loadConfiguration();
  }

  private async loadConfiguration(): Promise<void> {
    try {
      const config = await fs.readFile(this.configPath, 'utf-8');
      this.workflowConfig = JSON.parse(config);
    } catch (error) {
      this.workflowConfig = this.getDefaultConfig();
    }
  }

  private getDefaultConfig() {
    return {
      phases: {
        planning: {
          duration: '2-4h',
          requiredAgents: ['researcher', 'architect'],
          qualityGates: [],
          autoProgress: false
        },
        development: {
          duration: '1-3d',
          requiredAgents: ['coder', 'backend-dev'],
          qualityGates: ['unit-tests', 'code-review'],
          autoProgress: true,
          parallelTesting: true
        },
        testing: {
          duration: '4-8h',
          requiredAgents: ['tester', 'continuous-testing-agent'],
          qualityGates: ['integration-tests', 'e2e-tests', 'performance-test'],
          autoProgress: true
        },
        review: {
          duration: '2-4h',
          requiredAgents: ['reviewer', 'quality-gate-agent'],
          qualityGates: ['code-review', 'security-scan'],
          autoProgress: false
        },
        staging: {
          duration: '1-2h',
          requiredAgents: ['deployment-agent'],
          qualityGates: ['smoke-tests', 'integration-validation'],
          autoProgress: true
        },
        production: {
          duration: 'continuous',
          requiredAgents: ['monitor', 'alerting'],
          qualityGates: ['health-check', 'performance-monitoring'],
          autoProgress: false
        }
      },
      rolloutStrategy: {
        type: 'progressive',
        stages: [
          { name: 'canary', percentage: 5, duration: '30m' },
          { name: 'blue-green', percentage: 50, duration: '2h' },
          { name: 'full', percentage: 100, duration: 'unlimited' }
        ]
      },
      qualityThresholds: {
        testCoverage: 85,
        performanceScore: 80,
        securityScore: 95,
        codeQuality: 8.0
      }
    };
  }

  public async createFeature(
    name: string,
    dependencies: string[] = [],
    agents: string[] = []
  ): Promise<FeatureLifecycleState> {
    const featureId = `feature_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const feature: FeatureLifecycleState = {
      id: featureId,
      name,
      phase: 'planning',
      agents: agents.length > 0 ? agents : this.workflowConfig.phases.planning.requiredAgents,
      dependencies,
      progressMetrics: {
        testsCount: 0,
        testsPassing: 0,
        coverage: 0,
        qualityScore: 0,
        performanceScore: 0
      },
      startTime: new Date(),
      lastUpdate: new Date(),
      rollbackPoints: [],
      coordination: {
        frontend: { agentId: '', status: 'idle', currentTask: '', progress: 0, lastUpdate: new Date(), dependencies: [] },
        backend: { agentId: '', status: 'idle', currentTask: '', progress: 0, lastUpdate: new Date(), dependencies: [] },
        testing: { agentId: '', status: 'idle', currentTask: '', progress: 0, lastUpdate: new Date(), dependencies: [] },
        review: { agentId: '', status: 'idle', currentTask: '', progress: 0, lastUpdate: new Date(), dependencies: [] }
      }
    };

    this.features.set(featureId, feature);
    this.emit('feature:created', feature);

    // Create initial rollback point
    await this.createRollbackPoint(featureId, 'Initial state');

    return feature;
  }

  public async progressFeature(
    featureId: string,
    qualityGateResults?: QualityGate[]
  ): Promise<boolean> {
    const feature = this.features.get(featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const currentPhaseConfig = this.workflowConfig.phases[feature.phase];

    // Check quality gates
    if (qualityGateResults) {
      const failedGates = qualityGateResults.filter(gate =>
        gate.blocksProgression && gate.status === 'failed'
      );

      if (failedGates.length > 0) {
        this.emit('feature:quality-gate-failed', { feature, failedGates });
        return false;
      }
    }

    // Progress to next phase
    const phases: FeatureLifecycleState['phase'][] = [
      'planning', 'development', 'testing', 'review', 'staging', 'production'
    ];

    const currentIndex = phases.indexOf(feature.phase);
    if (currentIndex < phases.length - 1) {
      const previousPhase = feature.phase;
      feature.phase = phases[currentIndex + 1];
      feature.lastUpdate = new Date();

      // Update agents for new phase
      feature.agents = this.workflowConfig.phases[feature.phase].requiredAgents;

      // Create rollback point
      await this.createRollbackPoint(featureId, `Progressed from ${previousPhase} to ${feature.phase}`);

      this.emit('feature:phase-changed', { feature, previousPhase, newPhase: feature.phase });

      // Auto-spawn agents if configured
      if (currentPhaseConfig.autoProgress) {
        await this.coordinateAgents(featureId);
      }

      return true;
    }

    return false;
  }

  public async updateAgentStatus(
    featureId: string,
    agentType: keyof FeatureLifecycleState['coordination'],
    status: Partial<AgentStatus>
  ): Promise<void> {
    const feature = this.features.get(featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const currentStatus = feature.coordination[agentType];
    feature.coordination[agentType] = {
      ...currentStatus,
      ...status,
      lastUpdate: new Date()
    };

    feature.lastUpdate = new Date();

    this.emit('feature:agent-status-updated', { feature, agentType, status });

    // Check if all agents are completed for current phase
    await this.checkPhaseCompletion(featureId);
  }

  private async checkPhaseCompletion(featureId: string): Promise<void> {
    const feature = this.features.get(featureId);
    if (!feature) return;

    const relevantAgents = this.getRelevantAgentsForPhase(feature.phase);
    const allCompleted = relevantAgents.every(agentType =>
      feature.coordination[agentType].status === 'completed'
    );

    if (allCompleted) {
      this.emit('feature:phase-completed', { feature });

      // Auto-progress if configured
      const phaseConfig = this.workflowConfig.phases[feature.phase];
      if (phaseConfig.autoProgress) {
        await this.progressFeature(featureId);
      }
    }
  }

  private getRelevantAgentsForPhase(
    phase: FeatureLifecycleState['phase']
  ): Array<keyof FeatureLifecycleState['coordination']> {
    switch (phase) {
      case 'planning':
        return ['backend'];
      case 'development':
        return ['frontend', 'backend'];
      case 'testing':
        return ['testing'];
      case 'review':
        return ['review'];
      case 'staging':
      case 'production':
        return ['frontend', 'backend', 'testing'];
      default:
        return ['frontend', 'backend', 'testing', 'review'];
    }
  }

  public async createRollbackPoint(
    featureId: string,
    description: string
  ): Promise<RollbackPoint> {
    const feature = this.features.get(featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const rollbackPoint: RollbackPoint = {
      id: `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date(),
      phase: feature.phase,
      commitHash: await this.getCurrentCommitHash(),
      configSnapshot: { ...this.workflowConfig },
      healthMetrics: { ...feature.progressMetrics }
    };

    feature.rollbackPoints.push(rollbackPoint);

    // Keep only last 10 rollback points
    if (feature.rollbackPoints.length > 10) {
      feature.rollbackPoints = feature.rollbackPoints.slice(-10);
    }

    this.emit('feature:rollback-point-created', { feature, rollbackPoint });

    return rollbackPoint;
  }

  private async getCurrentCommitHash(): Promise<string> {
    // This would integrate with git in a real implementation
    return `commit_${Date.now()}`;
  }

  private async coordinateAgents(featureId: string): Promise<void> {
    const feature = this.features.get(featureId);
    if (!feature) return;

    const relevantAgents = this.getRelevantAgentsForPhase(feature.phase);

    for (const agentType of relevantAgents) {
      await this.updateAgentStatus(featureId, agentType, {
        status: 'working',
        currentTask: `Phase: ${feature.phase}`,
        progress: 0
      });
    }

    this.emit('feature:agents-coordinated', { feature, agentTypes: relevantAgents });
  }

  public getFeature(featureId: string): FeatureLifecycleState | undefined {
    return this.features.get(featureId);
  }

  public getAllFeatures(): FeatureLifecycleState[] {
    return Array.from(this.features.values());
  }

  public getFeaturesByPhase(phase: FeatureLifecycleState['phase']): FeatureLifecycleState[] {
    return this.getAllFeatures().filter(feature => feature.phase === phase);
  }

  public async updateProgressMetrics(
    featureId: string,
    metrics: Partial<FeatureLifecycleState['progressMetrics']>
  ): Promise<void> {
    const feature = this.features.get(featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    feature.progressMetrics = { ...feature.progressMetrics, ...metrics };
    feature.lastUpdate = new Date();

    // Store metrics history
    const history = this.metricsHistory.get(featureId) || [];
    history.push({
      timestamp: new Date(),
      metrics: { ...feature.progressMetrics }
    });
    this.metricsHistory.set(featureId, history);

    this.emit('feature:metrics-updated', { feature, metrics });
  }

  public getMetricsHistory(featureId: string): any[] {
    return this.metricsHistory.get(featureId) || [];
  }
}