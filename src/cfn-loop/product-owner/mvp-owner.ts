/**
 * MVP Product Owner
 * Single product owner with GOAP decision framework
 */

import { Logger } from '../../core/logger.js';
import type {
  POConfig,
  PODecision,
  PODecisionResult,
  GOAPState,
  GOAPAction,
  ProductOwner,
} from './types.js';

/**
 * MVP Product Owner: Single decision-maker with GOAP planning
 */
export class MVPOwner implements ProductOwner {
  private logger: Logger;
  private config: POConfig;

  constructor(memoryManager?: unknown) {
    this.config = {
      structure: 'single',
      decisionAlgorithm: 'goap',
      confidenceThreshold: 0.70,
    };

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'MVPOwner' });
  }

  /**
   * Make decision using GOAP framework
   */
  async makeDecision(state: GOAPState): Promise<PODecisionResult> {
    this.logger.info('MVP Owner making decision', {
      confidence: state.currentConfidence,
      consensusScore: state.consensusScore,
      blockers: state.blockers.length,
    });

    // Define GOAP actions
    const actions = this.getGOAPActions();

    // Find best action based on current state
    const bestAction = this.selectBestAction(state, actions);
    const decision = bestAction.name;

    // Generate reasoning
    const reasoning = this.generateReasoning(state, decision);

    // Categorize items
    const backlogItems = this.categorizeBacklog(state);
    const blockers = state.blockers;
    const recommendations = this.generateRecommendations(state, decision);

    const result: PODecisionResult = {
      decision,
      confidence: state.currentConfidence,
      reasoning,
      backlogItems,
      blockers,
      recommendations,
      timestamp: Date.now(),
    };

    this.logger.info('MVP Owner decision complete', {
      decision,
      confidence: result.confidence,
    });

    return result;
  }

  /**
   * Define GOAP actions for decision-making
   */
  private getGOAPActions(): GOAPAction[] {
    return [
      {
        name: 'PROCEED',
        preconditions: { riskLevel: 'low' },
        effects: { completedTasks: [] },
        cost: 1,
      },
      {
        name: 'LOOP',
        preconditions: { riskLevel: 'medium' },
        effects: { blockers: [] },
        cost: 3,
      },
      {
        name: 'DEFER',
        preconditions: { riskLevel: 'high' },
        effects: { remainingTasks: [] },
        cost: 5,
      },
      {
        name: 'ESCALATE',
        preconditions: { riskLevel: 'high' },
        effects: { blockers: [] },
        cost: 10,
      },
    ];
  }

  /**
   * Select best action using GOAP cost analysis
   */
  private selectBestAction(state: GOAPState, actions: GOAPAction[]): GOAPAction {
    const threshold = this.config.confidenceThreshold ?? 0.70;

    // High confidence and consensus - PROCEED
    if (
      state.currentConfidence >= threshold &&
      state.consensusScore >= 0.85 &&
      state.blockers.length === 0
    ) {
      return actions.find((a) => a.name === 'PROCEED')!;
    }

    // Low blockers but needs improvement - LOOP
    if (state.currentConfidence >= 0.60 && state.blockers.length <= 2) {
      return actions.find((a) => a.name === 'LOOP')!;
    }

    // High risk or many blockers - DEFER or ESCALATE
    if (state.riskLevel === 'high' || state.blockers.length > 5) {
      return actions.find((a) => a.name === 'ESCALATE')!;
    }

    // Default to LOOP for medium confidence
    return actions.find((a) => a.name === 'LOOP')!;
  }

  /**
   * Generate decision reasoning
   */
  private generateReasoning(state: GOAPState, decision: PODecision): string {
    const reasons: string[] = [];

    if (decision === 'PROCEED') {
      reasons.push(
        `Confidence ${(state.currentConfidence * 100).toFixed(1)}% meets MVP threshold`
      );
      reasons.push(`Consensus ${(state.consensusScore * 100).toFixed(1)}% is strong`);
      if (state.blockers.length === 0) {
        reasons.push('No blockers detected');
      }
    } else if (decision === 'LOOP') {
      reasons.push(`Confidence ${(state.currentConfidence * 100).toFixed(1)}% needs improvement`);
      if (state.blockers.length > 0) {
        reasons.push(`${state.blockers.length} blockers need resolution`);
      }
    } else if (decision === 'ESCALATE') {
      reasons.push(`Risk level: ${state.riskLevel}`);
      if (state.blockers.length > 5) {
        reasons.push(`High blocker count: ${state.blockers.length}`);
      }
    }

    return reasons.join('. ');
  }

  /**
   * Categorize backlog items from remaining tasks
   */
  private categorizeBacklog(state: GOAPState): string[] {
    return state.remainingTasks.filter((task) => !state.completedTasks.includes(task));
  }

  /**
   * Generate recommendations for improvement
   */
  private generateRecommendations(state: GOAPState, decision: PODecision): string[] {
    const recommendations: string[] = [];

    if (decision === 'LOOP') {
      if (state.currentConfidence < 0.70) {
        recommendations.push('Improve agent confidence through better task definition');
      }
      if (state.blockers.length > 0) {
        recommendations.push('Address blockers before next iteration');
      }
    }

    if (state.riskLevel === 'high') {
      recommendations.push('Consider breaking down complex tasks into smaller units');
    }

    return recommendations;
  }

  /**
   * Get configuration
   */
  getConfig(): POConfig {
    return { ...this.config };
  }
}

export default MVPOwner;
