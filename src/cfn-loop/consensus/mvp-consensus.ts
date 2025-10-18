/**
 * MVP Consensus Implementation
 * Simple majority voting with 2 validators
 */

import { ByzantineConsensusAdapter, type ValidatorVote } from '../byzantine-consensus-adapter.js';
import { Logger } from '../../core/logger.js';
import type { ConsensusConfig, ConsensusResult, ConsensusValidator } from './types.js';

/**
 * MVP consensus: Simple 2-validator majority voting
 * Threshold: 0.85 (85% agreement)
 */
export class MVPConsensus implements ConsensusValidator {
  private adapter: ByzantineConsensusAdapter;
  private logger: Logger;
  private config: ConsensusConfig;

  constructor(memoryManager?: unknown) {
    this.config = {
      threshold: 0.85,
      validatorCount: 2,
      algorithm: 'simple-majority',
      faultTolerance: 0,
    };

    this.adapter = new ByzantineConsensusAdapter(
      {
        consensusThreshold: this.config.threshold,
        validatorCount: this.config.validatorCount,
        faultTolerance: this.config.faultTolerance,
      },
      memoryManager
    );

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'MVPConsensus' });
  }

  /**
   * Execute MVP consensus validation
   */
  async executeConsensus(votes: ValidatorVote[]): Promise<ConsensusResult> {
    this.logger.info('Executing MVP consensus', {
      totalVotes: votes.length,
      expectedValidators: this.config.validatorCount,
    });

    // Validate minimum votes
    if (votes.length < this.config.validatorCount) {
      this.logger.warn('Insufficient votes for MVP consensus', {
        received: votes.length,
        required: this.config.validatorCount,
      });
    }

    // Validate all votes
    const validVotes = votes.filter((v) => this.validateVote(v));
    if (validVotes.length < votes.length) {
      this.logger.warn('Invalid votes detected', {
        total: votes.length,
        valid: validVotes.length,
      });
    }

    // Execute Byzantine consensus
    const result = await this.adapter.executeConsensus(validVotes);

    this.logger.info('MVP consensus complete', {
      consensusReached: result.consensusReached,
      consensusScore: result.consensusScore,
    });

    return result;
  }

  /**
   * Validate vote structure
   */
  validateVote(vote: ValidatorVote): boolean {
    return this.adapter.validateVote(vote);
  }

  /**
   * Get consensus threshold
   */
  getThreshold(): number {
    return this.config.threshold;
  }

  /**
   * Get validator count
   */
  getValidatorCount(): number {
    return this.config.validatorCount;
  }

  /**
   * Get configuration
   */
  getConfig(): ConsensusConfig {
    return { ...this.config };
  }
}

export default MVPConsensus;
