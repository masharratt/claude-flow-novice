import { task } from '@trigger.dev/sdk/v3';
import { GateCheckResult } from '../types/cfn-types';

export interface GateCheckTaskPayload {
  taskId: string;
  passRate: number;
  threshold: number;
}

export const gateCheckTask = task({
  id: 'cfn-gate-check',
  run: async (payload: GateCheckTaskPayload): Promise<GateCheckResult> => {
    const passed = payload.passRate >= payload.threshold;
    return {
      passed,
      passRate: payload.passRate,
      threshold: payload.threshold,
      agentResults: [],
      reason: passed ? 'Gate passed' : 'Gate failed',
      checkedAt: new Date().toISOString(),
    };
  },
});
