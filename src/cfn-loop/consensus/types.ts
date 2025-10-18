/**
 * Consensus Type Definitions
 * Interfaces for consensus validation in CFN Loop
 */

import type { ValidatorVote } from '../byzantine-consensus-adapter.js';

/**
 * Consensus configuration
 */
export interface ConsensusConfig {
  threshold: number;
  validatorCount: number;
  algorithm: 'simple-majority' | 'byzantine' | 'weighted';
  faultTolerance?: number;
}

/**
 * Consensus execution result
 */
export interface ConsensusResult {
  consensusReached: boolean;
  consensusScore: number;
  votes: ValidatorVote[];
  faultyValidators: string[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Planning consensus result (Loop 0.5 - Enterprise mode)
 */
export interface PlanningConsensusResult extends ConsensusResult {
  planningPhase: 'architecture' | 'security' | 'integration';
  architectVotes: ValidatorVote[];
  recommendations: string[];
  blockers: string[];
}

/**
 * Architect vote in planning consensus
 */
export interface ArchitectVote extends ValidatorVote {
  architectType: 'architect' | 'system-architect' | 'security-specialist';
  concerns: string[];
  recommendations: string[];
}

/**
 * Consensus validator interface
 */
export interface ConsensusValidator {
  executeConsensus(votes: ValidatorVote[]): Promise<ConsensusResult>;
  validateVote(vote: ValidatorVote): boolean;
  getThreshold(): number;
  getValidatorCount(): number;
}
