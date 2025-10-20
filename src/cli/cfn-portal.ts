#!/usr/bin/env node
/**
 * cfn-portal - Web portal management
 *
 * Usage:
 *   cfn-portal start      Launch web portal
 *   cfn-portal stop       Terminate portal
 *   cfn-portal status     Show portal state
 *   cfn-portal agents     Show active agents
 *   cfn-portal metrics    Show system metrics
 *   cfn-portal events     Show recent events
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

interface PortalOptions {
  port?: number;
  limit?: number;
  status?: string;
}

function parseArgs(args: string[]): { subcommand: string; options: PortalOptions } {
  const subcommand = args[0] || 'status';
  const options: PortalOptions = {};

  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--port':
        options.port = parseInt(value, 10);
        break;
      case '--limit':
        options.limit = parseInt(value, 10);
        break;
      case '--status':
        options.status = value;
        break;
    }
  }

  return { subcommand, options };
}

async function executePortal(subcommand: string, options: PortalOptions): Promise<void> {
  const skillPath = resolve(process.cwd(), '.claude/skills/web-portal');

  switch (subcommand) {
    case 'start': {
      const port = options.port || 3000;
      console.log(`[cfn-portal] Starting web portal on port ${port}...`);

      const script = resolve(skillPath, 'invoke-portal-start.sh');
      const proc = spawn('bash', [script], {
        stdio: 'inherit',
        env: { ...process.env, PORT: port.toString() }
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          console.log(`\n✅ Web portal started: http://localhost:${port}`);
        }
        process.exit(code || 0);
      });

      proc.on('error', (err) => {
        console.error('[cfn-portal] Failed to start:', err.message);
        process.exit(1);
      });
      break;
    }

    case 'stop': {
      console.log('[cfn-portal] Stopping web portal...');

      const script = resolve(skillPath, 'invoke-portal-stop.sh');
      const proc = spawn('bash', [script], { stdio: 'inherit' });

      proc.on('exit', (code) => {
        console.log('[cfn-portal] Portal stopped');
        process.exit(code || 0);
      });

      proc.on('error', (err) => {
        console.error('[cfn-portal] Failed to stop:', err.message);
        process.exit(1);
      });
      break;
    }

    case 'status': {
      console.log('[cfn-portal] Checking portal status...');

      const script = resolve(skillPath, 'invoke-portal-status.sh');
      const proc = spawn('bash', [script], { stdio: 'inherit' });

      proc.on('exit', (code) => process.exit(code || 0));
      proc.on('error', (err) => {
        console.error('[cfn-portal] Error:', err.message);
        process.exit(1);
      });
      break;
    }

    case 'agents': {
      const status = options.status || 'active';
      console.log(`[cfn-portal] Fetching ${status} agents...`);

      const script = resolve(skillPath, 'invoke-portal-agents.sh');
      const proc = spawn('bash', [script, '--status', status], { stdio: 'inherit' });

      proc.on('exit', (code) => process.exit(code || 0));
      proc.on('error', (err) => {
        console.error('[cfn-portal] Error:', err.message);
        process.exit(1);
      });
      break;
    }

    case 'metrics': {
      console.log('[cfn-portal] Fetching system metrics...');

      const script = resolve(skillPath, 'invoke-portal-metrics.sh');
      const proc = spawn('bash', [script], { stdio: 'inherit' });

      proc.on('exit', (code) => process.exit(code || 0));
      proc.on('error', (err) => {
        console.error('[cfn-portal] Error:', err.message);
        process.exit(1);
      });
      break;
    }

    case 'events': {
      const limit = options.limit || 50;
      console.log(`[cfn-portal] Fetching last ${limit} events...`);

      const script = resolve(skillPath, 'invoke-portal-events.sh');
      const proc = spawn('bash', [script, '--limit', limit.toString()], { stdio: 'inherit' });

      proc.on('exit', (code) => process.exit(code || 0));
      proc.on('error', (err) => {
        console.error('[cfn-portal] Error:', err.message);
        process.exit(1);
      });
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('Valid subcommands: start, stop, status, agents, metrics, events');
      process.exit(1);
  }
}

function showHelp(): void {
  console.log(`
cfn-portal - Web Portal Management CLI

Usage:
  cfn-portal start [options]     Launch web portal
  cfn-portal stop                Terminate portal
  cfn-portal status              Show portal state
  cfn-portal agents [options]    Show active agents
  cfn-portal metrics             Show system metrics
  cfn-portal events [options]    Show recent events

Options (start):
  --port <port>         Portal port (default: 3000)

Options (agents):
  --status <status>     Filter by status (active, completed, failed)

Options (events):
  --limit <n>           Number of events to show (default: 50)

Examples:
  cfn-portal start --port 3000
  cfn-portal status
  cfn-portal agents --status active
  cfn-portal events --limit 100
  cfn-portal stop

Web UI: http://localhost:3000 (after start)

For more info: https://docs.claude.com/cfn-portal
  `);
}

async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const { subcommand, options } = parseArgs(args);
  await executePortal(subcommand, options);
}

// Run if called directly
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '');
if (isMainModule) {
  main().catch((err) => {
    console.error('[cfn-portal] Fatal error:', err);
    process.exit(1);
  });
}

export { main };
