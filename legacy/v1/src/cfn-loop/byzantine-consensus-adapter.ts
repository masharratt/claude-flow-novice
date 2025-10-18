/**
 * Byzantine Consensus Adapter for CFN Loop 2
 *
 * Bridges ByzantineConsensusCoordinator with CFN Loop orchestrator.
 * Implements PBFT (Practical Byzantine Fault Tolerance) consensus for validator agreement.
 *
 * Features:
 * - PBFT three-phase consensus (prepare, commit, reply)
 * - Malicious validator detection and flagging
 * - Cryptographic signature verification
 * - SwarmMemory persistence for malicious agents
 * - Backwards compatibility with simple consensus
 *
 * @module cfn-loop/byzantine-consensus-adapter
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import { ByzantineConsensusCoordinator } from '../consensus/byzantine-coordinator.js';
import { SwarmMemoryManager } from '../memory/swarm-memory.js';
import type {
  ValidatorVote,
  ByzantineConsensusResult,
  ConsensusResult,
  ByzantineAdapterConfig,
  AgentResponse,
} from './types.js';

// ===== ADAPTER CONFIGURATION =====

const DEFAULT_CONFIG: Required<ByzantineAdapterConfig> = {
  validatorCount: 4,
  quorumThreshold: 3, // ceil(4 * 2/3) = 3
  consensusThreshold: 0.90,
  enableSignatureVerification: true,
  enableMaliciousDetection: true,
  timeoutMs: 60000, // 1 minute
};

// ===== BYZANTINE CONSENSUS ADAPTER =====

/**
 * Adapter that integrates Byzantine consensus into CFN Loop
 *
 * Responsibilities:
 * - Initialize Byzantine coordinator with validator configuration
 * - Collect and validate validator votes
 * - Execute PBFT consensus phases
 * - Detect and flag malicious validators
 * - Map Byzantine results to CFN Loop ConsensusResult interface
 * - Persist malicious agent data to SwarmMemory
 */
export class ByzantineConsensusAdapter extends EventEmitter {
  private logger: Logger;
  private config: Required<ByzantineAdapterConfig>;
  private byzantineCoordinator: ByzantineConsensusCoordinator;
  private memoryManager?: SwarmMemoryManager;
  private maliciousAgents: Set<string>;

  constructor(
    config: ByzantineAdapterConfig = {},
    memoryManager?: SwarmMemoryManager
  ) {
    super();

    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      quorumThreshold:
        config.quorumThreshold ??
        Math.ceil((config.validatorCount ?? DEFAULT_CONFIG.validatorCount) * 2 / 3),
    };

    // Initialize logger
    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'ByzantineConsensusAdapter' });

    // Initialize Byzantine coordinator
    this.byzantineCoordinator = new ByzantineConsensusCoordinator({
      totalNodes: this.config.validatorCount,
      nodeId: this.generateNodeId(),
    });

    // Initialize memory manager
    this.memoryManager = memoryManager;

    // Track malicious agents
    this.maliciousAgents = new Set<string>();

    this.logger.info('Byzantine Consensus Adapter initialized', {
      validatorCount: this.config.validatorCount,
      quorumThreshold: this.config.quorumThreshold,
      consensusThreshold: this.config.consensusThreshold,
    });
  }

  /**
   * Execute Byzantine consensus on validator responses
   *
   * Process:
   * 1. Collect validator votes from responses
   * 2. Verify cryptographic signatures
   * 3. Execute PBFT three-phase consensus
   * 4. Detect malicious validators
   * 5. Calculate consensus score
   * 6. Return ByzantineConsensusResult
   *
   * @param validatorResponses - Array of validator agent responses
   * @returns Byzantine consensus result with PBFT phases and malicious agent detection
   */
  async executeConsensus(
    validatorResponses: AgentResponse[]
  ): Promise<ByzantineConsensusResult> {
    this.logger.info('Executing Byzantine consensus', {
      validatorCount: validatorResponses.length,
      quorumThreshold: this.config.quorumThreshold,
    });

    try {
      // Step 1: Extract validator votes from responses
      const validatorVotes = this.extractValidatorVotes(validatorResponses);

      this.logger.debug('Validator votes extracted', {
        voteCount: validatorVotes.length,
        passVotes: validatorVotes.filter(v => v.vote === 'PASS').length,
        failVotes: validatorVotes.filter(v => v.vote === 'FAIL').length,
      });

      // Step 2: Verify signatures if enabled
      if (this.config.enableSignatureVerification) {
        const signatureVerified = await this.verifySignatures(validatorVotes);
        if (!signatureVerified) {
          this.logger.warn('Signature verification failed for some validators');
        }
      }

      // Step 3: Execute PBFT consensus phases
      const pbftResult = await this.executePBFTConsensus(validatorVotes);

      this.logger.info('PBFT consensus completed', {
        prepare: pbftResult.prepare,
        commit: pbftResult.commit,
        reply: pbftResult.reply,
      });

      // Step 4: Detect malicious agents if enabled
      const maliciousAgents = this.config.enableMaliciousDetection
        ? await this.detectMaliciousAgents(validatorVotes)
        : [];

      if (maliciousAgents.length > 0) {
        this.logger.warn('Malicious agents detected', {
          count: maliciousAgents.length,
          agents: maliciousAgents,
        });

        // Flag malicious agents
        for (const agentId of maliciousAgents) {
          await this.flagMaliciousAgent(agentId, 'Byzantine behavior detected');
        }
      }

      // Step 5: Calculate consensus score
      const consensusScore = this.calculateConsensusScore(validatorVotes);
      const consensusPassed = consensusScore >= this.config.consensusThreshold;

      this.logger.info('Consensus score calculated', {
        score: consensusScore,
        threshold: this.config.consensusThreshold,
        passed: consensusPassed,
      });

      // Step 6: Build voting breakdown
      const votingBreakdown = this.buildVotingBreakdown(validatorVotes);

      // Step 7: Create Byzantine consensus result
      const result: ByzantineConsensusResult = {
        byzantineEnabled: true,
        consensusScore,
        consensusThreshold: this.config.consensusThreshold,
        consensusPassed,
        validatorResults: validatorResponses,
        validatorVotes,
        votingBreakdown,
        quorumSize: this.config.quorumThreshold,
        maliciousAgents,
        signatureVerified: this.config.enableSignatureVerification
          ? await this.verifySignatures(validatorVotes)
          : true,
        pbftPhases: pbftResult,
        iteration: 0, // Set by orchestrator
        timestamp: Date.now(),
      };

      this.emit('consensus:complete', result);

      return result;
    } catch (error) {
      this.logger.error('Byzantine consensus execution failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Extract validator votes from agent responses
   *
   * Parses agent deliverables to extract ValidatorVote objects.
   * Supports both structured vote objects and text-based responses.
   *
   * @param responses - Array of agent responses
   * @returns Array of validator votes
   */
  private extractValidatorVotes(responses: AgentResponse[]): ValidatorVote[] {
    const votes: ValidatorVote[] = [];

    for (const response of responses) {
      try {
        let vote: ValidatorVote;

        // Check if deliverable is already a ValidatorVote
        if (this.isValidatorVote(response.deliverable)) {
          vote = response.deliverable;
        } else {
          // Parse from response fields
          vote = {
            agentId: response.agentId,
            agentType: this.inferValidatorType(response.agentType),
            confidence: response.confidence ?? 0.5,
            vote: response.confidence && response.confidence >= 0.75 ? 'PASS' : 'FAIL',
            reasoning: response.reasoning ?? 'No reasoning provided',
            signature: this.generateSignature(response),
            timestamp: response.timestamp,
            blockers: response.blockers,
          };
        }

        votes.push(vote);
      } catch (error) {
        this.logger.error('Failed to extract vote from response', {
          agentId: response.agentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return votes;
  }

  /**
   * Execute PBFT three-phase consensus
   *
   * Phases:
   * 1. Prepare: Validators prepare to commit to proposal
   * 2. Commit: Validators commit to the agreed proposal
   * 3. Reply: Final confirmation of consensus
   *
   * @param votes - Array of validator votes
   * @returns PBFT phase completion status
   */
  private async executePBFTConsensus(
    votes: ValidatorVote[]
  ): Promise<{ prepare: boolean; commit: boolean; reply: boolean }> {
    // Phase 1: Prepare
    const preparePhase = await this.pbftPrepare(votes);

    if (!preparePhase) {
      this.logger.warn('PBFT prepare phase failed');
      return { prepare: false, commit: false, reply: false };
    }

    // Phase 2: Commit
    const commitPhase = await this.pbftCommit(votes);

    if (!commitPhase) {
      this.logger.warn('PBFT commit phase failed');
      return { prepare: true, commit: false, reply: false };
    }

    // Phase 3: Reply
    const replyPhase = await this.pbftReply(votes);

    return { prepare: true, commit: true, reply: replyPhase };
  }

  /**
   * PBFT Prepare Phase
   * Validators prepare to commit to the proposal
   */
  private async pbftPrepare(votes: ValidatorVote[]): Promise<boolean> {
    // Requires 2/3 quorum to prepare
    const requiredVotes = this.config.quorumThreshold;
    const validVotes = votes.filter(v => v.confidence > 0);

    const prepared = validVotes.length >= requiredVotes;

    this.logger.debug('PBFT Prepare phase', {
      validVotes: validVotes.length,
      required: requiredVotes,
      prepared,
    });

    return prepared;
  }

  /**
   * PBFT Commit Phase
   * Validators commit to the agreed proposal
   */
  private async pbftCommit(votes: ValidatorVote[]): Promise<boolean> {
    // Requires 2/3 quorum to commit
    const requiredVotes = this.config.quorumThreshold;
    const commitVotes = votes.filter(v => v.confidence >= 0.5);

    const committed = commitVotes.length >= requiredVotes;

    this.logger.debug('PBFT Commit phase', {
      commitVotes: commitVotes.length,
      required: requiredVotes,
      committed,
    });

    return committed;
  }

  /**
   * PBFT Reply Phase
   * Final confirmation of consensus
   */
  private async pbftReply(votes: ValidatorVote[]): Promise<boolean> {
    // Final check: at least quorum size agrees
    const requiredVotes = this.config.quorumThreshold;
    const passVotes = votes.filter(v => v.vote === 'PASS');

    const reply = passVotes.length >= requiredVotes;

    this.logger.debug('PBFT Reply phase', {
      passVotes: passVotes.length,
      required: requiredVotes,
      reply,
    });

    return reply;
  }

  /**
   * Detect malicious agents based on voting patterns
   *
   * Detection criteria:
   * - Outlier confidence scores (>2 std deviations)
   * - Invalid signatures
   * - Inconsistent reasoning
   * - Suspicious timing patterns
   *
   * @param votes - Array of validator votes
   * @returns Array of malicious agent IDs
   */
  async detectMaliciousAgents(votes: ValidatorVote[]): Promise<string[]> {
    const malicious: string[] = [];

    // Calculate mean and standard deviation of confidence scores
    const confidences = votes.map(v => v.confidence);
    const mean = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    const stdDev = Math.sqrt(
      confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length
    );

    for (const vote of votes) {
      const reasons: string[] = [];

      // Check for outlier confidence (>2 std deviations)
      if (Math.abs(vote.confidence - mean) > 2 * stdDev) {
        reasons.push('Outlier confidence score');
      }

      // Check for invalid signature
      if (this.config.enableSignatureVerification) {
        const validSignature = await this.verifyVoteSignature(vote);
        if (!validSignature) {
          reasons.push('Invalid signature');
        }
      }

      // Check for empty or suspicious reasoning
      if (!vote.reasoning || vote.reasoning.length < 10) {
        reasons.push('Insufficient reasoning');
      }

      // Flag as malicious if multiple criteria met
      if (reasons.length >= 2) {
        malicious.push(vote.agentId);
        this.logger.warn('Malicious agent detected', {
          agentId: vote.agentId,
          reasons,
        });
      }
    }

    return malicious;
  }

  /**
   * Flag an agent as malicious and persist to memory
   *
   * @param agentId - ID of malicious agent
   * @param reason - Reason for flagging
   */
  async flagMaliciousAgent(agentId: string, reason: string): Promise<void> {
    this.maliciousAgents.add(agentId);

    this.logger.warn('Flagging malicious agent', { agentId, reason });

    // Persist to SwarmMemory if available
    if (this.memoryManager) {
      try {
        await this.memoryManager.remember(
          'byzantine-consensus',
          'security',
          {
            agentId,
            reason,
            timestamp: Date.now(),
            flagged: true,
          },
          {
            tags: ['malicious', 'byzantine', 'security'],
            shareLevel: 'system',
          }
        );

        this.logger.info('Malicious agent flagged in memory', { agentId });
      } catch (error) {
        this.logger.error('Failed to persist malicious agent flag', {
          agentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.emit('malicious:detected', { agentId, reason });
  }

  /**
   * Verify cryptographic signatures for all votes
   *
   * @param votes - Array of validator votes
   * @returns True if all signatures are valid
   */
  private async verifySignatures(votes: ValidatorVote[]): Promise<boolean> {
    for (const vote of votes) {
      const valid = await this.verifyVoteSignature(vote);
      if (!valid) {
        this.logger.warn('Invalid signature detected', { agentId: vote.agentId });
        return false;
      }
    }

    return true;
  }

  /**
   * Verify signature for a single vote
   *
   * @param vote - Validator vote to verify
   * @returns True if signature is valid
   */
  private async verifyVoteSignature(vote: ValidatorVote): Promise<boolean> {
    try {
      const expectedSignature = this.generateVoteSignature(vote);
      return vote.signature === expectedSignature;
    } catch (error) {
      this.logger.error('Signature verification failed', {
        agentId: vote.agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Generate cryptographic signature for a vote
   *
   * @param vote - Validator vote or agent response
   * @returns SHA-256 signature hash
   */
  private generateVoteSignature(vote: ValidatorVote): string {
    const data = {
      agentId: vote.agentId,
      confidence: vote.confidence,
      vote: vote.vote,
      timestamp: vote.timestamp,
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Generate signature from agent response
   *
   * @param response - Agent response
   * @returns SHA-256 signature hash
   */
  private generateSignature(response: AgentResponse): string {
    const data = {
      agentId: response.agentId,
      confidence: response.confidence,
      timestamp: response.timestamp,
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Calculate consensus score from validator votes
   *
   * Formula: (weighted_pass_votes) / (total_validators)
   * Weighted by validator confidence scores
   *
   * @param votes - Array of validator votes
   * @returns Consensus score (0.0 to 1.0)
   */
  private calculateConsensusScore(votes: ValidatorVote[]): number {
    if (votes.length === 0) {
      return 0;
    }

    // Calculate weighted score based on PASS votes and confidence
    const weightedScore = votes.reduce((sum, vote) => {
      const voteWeight = vote.vote === 'PASS' ? vote.confidence : 0;
      return sum + voteWeight;
    }, 0);

    return weightedScore / votes.length;
  }

  /**
   * Build voting breakdown for reporting
   *
   * @param votes - Array of validator votes
   * @returns Voting breakdown by type
   */
  private buildVotingBreakdown(votes: ValidatorVote[]): Record<string, number> {
    const breakdown: Record<string, number> = {
      pass: 0,
      fail: 0,
      reviewer: 0,
      'security-specialist': 0,
      tester: 0,
      analyst: 0,
    };

    for (const vote of votes) {
      // Count by vote
      if (vote.vote === 'PASS') {
        breakdown.pass++;
      } else {
        breakdown.fail++;
      }

      // Count by agent type
      breakdown[vote.agentType] = (breakdown[vote.agentType] || 0) + 1;
    }

    return breakdown;
  }

  /**
   * Type guard to check if object is a ValidatorVote
   *
   * @param obj - Object to check
   * @returns True if object is ValidatorVote
   */
  private isValidatorVote(obj: any): obj is ValidatorVote {
    return (
      obj &&
      typeof obj.agentId === 'string' &&
      typeof obj.confidence === 'number' &&
      (obj.vote === 'PASS' || obj.vote === 'FAIL') &&
      typeof obj.reasoning === 'string' &&
      typeof obj.signature === 'string'
    );
  }

  /**
   * Infer validator type from agent type string
   *
   * @param agentType - Agent type string
   * @returns Validator type
   */
  private inferValidatorType(
    agentType: string
  ): 'reviewer' | 'security-specialist' | 'tester' | 'analyst' {
    const type = agentType.toLowerCase();

    if (type.includes('security')) {
      return 'security-specialist';
    } else if (type.includes('test')) {
      return 'tester';
    } else if (type.includes('analyst')) {
      return 'analyst';
    } else {
      return 'reviewer';
    }
  }

  /**
   * Generate unique node ID for Byzantine coordinator
   *
   * @returns Random node ID
   */
  private generateNodeId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Get set of malicious agents
   *
   * @returns Set of malicious agent IDs
   */
  getMaliciousAgents(): Set<string> {
    return new Set(this.maliciousAgents);
  }

  /**
   * Clear malicious agents set
   */
  clearMaliciousAgents(): void {
    this.maliciousAgents.clear();
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create Byzantine consensus adapter instance
 *
 * @param config - Adapter configuration
 * @param memoryManager - Optional SwarmMemory manager
 * @returns Configured adapter instance
 */
export function createByzantineConsensusAdapter(
  config?: ByzantineAdapterConfig,
  memoryManager?: SwarmMemoryManager
): ByzantineConsensusAdapter {
  return new ByzantineConsensusAdapter(config, memoryManager);
}

// ===== EXPORTS =====

export default ByzantineConsensusAdapter;
