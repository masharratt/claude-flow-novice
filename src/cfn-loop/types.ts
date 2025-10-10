/**
 * CFN Loop Type Definitions
 *
 * Core types and interfaces for the CFN Loop system including:
 * - Configuration and options
 * - Results and outcomes
 * - Byzantine consensus types
 * - Agent responses and votes
 *
 * @module cfn-loop/types
 */

// ===== VALIDATOR TYPES =====

/**
 * Validator vote in Byzantine consensus
 * Each validator provides a confidence score, vote, reasoning, and cryptographic signature
 */
export interface ValidatorVote {
  agentId: string;
  agentType: 'reviewer' | 'security-specialist' | 'tester' | 'analyst';
  confidence: number; // 0.0 to 1.0
  vote: 'PASS' | 'FAIL';
  reasoning: string;
  signature: string; // Hash of vote + agentId for authenticity
  timestamp: number;
  blockers?: string[]; // Issues that led to FAIL vote
  recommendations?: string[]; // Suggestions for improvement
}

/**
 * Standard consensus result (non-Byzantine)
 * Used when Byzantine consensus is disabled or as fallback
 */
export interface ConsensusResult {
  consensusScore: number;
  consensusThreshold: number;
  consensusPassed: boolean;
  validatorResults: any[];
  votingBreakdown: Record<string, number>;
  iteration: number;
  timestamp: number;
}

/**
 * Byzantine consensus result extending standard consensus
 * Includes PBFT-specific information and malicious agent detection
 */
export interface ByzantineConsensusResult extends ConsensusResult {
  byzantineEnabled: true;
  quorumSize: number; // Number of validators required for quorum
  maliciousAgents: string[]; // Agent IDs flagged as malicious
  signatureVerified: boolean; // Whether all signatures were valid
  pbftPhases: {
    prepare: boolean; // PBFT prepare phase completed
    commit: boolean; // PBFT commit phase completed
    reply: boolean; // PBFT reply phase completed
  };
  validatorVotes: ValidatorVote[]; // Full validator vote details
}

// ===== CONFIGURATION TYPES =====

/**
 * Configuration for Byzantine consensus adapter
 */
export interface ByzantineAdapterConfig {
  validatorCount?: number; // Number of validators to spawn (default: 4)
  quorumThreshold?: number; // Minimum validators required (default: Math.ceil(validatorCount * 2/3))
  consensusThreshold?: number; // Minimum consensus score to pass (default: 0.90)
  enableSignatureVerification?: boolean; // Verify vote signatures (default: true)
  enableMaliciousDetection?: boolean; // Detect and flag malicious validators (default: true)
  timeoutMs?: number; // Timeout for validator responses (default: 60000)
}

/**
 * Configuration for CFN Loop orchestrator
 */
export interface CFNLoopConfig {
  phaseId: string;
  swarmId?: string;
  maxLoop2Iterations?: number;
  maxLoop3Iterations?: number;
  confidenceThreshold?: number;
  consensusThreshold?: number;
  timeoutMs?: number;
  enableCircuitBreaker?: boolean;
  enableMemoryPersistence?: boolean;
  memoryConfig?: any;

  // Byzantine consensus options
  enableByzantineConsensus?: boolean; // Enable PBFT Byzantine consensus (default: false)
  byzantineConfig?: ByzantineAdapterConfig; // Byzantine consensus configuration
}

// ===== AGENT RESPONSE TYPES =====

/**
 * Agent response from primary swarm (Loop 3)
 */
export interface AgentResponse {
  agentId: string;
  agentType: string;
  deliverable: any;
  confidence?: number;
  reasoning?: string;
  blockers?: string[];
  timestamp: number;
}

/**
 * Primary swarm result from Loop 3 execution
 */
export interface PrimarySwarmResult {
  responses: AgentResponse[];
  confidenceScores: any[]; // ConfidenceScore[] from confidence-score-system
  confidenceValidation: any; // ConfidenceValidationResult
  gatePassed: boolean;
  iteration: number;
  timestamp: number;
}

// ===== PRODUCT OWNER TYPES =====

/**
 * Product Owner decision from Loop 4 (GOAP)
 * Autonomous decision gate after Loop 2 consensus validation
 */
export interface ProductOwnerDecision {
  decision: 'PROCEED' | 'DEFER' | 'ESCALATE';
  confidence: number; // 0.0 to 1.0
  reasoning: string;
  backlogItems: string[]; // Items deferred to backlog (for DEFER decision)
  blockers: string[]; // Critical blockers (for ESCALATE decision)
  recommendations: string[]; // Improvement suggestions
  timestamp: number;
}

// ===== PHASE RESULT TYPES =====

/**
 * Statistics tracking for phase execution
 */
export interface PhaseStatistics {
  totalDuration: number;
  primarySwarmExecutions: number;
  consensusSwarmExecutions: number;
  averageConfidenceScore: number;
  finalConsensusScore: number;
  gatePasses: number;
  gateFails: number;
  feedbackInjections: number;
  circuitBreakerTrips: number;
  timeouts: number;
}

/**
 * Complete phase execution result
 */
export interface PhaseResult {
  success: boolean;
  phaseId: string;
  totalLoop2Iterations: number;
  totalLoop3Iterations: number;
  finalDeliverables: any[];
  confidenceScores: any[]; // ConfidenceScore[]
  consensusResult: ConsensusResult | ByzantineConsensusResult;
  productOwnerDecision?: ProductOwnerDecision; // Loop 4 decision gate
  escalated: boolean;
  escalationReason?: string;
  statistics: PhaseStatistics;
  timestamp: number;
}

// ===== RETRY STRATEGY TYPES =====

/**
 * Strategy for retrying failed operations
 */
export interface RetryStrategy {
  shouldRetry: boolean;
  delayMs: number;
  modifiedInstructions?: string;
  targetAgents?: string[];
  reason: string;
}

// ===== TYPE GUARDS =====

/**
 * Type guard to check if consensus result is Byzantine
 */
export function isByzantineConsensusResult(
  result: ConsensusResult | ByzantineConsensusResult
): result is ByzantineConsensusResult {
  return 'byzantineEnabled' in result && result.byzantineEnabled === true;
}

/**
 * Type guard to check if validator vote is valid
 */
export function isValidValidatorVote(vote: any): vote is ValidatorVote {
  return (
    vote &&
    typeof vote.agentId === 'string' &&
    typeof vote.agentType === 'string' &&
    typeof vote.confidence === 'number' &&
    (vote.vote === 'PASS' || vote.vote === 'FAIL') &&
    typeof vote.reasoning === 'string' &&
    typeof vote.signature === 'string' &&
    typeof vote.timestamp === 'number' &&
    vote.confidence >= 0 &&
    vote.confidence <= 1
  );
}

// ===== EXPORTS =====

export default {
  isByzantineConsensusResult,
  isValidValidatorVote,
};
