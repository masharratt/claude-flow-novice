/**
 * Test Utilities for CFN Loop Byzantine Consensus Tests
 *
 * Provides mock data factories, test helpers, and utilities for testing
 * Byzantine consensus integration in CFN Loop 2.
 */

import crypto from 'crypto';

// ===== TYPE DEFINITIONS =====

export interface MockValidatorVote {
  agentId: string;
  confidence: number;
  vote: 'PASS' | 'FAIL';
  signature: string;
  timestamp: number;
  reasoning?: string;
}

export interface MockAgentResponse {
  agentId: string;
  agentType: string;
  deliverable: any;
  confidence?: number;
  reasoning?: string;
  blockers?: string[];
  timestamp: number;
}

export interface TestScenario {
  name: string;
  description: string;
  votes: MockValidatorVote[];
  expectedConsensus: boolean;
  expectedMalicious: string[];
}

// ===== MOCK DATA FACTORIES =====

/**
 * Create mock validator votes with configurable scenarios
 */
export class ValidatorVoteFactory {
  private static idCounter = 0;

  /**
   * Create unanimous PASS votes (all validators agree)
   */
  static createUnanimousPassVotes(count: number = 4): MockValidatorVote[] {
    return Array.from({ length: count }, (_, i) => ({
      agentId: `validator-${this.idCounter++}`,
      confidence: 0.88 + Math.random() * 0.12, // 0.88 - 1.00
      vote: 'PASS' as const,
      signature: this.generateSignature(),
      timestamp: Date.now(),
      reasoning: `Validation passed with high confidence`,
    }));
  }

  /**
   * Create votes with one malicious outlier
   */
  static createVotesWithOneMalicious(totalCount: number = 4): MockValidatorVote[] {
    const votes: MockValidatorVote[] = [];

    // Create normal votes
    for (let i = 0; i < totalCount - 1; i++) {
      votes.push({
        agentId: `validator-${this.idCounter++}`,
        confidence: 0.88 + Math.random() * 0.12,
        vote: 'PASS',
        signature: this.generateSignature(),
        timestamp: Date.now(),
        reasoning: 'Validation passed',
      });
    }

    // Add malicious outlier
    votes.push({
      agentId: `malicious-validator-${this.idCounter++}`,
      confidence: 0.20 + Math.random() * 0.10, // Very low confidence
      vote: 'FAIL',
      signature: this.generateSignature(),
      timestamp: Date.now(),
      reasoning: 'Critical issues found (malicious)',
    });

    return votes;
  }

  /**
   * Create votes with multiple malicious agents
   */
  static createVotesWithMultipleMalicious(
    totalCount: number = 4,
    maliciousCount: number = 2
  ): MockValidatorVote[] {
    const votes: MockValidatorVote[] = [];

    // Create normal votes
    for (let i = 0; i < totalCount - maliciousCount; i++) {
      votes.push({
        agentId: `validator-${this.idCounter++}`,
        confidence: 0.88 + Math.random() * 0.12,
        vote: 'PASS',
        signature: this.generateSignature(),
        timestamp: Date.now(),
      });
    }

    // Add malicious votes
    for (let i = 0; i < maliciousCount; i++) {
      votes.push({
        agentId: `malicious-validator-${this.idCounter++}`,
        confidence: 0.15 + Math.random() * 0.10,
        vote: 'FAIL',
        signature: this.generateSignature(),
        timestamp: Date.now(),
        reasoning: 'Malicious vote',
      });
    }

    return votes;
  }

  /**
   * Create votes with high confidence but diverse opinions
   */
  static createDiverseHighConfidenceVotes(passCount: number = 3, failCount: number = 1): MockValidatorVote[] {
    const votes: MockValidatorVote[] = [];

    // Create PASS votes
    for (let i = 0; i < passCount; i++) {
      votes.push({
        agentId: `validator-pass-${this.idCounter++}`,
        confidence: 0.85 + Math.random() * 0.10,
        vote: 'PASS',
        signature: this.generateSignature(),
        timestamp: Date.now(),
        reasoning: 'Quality standards met',
      });
    }

    // Create FAIL votes (not outliers, just different opinion)
    for (let i = 0; i < failCount; i++) {
      votes.push({
        agentId: `validator-fail-${this.idCounter++}`,
        confidence: 0.82 + Math.random() * 0.08,
        vote: 'FAIL',
        signature: this.generateSignature(),
        timestamp: Date.now(),
        reasoning: 'Some concerns remain',
      });
    }

    return votes;
  }

  /**
   * Create votes with invalid signatures
   */
  static createVotesWithInvalidSignatures(totalCount: number = 4, invalidCount: number = 1): MockValidatorVote[] {
    const votes: MockValidatorVote[] = [];

    // Create valid votes
    for (let i = 0; i < totalCount - invalidCount; i++) {
      votes.push({
        agentId: `validator-${this.idCounter++}`,
        confidence: 0.90,
        vote: 'PASS',
        signature: this.generateSignature(),
        timestamp: Date.now(),
      });
    }

    // Create votes with invalid signatures
    for (let i = 0; i < invalidCount; i++) {
      votes.push({
        agentId: `invalid-validator-${this.idCounter++}`,
        confidence: 0.90,
        vote: 'PASS',
        signature: '', // Invalid empty signature
        timestamp: Date.now(),
      });
    }

    return votes;
  }

  /**
   * Generate cryptographic signature (mock)
   */
  private static generateSignature(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  /**
   * Reset ID counter (for test isolation)
   */
  static resetCounter(): void {
    this.idCounter = 0;
  }
}

/**
 * Create mock agent responses for Loop 3 primary swarm
 */
export class AgentResponseFactory {
  private static idCounter = 0;

  /**
   * Create successful coder agent response
   */
  static createCoderResponse(confidence: number = 0.85): MockAgentResponse {
    return {
      agentId: `coder-${this.idCounter++}`,
      agentType: 'coder',
      deliverable: {
        files: ['implementation.ts', 'utils.ts'],
        linesOfCode: 450,
        implementation: 'Complete implementation of feature',
      },
      confidence,
      reasoning: 'Implementation complete with tests',
      timestamp: Date.now(),
    };
  }

  /**
   * Create successful tester agent response
   */
  static createTesterResponse(coverage: number = 85): MockAgentResponse {
    return {
      agentId: `tester-${this.idCounter++}`,
      agentType: 'tester',
      deliverable: {
        files: ['feature.test.ts'],
        testsPassed: 42,
        testsFailed: 0,
        coverage,
      },
      confidence: coverage / 100,
      reasoning: `All tests passing with ${coverage}% coverage`,
      timestamp: Date.now(),
    };
  }

  /**
   * Create security specialist agent response
   */
  static createSecurityResponse(vulnerabilities: number = 0): MockAgentResponse {
    return {
      agentId: `security-${this.idCounter++}`,
      agentType: 'security-specialist',
      deliverable: {
        securityAudit: vulnerabilities === 0 ? 'passed' : 'failed',
        vulnerabilities: Array.from({ length: vulnerabilities }, (_, i) => ({
          severity: 'high',
          description: `Security issue ${i + 1}`,
        })),
      },
      confidence: vulnerabilities === 0 ? 0.92 : 0.50,
      reasoning: vulnerabilities === 0 ? 'No security issues found' : 'Security vulnerabilities detected',
      blockers: vulnerabilities > 0 ? ['Fix security vulnerabilities'] : [],
      timestamp: Date.now(),
    };
  }

  /**
   * Create reviewer agent response
   */
  static createReviewerResponse(issues: number = 0): MockAgentResponse {
    return {
      agentId: `reviewer-${this.idCounter++}`,
      agentType: 'reviewer',
      deliverable: {
        codeQuality: issues === 0 ? 'excellent' : 'needs-work',
        issues: Array.from({ length: issues }, (_, i) => ({
          type: 'maintainability',
          description: `Code quality issue ${i + 1}`,
        })),
      },
      confidence: issues === 0 ? 0.90 : 0.65,
      reasoning: issues === 0 ? 'Code quality is excellent' : 'Code quality issues found',
      timestamp: Date.now(),
    };
  }

  /**
   * Create complete primary swarm response set
   */
  static createPrimarySwarmResponses(quality: 'high' | 'medium' | 'low' = 'high'): MockAgentResponse[] {
    switch (quality) {
      case 'high':
        return [
          this.createCoderResponse(0.88),
          this.createTesterResponse(92),
          this.createSecurityResponse(0),
          this.createReviewerResponse(0),
        ];
      case 'medium':
        return [
          this.createCoderResponse(0.75),
          this.createTesterResponse(78),
          this.createSecurityResponse(1),
          this.createReviewerResponse(2),
        ];
      case 'low':
        return [
          this.createCoderResponse(0.60),
          this.createTesterResponse(55),
          this.createSecurityResponse(3),
          this.createReviewerResponse(5),
        ];
    }
  }

  /**
   * Reset ID counter
   */
  static resetCounter(): void {
    this.idCounter = 0;
  }
}

// ===== TEST SCENARIOS =====

/**
 * Predefined test scenarios for Byzantine consensus
 */
export const testScenarios: TestScenario[] = [
  {
    name: 'Unanimous Agreement',
    description: 'All 4 validators agree with PASS vote',
    votes: ValidatorVoteFactory.createUnanimousPassVotes(4),
    expectedConsensus: true,
    expectedMalicious: [],
  },
  {
    name: 'Single Malicious Agent',
    description: '3 validators PASS, 1 malicious outlier FAIL',
    votes: ValidatorVoteFactory.createVotesWithOneMalicious(4),
    expectedConsensus: true,
    expectedMalicious: [], // Should be detected and excluded
  },
  {
    name: 'Multiple Malicious Agents',
    description: '2 validators PASS, 2 malicious FAIL (should fail consensus)',
    votes: ValidatorVoteFactory.createVotesWithMultipleMalicious(4, 2),
    expectedConsensus: false,
    expectedMalicious: [], // Should throw error for exceeding malicious ratio
  },
  {
    name: 'High Confidence Disagreement',
    description: '3 PASS, 1 FAIL - all high confidence (not malicious)',
    votes: ValidatorVoteFactory.createDiverseHighConfidenceVotes(3, 1),
    expectedConsensus: true,
    expectedMalicious: [],
  },
  {
    name: 'Invalid Signatures',
    description: '3 valid, 1 invalid signature (should be excluded)',
    votes: ValidatorVoteFactory.createVotesWithInvalidSignatures(4, 1),
    expectedConsensus: true,
    expectedMalicious: [], // Invalid signature agent excluded
  },
];

// ===== TEST HELPERS =====

/**
 * Assert consensus result matches expectations
 */
export function assertConsensusResult(
  result: any,
  expected: {
    passed: boolean;
    minScore?: number;
    maxMalicious?: number;
  }
): void {
  if (!result) {
    throw new Error('Consensus result is undefined');
  }

  // Check consensus passed/failed
  if (result.consensusPassed !== expected.passed) {
    throw new Error(
      `Expected consensusPassed=${expected.passed}, got ${result.consensusPassed}`
    );
  }

  // Check minimum consensus score
  if (expected.minScore !== undefined && result.consensusScore < expected.minScore) {
    throw new Error(
      `Expected consensusScore >= ${expected.minScore}, got ${result.consensusScore}`
    );
  }

  // Check maximum malicious agents
  if (expected.maxMalicious !== undefined) {
    const maliciousCount = result.maliciousAgents?.length || 0;
    if (maliciousCount > expected.maxMalicious) {
      throw new Error(
        `Expected maliciousAgents <= ${expected.maxMalicious}, got ${maliciousCount}`
      );
    }
  }
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  checkIntervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await condition();
    if (result) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }

  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

/**
 * Measure execution time of async function
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const startTime = Date.now();
  const result = await fn();
  const durationMs = Date.now() - startTime;
  return { result, durationMs };
}

/**
 * Generate random confidence score in range
 */
export function randomConfidence(min: number = 0.7, max: number = 1.0): number {
  return min + Math.random() * (max - min);
}

/**
 * Create mock consensus result
 */
export function createMockConsensusResult(overrides: Partial<any> = {}): any {
  return {
    consensusScore: 0.92,
    consensusThreshold: 0.90,
    consensusPassed: true,
    validatorResults: [],
    votingBreakdown: { PASS: 4, FAIL: 0 },
    maliciousAgents: [],
    iteration: 1,
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Verify Byzantine proof structure
 */
export function verifyByzantineProof(proof: any): void {
  if (!proof) {
    throw new Error('Byzantine proof is missing');
  }

  const requiredFields = ['proposalHash', 'totalVotes', 'acceptingVotes', 'signature'];
  for (const field of requiredFields) {
    if (!(field in proof)) {
      throw new Error(`Byzantine proof missing required field: ${field}`);
    }
  }

  // Verify proposal hash format (64-character hex string)
  if (!/^[a-f0-9]{64}$/.test(proof.proposalHash)) {
    throw new Error(`Invalid proposalHash format: ${proof.proposalHash}`);
  }

  // Verify vote counts
  if (proof.totalVotes < 1) {
    throw new Error(`Invalid totalVotes: ${proof.totalVotes}`);
  }

  if (proof.acceptingVotes > proof.totalVotes) {
    throw new Error(
      `Accepting votes (${proof.acceptingVotes}) exceeds total votes (${proof.totalVotes})`
    );
  }
}

/**
 * Clean up test resources
 */
export function cleanupTestResources(): void {
  ValidatorVoteFactory.resetCounter();
  AgentResponseFactory.resetCounter();
}
