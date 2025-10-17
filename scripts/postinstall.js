#!/usr/bin/env node

/**
 * Post-installation script for claude-flow-novice
 * Copies .claude directory from package to project root
 * Overwrites existing files to ensure updates work correctly
 */

import { existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/**
 * Copy .claude directory from node_modules to project root
 * Shows progress for each file copied
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
    console.log('📂 Source:', sourceDir);
    console.log('📁 Target:', targetDir);
    console.log('');

    // Check if source directory was found
    if (!sourceDir) {
      console.error('❌ Source .claude directory not found. Tried:');
      possibleSources.forEach(dir => console.error(`   - ${dir}`));
      console.log('   This indicates a broken npm package installation.');
      process.exit(1);
    }

    let fileCount = 0;

    /**
     * Recursively copy directory with progress output
     */
    function copyWithProgress(source, target) {
      const stat = statSync(source);

      if (stat.isDirectory()) {
        // Create directory if it doesn't exist
        if (!existsSync(target)) {
          mkdirSync(target, { recursive: true });
        }

        // Copy all entries in directory
        const entries = readdirSync(source);
        for (const entry of entries) {
          copyWithProgress(join(source, entry), join(target, entry));
        }
      } else {
        // Copy file and show progress
        const relativePath = relative(sourceDir, source);
        const status = existsSync(target) ? '♻️  Overwriting' : '📄 Copying';
        console.log(`${status}: ${relativePath}`);

        copyFileSync(source, target);
        fileCount++;
      }
    }

    // Start copying
    copyWithProgress(sourceDir, targetDir);

    console.log('');
    console.log(`✅ Successfully copied ${fileCount} files`);
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