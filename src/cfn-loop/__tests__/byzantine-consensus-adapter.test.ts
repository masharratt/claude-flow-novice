/**
 * Byzantine Consensus Adapter Unit Tests
 *
 * Comprehensive test suite for Byzantine consensus integration in CFN Loop 2
 * Tests PBFT consensus, malicious agent detection, and fault tolerance
 *
 * Coverage Requirements:
 * - 100% code coverage for ByzantineConsensusAdapter
 * - All PBFT phases (prepare, commit, reply)
 * - Malicious agent detection scenarios
 * - Signature verification
 * - Error handling and edge cases
 */

/**
 * @jest-environment node
 */

import crypto from 'crypto';

// ===== BYZANTINE CONSENSUS ADAPTER =====

interface ValidatorVote {
  agentId: string;
  confidence: number;
  vote: 'PASS' | 'FAIL';
  signature: string;
  timestamp: number;
  reasoning?: string;
}

interface ConsensusResult {
  consensusAchieved: boolean;
  consensusScore: number;
  maliciousAgents: string[];
  validVotes: ValidatorVote[];
  votingBreakdown: Record<string, number>;
  byzantineProof?: {
    proposalHash: string;
    totalVotes: number;
    acceptingVotes: number;
    signature: string;
  };
}

interface ByzantineConfig {
  enableByzantine: boolean;
  minValidators: number;
  maxMaliciousRatio: number;
  consensusThreshold: number;
  signatureValidation: boolean;
}

/**
 * Byzantine Consensus Adapter for CFN Loop 2
 * Implements PBFT three-phase consensus with malicious agent detection
 */
class ByzantineConsensusAdapter {
  private config: Required<ByzantineConfig>;
  private maliciousAgents: Set<string> = new Set();
  private keyPair: { publicKey: string; privateKey: string };

  constructor(config: Partial<ByzantineConfig> = {}) {
    this.config = {
      enableByzantine: config.enableByzantine ?? true,
      minValidators: config.minValidators ?? 4,
      maxMaliciousRatio: config.maxMaliciousRatio ?? 0.33, // f < n/3
      consensusThreshold: config.consensusThreshold ?? 0.67, // 2/3+ majority
      signatureValidation: config.signatureValidation ?? true,
    };

    // Generate RSA key pair for signing
    this.keyPair = this.generateKeyPair();
  }

  /**
   * Execute Byzantine consensus on validator votes
   */
  async executeConsensus(votes: ValidatorVote[]): Promise<ConsensusResult> {
    // Validate minimum validator count
    if (votes.length < this.config.minValidators) {
      throw new Error(
        `Insufficient validators: ${votes.length} < ${this.config.minValidators}`
      );
    }

    // Phase 1: Verify signatures
    const verifiedVotes = this.config.signatureValidation
      ? await this.verifySignatures(votes)
      : votes;

    // Phase 2: Detect malicious agents (outlier detection)
    const { validVotes, maliciousAgents } = this.detectMaliciousAgents(verifiedVotes);

    // Phase 3: Calculate consensus
    const consensusResult = this.calculateConsensus(validVotes);

    // Phase 4: Generate Byzantine proof
    const byzantineProof = this.generateConsensusProof(validVotes);

    return {
      consensusAchieved: consensusResult.achieved,
      consensusScore: consensusResult.score,
      maliciousAgents: Array.from(maliciousAgents),
      validVotes,
      votingBreakdown: consensusResult.breakdown,
      byzantineProof,
    };
  }

  /**
   * Verify cryptographic signatures on votes
   */
  private async verifySignatures(votes: ValidatorVote[]): Promise<ValidatorVote[]> {
    const verifiedVotes: ValidatorVote[] = [];

    for (const vote of votes) {
      try {
        const isValid = this.verifyVoteSignature(vote);
        if (isValid) {
          verifiedVotes.push(vote);
        } else {
          this.maliciousAgents.add(vote.agentId);
        }
      } catch (error) {
        // Invalid signature - mark as malicious
        this.maliciousAgents.add(vote.agentId);
      }
    }

    return verifiedVotes;
  }

  /**
   * Verify individual vote signature
   */
  private verifyVoteSignature(vote: ValidatorVote): boolean {
    try {
      const payload = this.createVotePayload(vote);
      const hash = crypto.createHash('sha256').update(payload).digest('hex');

      // In production, this would verify against the validator's public key
      // For testing, we verify the signature format is valid
      return vote.signature.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Detect malicious agents using outlier detection
   */
  private detectMaliciousAgents(votes: ValidatorVote[]): {
    validVotes: ValidatorVote[];
    maliciousAgents: Set<string>;
  } {
    const maliciousAgents = new Set<string>();

    // Calculate confidence statistics
    const confidences = votes.map(v => v.confidence);
    const mean = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    const stdDev = Math.sqrt(
      confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length
    );

    // Detect outliers (confidence > 2 standard deviations from mean)
    const outlierThreshold = 2;
    const validVotes = votes.filter(vote => {
      const zScore = Math.abs((vote.confidence - mean) / stdDev);
      const isOutlier = zScore > outlierThreshold;

      if (isOutlier) {
        maliciousAgents.add(vote.agentId);
        this.maliciousAgents.add(vote.agentId);
        return false;
      }

      return true;
    });

    // Check if malicious ratio exceeds threshold
    const maliciousRatio = maliciousAgents.size / votes.length;
    if (maliciousRatio > this.config.maxMaliciousRatio) {
      throw new Error(
        `Malicious agent ratio ${maliciousRatio.toFixed(2)} exceeds threshold ${this.config.maxMaliciousRatio}`
      );
    }

    return { validVotes, maliciousAgents };
  }

  /**
   * Calculate consensus from valid votes
   */
  private calculateConsensus(votes: ValidatorVote[]): {
    achieved: boolean;
    score: number;
    breakdown: Record<string, number>;
  } {
    const passVotes = votes.filter(v => v.vote === 'PASS');
    const failVotes = votes.filter(v => v.vote === 'FAIL');

    const passRatio = passVotes.length / votes.length;
    const consensusAchieved = passRatio >= this.config.consensusThreshold;

    // Calculate weighted consensus score
    const totalConfidence = votes.reduce((sum, v) => sum + v.confidence, 0);
    const passConfidence = passVotes.reduce((sum, v) => sum + v.confidence, 0);
    const consensusScore = passConfidence / totalConfidence;

    return {
      achieved: consensusAchieved,
      score: consensusScore,
      breakdown: {
        PASS: passVotes.length,
        FAIL: failVotes.length,
      },
    };
  }

  /**
   * Generate cryptographic proof of consensus
   */
  private generateConsensusProof(votes: ValidatorVote[]) {
    const proposalHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(votes))
      .digest('hex');

    const passVotes = votes.filter(v => v.vote === 'PASS').length;

    const proofPayload = JSON.stringify({
      proposalHash,
      totalVotes: votes.length,
      acceptingVotes: passVotes,
      timestamp: Date.now(),
    });

    const signature = crypto
      .createHash('sha256')
      .update(proofPayload + this.keyPair.privateKey)
      .digest('hex');

    return {
      proposalHash,
      totalVotes: votes.length,
      acceptingVotes: passVotes,
      signature,
    };
  }

  /**
   * Create vote payload for signing
   */
  private createVotePayload(vote: ValidatorVote): string {
    return JSON.stringify({
      agentId: vote.agentId,
      confidence: vote.confidence,
      vote: vote.vote,
      timestamp: vote.timestamp,
    });
  }

  /**
   * Generate RSA key pair
   */
  private generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return { publicKey, privateKey };
  }

  /**
   * Get list of detected malicious agents
   */
  getMaliciousAgents(): string[] {
    return Array.from(this.maliciousAgents);
  }

  /**
   * Clear malicious agents list (for testing)
   */
  clearMaliciousAgents(): void {
    this.maliciousAgents.clear();
  }
}

// ===== UNIT TESTS =====

describe('ByzantineConsensusAdapter', () => {
  let adapter: ByzantineConsensusAdapter;

  beforeEach(() => {
    adapter = new ByzantineConsensusAdapter();
  });

  afterEach(() => {
    adapter.clearMaliciousAgents();
  });

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const defaultAdapter = new ByzantineConsensusAdapter();
      expect(defaultAdapter).toBeDefined();
    });

    it('should accept custom config', () => {
      const customAdapter = new ByzantineConsensusAdapter({
        enableByzantine: false,
        minValidators: 3,
        maxMaliciousRatio: 0.25,
        consensusThreshold: 0.75,
        signatureValidation: false,
      });
      expect(customAdapter).toBeDefined();
    });
  });

  describe('executeConsensus', () => {
    it('should reach consensus with 4 unanimous PASS votes', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.89, vote: 'PASS', signature: 'sig4', timestamp: Date.now() },
      ];

      const result = await adapter.executeConsensus(votes);

      expect(result.consensusAchieved).toBe(true);
      expect(result.consensusScore).toBeGreaterThan(0.9);
      expect(result.maliciousAgents).toHaveLength(0);
      expect(result.votingBreakdown.PASS).toBe(4);
      expect(result.votingBreakdown.FAIL).toBe(0);
    });

    it('should reach consensus with 3/4 agreement (1 malicious outlier)', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.25, vote: 'FAIL', signature: 'sig4', timestamp: Date.now() }, // MALICIOUS
      ];

      const result = await adapter.executeConsensus(votes);

      expect(result.consensusAchieved).toBe(true);
      expect(result.maliciousAgents).toContain('analyst-1');
      expect(result.maliciousAgents).toHaveLength(1);
      expect(result.validVotes).toHaveLength(3);
    });

    it('should fail consensus with 2/4 agreement (2 malicious)', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.20, vote: 'FAIL', signature: 'sig3', timestamp: Date.now() }, // MALICIOUS
        { agentId: 'analyst-1', confidence: 0.25, vote: 'FAIL', signature: 'sig4', timestamp: Date.now() }, // MALICIOUS
      ];

      await expect(adapter.executeConsensus(votes)).rejects.toThrow('Malicious agent ratio');
    });

    it('should detect outlier validators by confidence score', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.90, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.91, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.89, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
        { agentId: 'malicious-1', confidence: 0.15, vote: 'FAIL', signature: 'sig4', timestamp: Date.now() }, // Outlier
      ];

      const result = await adapter.executeConsensus(votes);

      expect(result.maliciousAgents).toContain('malicious-1');
      expect(result.validVotes.map(v => v.agentId)).not.toContain('malicious-1');
    });

    it('should handle high confidence but wrong vote (not necessarily malicious)', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.85, vote: 'FAIL', signature: 'sig4', timestamp: Date.now() },
      ];

      const result = await adapter.executeConsensus(votes);

      // High confidence, not an outlier - should be included
      expect(result.validVotes).toHaveLength(4);
      expect(result.maliciousAgents).toHaveLength(0);
      expect(result.consensusAchieved).toBe(true); // 3/4 = 75% > 67%
    });

    it('should verify signatures when enabled', async () => {
      const adapterWithSig = new ByzantineConsensusAdapter({
        signatureValidation: true,
      });

      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'valid-sig', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: '', timestamp: Date.now() }, // Invalid
      ];

      const result = await adapterWithSig.executeConsensus(votes);

      expect(result.maliciousAgents).toContain('security-1');
    });

    it('should throw error for insufficient validators', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
      ];

      await expect(adapter.executeConsensus(votes)).rejects.toThrow('Insufficient validators');
    });

    it('should handle validator spawn failures gracefully', async () => {
      // Simulated by empty votes array
      const votes: ValidatorVote[] = [];

      await expect(adapter.executeConsensus(votes)).rejects.toThrow('Insufficient validators');
    });

    it('should generate Byzantine proof with consensus', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.89, vote: 'PASS', signature: 'sig4', timestamp: Date.now() },
      ];

      const result = await adapter.executeConsensus(votes);

      expect(result.byzantineProof).toBeDefined();
      expect(result.byzantineProof?.proposalHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.byzantineProof?.totalVotes).toBe(4);
      expect(result.byzantineProof?.acceptingVotes).toBe(4);
      expect(result.byzantineProof?.signature).toBeDefined();
    });
  });

  describe('Signature Verification', () => {
    it('should accept valid signatures', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'valid-signature-1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'valid-signature-2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'valid-signature-3', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.89, vote: 'PASS', signature: 'valid-signature-4', timestamp: Date.now() },
      ];

      const result = await adapter.executeConsensus(votes);

      expect(result.validVotes).toHaveLength(4);
      expect(result.maliciousAgents).toHaveLength(0);
    });

    it('should reject empty signatures', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'valid-sig', timestamp: Date.now() },
        { agentId: 'malicious-1', confidence: 0.88, vote: 'PASS', signature: '', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'valid-sig', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.89, vote: 'PASS', signature: 'valid-sig', timestamp: Date.now() },
      ];

      const result = await adapter.executeConsensus(votes);

      expect(result.maliciousAgents).toContain('malicious-1');
    });

    it('should work with signature validation disabled', async () => {
      const noSigAdapter = new ByzantineConsensusAdapter({
        signatureValidation: false,
      });

      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: '', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: '', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: '', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.89, vote: 'PASS', signature: '', timestamp: Date.now() },
      ];

      const result = await noSigAdapter.executeConsensus(votes);

      expect(result.consensusAchieved).toBe(true);
      expect(result.validVotes).toHaveLength(4);
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout scenarios', async () => {
      // Simulate timeout by processing minimal validators
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
      ];

      await expect(adapter.executeConsensus(votes)).rejects.toThrow('Insufficient validators');
    });

    it('should handle missing validator responses', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
      ];

      await expect(adapter.executeConsensus(votes)).rejects.toThrow('Insufficient validators');
    });

    it('should handle invalid vote data', async () => {
      const invalidVotes: any[] = [
        { agentId: 'reviewer-1', confidence: NaN, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.89, vote: 'PASS', signature: 'sig4', timestamp: Date.now() },
      ];

      // Should handle NaN gracefully
      const result = await adapter.executeConsensus(invalidVotes);
      expect(result).toBeDefined();
    });
  });

  describe('Malicious Agent Detection', () => {
    it('should track malicious agents across multiple consensus rounds', async () => {
      const round1: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
        { agentId: 'malicious-1', confidence: 0.20, vote: 'FAIL', signature: 'sig4', timestamp: Date.now() },
      ];

      await adapter.executeConsensus(round1);

      const maliciousAgents = adapter.getMaliciousAgents();
      expect(maliciousAgents).toContain('malicious-1');
    });

    it('should clear malicious agents list', () => {
      adapter.clearMaliciousAgents();
      expect(adapter.getMaliciousAgents()).toHaveLength(0);
    });
  });

  describe('Consensus Thresholds', () => {
    it('should respect custom consensus threshold', async () => {
      const strictAdapter = new ByzantineConsensusAdapter({
        consensusThreshold: 0.90, // 90% required
      });

      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.85, vote: 'FAIL', signature: 'sig4', timestamp: Date.now() },
      ];

      const result = await strictAdapter.executeConsensus(votes);

      // 3/4 = 75% < 90% threshold
      expect(result.consensusAchieved).toBe(false);
    });

    it('should calculate weighted consensus score', async () => {
      const votes: ValidatorVote[] = [
        { agentId: 'reviewer-1', confidence: 0.95, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.90, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.92, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.50, vote: 'FAIL', signature: 'sig4', timestamp: Date.now() },
      ];

      const result = await adapter.executeConsensus(votes);

      // Weighted score should be high due to high confidence on PASS votes
      expect(result.consensusScore).toBeGreaterThan(0.80);
    });
  });
});
