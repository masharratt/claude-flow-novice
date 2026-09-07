#!/usr/bin/env node

/**
 * CLI: Detect Consensus on Vapor
 *
 * Detects when agents claim completion but deliverables are missing.
 *
 * Usage:
 *   detect-vapor --output "agent_output.txt" --deliverables file1.js,file2.js [--json]
 *   detect-vapor --output "Completed the task" --deliverables file1.js,file2.js [--json]
 *
 * Returns JSON with vapor detection result
 */

import * as fs from 'fs';
import { CFNValidator } from '../validator';

interface CLIOptions {
  output?: string;
  outputFile?: string;
  deliverables?: string;
  json?: boolean;
  taskId?: string;
  mode?: 'mvp' | 'standard' | 'enterprise';
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

    if (arg === '--output' && process.argv[i + 1]) {
      options.output = process.argv[++i];
    } else if (arg === '--output-file' && process.argv[i + 1]) {
      options.outputFile = process.argv[++i];
    } else if (arg === '--deliverables' && process.argv[i + 1]) {
      options.deliverables = process.argv[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--task-id' && process.argv[i + 1]) {
      options.taskId = process.argv[++i];
    } else if (arg === '--mode' && process.argv[i + 1]) {
      options.mode = process.argv[++i] as any;
    }
  }

  return options;
}

/**
 * Load output from file
 */
function loadOutputFromFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading output file: ${error}`);
    process.exit(1);
  }
}

/**
 * Print human-readable output
 */
function printHumanOutput(
  result: Awaited<ReturnType<CFNValidator['detectConsensusOnVapor']>>
): void {
  console.log('\nConsensus on Vapor Detection Report:');
  console.log(`  Vapor Detected: ${result.detected ? 'YES' : 'NO'}`);
  console.log(`  Detection Confidence: ${(result.confidence * 100).toFixed(2)}%`);
  console.log(`  Claims Completion: ${result.claimsCompletion ? 'YES' : 'NO'}`);
  console.log(`  Deliverables Missing: ${result.deliverablesMissing ? 'YES' : 'NO'}`);

  if (result.detected) {
    console.log('\n  WARNING: Consensus on Vapor Detected!');
    console.log('  Agent claims completion but deliverables are missing:');
    for (const missing of result.missingDeliverables) {
      console.log(`    - ${missing}`);
    }
  }

  if (result.missingDeliverables.length > 0) {
    console.log(`\n  Missing Deliverables (${result.missingDeliverables.length}):`);
    for (const deliverable of result.missingDeliverables) {
      console.log(`    - ${deliverable}`);
    }
  }

  console.log(`\n  Expected Deliverables (${result.expectedDeliverables.length}):`);
  for (const deliverable of result.expectedDeliverables) {
    console.log(`    - ${deliverable}`);
  }

  console.log(`\n  Status: ${result.detected ? 'VAPOR DETECTED' : 'OK'}`);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const options = parseArgs();

  // Validate input
  if (!options.output && !options.outputFile) {
    console.error('Error: Must provide --output or --output-file');
    console.error('Usage: detect-vapor --output "output text" --deliverables file1.js,file2.js [--json]');
    process.exit(1);
  }

  if (!options.deliverables) {
    console.error('Error: --deliverables is required');
    console.error('Usage: detect-vapor --output "output text" --deliverables file1.js,file2.js [--json]');
    process.exit(1);
  }

  // Load output
  let agentOutput = options.output || '';
  if (options.outputFile) {
    agentOutput = loadOutputFromFile(options.outputFile);
  }

  // Parse deliverables
  const deliverables = options.deliverables
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d);

  if (deliverables.length === 0) {
    console.error('Error: No deliverables provided');
    process.exit(1);
  }

  // Create validator
  const validator = new CFNValidator({
    mode: options.mode || 'standard',
    taskId: options.taskId || 'cli-detect-vapor',
  });

  try {
    // Detect vapor
    const result = await validator.detectConsensusOnVapor(
      agentOutput,
      deliverables
    );

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanOutput(result);
    }

    // Exit with proper code
    process.exit(result.detected ? 1 : 0);
  } catch (error) {
    if (options.json) {
      console.error(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        code: 'DETECTION_ERROR',
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
