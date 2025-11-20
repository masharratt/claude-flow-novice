#!/usr/bin/env node

/**
 * Agent Completion CLI
 *
 * Signal agent completion with confidence score and test metrics
 *
 * Usage:
 *   agent-completion --task-id <id> --agent-id <id> --confidence <score> [options]
 *
 * Required Arguments:
 *   --task-id <id>          Task identifier
 *   --agent-id <id>         Agent identifier
 *   --confidence <score>    Confidence score (0.0-1.0)
 *
 * Optional Arguments:
 *   --iteration <n>         Iteration number (default: 1)
 *   --namespace <ns>        Namespace: swarm | cfn_loop (default: swarm)
 *   --test-pass-rate <pct>  Test pass rate (0.0-1.0)
 *   --tests-run <n>         Total tests run
 *   --tests-passed <n>      Tests passed
 *   --result <json>         Result JSON (test pass rate preferred)
 *   --redis-host <h>        Redis host (default: localhost)
 *   --redis-port <p>        Redis port (default: 6379)
 *   --json                  Output result as JSON
 *   --help                  Show this help message
 *
 * Examples:
 *   # Simple completion with confidence
 *   agent-completion \
 *     --task-id task123 \
 *     --agent-id agent-loop3-1 \
 *     --confidence 0.92
 *
 *   # Completion with test metrics (test-driven)
 *   agent-completion \
 *     --task-id task123 \
 *     --agent-id agent-loop3-1 \
 *     --confidence 0.95 \
 *     --test-pass-rate 0.98 \
 *     --tests-run 50 \
 *     --tests-passed 49
 *
 *   # Validator consensus score
 *   agent-completion \
 *     --task-id task123 \
 *     --agent-id validator-1 \
 *     --confidence 0.88 \
 *     --iteration 1
 */

import { CoordinationWrapper } from '../coordination/coordination-wrapper.js';
import * as process from 'process';

interface Options {
  taskId: string;
  agentId: string;
  confidence: number;
  iteration?: number;
  namespace?: 'swarm' | 'cfn_loop';
  testPassRate?: number;
  testsRun?: number;
  testsPassed?: number;
  result?: string;
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
    iteration: 1,
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
      case '--agent-id':
        options.agentId = args[++i];
        break;
      case '--confidence':
        options.confidence = parseFloat(args[++i]);
        break;
      case '--iteration':
        options.iteration = parseInt(args[++i]);
        break;
      case '--namespace':
        options.namespace = args[++i] as 'swarm' | 'cfn_loop';
        break;
      case '--test-pass-rate':
        options.testPassRate = parseFloat(args[++i]);
        break;
      case '--tests-run':
        options.testsRun = parseInt(args[++i]);
        break;
      case '--tests-passed':
        options.testsPassed = parseInt(args[++i]);
        break;
      case '--result':
        options.result = args[++i];
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
Agent Completion CLI - Signal agent completion with test metrics

Usage:
  agent-completion --task-id <id> --agent-id <id> --confidence <score> [options]

Required Arguments:
  --task-id <id>          Task identifier
  --agent-id <id>         Agent identifier
  --confidence <score>    Confidence score (0.0-1.0)

Optional Arguments:
  --iteration <n>         Iteration number (default: 1)
  --namespace <ns>        Namespace: swarm | cfn_loop (default: swarm)
  --test-pass-rate <pct>  Test pass rate (0.0-1.0, preferred over confidence)
  --tests-run <n>         Total tests run
  --tests-passed <n>      Tests passed
  --result <json>         Result JSON (for custom data)
  --redis-host <h>        Redis host (default: localhost or CFN_REDIS_HOST env)
  --redis-port <p>        Redis port (default: 6379 or CFN_REDIS_PORT env)
  --json                  Output result as JSON
  --help, -h              Show this help message

Examples:
  # Simple completion with confidence
  agent-completion \\
    --task-id task123 \\
    --agent-id agent-loop3-1 \\
    --confidence 0.92

  # Test-driven completion with metrics
  agent-completion \\
    --task-id task123 \\
    --agent-id agent-loop3-1 \\
    --confidence 0.95 \\
    --test-pass-rate 0.98 \\
    --tests-run 50 \\
    --tests-passed 49

  # Validator consensus
  agent-completion \\
    --task-id task123 \\
    --agent-id validator-1 \\
    --confidence 0.88 \\
    --iteration 1 \\
    --json

Environment Variables:
  CFN_REDIS_HOST      Redis host
  CFN_REDIS_PORT      Redis port
  REDIS_HOST          Fallback Redis host
  REDIS_PORT          Fallback Redis port
`);
}

/**
 * Validate confidence score
 */
function validateConfidence(score: number): boolean {
  return typeof score === 'number' && score >= 0 && score <= 1;
}

/**
 * Validate test pass rate
 */
function validateTestPassRate(rate: number): boolean {
  return typeof rate === 'number' && rate >= 0 && rate <= 1;
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
  if (!options.taskId || !options.agentId || options.confidence === undefined) {
    console.error('Error: Missing required arguments');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  // Validate confidence score
  if (!validateConfidence(options.confidence)) {
    console.error('Error: Confidence score must be between 0.0 and 1.0');
    process.exit(1);
  }

  // Validate test pass rate if provided
  if (options.testPassRate !== undefined && !validateTestPassRate(options.testPassRate)) {
    console.error('Error: Test pass rate must be between 0.0 and 1.0');
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

    // Build result object
    let resultObj: Record<string, unknown> | undefined;
    if (options.result) {
      try {
        resultObj = JSON.parse(options.result);
      } catch {
        // If result is not valid JSON, store as string
        resultObj = { result: options.result };
      }
    }

    // Signal completion
    await coordinator.signalCompletion(options.agentId, options.confidence, {
      testPassRate: options.testPassRate,
      testsRun: options.testsRun,
      testsPassed: options.testsPassed,
      result: resultObj,
      iteration: options.iteration
    });

    // Output result
    const output = {
      taskId: options.taskId,
      agentId: options.agentId,
      confidence: options.confidence,
      testPassRate: options.testPassRate,
      testsRun: options.testsRun,
      testsPassed: options.testsPassed,
      iteration: options.iteration,
      timestamp: new Date().toISOString(),
      status: 'success'
    };

    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(`Agent ${options.agentId} completion reported`);
      console.log(`Confidence: ${(options.confidence * 100).toFixed(1)}%`);
      if (options.testPassRate !== undefined) {
        console.log(`Test Pass Rate: ${(options.testPassRate * 100).toFixed(1)}%`);
      }
      if (options.testsRun !== undefined && options.testsPassed !== undefined) {
        console.log(`Tests: ${options.testsPassed}/${options.testsRun}`);
      }
    }

    // Disconnect
    await coordinator.disconnect();

    process.exit(0);
  } catch (error) {
    console.error('Error reporting agent completion:', error);
    if (options.json) {
      console.log(
        JSON.stringify({
          taskId: options.taskId,
          agentId: options.agentId,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }, null, 2)
      );
    }
    process.exit(1);
  }
}

// Run main function
main();
