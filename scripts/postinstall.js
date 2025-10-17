#!/usr/bin/env node

/**
 * Post-installation script for claude-flow-novice
 * Copies .claude directory from node_modules to project root
 * Preserves existing custom files unless CLAUDE_FORCE_UPDATE=true
 */

import { existsSync, mkdirSync, cpSync, readdirSync, statSync, copyFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const stats = {
  copied: [],
  skipped: [],
  updated: []
};

/**
 * Recursively copy files, skipping existing ones unless forced
 */
function smartCopy(source, target, forceUpdate = false, verbose = false) {
  if (!existsSync(source)) return;

  const stat = statSync(source);

  if (stat.isDirectory()) {
    // Create directory if it doesn't exist
    if (!existsSync(target)) {
      mkdirSync(target, { recursive: true });
    }

    // Copy contents
    const entries = readdirSync(source);
    for (const entry of entries) {
      smartCopy(join(source, entry), join(target, entry), forceUpdate, verbose);
    }
  } else {
    // File - check if it exists
    const targetExists = existsSync(target);
    const relativePath = relative(process.cwd(), target);

    if (!targetExists) {
      // New file - always copy
      copyFileSync(source, target);
      stats.copied.push(relativePath);
      if (verbose) {
        console.log(`   ✅ ${relativePath}`);
      }
    } else if (forceUpdate) {
      // Existing file + force update - overwrite
      copyFileSync(source, target);
      stats.updated.push(relativePath);
      if (verbose) {
        console.log(`   🔄 ${relativePath}`);
      }
    } else {
      // Existing file - skip to preserve custom changes
      stats.skipped.push(relativePath);
      if (verbose) {
        console.log(`   ⏭️  ${relativePath}`);
      }
    }
  }
}

/**
 * Copy .claude directory from node_modules to project root
 */
function copyClaudeDirectory() {
  try {
    const projectRoot = process.cwd();
    const sourceDir = join(__dirname, '../dist/.claude');
    const targetDir = join(projectRoot, '.claude');
    const forceUpdate = process.env.CLAUDE_FORCE_UPDATE === 'true';
    const verbose = process.env.CLAUDE_VERBOSE === 'true' || process.env.npm_config_loglevel === 'verbose';

    console.log('🚀 claude-flow-novice post-install: Setting up .claude directory...');

    if (forceUpdate) {
      console.log('⚠️  CLAUDE_FORCE_UPDATE=true - will overwrite existing files');
    }

    if (verbose) {
      console.log('📢 Verbose mode enabled - showing all file operations\n');
    }

    // Check if source directory exists
    if (!existsSync(sourceDir)) {
      console.error('❌ Source .claude directory not found at:', sourceDir);
      console.log('   This indicates a broken npm package installation.');
      process.exit(1);
    }

    // Create target directory if it doesn't exist
    const isNewInstall = !existsSync(targetDir);
    if (isNewInstall) {
      mkdirSync(targetDir, { recursive: true });
      console.log('✅ Created .claude directory in project root');
    }

    // Smart copy - preserve existing files
    smartCopy(sourceDir, targetDir, forceUpdate, verbose);

    console.log('✅ Successfully synced .claude directory');
    console.log('📁 Location:', targetDir);

    // Report statistics
    console.log('\n📊 Installation Summary:');
    console.log(`   ✅ New files copied: ${stats.copied.length}`);
    console.log(`   ⏭️  Existing files preserved: ${stats.skipped.length}`);
    if (stats.updated.length > 0) {
      console.log(`   🔄 Files updated (forced): ${stats.updated.length}`);
    }

    if (stats.skipped.length > 0 && !isNewInstall) {
      console.log('\n💡 Tip: Your custom agents and configurations were preserved.');
      console.log('   To force update all files: CLAUDE_FORCE_UPDATE=true npx claude-flow-novice@latest');
      console.log('   To see all file operations: CLAUDE_VERBOSE=true npx claude-flow-novice@latest');
    }

    // Verify key components
    const agentsDir = join(targetDir, 'agents');
    const commandsDir = join(targetDir, 'commands');
    const coreDir = join(targetDir, 'core');

    if (existsSync(agentsDir)) {
      const agentFiles = readdirSync(agentsDir).length;
      console.log(`\n📋 Total agents available: ${agentFiles}`);
    }

    if (existsSync(commandsDir)) {
      const commandFiles = readdirSync(commandsDir).length;
      console.log(`⚡ Total commands available: ${commandFiles}`);
    }

    if (existsSync(coreDir)) {
      const coreFiles = readdirSync(coreDir).length;
      console.log(`🔧 Total core files: ${coreFiles}`);
    }

    console.log('\n🎉 Installation complete! claude-flow-novice is ready to use.');
    console.log('🎯 Run: npx claude-flow-novice --help');

  } catch (error) {
    console.error('❌ Post-install script failed:', error.message);
    console.error('   Please run manually: cp -r node_modules/claude-flow-novice/dist/.claude .claude');
    process.exit(1);
  }
}

// Run the installation
copyClaudeDirectory();