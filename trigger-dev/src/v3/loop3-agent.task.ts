import { task } from '@trigger.dev/sdk/v3';
import { AgentResult, Loop3JobPayload } from '../types/cfn-types';

export const loop3AgentTask = task({
  id: 'cfn-loop3-agent',
  run: async (payload: Loop3JobPayload): Promise<AgentResult> => {
    const agentId = `${payload.agentType}-${Date.now()}`;
    return {
      agentId,
      agentType: payload.agentType,
      confidence: 1.0,
      deliverables: { files: [], summary: 'Simulated agent output' },
      testResults: { total: 1, passed: 1, failed: 0, passRate: 1 },
      completedAt: new Date().toISOString(),
      output: 'Simulated agent execution',
    };
  },
});
