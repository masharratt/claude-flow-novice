#!/usr/bin/env node
/**
 * CLI Entry Point - v2.1
 *
 * Handles agent spawning commands with memory management:
 *   npx claude-flow-novice agent <type> [options]
 */

// Load environment variables from .env file
import 'dotenv/config';

// Apply safe memory defaults if not configured
if (!process.env.NODE_OPTIONS) {
  // Set conservative 8GB limit (reduced from default 16GB)
  process.env.NODE_OPTIONS = '--max-old-space-size=8192';
} else if (!process.env.NODE_OPTIONS.includes('max-old-space-size')) {
  // Append memory limit to existing NODE_OPTIONS
  process.env.NODE_OPTIONS += ' --max-old-space-size=8192';
}

// Enable memory profiling in development/debug mode
if (process.env.NODE_ENV === 'development' || process.env.CLAUDE_DEBUG) {
  if (!process.env.NODE_OPTIONS.includes('inspect')) {
    process.env.NODE_OPTIONS += ' --inspect=0.0.0.0:9229';
  }
  if (!process.env.NODE_OPTIONS.includes('heap-prof')) {
    process.env.NODE_OPTIONS += ' --heap-prof';
  }
}

import { VERSION } from '../core/index.js';
import { agentCommand, AgentCommandOptions } from './agent-command.js';

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { command: string; agentType?: string; options: AgentCommandOptions } {
  const command = args[0] || 'help';
  const agentType = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
  const options: AgentCommandOptions = {};

  // Parse options and capture positional context argument
  for (let i = agentType ? 2 : 1; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    // Capture non-flag positional arguments as context (before any flags)
    if (!arg.startsWith('--') && !options.context) {
      options.context = arg;
      continue;
    }

    switch (arg) {
      case '--task-id':
        options.taskId = value;
        i++;
        break;
      case '--iteration':
        options.iteration = parseInt(value, 10);
        i++;
        break;
      case '--agent-id':
        options.agentId = value;
        i++;
        break;
      case '--context':
        options.context = value;
        i++;
        break;
      case '--mode':
        options.mode = value;
        i++;
        break;
      case '--priority':
        options.priority = parseInt(value, 10);
        i++;
        break;
      case '--parent-task-id':
        options.parentTaskId = value;
        i++;
        break;
      case '--list':
        options.list = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--memory-limit':
        options.memoryLimit = parseInt(value, 10);
        i++;
        break;
      case '--enable-profiling':
        options.enableProfiling = true;
        break;
      case '--debug':
        options.debug = true;
        break;
    }
  }

  return { command, agentType, options };
}

/**
 * Display main CLI help
 */
function displayHelp(): void {
  console.log(`
Claude Flow Novice CLI v${VERSION}

Usage:
  npx claude-flow-novice <command> [options]

Commands:
  agent <type> [options]    Spawn an agent for task execution
  --version                 Show version number
  --help                    Show this help message

Examples:
  # Spawn an agent
  npx claude-flow-novice agent coder --context "Implement feature"

  # List available agents
  npx claude-flow-novice agent --list

  # Show version
  npx claude-flow-novice --version

For more information:
  https://github.com/yourusername/claude-flow-novice
`);
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Handle version flag
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`Claude Flow Novice v${VERSION}`);
    return;
  }

  // Handle help flag
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    displayHelp();
    return;
  }

  const { command, agentType, options } = parseArgs(args);

  switch (command) {
    case 'agent':
      await agentCommand(agentType, options);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run with --help for usage information');
      process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error('[claude-flow-novice] Fatal error:', error);
  process.exit(1);
});
