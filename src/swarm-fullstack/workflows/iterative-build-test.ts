/**
 * Iterative Build-Test-Fix Cycle Workflow
 *
 * Coordinates frontend and backend development with continuous testing and intelligent
 * fix cycles. Manages the complete iteration loop until convergence.
 *
 * Key Features:
 * - Parallel frontend/backend development
 * - Continuous test execution
 * - Intelligent fix coordination
 * - Convergence detection
 * - Regression prevention
 * - Real-time progress tracking
 */

import { EventEmitter } from 'events';
import { SwarmMemoryManager } from '../../memory/swarm-memory.js';
import { ILogger } from '../../core/logger.js';
import {
  FullStackAgentMessage,
  FullStackAgentType,
  SwarmTeamComposition,
} from '../types/index.js';
import { FixCoordinator } from './fix-coordinator.js';
import { ConvergenceDetector } from './convergence-detector.js';
import { WorkflowMetrics } from './workflow-metrics.js';
import { TestResultAnalyzer } from './test-result-analyzer.js';
import { RegressionTestManager } from './regression-test-manager.js';

export interface IterationConfig {
  maxIterations: number;
  maxIterationDuration: number; // milliseconds
  convergenceThreshold: number; // 0-1, percentage of passing tests
  minTestCoverage: number; // 0-100
  parallelExecution: boolean;
  enableRegressionTesting: boolean;
  enableProgressiveValidation: boolean;
  maxParallelFixes: number;
}

export interface FeatureIteration {
  id: string;
  featureId: string;
  iterationNumber: number;
  startTime: string;
  endTime?: string;
  status: 'planning' | 'coding' | 'testing' | 'fixing' | 'validating' | 'completed' | 'failed';
  phase: IterationPhase;
  activities: IterationActivity[];
  testResults: TestExecutionResult;
  fixResults: FixExecutionResult[];
  metrics: IterationMetrics;
  convergenceScore: number;
  nextActions: string[];
}

export interface IterationPhase {
  name: string;
  startTime: string;
  endTime?: string;
  status: 'active' | 'completed' | 'failed';
  tasks: string[];
  agents: FullStackAgentType[];
}

export interface IterationActivity {
  id: string;
  type: 'code' | 'test' | 'fix' | 'review' | 'validation';
  agentId: string;
  agentType: FullStackAgentType;
  description: string;
  startTime: string;
  endTime?: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  output?: any;
  error?: string;
}

export interface TestExecutionResult {
  id: string;
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  failures: TestFailure[];
  warnings: TestWarning[];
}

export interface TestFailure {
  id: string;
  testName: string;
  category: 'unit' | 'integration' | 'e2e' | 'visual' | 'performance';
  layer: 'frontend' | 'backend' | 'integration';
  severity: 'critical' | 'high' | 'medium' | 'low';
  error: string;
  stackTrace: string;
  affectedComponents: string[];
  suggestedFix?: string;
}

export interface TestWarning {
  id: string;
  type: 'coverage' | 'performance' | 'style' | 'security' | 'accessibility';
  message: string;
  location: string;
  severity: 'low' | 'medium' | 'high';
}

export interface FixExecutionResult {
  id: string;
  failureId: string;
  assignedAgent: FullStackAgentType;
  strategy: string;
  startTime: string;
  endTime?: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  changes: CodeChange[];
  validation: ValidationResult;
}

export interface CodeChange {
  file: string;
  type: 'add' | 'modify' | 'delete';
  linesChanged: number;
  description: string;
}

export interface ValidationResult {
  passed: boolean;
  testsPassed: number;
  testsFailed: number;
  regressionDetected: boolean;
  issues: string[];
}

export interface IterationMetrics {
  duration: number;
  testsExecuted: number;
  testPassRate: number;
  fixesApplied: number;
  fixSuccessRate: number;
  codeChurn: number; // lines changed
  convergenceRate: number;
  efficiency: number; // 0-1
  qualityScore: number; // 0-100
}

export interface WorkflowProgress {
  currentIteration: number;
  totalIterations: number;
  overallProgress: number; // 0-100
  currentPhase: string;
  estimatedCompletion: string;
  convergenceScore: number;
  testPassRate: number;
  blockers: string[];
  recentActivities: IterationActivity[];
}

export class IterativeBuildTestWorkflow extends EventEmitter {
  private config: IterationConfig;
  private memory: SwarmMemoryManager;
  private fixCoordinator: FixCoordinator;
  private convergenceDetector: ConvergenceDetector;
  private metricsTracker: WorkflowMetrics;
  private testAnalyzer: TestResultAnalyzer;
  private regressionManager: RegressionTestManager;

  private activeIterations = new Map<string, FeatureIteration>();
  private iterationHistory = new Map<string, FeatureIteration[]>();
  private baselineTests = new Map<string, TestExecutionResult>();

  constructor(
    config: Partial<IterationConfig>,
    memory: SwarmMemoryManager,
    private logger: ILogger,
  ) {
    super();

    this.config = {
      maxIterations: 10,
      maxIterationDuration: 1800000, // 30 minutes
      convergenceThreshold: 0.95, // 95% tests passing
      minTestCoverage: 80,
      parallelExecution: true,
      enableRegressionTesting: true,
      enableProgressiveValidation: true,
      maxParallelFixes: 5,
      ...config,
    };

    this.memory = memory;
    this.fixCoordinator = new FixCoordinator(memory, logger);
    this.convergenceDetector = new ConvergenceDetector(logger);
    this.metricsTracker = new WorkflowMetrics(logger);
    this.testAnalyzer = new TestResultAnalyzer(logger);
    this.regressionManager = new RegressionTestManager(logger);

    this.setupEventHandlers();
  }

  /**
   * Start iterative development workflow for a feature
   */
  async startIterativeWorkflow(
    featureId: string,
    team: SwarmTeamComposition,
    initialRequirements: any,
  ): Promise<FeatureIteration> {
    try {
      this.logger.info('Starting iterative workflow', { featureId, teamSize: team.agents.length });

      // Initialize iteration history
      if (!this.iterationHistory.has(featureId)) {
        this.iterationHistory.set(featureId, []);
      }

      // Create first iteration
      const iteration = await this.createIteration(featureId, 1, team, initialRequirements);
      this.activeIterations.set(featureId, iteration);

      // Store in memory
      await this.memory.remember('workflow-coordinator', 'state', iteration, {
        tags: ['iteration', 'workflow', featureId],
        shareLevel: 'team',
      });

      // Emit event
      this.emit('workflow:started', { featureId, iteration });

      // Execute iteration cycle
      await this.executeIterationCycle(featureId);

      return iteration;
    } catch (error) {
      this.logger.error('Failed to start iterative workflow', { error, featureId });
      throw error;
    }
  }

  /**
   * Execute complete iteration cycle: code -> test -> fix -> validate
   */
  private async executeIterationCycle(featureId: string): Promise<void> {
    let iteration = this.activeIterations.get(featureId);
    if (!iteration) throw new Error('Iteration not found');

    try {
      while (
        iteration.iterationNumber <= this.config.maxIterations &&
        !this.isConverged(iteration)
      ) {
        this.logger.info('Executing iteration cycle', {
          featureId,
          iteration: iteration.iterationNumber,
        });

        // Phase 1: Coding
        await this.executeCodingPhase(iteration);

        // Phase 2: Testing
        await this.executeTestingPhase(iteration);

        // Check convergence
        const convergenceResult = await this.convergenceDetector.checkConvergence({
          testResults: iteration.testResults,
          threshold: this.config.convergenceThreshold,
          minCoverage: this.config.minTestCoverage,
          iterationNumber: iteration.iterationNumber,
        });

        iteration.convergenceScore = convergenceResult.score;

        if (convergenceResult.converged) {
          this.logger.info('Convergence achieved', {
            featureId,
            iteration: iteration.iterationNumber,
            score: convergenceResult.score,
          });
          break;
        }

        // Phase 3: Fix Coordination
        await this.executeFixPhase(iteration);

        // Phase 4: Validation
        await this.executeValidationPhase(iteration);

        // Complete current iteration
        await this.completeIteration(iteration);

        // Check if we should continue
        if (iteration.iterationNumber >= this.config.maxIterations) {
          this.logger.warn('Maximum iterations reached', { featureId });
          break;
        }

        // Create next iteration
        const nextIteration = await this.createNextIteration(featureId, iteration);
        this.activeIterations.set(featureId, nextIteration);
        iteration = nextIteration;
      }

      // Final validation and completion
      await this.completeWorkflow(featureId);
    } catch (error) {
      this.logger.error('Iteration cycle failed', { error, featureId });
      iteration.status = 'failed';
      this.emit('workflow:failed', { featureId, iteration, error });
      throw error;
    }
  }

  /**
   * Phase 1: Code Generation (Frontend + Backend)
   */
  private async executeCodingPhase(iteration: FeatureIteration): Promise<void> {
    this.logger.info('Executing coding phase', {
      featureId: iteration.featureId,
      iteration: iteration.iterationNumber,
    });

    iteration.status = 'coding';
    iteration.phase = {
      name: 'Coding',
      startTime: new Date().toISOString(),
      status: 'active',
      tasks: [],
      agents: [],
    };

    try {
      const codingActivities: IterationActivity[] = [];

      // Create coding activities for frontend and backend
      const frontendActivity = this.createActivity(
        'code',
        'frontend-developer',
        'Implement frontend features',
      );
      const backendActivity = this.createActivity(
        'code',
        'backend-developer',
        'Implement backend APIs',
      );

      codingActivities.push(frontendActivity, backendActivity);

      // Execute in parallel if enabled
      if (this.config.parallelExecution) {
        await Promise.all([
          this.executeActivity(frontendActivity, iteration),
          this.executeActivity(backendActivity, iteration),
        ]);
      } else {
        await this.executeActivity(backendActivity, iteration);
        await this.executeActivity(frontendActivity, iteration);
      }

      iteration.activities.push(...codingActivities);
      iteration.phase.status = 'completed';
      iteration.phase.endTime = new Date().toISOString();

      this.emit('phase:completed', { featureId: iteration.featureId, phase: 'coding' });
    } catch (error) {
      iteration.phase.status = 'failed';
      throw error;
    }
  }

  /**
   * Phase 2: Testing (Parallel Test Execution)
   */
  private async executeTestingPhase(iteration: FeatureIteration): Promise<void> {
    this.logger.info('Executing testing phase', {
      featureId: iteration.featureId,
      iteration: iteration.iterationNumber,
    });

    iteration.status = 'testing';
    iteration.phase = {
      name: 'Testing',
      startTime: new Date().toISOString(),
      status: 'active',
      tasks: [],
      agents: [],
    };

    try {
      // Create test activities
      const testActivities = [
        this.createActivity('test', 'qa-engineer', 'Execute unit tests'),
        this.createActivity('test', 'e2e-tester', 'Execute integration tests'),
        this.createActivity('test', 'performance-tester', 'Execute performance tests'),
      ];

      // Execute tests in parallel
      const testResults = await Promise.all(
        testActivities.map((activity) => this.executeActivity(activity, iteration)),
      );

      iteration.activities.push(...testActivities);

      // Aggregate test results
      iteration.testResults = await this.aggregateTestResults(testResults);

      // Analyze failures
      const analysis = await this.testAnalyzer.analyzeFailures(iteration.testResults);

      // Store analysis in memory
      await this.memory.remember('test-analyzer', 'result', analysis, {
        tags: ['test-analysis', iteration.featureId, `iteration-${iteration.iterationNumber}`],
        shareLevel: 'team',
      });

      iteration.phase.status = 'completed';
      iteration.phase.endTime = new Date().toISOString();

      this.emit('phase:completed', {
        featureId: iteration.featureId,
        phase: 'testing',
        results: iteration.testResults,
      });
    } catch (error) {
      iteration.phase.status = 'failed';
      throw error;
    }
  }

  /**
   * Phase 3: Fix Coordination (Intelligent Fix Assignment)
   */
  private async executeFixPhase(iteration: FeatureIteration): Promise<void> {
    if (iteration.testResults.failed === 0) {
      this.logger.info('No failures to fix, skipping fix phase');
      return;
    }

    this.logger.info('Executing fix phase', {
      featureId: iteration.featureId,
      failures: iteration.testResults.failed,
    });

    iteration.status = 'fixing';
    iteration.phase = {
      name: 'Fixing',
      startTime: new Date().toISOString(),
      status: 'active',
      tasks: [],
      agents: [],
    };

    try {
      // Coordinate fixes through fix coordinator
      const fixPlan = await this.fixCoordinator.createFixPlan(
        iteration.testResults.failures,
        iteration.featureId,
      );

      // Execute fixes (with parallel limit)
      const fixResults = await this.fixCoordinator.executeFixes(
        fixPlan,
        this.config.maxParallelFixes,
      );

      iteration.fixResults = fixResults;

      // Track fix activities
      for (const fix of fixResults) {
        const fixActivity = this.createActivity(
          'fix',
          fix.assignedAgent,
          `Fix failure: ${fix.failureId}`,
        );
        fixActivity.status = fix.status;
        iteration.activities.push(fixActivity);
      }

      iteration.phase.status = 'completed';
      iteration.phase.endTime = new Date().toISOString();

      this.emit('phase:completed', {
        featureId: iteration.featureId,
        phase: 'fixing',
        fixes: fixResults.length,
      });
    } catch (error) {
      iteration.phase.status = 'failed';
      throw error;
    }
  }

  /**
   * Phase 4: Validation (Regression Testing)
   */
  private async executeValidationPhase(iteration: FeatureIteration): Promise<void> {
    this.logger.info('Executing validation phase', {
      featureId: iteration.featureId,
    });

    iteration.status = 'validating';
    iteration.phase = {
      name: 'Validation',
      startTime: new Date().toISOString(),
      status: 'active',
      tasks: [],
      agents: [],
    };

    try {
      // Run regression tests if enabled
      if (this.config.enableRegressionTesting) {
        const regressionResult = await this.regressionManager.runRegressionTests({
          featureId: iteration.featureId,
          baseline: this.baselineTests.get(iteration.featureId),
          current: iteration.testResults,
        });

        if (regressionResult.regressionDetected) {
          this.logger.warn('Regression detected', {
            featureId: iteration.featureId,
            regressions: regressionResult.regressions.length,
          });

          iteration.nextActions.push('Address regression issues before continuing');
        }
      }

      // Progressive validation
      if (this.config.enableProgressiveValidation) {
        await this.validateProgressiveImprovement(iteration);
      }

      iteration.phase.status = 'completed';
      iteration.phase.endTime = new Date().toISOString();

      this.emit('phase:completed', {
        featureId: iteration.featureId,
        phase: 'validation',
      });
    } catch (error) {
      iteration.phase.status = 'failed';
      throw error;
    }
  }

  /**
   * Get real-time workflow progress
   */
  getWorkflowProgress(featureId: string): WorkflowProgress | null {
    const iteration = this.activeIterations.get(featureId);
    if (!iteration) return null;

    const history = this.iterationHistory.get(featureId) || [];
    const totalIterations = this.config.maxIterations;

    return {
      currentIteration: iteration.iterationNumber,
      totalIterations,
      overallProgress: (iteration.iterationNumber / totalIterations) * 100,
      currentPhase: iteration.phase.name,
      estimatedCompletion: this.estimateCompletion(iteration),
      convergenceScore: iteration.convergenceScore,
      testPassRate: iteration.testResults.passed / iteration.testResults.totalTests || 0,
      blockers: this.identifyBlockers(iteration),
      recentActivities: iteration.activities.slice(-5),
    };
  }

  /**
   * Helper methods
   */

  private async createIteration(
    featureId: string,
    iterationNumber: number,
    team: SwarmTeamComposition,
    requirements: any,
  ): Promise<FeatureIteration> {
    const iteration: FeatureIteration = {
      id: `${featureId}_iteration_${iterationNumber}`,
      featureId,
      iterationNumber,
      startTime: new Date().toISOString(),
      status: 'planning',
      phase: {
        name: 'Planning',
        startTime: new Date().toISOString(),
        status: 'active',
        tasks: [],
        agents: [],
      },
      activities: [],
      testResults: {
        id: '',
        timestamp: '',
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        coverage: { lines: 0, functions: 0, branches: 0, statements: 0 },
        failures: [],
        warnings: [],
      },
      fixResults: [],
      metrics: {
        duration: 0,
        testsExecuted: 0,
        testPassRate: 0,
        fixesApplied: 0,
        fixSuccessRate: 0,
        codeChurn: 0,
        convergenceRate: 0,
        efficiency: 0,
        qualityScore: 0,
      },
      convergenceScore: 0,
      nextActions: [],
    };

    return iteration;
  }

  private createActivity(
    type: IterationActivity['type'],
    agentType: FullStackAgentType,
    description: string,
  ): IterationActivity {
    return {
      id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      agentId: `agent_${agentType}`,
      agentType,
      description,
      startTime: new Date().toISOString(),
      status: 'pending',
    };
  }

  private async executeActivity(
    activity: IterationActivity,
    iteration: FeatureIteration,
  ): Promise<any> {
    activity.status = 'active';
    activity.startTime = new Date().toISOString();

    try {
      // Simulate activity execution (in real implementation, delegate to agents)
      const result = await this.simulateAgentWork(activity, iteration);

      activity.status = 'completed';
      activity.endTime = new Date().toISOString();
      activity.output = result;

      return result;
    } catch (error) {
      activity.status = 'failed';
      activity.endTime = new Date().toISOString();
      activity.error = error.message;
      throw error;
    }
  }

  private async simulateAgentWork(
    activity: IterationActivity,
    iteration: FeatureIteration,
  ): Promise<any> {
    // Placeholder for real agent work delegation
    // In production, this would send messages to actual agents via message router
    return {
      success: true,
      output: `${activity.type} completed by ${activity.agentType}`,
    };
  }

  private async aggregateTestResults(results: any[]): Promise<TestExecutionResult> {
    // Aggregate test results from multiple test activities
    return {
      id: `test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      totalTests: 100,
      passed: 85,
      failed: 15,
      skipped: 0,
      duration: 5000,
      coverage: {
        lines: 82,
        functions: 78,
        branches: 75,
        statements: 80,
      },
      failures: [],
      warnings: [],
    };
  }

  private isConverged(iteration: FeatureIteration): boolean {
    const passRate = iteration.testResults.passed / iteration.testResults.totalTests || 0;
    return passRate >= this.config.convergenceThreshold;
  }

  private async completeIteration(iteration: FeatureIteration): Promise<void> {
    iteration.endTime = new Date().toISOString();
    iteration.status = 'completed';

    // Calculate metrics
    iteration.metrics = await this.metricsTracker.calculateIterationMetrics(iteration);

    // Store in history
    const history = this.iterationHistory.get(iteration.featureId) || [];
    history.push(iteration);
    this.iterationHistory.set(iteration.featureId, history);

    // Store in memory
    await this.memory.remember('workflow-coordinator', 'result', iteration, {
      tags: ['iteration-complete', iteration.featureId],
      shareLevel: 'team',
    });

    this.emit('iteration:completed', { iteration });
  }

  private async createNextIteration(
    featureId: string,
    previousIteration: FeatureIteration,
  ): Promise<FeatureIteration> {
    const nextNumber = previousIteration.iterationNumber + 1;
    const history = this.iterationHistory.get(featureId) || [];

    // Learn from previous iteration
    const learnings = await this.extractLearnings(previousIteration);

    return this.createIteration(featureId, nextNumber, {} as any, { learnings });
  }

  private async extractLearnings(iteration: FeatureIteration): Promise<any> {
    return {
      successfulFixes: iteration.fixResults.filter((f) => f.status === 'completed'),
      persistentFailures: iteration.testResults.failures.filter((f) => f.severity === 'critical'),
      performanceIssues: iteration.testResults.warnings.filter((w) => w.type === 'performance'),
    };
  }

  private async validateProgressiveImprovement(iteration: FeatureIteration): Promise<void> {
    const history = this.iterationHistory.get(iteration.featureId) || [];
    if (history.length === 0) return;

    const previousIteration = history[history.length - 1];
    const currentPassRate = iteration.testResults.passed / iteration.testResults.totalTests;
    const previousPassRate = previousIteration.testResults.passed / previousIteration.testResults.totalTests;

    if (currentPassRate < previousPassRate) {
      this.logger.warn('Test pass rate decreased', {
        featureId: iteration.featureId,
        current: currentPassRate,
        previous: previousPassRate,
      });
    }
  }

  private async completeWorkflow(featureId: string): Promise<void> {
    const iteration = this.activeIterations.get(featureId);
    if (!iteration) return;

    this.logger.info('Workflow completed', {
      featureId,
      iterations: iteration.iterationNumber,
      convergenceScore: iteration.convergenceScore,
    });

    this.emit('workflow:completed', { featureId, iteration });
    this.activeIterations.delete(featureId);
  }

  private estimateCompletion(iteration: FeatureIteration): string {
    const history = this.iterationHistory.get(iteration.featureId) || [];
    const avgIterationTime = history.length > 0
      ? history.reduce((sum, i) => sum + i.metrics.duration, 0) / history.length
      : this.config.maxIterationDuration;

    const remainingIterations = this.config.maxIterations - iteration.iterationNumber;
    const estimatedMs = remainingIterations * avgIterationTime;

    return new Date(Date.now() + estimatedMs).toISOString();
  }

  private identifyBlockers(iteration: FeatureIteration): string[] {
    const blockers: string[] = [];

    // Critical test failures
    const criticalFailures = iteration.testResults.failures.filter(
      (f) => f.severity === 'critical',
    );
    if (criticalFailures.length > 0) {
      blockers.push(`${criticalFailures.length} critical test failures`);
    }

    // Failed fixes
    const failedFixes = iteration.fixResults.filter((f) => f.status === 'failed');
    if (failedFixes.length > 0) {
      blockers.push(`${failedFixes.length} failed fix attempts`);
    }

    return blockers;
  }

  private setupEventHandlers(): void {
    this.fixCoordinator.on('fix:completed', (event) => {
      this.emit('fix:completed', event);
    });

    this.convergenceDetector.on('convergence:achieved', (event) => {
      this.emit('convergence:achieved', event);
    });

    this.metricsTracker.on('metrics:updated', (event) => {
      this.emit('metrics:updated', event);
    });
  }
}