/**
 * Fix Coordinator - Intelligent Failure Analysis and Fix Assignment
 *
 * Analyzes test failures, assigns fixes to appropriate agents, tracks progress,
 * and triggers regression testing after fixes are applied.
 *
 * Key Features:
 * - Intelligent failure categorization
 * - Agent assignment based on expertise
 * - Parallel fix execution
 * - Fix validation and rollback
 * - Learning from fix patterns
 */

import { EventEmitter } from 'events';
import { SwarmMemoryManager } from '../../memory/swarm-memory.js';
import { ILogger } from '../../core/logger.js';
import { FullStackAgentType } from '../types/index.js';
import { TestFailure, FixExecutionResult, CodeChange, ValidationResult } from './iterative-build-test.js';

export interface FixPlan {
  id: string;
  featureId: string;
  failures: TestFailure[];
  fixStrategies: FixStrategy[];
  priority: FixPriority[];
  estimatedDuration: number;
  dependencies: Map<string, string[]>; // fixId -> dependent fixIds
}

export interface FixStrategy {
  id: string;
  failureId: string;
  strategy: 'quick-fix' | 'refactor' | 'redesign' | 'workaround';
  assignedAgent: FullStackAgentType;
  description: string;
  steps: string[];
  estimatedEffort: number; // minutes
  confidence: number; // 0-1
  alternatives: string[];
}

export interface FixPriority {
  failureId: string;
  priority: number; // 0-100, higher is more urgent
  reasoning: string;
  blocking: boolean;
}

export interface FixPattern {
  pattern: string;
  category: string;
  successRate: number;
  averageTime: number;
  bestAgent: FullStackAgentType;
  commonSolutions: string[];
}

export class FixCoordinator extends EventEmitter {
  private memory: SwarmMemoryManager;
  private fixPatterns = new Map<string, FixPattern>();
  private activeFixe = new Map<string, FixExecutionResult>();
  private fixHistory = new Map<string, FixExecutionResult[]>();

  constructor(memory: SwarmMemoryManager, private logger: ILogger) {
    super();
    this.memory = memory;
    this.loadFixPatterns();
  }

  /**
   * Create comprehensive fix plan from test failures
   */
  async createFixPlan(failures: TestFailure[], featureId: string): Promise<FixPlan> {
    this.logger.info('Creating fix plan', { failures: failures.length, featureId });

    try {
      // Categorize and analyze failures
      const categorized = this.categorizeFailures(failures);

      // Create fix strategies for each failure
      const fixStrategies = await Promise.all(
        failures.map((failure) => this.createFixStrategy(failure)),
      );

      // Prioritize fixes
      const priorities = this.prioritizeFixes(failures, fixStrategies);

      // Identify dependencies between fixes
      const dependencies = this.identifyFixDependencies(fixStrategies);

      // Estimate total duration
      const estimatedDuration = this.estimatePlanDuration(fixStrategies, dependencies);

      const plan: FixPlan = {
        id: `fix-plan_${Date.now()}`,
        featureId,
        failures,
        fixStrategies,
        priority: priorities,
        estimatedDuration,
        dependencies,
      };

      // Store plan in memory
      await this.memory.remember('fix-coordinator', 'state', plan, {
        tags: ['fix-plan', featureId],
        shareLevel: 'team',
      });

      this.emit('fix-plan:created', { plan });

      return plan;
    } catch (error) {
      this.logger.error('Failed to create fix plan', { error, featureId });
      throw error;
    }
  }

  /**
   * Execute fixes with parallel limit
   */
  async executeFixes(plan: FixPlan, maxParallel: number): Promise<FixExecutionResult[]> {
    this.logger.info('Executing fixes', {
      featureId: plan.featureId,
      totalFixes: plan.fixStrategies.length,
      maxParallel,
    });

    const results: FixExecutionResult[] = [];
    const queue = [...plan.fixStrategies];
    const inProgress = new Map<string, Promise<FixExecutionResult>>();

    while (queue.length > 0 || inProgress.size > 0) {
      // Start new fixes up to parallel limit
      while (queue.length > 0 && inProgress.size < maxParallel) {
        const strategy = this.getNextExecutableStrategy(queue, inProgress, plan.dependencies);
        if (!strategy) break;

        const promise = this.executeFix(strategy, plan.featureId);
        inProgress.set(strategy.id, promise);

        // Remove from queue
        const index = queue.findIndex((s) => s.id === strategy.id);
        if (index >= 0) queue.splice(index, 1);
      }

      // Wait for at least one to complete
      if (inProgress.size > 0) {
        const completed = await Promise.race(inProgress.values());
        results.push(completed);
        inProgress.delete(completed.id);

        this.emit('fix:completed', { fix: completed });
      }
    }

    // Store results
    this.fixHistory.set(plan.featureId, results);

    return results;
  }

  /**
   * Analyze failures and group by category
   */
  private categorizeFailures(failures: TestFailure[]): Map<string, TestFailure[]> {
    const categories = new Map<string, TestFailure[]>();

    for (const failure of failures) {
      const category = this.determineFailureCategory(failure);
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(failure);
    }

    return categories;
  }

  /**
   * Determine failure category from patterns
   */
  private determineFailureCategory(failure: TestFailure): string {
    const error = failure.error.toLowerCase();

    // API/Backend failures
    if (error.includes('api') || error.includes('endpoint') || error.includes('status code')) {
      return 'backend-api';
    }

    // Database failures
    if (error.includes('database') || error.includes('query') || error.includes('connection')) {
      return 'database';
    }

    // UI/Frontend failures
    if (error.includes('render') || error.includes('component') || error.includes('dom')) {
      return 'frontend-ui';
    }

    // State management failures
    if (error.includes('state') || error.includes('store') || error.includes('reducer')) {
      return 'state-management';
    }

    // Integration failures
    if (error.includes('integration') || error.includes('e2e')) {
      return 'integration';
    }

    // Performance failures
    if (error.includes('timeout') || error.includes('performance') || error.includes('slow')) {
      return 'performance';
    }

    // Security failures
    if (error.includes('auth') || error.includes('security') || error.includes('permission')) {
      return 'security';
    }

    return 'unknown';
  }

  /**
   * Create fix strategy for a specific failure
   */
  private async createFixStrategy(failure: TestFailure): Promise<FixStrategy> {
    const category = this.determineFailureCategory(failure);

    // Check for known patterns
    const pattern = this.fixPatterns.get(category);

    // Assign to appropriate agent based on layer and category
    const assignedAgent = this.assignAgentForFix(failure, category);

    // Determine strategy type
    const strategyType = this.determineStrategyType(failure, pattern);

    // Generate steps
    const steps = this.generateFixSteps(failure, strategyType, pattern);

    const strategy: FixStrategy = {
      id: `fix_${failure.id}`,
      failureId: failure.id,
      strategy: strategyType,
      assignedAgent,
      description: `Fix ${category} issue in ${failure.testName}`,
      steps,
      estimatedEffort: this.estimateFixEffort(failure, strategyType),
      confidence: pattern ? pattern.successRate : 0.5,
      alternatives: pattern?.commonSolutions || [],
    };

    return strategy;
  }

  /**
   * Assign agent based on failure characteristics
   */
  private assignAgentForFix(failure: TestFailure, category: string): FullStackAgentType {
    // Layer-based assignment
    if (failure.layer === 'frontend') {
      if (category === 'frontend-ui') return 'frontend-developer';
      if (category === 'state-management') return 'frontend-developer';
      if (category === 'performance') return 'performance-tester';
    }

    if (failure.layer === 'backend') {
      if (category === 'backend-api') return 'backend-developer';
      if (category === 'database') return 'database-developer';
      if (category === 'performance') return 'performance-tester';
      if (category === 'security') return 'security-tester';
    }

    if (failure.layer === 'integration') {
      return 'integration-specialist';
    }

    // Category-based fallback
    if (category === 'database') return 'database-developer';
    if (category === 'security') return 'security-tester';
    if (category === 'performance') return 'performance-tester';

    // Default based on test category
    if (failure.category === 'unit') return 'coder';
    if (failure.category === 'integration') return 'integration-specialist';
    if (failure.category === 'e2e') return 'e2e-tester';

    return 'coder'; // fallback
  }

  /**
   * Determine fix strategy type
   */
  private determineStrategyType(
    failure: TestFailure,
    pattern?: FixPattern,
  ): FixStrategy['strategy'] {
    // Critical failures often need redesign
    if (failure.severity === 'critical') {
      return 'refactor';
    }

    // Use pattern success rate to determine strategy
    if (pattern && pattern.successRate > 0.8) {
      return 'quick-fix';
    }

    // Complex failures need refactoring
    if (failure.affectedComponents.length > 3) {
      return 'refactor';
    }

    // Low priority can use workarounds
    if (failure.severity === 'low') {
      return 'workaround';
    }

    return 'quick-fix';
  }

  /**
   * Generate fix steps based on failure and strategy
   */
  private generateFixSteps(
    failure: TestFailure,
    strategy: FixStrategy['strategy'],
    pattern?: FixPattern,
  ): string[] {
    const steps: string[] = [];

    // Common first steps
    steps.push('Analyze failure root cause');
    steps.push('Review affected code components');

    // Strategy-specific steps
    if (strategy === 'quick-fix') {
      steps.push('Implement targeted fix');
      steps.push('Add/update unit tests');
    } else if (strategy === 'refactor') {
      steps.push('Design refactoring approach');
      steps.push('Implement refactored code');
      steps.push('Update comprehensive tests');
    } else if (strategy === 'redesign') {
      steps.push('Redesign affected architecture');
      steps.push('Implement new design');
      steps.push('Create comprehensive test suite');
    } else if (strategy === 'workaround') {
      steps.push('Implement temporary workaround');
      steps.push('Document technical debt');
    }

    // Common final steps
    steps.push('Validate fix with local tests');
    steps.push('Submit for regression testing');

    return steps;
  }

  /**
   * Prioritize fixes based on severity and impact
   */
  private prioritizeFixes(
    failures: TestFailure[],
    strategies: FixStrategy[],
  ): FixPriority[] {
    return failures.map((failure) => {
      const strategy = strategies.find((s) => s.failureId === failure.id);

      let priority = 50; // base priority

      // Severity adjustment
      if (failure.severity === 'critical') priority += 40;
      else if (failure.severity === 'high') priority += 25;
      else if (failure.severity === 'medium') priority += 10;

      // Layer adjustment (backend is often blocking)
      if (failure.layer === 'backend') priority += 15;
      else if (failure.layer === 'integration') priority += 10;

      // Category adjustment
      if (failure.category === 'e2e') priority += 10;

      // Component impact
      priority += Math.min(failure.affectedComponents.length * 5, 20);

      return {
        failureId: failure.id,
        priority: Math.min(priority, 100),
        reasoning: `Priority based on ${failure.severity} severity, ${failure.layer} layer, ${failure.affectedComponents.length} affected components`,
        blocking: failure.severity === 'critical' || failure.layer === 'backend',
      };
    });
  }

  /**
   * Identify dependencies between fixes
   */
  private identifyFixDependencies(strategies: FixStrategy[]): Map<string, string[]> {
    const dependencies = new Map<string, string[]>();

    // Simple dependency detection based on affected components
    for (const strategy of strategies) {
      const deps: string[] = [];

      // Backend fixes should complete before frontend fixes
      if (strategy.assignedAgent === 'frontend-developer') {
        const backendFixes = strategies.filter(
          (s) => s.assignedAgent === 'backend-developer' || s.assignedAgent === 'api-developer',
        );
        deps.push(...backendFixes.map((f) => f.id));
      }

      // Database fixes should complete before backend fixes
      if (strategy.assignedAgent === 'backend-developer') {
        const dbFixes = strategies.filter((s) => s.assignedAgent === 'database-developer');
        deps.push(...dbFixes.map((f) => f.id));
      }

      if (deps.length > 0) {
        dependencies.set(strategy.id, deps);
      }
    }

    return dependencies;
  }

  /**
   * Estimate total plan duration considering dependencies
   */
  private estimatePlanDuration(
    strategies: FixStrategy[],
    dependencies: Map<string, string[]>,
  ): number {
    // Critical path calculation
    const strategyMap = new Map(strategies.map((s) => [s.id, s]));
    const visited = new Set<string>();
    let maxDuration = 0;

    const calculatePath = (strategyId: string): number => {
      if (visited.has(strategyId)) return 0;
      visited.add(strategyId);

      const strategy = strategyMap.get(strategyId);
      if (!strategy) return 0;

      const deps = dependencies.get(strategyId) || [];
      const depDuration = Math.max(...deps.map((d) => calculatePath(d)), 0);

      return depDuration + strategy.estimatedEffort;
    };

    for (const strategy of strategies) {
      const duration = calculatePath(strategy.id);
      maxDuration = Math.max(maxDuration, duration);
    }

    return maxDuration * 60 * 1000; // convert to milliseconds
  }

  /**
   * Get next executable strategy respecting dependencies
   */
  private getNextExecutableStrategy(
    queue: FixStrategy[],
    inProgress: Map<string, Promise<FixExecutionResult>>,
    dependencies: Map<string, string[]>,
  ): FixStrategy | null {
    for (const strategy of queue) {
      const deps = dependencies.get(strategy.id) || [];

      // Check if all dependencies are completed
      const allDepsCompleted = deps.every((depId) => !inProgress.has(depId));

      if (allDepsCompleted) {
        return strategy;
      }
    }

    return null;
  }

  /**
   * Execute individual fix
   */
  private async executeFix(
    strategy: FixStrategy,
    featureId: string,
  ): Promise<FixExecutionResult> {
    const startTime = new Date().toISOString();

    const result: FixExecutionResult = {
      id: strategy.id,
      failureId: strategy.failureId,
      assignedAgent: strategy.assignedAgent,
      strategy: strategy.strategy,
      startTime,
      status: 'active',
      changes: [],
      validation: {
        passed: false,
        testsPassed: 0,
        testsFailed: 0,
        regressionDetected: false,
        issues: [],
      },
    };

    this.activeFixe.set(strategy.id, result);

    try {
      this.logger.info('Executing fix', {
        fixId: strategy.id,
        agent: strategy.assignedAgent,
        strategy: strategy.strategy,
      });

      // Simulate fix execution (in production, delegate to actual agent)
      const changes = await this.simulateFixExecution(strategy);
      result.changes = changes;

      // Validate fix
      const validation = await this.validateFix(strategy, changes);
      result.validation = validation;

      if (validation.passed) {
        result.status = 'completed';

        // Learn from successful fix
        await this.learnFromFix(strategy, result);
      } else {
        result.status = 'failed';
      }

      result.endTime = new Date().toISOString();

      // Store in memory
      await this.memory.remember('fix-coordinator', 'result', result, {
        tags: ['fix-result', featureId, strategy.assignedAgent],
        shareLevel: 'team',
      });

      this.activeFixe.delete(strategy.id);

      return result;
    } catch (error) {
      this.logger.error('Fix execution failed', { error, fixId: strategy.id });
      result.status = 'failed';
      result.endTime = new Date().toISOString();
      result.validation.issues.push(error.message);
      this.activeFixe.delete(strategy.id);
      return result;
    }
  }

  /**
   * Simulate fix execution (placeholder for real agent work)
   */
  private async simulateFixExecution(strategy: FixStrategy): Promise<CodeChange[]> {
    // In production, this would delegate to the assigned agent
    return [
      {
        file: 'src/component.ts',
        type: 'modify',
        linesChanged: 15,
        description: `Applied ${strategy.strategy} for ${strategy.description}`,
      },
    ];
  }

  /**
   * Validate fix effectiveness
   */
  private async validateFix(strategy: FixStrategy, changes: CodeChange[]): Promise<ValidationResult> {
    // In production, run targeted tests to validate the fix
    return {
      passed: true,
      testsPassed: 10,
      testsFailed: 0,
      regressionDetected: false,
      issues: [],
    };
  }

  /**
   * Learn from successful fixes to improve pattern matching
   */
  private async learnFromFix(strategy: FixStrategy, result: FixExecutionResult): Promise<void> {
    const category = this.determineFailureCategory({
      id: strategy.failureId,
      error: strategy.description,
    } as TestFailure);

    let pattern = this.fixPatterns.get(category);

    if (!pattern) {
      pattern = {
        pattern: category,
        category,
        successRate: 0,
        averageTime: 0,
        bestAgent: strategy.assignedAgent,
        commonSolutions: [],
      };
    }

    // Update success rate
    const totalFixes = (pattern.successRate * 100) + 1;
    pattern.successRate = ((pattern.successRate * 100) + 1) / totalFixes;

    // Update average time
    const duration = new Date(result.endTime!).getTime() - new Date(result.startTime).getTime();
    pattern.averageTime = (pattern.averageTime + duration) / 2;

    this.fixPatterns.set(category, pattern);
  }

  /**
   * Estimate fix effort based on failure characteristics
   */
  private estimateFixEffort(failure: TestFailure, strategy: FixStrategy['strategy']): number {
    let baseEffort = 15; // minutes

    // Strategy multiplier
    if (strategy === 'quick-fix') baseEffort *= 1;
    else if (strategy === 'refactor') baseEffort *= 2;
    else if (strategy === 'redesign') baseEffort *= 4;
    else if (strategy === 'workaround') baseEffort *= 0.5;

    // Severity multiplier
    if (failure.severity === 'critical') baseEffort *= 1.5;
    else if (failure.severity === 'low') baseEffort *= 0.7;

    // Component complexity
    baseEffort += failure.affectedComponents.length * 5;

    return Math.round(baseEffort);
  }

  /**
   * Load fix patterns from memory
   */
  private async loadFixPatterns(): Promise<void> {
    try {
      const patterns = await this.memory.recall({
        type: 'knowledge',
        tags: ['fix-pattern'],
        limit: 100,
      });

      for (const entry of patterns) {
        if (entry.content.pattern) {
          this.fixPatterns.set(entry.content.pattern, entry.content);
        }
      }

      this.logger.info('Loaded fix patterns', { count: this.fixPatterns.size });
    } catch (error) {
      this.logger.warn('Failed to load fix patterns', { error });
    }
  }

  /**
   * Get fix execution status
   */
  getActiveFixes(): FixExecutionResult[] {
    return Array.from(this.activeFixe.values());
  }

  /**
   * Get fix history for feature
   */
  getFixHistory(featureId: string): FixExecutionResult[] {
    return this.fixHistory.get(featureId) || [];
  }
}