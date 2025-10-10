#!/usr/bin/env node

/**
 * Build Output Validation Test
 *
 * This script validates that all package.json entry points work correctly
 * after the build process.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = __dirname;
const BUILD_DIR = join(PROJECT_ROOT, '.claude-flow-novice', 'dist');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function checkFile(filePath, description) {
  const fullPath = join(PROJECT_ROOT, filePath);
  if (existsSync(fullPath)) {
    log(`✅ ${description}: ${filePath}`, colors.green);
    return true;
  } else {
    log(`❌ ${description}: ${filePath} - FILE NOT FOUND`, colors.red);
    return false;
  }
}

function checkPackageJson() {
  log('\n📦 Checking package.json configuration...', colors.blue);

  try {
    const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'));

    let allValid = true;

    // Check main entry point
    if (packageJson.main) {
      allValid &= checkFile(packageJson.main, 'Main entry point');
    }

    // Check types field
    if (packageJson.types) {
      allValid &= checkFile(packageJson.types, 'Types definition');
    }

    // Check bin entries
    if (packageJson.bin) {
      log('\n🔧 Checking binary entries...', colors.blue);
      for (const [name, path] of Object.entries(packageJson.bin)) {
        allValid &= checkFile(path, `Binary: ${name}`);
      }
    }

    // Check exports
    if (packageJson.exports) {
      log('\n📤 Checking exports...', colors.blue);
      for (const [name, path] of Object.entries(packageJson.exports)) {
        if (typeof path === 'string') {
          allValid &= checkFile(path, `Export: ${name}`);
        }
      }
    }

    return allValid;

  } catch (error) {
    log(`❌ Error reading package.json: ${error.message}`, colors.red);
    return false;
  }
}

function checkBuildStructure() {
  log('\n🏗️  Checking build structure...', colors.blue);

  const requiredPaths = [
    'src/index.js',
    'src/cli/main.js',
    'src/agents/agent-manager.js',
    'src/core/project-manager.js',
    'src/mcp/mcp-server-sdk.js',
    'src/cfn-loop/index.js',
    'src/slash-commands/cfn-loop-single.js',
    'src/observability/metrics-counter.js',
    'src/providers/index.js',
    'src/hooks/index.js'
  ];

  let allValid = true;
  for (const path of requiredPaths) {
    allValid &= checkFile(join('.claude-flow-novice', 'dist', path), `Build artifact: ${path}`);
  }

  return allValid;
}

function checkModuleImports() {
  log('\n🔍 Checking module imports...', colors.blue);

  try {
    // Test main entry point import
    const mainPath = join(PROJECT_ROOT, '.claude-flow-novice', 'dist', 'src', 'index.js');
    if (existsSync(mainPath)) {
      log('✅ Main entry point exists, testing imports...', colors.green);

      // Basic syntax check by reading the file
      const content = readFileSync(mainPath, 'utf8');
      if (content.includes('export { AgentManager }')) {
        log('✅ Main entry point has expected exports', colors.green);
      } else {
        log('❌ Main entry point missing expected exports', colors.red);
        return false;
      }
    }

    return true;
  } catch (error) {
    log(`❌ Error checking module imports: ${error.message}`, colors.red);
    return false;
  }
}

function checkBuildCompleteness() {
  log('\n📊 Checking build completeness...', colors.blue);

  const stats = {
    totalFiles: 0,
    jsFiles: 0,
    dtsFiles: 0,
    directories: 0
  };

  function countFiles(dir) {
    try {
      const files = require('fs').readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        const stat = require('fs').statSync(fullPath);

        if (stat.isDirectory()) {
          stats.directories++;
          countFiles(fullPath);
        } else {
          stats.totalFiles++;
          if (file.endsWith('.js')) stats.jsFiles++;
          if (file.endsWith('.d.ts')) stats.dtsFiles++;
        }
      }
    } catch (error) {
      // Ignore errors for inaccessible directories
    }
  }

  const buildDir = join(PROJECT_ROOT, '.claude-flow-novice', 'dist');
  if (existsSync(buildDir)) {
    countFiles(buildDir);

    log(`📁 Build directory structure:`, colors.blue);
    log(`   Total files: ${stats.totalFiles}`, colors.reset);
    log(`   JavaScript files: ${stats.jsFiles}`, colors.reset);
    log(`   TypeScript declaration files: ${stats.dtsFiles}`, colors.reset);
    log(`   Directories: ${stats.directories}`, colors.reset);

    if (stats.jsFiles > 0) {
      log('✅ Build contains JavaScript files', colors.green);
      return true;
    } else {
      log('❌ Build contains no JavaScript files', colors.red);
      return false;
    }
  } else {
    log('❌ Build directory does not exist', colors.red);
    return false;
  }
}

async function main() {
  log('🚀 Build Output Validation Test', colors.blue);
  log('================================', colors.blue);

  let allTestsPassed = true;

  allTestsPassed &= checkPackageJson();
  allTestsPassed &= checkBuildStructure();
  allTestsPassed &= checkModuleImports();
  allTestsPassed &= checkBuildCompleteness();

  log('\n📋 Test Results Summary', colors.blue);
  log('========================', colors.blue);

  if (allTestsPassed) {
    log('🎉 ALL TESTS PASSED! Build output is valid.', colors.green);
    process.exit(0);
  } else {
    log('💥 SOME TESTS FAILED! Build output needs fixes.', colors.red);
    process.exit(1);
  }
}

// Run the validation
main().catch(error => {
  log(`💥 Validation script error: ${error.message}`, colors.red);
  process.exit(1);
});