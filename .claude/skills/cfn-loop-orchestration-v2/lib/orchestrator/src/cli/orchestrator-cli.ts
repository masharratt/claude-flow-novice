#!/usr/bin/env node

/**
 * CFN Loop Orchestrator - Direct TypeScript CLI Entry Point
 * Unified command-line interface that eliminates all bash wrappers
 *
 * Version: 1.0.0
 * Purpose: Single source of truth for orchestrator CLI invocation
 *
 * Usage:
 *   ./dist/cli/orchestrator-cli.js --task-id <id> \
 *                                  --mode <mvp|standard|enterprise> \
 *                                  --max-iterations <n> \
 *                                  [--loop3-agents <agents>] \
 *                                  [--loop2-agents <agents>] \
 *                                  [--product-owner <agent>] \
 *                                  [--success-criteria <enabled|disabled>]
 *
 * Exit Codes:
 *   0 = Success
 *   1 = Error (invalid parameters, execution failure)
 *   130 = Interrupted (SIGINT/SIGTERM)
 */

import { Orchestrator, OrchestrationConfig } from '../orchestrate';
import { ExecutionMode } from '../types';
import { Logger } from '../utils/logger';

interface CliArgs {
  taskId?: string;
  mode?: ExecutionMode;
  maxIterations?: number;
  loop3Agents?: string[];
  loop2Agents?: string[];
  productOwner?: string;
  successCriteriaEnabled?: boolean;
  workspace?: string;
  taskDescription?: string;
}

/**
 * Parse command-line arguments from process.argv
 */
function parseArguments(args: string[]): CliArgs {
  const cliArgs: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg || !arg.startsWith('--')) {
      continue;
    }

    const key = arg.substring(2); // Remove '--'
    const nextArg = args[i + 1];

    switch (key) {
      case 'task-id':
        if (nextArg && !nextArg.startsWith('--')) {
          cliArgs.taskId = sanitizeTaskId(nextArg);
          i++; // Skip next argument
        }
        break;

      case 'mode':
        if (nextArg && !nextArg.startsWith('--')) {
          const mode = nextArg.toLowerCase();
          if (['mvp', 'standard', 'enterprise'].includes(mode)) {
            cliArgs.mode = mode as ExecutionMode;
            i++;
          } else {
            throw new Error(`Invalid mode: ${nextArg}. Must be one of: mvp, standard, enterprise`);
          }
        }
        break;

      case 'max-iterations':
        if (nextArg && !nextArg.startsWith('--')) {
          const maxIter = parseInt(nextArg, 10);
          if (isNaN(maxIter)) {
            throw new Error(`Invalid max-iterations: ${nextArg}. Must be a number.`);
          }
          if (maxIter < 1 || maxIter > 100) {
            throw new Error(`Invalid max-iterations: ${maxIter}. Must be between 1 and 100.`);
          }
          cliArgs.maxIterations = maxIter;
          i++;
        }
        break;

      case 'loop3-agents':
        if (nextArg && !nextArg.startsWith('--')) {
          const agents = nextArg.split(',').map((a) => a.trim()).filter((a) => a.length > 0);
          if (agents.length === 0) {
            throw new Error('--loop3-agents must contain at least one agent');
          }
          cliArgs.loop3Agents = agents;
          i++;
        }
        break;

      case 'loop2-agents':
        if (nextArg && !nextArg.startsWith('--')) {
          const agents = nextArg.split(',').map((a) => a.trim()).filter((a) => a.length > 0);
          if (agents.length === 0) {
            throw new Error('--loop2-agents must contain at least one agent');
          }
          cliArgs.loop2Agents = agents;
          i++;
        }
        break;

      case 'product-owner':
        if (nextArg && !nextArg.startsWith('--')) {
          cliArgs.productOwner = sanitizeAgentId(nextArg);
          i++;
        }
        break;

      case 'success-criteria':
        if (nextArg && !nextArg.startsWith('--')) {
          const value = nextArg.toLowerCase();
          if (['enabled', 'true', 'yes', '1'].includes(value)) {
            cliArgs.successCriteriaEnabled = true;
            i++;
          } else if (['disabled', 'false', 'no', '0'].includes(value)) {
            cliArgs.successCriteriaEnabled = false;
            i++;
          } else {
            throw new Error(
              `Invalid success-criteria: ${nextArg}. Must be one of: enabled, disabled, true, false`,
            );
          }
        }
        break;

      case 'workspace':
        if (nextArg && !nextArg.startsWith('--')) {
          cliArgs.workspace = nextArg;
          i++;
        }
        break;

      case 'description':
        if (nextArg && !nextArg.startsWith('--')) {
          cliArgs.taskDescription = nextArg;
          i++;
        }
        break;

      case 'help':
      case 'h':
        printHelp();
        process.exit(0); // eslint-disable-line no-unreachable

      case 'version':
      case 'v':
        printVersion();
        process.exit(0); // eslint-disable-line no-unreachable

      default:
        console.warn(`Warning: Unknown option: --${key}`);
    }
  }

  return cliArgs;
}

/**
 * Sanitize task ID to prevent injection attacks
 */
function sanitizeTaskId(taskId: string): string {
  // Allow alphanumeric, hyphens, underscores, colons (for namespacing)
  const sanitized = taskId.replace(/[^a-zA-Z0-9_:.-]/g, '');
  if (sanitized.length === 0) {
    throw new Error('Task ID contains no valid characters');
  }
  if (sanitized.length > 256) {
    throw new Error('Task ID exceeds maximum length of 256 characters');
  }
  return sanitized;
}

/**
 * Sanitize agent ID to prevent injection attacks
 */
function sanitizeAgentId(agentId: string): string {
  // Allow alphanumeric, hyphens, underscores
  const sanitized = agentId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (sanitized.length === 0) {
    throw new Error('Agent ID contains no valid characters');
  }
  if (sanitized.length > 128) {
    throw new Error('Agent ID exceeds maximum length of 128 characters');
  }
  return sanitized;
}

/**
 * Validate parsed arguments for completeness and consistency
 */
function validateArguments(args: CliArgs): void {
  // Check required parameters
  if (!args.taskId) {
    throw new Error('Missing required parameter: --task-id');
  }

  if (!args.mode) {
    throw new Error('Missing required parameter: --mode');
  }

  if (args.maxIterations === undefined) {
    throw new Error('Missing required parameter: --max-iterations');
  }

  // Validate ranges
  if (args.maxIterations < 1 || args.maxIterations > 100) {
    throw new Error(`max-iterations must be between 1 and 100, got ${args.maxIterations}`);
  }
}

/**
 * Build orchestration configuration from CLI arguments
 */
function buildConfig(args: CliArgs): OrchestrationConfig {
  const config: OrchestrationConfig = {
    taskId: args.taskId!,
    mode: args.mode || 'standard',
    maxIterations: args.maxIterations || 10,
  };

  // Add optional parameters if provided
  if (args.loop3Agents && args.loop3Agents.length > 0) {
    config.loop3Agents = args.loop3Agents;
  }

  if (args.loop2Agents && args.loop2Agents.length > 0) {
    config.loop2Agents = args.loop2Agents;
  }

  if (args.productOwner) {
    config.productOwner = args.productOwner;
  }

  if (args.successCriteriaEnabled !== undefined) {
    config.successCriteriaEnabled = args.successCriteriaEnabled;
  }

  if (args.workspace) {
    config.workspace = args.workspace;
  }

  if (args.taskDescription) {
    config.taskDescription = args.taskDescription;
  }

  return config;
}

/**
 * Print usage information
 */
function printHelp(): void {
  console.log(`
CFN Loop Orchestrator CLI - TypeScript Implementation
Version: 1.0.0

USAGE:
  orchestrator-cli [OPTIONS]

REQUIRED OPTIONS:
  --task-id <id>              Unique task identifier (alphanumeric, hyphens, underscores)
  --mode <mode>               Execution mode: mvp, standard, or enterprise
  --max-iterations <n>        Maximum iteration cycles (1-100)

OPTIONAL OPTIONS:
  --loop3-agents <agents>     Comma-separated agent IDs for Loop 3 (implementation)
  --loop2-agents <agents>     Comma-separated agent IDs for Loop 2 (validation)
  --product-owner <agent>     Agent ID for Product Owner decision
  --success-criteria <flag>   Enable success criteria validation (enabled/disabled)

INFORMATIONAL OPTIONS:
  --help, -h                  Show this help message
  --version, -v               Show version information

EXAMPLES:
  # Basic invocation
  orchestrator-cli --task-id task123 --mode standard --max-iterations 10

  # With agent specifications
  orchestrator-cli \
    --task-id auth-feature \
    --mode standard \
    --max-iterations 5 \
    --loop3-agents backend-dev,coder \
    --loop2-agents code-reviewer,tester \
    --product-owner product-owner

  # With success criteria enabled
  orchestrator-cli \
    --task-id task456 \
    --mode enterprise \
    --max-iterations 15 \
    --success-criteria enabled

EXIT CODES:
  0   = Success (PROCEED decision)
  1   = Failure (error or ABORT decision)
  130 = Interrupted (SIGINT/SIGTERM)
`);
}

/**
 * Print version information
 */
function printVersion(): void {
  console.log('CFN Loop Orchestrator CLI v1.0.0');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const logger = new Logger('orchestrator-cli');

  try {
    // Parse command-line arguments
    const cliArgs = parseArguments(process.argv.slice(2));

    // Validate parsed arguments
    validateArguments(cliArgs);

    // Build configuration
    const config = buildConfig(cliArgs);

    logger.info(`Orchestrator starting with task ID: ${config.taskId}`);
    logger.debug(`Configuration: ${JSON.stringify(config, null, 2)}`);

    // Create and initialize orchestrator
    const orchestrator = new Orchestrator(config);

    // Execute the complete CFN Loop orchestration workflow
    const finalDecision = await orchestrator.execute();

    // Output final summary as JSON
    const summary = orchestrator.getSummary();
    console.log('\n' + '='.repeat(60));
    console.log('ORCHESTRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(JSON.stringify(summary, null, 2));

    // Exit with code based on decision
    // 0 = PROCEED (success)
    // 1 = ITERATE/ABORT (failure)
    const exitCode = finalDecision === 'PROCEED' ? 0 : 1;
    process.exit(exitCode);
  } catch (error) {
    // Handle errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${errorMessage}`);

    // Print usage hint for parameter errors
    if (
      errorMessage.includes('Missing required parameter') ||
      errorMessage.includes('Invalid') ||
      errorMessage.includes('Invalid mode') ||
      errorMessage.includes('Invalid max-iterations')
    ) {
      console.error('\nUse --help for usage information');
    }

    process.exit(1);
  }
}

/**
 * Handle process signals for graceful shutdown
 */
process.on('SIGINT', () => {
  console.error('\nOrchestrator interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.error('\nOrchestrator terminated');
  process.exit(130);
});

// Run main function
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { parseArguments, validateArguments, buildConfig };
