#!/usr/bin/env node
/**
 * Agent Spawning CLI Entry Point
 *
 * Provides command-line interface for spawning agents.
 * Fully backward compatible with bash version.
 *
 * Usage:
 *   spawn-agent-cli <agent-type> --task-id <id> [--iteration N] [--mode mode]
 *   spawn-agent-cli --help
 *   spawn-agent-cli --version
 */

import { AgentSpawner } from './agent-spawner';
import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CLIArgs {
  agentType?: string;
  taskId?: string;
  iteration?: number;
  mode?: 'mvp' | 'standard' | 'enterprise';
  provider?: string;
  model?: string;
  prompt?: string;
  background?: boolean;
  help?: boolean;
  version?: boolean;
  json?: boolean;
  [key: string]: unknown;
}

/**
 * Parse command-line arguments
 */
function parseArgs(args: string[]): CLIArgs {
  const parsed: CLIArgs = {
    background: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help') {
      parsed.help = true;
    } else if (arg === '--version') {
      parsed.version = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--foreground') {
      parsed.background = false;
    } else if (arg === '--background') {
      parsed.background = true;
    } else if (arg === '--task-id' || arg === '-t') {
      parsed.taskId = args[++i];
    } else if (arg === '--iteration' || arg === '-i') {
      parsed.iteration = parseInt(args[++i], 10);
    } else if (arg === '--mode' || arg === '-m') {
      parsed.mode = args[++i] as 'mvp' | 'standard' | 'enterprise';
    } else if (arg === '--provider' || arg === '-p') {
      parsed.provider = args[++i];
    } else if (arg === '--model') {
      parsed.model = args[++i];
    } else if (arg === '--prompt') {
      parsed.prompt = args[++i];
    } else if (!arg.startsWith('-')) {
      if (!parsed.agentType) {
        parsed.agentType = arg;
      }
    }
  }

  return parsed;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Agent Spawning CLI

USAGE:
  spawn-agent-cli <agent-type> [OPTIONS]

ARGUMENTS:
  <agent-type>          Type of agent to spawn (e.g., backend-dev, tester)

OPTIONS:
  -t, --task-id <id>   Task ID for coordination (required for CLI mode)
  -i, --iteration <n>  Iteration number (default: 1)
  -m, --mode <mode>    Mode: mvp, standard, enterprise (default: standard)
  -p, --provider <p>   Provider: zai, anthropic, etc. (default: auto-detect)
      --model <model>  Explicit model name (default: auto-detect)
      --prompt <text>  Task prompt/description to pass to agent
      --foreground     Run in foreground (default: background)
      --background     Run in background (default)
      --json           Output result as JSON
  -h, --help           Show this help message
  -v, --version        Show version information

EXAMPLES:
  # Basic agent spawn
  spawn-agent-cli backend-dev --task-id task-123

  # With explicit iteration
  spawn-agent-cli tester --task-id task-123 --iteration 2

  # With custom provider
  spawn-agent-cli reviewer --task-id task-123 --provider anthropic

  # JSON output for integration
  spawn-agent-cli coder --task-id task-123 --json

ENVIRONMENT VARIABLES:
  TASK_ID               Task ID (can be set instead of --task-id)
  PROJECT_ROOT          Project root directory (default: cwd)
  AGENT_ID              Custom agent ID (default: generated)
`);
}

/**
 * Print version information
 */
function printVersion(): void {
  try {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
    );
    console.log(`spawn-agent-cli v${packageJson.version}`);
  } catch {
    console.log('spawn-agent-cli v1.0.0');
  }
}

/**
 * Phase 1: Mode Prefix Function for CLI/Trigger.dev Collision Mitigation
 *
 * Generates task ID with mode prefix to prevent Redis key collisions between
 * CLI mode and Trigger.dev Docker mode. Both modes share identical Redis coordination
 * patterns and must use isolated namespaces.
 *
 * @param rawTaskId - Original task ID without prefix
 * @param mode - Execution mode: 'cli' for CLI mode, 'trigger' for Trigger.dev
 * @returns Prefixed task ID in format "MODE:rawTaskId"
 *
 * Example:
 *   generateTaskId('task-123', 'cli')     => 'cli:task-123'
 *   generateTaskId('task-123', 'trigger') => 'trigger:task-123'
 *
 * Redis Key Isolation (After):
 *   CLI:     cfn:task:cli:task-123:status
 *   Trigger: cfn:task:trigger:task-123:status
 */
function generateTaskId(rawTaskId: string, mode: 'cli' | 'trigger'): string {
  // Don't add prefix if task ID already has a namespace prefix
  if (/^[a-z]+:/.test(rawTaskId)) {
    return rawTaskId;
  }
  return `${mode}:${rawTaskId}`;
}

/**
 * Validate CLI arguments
 */
function validateArgs(args: CLIArgs): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!args.agentType) {
    errors.push('Agent type is required');
  }

  const taskId = args.taskId || process.env.TASK_ID;
  if (!taskId) {
    errors.push('Task ID is required (--task-id or TASK_ID env var)');
  }

  // Allow optional namespace prefix (e.g., "cli:", "task:") for coordination routing
  if (taskId && !/^([a-z]+:)?[a-zA-Z0-9_.-]{1,64}$/.test(taskId)) {
    errors.push('Invalid task ID format');
  }

  if (args.iteration && (args.iteration < 1 || !Number.isInteger(args.iteration))) {
    errors.push('Iteration must be a positive integer');
  }

  if (args.mode && !['mvp', 'standard', 'enterprise'].includes(args.mode)) {
    errors.push('Mode must be mvp, standard, or enterprise');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Format output based on options
 */
function formatOutput(result: unknown, json: boolean = false): string {
  if (json) {
    return JSON.stringify(result, null, 2);
  }

  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>;
    if (obj.status === 'failed') {
      return `ERROR: ${obj.error || 'Failed to spawn agent'}`;
    }
    return `Agent spawned: ${obj.agentId} (PID: ${obj.pid})`;
  }

  return String(result);
}

/**
 * Main CLI function
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Handle flags
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    printVersion();
    process.exit(0);
  }

  // Validate arguments
  const taskId = args.taskId || process.env.TASK_ID;
  const validation = validateArgs({ ...args, taskId });

  if (!validation.valid) {
    console.error('Argument validation failed:');
    validation.errors.forEach(err => console.error(`  - ${err}`));
    console.error('Use --help for usage information');
    process.exit(1);
  }

  // Create spawner
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const spawner = new AgentSpawner(projectRoot);

  // Build config with CLI mode prefix for Redis key isolation (Phase 1)
  const prefixedTaskId = generateTaskId(taskId!, 'cli');
  const config = {
    agentType: args.agentType!,
    taskId: prefixedTaskId,
    iteration: args.iteration || 1,
    mode: args.mode || 'standard' as const,
    provider: args.provider,
    model: args.model,
    prompt: args.prompt,
    background: args.background !== false,
    env: {
      TASK_ID: prefixedTaskId
    }
  };

  try {
    // Spawn agent
    const result = await spawner.spawnAgent(config);

    // Output result
    console.log(formatOutput(result, args.json));

    // Exit with appropriate code
    process.exit(result.status === 'spawned' ? 0 : 1);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${errorMsg}`);
    process.exit(2);
  }
}

// Run main function
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(2);
});

export { parseArgs, validateArgs, formatOutput, generateTaskId };
