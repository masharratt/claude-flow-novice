/**
 * @file RetryTodoManager - Self-Executing Continuation Prompts for CFN Loop
 * @description Generates aggressive retry todos with self-looping prompts that Claude executes immediately
 *
 * This system creates continuation prompts that:
 * - Trigger IMMEDIATE relaunch of failed Loop 2/3 iterations
 * - Include complete context and feedback
 * - Route feedback to specific agent types
 * - Contain executable instructions (no human approval needed)
 * - Cancel automatically on success
 *
 * @module cfn-loop/retry-todo-manager
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import type { ConsensusFeedback, ActionableStep, ValidatorFeedback } from './feedback-injection-system.js';
import type { ConsensusResult } from './cfn-loop-orchestrator.js';

// ===== TYPE DEFINITIONS =====

export interface ContinuationPrompt {
  urgency: 'IMMEDIATE';
  action: 'RELAUNCH_LOOP_2' | 'RETRY_CONSENSUS' | 'ESCALATE';
  instruction: string; // Full prompt for Claude to execute
  context: {
    iteration: number;
    maxIterations: number;
    feedback: ConsensusFeedback | ConsensusResult;
    targetAgents: string[];
    phaseId: string;
    swarmId?: string;
  };
  selfLooping: true;
  timestamp: number;
}

export interface RetryTodo {
  id: string;
  type: 'loop2_retry' | 'loop3_retry' | 'consensus_retry';
  status: 'pending' | 'executing' | 'completed' | 'cancelled';
  continuationPrompt: ContinuationPrompt;
  createdAt: number;
  updatedAt: number;
  cancelledReason?: string;
}

export interface RetryTodoManagerConfig {
  maxIterations: number;
  enableAutoExecution: boolean;
  todoNamespace: string;
  agentMapping?: Record<string, string[]>; // Map issue types to agent types
}

// ===== RETRY TODO MANAGER =====

export class RetryTodoManager extends EventEmitter {
  private logger: Logger;
  private config: Required<RetryTodoManagerConfig>;
  private activeTodos: Map<string, RetryTodo> = new Map();
  private todoHistory: RetryTodo[] = [];
  private maxHistorySize = 100;

  constructor(config: Partial<RetryTodoManagerConfig> = {}) {
    super();

    this.config = {
      maxIterations: config.maxIterations || 10,
      enableAutoExecution: config.enableAutoExecution ?? true,
      todoNamespace: config.todoNamespace || 'cfn-loop/retry-todos',
      agentMapping: config.agentMapping || this.getDefaultAgentMapping(),
    };

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'RetryTodoManager' });

    this.logger.info('RetryTodoManager initialized', {
      maxIterations: this.config.maxIterations,
      autoExecution: this.config.enableAutoExecution,
    });
  }

  /**
   * Create retry todo for Loop 2 (primary swarm) failure
   */
  createLoop2RetryTodo(feedback: ConsensusFeedback, iteration: number): RetryTodo {
    this.logger.info('Creating Loop 2 retry todo', {
      iteration,
      maxIterations: this.config.maxIterations,
      criticalIssues: feedback.actionableSteps.filter(s => s.priority === 'critical').length,
    });

    const continuationPrompt = this.generateLoop2ContinuationPrompt(feedback, iteration);

    const todo: RetryTodo = {
      id: `loop2-retry-${feedback.phaseId}-${iteration}-${Date.now()}`,
      type: 'loop2_retry',
      status: 'pending',
      continuationPrompt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.activeTodos.set(todo.id, todo);
    this.emit('todo:created', todo);

    return todo;
  }

  /**
   * Create retry todo for Loop 3 (consensus validation) failure
   */
  createLoop3RetryTodo(consensusResult: ConsensusResult, iteration: number): RetryTodo {
    this.logger.info('Creating Loop 3 retry todo', {
      iteration,
      consensusScore: consensusResult.consensusScore,
      required: consensusResult.consensusThreshold,
    });

    const continuationPrompt = this.generateLoop3ContinuationPrompt(consensusResult, iteration);

    const todo: RetryTodo = {
      id: `loop3-retry-consensus-${iteration}-${Date.now()}`,
      type: 'consensus_retry',
      status: 'pending',
      continuationPrompt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.activeTodos.set(todo.id, todo);
    this.emit('todo:created', todo);

    return todo;
  }

  /**
   * Generate continuation prompt for Loop 2 retry (primary swarm relaunch)
   */
  private generateLoop2ContinuationPrompt(feedback: ConsensusFeedback, iteration: number): ContinuationPrompt {
    const targetAgents = this.extractTargetAgents(feedback);
    const criticalSteps = feedback.actionableSteps.filter(s => s.priority === 'critical');
    const highSteps = feedback.actionableSteps.filter(s => s.priority === 'high');

    const instruction = this.buildLoop2Instruction(feedback, iteration, targetAgents, criticalSteps, highSteps);

    return {
      urgency: 'IMMEDIATE',
      action: 'RELAUNCH_LOOP_2',
      instruction,
      context: {
        iteration,
        maxIterations: this.config.maxIterations,
        feedback,
        targetAgents,
        phaseId: feedback.phaseId,
      },
      selfLooping: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Generate continuation prompt for Loop 3 retry (consensus revalidation)
   */
  private generateLoop3ContinuationPrompt(consensusResult: ConsensusResult, iteration: number): ContinuationPrompt {
    const targetAgents = ['reviewer', 'security-specialist', 'system-architect', 'tester'];

    const instruction = this.buildLoop3Instruction(consensusResult, iteration, targetAgents);

    return {
      urgency: 'IMMEDIATE',
      action: 'RETRY_CONSENSUS',
      instruction,
      context: {
        iteration,
        maxIterations: this.config.maxIterations,
        feedback: consensusResult,
        targetAgents,
        phaseId: `consensus-${iteration}`,
      },
      selfLooping: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Build Loop 2 instruction (primary swarm relaunch)
   */
  private buildLoop2Instruction(
    feedback: ConsensusFeedback,
    iteration: number,
    targetAgents: string[],
    criticalSteps: ActionableStep[],
    highSteps: ActionableStep[]
  ): string {
    const sections: string[] = [];

    // Header with urgency
    sections.push('🔄 SELF-CORRECTING LOOP - IMMEDIATE ACTION REQUIRED\n');
    sections.push(`Consensus validation FAILED (Round ${iteration}/${this.config.maxIterations})\n`);
    sections.push(`Phase: ${feedback.phaseId}`);
    sections.push(`Consensus Score: ${(feedback.consensusScore * 100).toFixed(1)}% (Required: ${(feedback.requiredScore * 100).toFixed(1)}%)\n`);

    // Validator feedback summary
    sections.push('VALIDATOR FEEDBACK:');
    feedback.validatorFeedback.forEach(vf => {
      const criticalCount = vf.issues.filter(i => i.severity === 'critical').length;
      const highCount = vf.issues.filter(i => i.severity === 'high').length;

      if (criticalCount > 0 || highCount > 0) {
        sections.push(`• ${vf.validator}: ${criticalCount} critical, ${highCount} high priority issues`);

        // Show first critical issue
        const firstCritical = vf.issues.find(i => i.severity === 'critical');
        if (firstCritical) {
          sections.push(`  - ${firstCritical.message}`);
        }
      }
    });
    sections.push('');

    // Critical issues
    if (criticalSteps.length > 0) {
      sections.push('CRITICAL ISSUES (Must Fix Now):');
      criticalSteps.forEach((step, idx) => {
        sections.push(`${idx + 1}. [${step.category.toUpperCase()}] ${step.action}`);
        if (step.targetAgent) {
          sections.push(`   → Assign to: ${step.targetAgent}`);
        }
      });
      sections.push('');
    }

    // High priority issues
    if (highSteps.length > 0) {
      sections.push('HIGH PRIORITY ISSUES:');
      highSteps.slice(0, 3).forEach((step, idx) => {
        sections.push(`${idx + 1}. [${step.category}] ${step.action}`);
      });
      if (highSteps.length > 3) {
        sections.push(`... and ${highSteps.length - 3} more high priority issues`);
      }
      sections.push('');
    }

    // Immediate action instructions
    sections.push('IMMEDIATE ACTION:');
    sections.push('Relaunch Loop 2 (primary swarm) with the following agents:\n');

    // Generate agent-specific instructions
    const agentInstructions = this.generateAgentInstructions(feedback, targetAgents);
    agentInstructions.forEach((instruction, idx) => {
      sections.push(`${idx + 1}. ${instruction.agentType}: "${instruction.task}"`);
    });
    sections.push('');

    // Execution directive
    sections.push('DO NOT WAIT FOR APPROVAL. This is a self-correcting process.');
    sections.push('Execute the following steps NOW:\n');
    sections.push('1. Initialize swarm: mcp__claude-flow-novice__swarm_init({ topology: "mesh", maxAgents: ' + targetAgents.length + ', strategy: "balanced" })');
    sections.push('2. Spawn all agents concurrently using Task tool');
    sections.push('3. Each agent receives targeted feedback from their domain (security, quality, performance, etc.)');
    sections.push('4. Agents coordinate via SwarmMemory to prevent duplicate work');
    sections.push('5. Run enhanced post-edit hooks after EVERY file modification\n');

    sections.push(`Self-looping iteration ${iteration}/${this.config.maxIterations} in progress.`);

    return sections.join('\n');
  }

  /**
   * Build Loop 3 instruction (consensus revalidation)
   */
  private buildLoop3Instruction(
    consensusResult: ConsensusResult,
    iteration: number,
    targetAgents: string[]
  ): string {
    const sections: string[] = [];

    sections.push('🔄 CONSENSUS VALIDATION RETRY - IMMEDIATE ACTION\n');
    sections.push(`Consensus FAILED (Round ${iteration}/${this.config.maxIterations})`);
    sections.push(`Score: ${(consensusResult.consensusScore * 100).toFixed(1)}% (Required: ${(consensusResult.consensusThreshold * 100).toFixed(1)}%)\n`);

    // Voting breakdown
    sections.push('VOTING BREAKDOWN:');
    Object.entries(consensusResult.votingBreakdown).forEach(([vote, count]) => {
      sections.push(`• ${vote}: ${count} validator(s)`);
    });
    sections.push('');

    // Validator results summary
    if (consensusResult.validatorResults.length > 0) {
      sections.push('VALIDATOR CONCERNS:');
      consensusResult.validatorResults.forEach(result => {
        if (result.issues && result.issues.length > 0) {
          sections.push(`• ${result.validator}: ${result.issues.length} issue(s) found`);
        }
      });
      sections.push('');
    }

    // Action directive
    sections.push('IMMEDIATE ACTION:');
    sections.push('Retry consensus validation with enhanced scrutiny:\n');

    sections.push('1. Spawn consensus swarm (2-4 validators):');
    targetAgents.forEach((agent, idx) => {
      sections.push(`   ${idx + 1}. ${agent}: Comprehensive validation of deliverables`);
    });
    sections.push('');

    sections.push('2. Execute Byzantine consensus voting (≥90% agreement required)');
    sections.push('3. Multi-dimensional checks: quality, security, performance, tests, docs');
    sections.push('4. Report results with actionable feedback\n');

    sections.push('DO NOT WAIT. Execute consensus validation NOW.');
    sections.push(`Self-looping iteration ${iteration}/${this.config.maxIterations}.`);

    return sections.join('\n');
  }

  /**
   * Generate agent-specific instructions from feedback
   */
  private generateAgentInstructions(feedback: ConsensusFeedback, targetAgents: string[]): Array<{ agentType: string; task: string }> {
    const instructions: Array<{ agentType: string; task: string }> = [];
    const agentTasks = new Map<string, string[]>();

    // Route feedback to appropriate agents
    feedback.actionableSteps.forEach(step => {
      const targetAgent = step.targetAgent || this.inferAgentFromCategory(step.category);

      if (!agentTasks.has(targetAgent)) {
        agentTasks.set(targetAgent, []);
      }

      agentTasks.get(targetAgent)!.push(step.action);
    });

    // Build instructions for each agent
    targetAgents.forEach(agentType => {
      const tasks = agentTasks.get(agentType) || [];

      if (tasks.length > 0) {
        const taskList = tasks.slice(0, 3).join('; ');
        const suffix = tasks.length > 3 ? ` (+ ${tasks.length - 3} more)` : '';

        instructions.push({
          agentType,
          task: `${taskList}${suffix}`,
        });
      } else {
        // Generic instruction for agents without specific feedback
        instructions.push({
          agentType,
          task: this.getDefaultTaskForAgent(agentType, feedback.phaseId),
        });
      }
    });

    return instructions;
  }

  /**
   * Extract target agents from feedback
   */
  private extractTargetAgents(feedback: ConsensusFeedback): string[] {
    const agents = new Set<string>();

    // Extract from actionable steps
    feedback.actionableSteps.forEach(step => {
      if (step.targetAgent) {
        agents.add(step.targetAgent);
      } else {
        // Infer agent from category
        const inferredAgent = this.inferAgentFromCategory(step.category);
        agents.add(inferredAgent);
      }
    });

    // Extract from validator feedback
    feedback.validatorFeedback.forEach(vf => {
      vf.issues.forEach(issue => {
        const agent = this.getAgentForIssueType(issue.type);
        agents.add(agent);
      });
    });

    // Ensure minimum agent diversity
    const agentArray = Array.from(agents);
    if (agentArray.length === 0) {
      return ['coder', 'tester', 'reviewer'];
    }

    // Add tester and reviewer if not present (always needed for validation)
    if (!agentArray.includes('tester')) {
      agentArray.push('tester');
    }
    if (!agentArray.includes('reviewer')) {
      agentArray.push('reviewer');
    }

    return agentArray;
  }

  /**
   * Extract feedback specific to an agent type
   */
  extractFeedbackForAgent(feedback: ConsensusFeedback, agentType: string): string {
    const sections: string[] = [];

    sections.push(`## Feedback for ${agentType}\n`);

    // Filter actionable steps for this agent
    const relevantSteps = feedback.actionableSteps.filter(
      step => step.targetAgent === agentType || this.inferAgentFromCategory(step.category) === agentType
    );

    if (relevantSteps.length > 0) {
      sections.push('### Your Responsibilities:\n');
      relevantSteps.forEach((step, idx) => {
        const priorityEmoji = this.getPriorityEmoji(step.priority);
        sections.push(`${idx + 1}. ${priorityEmoji} [${step.category}] ${step.action}`);
        sections.push(`   Effort: ${step.estimatedEffort}\n`);
      });
    }

    // Filter validator feedback relevant to this agent
    const relevantValidatorFeedback = feedback.validatorFeedback.filter(vf => {
      return vf.issues.some(issue => this.getAgentForIssueType(issue.type) === agentType);
    });

    if (relevantValidatorFeedback.length > 0) {
      sections.push('### Validator Concerns:\n');
      relevantValidatorFeedback.forEach(vf => {
        sections.push(`**${vf.validator}** (${vf.validatorType}):`);
        vf.issues
          .filter(issue => this.getAgentForIssueType(issue.type) === agentType)
          .forEach(issue => {
            sections.push(`• [${issue.severity}] ${issue.message}`);
            if (issue.suggestedFix) {
              sections.push(`  Fix: ${issue.suggestedFix}`);
            }
          });
        sections.push('');
      });
    }

    if (relevantSteps.length === 0 && relevantValidatorFeedback.length === 0) {
      sections.push('No specific feedback for your role. Focus on general quality improvements and coordination with other agents.');
    }

    return sections.join('\n');
  }

  /**
   * Generate continuation prompt from todo
   */
  generateContinuationPrompt(todo: RetryTodo): string {
    return todo.continuationPrompt.instruction;
  }

  /**
   * Cancel retry todo (called on success)
   */
  cancelRetryTodo(todoId: string, reason: string): void {
    const todo = this.activeTodos.get(todoId);

    if (!todo) {
      this.logger.warn('Attempted to cancel non-existent todo', { todoId });
      return;
    }

    todo.status = 'cancelled';
    todo.cancelledReason = reason;
    todo.updatedAt = Date.now();

    this.activeTodos.delete(todoId);
    this.todoHistory.push(todo);

    // Enforce history size limit
    if (this.todoHistory.length > this.maxHistorySize) {
      this.todoHistory.splice(0, this.todoHistory.length - this.maxHistorySize);
    }

    this.emit('todo:cancelled', { todoId, reason });

    this.logger.info('Retry todo cancelled', { todoId, reason });
  }

  /**
   * Cancel all active todos (called on phase completion)
   */
  cancelAllTodos(reason: string = 'phase_completed'): void {
    const cancelledCount = this.activeTodos.size;

    this.activeTodos.forEach((todo, todoId) => {
      this.cancelRetryTodo(todoId, reason);
    });

    this.logger.info('All retry todos cancelled', { count: cancelledCount, reason });
  }

  /**
   * Get all active todos
   */
  getActiveTodos(): RetryTodo[] {
    return Array.from(this.activeTodos.values());
  }

  /**
   * Get todo history
   */
  getTodoHistory(): RetryTodo[] {
    return [...this.todoHistory];
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeTodos: number;
    completedTodos: number;
    cancelledTodos: number;
    totalCreated: number;
    byType: Record<string, number>;
  } {
    const stats = {
      activeTodos: this.activeTodos.size,
      completedTodos: 0,
      cancelledTodos: 0,
      totalCreated: this.activeTodos.size + this.todoHistory.length,
      byType: {} as Record<string, number>,
    };

    this.todoHistory.forEach(todo => {
      if (todo.status === 'completed') stats.completedTodos++;
      if (todo.status === 'cancelled') stats.cancelledTodos++;

      stats.byType[todo.type] = (stats.byType[todo.type] || 0) + 1;
    });

    this.activeTodos.forEach(todo => {
      stats.byType[todo.type] = (stats.byType[todo.type] || 0) + 1;
    });

    return stats;
  }

  // ===== HELPER METHODS =====

  private getDefaultAgentMapping(): Record<string, string[]> {
    return {
      security: ['security-specialist', 'coder'],
      performance: ['perf-analyzer', 'coder'],
      quality: ['reviewer', 'coder'],
      testing: ['tester', 'coder'],
      architecture: ['system-architect', 'coder'],
      documentation: ['api-docs', 'researcher'],
      improvement: ['coder', 'reviewer'],
      validation: ['reviewer', 'tester'],
    };
  }

  private inferAgentFromCategory(category: string): string {
    const mapping: Record<string, string> = {
      security: 'security-specialist',
      performance: 'perf-analyzer',
      quality: 'reviewer',
      testing: 'tester',
      architecture: 'system-architect',
      documentation: 'api-docs',
      improvement: 'coder',
      validation: 'reviewer',
    };

    return mapping[category.toLowerCase()] || 'coder';
  }

  private getAgentForIssueType(issueType: string): string {
    const mapping: Record<string, string> = {
      security: 'security-specialist',
      performance: 'perf-analyzer',
      quality: 'reviewer',
      testing: 'tester',
      architecture: 'system-architect',
      documentation: 'api-docs',
    };

    return mapping[issueType] || 'coder';
  }

  private getDefaultTaskForAgent(agentType: string, phaseId: string): string {
    const tasks: Record<string, string> = {
      coder: `Implement features for ${phaseId} with focus on code quality and maintainability`,
      tester: `Write comprehensive tests for ${phaseId} deliverables (unit, integration, edge cases)`,
      reviewer: `Review code quality, patterns, and best practices for ${phaseId}`,
      'security-specialist': `Audit security vulnerabilities, authentication, and data validation for ${phaseId}`,
      'perf-analyzer': `Analyze performance bottlenecks and optimize critical paths for ${phaseId}`,
      'system-architect': `Validate system design, scalability, and architectural patterns for ${phaseId}`,
      'api-docs': `Generate comprehensive API documentation for ${phaseId}`,
    };

    return tasks[agentType] || `Contribute to ${phaseId} deliverables`;
  }

  private getPriorityEmoji(priority: string): string {
    const emojis: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
    };

    return emojis[priority] || '⚪';
  }

  /**
   * Shutdown manager and cleanup
   */
  shutdown(): void {
    this.activeTodos.clear();
    this.todoHistory = [];
    this.removeAllListeners();

    this.logger.info('RetryTodoManager shut down');
  }
}

// ===== FACTORY FUNCTION =====

export function createRetryTodoManager(config?: Partial<RetryTodoManagerConfig>): RetryTodoManager {
  return new RetryTodoManager(config);
}

// ===== EXPORTS =====

export default RetryTodoManager;
