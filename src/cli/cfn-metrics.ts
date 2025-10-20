#!/usr/bin/env node
/**
 * cfn-metrics - Monitoring and analytics
 *
 * Usage:
 *   cfn-metrics agent       Show agent metrics
 *   cfn-metrics consensus   Show consensus scores
 *   cfn-metrics fleet       Show fleet status
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

interface MetricsOptions {
  agentId?: string;
  taskId?: string;
  period?: string;
  format?: string;
}

function parseArgs(args: string[]): { subcommand: string; options: MetricsOptions } {
  const subcommand = args[0] || 'fleet';
  const options: MetricsOptions = {};

  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--agent-id':
        options.agentId = value;
        break;
      case '--task-id':
        options.taskId = value;
        break;
      case '--period':
        options.period = value;
        break;
      case '--format':
        options.format = value;
        break;
    }
  }

  return { subcommand, options };
}

async function executeMetrics(subcommand: string, options: MetricsOptions): Promise<void> {
  const portalPath = resolve(process.cwd(), '.claude/skills/web-portal');

  switch (subcommand) {
    case 'agent': {
      console.log('[cfn-metrics] Fetching agent metrics...');

      const script = resolve(portalPath, 'invoke-portal-metrics.sh');
      const args: string[] = [];

      if (options.agentId) {
        args.push('--agent-id', options.agentId);
      }
      if (options.period) {
        args.push('--period', options.period);
      }

      const proc = spawn('bash', [script, ...args], { stdio: 'inherit' });

      proc.on('exit', (code) => process.exit(code || 0));
      proc.on('error', (err) => {
        console.error('[cfn-metrics] Error:', err.message);
        console.log('\nFallback: Use web portal for metrics:');
        console.log('  http://localhost:3000/metrics');
        process.exit(1);
      });
      break;
    }

    case 'consensus': {
      console.log('[cfn-metrics] Fetching consensus scores...');

      if (!options.taskId) {
        console.error('Error: --task-id required for consensus metrics');
        process.exit(1);
      }

      // Query Redis for consensus data
      const redisKey = `swarm:${options.taskId}:consensus:*`;
      const proc = spawn('redis-cli', ['--scan', '--pattern', redisKey], { stdio: 'inherit' });

      proc.on('exit', (code) => {
        if (code === 0) {
          console.log('\nTo see consensus values, run:');
          console.log(`  redis-cli get swarm:${options.taskId}:consensus:loop2`);
        }
        process.exit(code || 0);
      });

      proc.on('error', (err) => {
        console.error('[cfn-metrics] Redis error:', err.message);
        process.exit(1);
      });
      break;
    }

    case 'fleet': {
      console.log('[cfn-metrics] Fetching fleet status...');

      const script = resolve(portalPath, 'invoke-portal-agents.sh');
      const proc = spawn('bash', [script, '--status', 'all'], { stdio: 'inherit' });

      proc.on('exit', (code) => process.exit(code || 0));
      proc.on('error', (err) => {
        console.error('[cfn-metrics] Error:', err.message);
        process.exit(1);
      });
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('Valid subcommands: agent, consensus, fleet');
      process.exit(1);
  }
}

function showHelp(): void {
  console.log(`
cfn-metrics - Monitoring and Analytics CLI

Usage:
  cfn-metrics agent [options]       Show agent performance metrics
  cfn-metrics consensus [options]   Show consensus scores
  cfn-metrics fleet                 Show fleet status

Options (agent):
  --agent-id <id>       Specific agent metrics
  --period <time>       Time period (1h, 24h, 7d)
  --format <type>       Output format (json, table)

Options (consensus):
  --task-id <id>        Task to show consensus for (required)

Examples:
  cfn-metrics agent --agent-id coder-1 --period 1h
  cfn-metrics consensus --task-id task-123
  cfn-metrics fleet

Metrics Available:
  - Agent execution time
  - Confidence scores over time
  - Tool usage statistics
  - Consensus validation results
  - Fleet health and availability

Integration: Metrics also available via web portal at http://localhost:3000/metrics

For more info: https://docs.claude.com/cfn-metrics
  `);
}

async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const { subcommand, options } = parseArgs(args);
  await executeMetrics(subcommand, options);
}

// Run if called directly
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '');
if (isMainModule) {
  main().catch((err) => {
    console.error('[cfn-metrics] Fatal error:', err);
    process.exit(1);
  });
}

export { main };
