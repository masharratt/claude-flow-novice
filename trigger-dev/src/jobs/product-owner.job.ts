/**
 * Product Owner Decision Job
 * Interprets consensus results and makes PROCEED/ITERATE/ABORT decision
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import {
  ConsensusResult,
  ProductOwnerDecision,
  GateCheckResult,
  CFNMode,
  getThresholdConfig,
} from '../types/cfn-types';

/**
 * Product Owner Decision Job Payload
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
 * Product Owner Decision Job
 *
 * Reviews consensus from Loop 2 validators and gate check results.
 * Makes final decision: PROCEED, ITERATE, or ABORT.
 *
 * Decision Logic:
 * - PROCEED: Gate passed AND consensus >= threshold
 * - ITERATE: Consensus score < threshold (specific aspect needs work)
 * - ABORT: Max iterations reached OR critical issues identified
 *
 * TODO: RUNTIME_TEST - Verify PROCEED decision when all gates pass
 * TODO: RUNTIME_TEST - Verify ITERATE decision for sub-threshold consensus
 * TODO: RUNTIME_TEST - Verify ABORT decision on max iterations
 * TODO: RUNTIME_TEST - Verify reasoning generation for each decision type
 */
export const productOwnerJob = task({
  id: 'cfn-product-owner',
  maxAttempts: 1,
  timeout: '5m',
  run: async (
    payload: ProductOwnerJobPayload
  ): Promise<ProductOwnerDecision> => {
    const {
      taskId,
      consensusResult,
      gateCheckResult,
      mode,
      iterationNumber,
      maxIterations,
    } = payload;

    logger.log('Starting Product Owner decision', {
      taskId,
      iterationNumber,
      maxIterations,
      consensusScore: consensusResult.averageScore.toFixed(4),
      gateCheckPassed: gateCheckResult.passed,
    });

    // Get thresholds for mode
    const thresholds = getThresholdConfig(mode);

    // Determine decision
    const decision = determineDecision(
      consensusResult,
      gateCheckResult,
      iterationNumber,
      maxIterations,
      thresholds
    );

    const result: ProductOwnerDecision = {
      decision: decision.decision,
      reasoning: decision.reasoning,
      iterationFocus: decision.iterationFocus,
      abortReason: decision.abortReason,
      validations: decision.validations,
      decidedAt: new Date().toISOString(),
    };

    logger.log('Product Owner decision', {
      taskId,
      decision: result.decision,
      iterationNumber,
      reasoning: result.reasoning.substring(0, 100),
    });

    return result;
  },
});

/**
 * Decision calculation logic
 */
interface DecisionCalc {
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';
  reasoning: string;
  iterationFocus?: string;
  abortReason?: string;
  validations?: string[];
}

/**
 * Determine Product Owner decision based on consensus and gate check
 */
function determineDecision(
  consensus: ConsensusResult,
  gateCheck: GateCheckResult,
  iterationNumber: number,
  maxIterations: number,
  thresholds: ReturnType<typeof getThresholdConfig>
): DecisionCalc {
  // Check max iterations
  if (iterationNumber >= maxIterations) {
    return {
      decision: 'ABORT',
      abortReason: `Max iterations (${maxIterations}) reached. Current consensus: ${(
        consensus.averageScore * 100
      ).toFixed(1)}%, required: ${(thresholds.loop2ConsensusThreshold * 100).toFixed(1)}%`,
      reasoning:
        `Iteration limit reached. Consensus score (${(consensus.averageScore * 100).toFixed(
          1
        )}%) has not met threshold (${(thresholds.loop2ConsensusThreshold * 100).toFixed(
          1
        )}%). ` +
        `Further iteration unlikely to improve results significantly.`,
    };
  }

  // Check gate pass requirement
  if (!gateCheck.passed) {
    // Gate failed, need more implementation work in Loop 3
    return {
      decision: 'ITERATE',
      iterationFocus: 'implementation',
      reasoning:
        `Loop 3 gate check failed (${(gateCheck.passRate * 100).toFixed(
          1
        )}% < ${(gateCheck.threshold * 100).toFixed(
          1
        )}%). ` +
        `Implementation work needs iteration to improve test pass rate.`,
    };
  }

  // Check consensus threshold
  if (consensus.averageScore < thresholds.loop2ConsensusThreshold) {
    // Consensus too low, need more refinement
    const issues = consensus.blockingIssues || [];
    const focus =
      issues.length > 0
        ? identifyIterationFocus(issues)
        : 'quality';

    return {
      decision: 'ITERATE',
      iterationFocus: focus,
      reasoning:
        `Consensus score (${(consensus.averageScore * 100).toFixed(
          1
        )}%) below threshold (${(thresholds.loop2ConsensusThreshold * 100).toFixed(
          1
        )}%). ` +
        `Need iteration focusing on: ${focus}. ` +
        `Validator feedback: ${consensus.summary}`,
    };
  }

  // All checks pass - proceed to completion
  return {
    decision: 'PROCEED',
    reasoning:
      `All quality gates passed. ` +
      `Gate check: ${(gateCheck.passRate * 100).toFixed(
        1
      )}% pass rate, ` +
      `Consensus score: ${(consensus.averageScore * 100).toFixed(1)}%. ` +
      `Work meets all quality requirements.`,
    validations: buildValidationsList(consensus, gateCheck, thresholds),
  };
}

/**
 * Identify which aspect needs iteration focus
 */
function identifyIterationFocus(issues: string[]): string {
  const keywords: Record<string, string> = {
    test: 'testing',
    coverage: 'coverage',
    performance: 'performance',
    security: 'security',
    architecture: 'architecture',
    documentation: 'documentation',
    style: 'code quality',
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

/**
 * Build list of validations that passed
 */
function buildValidationsList(
  consensus: ConsensusResult,
  gateCheck: GateCheckResult,
  thresholds: ReturnType<typeof getThresholdConfig>
): string[] {
  const validations: string[] = [];

  validations.push(
    `Gate check passed (${(gateCheck.passRate * 100).toFixed(1)}% >= ${(
      gateCheck.threshold * 100
    ).toFixed(1)}%)`
  );

  validations.push(
    `Consensus score achieved (${(consensus.averageScore * 100).toFixed(1)}% >= ${(
      thresholds.loop2ConsensusThreshold * 100
    ).toFixed(1)}%)`
  );

  validations.push(
    `${consensus.validatorResults.length} validators agree on quality`
  );

  if (!consensus.blockingIssues || consensus.blockingIssues.length === 0) {
    validations.push('No blocking issues identified');
  }

  return validations;
}

/**
 * Trigger Product Owner decision job
 *
 * @param payload Product Owner job payload
 * @returns Product Owner decision
 *
 * TODO: RUNTIME_TEST - Verify job execution in trigger.dev runtime
 * TODO: RUNTIME_TEST - Verify decision accuracy across all thresholds
 */
export async function triggerProductOwnerDecision(
  payload: ProductOwnerJobPayload
): Promise<ProductOwnerDecision> {
  const result = await productOwnerJob.trigger(payload);
  return result;
}
