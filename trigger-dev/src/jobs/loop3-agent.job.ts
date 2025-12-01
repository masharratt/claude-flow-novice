/**
 * Loop 3 Agent Job - Implementation Work
 * Spawns CFN Loop implementer agents and collects results
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import {
  Loop3JobPayload,
  AgentResult,
  TestResults,
} from '../types/cfn-types';
import {
  AgentSpawner,
  getSpawner,
} from '../utils/agent-spawner';

/**
 * Loop 3 Agent Job
 *
 * Spawns a single CFN Loop implementer agent to perform implementation work.
 * Collects agent output, test results, and confidence score.
 * Returns standardized AgentResult for gate check processing.
 *
 * NOTE: This is a simulation of actual agent spawn.
 * In production, integrates with CFN CLI agent-spawn command.
 *
 * TODO: RUNTIME_TEST - Verify agent spawn via CFN CLI succeeds
 * TODO: RUNTIME_TEST - Verify Redis coordination signal reception
 * TODO: RUNTIME_TEST - Verify test results parsing from agent output
 * TODO: RUNTIME_TEST - Verify timeout handling for long-running agents
 */
export const loop3AgentJob = task({
  id: 'cfn-loop3-agent',
  maxAttempts: 1,
  timeout: '30m',
  run: async (payload: Loop3JobPayload): Promise<AgentResult> => {
    const {
      taskId,
      agentType,
      description,
      successCriteria,
      iterationNumber,
    } = payload;

    const agentId = generateAgentId(agentType);

    logger.log('Starting Loop 3 agent', {
      taskId,
      agentId,
      agentType,
      iterationNumber,
    });

    try {
      // Spawn agent via CFN CLI
      const spawner = getSpawner();
      const spawnResponse = await spawner.spawn({
        agentType,
        taskDescription: description,
        successCriteria,
        taskId,
        agentId,
        context: {
          iterationNumber,
          previousResults: payload.previousContext,
        },
      });

      logger.log('Agent spawned', {
        taskId,
        agentId,
        jobId: spawnResponse.jobId,
      });

      // Wait for agent completion with polling
      // TODO: RUNTIME_TEST - Implement Redis coordination waiting
      const agentOutput = await waitForAgentCompletion(
        taskId,
        agentId,
        spawnResponse.estimatedDurationSeconds
      );

      logger.log('Agent completed', {
        taskId,
        agentId,
        outputLength: agentOutput?.length || 0,
      });

      // Parse test results from agent output
      const testResults = parseTestResults(agentOutput, successCriteria);

      // Build result
      const result: AgentResult = {
        agentId,
        agentType,
        confidence: calculateConfidence(testResults),
        deliverables: {
          files: extractFilesFromOutput(agentOutput),
          summary: extractSummaryFromOutput(agentOutput),
        },
        testResults,
        completedAt: new Date().toISOString(),
        output: agentOutput,
      };

      logger.log('Loop 3 agent result', {
        taskId,
        agentId,
        passRate: result.testResults.passRate.toFixed(4),
        confidence: result.confidence.toFixed(4),
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      logger.error('Loop 3 agent failed', {
        taskId,
        agentId,
        error: errorMessage,
      });

      // Return failure result with zero pass rate
      return {
        agentId,
        agentType,
        confidence: 0,
        deliverables: {
          files: [],
          summary: `Agent failed: ${errorMessage}`,
        },
        testResults: {
          total: 0,
          passed: 0,
          failed: 0,
          passRate: 0,
          output: errorMessage,
        },
        completedAt: new Date().toISOString(),
      };
    }
  },
});

/**
 * Generate unique agent ID
 */
function generateAgentId(agentType: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${agentType}-${timestamp}-${random}`;
}

/**
 * Wait for agent completion with polling
 *
 * Polls Redis coordination layer for agent completion signal.
 * Times out if agent doesn't complete within estimated duration + buffer.
 *
 * TODO: RUNTIME_TEST - Verify Redis BLPOP blocking works
 * TODO: RUNTIME_TEST - Verify timeout occurs after max duration
 * TODO: RUNTIME_TEST - Verify output parsing from Redis
 */
async function waitForAgentCompletion(
  taskId: string,
  agentId: string,
  estimatedSeconds: number
): Promise<string> {
  // TODO: RUNTIME_TEST - Implement actual Redis blocking wait
  // For now, simulate with timeout
  const maxWaitMs = (estimatedSeconds + 60) * 1000; // Add 60s buffer

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Agent ${agentId} did not complete within ${maxWaitMs}ms`));
    }, maxWaitMs);

    // TODO: RUNTIME_TEST - Replace with actual Redis BLPOP
    // const redisKey = `agent:${taskId}:${agentId}:output`;
    // const output = await redis.blpop(redisKey, maxWaitMs / 1000);

    // Simulate agent output for now
    const simulatedOutput = `
      Agent: ${agentId}
      Task: CFN Loop implementation
      Status: COMPLETED
      Tests: 95 passed, 5 failed (95% pass rate)
      Coverage: 87%
      Files modified: 3
    `;

    clearTimeout(timeout);
    resolve(simulatedOutput);
  });
}

/**
 * Parse test results from agent output
 *
 * Extracts test statistics from agent output.
 * Expected format: "X passed, Y failed" or similar.
 *
 * TODO: RUNTIME_TEST - Verify parsing accuracy with real agent output
 */
function parseTestResults(
  output: string,
  successCriteria: any
): TestResults {
  // Extract passed/failed counts from output
  const passedMatch = output.match(/(\d+)\s+(?:passed|passing)/i);
  const failedMatch = output.match(/(\d+)\s+(?:failed|failing)/i);
  const coverageMatch = output.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:coverage|covered)/i);

  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
  const total = passed + failed;
  const passRate = total > 0 ? passed / total : 0;
  const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : undefined;

  return {
    total,
    passed,
    failed,
    passRate,
    output,
    coverage: coverage !== undefined ? coverage / 100 : undefined,
  };
}

/**
 * Calculate confidence score from test results
 *
 * Confidence combines pass rate, coverage, and test count.
 * Higher values indicate better implementation quality.
 */
function calculateConfidence(testResults: TestResults): number {
  // Base confidence on pass rate
  let confidence = testResults.passRate;

  // Boost for good coverage
  if (testResults.coverage && testResults.coverage >= 0.8) {
    confidence = Math.min(1.0, confidence + 0.1);
  }

  // Boost for large test suite
  if (testResults.total >= 50) {
    confidence = Math.min(1.0, confidence + 0.05);
  }

  return Math.round(confidence * 100) / 100;
}

/**
 * Extract file list from agent output
 */
function extractFilesFromOutput(output: string): string[] {
  const fileMatches = output.match(/(?:modified|created|updated):\s*(.+)/gi);
  if (!fileMatches) {
    return [];
  }

  return fileMatches.map((match) =>
    match.replace(/(?:modified|created|updated):\s*/i, '').trim()
  );
}

/**
 * Extract summary from agent output
 */
function extractSummaryFromOutput(output: string): string {
  const lines = output.split('\n');
  const summary = lines
    .filter((line) => line.length > 0 && !line.startsWith('  '))
    .slice(0, 3)
    .join(' ');

  return summary || 'Implementation completed';
}

/**
 * Trigger Loop 3 agent job
 *
 * @param payload Loop 3 job payload
 * @returns Agent result
 *
 * TODO: RUNTIME_TEST - Verify job execution in trigger.dev runtime
 */
export async function triggerLoop3Agent(
  payload: Loop3JobPayload
): Promise<AgentResult> {
  const result = await loop3AgentJob.trigger(payload);
  return result;
}
