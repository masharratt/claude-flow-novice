#!/usr/bin/env node
/**
 * Claude-Flow CLI - Main entry point for Node.js
 */

import { CLI, VERSION } from './cli-core.js';
import { setupCommands } from './commands/index.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Ensure .claude directory is set up in the current project
 * Runs the postinstall script if .claude doesn't exist
 */
async function ensureSetup() {
  const projectRoot = process.cwd();
  const claudeDir = join(projectRoot, '.claude');

  if (!existsSync(claudeDir)) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const postinstallScript = join(__dirname, '../../scripts/postinstall.js');

    if (existsSync(postinstallScript)) {
      console.log('🔧 First-time setup: Installing .claude directory...\n');
      try {
        execSync(`node "${postinstallScript}"`, { stdio: 'inherit' });
      } catch (error) {
        console.error('⚠️  Setup failed. Try running manually:');
        console.error(`   node "${postinstallScript}"`);
        process.exit(1);
      }
    } else {
      console.error('❌ Setup script not found. Please reinstall claude-flow-novice.');
      process.exit(1);
    }
  }
}

async function main() {
  // Ensure .claude directory exists before running any commands
  await ensureSetup();

  const cli = new CLI('claude-flow', 'Advanced AI Agent Orchestration System');

  // Setup all commands
  setupCommands(cli);

  // Run the CLI (args default to process.argv.slice(2) in Node.js version)
  await cli.run();
}

// Check if this module is being run directly (Node.js equivalent of import.meta.main)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isMainModule = process.argv[1] === __filename || process.argv[1].endsWith('/main.js');

if (isMainModule) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
