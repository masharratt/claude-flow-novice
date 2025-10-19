#!/usr/bin/env node

/**
 * CLI Entry Point for Agent Spawning
 *
 * Provides `npx claude-flow-spawn` command for coordinator agents
 * to spawn cost-optimized worker agents via CLI.
 *
 * Usage:
 *   npx claude-flow-spawn "Task description" --agents=coder,tester --provider zai
 *   npx claude-flow-spawn --list-agents
 *   npx claude-flow-spawn --agents-by-category
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the actual spawn-workers implementation
const SPAWN_WORKERS_PATH = join(__dirname, 'hybrid-routing', 'spawn-workers.cjs');

/**
 * Main CLI entry point
 * Delegates to spawn-workers.cjs with all arguments
 */
async function main() {
  const args = process.argv.slice(2);

  // Spawn the worker process
  const child = spawn('node', [SPAWN_WORKERS_PATH, ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      SPAWNER_CLI_MODE: 'true'
    }
  });

  // Handle process exit
  child.on('exit', (code) => {
    process.exit(code || 0);
  });

  // Handle errors
  child.on('error', (err) => {
    console.error('[claude-flow-spawn] Error:', err.message);
    process.exit(1);
  });

  // Cleanup on parent exit
  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
}

// Run CLI
main().catch((err) => {
  console.error('[claude-flow-spawn] Fatal error:', err);
  process.exit(1);
});
