/**
 * Enterprise Product Owner Team
 * 4-person stakeholder board with weighted voting
 */

import { Logger } from '../../core/logger.js';
import type {
  POConfig,
  PODecision,
  TeamDecisionResult,
  GOAPState,
  TeamVote,
  ProductOwner,
} from './types.js';
import type { StakeholderVote } from '../modes/types.js';

/**
 * Enterprise Product Owner Team: 4 stakeholders with weighted voting
 * - CTO: 35% weight (technical feasibility)
 * - Product Owner: 30% weight (business value)
 * - Power User: 20% weight (usability)
 * - Accessibility User: 15% weight (inclusive design)
 */
export class EnterpriseOwnerTeam implements ProductOwner {
  private logger: Logger;
  private config: POConfig;
  private stakeholderWeights: Record<string, number>;

  constructor(memoryManager?: unknown) {
    this.config = {
      structure: 'team',
      decisionAlgorithm: 'weighted-voting',
      confidenceThreshold: 0.85,
    };

    this.stakeholderWeights = {
      cto: 0.35,
      'product-owner': 0.30,
      'user-power': 0.20,
      'user-accessibility': 0.15,
    };

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'EnterpriseOwnerTeam' });
  }

  /**
   * Make team decision using weighted voting
   */
  async makeDecision(state: GOAPState): Promise<TeamDecisionResult> {
    this.logger.info('Enterprise Owner Team convening', {
      confidence: state.currentConfidence,
      consensusScore: state.consensusScore,
      blockers: state.blockers.length,
    });

    // Gather stakeholder votes
    const votes = await this.gatherStakeholderVotes(state);

    // Calculate weighted decision
    const decision = this.calculateWeightedDecision(votes);
    const weightedScore = this.calculateWeightedScore(votes, decision);
    const boardConsensus = this.calculateBoardConsensus(votes);

    // Generate reasoning and recommendations
    const reasoning = this.generateTeamReasoning(votes, decision, state);
    const backlogItems = this.categorizeBacklog(state);
    const blockers = state.blockers;
    const recommendations = this.generateTeamRecommendations(votes, state);
    const minorityOpinions = this.extractMinorityOpinions(votes, decision);

    const result: TeamDecisionResult = {
      decision,
      confidence: state.currentConfidence,
      reasoning,
      backlogItems,
      blockers,
      recommendations,
      timestamp: Date.now(),
      votes,
      weightedScore,
      boardConsensus,
      minorityOpinions,
    };

    this.logger.info('Enterprise Owner Team decision complete', {
      decision,
      weightedScore,
      boardConsensus,
    });

    return result;
  }

  /**
   * Gather votes from all stakeholders
   */
  private async gatherStakeholderVotes(state: GOAPState): Promise<TeamVote[]> {
    const votes: TeamVote[] = [];

    // CTO vote (technical feasibility)
    votes.push(this.getCTOVote(state));

    // Product Owner vote (business value)
    votes.push(this.getProductOwnerVote(state));

    // Power User vote (usability)
    votes.push(this.getPowerUserVote(state));

    // Accessibility User vote (inclusive design)
    votes.push(this.getAccessibilityUserVote(state));

    return votes;
  }

  /**
   * CTO vote based on technical feasibility
   */
  private getCTOVote(state: GOAPState): TeamVote {
    let vote: PODecision = 'PROCEED';
    let confidence = state.currentConfidence;
    let reasoning = '';

    if (state.riskLevel === 'high' || state.blockers.length > 3) {
      vote = 'LOOP';
      reasoning = `Technical risk level ${state.riskLevel}, ${state.blockers.length} blockers`;
    } else if (state.consensusScore >= 0.90) {
      vote = 'PROCEED';
      reasoning = `Strong technical consensus ${(state.consensusScore * 100).toFixed(1)}%`;
    } else {
      vote = 'LOOP';
      reasoning = `Consensus ${(state.consensusScore * 100).toFixed(1)}% needs improvement`;
    }

    return {
      stakeholder: 'cto',
      vote,
      confidence,
      weight: this.stakeholderWeights.cto,
      reasoning,
    };
  }

  /**
   * Product Owner vote based on business value
   */
  private getProductOwnerVote(state: GOAPState): TeamVote {
    let vote: PODecision = 'PROCEED';
    let confidence = state.currentConfidence;
    let reasoning = '';

    const completionRate =
      state.completedTasks.length / (state.completedTasks.length + state.remainingTasks.length);

    if (completionRate >= 0.80 && state.blockers.length === 0) {
      vote = 'PROCEED';
      reasoning = `${(completionRate * 100).toFixed(1)}% completion, ready for release`;
    } else if (state.remainingTasks.length > 10) {
      vote = 'DEFER';
      reasoning = `Too many remaining tasks (${state.remainingTasks.length})`;
    } else {
      vote = 'LOOP';
      reasoning = `${state.remainingTasks.length} tasks remaining`;
    }

    return {
      stakeholder: 'product-owner',
      vote,
      confidence,
      weight: this.stakeholderWeights['product-owner'],
      reasoning,
    };
  }

  /**
   * Power User vote based on usability
   */
  private getPowerUserVote(state: GOAPState): TeamVote {
    let vote: PODecision = 'PROCEED';
    let confidence = state.currentConfidence;
    let reasoning = '';

    // Power users prioritize feature completeness
    if (state.remainingTasks.length === 0 && state.currentConfidence >= 0.85) {
      vote = 'PROCEED';
      reasoning = 'All features complete, high quality';
    } else if (state.blockers.some((b) => b.includes('usability'))) {
      vote = 'LOOP';
      reasoning = 'Usability blockers need resolution';
    } else {
      vote = 'LOOP';
      reasoning = 'Additional iteration for feature polish';
    }

    return {
      stakeholder: 'user-power',
      vote,
      confidence,
      weight: this.stakeholderWeights['user-power'],
      reasoning,
    };
  }

  /**
   * Accessibility User vote based on inclusive design
   */
  private getAccessibilityUserVote(state: GOAPState): TeamVote {
    let vote: PODecision = 'PROCEED';
    let confidence = state.currentConfidence;
    let reasoning = '';

    // Accessibility users prioritize inclusive design
    const hasA11yBlockers = state.blockers.some(
      (b) => b.includes('accessibility') || b.includes('a11y')
    );

    if (hasA11yBlockers) {
      vote = 'LOOP';
      reasoning = 'Accessibility blockers must be resolved';
    } else if (state.currentConfidence >= 0.85) {
      vote = 'PROCEED';
      reasoning = 'Accessibility requirements met';
    } else {
      vote = 'LOOP';
      reasoning = 'Accessibility validation needed';
    }

    return {
      stakeholder: 'user-accessibility',
      vote,
      confidence,
      weight: this.stakeholderWeights['user-accessibility'],
      reasoning,
    };
  }

  /**
   * Calculate weighted decision from votes
   */
  private calculateWeightedDecision(votes: TeamVote[]): PODecision {
    const decisionScores: Record<PODecision, number> = {
      PROCEED: 0,
      LOOP: 0,
      DEFER: 0,
      ESCALATE: 0,
    };

    votes.forEach((vote) => {
      decisionScores[vote.vote] += vote.weight * vote.confidence;
    });

    // Find decision with highest weighted score
    let maxScore = 0;
    let decision: PODecision = 'LOOP';

    (Object.keys(decisionScores) as PODecision[]).forEach((d) => {
      if (decisionScores[d] > maxScore) {
        maxScore = decisionScores[d];
        decision = d;
      }
    });

    return decision;
  }

  /**
   * Calculate weighted score for decision
   */
  private calculateWeightedScore(votes: TeamVote[], decision: PODecision): number {
    let score = 0;
    votes.forEach((vote) => {
      if (vote.vote === decision) {
        score += vote.weight * vote.confidence;
      }
    });
    return score;
  }

  /**
   * Calculate board consensus level
   */
  private calculateBoardConsensus(votes: TeamVote[]): number {
    const decisions = votes.map((v) => v.vote);
    const uniqueDecisions = new Set(decisions);

    // Perfect consensus if all agree
    if (uniqueDecisions.size === 1) {
      return 1.0;
    }

    // Calculate based on weighted agreement
    const majorityDecision = this.calculateWeightedDecision(votes);
    const majorityWeight = votes
      .filter((v) => v.vote === majorityDecision)
      .reduce((sum, v) => sum + v.weight, 0);

    return majorityWeight;
  }

  /**
   * Generate team reasoning
   */
  private generateTeamReasoning(
    votes: TeamVote[],
    decision: PODecision,
    state: GOAPState
  ): string {
    const reasons: string[] = [];

    reasons.push(`Board decision: ${decision}`);

    votes.forEach((vote) => {
      if (vote.vote === decision) {
        reasons.push(`${vote.stakeholder}: ${vote.reasoning}`);
      }
    });

    return reasons.join('. ');
  }

  /**
   * Generate team recommendations
   */
  private generateTeamRecommendations(votes: TeamVote[], state: GOAPState): string[] {
    const recommendations: string[] = [];

    // Collect unique concerns from all stakeholders
    votes.forEach((vote) => {
      if (vote.vote === 'LOOP' || vote.vote === 'DEFER') {
        recommendations.push(`${vote.stakeholder}: ${vote.reasoning}`);
      }
    });

    if (state.riskLevel === 'high') {
      recommendations.push('Address high-risk items before proceeding');
    }

    return recommendations;
  }

  /**
   * Extract minority opinions for transparency
   */
  private extractMinorityOpinions(votes: TeamVote[], decision: PODecision): string[] {
    return votes
      .filter((v) => v.vote !== decision)
      .map((v) => `${v.stakeholder}: ${v.vote} - ${v.reasoning}`);
  }

  /**
   * Categorize backlog items
   */
  private categorizeBacklog(state: GOAPState): string[] {
    return state.remainingTasks.filter((task) => !state.completedTasks.includes(task));
  }

  /**
   * Get configuration
   */
  getConfig(): POConfig {
    return { ...this.config };
  }
}

export default EnterpriseOwnerTeam;
