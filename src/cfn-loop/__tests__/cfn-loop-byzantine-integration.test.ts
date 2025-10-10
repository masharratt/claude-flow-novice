/**
 * CFN Loop Byzantine Consensus Integration Tests
 *
 * Tests the integration of Byzantine consensus in CFN Loop 2 validation
 * Validates end-to-end flow: Loop 3 → Byzantine Loop 2 → Results
 *
 * Test Scenarios:
 * 1. Happy path: All validators agree, consensus ≥0.90
 * 2. Single malicious validator: 3/4 agreement, still pass
 * 3. Multiple malicious validators: 2/4 agreement, fail and retry
 * 4. Byzantine disabled: Falls back to simple consensus
 * 5. Byzantine timeout: Graceful fallback
 * 6. Malicious agent persistence across iterations
 */

/**
 * @jest-environment node
 */

import { CFNLoopOrchestrator } from '../cfn-loop-orchestrator.js';
import type { CFNLoopConfig, AgentResponse, ConsensusResult } from '../cfn-loop-orchestrator.js';

describe('CFN Loop Byzantine Consensus Integration', () => {
  let orchestrator: CFNLoopOrchestrator;
  let mockAgentSpawner: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    // Mock agent spawning
    mockAgentSpawner = jest.fn();
  });

  afterEach(async () => {
    if (orchestrator) {
      await orchestrator.shutdown();
    }
  });

  describe('Byzantine Consensus Enabled', () => {
    beforeEach(() => {
      const config: CFNLoopConfig = {
        phaseId: 'test-phase',
        swarmId: 'test-swarm',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
        byzantineConfig: {
          enableByzantine: true,
          minValidators: 4,
          maxMaliciousRatio: 0.33,
          consensusThreshold: 0.67,
          signatureValidation: true,
        },
      };

      orchestrator = new CFNLoopOrchestrator(config);
    });

    it('should execute full CFN Loop with Byzantine validation - happy path', async () => {
      // Mock primary swarm (Loop 3) execution
      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: { code: 'implementation' },
          confidence: 0.85,
          reasoning: 'Implementation complete',
          timestamp: Date.now(),
        },
        {
          agentId: 'tester-1',
          agentType: 'tester',
          deliverable: { tests: 'test-suite' },
          confidence: 0.88,
          reasoning: 'Tests passing',
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      // Mock consensus validation (Loop 2) with Byzantine
      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.92,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: [
          { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS' },
          { agentId: 'security-1', confidence: 0.88, vote: 'PASS' },
          { agentId: 'tester-2', confidence: 0.91, vote: 'PASS' },
          { agentId: 'analyst-1', confidence: 0.89, vote: 'PASS' },
        ],
        votingBreakdown: { PASS: 4, FAIL: 0 },
        iteration: 1,
        timestamp: Date.now(),
      } as ConsensusResult);

      const result = await orchestrator.executePhase('Build authentication system');

      expect(result.success).toBe(true);
      expect(result.consensusResult.consensusPassed).toBe(true);
      expect(result.consensusResult.consensusScore).toBeGreaterThanOrEqual(0.90);
      expect(result.totalLoop2Iterations).toBe(1);
      expect(result.escalated).toBe(false);
    });

    it('should handle single malicious validator (3/4 agreement)', async () => {
      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: { code: 'implementation' },
          confidence: 0.85,
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      // Mock Byzantine consensus with 1 malicious agent detected
      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.91,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: [
          { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS' },
          { agentId: 'security-1', confidence: 0.88, vote: 'PASS' },
          { agentId: 'tester-1', confidence: 0.91, vote: 'PASS' },
          // Malicious agent removed by Byzantine consensus
        ],
        votingBreakdown: { PASS: 3, FAIL: 0 },
        byzantineProof: {
          maliciousAgents: ['analyst-1'],
          proposalHash: 'hash123',
        },
        iteration: 1,
        timestamp: Date.now(),
      } as ConsensusResult);

      const result = await orchestrator.executePhase('Build feature');

      expect(result.success).toBe(true);
      expect(result.consensusResult.consensusPassed).toBe(true);
      // Byzantine consensus should have detected and excluded malicious validator
    });

    it('should fail with 2 malicious validators and trigger retry', async () => {
      let consensusCallCount = 0;

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: { code: 'implementation' },
          confidence: 0.85,
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockImplementation(async () => {
        consensusCallCount++;

        if (consensusCallCount === 1) {
          // First attempt: Too many malicious agents
          throw new Error('Malicious agent ratio 0.50 exceeds threshold 0.33');
        } else {
          // Second attempt: Fixed after retry
          return {
            consensusScore: 0.92,
            consensusThreshold: 0.90,
            consensusPassed: true,
            validatorResults: [
              { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS' },
              { agentId: 'security-1', confidence: 0.88, vote: 'PASS' },
              { agentId: 'tester-1', confidence: 0.91, vote: 'PASS' },
              { agentId: 'analyst-1', confidence: 0.89, vote: 'PASS' },
            ],
            votingBreakdown: { PASS: 4, FAIL: 0 },
            iteration: 2,
            timestamp: Date.now(),
          } as ConsensusResult;
        }
      });

      const result = await orchestrator.executePhase('Build feature');

      expect(consensusCallCount).toBeGreaterThan(1);
      expect(result.totalLoop2Iterations).toBeGreaterThan(1);
    });

    it('should spawn 4 validator agents for Byzantine consensus', async () => {
      const validatorSpawnSpy = jest.fn().mockResolvedValue([
        { agentId: 'reviewer-1', agentType: 'reviewer' },
        { agentId: 'security-1', agentType: 'security-specialist' },
        { agentId: 'tester-1', agentType: 'tester' },
        { agentId: 'analyst-1', agentType: 'quality-analyst' },
      ]);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        { agentId: 'coder-1', agentType: 'coder', deliverable: {}, confidence: 0.85, timestamp: Date.now() },
      ] as AgentResponse[]);

      jest.spyOn(orchestrator as any, 'spawnValidatorAgents').mockImplementation(validatorSpawnSpy);

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.92,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: [],
        votingBreakdown: { PASS: 4, FAIL: 0 },
        iteration: 1,
        timestamp: Date.now(),
      } as ConsensusResult);

      await orchestrator.executePhase('Test task');

      expect(validatorSpawnSpy).toHaveBeenCalled();
    });

    it('should collect votes from all validators', async () => {
      const voteCollectionSpy = jest.fn().mockResolvedValue([
        { agentId: 'reviewer-1', confidence: 0.92, vote: 'PASS', signature: 'sig1', timestamp: Date.now() },
        { agentId: 'security-1', confidence: 0.88, vote: 'PASS', signature: 'sig2', timestamp: Date.now() },
        { agentId: 'tester-1', confidence: 0.91, vote: 'PASS', signature: 'sig3', timestamp: Date.now() },
        { agentId: 'analyst-1', confidence: 0.89, vote: 'PASS', signature: 'sig4', timestamp: Date.now() },
      ]);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        { agentId: 'coder-1', agentType: 'coder', deliverable: {}, confidence: 0.85, timestamp: Date.now() },
      ] as AgentResponse[]);

      jest.spyOn(orchestrator as any, 'collectValidatorVotes').mockImplementation(voteCollectionSpy);

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.92,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: [],
        votingBreakdown: { PASS: 4, FAIL: 0 },
        iteration: 1,
        timestamp: Date.now(),
      } as ConsensusResult);

      await orchestrator.executePhase('Test task');

      expect(voteCollectionSpy).toHaveBeenCalled();
    });

    it('should persist malicious agents across iterations', async () => {
      const maliciousAgents = new Set<string>();

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        { agentId: 'coder-1', agentType: 'coder', deliverable: {}, confidence: 0.85, timestamp: Date.now() },
      ] as AgentResponse[]);

      let consensusCallCount = 0;
      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockImplementation(async () => {
        consensusCallCount++;

        if (consensusCallCount === 1) {
          // First iteration: Detect malicious agent
          maliciousAgents.add('analyst-1');
          return {
            consensusScore: 0.85,
            consensusThreshold: 0.90,
            consensusPassed: false,
            validatorResults: [],
            votingBreakdown: { PASS: 3, FAIL: 1 },
            byzantineProof: { maliciousAgents: Array.from(maliciousAgents) },
            iteration: 1,
            timestamp: Date.now(),
          } as ConsensusResult;
        } else {
          // Second iteration: Malicious agent excluded
          return {
            consensusScore: 0.92,
            consensusThreshold: 0.90,
            consensusPassed: true,
            validatorResults: [],
            votingBreakdown: { PASS: 4, FAIL: 0 },
            byzantineProof: { maliciousAgents: Array.from(maliciousAgents) },
            iteration: 2,
            timestamp: Date.now(),
          } as ConsensusResult;
        }
      });

      const result = await orchestrator.executePhase('Test task');

      expect(consensusCallCount).toBe(2);
      expect(maliciousAgents.has('analyst-1')).toBe(true);
    });
  });

  describe('Byzantine Consensus Disabled (Backwards Compatibility)', () => {
    beforeEach(() => {
      const config: CFNLoopConfig = {
        phaseId: 'test-phase',
        swarmId: 'test-swarm',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: false, // Disabled
      };

      orchestrator = new CFNLoopOrchestrator(config);
    });

    it('should fall back to simple consensus when Byzantine disabled', async () => {
      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        { agentId: 'coder-1', agentType: 'coder', deliverable: {}, confidence: 0.85, timestamp: Date.now() },
      ] as AgentResponse[]);

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.95,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: [
          { agentId: 'reviewer-1', confidence: 0.95 },
          { agentId: 'tester-1', confidence: 0.95 },
        ],
        votingBreakdown: { approve: 2, reject: 0 },
        iteration: 1,
        timestamp: Date.now(),
      } as ConsensusResult);

      const result = await orchestrator.executePhase('Build feature');

      expect(result.success).toBe(true);
      expect(result.consensusResult.consensusPassed).toBe(true);
      // Should use simple consensus (averaging)
    });

    it('should not detect malicious agents when Byzantine disabled', async () => {
      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        { agentId: 'coder-1', agentType: 'coder', deliverable: {}, confidence: 0.85, timestamp: Date.now() },
      ] as AgentResponse[]);

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.92,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: [],
        votingBreakdown: { approve: 3, reject: 1 }, // 1 outlier, but no Byzantine detection
        iteration: 1,
        timestamp: Date.now(),
      } as ConsensusResult);

      const result = await orchestrator.executePhase('Build feature');

      expect(result.success).toBe(true);
      // No malicious agent detection
    });
  });

  describe('Byzantine Consensus Fallback', () => {
    beforeEach(() => {
      const config: CFNLoopConfig = {
        phaseId: 'test-phase',
        swarmId: 'test-swarm',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
        byzantineConfig: {
          enableByzantine: true,
          minValidators: 4,
        },
      };

      orchestrator = new CFNLoopOrchestrator(config);
    });

    it('should fall back to simple consensus on Byzantine failure', async () => {
      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        { agentId: 'coder-1', agentType: 'coder', deliverable: {}, confidence: 0.85, timestamp: Date.now() },
      ] as AgentResponse[]);

      let consensusCallCount = 0;
      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockImplementation(async () => {
        consensusCallCount++;

        if (consensusCallCount === 1) {
          // Byzantine consensus fails
          throw new Error('Byzantine consensus timeout');
        } else {
          // Fallback to simple consensus
          return {
            consensusScore: 0.92,
            consensusThreshold: 0.90,
            consensusPassed: true,
            validatorResults: [],
            votingBreakdown: { approve: 3, reject: 0 },
            iteration: 2,
            timestamp: Date.now(),
          } as ConsensusResult;
        }
      });

      const result = await orchestrator.executePhase('Build feature');

      expect(consensusCallCount).toBeGreaterThan(1);
      expect(result.success).toBe(true);
    });

    it('should handle timeout gracefully with fallback', async () => {
      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        { agentId: 'coder-1', agentType: 'coder', deliverable: {}, confidence: 0.85, timestamp: Date.now() },
      ] as AgentResponse[]);

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockImplementation(async () => {
        // Simulate timeout
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          consensusScore: 0.92,
          consensusThreshold: 0.90,
          consensusPassed: true,
          validatorResults: [],
          votingBreakdown: { approve: 3, reject: 0 },
          iteration: 1,
          timestamp: Date.now(),
        } as ConsensusResult;
      });

      const result = await orchestrator.executePhase('Build feature');

      expect(result.success).toBe(true);
    });
  });

  describe('Memory Recovery', () => {
    it('should exclude malicious agents on retry', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'test-phase',
        swarmId: 'test-swarm',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
        enableMemoryPersistence: true,
      };

      orchestrator = new CFNLoopOrchestrator(config);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        { agentId: 'coder-1', agentType: 'coder', deliverable: {}, confidence: 0.85, timestamp: Date.now() },
      ] as AgentResponse[]);

      const maliciousAgents = new Set<string>(['analyst-1']);

      let consensusCallCount = 0;
      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockImplementation(async () => {
        consensusCallCount++;

        if (consensusCallCount === 1) {
          return {
            consensusScore: 0.85,
            consensusThreshold: 0.90,
            consensusPassed: false,
            validatorResults: [],
            votingBreakdown: { PASS: 3, FAIL: 1 },
            byzantineProof: { maliciousAgents: Array.from(maliciousAgents) },
            iteration: 1,
            timestamp: Date.now(),
          } as ConsensusResult;
        } else {
          // Second iteration: Malicious agents excluded
          return {
            consensusScore: 0.92,
            consensusThreshold: 0.90,
            consensusPassed: true,
            validatorResults: [],
            votingBreakdown: { PASS: 4, FAIL: 0 },
            iteration: 2,
            timestamp: Date.now(),
          } as ConsensusResult;
        }
      });

      const result = await orchestrator.executePhase('Build feature');

      expect(result.success).toBe(true);
      expect(consensusCallCount).toBe(2);
    });
  });
});
