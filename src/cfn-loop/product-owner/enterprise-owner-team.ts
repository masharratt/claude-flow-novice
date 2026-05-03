import type { GOAPState, TeamDecisionResult, StakeholderVote, Decision, OwnerConfig } from './types.js';

export class EnterpriseOwnerTeam {
  getConfig(): OwnerConfig {
    return {
      structure: 'team',
      decisionAlgorithm: 'weighted-voting',
      confidenceThreshold: 0.85,
    };
  }

  async makeDecision(state: GOAPState): Promise<TeamDecisionResult> {
    const votes = this.collectVotes(state);
    const finalDecision = this.weightedMajority(votes);
    const boardConsensus = votes.filter((v) => v.vote === finalDecision).length / votes.length;
    const weightedScore = votes
      .filter((v) => v.vote === finalDecision)
      .reduce((sum, v) => sum + v.weight, 0);
    const minorityOpinions = votes
      .filter((v) => v.vote !== finalDecision)
      .map((v) => `${v.stakeholder}: ${v.reasoning} - ${v.vote}`);

    const recommendations: string[] = [];
    if (state.riskLevel === 'high' || finalDecision === 'LOOP') {
      recommendations.push('Address high-risk issues before proceeding to next phase');
    }

    const reasoning = this.buildReasoning(state, votes, finalDecision);

    return {
      decision: finalDecision,
      confidence: state.currentConfidence,
      reasoning,
      recommendations,
      blockers: state.blockers,
      backlogItems: state.remainingTasks,
      timestamp: Date.now(),
      votes,
      boardConsensus,
      weightedScore,
      minorityOpinions,
    };
  }

  private collectVotes(state: GOAPState): StakeholderVote[] {
    return [
      this.ctoVote(state),
      this.productOwnerVote(state),
      this.powerUserVote(state),
      this.accessibilityUserVote(state),
    ];
  }

  private ctoVote(state: GOAPState): StakeholderVote {
    const triggered = state.riskLevel === 'high' || state.blockers.length >= 4;
    if (triggered) {
      return {
        stakeholder: 'cto',
        vote: 'LOOP',
        weight: 0.35,
        reasoning: 'Technical risk or blocker count requires another iteration',
      };
    }
    return {
      stakeholder: 'cto',
      vote: 'PROCEED',
      weight: 0.35,
      reasoning: 'Technical metrics within acceptable range',
    };
  }

  private productOwnerVote(state: GOAPState): StakeholderVote {
    if (state.remainingTasks.length >= 10) {
      return {
        stakeholder: 'product-owner',
        vote: 'DEFER',
        weight: 0.30,
        reasoning: 'Too many remaining tasks to ship now',
      };
    }
    return {
      stakeholder: 'product-owner',
      vote: 'PROCEED',
      weight: 0.30,
      reasoning: 'Backlog is manageable for release',
    };
  }

  private powerUserVote(state: GOAPState): StakeholderVote {
    const hasUsabilityIssue = state.blockers.some((b) => b.includes('usability'));
    if (hasUsabilityIssue) {
      return {
        stakeholder: 'user-power',
        vote: 'LOOP',
        weight: 0.20,
        reasoning: 'Usability blockers must be resolved before release',
      };
    }
    return {
      stakeholder: 'user-power',
      vote: 'PROCEED',
      weight: 0.20,
      reasoning: 'No usability concerns identified',
    };
  }

  private accessibilityUserVote(state: GOAPState): StakeholderVote {
    const hasA11yIssue = state.blockers.some(
      (b) => b.includes('accessibility') || b.includes('a11y'),
    );
    if (hasA11yIssue) {
      return {
        stakeholder: 'user-accessibility',
        vote: 'LOOP',
        weight: 0.15,
        reasoning: 'Accessibility issues must be resolved before release',
      };
    }
    return {
      stakeholder: 'user-accessibility',
      vote: 'PROCEED',
      weight: 0.15,
      reasoning: 'No accessibility concerns identified',
    };
  }

  private weightedMajority(votes: StakeholderVote[]): Decision {
    const scores = new Map<Decision, number>();
    for (const vote of votes) {
      scores.set(vote.vote, (scores.get(vote.vote) ?? 0) + vote.weight);
    }
    let best: Decision = 'PROCEED';
    let bestScore = -1;
    for (const [decision, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        best = decision;
      }
    }
    return best;
  }

  private buildReasoning(state: GOAPState, votes: StakeholderVote[], decision: Decision): string {
    const votesSummary = votes.map((v) => `${v.stakeholder}=${v.vote}`).join(', ');
    return `Weighted voting result: ${decision}. Votes: ${votesSummary}. Confidence: ${(state.currentConfidence * 100).toFixed(1)}%.`;
  }
}
