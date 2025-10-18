/**
 * @file Agent Mock Implementation
 * @description Mock agent implementations for swarm coordination testing
 */

import { EventEmitter } from 'events';

// Agent interfaces
export interface Agent {
  id: string;
  type: 'researcher' | 'coder' | 'reviewer';
  name: string;
  status: 'idle' | 'active' | 'busy' | 'error' | 'paused';
  capabilities: string[];
  currentTask?: string;
  performance: {
    tasksCompleted: number;
    qualityScore: number;
    averageTaskTime: number;
    collaborationScore: number;
  };
  resources?: {
    memoryUsage: number;
    cpuUsage: number;
    networkActivity: number;
  };
}

export interface MockAgentOptions {
  id?: string;
  name?: string;
  capabilities?: string[];
  initialPerformance?: Partial<Agent['performance']>;
  simulateLatency?: number;
  errorRate?: number;
}

/**
 * Base mock agent class
 */
export class MockAgent extends EventEmitter implements Agent {
  public id: string;
  public type: 'researcher' | 'coder' | 'reviewer';
  public name: string;
  public status: 'idle' | 'active' | 'busy' | 'error' | 'paused';
  public capabilities: string[];
  public currentTask?: string;
  public performance: {
    tasksCompleted: number;
    qualityScore: number;
    averageTaskTime: number;
    collaborationScore: number;
  };
  public resources: {
    memoryUsage: number;
    cpuUsage: number;
    networkActivity: number;
  };

  private simulateLatency: number;
  private errorRate: number;
  private taskHistory: any[] = [];

  constructor(type: Agent['type'], options: MockAgentOptions = {}) {
    super();

    this.id = options.id || `agent-${type}-${Date.now()}`;
    this.type = type;
    this.name = options.name || `${type.charAt(0).toUpperCase() + type.slice(1)} Agent`;
    this.status = 'idle';
    this.capabilities = options.capabilities || this.getDefaultCapabilities(type);
    this.simulateLatency = options.simulateLatency || 100;
    this.errorRate = options.errorRate || 0.02; // 2% error rate

    this.performance = {
      tasksCompleted: 0,
      qualityScore: this.getDefaultQualityScore(type),
      averageTaskTime: this.getDefaultTaskTime(type),
      collaborationScore: 0.85,
      ...options.initialPerformance
    };

    this.resources = {
      memoryUsage: 0.3 + Math.random() * 0.2, // 30-50% baseline
      cpuUsage: 0.1 + Math.random() * 0.1,   // 10-20% baseline
      networkActivity: 0.05 + Math.random() * 0.05 // 5-10% baseline
    };
  }

  /**
   * Execute a task
   */
  public async executeTask(task: any): Promise<any> {
    if (this.status === 'error') {
      throw new Error(`Agent ${this.id} is in error state`);
    }

    this.status = 'active';
    this.currentTask = task.id || task.title || 'Unnamed task';

    try {
      // Simulate task execution
      const result = await this.simulateTaskExecution(task);

      // Update performance metrics
      this.updatePerformanceMetrics(task, result);

      this.status = 'idle';
      this.currentTask = undefined;

      this.emit('task_completed', { task, result });

      return result;
    } catch (error) {
      this.status = 'error';
      this.emit('task_failed', { task, error });
      throw error;
    }
  }

  /**
   * Get current agent status
   */
  public getStatus(): any {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      status: this.status,
      currentTask: this.currentTask,
      capabilities: this.capabilities,
      performance: this.performance,
      resources: this.resources,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Update agent resources
   */
  public updateResources(updates: Partial<typeof this.resources>): void {
    this.resources = { ...this.resources, ...updates };
    this.emit('resources_updated', this.resources);
  }

  /**
   * Simulate agent error
   */
  public simulateError(error: string | Error): void {
    this.status = 'error';
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    this.emit('error', errorObj);
  }

  /**
   * Recover from error state
   */
  public recover(): void {
    if (this.status === 'error') {
      this.status = 'idle';
      this.currentTask = undefined;
      this.emit('recovered');
    }
  }

  /**
   * Pause agent
   */
  public pause(): void {
    if (this.status === 'active') {
      this.status = 'paused';
      this.emit('paused');
    }
  }

  /**
   * Resume agent
   */
  public resume(): void {
    if (this.status === 'paused') {
      this.status = 'active';
      this.emit('resumed');
    }
  }

  /**
   * Get task history
   */
  public getTaskHistory(): any[] {
    return [...this.taskHistory];
  }

  /**
   * Clear task history
   */
  public clearTaskHistory(): void {
    this.taskHistory = [];
  }

  // Private methods

  private async simulateTaskExecution(task: any): Promise<any> {
    // Simulate work time based on task complexity
    const baseTime = this.performance.averageTaskTime;
    const complexityMultiplier = task.complexity || 1;
    const executionTime = baseTime * complexityMultiplier;

    // Add some randomness
    const actualTime = executionTime * (0.8 + Math.random() * 0.4);

    // Simulate error occurrence
    if (Math.random() < this.errorRate) {
      throw new Error(`Simulated error during task execution: ${this.currentTask}`);
    }

    // Simulate resource usage during task
    this.simulateResourceUsage(task);

    // Wait for execution time
    await this.sleep(this.simulateLatency);

    // Generate result based on agent type
    const result = this.generateTaskResult(task, actualTime);

    return result;
  }

  private simulateResourceUsage(task: any): void {
    // Increase resource usage during task execution
    const taskLoad = task.complexity || 1;

    this.resources.cpuUsage = Math.min(0.9, this.resources.cpuUsage + 0.2 * taskLoad);
    this.resources.memoryUsage = Math.min(0.9, this.resources.memoryUsage + 0.1 * taskLoad);
    this.resources.networkActivity = Math.min(0.8, this.resources.networkActivity + 0.05 * taskLoad);

    // Simulate resource cleanup after task
    setTimeout(() => {
      this.resources.cpuUsage = Math.max(0.1, this.resources.cpuUsage - 0.15);
      this.resources.memoryUsage = Math.max(0.2, this.resources.memoryUsage - 0.08);
      this.resources.networkActivity = Math.max(0.02, this.resources.networkActivity - 0.03);
    }, 5000);
  }

  private generateTaskResult(task: any, executionTime: number): any {
    const qualityVariance = 0.1; // ±10% quality variance
    const quality = Math.max(0.1, Math.min(1.0,
      this.performance.qualityScore + (Math.random() - 0.5) * qualityVariance
    ));

    const baseResult = {
      success: true,
      taskId: task.id || task.title,
      agentId: this.id,
      agentType: this.type,
      executionTime,
      quality,
      timestamp: new Date().toISOString()
    };

    // Generate type-specific results
    switch (this.type) {
      case 'researcher':
        return {
          ...baseResult,
          research: this.generateResearchResult(task),
          deliverables: ['requirements_analysis', 'technology_recommendations', 'security_assessment']
        };

      case 'coder':
        return {
          ...baseResult,
          implementation: this.generateImplementationResult(task),
          deliverables: ['source_code', 'unit_tests', 'documentation'],
          metrics: {
            linesOfCode: Math.floor(50 + Math.random() * 200),
            functionsCreated: Math.floor(3 + Math.random() * 10),
            testsWritten: Math.floor(5 + Math.random() * 15)
          }
        };

      case 'reviewer':
        return {
          ...baseResult,
          review: this.generateReviewResult(task),
          deliverables: ['review_report', 'issue_list', 'recommendations'],
          findings: {
            issuesFound: Math.floor(Math.random() * 5),
            criticalIssues: Math.floor(Math.random() * 2),
            recommendations: Math.floor(2 + Math.random() * 4)
          }
        };

      default:
        return baseResult;
    }
  }

  private generateResearchResult(task: any): any {
    return {
      findings: `Research findings for ${task.title || 'task'}`,
      sources: Math.floor(5 + Math.random() * 15),
      confidence: 0.7 + Math.random() * 0.3,
      recommendations: [
        'Implement OAuth2 for authentication',
        'Use PostgreSQL for data storage',
        'Apply security best practices'
      ]
    };
  }

  private generateImplementationResult(task: any): any {
    return {
      description: `Implementation for ${task.title || 'task'}`,
      codeQuality: 0.8 + Math.random() * 0.2,
      testCoverage: 0.7 + Math.random() * 0.25,
      components: ['main_module', 'helper_functions', 'test_suite'],
      dependencies: ['express', 'jsonwebtoken', 'bcrypt']
    };
  }

  private generateReviewResult(task: any): any {
    const issueTypes = ['security', 'performance', 'maintainability', 'testing'];
    const severities = ['low', 'medium', 'high', 'critical'];

    return {
      description: `Review for ${task.title || 'task'}`,
      overallScore: 0.7 + Math.random() * 0.3,
      issues: Array.from({ length: Math.floor(Math.random() * 4) }, (_, i) => ({
        id: `issue-${i + 1}`,
        type: issueTypes[Math.floor(Math.random() * issueTypes.length)],
        severity: severities[Math.floor(Math.random() * severities.length)],
        description: `Issue ${i + 1} description`
      })),
      recommendations: [
        'Improve error handling',
        'Add more comprehensive tests',
        'Optimize database queries'
      ]
    };
  }

  private updatePerformanceMetrics(task: any, result: any): void {
    this.performance.tasksCompleted++;

    // Update quality score (exponential moving average)
    const alpha = 0.2; // Learning rate
    this.performance.qualityScore =
      alpha * result.quality + (1 - alpha) * this.performance.qualityScore;

    // Update average task time
    this.performance.averageTaskTime =
      alpha * result.executionTime + (1 - alpha) * this.performance.averageTaskTime;

    // Store task in history
    this.taskHistory.push({
      task,
      result,
      timestamp: new Date().toISOString()
    });

    // Limit history size
    if (this.taskHistory.length > 50) {
      this.taskHistory = this.taskHistory.slice(-50);
    }
  }

  private getDefaultCapabilities(type: Agent['type']): string[] {
    switch (type) {
      case 'researcher':
        return [
          'requirement_analysis',
          'technology_research',
          'security_assessment',
          'documentation_creation',
          'market_analysis'
        ];

      case 'coder':
        return [
          'code_generation',
          'api_development',
          'database_integration',
          'testing_implementation',
          'performance_optimization'
        ];

      case 'reviewer':
        return [
          'code_review',
          'security_audit',
          'performance_analysis',
          'quality_assessment',
          'compliance_check'
        ];

      default:
        return ['general_task_execution'];
    }
  }

  private getDefaultQualityScore(type: Agent['type']): number {
    switch (type) {
      case 'researcher':
        return 0.89;
      case 'coder':
        return 0.85;
      case 'reviewer':
        return 0.92;
      default:
        return 0.80;
    }
  }

  private getDefaultTaskTime(type: Agent['type']): number {
    switch (type) {
      case 'researcher':
        return 1920000; // 32 minutes
      case 'coder':
        return 3840000; // 64 minutes
      case 'reviewer':
        return 1440000; // 24 minutes
      default:
        return 2400000; // 40 minutes
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create mock agents
 */
export function createMockAgent(
  type: Agent['type'],
  id?: string,
  options: MockAgentOptions = {}
): MockAgent {
  return new MockAgent(type, { ...options, id });
}

/**
 * Create a set of coordinated mock agents
 */
export function createMockAgentSwarm(options: {
  researcherId?: string;
  coderId?: string;
  reviewerId?: string;
  customOptions?: Record<string, MockAgentOptions>;
} = {}): { researcher: MockAgent; coder: MockAgent; reviewer: MockAgent } {
  const researcher = createMockAgent('researcher', options.researcherId,
    options.customOptions?.researcher);
  const coder = createMockAgent('coder', options.coderId,
    options.customOptions?.coder);
  const reviewer = createMockAgent('reviewer', options.reviewerId,
    options.customOptions?.reviewer);

  // Set up cross-agent collaboration scoring
  const updateCollaborationScore = (agent: MockAgent, score: number) => {
    agent.performance.collaborationScore = score;
  };

  researcher.on('task_completed', () => {
    updateCollaborationScore(researcher, 0.88);
    updateCollaborationScore(coder, 0.85);
    updateCollaborationScore(reviewer, 0.87);
  });

  coder.on('task_completed', () => {
    updateCollaborationScore(researcher, 0.90);
    updateCollaborationScore(coder, 0.87);
    updateCollaborationScore(reviewer, 0.89);
  });

  reviewer.on('task_completed', () => {
    updateCollaborationScore(researcher, 0.91);
    updateCollaborationScore(coder, 0.88);
    updateCollaborationScore(reviewer, 0.93);
  });

  return { researcher, coder, reviewer };
}

/**
 * Create a mock agent with specific performance characteristics
 */
export function createPerformantMockAgent(
  type: Agent['type'],
  performance: 'high' | 'medium' | 'low' | 'degraded'
): MockAgent {
  let options: MockAgentOptions;

  switch (performance) {
    case 'high':
      options = {
        initialPerformance: {
          qualityScore: 0.95,
          averageTaskTime: 0.8, // 20% faster
          collaborationScore: 0.95
        },
        errorRate: 0.005, // 0.5% error rate
        simulateLatency: 50
      };
      break;

    case 'medium':
      options = {
        initialPerformance: {
          qualityScore: 0.85,
          averageTaskTime: 1.0, // Normal speed
          collaborationScore: 0.85
        },
        errorRate: 0.02, // 2% error rate
        simulateLatency: 100
      };
      break;

    case 'low':
      options = {
        initialPerformance: {
          qualityScore: 0.70,
          averageTaskTime: 1.3, // 30% slower
          collaborationScore: 0.75
        },
        errorRate: 0.05, // 5% error rate
        simulateLatency: 200
      };
      break;

    case 'degraded':
      options = {
        initialPerformance: {
          qualityScore: 0.60,
          averageTaskTime: 1.8, // 80% slower
          collaborationScore: 0.65
        },
        errorRate: 0.15, // 15% error rate
        simulateLatency: 500
      };
      break;

    default:
      options = {};
  }

  return createMockAgent(type, undefined, options);
}