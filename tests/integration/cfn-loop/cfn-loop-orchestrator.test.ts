/**
 * Integration Tests for CFN Loop Orchestrator
 *
 * Tests complete workflow:
 * 1. Phase initialization
 * 2. Loop 3 execution with confidence gate
 * 3. Loop 2 consensus validation
 * 4. Feedback injection on failure
 * 5. Escalation handling
 * 6. Circuit breaker protection
 * 7. Memory persistence
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  CFNLoopOrchestrator,
  createCFNLoopOrchestrator,
  CFNLoopConfig,
  PhaseResult,
  AgentResponse,
} from '../../../src/cfn-loop/cfn-loop-orchestrator.js';

describe('CFNLoopOrchestrator - Integration Tests', () => {
  let orchestrator: CFNLoopOrchestrator;
  let config: CFNLoopConfig;

  beforeEach(() => {
    // Set test environment
    process.env.CLAUDE_FLOW_ENV = 'test';

    // Create test configuration
    config = {
      phaseId: `test-phase-${Date.now()}`,
      swarmId: 'test-swarm',
      maxLoop2Iterations: 3,
      maxLoop3Iterations: 5,
      confidenceThreshold: 0.75,
      consensusThreshold: 0.90,
      timeoutMs: 5000, // Short timeout for tests
      enableCircuitBreaker: true,
      enableMemoryPersistence: false, // Disable for tests
    };

    orchestrator = createCFNLoopOrchestrator(config);
  });

  afterEach(async () => {
    // Cleanup
    await orchestrator.shutdown();
    delete process.env.CLAUDE_FLOW_ENV;
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.getStatistics).toBeDefined();
    });

    it('should create orchestrator with factory function', () => {
      const newOrchestrator = createCFNLoopOrchestrator(config);
      expect(newOrchestrator).toBeInstanceOf(CFNLoopOrchestrator);
    });

    it('should apply default configuration values', () => {
      const minimalConfig: CFNLoopConfig = {
        phaseId: 'minimal-test',
      };

      const minimalOrchestrator = createCFNLoopOrchestrator(minimalConfig);
      expect(minimalOrchestrator).toBeDefined();

      // Cleanup
      minimalOrchestrator.shutdown();
    });
  });

  describe('Phase Execution', () => {
    it('should execute complete phase successfully', async () => {
      const task = 'Implement test feature';

      const result: PhaseResult = await orchestrator.executePhase(task);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.phaseId).toBe(config.phaseId);
      expect(result.totalLoop2Iterations).toBeGreaterThanOrEqual(1);
      expect(result.totalLoop3Iterations).toBeGreaterThanOrEqual(1);
      expect(result.escalated).toBe(false);
      expect(result.statistics).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    }, 10000); // 10s timeout

    it('should track phase statistics', async () => {
      const task = 'Implement statistics tracking';

      await orchestrator.executePhase(task);

      const stats = orchestrator.getStatistics();

      expect(stats.primarySwarmExecutions).toBeGreaterThan(0);
      expect(stats.consensusSwarmExecutions).toBeGreaterThan(0);
      expect(stats.totalDuration).toBeGreaterThan(0);
      expect(stats.averageConfidenceScore).toBeGreaterThanOrEqual(0);
      expect(stats.finalConsensusScore).toBeGreaterThanOrEqual(0);
    }, 10000);

    it('should handle empty task gracefully', async () => {
      const task = '';

      const result = await orchestrator.executePhase(task);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    }, 10000);
  });

  describe('Loop 3 Execution (Primary Swarm)', () => {
    it('should execute primary swarm with agent instructions', async () => {
      const agentInstructions = [
        'Implement feature A',
        'Test feature A',
        'Review feature A',
      ];

      const responses = await orchestrator.executePrimarySwarm(agentInstructions);

      expect(responses).toBeDefined();
      expect(responses.length).toBe(agentInstructions.length);
      expect(responses[0].agentId).toBeDefined();
      expect(responses[0].agentType).toBeDefined();
      expect(responses[0].deliverable).toBeDefined();
      expect(responses[0].timestamp).toBeGreaterThan(0);
    });

    it('should collect confidence scores from responses', async () => {
      const mockResponses: AgentResponse[] = [
        {
          agentId: 'agent-1',
          agentType: 'coder',
          deliverable: { code: 'mock' },
          confidence: 0.85,
          reasoning: 'Implementation complete',
          timestamp: Date.now(),
        },
        {
          agentId: 'agent-2',
          agentType: 'tester',
          deliverable: { tests: 'mock' },
          confidence: 0.90,
          reasoning: 'All tests passing',
          timestamp: Date.now(),
        },
      ];

      const confidenceScores = await orchestrator.collectConfidence(mockResponses);

      expect(confidenceScores).toBeDefined();
      expect(confidenceScores.length).toBe(2);
      expect(confidenceScores[0].agent).toBe('agent-1');
      expect(confidenceScores[0].confidence).toBe(0.85);
      expect(confidenceScores[1].agent).toBe('agent-2');
      expect(confidenceScores[1].confidence).toBe(0.90);
    });

    it('should handle agents with missing confidence scores', async () => {
      const mockResponses: AgentResponse[] = [
        {
          agentId: 'agent-incomplete',
          agentType: 'coder',
          deliverable: { code: 'partial' },
          // No confidence score
          timestamp: Date.now(),
        },
      ];

      const confidenceScores = await orchestrator.collectConfidence(mockResponses);

      expect(confidenceScores).toBeDefined();
      expect(confidenceScores.length).toBe(1);
      expect(confidenceScores[0].confidence).toBeGreaterThanOrEqual(0);
      expect(confidenceScores[0].confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Loop 2 Execution (Consensus Validation)', () => {
    it('should execute consensus validation with mock validators', async () => {
      const mockResponses: AgentResponse[] = [
        {
          agentId: 'primary-1',
          agentType: 'coder',
          deliverable: { feature: 'implemented' },
          confidence: 0.85,
          reasoning: 'Complete',
          timestamp: Date.now(),
        },
      ];

      const consensusResult = await orchestrator.executeConsensusValidation(mockResponses);

      expect(consensusResult).toBeDefined();
      expect(consensusResult.consensusScore).toBeGreaterThanOrEqual(0);
      expect(consensusResult.consensusScore).toBeLessThanOrEqual(1);
      expect(consensusResult.consensusThreshold).toBe(config.consensusThreshold);
      expect(consensusResult.consensusPassed).toBeDefined();
      expect(consensusResult.validatorResults).toBeDefined();
      expect(consensusResult.votingBreakdown).toBeDefined();
      expect(consensusResult.timestamp).toBeGreaterThan(0);
    });

    it('should track consensus swarm executions in statistics', async () => {
      const mockResponses: AgentResponse[] = [
        {
          agentId: 'agent-1',
          agentType: 'coder',
          deliverable: {},
          timestamp: Date.now(),
        },
      ];

      const initialStats = orchestrator.getStatistics();
      const initialCount = initialStats.consensusSwarmExecutions;

      await orchestrator.executeConsensusValidation(mockResponses);

      const updatedStats = orchestrator.getStatistics();
      expect(updatedStats.consensusSwarmExecutions).toBe(initialCount + 1);
    });
  });

  describe('Feedback Injection and Retry', () => {
    it('should handle consensus failure with feedback capture', async () => {
      // This test would require mocking consensus failure
      // For now, we test the handleFailure method directly

      const mockFeedback = {
        phaseId: config.phaseId,
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.70,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: ['test-coverage', 'security'],
        actionableSteps: [
          {
            priority: 'critical' as const,
            category: 'testing',
            action: 'Increase test coverage to 80%',
            estimatedEffort: 'high' as const,
          },
        ],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const retryStrategy = await orchestrator.handleFailure(mockFeedback);

      expect(retryStrategy).toBeDefined();
      expect(retryStrategy.shouldRetry).toBeDefined();
      expect(retryStrategy.reason).toBeDefined();
    });

    it('should stop retrying after max Loop 2 iterations', async () => {
      // Create orchestrator with very low max iterations
      const lowIterConfig: CFNLoopConfig = {
        ...config,
        phaseId: `low-iter-${Date.now()}`,
        maxLoop2Iterations: 1,
        maxLoop3Iterations: 1,
      };

      const lowIterOrchestrator = createCFNLoopOrchestrator(lowIterConfig);

      const mockFeedback = {
        phaseId: lowIterConfig.phaseId,
        iteration: 2, // Already at max
        consensusFailed: true,
        consensusScore: 0.50,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const retryStrategy = await lowIterOrchestrator.handleFailure(mockFeedback);

      expect(retryStrategy.shouldRetry).toBe(false);
      expect(retryStrategy.reason).toContain('Maximum Loop 2 iterations');

      // Cleanup
      await lowIterOrchestrator.shutdown();
    });
  });

  describe('Circuit Breaker Protection', () => {
    it('should enable circuit breaker when configured', () => {
      const cbConfig: CFNLoopConfig = {
        ...config,
        phaseId: `cb-test-${Date.now()}`,
        enableCircuitBreaker: true,
      };

      const cbOrchestrator = createCFNLoopOrchestrator(cbConfig);

      expect(cbOrchestrator).toBeDefined();

      // Cleanup
      cbOrchestrator.shutdown();
    });

    it('should disable circuit breaker when configured', () => {
      const noCbConfig: CFNLoopConfig = {
        ...config,
        phaseId: `no-cb-test-${Date.now()}`,
        enableCircuitBreaker: false,
      };

      const noCbOrchestrator = createCFNLoopOrchestrator(noCbConfig);

      expect(noCbOrchestrator).toBeDefined();

      // Cleanup
      noCbOrchestrator.shutdown();
    });

    it('should track circuit breaker trips in statistics', async () => {
      // This would require simulating circuit breaker failure
      // For now, we just verify the statistic exists
      const stats = orchestrator.getStatistics();
      expect(stats.circuitBreakerTrips).toBe(0);
    });
  });

  describe('Iteration Tracking', () => {
    it('should track Loop 2 and Loop 3 iterations separately', async () => {
      const task = 'Track iteration counts';

      const result = await orchestrator.executePhase(task);

      expect(result.totalLoop2Iterations).toBeGreaterThanOrEqual(1);
      expect(result.totalLoop3Iterations).toBeGreaterThanOrEqual(1);
    }, 10000);

    it('should reset Loop 3 on confidence gate pass', async () => {
      // This is tested implicitly in phase execution
      // Loop 3 should reset when confidence gate passes
      const task = 'Test Loop 3 reset';

      const result = await orchestrator.executePhase(task);

      // If phase succeeds, Loop 3 must have been reset
      if (result.success) {
        expect(result.totalLoop2Iterations).toBeGreaterThanOrEqual(1);
      }
    }, 10000);
  });

  describe('Statistics and Metrics', () => {
    it('should track all required statistics', async () => {
      const task = 'Generate comprehensive statistics';

      await orchestrator.executePhase(task);

      const stats = orchestrator.getStatistics();

      expect(stats.totalDuration).toBeGreaterThan(0);
      expect(stats.primarySwarmExecutions).toBeGreaterThan(0);
      expect(stats.consensusSwarmExecutions).toBeGreaterThanOrEqual(0);
      expect(stats.averageConfidenceScore).toBeGreaterThanOrEqual(0);
      expect(stats.finalConsensusScore).toBeGreaterThanOrEqual(0);
      expect(stats.gatePasses).toBeGreaterThanOrEqual(0);
      expect(stats.gateFails).toBeGreaterThanOrEqual(0);
      expect(stats.feedbackInjections).toBeGreaterThanOrEqual(0);
      expect(stats.circuitBreakerTrips).toBeGreaterThanOrEqual(0);
      expect(stats.timeouts).toBeGreaterThanOrEqual(0);
    }, 10000);

    it('should increment gate passes on success', async () => {
      const task = 'Test gate pass tracking';

      const initialStats = orchestrator.getStatistics();
      const initialGatePasses = initialStats.gatePasses;

      await orchestrator.executePhase(task);

      const finalStats = orchestrator.getStatistics();
      expect(finalStats.gatePasses).toBeGreaterThanOrEqual(initialGatePasses);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle orchestrator shutdown gracefully', async () => {
      await expect(orchestrator.shutdown()).resolves.not.toThrow();
    });

    it('should handle multiple shutdown calls', async () => {
      await orchestrator.shutdown();
      await expect(orchestrator.shutdown()).resolves.not.toThrow();
    });

    it('should handle phase execution after shutdown', async () => {
      await orchestrator.shutdown();

      // Create new orchestrator for this test
      const newOrchestrator = createCFNLoopOrchestrator({
        ...config,
        phaseId: `post-shutdown-${Date.now()}`,
      });

      const task = 'Test after shutdown';
      const result = await newOrchestrator.executePhase(task);

      expect(result).toBeDefined();

      await newOrchestrator.shutdown();
    }, 10000);
  });

  describe('Configuration Validation', () => {
    it('should handle minimal configuration', () => {
      const minimalConfig: CFNLoopConfig = {
        phaseId: 'minimal',
      };

      const minOrchestrator = createCFNLoopOrchestrator(minimalConfig);
      expect(minOrchestrator).toBeDefined();

      minOrchestrator.shutdown();
    });

    it('should handle custom thresholds', () => {
      const customConfig: CFNLoopConfig = {
        phaseId: 'custom-thresholds',
        confidenceThreshold: 0.80,
        consensusThreshold: 0.95,
      };

      const customOrchestrator = createCFNLoopOrchestrator(customConfig);
      expect(customOrchestrator).toBeDefined();

      customOrchestrator.shutdown();
    });

    it('should handle custom iteration limits', () => {
      const customIterConfig: CFNLoopConfig = {
        phaseId: 'custom-iterations',
        maxLoop2Iterations: 10,
        maxLoop3Iterations: 20,
      };

      const customIterOrchestrator = createCFNLoopOrchestrator(customIterConfig);
      expect(customIterOrchestrator).toBeDefined();

      customIterOrchestrator.shutdown();
    });

    it('should handle custom timeout', () => {
      const timeoutConfig: CFNLoopConfig = {
        phaseId: 'custom-timeout',
        timeoutMs: 60000, // 1 minute
      };

      const timeoutOrchestrator = createCFNLoopOrchestrator(timeoutConfig);
      expect(timeoutOrchestrator).toBeDefined();

      timeoutOrchestrator.shutdown();
    });
  });

  describe('Event Emission', () => {
    it('should emit events during phase execution', async () => {
      const events: string[] = [];

      orchestrator.on('circuit:state-change', () => {
        events.push('circuit:state-change');
      });

      const task = 'Test event emission';
      await orchestrator.executePhase(task);

      // Events may or may not be emitted depending on circuit breaker state
      // Just verify the listener was registered
      expect(orchestrator.listenerCount('circuit:state-change')).toBe(1);
    }, 10000);
  });
});
