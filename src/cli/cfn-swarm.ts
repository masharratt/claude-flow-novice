#!/usr/bin/env node
/**
 * cfn-swarm - Swarm coordination operations
 *
 * Usage:
 *   cfn-swarm init <topology>       Initialize swarm
 *   cfn-swarm status                Show swarm state
 *   cfn-swarm shutdown              Terminate swarm gracefully
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

interface SwarmOptions {
  topology?: string;
  maxAgents?: number;
  strategy?: string;
  taskId?: string;
}

function parseArgs(args: string[]): { subcommand: string; options: SwarmOptions } {
  const subcommand = args[0] || 'status';
  const options: SwarmOptions = {};

  // For init, first positional arg after subcommand is topology
  if (subcommand === 'init' && args[1] && !args[1].startsWith('--')) {
    options.topology = args[1];
  }

  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--topology':
        options.topology = value;
        break;
      case '--max-agents':
        options.maxAgents = parseInt(value, 10);
        break;
      case '--strategy':
        options.strategy = value;
        break;
      case '--task-id':
        options.taskId = value;
        break;
    }
  }

  return { subcommand, options };
}

async function executeSwarm(subcommand: string, options: SwarmOptions): Promise<void> {
  const skillPath = resolve(process.cwd(), '.claude/skills/redis-coordination');

  switch (subcommand) {
    case 'init': {
      const topology = options.topology || 'mesh';
      const maxAgents = options.maxAgents || 5;
      const strategy = options.strategy || 'balanced';

      console.log(`[cfn-swarm] Initializing swarm:`);
      console.log(`  Topology: ${topology}`);
      console.log(`  Max Agents: ${maxAgents}`);
      console.log(`  Strategy: ${strategy}`);

      // Note: Actual swarm init would use MCP or internal APIs
      console.log('\nTo initialize swarm in Claude Code, use:');
      console.log(`  mcp__claude-flow-novice__swarm_init({`);
      console.log(`    topology: "${topology}",`);
      console.log(`    maxAgents: ${maxAgents},`);
      console.log(`    strategy: "${strategy}"`);
      console.log(`  })`);
      break;
    }

    case 'status': {
      console.log('[cfn-swarm] Checking swarm status...');

      // Execute Redis-based status check
      const script = resolve(skillPath, 'invoke-swarm-status.sh');
      const proc = spawn('bash', [script], { stdio: 'inherit' });

      proc.on('exit', (code) => {
        process.exit(code || 0);
      });

      proc.on('error', (err) => {
        console.error('[cfn-swarm] Error checking status:', err.message);
        console.log('\nFallback: Check Redis directly:');
        console.log('  redis-cli keys "swarm:*"');
        process.exit(1);
      });
      break;
    }

    case 'shutdown': {
      console.log('[cfn-swarm] Shutting down swarm gracefully...');

      const script = resolve(skillPath, 'invoke-swarm-shutdown.sh');
      const taskId = options.taskId || '';

      const proc = spawn('bash', [script, taskId], { stdio: 'inherit' });

      proc.on('exit', (code) => {
        console.log('[cfn-swarm] Swarm shutdown complete');
        process.exit(code || 0);
      });

      proc.on('error', (err) => {
        console.error('[cfn-swarm] Error during shutdown:', err.message);
        process.exit(1);
      });
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('Valid subcommands: init, status, shutdown');
      process.exit(1);
  }
}

function showHelp(): void {
  console.log(`
cfn-swarm - Swarm Coordination CLI

Usage:
  cfn-swarm init <topology> [options]   Initialize swarm with agents
  cfn-swarm status                      Show swarm state
  cfn-swarm shutdown [options]          Terminate swarm gracefully

Options (init):
  --topology <type>      Swarm topology (mesh, hierarchical)
  --max-agents <n>       Maximum number of agents
  --strategy <strategy>  Coordination strategy (balanced, adaptive)

Options (shutdown):
  --task-id <id>        Shutdown specific task swarm

Examples:
  cfn-swarm init mesh --max-agents 5 --strategy balanced
  cfn-swarm status
  cfn-swarm shutdown --task-id task-123

Topologies:
  mesh          Peer-to-peer coordination (2-7 agents)
  hierarchical  Coordinator-led structure (8+ agents)

For more info: https://docs.claude.com/cfn-swarm
  `);
}

async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const { subcommand, options } = parseArgs(args);
  await executeSwarm(subcommand, options);
}

// Run if called directly
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '');
if (isMainModule) {
  main().catch((err) => {
    console.error('[cfn-swarm] Fatal error:', err);
    process.exit(1);
  });
}

export { main };
