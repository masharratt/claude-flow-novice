#!/usr/bin/env node
/**
 * Sync agents, commands, and hooks from npm package to local project
 * Usage: npx claude-flow-novice sync [--force] [--backup] [--agents] [--commands] [--hooks]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const flags = {
  force: args.includes('--force'),
  backup: args.includes('--backup'),
  agents: args.includes('--agents') || args.length === 0,
  commands: args.includes('--commands') || args.length === 0,
  hooks: args.includes('--hooks') || args.length === 0,
  help: args.includes('--help') || args.includes('-h')
};

if (flags.help) {
  console.log(`
Claude Flow Novice - Sync Script

Syncs agents, commands, and hooks from npm package to your local project.

Usage:
  npx claude-flow-novice sync [options]

Options:
  --agents     Sync .claude/agents/ only
  --commands   Sync .claude/commands/ only  
  --hooks      Sync config/hooks/ only
  --force      Overwrite existing files without prompting
  --backup     Create backup before syncing (recommended)
  --help, -h   Show this help message

Examples:
  npx claude-flow-novice sync                    # Sync everything
  npx claude-flow-novice sync --agents --backup  # Sync agents with backup
  npx claude-flow-novice sync --force --backup   # Force sync all with backup
`);
  process.exit(0);
}

// Find package location
const packagePath = path.join(__dirname, '..');
const projectRoot = process.cwd();

console.log('🚀 Claude Flow Novice - Sync Script\n');
console.log(`📦 Package: ${packagePath}`);
console.log(`📁 Project: ${projectRoot}\n`);

const syncItems = [
  {
    name: 'agents',
    enabled: flags.agents,
    source: path.join(packagePath, '.claude', 'agents'),
    dest: path.join(projectRoot, '.claude', 'agents'),
    description: 'Agent definitions'
  },
  {
    name: 'commands',
    enabled: flags.commands,
    source: path.join(packagePath, '.claude', 'commands'),
    dest: path.join(projectRoot, '.claude', 'commands'),
    description: 'Slash commands'
  },
  {
    name: 'hooks',
    enabled: flags.hooks,
    source: path.join(packagePath, 'config', 'hooks'),
    dest: path.join(projectRoot, 'config', 'hooks'),
    description: 'Validation hooks'
  }
];

// Backup function
function createBackup(destPath) {
  if (!fs.existsSync(destPath)) return null;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const backupPath = `${destPath}.backup-${timestamp}`;
  
  console.log(`  📋 Creating backup: ${path.basename(backupPath)}`);
  execSync(`cp -r "${destPath}" "${backupPath}"`);
  return backupPath;
}

// Copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`  ❌ Source not found: ${src}`);
    return false;
  }

  // Create destination directory
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  let fileCount = 0;

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      fileCount++;
    }
  }

  return fileCount;
}

// Count files in directory
function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  
  return count;
}

// Main sync process
let totalSynced = 0;

for (const item of syncItems) {
  if (!item.enabled) continue;

  console.log(`\n📂 Syncing ${item.description}...`);
  console.log(`   Source: ${item.source}`);
  console.log(`   Dest:   ${item.dest}`);

  // Check if source exists
  if (!fs.existsSync(item.source)) {
    console.log(`  ⚠️  Source directory not found, skipping`);
    continue;
  }

  // Backup if requested
  if (flags.backup) {
    createBackup(item.dest);
  }

  // Check if destination exists and not forcing
  if (fs.existsSync(item.dest) && !flags.force) {
    const beforeCount = countFiles(item.dest);
    console.log(`  ⚠️  Destination exists with ${beforeCount} files`);
    console.log(`  💡 Use --force to overwrite or --backup to create backup first`);
    continue;
  }

  // Perform sync
  const fileCount = copyDir(item.source, item.dest);
  console.log(`  ✅ Synced ${fileCount} files`);
  totalSynced += fileCount;
}

console.log(`\n✨ Sync complete! ${totalSynced} files synced.\n`);

if (totalSynced > 0) {
  console.log('Next steps:');
  console.log('  1. Review synced files');
  console.log('  2. Customize as needed for your project');
  console.log('  3. Commit changes to version control\n');
}
