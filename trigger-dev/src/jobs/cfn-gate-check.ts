/**
 * CFN Gate Check Job - trigger.dev v2 Implementation
 * Validate test pass rates against mode thresholds
 */

import { TriggerClient, defineJob, eventTrigger } from '@trigger.dev/sdk';
import {
  AgentResult,
  GateCheckResult,
  CFNMode,
  getThresholdConfig,
} from '../types/cfn-types';

// Declare client for external initialization
declare const client: TriggerClient;

/**
 * Gate Check Job Payload
 */
interface GateCheckPayload {
  taskId: string;
  agentResults: AgentResult[];
  mode: CFNMode;
  iterationNumber: number;
}

/**
 * CFN Gate Check Job (v2 API)
 *
 * Aggregates pass rates from Loop 3 agents.
 * Compares against mode-specific thresholds.
 * Returns gate decision with reasoning.
 */
export const cfnGateCheckJob = defineJob({
  id: 'cfn-gate-check-job',
  name: 'CFN Gate Check',
  version: '1.0.0',
  trigger: eventTrigger({
    name: 'cfn.gate.check',
  }),
  run: async (payload: GateCheckPayload, io, ctx) => {
    const { taskId, agentResults, mode, iterationNumber } = payload;

    await io.logger.log('Starting gate check', {
      taskId,
      mode,
      iterationNumber,
      agentCount: agentResults.length,
    });

    if (!agentResults || agentResults.length === 0) {
      throw new Error('Gate check requires at least one agent result');
    }

    const thresholds = getThresholdConfig(mode);
    const threshold = thresholds.loop3PassRateThreshold;

    // Aggregate pass rate: Sum(passed) / Sum(total)
    const totalPassed = agentResults.reduce((sum, r) => sum + r.testResults.passed, 0);
    const totalTests = agentResults.reduce((sum, r) => sum + r.testResults.total, 0);
    const passRate = totalTests > 0 ? totalPassed / totalTests : 0;

    const passed = passRate >= threshold;

    await io.logger.log('Gate calculation', {
      taskId,
      passRate: passRate.toFixed(4),
      threshold,
      passed,
    });

    const reason = passed
      ? `Gate PASSED: ${(passRate * 100).toFixed(1)}% pass rate meets ${(threshold * 100).toFixed(1)}% threshold (${agentResults.length} agents, ${totalPassed} tests passed)`
      : buildFailReason(passRate, threshold, agentResults);

    const result: GateCheckResult = {
      passed,
      passRate,
      threshold,
      agentResults,
      reason,
      checkedAt: new Date().toISOString(),
    };

    await io.logger.log('Gate check result', {
      taskId,
      passed: result.passed,
      reason: result.reason,
    });

    return result;
  },
});

function buildFailReason(passRate: number, threshold: number, agentResults: AgentResult[]): string {
  const lowestPerformer = agentResults.reduce((prev, curr) =>
    curr.testResults.passRate < prev.testResults.passRate ? curr : prev
  );

  return (
    `Gate FAILED: ${(passRate * 100).toFixed(1)}% pass rate below ${(threshold * 100).toFixed(1)}% threshold. ` +
    `Requires iteration. Lowest performer: ${lowestPerformer.agentId} ` +
    `(${(lowestPerformer.testResults.passRate * 100).toFixed(1)}% pass rate)`
  );
}

export default cfnGateCheckJob;
