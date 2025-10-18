/**
 * Byzantine Consensus Adapter
 * Minimal implementation for CFN Loop consensus validation
 */

import { Logger } from '../core/logger.js';

export interface ByzantineAdapterConfig {
  consensusThreshold?: number;
  validatorCount?: number;
  faultTolerance?: number;
}

export interface ValidatorVote {
  validatorId: string;
  vote: 'approve' | 'reject' | 'abstain';
  confidence: number;
  reasoning?: string;
  timestamp: number;
}

export interface ByzantineConsensusResult {
  consensusReached: boolean;
  consensusScore: number;
  votes: ValidatorVote[];
  faultyValidators: string[];
  timestamp: number;
}

/**
 * Adapter for Byzantine fault-tolerant consensus in CFN Loop
 */
export class ByzantineConsensusAdapter {
  private logger: Logger;
  private config: Required<ByzantineAdapterConfig>;

  constructor(config: ByzantineAdapterConfig = {}, private memoryManager?: unknown) {
    this.config = {
      consensusThreshold: config.consensusThreshold ?? 0.9,
      validatorCount: config.validatorCount ?? 4,
      faultTolerance: config.faultTolerance ?? 1,
    };

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'ByzantineConsensusAdapter' });
  }

  /**
   * Execute Byzantine consensus validation
   */
  async executeConsensus(votes: ValidatorVote[]): Promise<ByzantineConsensusResult> {
    this.logger.info('Executing Byzantine consensus', {
      totalVotes: votes.length,
      threshold: this.config.consensusThreshold,
    });

    // Count votes
    const approveVotes = votes.filter((v) => v.vote === 'approve').length;
    const totalVotes = votes.length;

    // Calculate consensus score
    const consensusScore = totalVotes > 0 ? approveVotes / totalVotes : 0;

    // Determine consensus
    const consensusReached = consensusScore >= this.config.consensusThreshold;

    // Identify potentially faulty validators (low confidence)
    const faultyValidators = votes
      .filter((v) => v.confidence < 0.5)
      .map((v) => v.validatorId);

    const result: ByzantineConsensusResult = {
      consensusReached,
      consensusScore,
      votes,
      faultyValidators,
      timestamp: Date.now(),
    };

    this.logger.info('Byzantine consensus complete', {
      consensusReached,
      consensusScore,
      approveVotes,
      totalVotes,
      faultyValidators: faultyValidators.length,
    });

    return result;
  }

  /**
   * Validate vote integrity
   */
  validateVote(vote: ValidatorVote): boolean {
    if (!vote.validatorId || !vote.vote) {
      return false;
    }

    if (!['approve', 'reject', 'abstain'].includes(vote.vote)) {
      return false;
    }

    if (vote.confidence < 0 || vote.confidence > 1) {
      return false;
    }

    return true;
  }

  /**
   * Get consensus threshold
   */
  getThreshold(): number {
    return this.config.consensusThreshold;
  }

  /**
   * Get validator count
   */
  getValidatorCount(): number {
    return this.config.validatorCount;
  }
}
