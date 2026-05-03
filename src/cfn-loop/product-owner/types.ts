export type RiskLevel = 'low' | 'medium' | 'high';
export type Decision = 'PROCEED' | 'LOOP' | 'ESCALATE' | 'DEFER';

export interface GOAPState {
  currentConfidence: number;
  consensusScore: number;
  blockers: string[];
  completedTasks: string[];
  remainingTasks: string[];
  riskLevel: RiskLevel;
}

export interface PODecisionResult {
  decision: Decision;
  confidence: number;
  reasoning: string;
  recommendations: string[];
  blockers: string[];
  backlogItems: string[];
  timestamp: number;
}

export interface StakeholderVote {
  stakeholder: 'cto' | 'product-owner' | 'user-power' | 'user-accessibility';
  vote: Decision;
  weight: number;
  reasoning: string;
}

export interface TeamDecisionResult extends PODecisionResult {
  votes: StakeholderVote[];
  boardConsensus: number;
  weightedScore: number;
  minorityOpinions: string[];
}

export interface OwnerConfig {
  structure: 'single' | 'team';
  decisionAlgorithm: 'goap' | 'weighted-voting';
  confidenceThreshold: number;
}
