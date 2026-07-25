#!/usr/bin/env node

/**
 * CLI for processing Loop 2 (Validator) agent outputs
 * Supports single validator processing or consensus calculation
 *
 * Usage (single validator):
 *   npx ts-node src/cli/process-loop2.ts \
 *     --validator-id "reviewer-1" \
 *     --output "Validation feedback..." \
 *     --iteration 1
 *
 * Usage (consensus from multiple):
 *   npx ts-node src/cli/process-loop2.ts \
 *     --consensus \
 *     --results-file ./results.json \
 *     --threshold 0.75
 *
 * Output: JSON with Loop2Result or ConsensusResult
 */

import * as fs from 'fs';
import {
  parseLoop2Output,
  calculateConsensus,
  Loop2Result,
  ConsensusResult,
  formatAsJson,
  parseJson,
} from '../output-processor';

interface Loop2Options {
  validatorId?: string;
  output?: string;
  iteration?: number;
  consensus?: boolean;
  resultsFile?: string;
  threshold?: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): Loop2Options {
  const args = process.argv.slice(2);
  const options: Partial<Loop2Options> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--validator-id':
        options.validatorId = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--output-file':
        const filePath = args[++i];
        if (fs.existsSync(filePath)) {
          options.output = fs.readFileSync(filePath, 'utf-8');
        } else {
          throw new Error(`Output file not found: ${filePath}`);
        }
        break;
      case '--iteration':
        options.iteration = parseInt(args[++i], 10);
        break;
      case '--consensus':
        options.consensus = true;
        break;
      case '--results-file':
        options.resultsFile = args[++i];
        break;
      case '--threshold':
        options.threshold = parseFloat(args[++i]);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  return options as Loop2Options;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Process Loop 2 Validator Output

Usage:
  npx ts-node src/cli/process-loop2.ts [OPTIONS]

Single Validator Mode:
  --validator-id <id>          Validator identifier (required)
  --output <text>              Validator output text (required)
  --output-file <path>         Alternative: read output from file
  --iteration <n>              Iteration number (default: 1)

Consensus Mode:
  --consensus                  Calculate consensus from multiple results
  --results-file <path>        File containing JSON array of Loop2Result
  --threshold <n>              Minimum score to pass (default: 0.70)

Other:
  --help, -h                   Show this help message

Examples:
  # Process single validator
  npx ts-node src/cli/process-loop2.ts \\
    --validator-id "reviewer-1" \\
    --output "Validation results: confidence 0.85"

  # Calculate consensus
  npx ts-node src/cli/process-loop2.ts \\
    --consensus \\
    --results-file ./validator-results.json \\
    --threshold 0.75
`);
}

/**
 * Process single validator output
 */
function processSingleValidator(options: Loop2Options): Loop2Result {
  if (!options.validatorId || !options.output) {
    throw new Error(
      'Single validator mode requires --validator-id and --output'
    );
  }

  return parseLoop2Output(
    options.output,
    options.validatorId,
    options.iteration || 1
  );
}

/**
 * Process consensus from multiple validators
 */
function processConsensus(options: Loop2Options): ConsensusResult {
  if (!options.resultsFile) {
    throw new Error('Consensus mode requires --results-file');
  }

  if (!fs.existsSync(options.resultsFile)) {
    throw new Error(`Results file not found: ${options.resultsFile}`);
  }

  const content = fs.readFileSync(options.resultsFile, 'utf-8');
  const results = parseJson<Loop2Result[]>(content);

  if (!Array.isArray(results)) {
    throw new Error('Results file must contain JSON array of Loop2Result');
  }

  return calculateConsensus(results, options.threshold || 0.7);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const options = parseArgs();

    let result: Loop2Result | ConsensusResult;

    if (options.consensus) {
      result = processConsensus(options);
    } else {
      result = processSingleValidator(options);
    }

    // Output JSON
    console.log(formatAsJson(result));
  } catch (error) {
    console.error(
      'Error processing Loop 2 output:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
