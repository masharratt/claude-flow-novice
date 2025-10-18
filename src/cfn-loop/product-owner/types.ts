/**
 * Product Owner Type Definitions
 * Interfaces for product owner decision-making in CFN Loop
 */

/**
 * Product owner decision types
 */
export type PODecision = 'PROCEED' | 'LOOP' | 'DEFER' | 'ESCALATE';

/**
 * Product owner configuration
 */
export interface POConfig {
  structure: 'single' | 'team';
  decisionAlgorithm: 'goap' | 'weighted-voting';
  confidenceThreshold?: number;
}

/**
 * GOAP (Goal-Oriented Action Planning) state for PO decision
 */
export interface GOAPState {
  currentConfidence: number;
  consensusScore: number;
  blockers: string[];
  completedTasks: string[];
  remainingTasks: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * GOAP action for decision-making
 */
export interface GOAPAction {
  name: PODecision;
  preconditions: Partial<GOAPState>;
  effects: Partial<GOAPState>;
  cost: number;
}

/**
 * Product owner decision result
 */
export interface PODecisionResult {
  decision: PODecision;
  confidence: number;
  reasoning: string;
  backlogItems: string[];
  blockers: string[];
  recommendations: string[];
  timestamp: number;
}

/**
 * Team vote in Enterprise product owner team
 */
export interface TeamVote {
  stakeholder: 'cto' | 'product-owner' | 'user-power' | 'user-accessibility';
  vote: PODecision;
  confidence: number;
  weight: number;
  reasoning: string;
}

/**
 * Team decision result with weighted voting
 */
export interface TeamDecisionResult extends PODecisionResult {
  votes: TeamVote[];
  weightedScore: number;
  boardConsensus: number;
  minorityOpinions: string[];
}

/**
 * Product owner interface
 */
export interface ProductOwner {
  makeDecision(state: GOAPState): Promise<PODecisionResult>;
  getConfig(): POConfig;
}
