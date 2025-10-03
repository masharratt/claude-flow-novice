/**
 * @file CFN Loop Integrator
 * @description Integrates feedback injection system with CFN loop and consensus validation
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import { FeedbackInjectionSystem, ConsensusFeedback } from './feedback-injection-system.js';
import { FeedbackMemoryManager } from './feedback-memory-manager.js';

export interface CFNLoopConfig {
  maxIterations: number;
  consensusThreshold: number;
  enableFeedbackInjection: boolean;
  autoRelaunch: boolean;
  escalationThreshold: number;
}

export interface SwarmExecutionContext {
  phaseId: string;
  iteration: number;
  agents: AgentConfig[];
  primaryTaskInstructions: string;
  topology: 'mesh' | 'hierarchical';
  maxAgents: number;
}

export interface AgentConfig {
  agentId: string;
  agentType: string;
  role: 'primary' | 'validator';
  instructions: string;
}

export interface ConsensusValidationResult {
  consensusAchieved: boolean;
  consensusScore: number;
  requiredScore: number;
  validatorResults: any[];
  criticalIssues: number;
  highIssues: number;
}

export interface CFNLoopState {
  phaseId: string;
  currentIteration: number;
  maxIterationsReached: boolean;
  consensusAchieved: boolean;
  selfValidationPassed: boolean;
  feedbackInjected: boolean;
  escalationRequired: boolean;
  nextSteps: string[];
}

export class CFNLoopIntegrator extends EventEmitter {
  private logger: Logger;
  private config: CFNLoopConfig;
  private feedbackSystem: FeedbackInjectionSystem;
  private memoryManager: FeedbackMemoryManager;
  private loopStates: Map<string, CFNLoopState> = new Map();

  constructor(config?: Partial<CFNLoopConfig>) {
    super();

    this.config = {
      maxIterations: config?.maxIterations || 10,
      consensusThreshold: config?.consensusThreshold || 0.9,
      enableFeedbackInjection: config?.enableFeedbackInjection ?? true,
      autoRelaunch: config?.autoRelaunch ?? true,
      escalationThreshold: config?.escalationThreshold || 0.5,
    };

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'CFNLoopIntegrator' });

    this.feedbackSystem = new FeedbackInjectionSystem({
      maxIterations: this.config.maxIterations,
    });

    this.memoryManager = new FeedbackMemoryManager();
  }

  /**
   * Initialize CFN loop for a phase
   */
  async initializeLoop(phaseId: string): Promise<CFNLoopState> {
    const state: CFNLoopState = {
      phaseId,
      currentIteration: 1,
      maxIterationsReached: false,
      consensusAchieved: false,
      selfValidationPassed: false,
      feedbackInjected: false,
      escalationRequired: false,
      nextSteps: ['Execute primary swarm', 'Perform self-validation'],
    };

    this.loopStates.set(phaseId, state);

    this.logger.info('Initialized CFN loop', {
      phaseId,
      maxIterations: this.config.maxIterations,
      consensusThreshold: this.config.consensusThreshold,
    });

    this.emit('loop:initialized', state);

    return state;
  }

  /**
   * Process self-validation results
   */
  async processSelfValidation(
    phaseId: string,
    selfValidationScore: number
  ): Promise<{
    proceed: boolean;
    action: 'continue' | 'relaunch' | 'escalate';
    reason: string;
  }> {
    const state = this.loopStates.get(phaseId);

    if (!state) {
      throw new Error(`No CFN loop state found for phase: ${phaseId}`);
    }

    this.logger.info('Processing self-validation', {
      phaseId,
      iteration: state.currentIteration,
      score: selfValidationScore,
    });

    // Check if self-validation passed (≥75%)
    if (selfValidationScore >= 0.75) {
      state.selfValidationPassed = true;
      state.nextSteps = ['Spawn consensus validation swarm'];

      this.emit('self-validation:passed', { phaseId, score: selfValidationScore });

      return {
        proceed: true,
        action: 'continue',
        reason: 'Self-validation confidence ≥75%, proceeding to consensus validation',
      };
    }

    // Self-validation failed
    state.selfValidationPassed = false;

    // Check if we should relaunch or escalate
    if (state.currentIteration >= this.config.maxIterations) {
      state.escalationRequired = true;
      state.nextSteps = ['Escalate to human intervention'];

      this.emit('self-validation:escalate', { phaseId, score: selfValidationScore });

      return {
        proceed: false,
        action: 'escalate',
        reason: `Self-validation failed after ${state.currentIteration} iterations, escalating to human`,
      };
    }

    // Relaunch primary swarm
    state.nextSteps = ['Relaunch primary swarm with feedback'];

    this.emit('self-validation:failed', { phaseId, score: selfValidationScore });

    return {
      proceed: false,
      action: 'relaunch',
      reason: `Self-validation confidence <75% (${(selfValidationScore * 100).toFixed(1)}%), relaunching`,
    };
  }

  /**
   * Process consensus validation results
   */
  async processConsensusValidation(
    phaseId: string,
    validationResult: ConsensusValidationResult
  ): Promise<{
    consensusAchieved: boolean;
    action: 'pass' | 'relaunch' | 'escalate';
    feedback?: ConsensusFeedback;
    nextInstructions?: string;
  }> {
    const state = this.loopStates.get(phaseId);

    if (!state) {
      throw new Error(`No CFN loop state found for phase: ${phaseId}`);
    }

    this.logger.info('Processing consensus validation', {
      phaseId,
      iteration: state.currentIteration,
      consensusScore: validationResult.consensusScore,
      requiredScore: validationResult.requiredScore,
    });

    // Check if consensus achieved (≥90%)
    if (
      validationResult.consensusAchieved &&
      validationResult.consensusScore >= this.config.consensusThreshold
    ) {
      state.consensusAchieved = true;
      state.nextSteps = ['Store results in SwarmMemory', 'Update documentation', 'Move to next task'];

      this.emit('consensus:achieved', { phaseId, score: validationResult.consensusScore });

      return {
        consensusAchieved: true,
        action: 'pass',
      };
    }

    // Consensus failed
    state.consensusAchieved = false;

    // Capture feedback
    const feedback = await this.feedbackSystem.captureFeedback({
      phaseId,
      iteration: state.currentIteration,
      consensusScore: validationResult.consensusScore,
      requiredScore: validationResult.requiredScore,
      validatorResults: validationResult.validatorResults,
    });

    // Store in memory
    await this.memoryManager.storeFeedback(feedback);

    // Check if we should relaunch or escalate
    if (state.currentIteration >= this.config.maxIterations) {
      state.maxIterationsReached = true;
      state.escalationRequired = true;
      state.nextSteps = await this.generateEscalationGuidance(phaseId, feedback);

      this.emit('consensus:escalate', { phaseId, feedback });

      return {
        consensusAchieved: false,
        action: 'escalate',
        feedback,
      };
    }

    // Check if consensus score is improving
    const trends = await this.memoryManager.getFeedbackTrends(phaseId);
    if (!trends.improving && state.currentIteration >= 3) {
      // Not improving after 3 iterations, consider escalation
      if (validationResult.consensusScore < this.config.escalationThreshold) {
        state.escalationRequired = true;
        state.nextSteps = await this.generateEscalationGuidance(phaseId, feedback);

        this.emit('consensus:escalate', { phaseId, reason: 'not_improving', feedback });

        return {
          consensusAchieved: false,
          action: 'escalate',
          feedback,
        };
      }
    }

    // Relaunch with feedback injection
    if (this.config.enableFeedbackInjection) {
      state.feedbackInjected = true;
      state.currentIteration++;
      state.nextSteps = ['Inject feedback into primary swarm', 'Relaunch primary swarm'];

      this.emit('consensus:relaunch', { phaseId, iteration: state.currentIteration, feedback });

      return {
        consensusAchieved: false,
        action: 'relaunch',
        feedback,
      };
    }

    // Feedback injection disabled, just relaunch
    state.currentIteration++;
    state.nextSteps = ['Relaunch primary swarm'];

    return {
      consensusAchieved: false,
      action: 'relaunch',
    };
  }

  /**
   * Inject feedback into agent instructions
   */
  async injectFeedbackIntoSwarm(
    phaseId: string,
    swarmContext: SwarmExecutionContext
  ): Promise<SwarmExecutionContext> {
    this.logger.info('Injecting feedback into swarm', {
      phaseId,
      iteration: swarmContext.iteration,
      agentCount: swarmContext.agents.length,
    });

    // Get latest feedback
    const feedback = await this.memoryManager.getLatestFeedback(phaseId);

    if (!feedback) {
      this.logger.warn('No feedback found for phase, skipping injection', { phaseId });
      return swarmContext;
    }

    // Inject feedback into each primary agent's instructions
    const updatedAgents = swarmContext.agents.map((agent) => {
      if (agent.role === 'primary') {
        const injectedInstructions = this.feedbackSystem.injectIntoAgentInstructions(
          agent.instructions,
          feedback,
          agent.agentType
        );

        return {
          ...agent,
          instructions: injectedInstructions,
        };
      }

      return agent;
    });

    this.emit('feedback:injected', {
      phaseId,
      iteration: swarmContext.iteration,
      agentCount: updatedAgents.length,
    });

    return {
      ...swarmContext,
      agents: updatedAgents,
    };
  }

  /**
   * Get current loop state
   */
  getLoopState(phaseId: string): CFNLoopState | null {
    return this.loopStates.get(phaseId) || null;
  }

  /**
   * Generate escalation guidance
   */
  private async generateEscalationGuidance(
    phaseId: string,
    feedback: ConsensusFeedback
  ): Promise<string[]> {
    const guidance: string[] = [];

    guidance.push('Escalate to human intervention with the following context:');

    // Add critical issues
    const criticalSteps = feedback.actionableSteps.filter((s) => s.priority === 'critical');
    if (criticalSteps.length > 0) {
      guidance.push(`- ${criticalSteps.length} critical issues require manual resolution`);
    }

    // Add consensus trend
    const trends = await this.memoryManager.getFeedbackTrends(phaseId);
    if (trends.improving) {
      guidance.push('- Progress was made but consensus not reached - consider extending iterations');
    } else {
      guidance.push('- No improvement detected - fundamental approach may need revision');
    }

    // Add accumulated issues
    const accumulated = await this.memoryManager.getAccumulatedIssues(phaseId);
    if (accumulated.recurring.length > 0) {
      guidance.push(`- ${accumulated.recurring.length} recurring issues suggest systematic problems`);
    }

    // Add recommendation
    if (feedback.consensusScore < 0.5) {
      guidance.push('- Recommendation: Complete redesign or alternative approach needed');
    } else if (feedback.consensusScore < 0.75) {
      guidance.push('- Recommendation: Partial rework with focus on failed criteria');
    } else {
      guidance.push('- Recommendation: Minor adjustments needed, consider manual review');
    }

    return guidance;
  }

  /**
   * Generate comprehensive next steps
   */
  async generateNextSteps(phaseId: string): Promise<{
    completed: string[];
    validationResults: {
      selfValidation: boolean;
      consensusValidation: boolean;
    };
    identifiedIssues: string[];
    recommendedNextSteps: string[];
  }> {
    const state = this.loopStates.get(phaseId);

    if (!state) {
      throw new Error(`No CFN loop state found for phase: ${phaseId}`);
    }

    const completed: string[] = [];
    const identifiedIssues: string[] = [];
    const recommendedNextSteps: string[] = [];

    // What was completed
    if (state.currentIteration > 1) {
      completed.push(
        `Executed ${state.currentIteration - 1} iteration(s) of CFN loop`
      );
    }

    if (state.selfValidationPassed) {
      completed.push('Self-validation passed with confidence ≥75%');
    }

    if (state.consensusAchieved) {
      completed.push('Byzantine consensus validation achieved (≥90% agreement)');
    }

    if (state.feedbackInjected) {
      completed.push('Feedback injected into agent instructions');
    }

    // Validation results
    const validationResults = {
      selfValidation: state.selfValidationPassed,
      consensusValidation: state.consensusAchieved,
    };

    // Identified issues
    const latestFeedback = await this.memoryManager.getLatestFeedback(phaseId);
    if (latestFeedback) {
      const criticalCount = latestFeedback.actionableSteps.filter(
        (s) => s.priority === 'critical'
      ).length;
      const highCount = latestFeedback.actionableSteps.filter((s) => s.priority === 'high').length;

      if (criticalCount > 0) {
        identifiedIssues.push(`${criticalCount} critical issue(s) identified`);
      }
      if (highCount > 0) {
        identifiedIssues.push(`${highCount} high priority issue(s) identified`);
      }

      latestFeedback.failedCriteria.forEach((criterion) => {
        identifiedIssues.push(`Failed criterion: ${criterion}`);
      });
    }

    // Recommended next steps
    if (state.escalationRequired) {
      recommendedNextSteps.push(...(await this.generateEscalationGuidance(phaseId, latestFeedback!)));
    } else if (state.consensusAchieved) {
      recommendedNextSteps.push('Store results in SwarmMemory with memory_store MCP tool');
      recommendedNextSteps.push('Update task status to completed');
      recommendedNextSteps.push('Proceed to next phase or task');
    } else {
      recommendedNextSteps.push(`Continue CFN loop (iteration ${state.currentIteration + 1}/${this.config.maxIterations})`);
      recommendedNextSteps.push('Address critical and high priority issues first');
      recommendedNextSteps.push('Re-run consensus validation to verify improvements');
    }

    return {
      completed,
      validationResults,
      identifiedIssues,
      recommendedNextSteps,
    };
  }

  /**
   * Reset loop state for a phase
   */
  resetLoop(phaseId: string): void {
    this.loopStates.delete(phaseId);
    this.memoryManager.clearPhase(phaseId);
    this.feedbackSystem.clearPhaseHistory(phaseId);

    this.logger.info('Reset CFN loop state', { phaseId });

    this.emit('loop:reset', { phaseId });
  }

  /**
   * Get statistics for all loops
   */
  getStatistics(): {
    totalPhases: number;
    activePhases: number;
    completedPhases: number;
    escalatedPhases: number;
    averageIterations: number;
    memoryStatistics: any;
  } {
    const states = Array.from(this.loopStates.values());

    const activePhases = states.filter((s) => !s.consensusAchieved && !s.escalationRequired).length;
    const completedPhases = states.filter((s) => s.consensusAchieved).length;
    const escalatedPhases = states.filter((s) => s.escalationRequired).length;

    const totalIterations = states.reduce((sum, s) => sum + s.currentIteration, 0);
    const averageIterations = states.length > 0 ? totalIterations / states.length : 0;

    return {
      totalPhases: states.length,
      activePhases,
      completedPhases,
      escalatedPhases,
      averageIterations,
      memoryStatistics: this.memoryManager.getStatistics(),
    };
  }

  /**
   * Shutdown integrator
   */
  shutdown(): void {
    this.loopStates.clear();
    this.feedbackSystem.shutdown();
    this.memoryManager.shutdown();

    this.logger.info('CFN loop integrator shut down');
  }
}
