/**
 * Gate Check Job - Loop 3 Quality Validation
 * Validates test pass rates against threshold and determines Loop 2 progression
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import {
  AgentResult,
  GateCheckResult,
  getThresholdConfig,
} from '../types/cfn-types';

/**
 * Gate Check Job Payload
 */
interface GateCheckJobPayload {
  taskId: string;
  agentResults: AgentResult[];
  mode: 'mvp' | 'standard' | 'enterprise';
  iterationNumber: number;
}

/**
 * Gate Check Job
 *
 * Executes after all Loop 3 agents complete.
 * Validates test pass rates against mode-specific thresholds.
 * Determines whether to proceed to Loop 2 or iterate Loop 3.
 *
 * TODO: RUNTIME_TEST - Verify pass rate calculation accuracy
 * TODO: RUNTIME_TEST - Verify gate decision (PASS/FAIL) matches threshold
 * TODO: RUNTIME_TEST - Verify agent results aggregation
 */
export const gateCheckJob = task({
  id: 'cfn-gate-check',
  maxAttempts: 1,
  timeout: '5m',
  run: async (payload: GateCheckJobPayload): Promise<GateCheckResult> => {
    const { taskId, agentResults, mode, iterationNumber } = payload;

    logger.log('Starting gate check', {
      taskId,
      mode,
      iterationNumber,
      agentCount: agentResults.length,
    });

    // Validate input
    if (!agentResults || agentResults.length === 0) {
      throw new Error(
        'Gate check requires at least one agent result'
      );
    }

    // Get threshold configuration for mode
    const thresholds = getThresholdConfig(mode);

    // Calculate aggregate pass rate
    const aggregatePassRate = calculateAggregatePassRate(agentResults);

    // Determine if gate passes
    const gatePasses =
      aggregatePassRate >= thresholds.loop3PassRateThreshold;

    logger.log('Gate check calculation', {
      taskId,
      aggregatePassRate: aggregatePassRate.toFixed(4),
      threshold: thresholds.loop3PassRateThreshold,
      gatePasses,
    });

    // Build gate check result
    const result: GateCheckResult = {
      passed: gatePasses,
      passRate: aggregatePassRate,
      threshold: thresholds.loop3PassRateThreshold,
      agentResults,
      reason: buildGateReason(
        aggregatePassRate,
        thresholds.loop3PassRateThreshold,
        agentResults
      ),
      checkedAt: new Date().toISOString(),
    };

    logger.log('Gate check result', {
      taskId,
      passed: result.passed,
      reason: result.reason,
    });

    return result;
  },
});

/**
 * Calculate aggregate pass rate from multiple agents
 *
 * Weighted average where each agent's contribution is normalized.
 * Formula: Sum(passed tests) / Sum(total tests)
 */
function calculateAggregatePassRate(agentResults: AgentResult[]): number {
  const totalPassed = agentResults.reduce(
    (sum, result) => sum + result.testResults.passed,
    0
  );

  const totalTests = agentResults.reduce(
    (sum, result) => sum + result.testResults.total,
    0
  );

  if (totalTests === 0) {
    return 0;
  }

  return totalPassed / totalTests;
}

/**
 * Build human-readable reason for gate decision
 */
function buildGateReason(
  passRate: number,
  threshold: number,
  agentResults: AgentResult[]
): string {
  const passPercentage = (passRate * 100).toFixed(1);
  const thresholdPercentage = (threshold * 100).toFixed(1);

  if (passRate >= threshold) {
    return (
      `Gate PASSED: ${passPercentage}% pass rate meets ${thresholdPercentage}% threshold ` +
      `(${agentResults.length} agents, ${agentResults.reduce((sum, r) => sum + r.testResults.passed, 0)} tests passed)`
    );
  }

  // Find lowest performer for feedback
  const lowestPerformer = agentResults.reduce((prev, current) =>
    current.testResults.passRate < prev.testResults.passRate ? current : prev
  );

  return (
    `Gate FAILED: ${passPercentage}% pass rate below ${thresholdPercentage}% threshold. ` +
    `Requires iteration. Lowest performer: ${lowestPerformer.agentId} ` +
    `(${(lowestPerformer.testResults.passRate * 100).toFixed(1)}% pass rate)`
  );
}

/**
 * Trigger gate check job
 *
 * @param payload Gate check job payload
 * @returns Gate check result
 *
 * TODO: RUNTIME_TEST - Verify job execution in trigger.dev runtime
 * TODO: RUNTIME_TEST - Verify error handling for malformed input
 */
export async function triggerGateCheck(
  payload: GateCheckJobPayload
): Promise<GateCheckResult> {
  const result = await gateCheckJob.trigger(payload);
  return result;
}
