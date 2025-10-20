#!/usr/bin/env node

/**
 * CLI Entry Point for Agent Spawning
 *
 * Provides `npx cfn-spawn` command for direct agent spawning.
 *
 * Usage:
 *   npx cfn-spawn agent <type> [options]
 *   npx cfn-spawn <type> [options]  (agent is implied)
 *
 * Examples:
 *   npx cfn-spawn agent researcher --task-id task-123 --iteration 1
 *   npx cfn-spawn coder --task-id auth-impl --context "Implement JWT"
 */

import { main as agentSpawnMain } from './agent-spawn.js';

/**
 * Main CLI entry point
 * Routes to appropriate spawning handler
 */
async function main() {
  const args = process.argv.slice(2);

  // For now, all spawning goes through agent-spawn
  // In the future, we can add other subcommands here
  await agentSpawnMain(args);
}

// Run CLI
main().catch((err) => {
  console.error('[cfn-spawn] Fatal error:', err);
  process.exit(1);
});
