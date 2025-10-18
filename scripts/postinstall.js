#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// Logging utility
function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',  // Cyan
    warn: '\x1b[33m', // Yellow
    error: '\x1b[31m' // Red
  };
  console.log(`${colors[type]}[Claude Flow] ${message}\x1b[0m`);
}

// Generate timestamped backup filename
function getBackupFilename(basePath) {
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '_');
  return `${basePath}_backup_${timestamp}`;
}

// Check if running in development mode (not as installed dependency)
function isDevMode() {
  try {
    const packageJson = require(path.resolve(process.cwd(), 'package.json'));
    // We're in dev mode if the package name matches (developing the package itself)
    return packageJson.name === 'claude-flow-novice';
  } catch {
    return false;
  }
}

// Perform backup before sync
async function backupDirectory(sourcePath, targetPath) {
  if (fs.existsSync(targetPath)) {
    const backupPath = getBackupFilename(targetPath);
    try {
      fs.renameSync(targetPath, backupPath);
      log(`Created backup: ${backupPath}`, 'info');
    } catch (err) {
      log(`Failed to create backup: ${err.message}`, 'warn');
    }
  }
}

// Sync directories
async function syncDirectories() {
  // Skip if we're in development mode (developing the package itself)
  if (isDevMode()) {
    log('Development mode detected - skipping auto-sync', 'info');
    return;
  }

  log('Auto-syncing agents, commands, and hooks to your project...', 'info');

  const projectRoot = process.cwd();

  const syncConfigs = [
    {
      source: path.join(__dirname, '..', '.claude', 'agents'),
      target: path.join(projectRoot, '.claude', 'agents')
    },
    {
      source: path.join(__dirname, '..', '.claude', 'commands'),
      target: path.join(projectRoot, '.claude', 'commands')
    },
    {
      source: path.join(__dirname, '..', 'config', 'hooks'),
      target: path.join(projectRoot, 'config', 'hooks')
    }
  ];

  // Sync individual reference files from .claude root
  const referenceFiles = [
    'cfn-loop-rules.md',
    'cfn-mode-patterns.md',
    'coordinator-feedback-pattern.md',
    'coordinator-patterns.md',
    'redis-agent-dependencies.md',
    'spawn-pattern-examples.md',
    'ace-system-overview.md'
  ];

  // Sync CLAUDE.md from root-claude-distribute to project root
  const claudeMdSource = path.join(__dirname, '..', '.claude', 'root-claude-distribute', 'CLAUDE.md');
  const claudeMdTarget = path.join(projectRoot, 'CLAUDE.md');

  if (fs.existsSync(claudeMdSource)) {
    try {
      // Backup existing CLAUDE.md if it exists
      if (fs.existsSync(claudeMdTarget)) {
        const backupFile = getBackupFilename(claudeMdTarget);
        fs.renameSync(claudeMdTarget, backupFile);
        log('Backed up existing CLAUDE.md', 'info');
      }

      // Copy CLAUDE.md to project root
      fs.copyFileSync(claudeMdSource, claudeMdTarget);
      log('Synced CLAUDE.md to project root', 'info');
    } catch (err) {
      log(`Failed to sync CLAUDE.md: ${err.message}`, 'error');
    }
  }

  const claudeRoot = path.join(__dirname, '..', '.claude');
  const targetClaudeRoot = path.join(projectRoot, '.claude');

  // Ensure target .claude directory exists
  fs.mkdirSync(targetClaudeRoot, { recursive: true });

  for (const filename of referenceFiles) {
    try {
      const sourceFile = path.join(claudeRoot, filename);
      const targetFile = path.join(targetClaudeRoot, filename);

      if (fs.existsSync(sourceFile)) {
        // Backup existing file if it exists
        if (fs.existsSync(targetFile)) {
          const backupFile = getBackupFilename(targetFile);
          fs.renameSync(targetFile, backupFile);
          log(`Backed up existing ${filename}`, 'info');
        }

        // Copy reference file
        fs.copyFileSync(sourceFile, targetFile);
        log(`Synced ${filename} to project`, 'info');
      }
    } catch (err) {
      log(`Failed to sync ${filename}: ${err.message}`, 'error');
    }
  }

  for (const config of syncConfigs) {
    try {
      // Create target directory if it doesn't exist
      fs.mkdirSync(path.dirname(config.target), { recursive: true });

      // Backup existing directory
      await backupDirectory(config.source, config.target);

      // Perform directory copy using cp command
      const sourcePath = config.source;
      const targetPath = config.target;

      try {
        execSync(`cp -r "${sourcePath}" "${targetPath}"`, { stdio: 'ignore' });
        log(`Synced ${path.basename(config.source)}/ to project`, 'info');
      } catch (cpError) {
        // Fallback to recursive copy for Windows
        copyDirRecursive(sourcePath, targetPath);
        log(`Synced ${path.basename(config.source)}/ to project`, 'info');
      }
    } catch (err) {
      log(`Sync failed for ${path.basename(config.source)}: ${err.message}`, 'error');
    }
  }
}

// Fallback recursive copy for Windows
function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Run sync
syncDirectories().catch(err => {
  log(`Sync encountered an error: ${err.message}`, 'error');
  process.exit(1);
});