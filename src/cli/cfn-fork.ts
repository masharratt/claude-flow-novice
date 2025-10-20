#!/usr/bin/env node
/**
 * CLI utility for managing conversation forks
 *
 * Usage:
 *   npx cfn-fork create --task-id <id> --agent-id <id> --iteration <n>
 *   npx cfn-fork get --task-id <id> --agent-id <id>
 *   npx cfn-fork list --task-id <id> --agent-id <id>
 *   npx cfn-fork delete --task-id <id> --agent-id <id> --fork-id <id>
 *   npx cfn-fork stats --task-id <id> --agent-id <id> [--fork-id <id>]
 */

import {
  createFork,
  getCurrentFork,
  listForks,
  deleteFork,
  getConversationStats,
  getForkMetadata
} from './conversation-fork.js';

interface CLIArgs {
  command: string;
  taskId?: string;
  agentId?: string;
  iteration?: number;
  forkId?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {
    command: args[0] || 'help'
  };

  for (let i = 1; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    switch (key) {
      case 'task-id':
        result.taskId = value;
        break;
      case 'agent-id':
        result.agentId = value;
        break;
      case 'iteration':
        result.iteration = parseInt(value, 10);
        break;
      case 'fork-id':
        result.forkId = value;
        break;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  try {
    switch (args.command) {
      case 'create': {
        if (!args.taskId || !args.agentId || !args.iteration) {
          console.error('Error: --task-id, --agent-id, and --iteration are required');
          process.exit(1);
        }

        const forkId = await createFork(args.taskId, args.agentId, args.iteration);
        console.log(forkId); // Output just the fork ID for easy capture in bash
        break;
      }

      case 'get': {
        if (!args.taskId || !args.agentId) {
          console.error('Error: --task-id and --agent-id are required');
          process.exit(1);
        }

        const forkId = await getCurrentFork(args.taskId, args.agentId);
        if (forkId) {
          console.log(forkId);
        } else {
          console.log('(no fork)');
        }
        break;
      }

      case 'list': {
        if (!args.taskId || !args.agentId) {
          console.error('Error: --task-id and --agent-id are required');
          process.exit(1);
        }

        const forks = await listForks(args.taskId, args.agentId);
        if (forks.length === 0) {
          console.log('No forks found');
        } else {
          console.log(JSON.stringify(forks, null, 2));
        }
        break;
      }

      case 'delete': {
        if (!args.taskId || !args.agentId || !args.forkId) {
          console.error('Error: --task-id, --agent-id, and --fork-id are required');
          process.exit(1);
        }

        await deleteFork(args.taskId, args.agentId, args.forkId);
        console.log(`Fork ${args.forkId} deleted`);
        break;
      }

      case 'stats': {
        if (!args.taskId || !args.agentId) {
          console.error('Error: --task-id and --agent-id are required');
          process.exit(1);
        }

        const stats = await getConversationStats(args.taskId, args.agentId, args.forkId);
        console.log(JSON.stringify(stats, null, 2));
        break;
      }

      case 'meta': {
        if (!args.taskId || !args.agentId || !args.forkId) {
          console.error('Error: --task-id, --agent-id, and --fork-id are required');
          process.exit(1);
        }

        const metadata = await getForkMetadata(args.taskId, args.agentId, args.forkId);
        if (metadata) {
          console.log(JSON.stringify(metadata, null, 2));
        } else {
          console.log('Fork not found');
          process.exit(1);
        }
        break;
      }

      case 'help':
      default:
        console.log(`
CFN Fork - Conversation Fork Management

Usage:
  npx cfn-fork <command> [options]

Commands:
  create     Create a new fork from current conversation state
  get        Get current active fork ID
  list       List all forks for an agent
  delete     Delete a specific fork
  stats      Get conversation statistics
  meta       Get fork metadata
  help       Show this help message

Options:
  --task-id <id>       Task ID (required for all commands)
  --agent-id <id>      Agent ID (required for all commands)
  --iteration <n>      Iteration number (required for create)
  --fork-id <id>       Fork ID (required for delete and meta)

Examples:
  # Create a fork after iteration 1
  npx cfn-fork create --task-id epic-123 --agent-id coder-1 --iteration 1

  # Get current fork
  npx cfn-fork get --task-id epic-123 --agent-id coder-1

  # List all forks
  npx cfn-fork list --task-id epic-123 --agent-id coder-1

  # Get conversation stats
  npx cfn-fork stats --task-id epic-123 --agent-id coder-1
        `);
        break;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
