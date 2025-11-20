#!/usr/bin/env node
/**
 * Parse Decision CLI
 * Entry point for decision parsing via command line
 *
 * Usage:
 *   npx claude-flow-novice parse-decision --input <file|stdin>
 *   echo "Decision: PROCEED" | npx claude-flow-novice parse-decision
 */

import { promises as fs } from 'fs';
import { parseDecision, DecisionParserError, ParsedDecision } from '../cfn-loop/product-owner/decision-parser.js';

/**
 * CLI Configuration
 */
interface CLIOptions {
  input?: string;
  output?: string;
  strict?: boolean;
  taskContext?: string;
  taskId?: string;
  json?: boolean;
  verbose?: boolean;
}

/**
 * Parse CLI arguments
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    json: false,
    verbose: false,
    strict: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--input':
      case '-i':
        if (nextArg && !nextArg.startsWith('--')) {
          options.input = nextArg;
          i++;
        }
        break;

      case '--output':
      case '-o':
        if (nextArg && !nextArg.startsWith('--')) {
          options.output = nextArg;
          i++;
        }
        break;

      case '--task-context':
        if (nextArg && !nextArg.startsWith('--')) {
          options.taskContext = nextArg;
          i++;
        }
        break;

      case '--task-id':
        if (nextArg && !nextArg.startsWith('--')) {
          options.taskId = nextArg;
          i++;
        }
        break;

      case '--json':
        options.json = true;
        break;

      case '--verbose':
      case '-v':
        options.verbose = true;
        break;

      case '--no-strict':
        options.strict = false;
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;

      default:
        if (!arg.startsWith('--')) {
          // Positional argument: treat as input
          if (!options.input) {
            options.input = arg;
          }
        }
        break;
    }
  }

  return options;
}

/**
 * Read input from file or stdin
 */
async function readInput(filePath?: string): Promise<string> {
  if (filePath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file: ${filePath}\n${String(error)}`);
    }
  }

  // Read from stdin
  return new Promise((resolve, reject) => {
    let data = '';
    const stdin = process.stdin;

    stdin.setEncoding('utf-8');

    stdin.on('readable', () => {
      let chunk;
      while ((chunk = stdin.read()) !== null) {
        data += chunk;
      }
    });

    stdin.on('end', () => {
      if (!data) {
        reject(new Error('No input provided (use --input <file> or pipe to stdin)'));
      } else {
        resolve(data);
      }
    });

    stdin.on('error', reject);

    // Set timeout for stdin reading (5 seconds)
    setTimeout(() => {
      if (!data) {
        reject(new Error('Timeout reading from stdin'));
      }
    }, 5000);
  });
}

/**
 * Format output as JSON
 */
function formatJSON(decision: ParsedDecision): string {
  return JSON.stringify(
    {
      success: true,
      decision: decision.decision,
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      deliverables: decision.deliverables,
      validationErrors: decision.validationErrors,
      auditAnalysis: decision.auditAnalysis,
      agentPerformanceObservations: decision.agentPerformanceObservations
    },
    null,
    2
  );
}

/**
 * Format output as human-readable text
 */
function formatText(decision: ParsedDecision, verbose: boolean = false): string {
  const lines: string[] = [];

  lines.push(`Decision: ${decision.decision}`);
  lines.push(`Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
  lines.push(`Reasoning: ${decision.reasoning}`);

  if (decision.deliverables.length > 0) {
    lines.push(`Deliverables: ${decision.deliverables.join(', ')}`);
  }

  if (decision.validationErrors.length > 0) {
    lines.push(`Warnings: ${decision.validationErrors.join('; ')}`);
  }

  if (verbose) {
    lines.push('');
    lines.push('=== Verbose Output ===');

    if (decision.auditAnalysis) {
      lines.push(`Audit Analysis: ${decision.auditAnalysis}`);
    }

    if (decision.agentPerformanceObservations) {
      lines.push(`Agent Performance: ${decision.agentPerformanceObservations}`);
    }

    lines.push(`Full Output Length: ${decision.raw.fullOutput.length} chars`);
  }

  return lines.join('\n');
}

/**
 * Format error output
 */
function formatError(error: Error, options: CLIOptions): string {
  if (options.json) {
    return JSON.stringify(
      {
        success: false,
        error: error.message,
        code: error instanceof DecisionParserError ? error.code : 'UNKNOWN_ERROR',
        details: error instanceof DecisionParserError ? error.details : undefined
      },
      null,
      2
    );
  }

  return `Error: ${error.message}`;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Parse Decision CLI - Extract decision from Product Owner output

Usage:
  npx claude-flow-novice parse-decision [OPTIONS]

Options:
  --input, -i FILE        Read input from file (default: stdin)
  --output, -o FILE       Write output to file (default: stdout)
  --task-context TEXT     Provide task context for vapor validation
  --task-id ID            Task ID for reference
  --json                  Output as JSON (default: text)
  --verbose, -v          Include verbose output
  --no-strict            Non-strict parsing (defaults to ITERATE if no decision)
  --help, -h             Show this help message

Examples:
  # From stdin
  echo "Decision: PROCEED" | npx claude-flow-novice parse-decision

  # From file
  npx claude-flow-novice parse-decision --input output.txt

  # JSON output
  npx claude-flow-novice parse-decision --input output.txt --json

  # With task context (for vapor validation)
  npx claude-flow-novice parse-decision --input output.txt \\
    --task-context "Create TypeScript module" --json

Exit Codes:
  0 - PROCEED decision
  1 - ITERATE decision
  2 - ABORT decision
  3 - Parse error
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.verbose) {
      console.error(`[DEBUG] Options: ${JSON.stringify(options)}`);
    }

    // Read input
    const input = await readInput(options.input);

    if (options.verbose) {
      console.error(`[DEBUG] Input length: ${input.length} chars`);
    }

    // Parse decision
    const decision = await parseDecision(input, {
      strict: options.strict,
      taskContext: options.taskContext,
      taskId: options.taskId,
      validateDeliverables: true
    });

    if (options.verbose) {
      console.error(`[DEBUG] Decision: ${decision.decision}`);
      console.error(`[DEBUG] Confidence: ${decision.confidence}`);
      console.error(`[DEBUG] Validation Errors: ${decision.validationErrors.length}`);
    }

    // Format output
    const output = options.json ? formatJSON(decision) : formatText(decision, options.verbose);

    // Write output
    if (options.output) {
      try {
        await fs.writeFile(options.output, output, 'utf-8');
        if (options.verbose) {
          console.error(`[DEBUG] Output written to: ${options.output}`);
        }
      } catch (error) {
        console.error(`Failed to write output file: ${options.output}`);
        process.exit(3);
      }
    } else {
      console.log(output);
    }

    // Exit with decision-specific code
    const exitCode = decision.decision === 'PROCEED' ? 0 : decision.decision === 'ITERATE' ? 1 : 2;
    process.exit(exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof DecisionParserError ? error.code : 'UNKNOWN_ERROR';

    console.error(formatError(error instanceof Error ? error : new Error(message), { json: false }));

    if (process.argv.includes('--verbose')) {
      console.error(`\nError Code: ${code}`);
      if (error instanceof DecisionParserError && error.details) {
        console.error(`Details: ${JSON.stringify(error.details, null, 2)}`);
      }
    }

    process.exit(3);
  }
}

// Export utilities for testing and CLI use
export { CLIOptions, parseArgs, readInput, formatJSON, formatText, formatError, printHelp, main };
