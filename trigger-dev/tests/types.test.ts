/**
 * Type Definitions Tests
 * Validates CFN Loop type system and threshold configuration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CFNMode,
  CFNLoopPayload,
  SuccessCriteria,
  AgentResult,
  TestResults,
  GateCheckResult,
  ValidatorResult,
  ConsensusResult,
  ProductOwnerDecision,
  getThresholdConfig,
} from '../src/types/cfn-types';

describe('CFN Loop Type System', () => {
  describe('Threshold Configuration', () => {
    it('should return correct MVP thresholds', () => {
      const config = getThresholdConfig('mvp');

      expect(config.loop3PassRateThreshold).toBe(0.7);
      expect(config.loop2ConsensusThreshold).toBe(0.8);
      expect(config.validatorCount).toBe(2);
      expect(config.maxIterations).toBe(5);
    });

    it('should return correct Standard thresholds', () => {
      const config = getThresholdConfig('standard');

      expect(config.loop3PassRateThreshold).toBe(0.95);
      expect(config.loop2ConsensusThreshold).toBe(0.9);
      expect(config.validatorCount).toBe(3);
      expect(config.maxIterations).toBe(10);
    });

    it('should return correct Enterprise thresholds', () => {
      const config = getThresholdConfig('enterprise');

      expect(config.loop3PassRateThreshold).toBe(0.98);
      expect(config.loop2ConsensusThreshold).toBe(0.95);
      expect(config.validatorCount).toBe(5);
      expect(config.maxIterations).toBe(15);
    });
  });

  describe('Success Criteria', () => {
    it('should create valid success criteria', () => {
      const criteria: SuccessCriteria = {
        testCommand: 'npm test',
        passRateThreshold: 0.95,
        coverageThreshold: 0.8,
        testSuites: ['unit', 'integration'],
      };

      expect(criteria.testCommand).toBe('npm test');
      expect(criteria.passRateThreshold).toBeGreaterThanOrEqual(0);
      expect(criteria.passRateThreshold).toBeLessThanOrEqual(1);
      expect(criteria.coverageThreshold).toBeDefined();
      expect(criteria.testSuites).toHaveLength(2);
    });
  });

  describe('Test Results', () => {
    it('should calculate correct pass rate', () => {
      const results: TestResults = {
        total: 100,
        passed: 95,
        failed: 5,
        passRate: 0.95,
      };

      expect(results.passRate).toBe(0.95);
      expect(results.passed + results.failed).toBe(results.total);
    });

    it('should handle zero tests', () => {
      const results: TestResults = {
        total: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
      };

      expect(results.passRate).toBe(0);
      expect(results.total).toBe(0);
    });
  });

  describe('Agent Result', () => {
    let agentResult: AgentResult;

    beforeEach(() => {
      agentResult = {
        agentId: 'backend-1234-abc',
        agentType: 'backend-developer',
        confidence: 0.92,
        deliverables: {
          files: ['src/auth.ts', 'tests/auth.test.ts'],
          summary: 'Implemented authentication module',
        },
        testResults: {
          total: 50,
          passed: 48,
          failed: 2,
          passRate: 0.96,
          coverage: 0.87,
        },
        completedAt: new Date().toISOString(),
      };
    });

    it('should create valid agent result', () => {
      expect(agentResult.agentId).toBeDefined();
      expect(agentResult.agentType).toBe('backend-developer');
      expect(agentResult.confidence).toBeGreaterThanOrEqual(0);
      expect(agentResult.confidence).toBeLessThanOrEqual(1);
      expect(agentResult.deliverables.files).toHaveLength(2);
      expect(agentResult.testResults.passRate).toBeGreaterThan(0);
    });

    it('should have valid test results', () => {
      const { testResults } = agentResult;

      expect(testResults.passed + testResults.failed).toBe(testResults.total);
      expect(testResults.passRate).toBe(testResults.passed / testResults.total);
    });
  });

  describe('Gate Check Result', () => {
    let gateResult: GateCheckResult;

    beforeEach(() => {
      gateResult = {
        passed: true,
        passRate: 0.96,
        threshold: 0.95,
        agentResults: [],
        reason: 'Gate passed: 96% pass rate meets 95% threshold',
        checkedAt: new Date().toISOString(),
      };
    });

    it('should create valid gate check result', () => {
      expect(gateResult.passed).toBe(true);
      expect(gateResult.passRate).toBeGreaterThanOrEqual(gateResult.threshold);
      expect(gateResult.reason).toBeDefined();
      expect(typeof gateResult.passed).toBe('boolean');
    });

    it('should detect gate failure', () => {
      const failedGate: GateCheckResult = {
        passed: false,
        passRate: 0.85,
        threshold: 0.95,
        agentResults: [],
        reason: 'Gate failed: 85% pass rate below 95% threshold',
        checkedAt: new Date().toISOString(),
      };

      expect(failedGate.passed).toBe(false);
      expect(failedGate.passRate).toBeLessThan(failedGate.threshold);
    });
  });

  describe('Validator Result', () => {
    it('should create valid validator result', () => {
      const result: ValidatorResult = {
        validatorId: 'code-reviewer-1234-abc',
        validatorType: 'code-reviewer',
        consensusScore: 0.88,
        feedback: 'Implementation demonstrates solid understanding',
        issues: ['Low coverage in error paths'],
        recommendations: ['Add edge case tests'],
        completedAt: new Date().toISOString(),
      };

      expect(result.validatorId).toBeDefined();
      expect(result.consensusScore).toBeGreaterThanOrEqual(0);
      expect(result.consensusScore).toBeLessThanOrEqual(1);
      expect(result.feedback).toBeDefined();
      expect(result.issues).toBeDefined();
    });
  });

  describe('Consensus Result', () => {
    it('should calculate average consensus correctly', () => {
      const validatorResults: ValidatorResult[] = [
        {
          validatorId: 'v1',
          validatorType: 'code-reviewer',
          consensusScore: 0.9,
          feedback: 'Good',
          completedAt: new Date().toISOString(),
        },
        {
          validatorId: 'v2',
          validatorType: 'qa-engineer',
          consensusScore: 0.88,
          feedback: 'Good',
          completedAt: new Date().toISOString(),
        },
        {
          validatorId: 'v3',
          validatorType: 'security-specialist',
          consensusScore: 0.92,
          feedback: 'Secure',
          completedAt: new Date().toISOString(),
        },
      ];

      const consensus: ConsensusResult = {
        averageScore:
          (0.9 + 0.88 + 0.92) / 3,
        validatorResults,
        consensusMet: true,
        threshold: 0.9,
        summary: 'All validators approve',
        consensusAt: new Date().toISOString(),
      };

      const expected = (0.9 + 0.88 + 0.92) / 3;
      expect(consensus.averageScore).toBeCloseTo(expected);
      expect(consensus.averageScore).toBeGreaterThanOrEqual(consensus.threshold);
    });

    it('should detect consensus failure', () => {
      const validatorResults: ValidatorResult[] = [
        {
          validatorId: 'v1',
          validatorType: 'code-reviewer',
          consensusScore: 0.7,
          feedback: 'Issues found',
          issues: ['Low coverage'],
          completedAt: new Date().toISOString(),
        },
      ];

      const consensus: ConsensusResult = {
        averageScore: 0.7,
        validatorResults,
        consensusMet: false,
        threshold: 0.9,
        summary: 'Validators found issues',
        blockingIssues: ['Low coverage'],
        consensusAt: new Date().toISOString(),
      };

      expect(consensus.averageScore).toBeLessThan(consensus.threshold);
      expect(consensus.consensusMet).toBe(false);
      expect(consensus.blockingIssues).toBeDefined();
    });
  });

  describe('Product Owner Decision', () => {
    it('should create PROCEED decision', () => {
      const decision: ProductOwnerDecision = {
        decision: 'PROCEED',
        reasoning: 'All quality gates passed',
        validations: [
          'Gate check passed (96% >= 95%)',
          '3 validators agree on quality',
        ],
        decidedAt: new Date().toISOString(),
      };

      expect(decision.decision).toBe('PROCEED');
      expect(decision.validations).toBeDefined();
      expect(decision.validations?.length).toBeGreaterThan(0);
    });

    it('should create ITERATE decision', () => {
      const decision: ProductOwnerDecision = {
        decision: 'ITERATE',
        reasoning: 'Consensus score below threshold',
        iterationFocus: 'testing',
        decidedAt: new Date().toISOString(),
      };

      expect(decision.decision).toBe('ITERATE');
      expect(decision.iterationFocus).toBe('testing');
    });

    it('should create ABORT decision', () => {
      const decision: ProductOwnerDecision = {
        decision: 'ABORT',
        reasoning: 'Max iterations reached',
        abortReason: 'Cannot meet quality threshold after 10 iterations',
        decidedAt: new Date().toISOString(),
      };

      expect(decision.decision).toBe('ABORT');
      expect(decision.abortReason).toBeDefined();
      expect(decision.abortReason).toContain('Max iterations');
    });
  });

  describe('CFN Loop Payload', () => {
    it('should create valid CFN Loop payload', () => {
      const payload: CFNLoopPayload = {
        taskId: 'task-123',
        description: 'Implement authentication module',
        successCriteria: {
          testCommand: 'npm test',
          passRateThreshold: 0.95,
          coverageThreshold: 0.8,
        },
        mode: 'standard',
        currentIteration: 1,
        maxIterations: 10,
        startedAt: new Date().toISOString(),
      };

      expect(payload.taskId).toBe('task-123');
      expect(payload.mode).toBe('standard');
      expect(payload.currentIteration).toBeGreaterThanOrEqual(1);
      expect(payload.maxIterations).toBeGreaterThanOrEqual(
        payload.currentIteration
      );
    });
  });
});
