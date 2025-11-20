#!/usr/bin/env node

/**
 * Coordination Wait CLI
 *
 * Blocks and waits for a coordination signal from another agent
 *
 * Usage:
 *   coordination-wait --task-id <id> --channel <ch> [options]
 *
 * Options:
 *   --task-id <id>      Task identifier
 *   --channel <ch>      Signal channel name to wait on
 *   --timeout <sec>     Timeout in seconds (default: 120)
 *   --namespace <ns>    Namespace: swarm | cfn_loop (default: swarm)
 *   --redis-host <h>    Redis host (default: localhost)
 *   --redis-port <p>    Redis port (default: 6379)
 *   --json              Output result as JSON
 *   --help              Show this help message
 *
 * Exit Codes:
 *   0                   Signal received successfully
 *   1                   Timeout or error
 *
 * Examples:
 *   # Wait for gate-passed signal (120s timeout)
 *   coordination-wait \
 *     --task-id task123 \
 *     --channel gate-passed
 *
 *   # Wait for validator start signal with 30s timeout
 *   coordination-wait \
 *     --task-id task123 \
 *     --channel loop2:start \
 *     --timeout 30
 *
 *   # Get JSON output
 *   coordination-wait \
 *     --task-id task123 \
 *     --channel signal \
 *     --json
 */

import { CoordinationWrapper } from '../coordination/coordination-wrapper.js';
import * as process from 'process';

interface Options {
  taskId: string;
  channel: string;
  timeout?: number;
  namespace?: 'swarm' | 'cfn_loop';
  redisHost?: string;
  redisPort?: number;
  json?: boolean;
  help?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Partial<Options> = {
    namespace: 'swarm',
    timeout: 120,
    redisHost: process.env.CFN_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.CFN_REDIS_PORT || process.env.REDIS_PORT || '6379'),
    json: false
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
      case '--timeout':
        options.timeout = parseInt(args[++i]);
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
      case '--json':
        options.json = true;
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
Coordination Wait CLI - Wait for coordination signals via Redis

Usage:
  coordination-wait --task-id <id> --channel <ch> [options]

Required Arguments:
  --task-id <id>      Task identifier
  --channel <ch>      Signal channel name to wait on

Optional Arguments:
  --timeout <sec>     Timeout in seconds (default: 120)
  --namespace <ns>    Namespace: swarm | cfn_loop (default: swarm)
  --redis-host <h>    Redis host (default: localhost or CFN_REDIS_HOST env)
  --redis-port <p>    Redis port (default: 6379 or CFN_REDIS_PORT env)
  --json              Output result as JSON
  --help, -h          Show this help message

Exit Codes:
  0                   Signal received successfully
  1                   Timeout or error occurred

Examples:
  # Wait for gate-passed signal (120s timeout)
  coordination-wait \\
    --task-id task123 \\
    --channel gate-passed

  # Wait with custom timeout
  coordination-wait \\
    --task-id task123 \\
    --channel loop2:start \\
    --timeout 30

  # Get JSON output
  coordination-wait \\
    --task-id task123 \\
    --channel signal \\
    --json

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
  if (!options.taskId || !options.channel) {
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
      redisPort: options.redisPort || 6379,
      defaultTimeout: (options.timeout || 120) * 1000
    });

    // Connect to Redis
    await coordinator.connect();

    // Wait for signal
    const result = await coordinator.waitForSignal(
      options.channel,
      (options.timeout || 120) * 1000
    );

    // Output result
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.received) {
        console.log(`Signal received on channel: ${options.channel}`);
        if (result.message) {
          console.log(`Message: ${result.message}`);
        }
        if (result.timestamp) {
          console.log(`Received at: ${result.timestamp}`);
        }
      } else if (result.timeout) {
        console.error(`Timeout waiting for signal on channel: ${options.channel}`);
      } else {
        console.error('Error waiting for signal');
      }
    }

    // Disconnect
    await coordinator.disconnect();

    // Exit with appropriate code
    process.exit(result.received ? 0 : 1);
  } catch (error) {
    console.error('Error waiting for signal:', error);
    if (options.json) {
      console.log(
        JSON.stringify({
          received: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timeout: false
        }, null, 2)
      );
    }
    process.exit(1);
  }
}

// Run main function
main();
