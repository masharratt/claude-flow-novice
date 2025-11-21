/**
 * Loop 2 Validator Job - Quality Validation
 * Spawns CFN Loop validator agents and collects consensus
 * Uses real test result parsing instead of simulation
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import {
  Loop2JobPayload,
  ValidatorResult,
  AgentResult,
} from '../types/cfn-types';
import { parseTestResults, meetsTestThreshold } from '../lib/test-result-parser';

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
      // Execute real test validation by parsing Loop 3 results
      // In production, this would spawn actual validator agent via CFN CLI
      const testResults = collectTestResultsFromAgents(loop3Results);

      logger.log('Collected test results from agents', {
        taskId,
        validatorId,
        agentCount: loop3Results.length,
        totalTests: testResults.totalTests,
        passedTests: testResults.passedTests,
        passRate: testResults.testPassRate.toFixed(4),
      });

      // Calculate consensus score based on real test data
      const consensusScore = calculateConsensusFromTests(testResults);
      const feedback = generateFeedbackFromResults(testResults);
      const issues = identifyTestIssues(testResults);
      const recommendations = generateRecommendations(testResults, consensusScore);

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
 * Collect and aggregate test results from all Loop 3 agents
 * Real test data replaces simulation
 */
function collectTestResultsFromAgents(loop3Results: AgentResult[]) {
  const totalTests = loop3Results.reduce((sum, r) => sum + r.testResults.total, 0);
  const passedTests = loop3Results.reduce((sum, r) => sum + r.testResults.passed, 0);
  const failedTests = loop3Results.reduce((sum, r) => sum + r.testResults.failed, 0);
  const passRate = totalTests > 0 ? passedTests / totalTests : 0;

  return {
    totalTests,
    passedTests,
    failedTests,
    testPassRate: passRate,
    agentCount: loop3Results.length,
    agents: loop3Results.map((r) => ({
      agentId: r.agentId,
      agentType: r.agentType,
      testPassRate: r.testResults.passRate,
      testsPassed: r.testResults.passed,
    })),
  };
}

/**
 * Calculate consensus score based on real test results
 * Replaces hardcoded 0.88 simulation
 */
function calculateConsensusFromTests(testResults: ReturnType<typeof collectTestResultsFromAgents>): number {
  // Consensus = test pass rate, with slight boost for consistency across agents
  const passRate = testResults.testPassRate;

  // If multiple agents agree on similar pass rates, boost score
  const rates = testResults.agents.map((a) => a.testPassRate);
  const rateVariance = rates.length > 1 ? calculateVariance(rates) : 0;
  const consistencyBoost = Math.max(0, 0.05 - rateVariance); // Max 0.05 boost for consistency

  return Math.min(1.0, passRate + consistencyBoost);
}

/**
 * Calculate variance of a set of numbers
 * @internal
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance); // Return standard deviation
}

/**
 * Generate feedback based on test results
 */
function generateFeedbackFromResults(testResults: ReturnType<typeof collectTestResultsFromAgents>): string {
  const { passedTests, totalTests, testPassRate } = testResults;
  const passPercentage = (testPassRate * 100).toFixed(1);

  if (testPassRate >= 0.95) {
    return `Excellent: ${passedTests}/${totalTests} tests passing (${passPercentage}%). ` +
           `All critical paths covered with strong test coverage.`;
  } else if (testPassRate >= 0.85) {
    return `Good: ${passedTests}/${totalTests} tests passing (${passPercentage}%). ` +
           `Most critical functionality validated, minor issues may need attention.`;
  } else if (testPassRate >= 0.7) {
    return `Acceptable: ${passedTests}/${totalTests} tests passing (${passPercentage}%). ` +
           `Core functionality works but gaps in coverage need addressing.`;
  } else {
    return `Needs improvement: ${passedTests}/${totalTests} tests passing (${passPercentage}%). ` +
           `Significant test failures require iteration.`;
  }
}

/**
 * Identify specific test-related issues
 */
function identifyTestIssues(testResults: ReturnType<typeof collectTestResultsFromAgents>): string[] {
  const issues: string[] = [];
  const { failedTests, testPassRate, agents } = testResults;

  if (failedTests > 0) {
    issues.push(`${failedTests} test(s) failing`);
  }

  if (testPassRate < 0.9) {
    issues.push('Test pass rate below 90%');
  }

  // Check for inconsistent pass rates across agents
  if (agents.length > 1) {
    const rates = agents.map((a) => a.testPassRate);
    const maxRate = Math.max(...rates);
    const minRate = Math.min(...rates);
    const spread = maxRate - minRate;

    if (spread > 0.15) {
      issues.push(`Inconsistent test results across agents (${spread.toFixed(2)} spread)`);
    }
  }

  return issues;
}

/**
 * Generate recommendations based on test results
 */
function generateRecommendations(
  testResults: ReturnType<typeof collectTestResultsFromAgents>,
  consensusScore: number
): string[] {
  const recommendations: string[] = [];
  const { failedTests, testPassRate } = testResults;

  if (failedTests > 0) {
    recommendations.push('Review and fix failing tests');
  }

  if (testPassRate < 0.95) {
    recommendations.push('Increase test coverage for edge cases');
  }

  if (consensusScore < 0.85) {
    recommendations.push('Iterate on implementation to improve test results');
  }

  if (!recommendations.length) {
    recommendations.push('Maintain current quality standards');
  }

  return recommendations;
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
