#!/usr/bin/env node

/**
 * Coordination Signal CLI
 *
 * Broadcasts a coordination signal to waiting agents via Redis
 *
 * Usage:
 *   coordination-signal --task-id <id> --channel <ch> --message <msg> [options]
 *
 * Options:
 *   --task-id <id>      Task identifier
 *   --channel <ch>      Signal channel name
 *   --message <msg>     Signal message (JSON string recommended)
 *   --namespace <ns>    Namespace: swarm | cfn_loop (default: swarm)
 *   --redis-host <h>    Redis host (default: localhost)
 *   --redis-port <p>    Redis port (default: 6379)
 *   --help              Show this help message
 *
 * Examples:
 *   # Signal Loop 2 to start validation
 *   coordination-signal \
 *     --task-id task123 \
 *     --channel loop2:start \
 *     --message '{"phase":"validation"}'
 *
 *   # Signal agent completion
 *   coordination-signal \
 *     --task-id task123 \
 *     --channel agent:completed \
 *     --message '{"agentId":"agent1","confidence":0.92}'
 */

import { CoordinationWrapper } from '../coordination/coordination-wrapper.js';
import * as process from 'process';

interface Options {
  taskId: string;
  channel: string;
  message: string;
  namespace?: 'swarm' | 'cfn_loop';
  redisHost?: string;
  redisPort?: number;
  help?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Partial<Options> = {
    namespace: 'swarm',
    redisHost: process.env.CFN_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.CFN_REDIS_PORT || process.env.REDIS_PORT || '6379')
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--task-id':
        options.taskId = args[++i];
        break;
      case '--channel':
        options.channel = args[++i];
        break;
      case '--message':
        options.message = args[++i];
        break;
      case '--namespace':
        options.namespace = args[++i] as 'swarm' | 'cfn_loop';
        break;
      case '--redis-host':
        options.redisHost = args[++i];
        break;
      case '--redis-port':
        options.redisPort = parseInt(args[++i]);
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options as Options;
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Coordination Signal CLI - Send coordination signals via Redis

Usage:
  coordination-signal --task-id <id> --channel <ch> --message <msg> [options]

Required Arguments:
  --task-id <id>      Task identifier
  --channel <ch>      Signal channel name
  --message <msg>     Signal message (JSON string recommended)

Optional Arguments:
  --namespace <ns>    Namespace: swarm | cfn_loop (default: swarm)
  --redis-host <h>    Redis host (default: localhost or CFN_REDIS_HOST env)
  --redis-port <p>    Redis port (default: 6379 or CFN_REDIS_PORT env)
  --help, -h          Show this help message

Examples:
  # Signal validators to start
  coordination-signal \\
    --task-id task123 \\
    --channel loop2:start \\
    --message '{"phase":"validation"}'

  # Broadcast gate passed signal
  coordination-signal \\
    --task-id task123 \\
    --channel gate-passed \\
    --message 'true'

Environment Variables:
  CFN_REDIS_HOST      Redis host
  CFN_REDIS_PORT      Redis port
  REDIS_HOST          Fallback Redis host
  REDIS_PORT          Fallback Redis port
`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Validate required arguments
  if (!options.taskId || !options.channel || options.message === undefined) {
    console.error('Error: Missing required arguments');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    // Create coordination wrapper
    const coordinator = new CoordinationWrapper({
      taskId: options.taskId,
      namespace: options.namespace || 'swarm',
      redisHost: options.redisHost || 'localhost',
      redisPort: options.redisPort || 6379
    });

    // Connect to Redis
    await coordinator.connect();

    // Broadcast signal
    await coordinator.broadcastSignal(options.channel, options.message);

    console.log(`Signal sent to channel: ${options.channel}`);
    console.log(`Message: ${options.message}`);

    // Disconnect
    await coordinator.disconnect();

    process.exit(0);
  } catch (error) {
    console.error('Error broadcasting signal:', error);
    process.exit(1);
  }
}

// Run main function
main();
