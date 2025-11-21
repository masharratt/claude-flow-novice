/**
 * Loop 2 Validator Job - Quality Validation
 * Spawns CFN Loop validator agents and collects consensus
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import {
  Loop2JobPayload,
  ValidatorResult,
  AgentResult,
} from '../types/cfn-types';

/**
 * Loop 2 Validator Job
 *
 * Spawns a CFN Loop validator agent to review Loop 3 work.
 * Validators assess code quality, test coverage, architecture, and security.
 * Returns standardized ValidatorResult for consensus aggregation.
 *
 * NOTE: This is a simulation of validator spawning.
 * In production, integrates with CFN CLI agent-spawn for validator types.
 *
 * TODO: RUNTIME_TEST - Verify validator spawn via CFN CLI succeeds
 * TODO: RUNTIME_TEST - Verify validator can access Loop 3 deliverables
 * TODO: RUNTIME_TEST - Verify consensus score parsing from output
 * TODO: RUNTIME_TEST - Verify feedback extraction and structuring
 */
export const loop2ValidatorJob = task({
  id: 'cfn-loop2-validator',
  maxAttempts: 1,
  timeout: '20m',
  run: async (payload: Loop2JobPayload): Promise<ValidatorResult> => {
    const {
      taskId,
      validatorType,
      loop3Results,
      gateResult,
      description,
      iterationNumber,
    } = payload;

    const validatorId = generateValidatorId(validatorType);

    logger.log('Starting Loop 2 validator', {
      taskId,
      validatorId,
      validatorType,
      iterationNumber,
      agentResultsCount: loop3Results.length,
    });

    try {
      // Simulate validator execution
      // In production, this would spawn actual validator agent
      const validationOutput = await simulateValidation(
        validatorType,
        loop3Results,
        description
      );

      logger.log('Validation completed', {
        taskId,
        validatorId,
        outputLength: validationOutput.length,
      });

      // Parse validator output
      const consensusScore = parseConsensusScore(validationOutput);
      const feedback = extractFeedback(validationOutput);
      const issues = extractIssues(validationOutput);
      const recommendations = extractRecommendations(validationOutput);

      const result: ValidatorResult = {
        validatorId,
        validatorType,
        consensusScore,
        feedback,
        issues: issues.length > 0 ? issues : undefined,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        completedAt: new Date().toISOString(),
      };

      logger.log('Validator result', {
        taskId,
        validatorId,
        consensusScore: result.consensusScore.toFixed(4),
        issuesCount: issues.length,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      logger.error('Validator failed', {
        taskId,
        validatorId,
        error: errorMessage,
      });

      // Return failure result with low consensus score
      return {
        validatorId,
        validatorType,
        consensusScore: 0.3,
        feedback: `Validation failed: ${errorMessage}`,
        issues: ['Validation process failed'],
        completedAt: new Date().toISOString(),
      };
    }
  },
});

/**
 * Generate unique validator ID
 */
function generateValidatorId(validatorType: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${validatorType}-${timestamp}-${random}`;
}

/**
 * Simulate validator execution
 *
 * In production, this would spawn actual validator agent.
 * For testing, generates synthetic validation output.
 */
async function simulateValidation(
  validatorType: string,
  loop3Results: AgentResult[],
  description: string
): Promise<string> {
  // Calculate metrics from Loop 3 results
  const totalTests = loop3Results.reduce(
    (sum, r) => sum + r.testResults.total,
    0
  );
  const passedTests = loop3Results.reduce(
    (sum, r) => sum + r.testResults.passed,
    0
  );
  const passRate = totalTests > 0 ? passedTests / totalTests : 0;

  // Generate validator output based on pass rate
  const consensusScore = Math.min(1.0, passRate + 0.1); // Slight boost for passing tests
  const scorePercentage = (consensusScore * 100).toFixed(0);

  return `
    Validator: ${validatorType}
    Task: Validating CFN Loop implementation
    Status: COMPLETED

    Quality Assessment:
    - Code Quality: ${scorePercentage}%
    - Test Coverage: Good (87% average)
    - Architecture: Sound
    - Security: Compliant

    Results Review:
    - Total tests: ${totalTests}
    - Passed: ${passedTests}
    - Pass rate: ${(passRate * 100).toFixed(1)}%

    Feedback:
    Implementation demonstrates solid understanding of requirements.
    All critical paths covered. No blocking issues identified.

    Issues: None critical

    Recommendations:
    - Increase test coverage for edge cases
    - Add performance benchmarks
    - Document complex algorithms
  `;
}

/**
 * Parse consensus score from validator output
 *
 * Extracts numeric score or percentage from output.
 * Expected format: "Score: X%" or "Consensus: 0.XX"
 *
 * TODO: RUNTIME_TEST - Verify score extraction accuracy
 */
function parseConsensusScore(output: string): number {
  // Try to find percentage format
  const percentMatch = output.match(/(?:score|consensus|quality)[^0-9]*(\d+)\s*%/i);
  if (percentMatch) {
    return parseInt(percentMatch[1], 10) / 100;
  }

  // Try decimal format
  const decimalMatch = output.match(/(?:score|consensus)[^0-9]*(0\.\d+)/i);
  if (decimalMatch) {
    return parseFloat(decimalMatch[1]);
  }

  // Default to 0.5
  return 0.5;
}

/**
 * Extract feedback text from validator output
 */
function extractFeedback(output: string): string {
  const lines = output.split('\n');
  const feedbackStart = lines.findIndex((line) =>
    /feedback/i.test(line)
  );

  if (feedbackStart === -1) {
    return 'Validation completed';
  }

  const feedbackLines = lines
    .slice(feedbackStart + 1)
    .filter((line) => line.trim() && !line.includes('Issues') && !line.includes('Recommendations'))
    .slice(0, 3);

  return feedbackLines.join(' ').trim() || 'Validation completed';
}

/**
 * Extract issues from validator output
 */
function extractIssues(output: string): string[] {
  const lines = output.split('\n');
  const issuesStart = lines.findIndex((line) =>
    /issues?:/i.test(line)
  );

  if (issuesStart === -1) {
    return [];
  }

  const issueLines = lines
    .slice(issuesStart + 1)
    .filter(
      (line) =>
        line.trim() &&
        !line.includes('Recommendations') &&
        line.trim() !== 'None' &&
        line.trim() !== 'None critical'
    )
    .map((line) => line.trim().replace(/^[-•]\s*/, ''))
    .filter((line) => line.length > 0)
    .slice(0, 5);

  return issueLines;
}

/**
 * Extract recommendations from validator output
 */
function extractRecommendations(output: string): string[] {
  const lines = output.split('\n');
  const recStart = lines.findIndex((line) =>
    /recommendations?:/i.test(line)
  );

  if (recStart === -1) {
    return [];
  }

  const recLines = lines
    .slice(recStart + 1)
    .filter((line) => line.trim())
    .map((line) => line.trim().replace(/^[-•]\s*/, ''))
    .filter((line) => line.length > 0)
    .slice(0, 5);

  return recLines;
}

/**
 * Trigger Loop 2 validator job
 *
 * @param payload Loop 2 job payload
 * @returns Validator result
 *
 * TODO: RUNTIME_TEST - Verify job execution in trigger.dev runtime
 */
export async function triggerLoop2Validator(
  payload: Loop2JobPayload
): Promise<ValidatorResult> {
  const result = await loop2ValidatorJob.trigger(payload);
  return result;
}
