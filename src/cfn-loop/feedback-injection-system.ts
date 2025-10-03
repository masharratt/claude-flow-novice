/**
 * @file Feedback Injection System for CFN Loop
 * @description Captures, formats, and injects consensus validation feedback into primary swarm re-launches
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
  priorityThresholds: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  memoryNamespace: string;
}

export class FeedbackInjectionSystem extends EventEmitter {
  private logger: Logger;
  private config: FeedbackInjectionConfig;
  private feedbackHistory: Map<string, ConsensusFeedback[]> = new Map();
  private issueRegistry: Map<string, Set<string>> = new Map();
  private maxEntriesPerPhase = 100;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<FeedbackInjectionConfig>) {
    super();

    this.config = {
      maxIterations: config?.maxIterations ?? 10,
      deduplicationEnabled: config?.deduplicationEnabled ?? true,
      priorityThresholds: config?.priorityThresholds || {
        critical: 1.0,
        high: 0.8,
        medium: 0.5,
        low: 0.3,
      },
      memoryNamespace: config?.memoryNamespace || 'cfn-loop/feedback',
    };

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'FeedbackInjectionSystem' });

    // CVE-2025-003: Start periodic cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Start cleanup interval to prevent memory leaks
   * CVE-2025-003: Periodic cleanup every hour
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      3600000 // Every 1 hour
    );
  }

  /**
   * Sanitize feedback text to prevent prompt injection attacks
   * CVE-2025-002: Prevent malicious instructions in validator feedback
   */
  private sanitizeFeedback(text: string): string {
    if (typeof text !== 'string') {
      return String(text);
    }

    return text
      // Remove control characters (CVE-2025-002)
      .replace(/[\x00-\x1F\x7F]/g, '')
      // Prevent instruction injection
      .replace(/IGNORE\s+PREVIOUS\s+INSTRUCTIONS/gi, '[SANITIZED]')
      .replace(/DISREGARD\s+ALL\s+PREVIOUS/gi, '[SANITIZED]')
      .replace(/FORGET\s+EVERYTHING/gi, '[SANITIZED]')
      .replace(/NEW\s+INSTRUCTIONS/gi, '[SANITIZED]')
      // Prevent role manipulation
      .replace(/SYSTEM:/gi, '[SANITIZED]')
      .replace(/ASSISTANT:/gi, '[SANITIZED]')
      .replace(/USER:/gi, '[SANITIZED]')
      .replace(/ACT\s+AS/gi, '[SANITIZED]')
      .replace(/PRETEND\s+TO\s+BE/gi, '[SANITIZED]')
      .replace(/YOU\s+ARE\s+NOW/gi, '[SANITIZED]')
      // Prevent markdown injection
      .replace(/```[\s\S]*?```/g, '[CODE_BLOCK_REMOVED]')
      .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '[LINK_REMOVED]')
      // Limit length to prevent DoS (CVE-2025-002)
      .substring(0, 5000)
      .trim();
  }

  /**
   * Capture feedback from consensus validation failure
   */
  async captureFeedback(options: {
    phaseId: string;
    iteration: number;
    consensusScore: number;
    requiredScore: number;
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

    // Deduplicate issues
    if (this.config.deduplicationEnabled) {
      this.deduplicateIssues(feedback);
    }

    this.emit('feedback:captured', feedback);

    return feedback;
  }

  /**
   * Format feedback for injection into agent instructions
   * Emphasizes IMMEDIATE action and self-looping continuation
   */
  formatForInjection(feedback: ConsensusFeedback, targetAgent?: string): string {
    const sections: string[] = [];

    // Header with IMMEDIATE ACTION emphasis
    sections.push(`## 🔄 SELF-CORRECTING LOOP - Iteration ${feedback.iteration} Feedback`);
    sections.push('');
    sections.push(`🚨 **IMMEDIATE ACTION REQUIRED - NO HUMAN APPROVAL NEEDED**`);
    sections.push('');

    // Status
    sections.push(`**Consensus Status**: FAILED (${(feedback.consensusScore * 100).toFixed(1)}% / ${(feedback.requiredScore * 100).toFixed(1)}% required)`);
    sections.push(`**NEXT ACTION**: IMMEDIATELY spawn agents with this feedback integrated. This is an AUTONOMOUS self-correcting process.`);
    sections.push('');

    // Critical issues first (sanitized)
    const criticalSteps = feedback.actionableSteps.filter((s) => s.priority === 'critical');
    if (criticalSteps.length > 0) {
      sections.push('### CRITICAL ISSUES (Must Fix Immediately)');
      criticalSteps.forEach((step, idx) => {
        sections.push(`${idx + 1}. **[${this.sanitizeFeedback(step.category)}]** ${this.sanitizeFeedback(step.action)}`);
        if (step.targetAgent && step.targetAgent === targetAgent) {
          sections.push(`   - This is your responsibility`);
        }
      });
      sections.push('');
    }

    // High priority issues (sanitized)
    const highSteps = feedback.actionableSteps.filter((s) => s.priority === 'high');
    if (highSteps.length > 0) {
      sections.push('### High Priority Issues');
      highSteps.forEach((step, idx) => {
        sections.push(`${idx + 1}. **[${this.sanitizeFeedback(step.category)}]** ${this.sanitizeFeedback(step.action)}`);
      });
      sections.push('');
    }

    // Validator-specific feedback (sanitized)
    sections.push('### Validator Feedback');
    feedback.validatorFeedback.forEach((vf) => {
      sections.push(`**${this.sanitizeFeedback(vf.validator)}** (${vf.validatorType}):`);
      vf.issues.forEach((issue) => {
        const icon = this.getSeverityIcon(issue.severity);
        sections.push(`  ${icon} [${issue.type}] ${this.sanitizeFeedback(issue.message)}`);
        if (issue.location) {
          const sanitizedFile = issue.location.file ? this.sanitizeFeedback(issue.location.file) : 'N/A';
          sections.push(`     Location: ${sanitizedFile}${issue.location.line ? `:${issue.location.line}` : ''}`);
        }
        if (issue.suggestedFix) {
          sections.push(`     Fix: ${this.sanitizeFeedback(issue.suggestedFix)}`);
        }
      });
      sections.push('');
    });

    // Previous iterations learning (sanitized)
    if (feedback.previousIterations.length > 0) {
      sections.push('### Learnings from Previous Iterations');
      feedback.previousIterations.forEach((iter) => {
        sections.push(`- Iteration ${iter.iteration}: ${iter.resolved ? '✓ Resolved' : '✗ Unresolved'} (Score: ${(iter.consensusScore * 100).toFixed(1)}%)`);
        if (iter.resolutionNotes) {
          sections.push(`  Notes: ${this.sanitizeFeedback(iter.resolutionNotes)}`);
        }
      });
      sections.push('');
    }

    // Medium and low priority (summary, sanitized)
    const mediumLowSteps = feedback.actionableSteps.filter(
      (s) => s.priority === 'medium' || s.priority === 'low'
    );
    if (mediumLowSteps.length > 0) {
      sections.push(`### Additional Improvements (${mediumLowSteps.length} items)`);
      mediumLowSteps.slice(0, 5).forEach((step, idx) => {
        sections.push(`${idx + 1}. [${step.priority.toUpperCase()}] ${this.sanitizeFeedback(step.action)}`);
      });
      if (mediumLowSteps.length > 5) {
        sections.push(`... and ${mediumLowSteps.length - 5} more`);
      }
      sections.push('');
    }

    // Add continuation instructions
    sections.push('---');
    sections.push('');
    sections.push(`## ⚡ IMMEDIATE CONTINUATION INSTRUCTIONS`);
    sections.push('');
    sections.push(`This feedback is for **Iteration ${feedback.iteration + 1}** of the self-correcting CFN loop.`);
    sections.push('');
    sections.push(`**YOU MUST NOW:**`);
    sections.push(`1. IMMEDIATELY relaunch Loop 3 primary swarm with this feedback`);
    sections.push(`2. DO NOT wait for human approval - this is autonomous`);
    sections.push(`3. DO NOT create summary documents - execute NOW`);
    sections.push(`4. Inject this feedback into agent instructions`);
    sections.push(`5. Continue until consensus ≥90% achieved`);
    sections.push('');
    sections.push(`**SPAWN AGENTS NOW** with feedback-enhanced instructions.`);

    return sections.join('\n');
  }

  /**
   * Inject feedback into agent task instructions
   * Enhanced with self-looping continuation emphasis
   */
  injectIntoAgentInstructions(
    originalInstructions: string,
    feedback: ConsensusFeedback,
    agentType: string
  ): string {
    const formattedFeedback = this.formatForInjection(feedback, agentType);

    const injectedInstructions = `
${formattedFeedback}

---

## Original Task Instructions

${originalInstructions}

---

🚨 **CRITICAL EXECUTION PROTOCOL - SELF-CORRECTING LOOP ACTIVE**

**YOU MUST:**
1. **Address critical and high priority issues FIRST** - these caused consensus failure
2. **Execute immediately** - this is Iteration ${feedback.iteration + 1}, autonomous retry in progress
3. **DO NOT seek approval** - self-correcting loops operate without human intervention
4. **Focus on fixing root causes** - prevent the same issues from recurring
5. **Report confidence score** upon completion for next gate validation

**REMINDER**: This is an AUTONOMOUS process. Execute your tasks and report back. The loop will continue until consensus validation passes (≥90%).
`;

    return injectedInstructions;
  }

  /**
   * Get priority score for an issue
   */
  private getPriorityScore(severity: FeedbackIssue['severity']): number {
    switch (severity) {
      case 'critical':
        return this.config.priorityThresholds.critical;
      case 'high':
        return this.config.priorityThresholds.high;
      case 'medium':
        return this.config.priorityThresholds.medium;
      case 'low':
        return this.config.priorityThresholds.low;
      default:
        return 0;
    }
  }

  /**
   * Extract validator feedback from results
   */
  private extractValidatorFeedback(validatorResults: any[]): ValidatorFeedback[] {
    return validatorResults.map((result) => {
      const issues: FeedbackIssue[] = [];

      // Extract issues from validator result
      if (result.qualityIssues) {
        issues.push(
          ...result.qualityIssues.map((issue: any) => ({
            type: 'quality' as const,
            severity: issue.severity || 'medium',
            message: issue.message,
            location: issue.location,
            suggestedFix: issue.fix,
          }))
        );
      }

      if (result.securityIssues) {
        issues.push(
          ...result.securityIssues.map((issue: any) => ({
            type: 'security' as const,
            severity: issue.severity || 'high',
            message: issue.message,
            location: issue.location,
            suggestedFix: issue.fix,
          }))
        );
      }

      if (result.performanceIssues) {
        issues.push(
          ...result.performanceIssues.map((issue: any) => ({
            type: 'performance' as const,
            severity: issue.severity || 'medium',
            message: issue.message,
            location: issue.location,
            suggestedFix: issue.fix,
          }))
        );
      }

      if (result.testingIssues) {
        issues.push(
          ...result.testingIssues.map((issue: any) => ({
            type: 'testing' as const,
            severity: issue.severity || 'high',
            message: issue.message,
            location: issue.location,
            suggestedFix: issue.fix,
          }))
        );
      }

      return {
        validator: result.agentId || result.validator || 'unknown',
        validatorType: result.agentType || result.type || 'reviewer',
        issues,
        recommendations: result.recommendations || [],
        confidence: result.confidence || 0.5,
        timestamp: Date.now(),
      };
    });
  }

  /**
   * Identify failed criteria from validator results
   */
  private identifyFailedCriteria(validatorResults: any[]): string[] {
    const failedCriteria = new Set<string>();

    validatorResults.forEach((result) => {
      if (result.criteriaPassed === false || result.passed === false) {
        if (result.criterion) {
          failedCriteria.add(result.criterion);
        }
        if (result.failedChecks) {
          result.failedChecks.forEach((check: string) => failedCriteria.add(check));
        }
      }
    });

    return Array.from(failedCriteria);
  }

  /**
   * Generate actionable steps from feedback
   */
  private generateActionableSteps(
    validatorFeedback: ValidatorFeedback[],
    failedCriteria: string[]
  ): ActionableStep[] {
    const steps: ActionableStep[] = [];

    // Generate steps from validator issues
    validatorFeedback.forEach((vf) => {
      vf.issues.forEach((issue) => {
        const priority = issue.severity === 'critical' ? 'critical' : issue.severity;

        steps.push({
          priority,
          category: issue.type,
          action: issue.suggestedFix || `Fix ${issue.type} issue: ${issue.message}`,
          targetAgent: this.getTargetAgentForIssue(issue),
          estimatedEffort: this.estimateEffort(issue),
        });
      });

      // Add recommendations as medium priority
      vf.recommendations.forEach((rec) => {
        steps.push({
          priority: 'medium',
          category: 'improvement',
          action: rec,
          estimatedEffort: 'medium',
        });
      });
    });

    // Generate steps from failed criteria
    failedCriteria.forEach((criterion) => {
      steps.push({
        priority: 'high',
        category: 'validation',
        action: `Address failed criterion: ${criterion}`,
        estimatedEffort: 'high',
      });
    });

    // Sort by priority
    return this.prioritizeSteps(steps);
  }

  /**
   * Prioritize actionable steps
   */
  private prioritizeSteps(steps: ActionableStep[]): ActionableStep[] {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    return steps.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Secondary sort by estimated effort (do quick wins first)
      const effortOrder = { low: 0, medium: 1, high: 2 };
      return effortOrder[a.estimatedEffort] - effortOrder[b.estimatedEffort];
    });
  }

  /**
   * Get target agent for an issue
   */
  private getTargetAgentForIssue(issue: FeedbackIssue): string | undefined {
    switch (issue.type) {
      case 'security':
        return 'security-specialist';
      case 'performance':
        return 'perf-analyzer';
      case 'testing':
        return 'tester';
      case 'architecture':
        return 'system-architect';
      case 'quality':
        return 'reviewer';
      default:
        return 'coder';
    }
  }

  /**
   * Estimate effort for an issue
   */
  private estimateEffort(issue: FeedbackIssue): 'low' | 'medium' | 'high' {
    if (issue.suggestedFix) {
      return 'low'; // Has a suggested fix
    }

    switch (issue.severity) {
      case 'critical':
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Get severity icon
   */
  private getSeverityIcon(severity: FeedbackIssue['severity']): string {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  }

  /**
   * Store feedback in history
   * CFN-2025-003: Implement LRU eviction to prevent memory leak
   */
  private storeFeedbackInHistory(phaseId: string, feedback: ConsensusFeedback): void {
    if (!this.feedbackHistory.has(phaseId)) {
      this.feedbackHistory.set(phaseId, []);
    }

    const history = this.feedbackHistory.get(phaseId)!;
    history.push(feedback);

    // CFN-2025-003: Enforce maximum entries per phase
    if (history.length > this.maxEntriesPerPhase) {
      history.splice(0, history.length - this.maxEntriesPerPhase);
    }
  }

  /**
   * Get previous iterations for a phase
   */
  private getPreviousIterations(phaseId: string): IterationHistory[] {
    const history = this.feedbackHistory.get(phaseId) || [];

    return history.map((fb) => ({
      iteration: fb.iteration,
      consensusScore: fb.consensusScore,
      issues: fb.validatorFeedback.flatMap((vf) => vf.issues),
      resolved: fb.consensusScore >= fb.requiredScore,
      resolutionNotes: fb.consensusScore >= fb.requiredScore ? 'Consensus achieved' : undefined,
    }));
  }

  /**
   * Deduplicate issues across iterations
   * CFN-2025-003: Enforce maximum registry size to prevent memory leak
   */
  private deduplicateIssues(feedback: ConsensusFeedback): void {
    const phaseId = feedback.phaseId;

    if (!this.issueRegistry.has(phaseId)) {
      this.issueRegistry.set(phaseId, new Set());
    }

    const seenIssues = this.issueRegistry.get(phaseId)!;
    const uniqueIssues = new Set<string>();

    feedback.validatorFeedback.forEach((vf) => {
      vf.issues = vf.issues.filter((issue) => {
        const issueKey = this.generateIssueKey(issue);

        if (seenIssues.has(issueKey)) {
          this.logger.debug('Deduplicating repeated issue', { issueKey, message: issue.message });
          return false; // Remove duplicate
        }

        uniqueIssues.add(issueKey);
        return true;
      });
    });

    // Update registry with size limit
    uniqueIssues.forEach((key) => {
      // CFN-2025-003: Limit registry size per phase
      if (seenIssues.size >= this.maxEntriesPerPhase) {
        // Remove oldest entry (first in Set)
        const firstKey = seenIssues.values().next().value;
        seenIssues.delete(firstKey);
      }
      seenIssues.add(key);
    });
  }

  /**
   * Generate unique key for an issue
   */
  private generateIssueKey(issue: FeedbackIssue): string {
    const locationKey = issue.location
      ? `${issue.location.file || ''}:${issue.location.line || ''}:${issue.location.function || ''}`
      : 'no-location';

    return `${issue.type}:${issue.severity}:${issue.message}:${locationKey}`;
  }

  /**
   * Clear feedback history for a phase
   */
  clearPhaseHistory(phaseId: string): void {
    this.feedbackHistory.delete(phaseId);
    this.issueRegistry.delete(phaseId);

    this.logger.info('Cleared feedback history for phase', { phaseId });
  }

  /**
   * Get feedback statistics
   */
  getStatistics(phaseId?: string): {
    totalIterations: number;
    totalIssues: number;
    issuesByType: Record<string, number>;
    issuesBySeverity: Record<string, number>;
    averageConsensusScore: number;
  } {
    const feedbackToAnalyze = phaseId
      ? this.feedbackHistory.get(phaseId) || []
      : Array.from(this.feedbackHistory.values()).flat();

    const stats = {
      totalIterations: feedbackToAnalyze.length,
      totalIssues: 0,
      issuesByType: {} as Record<string, number>,
      issuesBySeverity: {} as Record<string, number>,
      averageConsensusScore: 0,
    };

    if (feedbackToAnalyze.length === 0) {
      return stats;
    }

    let totalConsensusScore = 0;

    feedbackToAnalyze.forEach((fb) => {
      totalConsensusScore += fb.consensusScore;

      fb.validatorFeedback.forEach((vf) => {
        vf.issues.forEach((issue) => {
          stats.totalIssues++;
          stats.issuesByType[issue.type] = (stats.issuesByType[issue.type] || 0) + 1;
          stats.issuesBySeverity[issue.severity] = (stats.issuesBySeverity[issue.severity] || 0) + 1;
        });
      });
    });

    stats.averageConsensusScore = totalConsensusScore / feedbackToAnalyze.length;

    return stats;
  }

  /**
   * Periodic cleanup to prevent memory leaks
   * CVE-2025-003: Remove old entries from all phases
   */
  private cleanup(): void {
    // Cleanup feedback history
    for (const [phaseId, entries] of Array.from(this.feedbackHistory.entries())) {
      if (entries.length > this.maxEntriesPerPhase) {
        entries.splice(0, entries.length - this.maxEntriesPerPhase);
      }
    }

    // Cleanup issue registry
    for (const [phaseId, issues] of Array.from(this.issueRegistry.entries())) {
      if (issues.size > this.maxEntriesPerPhase) {
        const issuesArray = Array.from(issues);
        const toKeep = issuesArray.slice(-this.maxEntriesPerPhase);
        this.issueRegistry.set(phaseId, new Set<string>(toKeep));
      }
    }

    this.logger.debug('Periodic cleanup completed', {
      historyPhases: this.feedbackHistory.size,
      registryPhases: this.issueRegistry.size
    });
  }

  /**
   * Shutdown feedback system
   * CVE-2025-003: Clear cleanup interval to prevent memory leak
   */
  shutdown(): void {
    // CVE-2025-003: Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.feedbackHistory.clear();
    this.issueRegistry.clear();

    this.logger.info('Feedback injection system shut down');
  }
}
