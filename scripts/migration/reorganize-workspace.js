#!/usr/bin/env node

/**
 * @fileoverview Automated workspace reorganization script with git history preservation
 * @module scripts/migration/reorganize-workspace
 *
 * Features:
 * - Git history preservation via git mv
 * - Dry-run mode for safe planning
 * - Automatic backup creation with timestamps
 * - Rollback capability
 * - Comprehensive logging
 * - Progress reporting
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WorkspaceReorganizer {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.rollback = options.rollback || false;
    this.rootDir = path.resolve(__dirname, '../..');
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    this.logFile = path.join(this.rootDir, '.artifacts', 'logs', `migration-${this.timestamp}.log`);
    this.backupFile = path.join(this.rootDir, '.artifacts', 'backups', `workspace-backup-${this.timestamp}.json`);
    this.operations = [];
    this.errors = [];
    this.stats = {
      planned: 0,
      completed: 0,
      failed: 0,
      skipped: 0
    };

    // Migration rules
    this.migrationRules = [
      {
        pattern: /^test-.*\.(js|mjs|cjs|ts)$/,
        destination: 'tests/manual/',
        description: 'Manual test files'
      },
      {
        pattern: /^.*-validation\.(js|mjs|cjs|ts)$/,
        destination: 'scripts/validation/',
        description: 'Validation scripts'
      },
      {
        pattern: /^.*-consensus-report\.(js|mjs|cjs|ts)$/,
        destination: 'scripts/validation/',
        description: 'Consensus report scripts'
      },
      {
        pattern: /^.*-demo.*\.(js|mjs|cjs|ts)$/,
        destination: 'scripts/demo/',
        description: 'Demo scripts'
      },
      {
        pattern: /^performance-.*\.(js|mjs|cjs|ts)$/,
        destination: 'scripts/demo/',
        description: 'Performance demo scripts'
      },
      {
        pattern: /^test-results.*\.(json|txt|log)$/,
        destination: '.artifacts/test-results/archive/',
        description: 'Test result files'
      },
      {
        pattern: /^benchmark-results.*\.txt$/,
        destination: '.artifacts/benchmarks/',
        description: 'Benchmark result files'
      },
      {
        pattern: /^.*\.log$/,
        destination: '.artifacts/logs/',
        description: 'Log files'
      },
      {
        pattern: /^.*\.(backup|bundle)$/,
        destination: '.artifacts/backups/',
        description: 'Backup files'
      },
      {
        pattern: /^swarm-memory\.db.*$/,
        destination: 'database/',
        description: 'Database files'
      }
    ];
  }

  /**
   * Initialize logging
   */
  initializeLogging() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.log('='.repeat(80));
    this.log(`Workspace Reorganization Script`);
    this.log(`Timestamp: ${this.timestamp}`);
    this.log(`Mode: ${this.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
    this.log(`Verbose: ${this.verbose}`);
    this.log(`Rollback: ${this.rollback}`);
    this.log('='.repeat(80));
  }

  /**
   * Log message to both console and file
   */
  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;

    console.log(logMessage);

    try {
      fs.appendFileSync(this.logFile, logMessage + '\n');
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }

  /**
   * Verbose logging (only if verbose mode enabled)
   */
  debug(message) {
    if (this.verbose) {
      this.log(message, 'DEBUG');
    }
  }

  /**
   * Execute shell command with error handling
   */
  exec(command, options = {}) {
    try {
      this.debug(`Executing: ${command}`);
      const result = execSync(command, {
        cwd: this.rootDir,
        encoding: 'utf8',
        ...options
      });
      return { success: true, output: result };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        output: error.stdout || error.stderr || ''
      };
    }
  }

  /**
   * Check if file exists
   */
  fileExists(filePath) {
    return fs.existsSync(path.join(this.rootDir, filePath));
  }

  /**
   * Scan root directory for files to migrate
   */
  scanWorkspace() {
    this.log('Scanning workspace for files to migrate...');

    try {
      const files = fs.readdirSync(this.rootDir);

      files.forEach(file => {
        const filePath = path.join(this.rootDir, file);
        const stat = fs.statSync(filePath);

        // Only process files, skip directories
        if (!stat.isFile()) {
          return;
        }

        // Check each migration rule
        for (const rule of this.migrationRules) {
          if (rule.pattern.test(file)) {
            this.operations.push({
              source: file,
              destination: path.join(rule.destination, file),
              description: rule.description,
              rule: rule.pattern.toString()
            });
            this.stats.planned++;
            break; // Only match first rule
          }
        }
      });

      this.log(`Found ${this.operations.length} files to migrate`);

    } catch (error) {
      this.log(`Error scanning workspace: ${error.message}`, 'ERROR');
      this.errors.push({ operation: 'scan', error: error.message });
    }
  }

  /**
   * Create backup of workspace state
   */
  createBackup() {
    if (this.dryRun) {
      this.log('DRY-RUN: Skipping backup creation');
      return true;
    }

    this.log('Creating workspace backup...');

    try {
      const backupDir = path.dirname(this.backupFile);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const backupData = {
        timestamp: this.timestamp,
        operations: this.operations,
        rootDir: this.rootDir
      };

      fs.writeFileSync(this.backupFile, JSON.stringify(backupData, null, 2));
      this.log(`Backup created: ${this.backupFile}`);
      return true;

    } catch (error) {
      this.log(`Failed to create backup: ${error.message}`, 'ERROR');
      this.errors.push({ operation: 'backup', error: error.message });
      return false;
    }
  }

  /**
   * Ensure destination directory exists
   */
  ensureDestinationDir(destPath) {
    const destDir = path.dirname(path.join(this.rootDir, destPath));

    if (!fs.existsSync(destDir)) {
      if (this.dryRun) {
        this.debug(`DRY-RUN: Would create directory: ${destDir}`);
      } else {
        fs.mkdirSync(destDir, { recursive: true });
        this.debug(`Created directory: ${destDir}`);
      }
    }
  }

  /**
   * Execute file migration using git mv
   */
  migrateFile(operation) {
    const { source, destination, description } = operation;

    // Validate source exists
    if (!this.fileExists(source)) {
      this.log(`Skipping: ${source} (does not exist)`, 'WARN');
      this.stats.skipped++;
      return;
    }

    // Check if destination already exists
    if (this.fileExists(destination)) {
      this.log(`Skipping: ${destination} (already exists)`, 'WARN');
      this.stats.skipped++;
      return;
    }

    // Ensure destination directory exists
    this.ensureDestinationDir(destination);

    if (this.dryRun) {
      this.log(`DRY-RUN: Would move ${source} -> ${destination} (${description})`);
      this.stats.completed++;
      return;
    }

    // Use git mv to preserve history
    const result = this.exec(`git mv "${source}" "${destination}"`);

    if (result.success) {
      this.log(`✓ Moved: ${source} -> ${destination}`);
      this.stats.completed++;
    } else {
      this.log(`✗ Failed to move ${source}: ${result.error}`, 'ERROR');
      this.errors.push({ operation: source, error: result.error });
      this.stats.failed++;
    }
  }

  /**
   * Execute all migration operations
   */
  executeMigration() {
    this.log('\nExecuting migration operations...\n');

    // Group operations by destination for better reporting
    const grouped = this.operations.reduce((acc, op) => {
      const destDir = path.dirname(op.destination);
      if (!acc[destDir]) {
        acc[destDir] = [];
      }
      acc[destDir].push(op);
      return acc;
    }, {});

    // Process each group
    Object.entries(grouped).forEach(([destDir, ops]) => {
      this.log(`\n→ Migrating ${ops.length} files to ${destDir}/`);
      ops.forEach(op => this.migrateFile(op));
    });
  }

  /**
   * Restore from backup (rollback)
   */
  performRollback() {
    this.log('Performing rollback from backup...');

    // Find most recent backup
    const backupsDir = path.join(this.rootDir, '.artifacts', 'backups');
    if (!fs.existsSync(backupsDir)) {
      this.log('No backups directory found', 'ERROR');
      return false;
    }

    const backups = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('workspace-backup-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (backups.length === 0) {
      this.log('No backup files found', 'ERROR');
      return false;
    }

    const backupFile = path.join(backupsDir, backups[0]);
    this.log(`Using backup: ${backupFile}`);

    try {
      const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

      // Reverse the operations
      backup.operations.reverse().forEach(op => {
        const { source, destination } = op;

        if (this.fileExists(destination)) {
          const result = this.exec(`git mv "${destination}" "${source}"`);
          if (result.success) {
            this.log(`✓ Restored: ${destination} -> ${source}`);
          } else {
            this.log(`✗ Failed to restore ${destination}: ${result.error}`, 'ERROR');
          }
        }
      });

      this.log('Rollback completed');
      return true;

    } catch (error) {
      this.log(`Rollback failed: ${error.message}`, 'ERROR');
      return false;
    }
  }

  /**
   * Print summary report
   */
  printSummary() {
    this.log('\n' + '='.repeat(80));
    this.log('MIGRATION SUMMARY');
    this.log('='.repeat(80));
    this.log(`Mode: ${this.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
    this.log(`Planned: ${this.stats.planned}`);
    this.log(`Completed: ${this.stats.completed}`);
    this.log(`Failed: ${this.stats.failed}`);
    this.log(`Skipped: ${this.stats.skipped}`);

    if (this.errors.length > 0) {
      this.log(`\nErrors (${this.errors.length}):`);
      this.errors.forEach(err => {
        this.log(`  - ${err.operation}: ${err.error}`, 'ERROR');
      });
    }

    this.log(`\nLog file: ${this.logFile}`);
    if (!this.dryRun) {
      this.log(`Backup file: ${this.backupFile}`);
    }
    this.log('='.repeat(80));
  }

  /**
   * Main execution flow
   */
  async run() {
    this.initializeLogging();

    if (this.rollback) {
      this.performRollback();
      this.printSummary();
      return;
    }

    this.scanWorkspace();

    if (this.operations.length === 0) {
      this.log('No files to migrate');
      return;
    }

    if (!this.dryRun) {
      if (!this.createBackup()) {
        this.log('Backup creation failed, aborting migration', 'ERROR');
        return;
      }
    }

    this.executeMigration();
    this.printSummary();

    // Exit code based on failures
    if (this.stats.failed > 0) {
      process.exit(1);
    }
  }
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    verbose: false,
    rollback: false
  };

  args.forEach(arg => {
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--rollback':
        options.rollback = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Workspace Reorganization Script

Usage: node reorganize-workspace.js [OPTIONS]

Options:
  --dry-run    Show what would be done without executing
  --verbose    Enable detailed logging
  --rollback   Restore from most recent backup
  --help, -h   Show this help message

Examples:
  # Preview migration (safe)
  node reorganize-workspace.js --dry-run

  # Execute migration with verbose output
  node reorganize-workspace.js --verbose

  # Execute migration
  node reorganize-workspace.js

  # Rollback to previous state
  node reorganize-workspace.js --rollback
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        console.log('Use --help for usage information');
        process.exit(1);
    }
  });

  return options;
}

// Main execution
const options = parseArgs();
const reorganizer = new WorkspaceReorganizer(options);
reorganizer.run().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});

export default WorkspaceReorganizer;
