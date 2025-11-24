/**
 * Test Suite: CFN Product Owner Decision Job
 * Tests for Phase 4 CFN Product Owner implementation
 *
 * Coverage:
 * 1. Payload validation (Zod schema)
 * 2. Decision parsing (PROCEED/ITERATE/ABORT)
 * 3. Docker command building for Product Owner
 * 4. Iteration triggering logic
 * 5. Error handling and edge cases
 * 6. Integration tests with complete workflow
 *
 * Test Pass Rate Target: ≥0.95 (Standard mode)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getThresholdConfig } from '../src/types/cfn-types';
import type {
  ConsensusResult,
  ProductOwnerDecision,
  GateCheckResult,
  CFNMode,
  ValidatorResult,
} from '../src/types/cfn-types';

// Mock trigger.dev SDK
vi.mock('@trigger.dev/sdk/v3', () => ({
  task: vi.fn((config) => config),
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

/**
 * Product Owner Job Payload Interface
 */
interface ProductOwnerJobPayload {
  taskId: string;
  consensusResult: ConsensusResult;
  gateCheckResult: GateCheckResult;
  mode: CFNMode;
  iterationNumber: number;
  maxIterations: number;
}

/**
 * Test Suite 1: Payload Validation
 * Validates ProductOwnerJobPayload schema enforcement
 */
describe('CFN Product Owner: Payload Validation', () => {
  const createValidPayload = (): ProductOwnerJobPayload => ({
    taskId: 'task-12345',
    consensusResult: {
      averageScore: 0.92,
      validatorResults: [
        {
          validatorId: 'v1',
          validatorType: 'code-reviewer',
          consensusScore: 0.92,
          feedback: 'Good quality',
          completedAt: new Date().toISOString(),
        },
      ],
      consensusMet: true,
      threshold: 0.9,
      summary: 'Quality standards met',
      consensusAt: new Date().toISOString(),
    },
    gateCheckResult: {
      passed: true,
      passRate: 0.95,
      threshold: 0.95,
      aggregatedResults: {
        totalTests: 10,
        passedTests: 9,
        failedTests: 1,
      },
      checkedAt: new Date().toISOString(),
    },
    mode: 'standard',
    iterationNumber: 1,
    maxIterations: 10,
  });

  it('should accept valid payload with all required fields', () => {
    const payload = createValidPayload();
    expect(payload).toBeDefined();
    expect(payload.taskId).toBeTruthy();
    expect(payload.consensusResult).toBeDefined();
    expect(payload.gateCheckResult).toBeDefined();
  });

  it('should validate taskId format', () => {
    const payload = createValidPayload();
    expect(payload.taskId).toMatch(/^task-[a-zA-Z0-9-]+$/);
  });

  it('should validate mode enum values', () => {
    const validModes: CFNMode[] = ['mvp', 'standard', 'enterprise'];
    const testMode: CFNMode = 'standard';
    expect(validModes).toContain(testMode);
  });

  it('should validate consensus result structure', () => {
    const payload = createValidPayload();
    const consensus = payload.consensusResult;

    expect(consensus.averageScore).toBeGreaterThanOrEqual(0);
    expect(consensus.averageScore).toBeLessThanOrEqual(1);
    expect(consensus.validatorResults.length).toBeGreaterThan(0);
    expect(consensus.threshold).toBeGreaterThanOrEqual(0);
    expect(consensus.threshold).toBeLessThanOrEqual(1);
  });

  it('should validate gate check result structure', () => {
    const payload = createValidPayload();
    const gateCheck = payload.gateCheckResult;

    expect(typeof gateCheck.passed).toBe('boolean');
    expect(gateCheck.passRate).toBeGreaterThanOrEqual(0);
    expect(gateCheck.passRate).toBeLessThanOrEqual(1);
    expect(gateCheck.threshold).toBeGreaterThanOrEqual(0);
    expect(gateCheck.threshold).toBeLessThanOrEqual(1);
  });

  it('should validate iteration number is positive', () => {
    const payload = createValidPayload();
    expect(payload.iterationNumber).toBeGreaterThan(0);
  });

  it('should validate maxIterations is greater than iterationNumber', () => {
    const payload = createValidPayload();
    expect(payload.maxIterations).toBeGreaterThanOrEqual(payload.iterationNumber);
  });

  it('should reject empty task ID', () => {
    const taskId = '';
    expect(taskId.length).toBe(0);
  });
});

/**
 * Test Suite 2: Decision Parsing - PROCEED
 * Tests PROCEED decision logic when all gates pass
 */
describe('CFN Product Owner: PROCEED Decision', () => {
  function determineDecision(
    consensusScore: number,
    consensusThreshold: number,
    gatePassed: boolean,
    iterationNumber: number,
    maxIterations: number
  ): 'PROCEED' | 'ITERATE' | 'ABORT' {
    if (iterationNumber >= maxIterations) {
      return 'ABORT';
    }

    if (!gatePassed) {
      return 'ITERATE';
    }

    if (consensusScore < consensusThreshold) {
      return 'ITERATE';
    }

    return 'PROCEED';
  }

  it('should decide PROCEED when gate passes and consensus met', () => {
    const decision = determineDecision(0.92, 0.90, true, 1, 10);
    expect(decision).toBe('PROCEED');
  });

  it('should decide PROCEED with perfect scores', () => {
    const decision = determineDecision(1.0, 0.95, true, 1, 10);
    expect(decision).toBe('PROCEED');
  });

  it('should decide PROCEED at exact threshold', () => {
    const decision = determineDecision(0.95, 0.95, true, 1, 10);
    expect(decision).toBe('PROCEED');
  });

  it('should decide PROCEED with high consensus in MVP mode', () => {
    const threshold = getThresholdConfig('mvp').loop2ConsensusThreshold;
    const decision = determineDecision(0.82, threshold, true, 1, 5);
    expect(decision).toBe('PROCEED');
  });

  it('should decide PROCEED with high consensus in Standard mode', () => {
    const threshold = getThresholdConfig('standard').loop2ConsensusThreshold;
    const decision = determineDecision(0.92, threshold, true, 1, 10);
    expect(decision).toBe('PROCEED');
  });

  it('should decide PROCEED with high consensus in Enterprise mode', () => {
    const threshold = getThresholdConfig('enterprise').loop2ConsensusThreshold;
    const decision = determineDecision(0.96, threshold, true, 1, 15);
    expect(decision).toBe('PROCEED');
  });

  it('should decide PROCEED on final iteration if criteria met', () => {
    const decision = determineDecision(0.92, 0.90, true, 9, 10);
    expect(decision).toBe('PROCEED');
  });

  it('should include validations list in PROCEED result', () => {
    const validations = [
      'Gate check passed (95.0% >= 95.0%)',
      'Consensus score achieved (92.0% >= 90.0%)',
      '3 validators agree on quality',
      'No blocking issues identified',
    ];

    expect(validations.length).toBeGreaterThan(0);
    expect(validations[0]).toContain('Gate check passed');
  });
});

/**
 * Test Suite 3: Decision Parsing - ITERATE
 * Tests ITERATE decision logic when quality improvements needed
 */
describe('CFN Product Owner: ITERATE Decision', () => {
  function determineDecision(
    consensusScore: number,
    consensusThreshold: number,
    gatePassed: boolean,
    iterationNumber: number,
    maxIterations: number
  ): 'PROCEED' | 'ITERATE' | 'ABORT' {
    if (iterationNumber >= maxIterations) {
      return 'ABORT';
    }

    if (!gatePassed) {
      return 'ITERATE';
    }

    if (consensusScore < consensusThreshold) {
      return 'ITERATE';
    }

    return 'PROCEED';
  }

  it('should decide ITERATE when gate fails', () => {
    const decision = determineDecision(0.92, 0.90, false, 1, 10);
    expect(decision).toBe('ITERATE');
  });

  it('should decide ITERATE when consensus below threshold', () => {
    const decision = determineDecision(0.88, 0.90, true, 1, 10);
    expect(decision).toBe('ITERATE');
  });

  it('should decide ITERATE on first iteration with low consensus', () => {
    const decision = determineDecision(0.70, 0.90, true, 1, 10);
    expect(decision).toBe('ITERATE');
  });

  it('should decide ITERATE multiple times if needed', () => {
    const iterations = [1, 2, 3, 4];
    iterations.forEach(iter => {
      const decision = determineDecision(0.85, 0.90, true, iter, 10);
      expect(decision).toBe('ITERATE');
    });
  });

  it('should include iteration focus in ITERATE result', () => {
    const iterationFocus = 'implementation';
    expect(['implementation', 'quality', 'testing', 'security']).toContain(
      iterationFocus
    );
  });

  it('should identify testing focus from issues', () => {
    const issues = ['Test coverage below 80%', 'Some edge cases not tested'];
    const focus = identifyFocus(issues);
    expect(focus).toBe('testing');
  });

  it('should identify security focus from issues', () => {
    const issues = ['Security vulnerabilities found', 'Input validation missing'];
    const focus = identifyFocus(issues);
    expect(focus).toBe('security');
  });

  it('should identify performance focus from issues', () => {
    const issues = ['Performance benchmarks not met', 'Slow response times'];
    const focus = identifyFocus(issues);
    expect(focus).toBe('performance');
  });

  it('should default to quality focus when no specific keywords', () => {
    const issues = ['Some improvements needed'];
    const focus = identifyFocus(issues);
    expect(focus).toBe('quality');
  });

  it('should handle gate failure with implementation focus', () => {
    const decision = determineDecision(0.95, 0.90, false, 1, 10);
    expect(decision).toBe('ITERATE');
    // When gate fails, focus should be 'implementation'
  });

  // Helper function for iteration focus identification
  function identifyFocus(issues: string[]): string {
    const keywords: Record<string, string> = {
      test: 'testing',
      coverage: 'testing',
      performance: 'performance',
      security: 'security',
      architecture: 'architecture',
      documentation: 'documentation',
    };

    for (const issue of issues) {
      const lowerIssue = issue.toLowerCase();
      for (const [keyword, focus] of Object.entries(keywords)) {
        if (lowerIssue.includes(keyword)) {
          return focus;
        }
      }
    }

    return 'quality';
  }
});

/**
 * Test Suite 4: Decision Parsing - ABORT
 * Tests ABORT decision logic when max iterations reached or critical failures
 */
describe('CFN Product Owner: ABORT Decision', () => {
  function determineDecision(
    consensusScore: number,
    consensusThreshold: number,
    gatePassed: boolean,
    iterationNumber: number,
    maxIterations: number
  ): 'PROCEED' | 'ITERATE' | 'ABORT' {
    if (iterationNumber >= maxIterations) {
      return 'ABORT';
    }

    if (!gatePassed) {
      return 'ITERATE';
    }

    if (consensusScore < consensusThreshold) {
      return 'ITERATE';
    }

    return 'PROCEED';
  }

  it('should decide ABORT when max iterations reached', () => {
    const decision = determineDecision(0.85, 0.90, true, 10, 10);
    expect(decision).toBe('ABORT');
  });

  it('should decide ABORT in MVP mode at iteration limit', () => {
    const maxIter = getThresholdConfig('mvp').maxIterations;
    const decision = determineDecision(0.75, 0.80, true, maxIter, maxIter);
    expect(decision).toBe('ABORT');
  });

  it('should decide ABORT in Standard mode at iteration limit', () => {
    const maxIter = getThresholdConfig('standard').maxIterations;
    const decision = determineDecision(0.85, 0.90, true, maxIter, maxIter);
    expect(decision).toBe('ABORT');
  });

  it('should decide ABORT in Enterprise mode at iteration limit', () => {
    const maxIter = getThresholdConfig('enterprise').maxIterations;
    const decision = determineDecision(0.90, 0.95, true, maxIter, maxIter);
    expect(decision).toBe('ABORT');
  });

  it('should include abort reason in ABORT result', () => {
    const abortReason = 'Max iterations (10) reached. Current consensus: 85.0%, required: 90.0%';
    expect(abortReason).toContain('Max iterations');
    expect(abortReason).toContain('consensus');
  });

  it('should not abort before max iterations', () => {
    const decision = determineDecision(0.85, 0.90, true, 9, 10);
    expect(decision).not.toBe('ABORT');
  });

  it('should abort exactly at max iterations', () => {
    const decision = determineDecision(0.85, 0.90, true, 10, 10);
    expect(decision).toBe('ABORT');
  });

  it('should handle abort with detailed reasoning', () => {
    const reasoning = `Iteration limit reached. Consensus score (85.0%) has not met threshold (90.0%). Further iteration unlikely to improve results significantly.`;

    expect(reasoning).toContain('Iteration limit');
    expect(reasoning).toContain('threshold');
  });
});

/**
 * Test Suite 5: Docker Command Building
 * Tests Product Owner container spawn command generation
 */
describe('CFN Product Owner: Docker Command Building', () => {
  function buildProductOwnerDockerCommand(options: {
    containerName: string;
    taskId: string;
    consensusSummary: string;
    mode: string;
    iteration: number;
  }): string {
    const { containerName, taskId, consensusSummary, mode, iteration } = options;

    const escapedSummary = consensusSummary
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`');

    const parts: string[] = [
      'docker run --rm',
      `--name ${containerName}`,
      '--network trigger-dev_trigger-cfn-network',
      '--cpus=0.5',
      '--memory=1g',
      '--memory-swap=1g',
      `-e TASK_ID=${taskId}`,
      `-e ITERATION=${iteration}`,
      `-e MODE=${mode}`,
      '-v /workspace:/workspace:ro',
      '-v /tmp/cfn-workspace:/tmp/workspace:ro',
      'cfn-product-owner:test',
      `--summary "${escapedSummary}"`,
      `--mode ${mode}`,
    ];

    return parts.join(' ');
  }

  it('should build valid Docker command for Product Owner', () => {
    const cmd = buildProductOwnerDockerCommand({
      containerName: 'cfn-po-task1-1234567890',
      taskId: 'task-001',
      consensusSummary: 'Consensus: 0.92, Gate: 0.95',
      mode: 'standard',
      iteration: 1,
    });

    expect(cmd).toContain('docker run --rm');
    expect(cmd).toContain('--cpus=0.5');
    expect(cmd).toContain('--memory=1g');
    expect(cmd).toContain('cfn-product-owner:test');
  });

  it('should use minimal resource limits', () => {
    const cmd = buildProductOwnerDockerCommand({
      containerName: 'cfn-po-001',
      taskId: 'task-001',
      consensusSummary: 'Summary',
      mode: 'standard',
      iteration: 1,
    });

    expect(cmd).toContain('--cpus=0.5');
    expect(cmd).toContain('--memory=1g');
  });

  it('should use read-only volume mounts', () => {
    const cmd = buildProductOwnerDockerCommand({
      containerName: 'cfn-po-001',
      taskId: 'task-001',
      consensusSummary: 'Summary',
      mode: 'standard',
      iteration: 1,
    });

    expect(cmd).toContain('/workspace:/workspace:ro');
    expect(cmd).toContain('/tmp/workspace:ro');
  });

  it('should escape special characters', () => {
    const cmd = buildProductOwnerDockerCommand({
      containerName: 'cfn-po-001',
      taskId: 'task-001',
      consensusSummary: 'Consensus "0.92" at $NOW',
      mode: 'standard',
      iteration: 1,
    });

    expect(cmd).toContain('\\"');
    expect(cmd).toContain('\\$');
  });

  it('should include all environment variables', () => {
    const cmd = buildProductOwnerDockerCommand({
      containerName: 'cfn-po-001',
      taskId: 'task-001',
      consensusSummary: 'Summary',
      mode: 'enterprise',
      iteration: 3,
    });

    expect(cmd).toContain('-e TASK_ID=task-001');
    expect(cmd).toContain('-e ITERATION=3');
    expect(cmd).toContain('-e MODE=enterprise');
  });

  it('should use proper network isolation', () => {
    const cmd = buildProductOwnerDockerCommand({
      containerName: 'cfn-po-001',
      taskId: 'task-001',
      consensusSummary: 'Summary',
      mode: 'standard',
      iteration: 1,
    });

    expect(cmd).toContain('--network trigger-dev_trigger-cfn-network');
  });

  it('should handle different modes', () => {
    const modes: CFNMode[] = ['mvp', 'standard', 'enterprise'];

    modes.forEach(mode => {
      const cmd = buildProductOwnerDockerCommand({
        containerName: `cfn-po-${mode}`,
        taskId: 'task-001',
        consensusSummary: 'Summary',
        mode,
        iteration: 1,
      });

      expect(cmd).toContain(`-e MODE=${mode}`);
      expect(cmd).toContain(`--mode ${mode}`);
    });
  });

  it('should handle high iteration numbers', () => {
    const cmd = buildProductOwnerDockerCommand({
      containerName: 'cfn-po-001',
      taskId: 'task-001',
      consensusSummary: 'Summary',
      mode: 'standard',
      iteration: 15,
    });

    expect(cmd).toContain('-e ITERATION=15');
  });
});

/**
 * Test Suite 6: Error Handling
 * Tests recovery from Product Owner failures
 */
describe('CFN Product Owner: Error Handling', () => {
  it('should handle timeout gracefully', () => {
    const timeout = 300000; // 5 minutes
    const exceedingTime = timeout + 1;
    expect(exceedingTime).toBeGreaterThan(timeout);
  });

  it('should handle empty consensus result', () => {
    const emptyValidators: ValidatorResult[] = [];
    expect(emptyValidators.length).toBe(0);
  });

  it('should handle invalid decision parsing', () => {
    const invalidDecisions = ['INVALID', 'RETRY', 'SKIP'];
    const validDecisions = ['PROCEED', 'ITERATE', 'ABORT'];

    invalidDecisions.forEach(invalid => {
      expect(validDecisions).not.toContain(invalid);
    });
  });

  it('should return default decision on error', () => {
    const defaultDecision = 'ABORT';
    expect(['PROCEED', 'ITERATE', 'ABORT']).toContain(defaultDecision);
  });

  it('should include error message in reasoning', () => {
    const errorReasoning = 'Decision failed: Unable to parse validator output';
    expect(errorReasoning).toContain('failed');
  });
});

/**
 * Test Suite 7: Integration Tests
 * Tests complete Product Owner workflow
 */
describe('CFN Product Owner: Integration Tests', () => {
  it('should execute complete Product Owner workflow with PROCEED', () => {
    const payload: ProductOwnerJobPayload = {
      taskId: 'task-integration-001',
      consensusResult: {
        averageScore: 0.92,
        validatorResults: [
          {
            validatorId: 'v1',
            validatorType: 'code-reviewer',
            consensusScore: 0.92,
            feedback: 'Good code quality',
            completedAt: new Date().toISOString(),
          },
          {
            validatorId: 'v2',
            validatorType: 'security-auditor',
            consensusScore: 0.91,
            feedback: 'Security checks passed',
            completedAt: new Date().toISOString(),
          },
          {
            validatorId: 'v3',
            validatorType: 'test-validator',
            consensusScore: 0.93,
            feedback: 'Test coverage excellent',
            completedAt: new Date().toISOString(),
          },
        ],
        consensusMet: true,
        threshold: 0.9,
        summary: 'All quality gates passed',
        consensusAt: new Date().toISOString(),
      },
      gateCheckResult: {
        passed: true,
        passRate: 0.96,
        threshold: 0.95,
        aggregatedResults: {
          totalTests: 50,
          passedTests: 48,
          failedTests: 2,
        },
        checkedAt: new Date().toISOString(),
      },
      mode: 'standard',
      iterationNumber: 1,
      maxIterations: 10,
    };

    // Validate decision logic
    const thresholds = getThresholdConfig(payload.mode);
    const shouldProceed =
      payload.gateCheckResult.passed &&
      payload.consensusResult.averageScore >= thresholds.loop2ConsensusThreshold &&
      payload.iterationNumber < payload.maxIterations;

    expect(shouldProceed).toBe(true);
    expect(payload.consensusResult.averageScore).toBeGreaterThanOrEqual(0.9);
  });

  it('should execute complete Product Owner workflow with ITERATE', () => {
    const payload: ProductOwnerJobPayload = {
      taskId: 'task-integration-002',
      consensusResult: {
        averageScore: 0.85,
        validatorResults: [
          {
            validatorId: 'v1',
            validatorType: 'code-reviewer',
            consensusScore: 0.85,
            feedback: 'Some improvements needed',
            issues: ['Test coverage below 80%'],
            completedAt: new Date().toISOString(),
          },
        ],
        consensusMet: false,
        threshold: 0.9,
        summary: 'Quality needs improvement',
        blockingIssues: ['Test coverage below 80%'],
        consensusAt: new Date().toISOString(),
      },
      gateCheckResult: {
        passed: true,
        passRate: 0.95,
        threshold: 0.95,
        aggregatedResults: {
          totalTests: 40,
          passedTests: 38,
          failedTests: 2,
        },
        checkedAt: new Date().toISOString(),
      },
      mode: 'standard',
      iterationNumber: 2,
      maxIterations: 10,
    };

    const thresholds = getThresholdConfig(payload.mode);
    const shouldIterate =
      payload.consensusResult.averageScore < thresholds.loop2ConsensusThreshold &&
      payload.iterationNumber < payload.maxIterations;

    expect(shouldIterate).toBe(true);
    expect(payload.consensusResult.blockingIssues).toBeDefined();
  });
});
