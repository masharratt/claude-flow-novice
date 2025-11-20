#!/usr/bin/env node

/**
 * CLI: Validate Gate
 *
 * Checks if test pass rate meets mode-specific thresholds.
 *
 * Usage:
 *   validate-gate --pass-rate 0.95 [--mode standard] [--json]
 *   validate-gate --pass-rate 0.95 --threshold 0.90 [--json]
 *
 * Mode-Specific Thresholds:
 *   mvp:        0.70 (70%)
 *   standard:   0.95 (95%)
 *   enterprise: 0.98 (98%)
 *
 * Returns JSON with gate validation result
 */

import { CFNValidator } from '../validator';

interface CLIOptions {
  passRate?: number;
  threshold?: number;
  mode?: 'mvp' | 'standard' | 'enterprise';
  json?: boolean;
  taskId?: string;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CLIOptions {
  const options: CLIOptions = {
    json: false,
    mode: 'standard',
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--pass-rate' && process.argv[i + 1]) {
      const value = parseFloat(process.argv[++i]);
      if (isNaN(value) || value < 0 || value > 1) {
        console.error('Error: pass-rate must be between 0 and 1');
        process.exit(1);
      }
      options.passRate = value;
    } else if (arg === '--threshold' && process.argv[i + 1]) {
      const value = parseFloat(process.argv[++i]);
      if (isNaN(value) || value < 0 || value > 1) {
        console.error('Error: threshold must be between 0 and 1');
        process.exit(1);
      }
      options.threshold = value;
    } else if (arg === '--mode' && process.argv[i + 1]) {
      const mode = process.argv[++i];
      if (!['mvp', 'standard', 'enterprise'].includes(mode)) {
        console.error(`Error: Invalid mode '${mode}'. Must be mvp, standard, or enterprise`);
        process.exit(1);
      }
      options.mode = mode as any;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--task-id' && process.argv[i + 1]) {
      options.taskId = process.argv[++i];
    }
  }

  return options;
}

/**
 * Print human-readable output
 */
function printHumanOutput(
  result: Awaited<ReturnType<CFNValidator['validateGatePass']>>
): void {
  console.log('\nGate Validation Report:');
  console.log(`  Pass Rate: ${(result.passRate * 100).toFixed(2)}%`);
  console.log(`  Threshold: ${(result.threshold * 100).toFixed(2)}%`);
  console.log(`  Mode: ${result.mode}`);

  if (!result.passed && result.gap !== undefined) {
    console.log(`  Gap: ${(result.gap * 100).toFixed(2)}%`);
  }

  console.log(`  Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`  Reason: ${result.reason}`);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const options = parseArgs();

  // Validate input
  if (typeof options.passRate !== 'number') {
    console.error('Error: --pass-rate is required');
    console.error('Usage: validate-gate --pass-rate 0.95 [--mode standard] [--json]');
    process.exit(1);
  }

  // Create validator
  const validator = new CFNValidator({
    mode: options.mode || 'standard',
    taskId: options.taskId || 'cli-validate-gate',
  });

  try {
    // Validate gate
    const result = await validator.validateGatePass(options.passRate, options.mode);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanOutput(result);
    }

    // Exit with proper code
    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    if (options.json) {
      console.error(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        code: 'VALIDATION_ERROR',
      }));
    } else {
      console.error(`Error: ${error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
