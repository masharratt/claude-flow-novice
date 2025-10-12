/**
 * CFN Loop Mode Type Definitions
 *
 * Defines interfaces for MVP, Enterprise, and Standard CFN Loop modes.
 * Each mode has different thresholds, iteration limits, and team structures.
 *
 * @module cfn-loop/modes/types
 */

/**
 * CFN Loop mode types
 */
export type CFNLoopModeName = 'mvp' | 'enterprise' | 'standard';

/**
 * Product owner decision structure types
 */
export type ProductOwnerStructure = 'single' | 'team';

/**
 * Planning consensus configuration for Enterprise mode (Loop 0.5)
 */
export interface PlanningConsensusConfig {
  enabled: boolean;
  architectTypes: string[]; // ['architect', 'system-architect', 'security-specialist']
  threshold: number; // 0.85 for Enterprise
}

/**
 * Product owner team role with weighted voting
 */
export interface ProductOwnerRole {
  name: string;
  weight: number; // 0.0-1.0
}

/**
 * Product owner team configuration for Enterprise mode
 */
export interface ProductOwnerTeamConfig {
  roles: ProductOwnerRole[];
  votingAlgorithm: 'weighted-confidence'; // Algorithm used for team decision
}

/**
 * Complete CFN Loop mode configuration
 */
export interface CFNLoopMode {
  /** Mode identifier */
  name: CFNLoopModeName;

  /** Confidence gate threshold for Loop 3 (agent self-confidence) */
  gateThreshold: number;

  /** Consensus threshold for Loop 2 (validator consensus) */
  consensusThreshold: number;

  /** Maximum iterations for Loop 2 (phase-level) */
  maxLoop2Iterations: number;

  /** Maximum iterations for Loop 3 (swarm-level) */
  maxLoop3Iterations: number;

  /** Number of validators for Loop 2 consensus */
  validatorCount: number;

  /** Types of validators to spawn */
  validatorTypes: string[];

  /** Product owner structure (single agent or team) */
  productOwnerStructure: ProductOwnerStructure;

  /** Validations to skip in this mode (MVP only) */
  skipValidations?: string[];

  /** Special instructions injected into agent prompts */
  specialInstructions: string;

  /** Planning consensus configuration (Enterprise Loop 0.5 only) */
  planningConsensus?: PlanningConsensusConfig;

  /** Product owner team configuration (Enterprise Loop 4 only) */
  productOwnerTeam?: ProductOwnerTeamConfig;
}

/**
 * Mode detection metadata from epic configuration
 */
export interface ModeDetectionMetadata {
  cfnMode?: CFNLoopModeName;
  mode?: CFNLoopModeName;
  quality?: 'mvp' | 'enterprise' | 'standard';
}

/**
 * Mode selection result
 */
export interface ModeSelectionResult {
  mode: CFNLoopMode;
  source: 'explicit' | 'filename' | 'metadata' | 'default';
  detectedFrom?: string;
}

/**
 * Stakeholder vote in Enterprise product owner team
 */
export interface StakeholderVote {
  stakeholder: 'cto' | 'product-owner' | 'user-power' | 'user-accessibility';
  vote: 'PROCEED' | 'DEFER' | 'ESCALATE';
  confidence: number; // 0.0-1.0
  weight: number; // Role weight
}

/**
 * Board decision result from weighted voting
 */
export interface BoardDecision {
  decision: 'PROCEED' | 'DEFER' | 'ESCALATE';
  decisionScore: number; // 0.0-1.0 weighted score
  confidence: number; // Average confidence
  reasoning: string;
  backlogItems: string[];
  blockers: string[];
  recommendations: string[];
  evaluations: StakeholderVote[];
  boardConsensus: number; // 0.0-1.0 agreement level
  timestamp: number;
}

/**
 * Type guard to check if mode is MVP
 */
export function isMVPMode(mode: CFNLoopMode): boolean {
  return mode.name === 'mvp';
}

/**
 * Type guard to check if mode is Enterprise
 */
export function isEnterpriseMode(mode: CFNLoopMode): boolean {
  return mode.name === 'enterprise';
}

/**
 * Type guard to check if mode is Standard
 */
export function isStandardMode(mode: CFNLoopMode): boolean {
  return mode.name === 'standard';
}

/**
 * Type guard to check if mode has planning consensus (Loop 0.5)
 */
export function hasPlanningConsensus(mode: CFNLoopMode): boolean {
  return mode.planningConsensus?.enabled === true;
}

/**
 * Type guard to check if mode has product owner team
 */
export function hasProductOwnerTeam(mode: CFNLoopMode): boolean {
  return mode.productOwnerStructure === 'team' && !!mode.productOwnerTeam;
}

export default {
  isMVPMode,
  isEnterpriseMode,
  isStandardMode,
  hasPlanningConsensus,
  hasProductOwnerTeam,
};
