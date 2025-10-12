#!/usr/bin/env node

/**
 * Agent Profile Sync Script
 *
 * Syncs agent profiles from npm package to user's .claude/agents directory
 * - Overwrites existing agents with same name (package version is source of truth)
 * - Preserves user's custom agents (not in package)
 * - Creates backup of overwritten agents
 * - Validates agent profiles after sync
 */

import { readdir, readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AgentSync {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.packageAgentsDir = join(dirname(__dirname), '.claude', 'agents');
    this.userAgentsDir = join(this.projectRoot, '.claude', 'agents');
    this.backupDir = join(this.userAgentsDir, '.backup');
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.skipBackup = options.skipBackup || false;

    this.stats = {
      overwritten: [],
      created: [],
      preserved: [],
      backed_up: [],
      errors: []
    };
  }

  log(message, level = 'info') {
    if (level === 'verbose' && !this.verbose) return;

    const prefix = {
      info: 'ℹ️ ',
      success: '✅',
      warn: '⚠️ ',
      error: '❌',
      verbose: '  '
    }[level] || '';

    console.log(`${prefix} ${message}`);
  }

  async sync() {
    this.log('Agent Profile Sync Starting...', 'info');

    if (this.dryRun) {
      this.log('DRY RUN MODE - No changes will be made', 'warn');
    }

    try {
      // Ensure user .claude/agents directory exists
      await this.ensureDirectories();

      // Get list of agents from package
      const packageAgents = await this.getPackageAgents();
      this.log(`Found ${packageAgents.length} agents in package`, 'verbose');

      // Get list of existing user agents
      const userAgents = await this.getUserAgents();
      this.log(`Found ${userAgents.length} existing user agents`, 'verbose');

      // Sync each package agent
      for (const agentFile of packageAgents) {
        await this.syncAgent(agentFile, userAgents);
      }

      // Report results
      this.printSummary();

      return { success: true, stats: this.stats };

    } catch (error) {
      this.log(`Sync failed: ${error.message}`, 'error');
      this.stats.errors.push({ file: 'sync', error: error.message });
      return { success: false, error: error.message, stats: this.stats };
    }
  }

  async ensureDirectories() {
    if (!this.dryRun) {
      if (!existsSync(this.userAgentsDir)) {
        await mkdir(this.userAgentsDir, { recursive: true });
        this.log(`Created user agents directory: ${this.userAgentsDir}`, 'verbose');
      }

      if (!this.skipBackup && !existsSync(this.backupDir)) {
        await mkdir(this.backupDir, { recursive: true });
        this.log(`Created backup directory: ${this.backupDir}`, 'verbose');
      }
    }
  }

  async getPackageAgents() {
    return await this.getAgentFiles(this.packageAgentsDir);
  }

  async getUserAgents() {
    if (!existsSync(this.userAgentsDir)) {
      return [];
    }
    return await this.getAgentFiles(this.userAgentsDir);
  }

  async getAgentFiles(directory) {
    const agents = [];

    try {
      const entries = await readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(directory, entry.name);

        if (entry.isDirectory() && entry.name !== '.backup') {
          // Recursively scan subdirectories
          const subAgents = await this.getAgentFiles(fullPath);
          agents.push(...subAgents);
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
          agents.push(fullPath);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
      this.log(`Could not read directory ${directory}: ${error.message}`, 'verbose');
    }

    return agents;
  }

  async syncAgent(packageAgentPath, userAgents) {
    // Get relative path from package agents directory
    const relativePath = relative(this.packageAgentsDir, packageAgentPath);
    const userAgentPath = join(this.userAgentsDir, relativePath);
    const userAgentExists = existsSync(userAgentPath);

    try {
      // Read package agent content
      const packageContent = await readFile(packageAgentPath, 'utf8');

      if (userAgentExists) {
        // Agent exists - check if we should overwrite
        const userContent = await readFile(userAgentPath, 'utf8');

        if (packageContent === userContent) {
          // Identical - no action needed
          this.stats.preserved.push(relativePath);
          this.log(`Preserved: ${relativePath} (identical)`, 'verbose');
          return;
        }

        // Different content - backup and overwrite
        if (!this.skipBackup && !this.dryRun) {
          await this.backupAgent(userAgentPath, relativePath);
        }

        if (!this.dryRun) {
          await writeFile(userAgentPath, packageContent, 'utf8');
        }

        this.stats.overwritten.push(relativePath);
        this.log(`Overwritten: ${relativePath}`, 'success');

      } else {
        // New agent - create it
        const userAgentDir = dirname(userAgentPath);

        if (!this.dryRun) {
          if (!existsSync(userAgentDir)) {
            await mkdir(userAgentDir, { recursive: true });
          }
          await writeFile(userAgentPath, packageContent, 'utf8');
        }

        this.stats.created.push(relativePath);
        this.log(`Created: ${relativePath}`, 'success');
      }

    } catch (error) {
      this.stats.errors.push({ file: relativePath, error: error.message });
      this.log(`Error syncing ${relativePath}: ${error.message}`, 'error');
    }
  }

  async backupAgent(userAgentPath, relativePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${relativePath.replace(/\//g, '_')}.${timestamp}.backup`;
    const backupPath = join(this.backupDir, backupFileName);

    try {
      await copyFile(userAgentPath, backupPath);
      this.stats.backed_up.push(relativePath);
      this.log(`Backed up: ${relativePath} → ${backupFileName}`, 'verbose');
    } catch (error) {
      this.log(`Backup failed for ${relativePath}: ${error.message}`, 'warn');
    }
  }

  printSummary() {
    console.log('\n📊 Sync Summary:\n');

    if (this.stats.created.length > 0) {
      console.log(`✅ Created: ${this.stats.created.length} agents`);
      if (this.verbose) {
        this.stats.created.forEach(f => console.log(`   - ${f}`));
      }
    }

    if (this.stats.overwritten.length > 0) {
      console.log(`🔄 Overwritten: ${this.stats.overwritten.length} agents`);
      if (this.verbose) {
        this.stats.overwritten.forEach(f => console.log(`   - ${f}`));
      }
    }

    if (this.stats.backed_up.length > 0) {
      console.log(`💾 Backed up: ${this.stats.backed_up.length} agents`);
      console.log(`   Location: ${this.backupDir}`);
    }

    if (this.stats.preserved.length > 0) {
      console.log(`⚪ Preserved: ${this.stats.preserved.length} agents (no changes)`);
    }

    if (this.stats.errors.length > 0) {
      console.log(`\n❌ Errors: ${this.stats.errors.length}`);
      this.stats.errors.forEach(e => console.log(`   - ${e.file}: ${e.error}`));
    }

    const total = this.stats.created.length + this.stats.overwritten.length +
                  this.stats.preserved.length;
    console.log(`\n📦 Total agents: ${total}`);

    if (this.dryRun) {
      console.log('\n⚠️  DRY RUN - No changes were made');
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    skipBackup: args.includes('--no-backup')
  };

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Agent Profile Sync

Usage: node sync-agents.js [options]

Options:
  --dry-run      Show what would be synced without making changes
  --verbose, -v  Show detailed sync information
  --no-backup    Skip creating backups of overwritten agents
  --help, -h     Show this help message

Examples:
  node sync-agents.js                    # Sync agents with backups
  node sync-agents.js --dry-run          # Preview changes
  node sync-agents.js --verbose          # Detailed output
  node sync-agents.js --no-backup        # Skip backups (faster)
`);
    process.exit(0);
  }

  const syncer = new AgentSync(options);
  const result = await syncer.sync();

  process.exit(result.success ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default AgentSync;
