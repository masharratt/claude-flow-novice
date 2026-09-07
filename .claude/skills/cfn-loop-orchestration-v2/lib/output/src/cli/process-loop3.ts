#!/usr/bin/env node

/**
 * CLI for processing Loop 3 (Implementer) agent outputs
 *
 * Usage:
 *   npx ts-node src/cli/process-loop3.ts \
 *     --agent-id "coder-1" \
 *     --output "Agent output text..." \
 *     --iteration 1 \
 *     [--files-changed 5] \
 *     [--deliverables "file1.ts,file2.ts"]
 *
 * Output: JSON with Loop3Result
 */

import * as fs from 'fs';
import { parseLoop3Output, formatAsJson } from '../output-processor';

interface Loop3Options {
  agentId: string;
  output: string;
  iteration?: number;
  filesChanged?: number;
  deliverables?: string[];
}

/**
 * Parse command line arguments
 */
function parseArgs(): Loop3Options {
  const args = process.argv.slice(2);
  const options: Partial<Loop3Options> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--agent-id':
        options.agentId = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--output-file':
        // Read output from file if provided
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
      case '--files-changed':
        options.filesChanged = parseInt(args[++i], 10);
        break;
      case '--deliverables':
        options.deliverables = args[++i].split(',');
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

  // Validate required fields
  if (!options.agentId) {
    console.error('Error: --agent-id is required');
    printHelp();
    process.exit(1);
  }

  if (!options.output) {
    console.error('Error: --output or --output-file is required');
    printHelp();
    process.exit(1);
  }

  return options as Loop3Options;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Process Loop 3 Agent Output

Usage:
  npx ts-node src/cli/process-loop3.ts [OPTIONS]

Options:
  --agent-id <id>              Agent identifier (required)
  --output <text>              Agent output text (required)
  --output-file <path>         Alternative: read output from file
  --iteration <n>              Iteration number (default: 1)
  --files-changed <n>          Number of files changed
  --deliverables <file,file>   Comma-separated deliverable files
  --help, -h                   Show this help message

Examples:
  npx ts-node src/cli/process-loop3.ts \\
    --agent-id "coder-1" \\
    --output "Implemented authentication module..." \\
    --files-changed 5

  npx ts-node src/cli/process-loop3.ts \\
    --agent-id "coder-1" \\
    --output-file ./agent-output.txt \\
    --iteration 2
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const options = parseArgs();

    const result = parseLoop3Output(
      options.output,
      options.agentId,
      options.iteration || 1,
      options.filesChanged
        ? {
            before: '',
            after: options.deliverables?.join('\n') || '',
          }
        : undefined
    );

    // Override files changed if provided
    if (options.filesChanged !== undefined) {
      result.filesChanged = options.filesChanged;
    }

    // Output JSON
    console.log(formatAsJson(result));
  } catch (error) {
    console.error(
      'Error processing Loop 3 output:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
