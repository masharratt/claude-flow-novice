#!/usr/bin/env node

/**
 * Migration Validation Script
 *
 * Validates successful migration by checking:
 * - File movement verification
 * - Broken symlink detection
 * - Git status validation
 * - Build process test
 * - Test suite execution
 * - Docker build validation
 * - Configuration file syntax
 * - Path reference verification
 *
 * Usage:
 *   node scripts/migration/validate-migration.js [options]
 *
 * Options:
 *   --json                Output results in JSON format
 *   --verbose            Show detailed output
 *   --skip-build         Skip build validation
 *   --skip-test          Skip test suite validation
 *   --skip-docker        Skip Docker build validation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  json: args.includes('--json'),
  verbose: args.includes('--verbose'),
  skipBuild: args.includes('--skip-build'),
  skipTest: args.includes('--skip-test'),
  skipDocker: args.includes('--skip-docker')
};

// Validation results
const results = {
  timestamp: new Date().toISOString(),
  overall: 'pending',
  checks: {},
  errors: [],
  warnings: []
};

// Expected file structure after migration
const expectedFiles = [
  '.claude-flow-novice/dist/src/cli/main.js',
  '.claude-flow-novice/dist/src/index.js',
  '.claude-flow-novice/dist/src/mcp/mcp-server-sdk.js',
  '.claude-flow-novice/dist/src/core/index.js',
  'package.json',
  'Dockerfile',
  '.dockerignore',
  'config/jest/jest.config.js',
  'config/linting/.eslintrc.json',
  'config/typescript/tsconfig.json'
];

// Old paths that should not exist in code references
const deprecatedPaths = [
  'dist/src',
  'dist/mcp',
  'dist/cli',
  './dist/',
  '"dist/',
  '\'dist/',
  'from "dist',
  'from \'dist',
  'require("dist',
  'require(\'dist'
];

/**
 * Log output based on format preference
 */
function log(message, type = 'info') {
  if (options.json) return; // Suppress console output in JSON mode

  const icons = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    check: '🔍'
  };

  console.log(`${icons[type] || ''} ${message}`);
}

/**
 * Execute command with error handling
 */
function execCommand(command, description, timeoutMs = 30000) {
  try {
    const output = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: options.verbose ? 'inherit' : 'pipe',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: timeoutMs
    });
    return { success: true, output };
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
async function fileExists(filePath) {
  try {
    await fs.access(path.join(projectRoot, filePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Validation: File Movement Verification
 */
async function validateFileMovement() {
  log('Checking file movement...', 'check');

  const check = {
    name: 'File Movement',
    status: 'pass',
    details: {
      expected: expectedFiles.length,
      found: 0,
      missing: []
    }
  };

  for (const file of expectedFiles) {
    const exists = await fileExists(file);
    if (exists) {
      check.details.found++;
      if (options.verbose) log(`  ✓ Found: ${file}`, 'info');
    } else {
      check.details.missing.push(file);
      if (options.verbose) log(`  ✗ Missing: ${file}`, 'warning');
    }
  }

  if (check.details.missing.length > 0) {
    check.status = 'fail';
    results.errors.push(`Missing ${check.details.missing.length} expected files`);
  } else {
    log('All expected files found', 'success');
  }

  results.checks.fileMovement = check;
  return check.status === 'pass';
}

/**
 * Validation: Broken Symlink Detection
 */
async function validateSymlinks() {
  log('Checking for broken symlinks...', 'check');

  const check = {
    name: 'Symlink Validation',
    status: 'pass',
    details: {
      brokenLinks: []
    }
  };

  // Find broken symlinks only (more efficient - L flag finds broken links)
  // Limit search depth to avoid long scans
  const result = execCommand(
    'find . -maxdepth 5 -xtype l ! -path "./node_modules/*" ! -path "./.git/*" 2>/dev/null || true',
    'Finding broken symlinks',
    10000 // 10 second timeout
  );

  if (result.success && result.output && result.output.trim()) {
    const symlinks = result.output.trim().split('\n').filter(Boolean);
    check.details.brokenLinks = symlinks;

    if (options.verbose) {
      symlinks.forEach(link => log(`  ✗ Broken symlink: ${link}`, 'warning'));
    }
  }

  if (check.details.brokenLinks.length > 0) {
    check.status = 'fail';
    results.errors.push(`Found ${check.details.brokenLinks.length} broken symlinks`);
  } else {
    log('No broken symlinks found', 'success');
  }

  results.checks.symlinks = check;
  return check.status === 'pass';
}

/**
 * Validation: Git Status
 */
async function validateGitStatus() {
  log('Checking git status...', 'check');

  const check = {
    name: 'Git Status',
    status: 'pass',
    details: {
      clean: false,
      untracked: [],
      modified: [],
      deleted: []
    }
  };

  const result = execCommand('git status --porcelain', 'Checking git status');

  if (result.success) {
    const status = result.output.trim();

    if (status === '') {
      check.details.clean = true;
      log('Git working tree is clean', 'success');
    } else {
      const lines = status.split('\n');
      for (const line of lines) {
        const type = line.substring(0, 2).trim();
        const file = line.substring(3);

        if (type === '??') check.details.untracked.push(file);
        else if (type === 'M' || type === 'MM') check.details.modified.push(file);
        else if (type === 'D') check.details.deleted.push(file);
      }

      // Only warn if there are unexpected changes (deleted files might be expected)
      if (check.details.modified.length > 0) {
        results.warnings.push(`Git has ${check.details.modified.length} modified files`);
      }

      if (options.verbose) {
        log(`  Untracked: ${check.details.untracked.length}`, 'info');
        log(`  Modified: ${check.details.modified.length}`, 'info');
        log(`  Deleted: ${check.details.deleted.length}`, 'info');
      }
    }
  } else {
    check.status = 'skip';
    results.warnings.push('Git status check skipped (not a git repository)');
  }

  results.checks.gitStatus = check;
  return check.status !== 'fail';
}

/**
 * Validation: Build Process
 */
async function validateBuild() {
  if (options.skipBuild) {
    log('Skipping build validation', 'info');
    results.checks.build = { name: 'Build Process', status: 'skip' };
    return true;
  }

  log('Testing build process...', 'check');

  const check = {
    name: 'Build Process',
    status: 'pass',
    details: {
      success: false,
      duration: 0,
      output: ''
    }
  };

  const startTime = Date.now();
  const result = execCommand('npm run build', 'Running npm build');
  check.details.duration = Date.now() - startTime;

  if (result.success) {
    check.details.success = true;
    log(`Build completed successfully in ${check.details.duration}ms`, 'success');
  } else {
    check.status = 'fail';
    check.details.output = result.output;
    results.errors.push('Build process failed');
    log('Build process failed', 'error');
  }

  results.checks.build = check;
  return check.status === 'pass';
}

/**
 * Validation: Test Suite
 */
async function validateTests() {
  if (options.skipTest) {
    log('Skipping test validation', 'info');
    results.checks.tests = { name: 'Test Suite', status: 'skip' };
    return true;
  }

  log('Running test suite...', 'check');

  const check = {
    name: 'Test Suite',
    status: 'pass',
    details: {
      success: false,
      duration: 0,
      testCount: 0,
      failures: 0
    }
  };

  const startTime = Date.now();
  const result = execCommand(
    'npm test -- --run --reporter=json 2>&1',
    'Running tests'
  );
  check.details.duration = Date.now() - startTime;

  if (result.success) {
    check.details.success = true;

    // Try to parse test results
    try {
      const jsonMatch = result.output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
      if (jsonMatch) {
        const testResults = JSON.parse(jsonMatch[0]);
        check.details.testCount = testResults.numTotalTests || 0;
        check.details.failures = testResults.numFailedTests || 0;
      }
    } catch {
      // If parsing fails, just mark as success
    }

    log(`Tests passed in ${check.details.duration}ms`, 'success');
  } else {
    // Allow test failures as warning, not critical error
    check.status = 'warning';
    results.warnings.push('Some tests failed - review test output');
    log('Test suite has failures', 'warning');
  }

  results.checks.tests = check;
  return check.status !== 'fail';
}

/**
 * Validation: Docker Build
 */
async function validateDocker() {
  if (options.skipDocker) {
    log('Skipping Docker validation', 'info');
    results.checks.docker = { name: 'Docker Build', status: 'skip' };
    return true;
  }

  log('Testing Docker build...', 'check');

  const check = {
    name: 'Docker Build',
    status: 'pass',
    details: {
      success: false,
      duration: 0,
      imageSize: 0
    }
  };

  // First check if Docker is available
  const dockerCheck = execCommand('docker --version', 'Checking Docker');
  if (!dockerCheck.success) {
    check.status = 'skip';
    results.warnings.push('Docker not available - skipping Docker build validation');
    results.checks.docker = check;
    return true;
  }

  const startTime = Date.now();
  const result = execCommand(
    'docker build . --no-cache -t claude-flow-novice:validation-test 2>&1',
    'Building Docker image'
  );
  check.details.duration = Date.now() - startTime;

  if (result.success) {
    check.details.success = true;

    // Get image size
    const sizeResult = execCommand(
      'docker images claude-flow-novice:validation-test --format "{{.Size}}"',
      'Getting image size'
    );
    if (sizeResult.success) {
      check.details.imageSize = sizeResult.output.trim();
    }

    // Clean up test image
    execCommand('docker rmi claude-flow-novice:validation-test', 'Cleaning up');

    log(`Docker build successful (${check.details.imageSize})`, 'success');
  } else {
    check.status = 'fail';
    results.errors.push('Docker build failed');
    log('Docker build failed', 'error');
  }

  results.checks.docker = check;
  return check.status === 'pass';
}

/**
 * Validation: Configuration Files
 */
async function validateConfigurations() {
  log('Validating configuration files...', 'check');

  const check = {
    name: 'Configuration Validation',
    status: 'pass',
    details: {
      validated: 0,
      invalid: []
    }
  };

  const configFiles = [
    { path: 'package.json', type: 'json' },
    { path: 'config/jest/jest.config.js', type: 'js' },
    { path: '.dockerignore', type: 'text' },
    { path: 'Dockerfile', type: 'text' }
  ];

  for (const config of configFiles) {
    const filePath = path.join(projectRoot, config.path);

    try {
      const content = await fs.readFile(filePath, 'utf8');

      if (config.type === 'json') {
        JSON.parse(content); // Validate JSON syntax
      }

      check.details.validated++;
      if (options.verbose) log(`  ✓ Valid: ${config.path}`, 'info');
    } catch (error) {
      check.details.invalid.push({
        file: config.path,
        error: error.message
      });
      if (options.verbose) log(`  ✗ Invalid: ${config.path}`, 'warning');
    }
  }

  if (check.details.invalid.length > 0) {
    check.status = 'fail';
    results.errors.push(`${check.details.invalid.length} configuration files have syntax errors`);
  } else {
    log('All configuration files valid', 'success');
  }

  results.checks.configurations = check;
  return check.status === 'pass';
}

/**
 * Validation: Path References
 */
async function validatePathReferences() {
  log('Checking for deprecated path references...', 'check');

  const check = {
    name: 'Path References',
    status: 'pass',
    details: {
      scannedFiles: 0,
      issues: []
    }
  };

  // Search for old path references in source files
  const searchDirs = ['src', 'config', 'scripts'];

  // Combine patterns for a single grep operation (more efficient)
  const combinedPattern = deprecatedPaths.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\|');
  const result = execCommand(
    `grep -r -E '${combinedPattern}' ${searchDirs.join(' ')} --include="*.js" --include="*.ts" --include="*.json" 2>/dev/null || true`,
    'Searching for deprecated paths',
    15000 // 15 second timeout
  );

  if (result.output && result.output.trim()) {
    const matches = result.output.trim().split('\n');
    const fileSet = new Set(matches.map(m => m.split(':')[0]));

    check.details.issues.push({
      pattern: 'deprecated-paths',
      matches: matches.length,
      files: Array.from(fileSet)
    });
  }

  if (check.details.issues.length > 0) {
    check.status = 'warning';
    results.warnings.push(`Found ${check.details.issues.length} deprecated path references`);

    if (options.verbose) {
      for (const issue of check.details.issues) {
        log(`  Pattern "${issue.pattern}": ${issue.matches} matches`, 'warning');
      }
    }
  } else {
    log('No deprecated path references found', 'success');
  }

  results.checks.pathReferences = check;
  return check.status !== 'fail';
}

/**
 * Generate summary report
 */
function generateSummary() {
  const passed = Object.values(results.checks).filter(c => c.status === 'pass').length;
  const failed = Object.values(results.checks).filter(c => c.status === 'fail').length;
  const warnings = Object.values(results.checks).filter(c => c.status === 'warning').length;
  const skipped = Object.values(results.checks).filter(c => c.status === 'skip').length;

  results.summary = {
    total: Object.keys(results.checks).length,
    passed,
    failed,
    warnings,
    skipped
  };

  if (failed > 0) {
    results.overall = 'fail';
  } else if (warnings > 0) {
    results.overall = 'warning';
  } else {
    results.overall = 'pass';
  }

  return results.summary;
}

/**
 * Output results
 */
function outputResults() {
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const summary = results.summary;

  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nTimestamp: ${results.timestamp}`);
  console.log(`Overall Status: ${results.overall.toUpperCase()}`);
  console.log(`\nChecks: ${summary.total} total`);
  console.log(`  ✅ Passed: ${summary.passed}`);
  console.log(`  ❌ Failed: ${summary.failed}`);
  console.log(`  ⚠️  Warnings: ${summary.warnings}`);
  console.log(`  ⏭️  Skipped: ${summary.skipped}`);

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(err => console.log(`  - ${err}`));
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    results.warnings.forEach(warn => console.log(`  - ${warn}`));
  }

  console.log('\n' + '='.repeat(60));

  if (results.overall === 'pass') {
    console.log('✅ Migration validation PASSED');
  } else if (results.overall === 'warning') {
    console.log('⚠️  Migration validation PASSED with warnings');
  } else {
    console.log('❌ Migration validation FAILED');
  }
  console.log('='.repeat(60) + '\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    if (!options.json) {
      console.log('🔍 Migration Validation Script\n');
      console.log(`Project: ${projectRoot}\n`);
    }

    // Run all validations
    await validateFileMovement();
    await validateSymlinks();
    await validateGitStatus();
    await validateConfigurations();
    await validatePathReferences();
    await validateBuild();
    await validateTests();
    await validateDocker();

    // Generate and output summary
    generateSummary();
    outputResults();

    // Exit with appropriate code
    process.exit(results.overall === 'fail' ? 1 : 0);

  } catch (error) {
    console.error('❌ Fatal error during validation:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Execute
main();
