import { task } from '@trigger.dev/sdk/v3';
import { AgentResult, GateCheckResult } from '../types/cfn-types';

export interface GateCheckTaskPayload {
  taskId: string;
  passRate?: number;
  threshold: number;
  agentResults?: AgentResult[];
}

export const gateCheckTask = task({
  id: 'cfn-gate-check',
  run: async (payload: GateCheckTaskPayload): Promise<GateCheckResult> => {
    const computedPassRate =
      payload.passRate !== undefined
        ? payload.passRate
        : averagePassRate(payload.agentResults || []);

    const passed = computedPassRate >= payload.threshold;
    return {
      passed,
      passRate: computedPassRate,
      threshold: payload.threshold,
      agentResults: payload.agentResults || [],
      reason: passed ? 'Gate passed' : 'Gate failed',
      checkedAt: new Date().toISOString(),
    };
  },
});

function averagePassRate(agentResults: AgentResult[]): number {
  if (!agentResults.length) return 0;
  const sum = agentResults.reduce((acc, result) => acc + (result.testResults?.passRate ?? 0), 0);
  return sum / agentResults.length;
}
