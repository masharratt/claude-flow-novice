/**
 * Test Results Parser - TypeScript Implementation
 * Parses test output from multiple testing frameworks
 */

export type TestFramework = 'jest' | 'mocha' | 'pytest' | 'tap' | 'go' | 'junit' | 'unknown';

export interface TestResults {
  framework: TestFramework;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  durationMs: number;
  failedTestNames: string[];
  raw: string;
}

/**
 * Parse Jest test output
 */
function parseJestOutput(output: string): TestResults {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let duration = 0;
  const failedNames: string[] = [];

  // Extract test counts from "Tests:" line
  const testsLine = output.match(/^\s*Tests:.*$/m)?.[0] || '';

  if (testsLine) {
    const passedMatch = testsLine.match(/(\d+)\s+passed/);
    const failedMatch = testsLine.match(/(\d+)\s+failed/);
    const skippedMatch = testsLine.match(/(\d+)\s+skipped/);
    const totalMatch = testsLine.match(/(\d+)\s+total/);

    if (passedMatch?.[1]) passed = parseInt(passedMatch[1], 10);
    if (failedMatch?.[1]) failed = parseInt(failedMatch[1], 10);
    if (skippedMatch?.[1]) skipped = parseInt(skippedMatch[1], 10);
    if (totalMatch?.[1]) total = parseInt(totalMatch[1], 10);
  }

  // Extract duration from "Time:" line
  const timeMatch = output.match(/Time:\s+([0-9.]+)\s*s/);
  if (timeMatch?.[1]) {
    duration = Math.round(parseFloat(timeMatch[1]) * 1000);
  }

  // Extract failed test names
  const failedNameMatches = output.matchAll(/●\s+(.+)/g);
  for (const match of failedNameMatches) {
    if (match[1]) failedNames.push(match[1].trim());
  }

  const passRate = total > 0 ? passed / total : 0.0;

  return {
    framework: 'jest',
    total,
    passed,
    failed,
    skipped,
    passRate: parseFloat(passRate.toFixed(4)),
    durationMs: duration,
    failedTestNames: failedNames,
    raw: output,
  };
}

/**
 * Parse Mocha test output
 */
function parseMochaOutput(output: string): TestResults {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let duration = 0;
  const failedNames: string[] = [];

  // Extract test counts
  const passedMatch = output.match(/(\d+)\s+passing/);
  const failedMatch = output.match(/(\d+)\s+failing/);
  const pendingMatch = output.match(/(\d+)\s+pending/);

  if (passedMatch?.[1]) passed = parseInt(passedMatch[1], 10);
  if (failedMatch?.[1]) failed = parseInt(failedMatch[1], 10);
  if (pendingMatch?.[1]) skipped = parseInt(pendingMatch[1], 10);

  total = passed + failed + skipped;

  // Extract duration - can be in ms or s
  const durationMsMatch = output.match(/passing\s*\((\d+)ms\)/);
  const durationSMatch = output.match(/passing\s*\(([0-9.]+)s\)/);

  if (durationMsMatch?.[1]) {
    duration = parseInt(durationMsMatch[1], 10);
  } else if (durationSMatch?.[1]) {
    duration = Math.round(parseFloat(durationSMatch[1]) * 1000);
  }

  // Extract failed test names
  const failedNameMatches = output.matchAll(/^\s*\d+\)\s*(.+):/gm);
  for (const match of failedNameMatches) {
    if (match[1]) failedNames.push(match[1].trim());
  }

  const passRate = total > 0 ? passed / total : 0.0;

  return {
    framework: 'mocha',
    total,
    passed,
    failed,
    skipped,
    passRate: parseFloat(passRate.toFixed(4)),
    durationMs: duration,
    failedTestNames: failedNames,
    raw: output,
  };
}

/**
 * Parse Pytest test output
 */
function parsePytestOutput(output: string): TestResults {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let duration = 0;
  const failedNames: string[] = [];

  // Extract test counts
  const passedMatch = output.match(/(\d+)\s+passed/);
  const failedMatch = output.match(/(\d+)\s+failed/);
  const skippedMatch = output.match(/(\d+)\s+skipped/);

  if (passedMatch?.[1]) passed = parseInt(passedMatch[1], 10);
  if (failedMatch?.[1]) failed = parseInt(failedMatch[1], 10);
  if (skippedMatch?.[1]) skipped = parseInt(skippedMatch[1], 10);

  total = passed + failed + skipped;

  // Extract duration
  const durationMatch = output.match(/in\s+([0-9.]+)s/);
  if (durationMatch?.[1]) {
    duration = Math.round(parseFloat(durationMatch[1]) * 1000);
  }

  // Extract failed test names
  const failedNameMatches = output.matchAll(/^\s*FAILED\s+([^\s]+)/gm);
  for (const match of failedNameMatches) {
    if (match[1]) failedNames.push(match[1].trim());
  }

  const passRate = total > 0 ? passed / total : 0.0;

  return {
    framework: 'pytest',
    total,
    passed,
    failed,
    skipped,
    passRate: parseFloat(passRate.toFixed(4)),
    durationMs: duration,
    failedTestNames: failedNames,
    raw: output,
  };
}

/**
 * Parse TAP test output
 */
function parseTapOutput(output: string): TestResults {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failedNames: string[] = [];

  // Extract total from plan line (e.g., "1..10")
  const planMatch = output.match(/^\s*1\.\.(\d+)/m);
  if (planMatch?.[1]) {
    total = parseInt(planMatch[1], 10);
  }

  // Count ok lines (excluding SKIP)
  const okMatches = output.matchAll(/^\s*ok\s+\d+/gm);
  let okCount = 0;
  for (const _ of okMatches) {
    okCount++;
  }

  // Count skipped tests
  const skipMatches = output.matchAll(/^\s*ok\s+\d+.*#\s*SKIP/gm);
  for (const _ of skipMatches) {
    skipped++;
  }

  passed = okCount - skipped;

  // Count not ok lines
  const notOkMatches = output.matchAll(/^\s*not ok\s+\d+\s+(.+)/gm);
  for (const match of notOkMatches) {
    failed++;
    if (match[1]) failedNames.push(match[1].trim());
  }

  const passRate = total > 0 ? passed / total : 0.0;

  return {
    framework: 'tap',
    total,
    passed,
    failed,
    skipped,
    passRate: parseFloat(passRate.toFixed(4)),
    durationMs: 0,
    failedTestNames: failedNames,
    raw: output,
  };
}

/**
 * Parse Go test output
 */
function parseGoTestOutput(output: string): TestResults {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let duration = 0;
  const failedNames: string[] = [];

  // Count PASS lines
  const passMatches = output.matchAll(/^\s*---\s+PASS:\s+(.+)/gm);
  for (const _ of passMatches) {
    passed++;
  }

  // Count FAIL lines
  const failMatches = output.matchAll(/^\s*---\s+FAIL:\s+(.+)/gm);
  for (const match of failMatches) {
    failed++;
    if (match[1]) failedNames.push(match[1].trim());
  }

  // Count SKIP lines
  const skipMatches = output.matchAll(/^\s*---\s+SKIP:/gm);
  for (const _ of skipMatches) {
    skipped++;
  }

  total = passed + failed + skipped;

  // Extract duration
  const durationMatch = output.match(/ok\s+[^\s]+\s+([0-9.]+)s/);
  if (durationMatch?.[1]) {
    duration = Math.round(parseFloat(durationMatch[1]) * 1000);
  }

  const passRate = total > 0 ? passed / total : 0.0;

  return {
    framework: 'go',
    total,
    passed,
    failed,
    skipped,
    passRate: parseFloat(passRate.toFixed(4)),
    durationMs: duration,
    failedTestNames: failedNames,
    raw: output,
  };
}

/**
 * Auto-detect testing framework from output
 */
function autoDetectFramework(output: string): TestFramework {
  // Jest
  if (output.match(/Test Suites:/i) || output.match(/PASS\s+.*\.test\.(js|ts)/)) {
    return 'jest';
  }

  // Mocha
  if (output.match(/\d+\s+passing/) && output.match(/\d+\s+failing/)) {
    return 'mocha';
  }

  // Pytest
  if (output.match(/====.*passed.*====/) || output.match(/FAILED.*\.py::/)) {
    return 'pytest';
  }

  // TAP
  if (output.match(/1\.\.\d+/) || output.match(/^ok\s+\d+/m) || output.match(/^not ok\s+\d+/m)) {
    return 'tap';
  }

  // Go
  if (output.match(/---\s+PASS:/) || output.match(/---\s+FAIL:/)) {
    return 'go';
  }

  return 'unknown';
}

/**
 * Main entry point - parse test results from any framework
 */
export function parseTestResults(framework: string, output: string): TestResults {
  let detectedFramework: TestFramework = framework as TestFramework;

  // Auto-detect if requested
  if (framework === 'auto') {
    detectedFramework = autoDetectFramework(output);
  }

  // Parse based on framework
  switch (detectedFramework) {
    case 'jest':
      return parseJestOutput(output);
    case 'mocha':
      return parseMochaOutput(output);
    case 'pytest':
      return parsePytestOutput(output);
    case 'tap':
      return parseTapOutput(output);
    case 'go':
      return parseGoTestOutput(output);
    default:
      return {
        framework: 'unknown',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        passRate: 0.0,
        durationMs: 0,
        failedTestNames: [],
        raw: output,
      };
  }
}

/**
 * CLI entry point for bash wrapper
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: parse-test-results.js <framework|auto> <output_file_or_string>');
    process.exit(1);
  }

  const framework = args[0];
  const input = args[1];

  if (!framework || !input) {
    console.error('Error: framework and input are required');
    process.exit(1);
  }

  const result = parseTestResults(framework, input);
  console.log(JSON.stringify(result, null, 2));
}
