/**
 * CFN Agent Job - trigger.dev v2 Implementation
 * Execute CFN Loop implementer agents via CLI
 */

import { TriggerClient, defineJob, eventTrigger } from '@trigger.dev/sdk';
import {
  Loop3JobPayload,
  AgentResult,
  TestResults,
} from '../types/cfn-types';
import { validateTaskId } from '../utils/path-validation';

// Declare client for external initialization
declare const client: TriggerClient;

/**
 * CFN Agent Job (v2 API)
 *
 * Spawns CFN Loop agent via CLI and collects results.
 * Uses eventTrigger for event-driven execution.
 */
export const cfnAgentJob = defineJob({
  id: 'cfn-agent-job',
  name: 'CFN Agent Execution',
  version: '1.0.0',
  trigger: eventTrigger({
    name: 'cfn.agent.run',
  }),
  run: async (payload: Loop3JobPayload, io, ctx) => {
    const {
      taskId,
      agentType,
      description,
      successCriteria,
      iterationNumber,
    } = payload;

    const agentId = `${agentType}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    await io.logger.log('Starting CFN agent', {
      taskId,
      agentId,
      agentType,
      iterationNumber,
    });

    try {
      // SECURITY: Validate taskId to prevent command injection (CVSS 7.5)
      // This MUST run before any shell command execution
      validateTaskId(taskId);

      // Execute agent via CFN CLI
      const output = await io.runTask('spawn-agent', async () => {
        const { execSync } = await import('child_process');
        const cmd = `npx claude-flow-novice agent-spawn ${agentType} --task-id ${taskId}`;

        try {
          const result = execSync(cmd, {
            encoding: 'utf-8',
            timeout: 30 * 60 * 1000, // 30 min timeout
            env: {
              ...process.env,
              CFN_TASK_DESCRIPTION: description,
              CFN_AGENT_ID: agentId,
            },
          });
          return result;
        } catch (error: any) {
          return error.stdout || error.message || 'Agent execution failed';
        }
      });

      await io.logger.log('Agent completed', {
        taskId,
        agentId,
        outputLength: output?.length || 0,
      });

      // Parse test results from output
      const testResults = parseTestResults(output, successCriteria);

      const result: AgentResult = {
        agentId,
        agentType,
        confidence: calculateConfidence(testResults),
        deliverables: {
          files: extractFiles(output),
          summary: extractSummary(output),
        },
        testResults,
        completedAt: new Date().toISOString(),
        output,
      };

      await io.logger.log('Agent result', {
        taskId,
        agentId,
        passRate: result.testResults.passRate.toFixed(4),
        confidence: result.confidence.toFixed(4),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await io.logger.error('Agent failed', { taskId, agentId, error: errorMessage });

      return {
        agentId,
        agentType,
        confidence: 0,
        deliverables: { files: [], summary: `Agent failed: ${errorMessage}` },
        testResults: { total: 0, passed: 0, failed: 0, passRate: 0, output: errorMessage },
        completedAt: new Date().toISOString(),
      } as AgentResult;
    }
  },
});

function parseTestResults(output: string, successCriteria: any): TestResults {
  const passedMatch = output.match(/(\d+)\s+(?:passed|passing)/i);
  const failedMatch = output.match(/(\d+)\s+(?:failed|failing)/i);
  const coverageMatch = output.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:coverage|covered)/i);

  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
  const total = passed + failed;
  const passRate = total > 0 ? passed / total : 0;
  const coverage = coverageMatch ? parseFloat(coverageMatch[1]) / 100 : undefined;

  return { total, passed, failed, passRate, output, coverage };
}

function calculateConfidence(testResults: TestResults): number {
  let confidence = testResults.passRate;
  if (testResults.coverage && testResults.coverage >= 0.8) {
    confidence = Math.min(1.0, confidence + 0.1);
  }
  if (testResults.total >= 50) {
    confidence = Math.min(1.0, confidence + 0.05);
  }
  return Math.round(confidence * 100) / 100;
}

function extractFiles(output: string): string[] {
  const matches = output.match(/(?:modified|created|updated):\s*(.+)/gi);
  return matches?.map(m => m.replace(/(?:modified|created|updated):\s*/i, '').trim()) || [];
}

function extractSummary(output: string): string {
  const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('  ')).slice(0, 3);
  return lines.join(' ') || 'Implementation completed';
}

export default cfnAgentJob;
