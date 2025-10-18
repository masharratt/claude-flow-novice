/**
 * Enterprise Planning Consensus (Loop 0.5)
 * Architect consensus before Loop 1 execution
 */

import { ByzantineConsensusAdapter, type ValidatorVote } from '../byzantine-consensus-adapter.js';
import { Logger } from '../../core/logger.js';
import type {
  ConsensusConfig,
  PlanningConsensusResult,
  ArchitectVote,
  ConsensusValidator,
} from './types.js';

/**
 * Enterprise planning consensus: 3 architects, threshold 0.85
 * Validates architecture, security, and system integration before implementation
 */
export class EnterprisePlanningConsensus implements ConsensusValidator {
  private adapter: ByzantineConsensusAdapter;
  private logger: Logger;
  private config: ConsensusConfig;

  constructor(memoryManager?: unknown) {
    this.config = {
      threshold: 0.85,
      validatorCount: 3,
      algorithm: 'byzantine',
      faultTolerance: 1,
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

    this.logger = new Logger(loggerConfig, { component: 'EnterprisePlanningConsensus' });
  }

  /**
   * Execute planning consensus with architects
   */
  async executeConsensus(votes: ValidatorVote[]): Promise<PlanningConsensusResult> {
    this.logger.info('Executing Enterprise planning consensus', {
      totalVotes: votes.length,
      expectedArchitects: this.config.validatorCount,
    });

    // Validate architect votes
    const architectVotes = votes.filter((v) => this.isArchitectVote(v));
    if (architectVotes.length < this.config.validatorCount) {
      this.logger.warn('Insufficient architect votes', {
        received: architectVotes.length,
        required: this.config.validatorCount,
      });
    }

    // Execute Byzantine consensus
    const baseResult = await this.adapter.executeConsensus(architectVotes);

    // Extract recommendations and blockers
    const recommendations: string[] = [];
    const blockers: string[] = [];

    architectVotes.forEach((vote) => {
      const architectVote = vote as ArchitectVote;
      if (architectVote.recommendations) {
        recommendations.push(...architectVote.recommendations);
      }
      if (architectVote.concerns) {
        blockers.push(...architectVote.concerns);
      }
    });

    const result: PlanningConsensusResult = {
      ...baseResult,
      planningPhase: 'architecture',
      architectVotes: architectVotes as ArchitectVote[],
      recommendations: [...new Set(recommendations)],
      blockers: [...new Set(blockers)],
    };

    this.logger.info('Enterprise planning consensus complete', {
      consensusReached: result.consensusReached,
      consensusScore: result.consensusScore,
      recommendations: result.recommendations.length,
      blockers: result.blockers.length,
    });

    return result;
  }

  /**
   * Validate vote structure
   */
  validateVote(vote: ValidatorVote): boolean {
    return this.adapter.validateVote(vote) && this.isArchitectVote(vote);
  }

  /**
   * Check if vote is from an architect
   */
  private isArchitectVote(vote: ValidatorVote): boolean {
    const architectVote = vote as ArchitectVote;
    return (
      !!architectVote.architectType &&
      ['architect', 'system-architect', 'security-specialist'].includes(
        architectVote.architectType
      )
    );
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

export default EnterprisePlanningConsensus;
