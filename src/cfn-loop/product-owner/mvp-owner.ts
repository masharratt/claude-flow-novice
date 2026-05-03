import type { GOAPState, PODecisionResult, OwnerConfig } from './types.js';

export class MVPOwner {
  getConfig(): OwnerConfig {
    return {
      structure: 'single',
      decisionAlgorithm: 'goap',
      confidenceThreshold: 0.70,
    };
  }

  async makeDecision(state: GOAPState): Promise<PODecisionResult> {
    const { currentConfidence, blockers, riskLevel, remainingTasks } = state;
    const threshold = this.getConfig().confidenceThreshold;

    if (blockers.length >= 5) {
      return {
        decision: 'ESCALATE',
        confidence: currentConfidence,
        reasoning: `High blocker count: ${blockers.length}. Escalation required.`,
        recommendations: ['Resolve critical blockers before continuing'],
        blockers,
        backlogItems: remainingTasks,
        timestamp: Date.now(),
      };
    }

    if (riskLevel === 'high') {
      return {
        decision: 'ESCALATE',
        confidence: currentConfidence,
        reasoning: `Risk level: high. Escalation required before proceeding.`,
        recommendations: ['Address high-risk issues before continuing'],
        blockers,
        backlogItems: remainingTasks,
        timestamp: Date.now(),
      };
    }

    if (currentConfidence >= threshold && blockers.length === 0) {
      return {
        decision: 'PROCEED',
        confidence: currentConfidence,
        reasoning: `Confidence meets MVP threshold. Consensus: ${(state.consensusScore * 100).toFixed(1)}%. No blockers present.`,
        recommendations: [],
        blockers,
        backlogItems: remainingTasks,
        timestamp: Date.now(),
      };
    }

    const recommendations: string[] = [];
    if (currentConfidence < threshold) {
      recommendations.push(`Improve confidence score (currently ${(currentConfidence * 100).toFixed(1)}%, needs ${(threshold * 100).toFixed(1)}%)`);
    }
    if (blockers.length > 0) {
      recommendations.push(`Resolve ${blockers.length} remaining blockers`);
    }

    return {
      decision: 'LOOP',
      confidence: currentConfidence,
      reasoning: `Confidence at ${(currentConfidence * 100).toFixed(1)}% needs improvement. ${blockers.length} blockers remain.`,
      recommendations,
      blockers,
      backlogItems: remainingTasks,
      timestamp: Date.now(),
    };
  }
}
