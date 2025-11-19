/**
 * Gate checker implementation
 * Validates test results against mode-specific thresholds
 */

import { GateResult, TestResult, getModeConfig, ExecutionMode, calculatePassRate } from '../types';

/**
 * Gate checker class - placeholder for migration
 */
export class GateChecker {
  /**
   * Check if test results pass the gate threshold
   */
  static checkGate(
    testResults: Map<string, TestResult>,
    mode: ExecutionMode
  ): GateResult {
    const config = getModeConfig(mode);
    const passRates: number[] = [];

    testResults.forEach((result: TestResult): void => {
      passRates.push(calculatePassRate(result));
    });

    const averagePassRate =
      passRates.length === 0 ? 0 : passRates.reduce((a, b) => a + b, 0) / passRates.length;

    return {
      passed: averagePassRate >= config.testPassRateGate,
      passRate: averagePassRate,
      threshold: config.testPassRateGate,
      testResults,
    };
  }
}
