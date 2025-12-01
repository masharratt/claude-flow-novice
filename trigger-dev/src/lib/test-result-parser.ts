/**
 * Test Result Parser
 * Parses real test framework output (Jest, Vitest) to extract test metrics
 * Replaces simulation-based validation with real data parsing
 */

/**
 * Parsed test result metrics
 */
export interface TestParseResult {
  /** Number of passing tests */
  passedTests: number;

  /** Total number of tests executed */
  totalTests: number;

  /** Number of failing tests */
  failedTests: number;

  /** Test pass rate (0.0 to 1.0) */
  testPassRate: number;

  /** Optional coverage percentage if provided */
  coverage?: number;

  /** Optional list of failed test names */
  failedTestNames?: string[];

  /** Test suite information */
  testSuites?: {
    total: number;
    passed: number;
    failed: number;
  };
}

/**
 * Parse Jest/Vitest test framework output to extract metrics
 *
 * Supports formats:
 * - Jest: "Tests: X passed, Y failed, Z total"
 * - Vitest: "Tests: X passed, Y failed, Z total"
 *
 * @param testOutput Raw output from test framework
 * @returns Parsed test metrics
 * @throws Error if output cannot be parsed
 *
 * @example
 * const output = `
 *   Test Suites: 2 passed, 2 total
 *   Tests: 45 passed, 5 failed, 50 total
 * `;
 * const result = parseTestResults(output);
 * // { passedTests: 45, totalTests: 50, failedTests: 5, testPassRate: 0.9 }
 */
export function parseTestResults(testOutput: string): TestParseResult {
  if (!testOutput || typeof testOutput !== 'string') {
    throw new Error('Test output must be a non-empty string');
  }

  // Pattern 1: "Tests: X passed, Y failed, Z total" or "Tests: 0 total" for zero tests
  const testsPattern = /Tests:\s+(?:(\d+)\s+passed(?:.*?(\d+)\s+failed)?(?:,\s+)?)?(\d+)\s+total/i;
  const testsMatch = testOutput.match(testsPattern);

  if (testsMatch) {
    const passedTests = testsMatch[1] ? parseInt(testsMatch[1], 10) : 0;
    const failedTests = testsMatch[2] ? parseInt(testsMatch[2], 10) : 0;
    const totalTests = parseInt(testsMatch[3], 10);

    // Validate consistency
    if (passedTests + failedTests !== totalTests && failedTests > 0) {
      // Some test frameworks don't always include both passed and failed
      // Fall back to calculating failed from total - passed
      const calculatedFailed = totalTests - passedTests;
      return createTestResult(passedTests, totalTests, calculatedFailed, testOutput);
    }

    return createTestResult(passedTests, totalTests, failedTests, testOutput);
  }

  // Pattern 2: "X passed, Y failed, Z total" (simplified)
  const simplePattern = /(\d+)\s+passed(?:.*?(\d+)\s+failed)?,\s+(\d+)\s+total/i;
  const simpleMatch = testOutput.match(simplePattern);

  if (simpleMatch) {
    const passedTests = parseInt(simpleMatch[1], 10);
    const failedTests = simpleMatch[2] ? parseInt(simpleMatch[2], 10) : 0;
    const totalTests = parseInt(simpleMatch[3], 10);

    return createTestResult(passedTests, totalTests, failedTests, testOutput);
  }

  // Pattern 3: "Pass Rate: X%" or "Overall Pass Rate: X%"
  const passRatePattern = /(?:pass\s+rate|overall\s+pass\s+rate):\s*(\d+)\s*%/i;
  const passRateMatch = testOutput.match(passRatePattern);

  if (passRateMatch && testOutput.match(/(\d+)\s+(?:passed|total)/i)) {
    const passRate = parseInt(passRateMatch[1], 10) / 100;
    // Try to extract total tests from output
    const totalMatch = testOutput.match(/(\d+)\s+total/i);
    if (totalMatch) {
      const totalTests = parseInt(totalMatch[1], 10);
      const passedTests = Math.round(totalTests * passRate);
      const failedTests = totalTests - passedTests;
      return createTestResult(passedTests, totalTests, failedTests, testOutput);
    }
  }

  // Could not parse test output with any pattern
  throw new Error(
    'Could not parse test output. Expected format: "Tests: X passed, Y failed, Z total" or similar'
  );
}

/**
 * Create standardized test result object
 * @internal
 */
function createTestResult(
  passedTests: number,
  totalTests: number,
  failedTests: number,
  rawOutput: string
): TestParseResult {
  const testPassRate = totalTests > 0 ? passedTests / totalTests : 0;

  // Extract coverage if present
  const coverageMatch = rawOutput.match(/(?:coverage:|coverage\s+)(\d+)\s*%/i);
  const coverage = coverageMatch ? parseInt(coverageMatch[1], 10) / 100 : undefined;

  // Extract test suite counts if present
  const suitePattern = /Test\s+Suites:\s+(\d+)\s+passed(?:.*?(\d+)\s+total)?/i;
  const suiteMatch = rawOutput.match(suitePattern);
  const testSuites = suiteMatch
    ? {
        passed: parseInt(suiteMatch[1], 10),
        failed: suiteMatch[2]
          ? parseInt(suiteMatch[2], 10) - parseInt(suiteMatch[1], 10)
          : 0,
        total: suiteMatch[2] ? parseInt(suiteMatch[2], 10) : parseInt(suiteMatch[1], 10),
      }
    : undefined;

  return {
    passedTests,
    totalTests,
    failedTests,
    testPassRate: Math.round(testPassRate * 10000) / 10000, // Round to 4 decimals
    coverage,
    testSuites,
  };
}

/**
 * Validate test results meet threshold
 *
 * @param result Parsed test result
 * @param threshold Pass rate threshold (0.0 to 1.0)
 * @returns true if pass rate meets or exceeds threshold
 */
export function meetsTestThreshold(result: TestParseResult, threshold: number): boolean {
  if (threshold < 0 || threshold > 1) {
    throw new Error('Threshold must be between 0.0 and 1.0');
  }
  return result.testPassRate >= threshold;
}

/**
 * Format test result for human-readable output
 */
export function formatTestResult(result: TestParseResult): string {
  const passRatePercent = (result.testPassRate * 100).toFixed(1);
  const coverage = result.coverage
    ? ` | Coverage: ${(result.coverage * 100).toFixed(1)}%`
    : '';

  return (
    `Tests: ${result.passedTests}/${result.totalTests} passing ` +
    `(${passRatePercent}%)${coverage}`
  );
}

/**
 * Calculate improvement between two test results
 */
export function calculateTestImprovement(
  previous: TestParseResult,
  current: TestParseResult
): {
  passRateChange: number;
  testsImproved: number;
} {
  return {
    passRateChange: current.testPassRate - previous.testPassRate,
    testsImproved: current.passedTests - previous.passedTests,
  };
}
