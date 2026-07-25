#!/usr/bin/env node
/**
 * CFN Loop Orchestrator - Main CLI Entry Point
 * Simplified CLI that matches the documented interface
 */

const { spawn } = require('child_process');
const path = require('path');

// Resolve paths
const skillDir = path.dirname(__dirname);
const orchestratorCli = path.join(skillDir, 'lib/orchestrator/dist/cli/orchestrator-cli.js');

/**
 * Execute orchestrator with all arguments
 */
function execute(args) {
  // Validate orchestrator exists
  if (!require('fs').existsSync(orchestratorCli)) {
    console.error(`Error: Orchestrator CLI not found at ${orchestratorCli}`);
    console.error('Please build the orchestrator first: cd lib/orchestrator && npm run build');
    process.exit(1);
  }

  // Spawn orchestrator
  const child = spawn('node', [orchestratorCli, ...args], {
    stdio: 'inherit',
    cwd: skillDir
  });

  // Handle exit
  child.on('exit', (code) => {
    process.exit(code || 0);
  });

  // Handle errors
  child.on('error', (err) => {
    console.error(`Failed to execute orchestrator: ${err.message}`);
    process.exit(1);
  });
}

// Export for module use
module.exports = { execute };

// Execute if run directly
if (require.main === module) {
  execute(process.argv.slice(2));
}