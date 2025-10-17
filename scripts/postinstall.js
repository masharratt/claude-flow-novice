#!/usr/bin/env node

/**
 * Post-installation script for claude-flow-novice
 * Copies .claude directory from node_modules to project root
 */

import { existsSync, mkdirSync, cpSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Copy .claude directory from node_modules to project root
 */
function copyClaudeDirectory() {
  try {
    const projectRoot = process.cwd();
    const sourceDir = join(__dirname, '../dist/.claude');
    const targetDir = join(projectRoot, '.claude');

    console.log('🚀 claude-flow-novice post-install: Setting up .claude directory...');

    // Check if source directory exists
    if (!existsSync(sourceDir)) {
      console.error('❌ Source .claude directory not found at:', sourceDir);
      console.log('   This indicates a broken npm package installation.');
      process.exit(1);
    }

    // Create target directory if it doesn't exist
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
      console.log('✅ Created .claude directory in project root');
    }

    // Copy all contents from source to target
    cpSync(sourceDir, targetDir, {
      recursive: true,
      force: true
    });

    console.log('✅ Successfully copied .claude directory to project root');
    console.log('📁 Location:', targetDir);
    console.log('🎯 Ready to use: npx claude-flow-novice --help');

    // Verify key components were copied
    const agentsDir = join(targetDir, 'agents');
    const commandsDir = join(targetDir, 'commands');
    const coreDir = join(targetDir, 'core');

    if (existsSync(agentsDir)) {
      const agentFiles = readdirSync(agentsDir).length;
      console.log(`📋 Agents: ${agentFiles} files copied`);
    }

    if (existsSync(commandsDir)) {
      const commandFiles = readdirSync(commandsDir).length;
      console.log(`⚡ Commands: ${commandFiles} files copied`);
    }

    if (existsSync(coreDir)) {
      const coreFiles = readdirSync(coreDir).length;
      console.log(`🔧 Core: ${coreFiles} files copied`);
    }

    console.log('🎉 Installation complete! claude-flow-novice is ready to use.');

  } catch (error) {
    console.error('❌ Post-install script failed:', error.message);
    console.error('   Please run manually: cp -r node_modules/.claude-flow-novice/dist/.claude .claude');
    process.exit(1);
  }
}

// Run the installation
copyClaudeDirectory();