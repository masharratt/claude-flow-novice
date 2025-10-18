#!/usr/bin/env node

/**
 * Root Directory Migration Script
 * 
 * This script executes the migration plan to organize the root directory
 * from 110 files down to 12 essential files.
 * 
 * Usage: node migration-execution-script.js [--dry-run] [--phase=<number>]
 */

import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

// Configuration
const CONFIG = {
  dryRun: process.argv.includes('--dry-run'),
  phase: process.argv.find(arg => arg.startsWith('--phase='))?.split('=')[1] || 'all',
  rootDir: process.cwd(),
  backup: true
};

// File categories with target directories
const CATEGORIES = {
  docs: {
    target: 'docs',
    files: [
      'CLAUDE.md',
      'ARCHITECTURE_DESIGN.md',
      'AUTO_SETUP.md',
      'BACKLOG_PRIORITIZATION.md',
      'BREAKING_CHANGES_ANALYSIS.md',
      'BREAKING_CHANGE_ANALYSIS.md',
      'CLAUDE-DRAFT-COST-OPTIMIZATION.md',
      'CLEANUP_ARCHITECTURE_PLAN.md',
      'ENTERPRISE_COORDINATION_FINAL_REPORT.md',
      'EXECUTION_SUMMARY.md',
      'FINAL_ANALYSIS_SUMMARY.md',
      'FINAL_CLEANUP_ARCHITECTURE_REPORT.md',
      'HARDCODED_PATHS_ANALYSIS.md',
      'HYBRID_ROUTING_MVP_SUMMARY.md',
      'MIGRATION_EXECUTION_PLAN.md',
      'MIGRATION_PHASES_DETAILED.md',
      'README-CFN-COORDINATORS.md',
      'README-COORDINATORS.md',
      'ROOT_CLEANUP_ANALYSIS.md',
      'ROOT_CLEANUP_ANALYSIS_REPORT.md',
      'ROOT_CLEANUP_IMPLEMENTATION_PLAN.md',
      'STRUCTURED_CLEANUP_PLAN.md',
      'TEST_FIXES_SQLITE_ACL.md',
      'WEB_PORTAL_INSTALL.md',
      'ZAI_FORK_COMPATIBILITY_REPORT.md',
      'api-documentation.md',
      'api-structure.md',
      'claude-copy-to-main.md',
      'cleanup-execution-plan.md',
      'config_update_instructions.md',
      'coordination.md',
      'final-cleanup-deliverable.md',
      'memory-bank.md',
      'claude-soul.md',
      'risk-assessment-summary.md',
      'root-cleanup-analysis.md'
    ]
  },
  tests: {
    target: 'tests',
    files: [
      'advanced.test.js',
      'math.test.js',
      'test_quick_tool.test.js',
      'test-agent-compliance.js',
      'test-agent-with-zai.js',
      'test-signals.js',
      'test-runner.js',
      'test-runner.cjs',
      'quick-test.js',
      'validate-cfn-section4.mjs',
      'cleanup-verification-script.js',
      'test-fork-zai.js',
      'test-fork-zai-as-provider.js',
      'test-fork-zai-actual.js',
      'test-provider-routing.js',
      'test-zai-direct-call.js'
    ]
  },
  examples: {
    target: 'examples',
    files: [
      'example-usage.js',
      'middleware-examples.js',
      'route-examples.js',
      'spawn-workers.cjs',
      'spawn-workers-enterprise.js',
      'claude-flow.bat',
      'claude-flow.ps1'
    ]
  },
  data: {
    target: 'data',
    files: [
      'claude-flow.db',
      'coordinator-registry.db',
      'test-debug.db',
      'test-debug.db-shm',
      'test-debug.db-wal',
      'test-memory-acl.db',
      'test-memory-acl.db-shm',
      'test-memory-acl.db-wal'
    ]
  },
  temp: {
    target: 'temp',
    files: [
      'output.txt',
      'test.txt',
      'dev-server.pid',
      '.QuickTest'
    ]
  },
  logs: {
    target: 'logs',
    files: [
      'post-edit-pipeline.log'
    ]
  },
  testResults: {
    target: 'test-results',
    files: [
      'test-fifo-results.txt',
      'test-results.json',
      'test-results-converted.json',
      'test-results-final.json',
      'test-results-sprint-2.2.json'
    ]
  },
  config: {
    target: 'config',
    files: [
      'claude-flow.config.json'
    ]
  },
  vscode: {
    target: '.vscode',
    files: [
      'claude-flow-novice.code-workspace'
    ]
  }
};

// Essential files that stay in root
const ESSENTIAL_FILES = [
  'README.md',
  'LICENSE',
  'package.json',
  'package-lock.json',
  'package-scripts.json',
  'tsconfig.json',
  'tsconfig.base.json',
  '.swcrc',
  'jest.config.cjs',
  'vitest.config.ts',
  'turbo.json',
  '.env',
  '.env.keys',
  '.env.secure.template',
  '.dockerignore',
  '.gitignore',
  '.gitattributes',
  '.gitleaks.toml',
  '.mcp.json',
  '.npmignore',
  '.prettierignore',
  '.eslintignore',
  '.audit-ci.json',
  '.releaserc.json',
  'codecov.yml',
  'Dockerfile',
  'docker-compose.yml',
  'Dockerfile' // Keep this for container builds
];

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    dry: '🔍'
  }[type];
  
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function executeCommand(command, description) {
  if (CONFIG.dryRun) {
    log(`DRY RUN: Would execute "${command}"`, 'dry');
    return;
  }
  
  try {
    log(`Executing: ${description}`);
    execSync(command, { stdio: 'inherit' });
    log(`Completed: ${description}`, 'success');
  } catch (error) {
    log(`Failed: ${description} - ${error.message}`, 'error');
    throw error;
  }
}

function createBackup() {
  if (!CONFIG.backup) return;
  
  const backupDir = `../backup-${path.basename(CONFIG.rootDir)}-${Date.now()}`;
  log(`Creating backup in: ${backupDir}`);
  
  if (!CONFIG.dryRun) {
    fs.copySync(CONFIG.rootDir, backupDir);
    log(`Backup created successfully`, 'success');
  } else {
    log(`DRY RUN: Would create backup in: ${backupDir}`, 'dry');
  }
}

function createDirectories() {
  const directories = [
    'docs/architecture',
    'docs/setup', 
    'docs/planning',
    'docs/changelog',
    'docs/maintenance',
    'docs/reports',
    'docs/installation',
    'docs/api',
    'docs/guides',
    'docs/concepts',
    'tests/unit',
    'tests/integration',
    'tests/debug',
    'tests/utils',
    'tests/validation',
    'tests/maintenance',
    'examples/basic',
    'examples/middleware',
    'examples/routing',
    'examples/workers',
    'examples/scripts',
    'data',
    'test-results',
    'temp',
    'logs',
    '.vscode',
    'config'
  ];
  
  directories.forEach(dir => {
    const fullPath = path.join(CONFIG.rootDir, dir);
    if (!CONFIG.dryRun) {
      fs.ensureDirSync(fullPath);
    }
    log(`Created directory: ${dir}`, 'success');
  });
}

function moveFiles() {
  let movedCount = 0;
  
  Object.entries(CATEGORIES).forEach(([category, config]) => {
    config.files.forEach(file => {
      const sourcePath = path.join(CONFIG.rootDir, file);
      const targetPath = path.join(CONFIG.rootDir, config.target, file);
      
      if (!fs.existsSync(sourcePath)) {
        log(`File not found: ${file}`, 'warning');
        return;
      }
      
      if (CONFIG.dryRun) {
        log(`DRY RUN: Would move ${file} -> ${config.target}/${file}`, 'dry');
        movedCount++;
        return;
      }
      
      try {
        fs.moveSync(sourcePath, targetPath);
        log(`Moved: ${file} -> ${config.target}/${file}`, 'success');
        movedCount++;
      } catch (error) {
        log(`Failed to move ${file}: ${error.message}`, 'error');
      }
    });
  });
  
  return movedCount;
}

function updateIgnoreFiles() {
  const ignoreUpdates = {
    '.gitignore': [
      '# Migration additions',
      'data/',
      'temp/',
      'logs/',
      'test-results/',
      '.vscode/',
      '*.pid'
    ],
    '.eslintignore': [
      '# Migration additions',
      'data/',
      'temp/',
      'logs/',
      'test-results/'
    ],
    '.prettierignore': [
      '# Migration additions',
      'data/',
      'temp/',
      'logs/',
      'test-results/'
    ]
  };
  
  Object.entries(ignoreUpdates).forEach(([file, additions]) => {
    const filePath = path.join(CONFIG.rootDir, file);
    
    if (CONFIG.dryRun) {
      log(`DRY RUN: Would update ${file} with ignore patterns`, 'dry');
      return;
    }
    
    try {
      let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      additions.forEach(line => {
        if (!content.includes(line)) {
          content += `\n${line}`;
        }
      });
      fs.writeFileSync(filePath, content);
      log(`Updated: ${file}`, 'success');
    } catch (error) {
      log(`Failed to update ${file}: ${error.message}`, 'error');
    }
  });
}

function createEnvExample() {
  const sourcePath = path.join(CONFIG.rootDir, '.env.secure.template');
  const targetPath = path.join(CONFIG.rootDir, '.env.example');
  
  if (CONFIG.dryRun) {
    log(`DRY RUN: Would create .env.example from template`, 'dry');
    return;
  }
  
  if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
    try {
      fs.copySync(sourcePath, targetPath);
      log(`Created: .env.example`, 'success');
    } catch (error) {
      log(`Failed to create .env.example: ${error.message}`, 'error');
    }
  }
}

function validateMigration() {
  if (CONFIG.dryRun) {
    log(`DRY RUN: Would validate migration results`, 'dry');
    return;
  }
  
  const remainingFiles = fs.readdirSync(CONFIG.rootDir)
    .filter(file => fs.statSync(path.join(CONFIG.rootDir, file)).isFile())
    .filter(file => !file.startsWith('.'));
  
  const unexpectedFiles = remainingFiles.filter(file => !ESSENTIAL_FILES.includes(file));
  
  if (unexpectedFiles.length === 0) {
    log(`Migration validation passed! Root contains only essential files.`, 'success');
  } else {
    log(`Unexpected files remaining in root: ${unexpectedFiles.join(', ')}`, 'warning');
  }
  
  log(`Files remaining in root: ${remainingFiles.length}`);
  log(`Essential files expected: ${ESSENTIAL_FILES.length}`);
}

function runPhase(phaseNumber) {
  log(`Starting Phase ${phaseNumber}`);
  
  switch (phaseNumber) {
    case '1':
      createBackup();
      createDirectories();
      break;
    case '2':
      updateIgnoreFiles();
      createEnvExample();
      break;
    case '3':
      const movedCount = moveFiles();
      log(`Phase 3 completed: Moved ${movedCount} files`, 'success');
      break;
    case '4':
      validateMigration();
      break;
    case 'all':
      createBackup();
      createDirectories();
      updateIgnoreFiles();
      createEnvExample();
      const totalMoved = moveFiles();
      log(`Migration completed: Moved ${totalMoved} files`, 'success');
      validateMigration();
      break;
    default:
      log(`Invalid phase: ${phaseNumber}`, 'error');
      process.exit(1);
  }
}

// Main execution
function main() {
  log(`Starting Root Directory Migration`);
  log(`Mode: ${CONFIG.dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  log(`Phase: ${CONFIG.phase}`);
  log(`Root Directory: ${CONFIG.rootDir}`);
  
  try {
    runPhase(CONFIG.phase);
    log(`Migration completed successfully!`, 'success');
  } catch (error) {
    log(`Migration failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, CONFIG, CATEGORIES, ESSENTIAL_FILES };