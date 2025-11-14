#!/usr/bin/env node
/**
 * cfn-redis - Redis coordination helpers
 *
 * Usage:
 *   cfn-redis pattern <name>      Apply coordination pattern
 *   cfn-redis waiting-mode        Manage agent waiting
 *   cfn-redis event               Handle pub/sub events
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

interface RedisOptions {
  taskId?: string;
  agentId?: string;
  action?: string;
  reason?: string;
  iteration?: number;
  context?: string;
}

function parseArgs(args: string[]): { subcommand: string; pattern?: string; options: RedisOptions } {
  const subcommand = args[0] || 'pattern';
  let pattern: string | undefined;
  const options: RedisOptions = {};

  // For pattern subcommand, first arg after subcommand is pattern name
  if (subcommand === 'pattern' && args[1] && !args[1].startsWith('--')) {
    pattern = args[1];
  }

  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--task-id':
        options.taskId = value;
        break;
      case '--agent-id':
        options.agentId = value;
        break;
      case '--action':
        options.action = value;
        break;
      case '--reason':
        options.reason = value;
        break;
      case '--iteration':
        options.iteration = parseInt(value, 10);
        break;
      case '--context':
        options.context = value;
        break;
    }
  }

  return { subcommand, pattern, options };
}

async function executeRedis(subcommand: string, pattern: string | undefined, options: RedisOptions): Promise<void> {
  const skillPath = resolve(process.cwd(), '.claude/skills/redis-coordination');

  switch (subcommand) {
    case 'pattern': {
      if (!pattern) {
        console.error('Error: Pattern name required');
        console.error('Available patterns: simple-chain, hierarchical-broadcast, mesh-hybrid');
        process.exit(1);
      }

      console.log(`[cfn-redis] Applying coordination pattern: ${pattern}`);

      const script = resolve(skillPath, `invoke-${pattern}.sh`);
      const args: string[] = [];

      if (options.taskId) args.push('--task-id', options.taskId);

      const proc = spawn('bash', [script, ...args], { stdio: 'inherit' });

      proc.on('exit', (code) => process.exit(code || 0));
      proc.on('error', (err) => {
        console.error('[cfn-redis] Error:', err.message);
        console.log(`\nScript not found. Available patterns:`);
        console.log('  simple-chain, hierarchical-broadcast, mesh-hybrid');
        process.exit(1);
      });
      break;
    }

    case 'waiting-mode': {
      const action = options.action || 'enter';

      if (!options.taskId || !options.agentId) {
        console.error('Error: --task-id and --agent-id required for waiting-mode');
        process.exit(1);
      }

      console.log(`[cfn-redis] Waiting mode: ${action} for ${options.agentId}`);

      const script = resolve(skillPath, 'invoke-waiting-mode.sh');
      const args = [action, '--task-id', options.taskId, '--agent-id', options.agentId];

      if (options.context) args.push('--context', options.context);
      if (options.reason) args.push('--reason', options.reason);
      if (options.iteration) args.push('--iteration', options.iteration.toString());

      const proc = spawn('bash', [script, ...args], { stdio: 'inherit' });

      proc.on('exit', (code) => process.exit(code || 0));
      proc.on('error', (err) => {
        console.error('[cfn-redis] Error:', err.message);
        process.exit(1);
      });
      break;
    }

    case 'event': {
      console.log('[cfn-redis] Monitoring Redis events...');

      // Subscribe to Redis pub/sub events
      const proc = spawn('redis-cli', ['SUBSCRIBE', 'swarm:events', 'swarm:coordination'], { stdio: 'inherit' });

      proc.on('exit', (code) => process.exit(code || 0));
      proc.on('error', (err) => {
        console.error('[cfn-redis] Redis error:', err.message);
        process.exit(1);
      });
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('Valid subcommands: pattern, waiting-mode, event');
      process.exit(1);
  }
}

function showHelp(): void {
  console.log(`
cfn-redis - Redis Coordination Helpers CLI

Usage:
  cfn-redis pattern <name> [options]        Apply coordination pattern
  cfn-redis waiting-mode [options]          Manage agent waiting
  cfn-redis event                           Monitor pub/sub events

Options (pattern):
  --task-id <id>        Task ID for coordination

Options (waiting-mode):
  --task-id <id>        Task ID (required)
  --agent-id <id>       Agent ID (required)
  --action <action>     Action (enter, wake, report, collect)
  --context <text>      Context description
  --reason <reason>     Wake reason
  --iteration <n>       Iteration number

Examples:
  cfn-redis pattern mesh-hybrid --task-id task-123
  cfn-redis waiting-mode --task-id task-123 --agent-id coder-1 --action enter
  cfn-redis waiting-mode --task-id task-123 --agent-id coder-1 --action wake --reason iteration --iteration 2
  cfn-redis event

Available Patterns:
  simple-chain              Linear agent coordination
  hierarchical-broadcast    Coordinator broadcasts to agents
  mesh-hybrid              Peer-to-peer with coordinator

Waiting Mode Actions:
  enter      Agent enters waiting mode (BLPOP)
  wake       Coordinator wakes agent
  report     Agent reports completion
  collect    Coordinator collects results

For more info: https://docs.claude.com/cfn-redis
  `);
}

async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const { subcommand, pattern, options } = parseArgs(args);
  await executeRedis(subcommand, pattern, options);
}

// Run if called directly
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '');
if (isMainModule) {
  main().catch((err) => {
    console.error('[cfn-redis] Fatal error:', err);
    process.exit(1);
  });
}

export { main };
