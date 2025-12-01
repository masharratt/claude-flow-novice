/**
 * CFN Test Runner Task for Trigger.dev v4
 *
 * Executes test suites and parses output to determine pass rates.
 * Supports Jest, Mocha, Tap, and TypeScript compiler (tsc --noEmit).
 *
 * Used by CFN Loop as a gate check task to validate implementation quality
 * before proceeding to Loop 2 (validators) and Product Owner decision.
 */

import { task } from "@trigger.dev/sdk/v3";
import { execa } from "execa";
import * as path from "path";

/**
 * Input payload for test runner task
 */
export interface TestRunnerPayload {
  /** Working directory where tests will be executed */
  workDir: string;
  /** Test command to execute (default: "npm test") */
  command?: string;
}

/**
 * Output result from test runner task
 */
export interface TestRunnerResult {
  /** Whether execution was successful (command exited with code 0) */
  success: boolean;
  /** Pass rate from 0.0 to 1.0 (0% to 100%) */
  passRate: number;
  /** Total test count (passed + failed) */
  totalTests: number;
  /** Number of passing tests */
  passedTests: number;
  /** Number of failing tests */
  failedTests: number;
  /** Full raw output from test command */
  output: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Error message if execution failed */
  error?: string;
  /** Test framework detected from output */
  testFramework?: string;
  /** Additional metadata about test run */
  metadata?: {
    suites?: number;
    skipped?: number;
    pending?: number;
  };
}

/**
 * Parse Jest output format
 *
 * Jest outputs test results in format like:
 * "Tests:      45 passed, 2 failed, 47 total"
 * "Test Suites: 8 passed, 1 failed, 9 total"
 */
function parseJestOutput(output: string): { passed: number; failed: number; total: number } {
  const passedMatch = output.match(/(\d+)\s+passed/i);
  const failedMatch = output.match(/(\d+)\s+failed/i);

  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
  const total = passed + failed;

  return { passed, failed, total };
}

/**
 * Parse Mocha output format
 *
 * Mocha outputs test results in format like:
 * "42 passing (1.2s)"
 * "3 failing"
 */
function parseMochaOutput(output: string): { passed: number; failed: number; total: number } {
  const passingMatch = output.match(/(\d+)\s+passing/i);
  const failingMatch = output.match(/(\d+)\s+failing/i);
  const pendingMatch = output.match(/(\d+)\s+pending/i);

  const passed = passingMatch ? parseInt(passingMatch[1], 10) : 0;
  const failed = failingMatch ? parseInt(failingMatch[1], 10) : 0;
  const pending = pendingMatch ? parseInt(pendingMatch[1], 10) : 0;
  const total = passed + failed;

  return { passed, failed, total };
}

/**
 * Parse Tap (Test Anything Protocol) output format
 *
 * Tap outputs test results in format like:
 * "# pass 42"
 * "# fail 3"
 * "1..45" (1 to 45 tests)
 */
function parseTapOutput(output: string): { passed: number; failed: number; total: number } {
  const passMatch = output.match(/^# pass (\d+)/m);
  const failMatch = output.match(/^# fail (\d+)/m);
  const planMatch = output.match(/^1\.\.(\d+)/m);

  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const total = planMatch ? parseInt(planMatch[1], 10) : passed + failed;

  return { passed, failed, total };
}

/**
 * Parse TypeScript compiler output (tsc --noEmit)
 *
 * tsc outputs one error per line like:
 * "src/app.ts(42,10): error TS2339: Property 'x' does not exist on type 'Y'."
 *
 * Returns: passed=0 if errors found, passed=1 if no errors
 * This is treated as a binary test (compile success or failure)
 */
function parseTscOutput(output: string): { passed: number; failed: number; total: number } {
  const errorLines = output
    .split("\n")
    .filter((line) => /error TS\d+:/.test(line));

  const errorCount = errorLines.length;

  // For tsc, treat it as a binary test: success (1 pass) or failure (1 fail)
  const passed = errorCount === 0 ? 1 : 0;
  const failed = errorCount === 0 ? 0 : 1;

  return { passed, failed, total: 1 };
}

/**
 * Detect which test framework is being used based on output patterns
 */
function detectTestFramework(output: string): string {
  if (/Tests:\s+\d+\s+passed/i.test(output) || /Test Suites:/i.test(output)) {
    return "jest";
  }
  if (/passing|failing|pending/i.test(output) && /^\s*\d+\)/m.test(output)) {
    return "mocha";
  }
  if (/^# pass|^# fail/m.test(output) || /^1\.\.\d+/m.test(output)) {
    return "tap";
  }
  if (/error TS\d+:/i.test(output)) {
    return "typescript";
  }
  return "unknown";
}

/**
 * Extract metadata from test output
 */
function extractMetadata(
  output: string,
  framework: string
): { suites?: number; skipped?: number; pending?: number } {
  const metadata: { suites?: number; skipped?: number; pending?: number } = {};

  // Extract test suites (Jest/Mocha)
  const suiteMatch = output.match(/Test Suites?:\s*(\d+)\s+passed/i);
  if (suiteMatch) {
    metadata.suites = parseInt(suiteMatch[1], 10);
  }

  // Extract skipped tests
  const skippedMatch = output.match(/(\d+)\s+skipped/i);
  if (skippedMatch) {
    metadata.skipped = parseInt(skippedMatch[1], 10);
  }

  // Extract pending tests (Mocha)
  const pendingMatch = output.match(/(\d+)\s+pending/i);
  if (pendingMatch) {
    metadata.pending = parseInt(pendingMatch[1], 10);
  }

  return metadata;
}

/**
 * Run test suite and parse results
 *
 * Executes a test command in the specified working directory and parses
 * the output to extract test counts and calculate pass rate.
 */
async function runTestsWithParsing(
  command: string,
  workDir: string
): Promise<{
  rawOutput: string;
  passed: number;
  failed: number;
  total: number;
  framework: string;
  error?: string;
  duration: number;
}> {
  const startTime = Date.now();
  let rawOutput = "";
  let passed = 0;
  let failed = 0;
  let total = 0;
  let error: string | undefined;
  const framework = "unknown";

  try {
    // Parse command into executable and arguments
    const parts = command.trim().split(/\s+/);
    const executable = parts[0];
    const args = parts.slice(1);

    console.log(`Executing test command: ${command}`);
    console.log(`Working directory: ${workDir}`);
    console.log(`---`);

    // Execute command with execa
    const result = await execa(executable, args, {
      cwd: workDir,
      timeout: 300000, // 5 minute timeout
      reject: false, // Don't throw on non-zero exit code
      all: true, // Combine stdout and stderr
    });

    rawOutput = result.all || "";

    console.log(rawOutput);
    console.log(`---`);

    // Detect framework
    const detectedFramework = detectTestFramework(rawOutput);

    // Parse based on detected framework
    let parseResult;
    switch (detectedFramework) {
      case "jest":
        parseResult = parseJestOutput(rawOutput);
        break;
      case "mocha":
        parseResult = parseMochaOutput(rawOutput);
        break;
      case "tap":
        parseResult = parseTapOutput(rawOutput);
        break;
      case "typescript":
        parseResult = parseTscOutput(rawOutput);
        break;
      default:
        // Try all parsers and use the one with highest confidence
        const jest = parseJestOutput(rawOutput);
        const mocha = parseMochaOutput(rawOutput);
        const tap = parseTapOutput(rawOutput);
        const tsc = parseTscOutput(rawOutput);

        // Choose parser with most results
        const results = [
          { framework: "jest", ...jest },
          { framework: "mocha", ...mocha },
          { framework: "tap", ...tap },
          { framework: "typescript", ...tsc },
        ];

        const bestResult = results.reduce((best, current) =>
          current.total > best.total ? current : best
        );

        parseResult = {
          passed: bestResult.passed,
          failed: bestResult.failed,
          total: bestResult.total,
        };
    }

    passed = parseResult.passed;
    failed = parseResult.failed;
    total = parseResult.total;

    // If no tests were detected, treat as failure
    if (total === 0) {
      error = "No tests were found or parsed from output";
      failed = 1;
      total = 1;
    }
  } catch (err) {
    error = String(err);
    failed = 1;
    total = 1;
  }

  const duration = Date.now() - startTime;

  return {
    rawOutput,
    passed,
    failed,
    total,
    framework,
    error,
    duration,
  };
}

/**
 * CFN Test Runner Task
 *
 * Entry point for Trigger.dev task that runs tests and returns structured results
 * for use in CFN Loop gate checks.
 *
 * Success criteria:
 * - Command executes (even if tests fail)
 * - Test count is determined (>0 tests)
 * - Pass rate is calculated
 *
 * The caller (CFN Loop orchestrator) determines if pass rate meets threshold.
 */
export const cfnTestRunnerTask = task({
  id: "cfn-test-runner",
  retry: {
    maxAttempts: 1, // No retries for gate check tasks
  },
  run: async (payload: TestRunnerPayload): Promise<TestRunnerResult> => {
    const command = payload.command || "npm test";
    const workDir = payload.workDir;
    const startTime = Date.now();

    // Validate input
    if (!workDir) {
      return {
        success: false,
        passRate: 0.0,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        output: "",
        duration: Date.now() - startTime,
        error: "workDir is required in payload",
      };
    }

    // Normalize work directory path
    const normalizedWorkDir = path.isAbsolute(workDir) ? workDir : path.resolve(workDir);

    // Run tests
    const testResult = await runTestsWithParsing(command, normalizedWorkDir);

    // Calculate pass rate
    let passRate = 0.0;
    if (testResult.total > 0) {
      passRate = testResult.passed / testResult.total;
    }

    // Detect framework for metadata
    const framework = detectTestFramework(testResult.rawOutput);
    const metadata = extractMetadata(testResult.rawOutput, framework);

    // Determine overall success (execution succeeded, not test success)
    const executionSuccess = !testResult.error && testResult.total > 0;

    const result: TestRunnerResult = {
      success: executionSuccess,
      passRate: Math.round(passRate * 10000) / 10000, // 4 decimal places
      totalTests: testResult.total,
      passedTests: testResult.passed,
      failedTests: testResult.failed,
      output: testResult.rawOutput,
      duration: testResult.duration,
      testFramework: framework,
      metadata,
    };

    if (testResult.error) {
      result.error = testResult.error;
    }

    return result;
  },
});

