#!/usr/bin/env node

/**
 * Post-installation script for claude-flow-novice
 * Copies .claude directory from package to project root
 * Overwrites existing files to ensure updates work correctly
 */

import { existsSync, cpSync } from 'fs';
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

    // Try multiple source locations (handles both dev and installed package scenarios)
    const possibleSources = [
      join(__dirname, '../dist/.claude'),  // Installed package: node_modules/claude-flow-novice/scripts/ → dist/.claude
      join(__dirname, '../.claude'),       // Direct execution from repo root
      join(__dirname, '../../.claude'),    // Execution from dist/scripts/
    ];

    const sourceDir = possibleSources.find(dir => existsSync(dir));
    const targetDir = join(projectRoot, '.claude');

    console.log('🚀 claude-flow-novice post-install: Setting up .claude directory...');

    // Check if source directory was found
    if (!sourceDir) {
      console.error('❌ Source .claude directory not found. Tried:');
      possibleSources.forEach(dir => console.error(`   - ${dir}`));
      console.log('   This indicates a broken npm package installation.');
      process.exit(1);
    }

    // Copy entire directory, overwriting existing files
    cpSync(sourceDir, targetDir, { recursive: true, force: true });

    console.log('✅ Successfully installed .claude directory');
    console.log('📁 Location:', targetDir);

    console.log('🎉 Installation complete! claude-flow-novice is ready to use.');

  } catch (error) {
    console.error('❌ Post-install script failed:', error.message);
    console.error('   Please run manually: cp -r node_modules/claude-flow-novice/dist/.claude .claude');
    process.exit(1);
  }
}

// Run the installation
copyClaudeDirectory();