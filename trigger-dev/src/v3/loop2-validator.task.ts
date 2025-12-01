import { task } from '@trigger.dev/sdk/v3';
import { Loop2JobPayload, ValidatorResult } from '../types/cfn-types';

export const loop2ValidatorTask = task({
  id: 'cfn-loop2-validator',
  run: async (payload: Loop2JobPayload): Promise<ValidatorResult> => {
    const validatorId = `${payload.validatorType}-${Date.now()}`;
    const consensusScore = Math.min(
      Math.max(payload.gateResult?.passRate ?? 0.8, 0),
      1
    );
    return {
      validatorId,
      validatorType: payload.validatorType,
      consensusScore,
      feedback: consensusScore >= 0.9 ? 'Validator approval' : 'Needs refinement before proceed',
      issues: consensusScore >= 0.9 ? [] : ['Improve quality to meet consensus threshold'],
      recommendations: consensusScore >= 0.9 ? [] : ['Address validator feedback and rerun tests'],
      completedAt: new Date().toISOString(),
    };
  },
});
