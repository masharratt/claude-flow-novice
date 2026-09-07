#!/usr/bin/env node
/**
 * CFN Loop Orchestration - CLI Provider Resolver
 * Wrapper for the TypeScript orchestrator CLI with provider routing
 *
 * Version: 1.0.0
 * Purpose: Resolves provider and routes to orchestrator-cli
 */

const { spawn } = require('child_process');
const path = require('path');

// Resolve paths
const skillDir = path.dirname(__dirname);
const orchestratorCli = path.join(skillDir, 'lib/orchestrator/dist/cli/orchestrator-cli.js');

/**
 * Parse environment variables for provider routing
 */
function resolveProvider() {
  const customRouting = process.env.CFN_CUSTOM_ROUTING;
  if (!customRouting || customRouting !== 'true') {
    return 'zai'; // Default
  }

  const provider = process.argv.find(arg => arg.startsWith('--provider='))?.split('=')[1];
  return provider || process.env.CFN_DEFAULT_PROVIDER || 'zai';
}

/**
 * Execute orchestrator with resolved provider
 */
function executeOrchestrator() {
  const provider = resolveProvider();

  // Add provider to environment
  const env = { ...process.env, CFN_PROVIDER: provider };

  // Build argument list
  const args = process.argv.slice(2);

  console.error(`[cfn-loop-orchestration] Provider resolved to: ${provider}`);
  console.error(`[cfn-loop-orchestration] Executing: ${orchestratorCli} ${args.join(' ')}`);

  // Spawn orchestrator
  const child = spawn('node', [orchestratorCli, ...args], {
    env,
    stdio: 'inherit',
    cwd: skillDir
  });

  // Handle exit
  child.on('exit', (code) => {
    process.exit(code);
  });

  // Handle errors
  child.on('error', (err) => {
    console.error(`[cfn-loop-orchestration] Failed to execute orchestrator: ${err.message}`);
    process.exit(1);
  });
}

// Execute if run directly
if (require.main === module) {
  executeOrchestrator();
}

module.exports = { resolveProvider, executeOrchestrator };