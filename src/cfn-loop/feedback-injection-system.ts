/**
 * Feedback Injection System for CFN Loop
 * Migrated from legacy/v1/src/cfn-loop/feedback-injection-system.ts
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';

export interface ValidatorFeedback {
  validator: string;
  validatorType: 'reviewer' | 'security-specialist' | 'system-architect' | 'tester' | 'perf-analyzer';
  issues: FeedbackIssue[];
  recommendations: string[];
  confidence: number;
  timestamp: number;
}

export interface FeedbackIssue {
  type: 'quality' | 'security' | 'performance' | 'architecture' | 'testing' | 'documentation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  location?: {
    file?: string;
    line?: number;
    function?: string;
  };
  suggestedFix?: string;
}

export interface ConsensusFeedback {
  phaseId: string;
  iteration: number;
  consensusFailed: boolean;
  consensusScore: number;
  requiredScore: number;
  validatorFeedback: ValidatorFeedback[];
  failedCriteria: string[];
  actionableSteps: ActionableStep[];
  previousIterations: IterationHistory[];
  timestamp: number;
}

export interface ActionableStep {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  action: string;
  targetAgent?: string;
  estimatedEffort: 'low' | 'medium' | 'high';
}

export interface IterationHistory {
  iteration: number;
  consensusScore: number;
  issues: FeedbackIssue[];
  resolved: boolean;
  resolutionNotes?: string;
}

export interface FeedbackInjectionConfig {
  maxIterations: number;
  deduplicationEnabled: boolean;
  memoryNamespace: string;
}

/**
 * System for capturing and injecting consensus feedback into primary swarm
 */
export class FeedbackInjectionSystem extends EventEmitter {
  private logger: Logger;
  private config: FeedbackInjectionConfig;
  private feedbackHistory: Map<string, ConsensusFeedback[]> = new Map();

  constructor(config?: Partial<FeedbackInjectionConfig>) {
    super();

    this.config = {
      maxIterations: config?.maxIterations ?? 10,
      deduplicationEnabled: config?.deduplicationEnabled ?? true,
      memoryNamespace: config?.memoryNamespace || 'cfn-loop/feedback',
    };

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'FeedbackInjectionSystem' });
  }

  /**
   * Capture feedback from consensus validation failure
   */
  async captureFeedback(options: {
    phaseId: string;
    iteration: number;
    consensusScore: number;
    requiredScore: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validatorResults: any[];
  }): Promise<ConsensusFeedback> {
    this.logger.info('Capturing consensus validation feedback', {
      phaseId: options.phaseId,
      iteration: options.iteration,
      consensusScore: options.consensusScore,
    });

    // Extract validator feedback
    const validatorFeedback = this.extractValidatorFeedback(options.validatorResults);

    // Identify failed criteria
    const failedCriteria = this.identifyFailedCriteria(options.validatorResults);

    // Generate actionable steps
    const actionableSteps = this.generateActionableSteps(validatorFeedback, failedCriteria);

    // Get previous iterations
    const previousIterations = this.getPreviousIterations(options.phaseId);

    const feedback: ConsensusFeedback = {
      phaseId: options.phaseId,
      iteration: options.iteration,
      consensusFailed: options.consensusScore < options.requiredScore,
      consensusScore: options.consensusScore,
      requiredScore: options.requiredScore,
      validatorFeedback,
      failedCriteria,
      actionableSteps,
      previousIterations,
      timestamp: Date.now(),
    };

    // Store in history
    this.storeFeedbackInHistory(options.phaseId, feedback);

    return feedback;
  }

  /**
   * Format feedback for injection into primary swarm prompt
   */
  formatForInjection(feedback: ConsensusFeedback): string {
    const lines: string[] = [
      '=== CONSENSUS VALIDATION FEEDBACK ===',
      '',
      `Iteration: ${feedback.iteration}`,
      `Consensus Score: ${(feedback.consensusScore * 100).toFixed(1)}% (Required: ${(feedback.requiredScore * 100).toFixed(1)}%)`,
      '',
    ];

    if (feedback.failedCriteria.length > 0) {
      lines.push('Failed Criteria:');
      for (const criterion of feedback.failedCriteria) {
        lines.push(`  - ${criterion}`);
      }
      lines.push('');
    }

    if (feedback.actionableSteps.length > 0) {
      lines.push('Actionable Steps:');
      for (const step of feedback.actionableSteps) {
        lines.push(`  [${step.priority.toUpperCase()}] ${step.category}: ${step.action}`);
      }
      lines.push('');
    }

    if (feedback.validatorFeedback.length > 0) {
      lines.push('Validator Feedback:');
      for (const validator of feedback.validatorFeedback) {
        lines.push(`  ${validator.validator} (${validator.validatorType}):`);
        for (const issue of validator.issues) {
          lines.push(`    - [${issue.severity}] ${issue.message}`);
          if (issue.suggestedFix) {
            lines.push(`      Fix: ${issue.suggestedFix}`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Extract validator feedback from results
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractValidatorFeedback(validatorResults: any[]): ValidatorFeedback[] {
    return validatorResults.map((result) => ({
      validator: result.agentId || 'unknown',
      validatorType: result.agentType || 'reviewer',
      issues: result.issues || [],
      recommendations: result.recommendations || [],
      confidence: result.confidence || 0,
      timestamp: Date.now(),
    }));
  }

  /**
   * Identify failed criteria from validator results
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private identifyFailedCriteria(validatorResults: any[]): string[] {
    const criteria = new Set<string>();

    for (const result of validatorResults) {
      if (result.issues && Array.isArray(result.issues)) {
        for (const issue of result.issues) {
          if (issue.type) {
            criteria.add(issue.type);
          }
        }
      }
    }

    return Array.from(criteria);
  }

  /**
   * Generate actionable steps from feedback
   */
  private generateActionableSteps(
    validatorFeedback: ValidatorFeedback[],
    failedCriteria: string[]
  ): ActionableStep[] {
    const steps: ActionableStep[] = [];

    // Group issues by severity
    const criticalIssues: FeedbackIssue[] = [];
    const highIssues: FeedbackIssue[] = [];

    for (const feedback of validatorFeedback) {
      for (const issue of feedback.issues) {
        if (issue.severity === 'critical') {
          criticalIssues.push(issue);
        } else if (issue.severity === 'high') {
          highIssues.push(issue);
        }
      }
    }

    // Create steps for critical issues
    for (const issue of criticalIssues) {
      steps.push({
        priority: 'critical',
        category: issue.type,
        action: issue.suggestedFix || issue.message,
        estimatedEffort: 'high',
      });
    }

    // Create steps for high issues
    for (const issue of highIssues) {
      steps.push({
        priority: 'high',
        category: issue.type,
        action: issue.suggestedFix || issue.message,
        estimatedEffort: 'medium',
      });
    }

    return steps;
  }

  /**
   * Get previous iterations for a phase
   */
  private getPreviousIterations(phaseId: string): IterationHistory[] {
    const history = this.feedbackHistory.get(phaseId) || [];

    return history.map((feedback) => ({
      iteration: feedback.iteration,
      consensusScore: feedback.consensusScore,
      issues: feedback.validatorFeedback.flatMap((v) => v.issues),
      resolved: false,
    }));
  }

  /**
   * Store feedback in history
   */
  private storeFeedbackInHistory(phaseId: string, feedback: ConsensusFeedback): void {
    if (!this.feedbackHistory.has(phaseId)) {
      this.feedbackHistory.set(phaseId, []);
    }

    const history = this.feedbackHistory.get(phaseId)!;
    history.push(feedback);

    // Limit history size
    if (history.length > this.config.maxIterations) {
      history.shift();
    }
  }

  /**
   * Clear feedback history for a phase
   */
  clearHistory(phaseId: string): void {
    this.feedbackHistory.delete(phaseId);
    this.logger.info('Cleared feedback history', { phaseId });
  }

  /**
   * Get feedback history for a phase
   */
  getHistory(phaseId: string): ConsensusFeedback[] {
    return this.feedbackHistory.get(phaseId) || [];
  }
}
