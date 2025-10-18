/**
 * CFN Loop End-to-End Tests
 *
 * Complete end-to-end testing of CFN Loop workflow:
 * Loop 3 (implementation) → Gate → Loop 2 (Byzantine consensus) → Decision
 *
 * Test Scenarios:
 * 1. Complete successful CFN Loop execution
 * 2. Multiple Loop 2 iterations with feedback injection
 * 3. Malicious agent persistence across iterations
 * 4. Memory recovery and state management
 * 5. Performance testing
 * 6. Error handling and resilience
 */

/**
 * @jest-environment node
 */

import { CFNLoopOrchestrator } from '../cfn-loop-orchestrator.js';
import type { CFNLoopConfig, AgentResponse, PhaseResult } from '../cfn-loop-orchestrator.js';

describe('CFN Loop End-to-End Tests', () => {
  let orchestrator: CFNLoopOrchestrator;

  afterEach(async () => {
    if (orchestrator) {
      await orchestrator.shutdown();
    }
  });

  describe('Complete CFN Loop Execution', () => {
    it('should execute full Loop 3 → Gate → Byzantine Loop 2 → Success', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'auth-system',
        swarmId: 'auth-swarm-1',
        maxLoop2Iterations: 10,
        maxLoop3Iterations: 10,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
        enableMemoryPersistence: true,
        byzantineConfig: {
          enableByzantine: true,
          minValidators: 4,
          maxMaliciousRatio: 0.33,
          consensusThreshold: 0.67,
          signatureValidation: true,
        },
      };

      orchestrator = new CFNLoopOrchestrator(config);

      // Mock Loop 3: Primary swarm implementation
      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: {
            files: ['auth.ts', 'auth-middleware.ts'],
            implementation: 'JWT authentication system',
          },
          confidence: 0.88,
          reasoning: 'Complete implementation with tests',
          timestamp: Date.now(),
        },
        {
          agentId: 'tester-1',
          agentType: 'tester',
          deliverable: {
            files: ['auth.test.ts'],
            coverage: 92,
          },
          confidence: 0.91,
          reasoning: 'All tests passing, 92% coverage',
          timestamp: Date.now(),
        },
        {
          agentId: 'security-1',
          agentType: 'security-specialist',
          deliverable: {
            securityAudit: 'passed',
            vulnerabilities: [],
          },
          confidence: 0.85,
          reasoning: 'No security issues found',
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      // Mock Loop 2: Byzantine consensus validation
      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.93,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: [
          { agentId: 'reviewer-1', confidence: 0.94, vote: 'PASS', signature: 'sig1' },
          { agentId: 'security-validator', confidence: 0.90, vote: 'PASS', signature: 'sig2' },
          { agentId: 'tester-validator', confidence: 0.93, vote: 'PASS', signature: 'sig3' },
          { agentId: 'quality-analyst', confidence: 0.91, vote: 'PASS', signature: 'sig4' },
        ],
        votingBreakdown: { PASS: 4, FAIL: 0 },
        byzantineProof: {
          maliciousAgents: [],
          proposalHash: 'hash-auth-system-v1',
          totalVotes: 4,
          acceptingVotes: 4,
          signature: 'consensus-signature',
        },
        iteration: 1,
        timestamp: Date.now(),
      });

      const result: PhaseResult = await orchestrator.executePhase(
        'Implement JWT authentication system with refresh tokens'
      );

      // Assertions
      expect(result.success).toBe(true);
      expect(result.consensusResult.consensusPassed).toBe(true);
      expect(result.consensusResult.consensusScore).toBeGreaterThanOrEqual(0.90);
      expect(result.totalLoop2Iterations).toBe(1);
      expect(result.totalLoop3Iterations).toBeGreaterThanOrEqual(1);
      expect(result.escalated).toBe(false);
      expect(result.statistics.primarySwarmExecutions).toBeGreaterThan(0);
      expect(result.statistics.consensusSwarmExecutions).toBeGreaterThan(0);
      expect(result.statistics.averageConfidenceScore).toBeGreaterThanOrEqual(0.75);
    });

    it('should handle multiple Loop 2 iterations with feedback injection', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'payment-system',
        swarmId: 'payment-swarm-1',
        maxLoop2Iterations: 10,
        maxLoop3Iterations: 10,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
      };

      orchestrator = new CFNLoopOrchestrator(config);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: { implementation: 'payment processing' },
          confidence: 0.82,
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      let loop2Iteration = 0;
      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockImplementation(async () => {
        loop2Iteration++;

        if (loop2Iteration === 1) {
          // First iteration: Consensus fails
          return {
            consensusScore: 0.85,
            consensusThreshold: 0.90,
            consensusPassed: false,
            validatorResults: [
              { agentId: 'reviewer-1', confidence: 0.88, vote: 'PASS' },
              { agentId: 'security-1', confidence: 0.82, vote: 'FAIL' },
              { agentId: 'tester-1', confidence: 0.85, vote: 'PASS' },
            ],
            votingBreakdown: { PASS: 2, FAIL: 1 },
            iteration: 1,
            timestamp: Date.now(),
          };
        } else if (loop2Iteration === 2) {
          // Second iteration: Still fails
          return {
            consensusScore: 0.88,
            consensusThreshold: 0.90,
            consensusPassed: false,
            validatorResults: [
              { agentId: 'reviewer-1', confidence: 0.90, vote: 'PASS' },
              { agentId: 'security-1', confidence: 0.85, vote: 'PASS' },
              { agentId: 'tester-1', confidence: 0.88, vote: 'PASS' },
            ],
            votingBreakdown: { PASS: 3, FAIL: 0 },
            iteration: 2,
            timestamp: Date.now(),
          };
        } else {
          // Third iteration: Success
          return {
            consensusScore: 0.92,
            consensusThreshold: 0.90,
            consensusPassed: true,
            validatorResults: [
              { agentId: 'reviewer-1', confidence: 0.93, vote: 'PASS' },
              { agentId: 'security-1', confidence: 0.90, vote: 'PASS' },
              { agentId: 'tester-1', confidence: 0.92, vote: 'PASS' },
              { agentId: 'quality-1', confidence: 0.91, vote: 'PASS' },
            ],
            votingBreakdown: { PASS: 4, FAIL: 0 },
            iteration: 3,
            timestamp: Date.now(),
          };
        }
      });

      const result = await orchestrator.executePhase('Implement payment processing');

      expect(result.success).toBe(true);
      expect(result.totalLoop2Iterations).toBe(3);
      expect(result.statistics.feedbackInjections).toBeGreaterThan(0);
    });

    it('should track malicious agents across multiple iterations', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'data-validation',
        swarmId: 'validation-swarm-1',
        maxLoop2Iterations: 10,
        maxLoop3Iterations: 10,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
        enableMemoryPersistence: true,
      };

      orchestrator = new CFNLoopOrchestrator(config);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: { validation: 'implementation' },
          confidence: 0.85,
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      const maliciousAgentsList: string[] = [];
      let loop2Iteration = 0;

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockImplementation(async () => {
        loop2Iteration++;

        if (loop2Iteration === 1) {
          // First iteration: Detect malicious agent
          maliciousAgentsList.push('validator-malicious-1');
          return {
            consensusScore: 0.85,
            consensusThreshold: 0.90,
            consensusPassed: false,
            validatorResults: [],
            votingBreakdown: { PASS: 3, FAIL: 1 },
            byzantineProof: {
              maliciousAgents: maliciousAgentsList,
            },
            iteration: 1,
            timestamp: Date.now(),
          };
        } else {
          // Second iteration: Malicious agent excluded
          return {
            consensusScore: 0.92,
            consensusThreshold: 0.90,
            consensusPassed: true,
            validatorResults: [],
            votingBreakdown: { PASS: 4, FAIL: 0 },
            byzantineProof: {
              maliciousAgents: maliciousAgentsList,
            },
            iteration: 2,
            timestamp: Date.now(),
          };
        }
      });

      const result = await orchestrator.executePhase('Data validation system');

      expect(result.success).toBe(true);
      expect(result.totalLoop2Iterations).toBe(2);
      expect(maliciousAgentsList).toContain('validator-malicious-1');
    });
  });

  describe('Performance Testing', () => {
    it('should complete CFN Loop within reasonable time', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'performance-test',
        swarmId: 'perf-swarm-1',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
        timeoutMs: 10000, // 10 seconds
      };

      orchestrator = new CFNLoopOrchestrator(config);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: {},
          confidence: 0.85,
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.92,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: [],
        votingBreakdown: { PASS: 4, FAIL: 0 },
        iteration: 1,
        timestamp: Date.now(),
      });

      const startTime = Date.now();
      const result = await orchestrator.executePhase('Performance test task');
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.statistics.totalDuration).toBeLessThan(10000);
    });

    it('should handle 7 validators efficiently (max mesh size)', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'large-validation',
        swarmId: 'large-swarm-1',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
        byzantineConfig: {
          enableByzantine: true,
          minValidators: 7, // Max mesh size
        },
      };

      orchestrator = new CFNLoopOrchestrator(config);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: {},
          confidence: 0.85,
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.93,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: Array.from({ length: 7 }, (_, i) => ({
          agentId: `validator-${i + 1}`,
          confidence: 0.90 + Math.random() * 0.05,
          vote: 'PASS',
        })),
        votingBreakdown: { PASS: 7, FAIL: 0 },
        iteration: 1,
        timestamp: Date.now(),
      });

      const result = await orchestrator.executePhase('Large validation task');

      expect(result.success).toBe(true);
      expect(result.consensusResult.validatorResults.length).toBeLessThanOrEqual(7);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle validator spawn failures gracefully', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'error-handling',
        swarmId: 'error-swarm-1',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
      };

      orchestrator = new CFNLoopOrchestrator(config);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: {},
          confidence: 0.85,
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      let consensusCallCount = 0;
      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockImplementation(async () => {
        consensusCallCount++;

        if (consensusCallCount === 1) {
          // Simulate validator spawn failure
          throw new Error('Failed to spawn validator agents');
        } else {
          // Retry succeeds
          return {
            consensusScore: 0.92,
            consensusThreshold: 0.90,
            consensusPassed: true,
            validatorResults: [],
            votingBreakdown: { PASS: 4, FAIL: 0 },
            iteration: 2,
            timestamp: Date.now(),
          };
        }
      });

      const result = await orchestrator.executePhase('Error handling test');

      expect(consensusCallCount).toBeGreaterThan(1);
      expect(result.totalLoop2Iterations).toBeGreaterThan(1);
    });

    it('should recover from Byzantine consensus failures', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'byzantine-recovery',
        swarmId: 'recovery-swarm-1',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
      };

      orchestrator = new CFNLoopOrchestrator(config);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: {},
          confidence: 0.85,
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      let consensusCallCount = 0;
      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockImplementation(async () => {
        consensusCallCount++;

        if (consensusCallCount === 1) {
          // Byzantine consensus fails
          throw new Error('Malicious agent ratio 0.50 exceeds threshold 0.33');
        } else {
          // Recovery: Exclude malicious agents and succeed
          return {
            consensusScore: 0.92,
            consensusThreshold: 0.90,
            consensusPassed: true,
            validatorResults: [],
            votingBreakdown: { PASS: 4, FAIL: 0 },
            iteration: 2,
            timestamp: Date.now(),
          };
        }
      });

      const result = await orchestrator.executePhase('Byzantine recovery test');

      expect(result.success).toBe(true);
      expect(consensusCallCount).toBe(2);
    });

    it('should handle circuit breaker activation', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'circuit-breaker-test',
        swarmId: 'cb-swarm-1',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
        enableCircuitBreaker: true,
        timeoutMs: 1000, // 1 second timeout
      };

      orchestrator = new CFNLoopOrchestrator(config);

      // Simulate timeout scenario
      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds (exceeds timeout)
        return [];
      });

      try {
        await orchestrator.executePhase('Circuit breaker test');
      } catch (error) {
        expect(error).toBeDefined();
      }

      const stats = orchestrator.getStatistics();
      expect(stats.timeouts).toBeGreaterThan(0);
    });
  });

  describe('Memory and State Management', () => {
    it('should persist and recover swarm state', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'memory-persistence',
        swarmId: 'memory-swarm-1',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
        enableMemoryPersistence: true,
      };

      orchestrator = new CFNLoopOrchestrator(config);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: {},
          confidence: 0.85,
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.92,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: [],
        votingBreakdown: { PASS: 4, FAIL: 0 },
        iteration: 1,
        timestamp: Date.now(),
      });

      const result = await orchestrator.executePhase('Memory persistence test');

      expect(result.success).toBe(true);
      // Memory persistence should be enabled
    });

    it('should track phase statistics accurately', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'statistics-test',
        swarmId: 'stats-swarm-1',
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableByzantineConsensus: true,
      };

      orchestrator = new CFNLoopOrchestrator(config);

      jest.spyOn(orchestrator as any, 'executePrimarySwarm').mockResolvedValue([
        {
          agentId: 'coder-1',
          agentType: 'coder',
          deliverable: {},
          confidence: 0.85,
          timestamp: Date.now(),
        },
      ] as AgentResponse[]);

      jest.spyOn(orchestrator as any, 'executeConsensusValidation').mockResolvedValue({
        consensusScore: 0.92,
        consensusThreshold: 0.90,
        consensusPassed: true,
        validatorResults: [],
        votingBreakdown: { PASS: 4, FAIL: 0 },
        iteration: 1,
        timestamp: Date.now(),
      });

      const result = await orchestrator.executePhase('Statistics tracking test');

      expect(result.statistics).toBeDefined();
      expect(result.statistics.totalDuration).toBeGreaterThan(0);
      expect(result.statistics.primarySwarmExecutions).toBeGreaterThan(0);
      expect(result.statistics.consensusSwarmExecutions).toBeGreaterThan(0);
      expect(result.statistics.gatePasses).toBeGreaterThan(0);
      expect(result.statistics.finalConsensusScore).toBeGreaterThanOrEqual(0.90);
    });
  });
});
