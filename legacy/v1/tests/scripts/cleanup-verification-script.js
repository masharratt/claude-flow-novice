#!/usr/bin/env node

/**
 * Root Directory Cleanup Verification Script
 * Validates that no critical functionality is broken after file moves
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Root Directory Cleanup Verification\n');

// Critical files that must remain in root
const criticalRootFiles = [
  'package.json',
  'package-lock.json', 
  'README.md',
  'CLAUDE.md',
  'LICENSE',
  '.gitignore',
  'tsconfig.json',
  'vitest.config.ts',
  'docker-compose.yml',
  'Dockerfile',
  'quick-test.js'
];

// Expected directory structure
const expectedDirs = [
  'config',
  'docs', 
  'tests',
  'examples',
  'scripts',
  'data',
  'temp'
];

// Files that should be moved (sample)
const expectedMovedFiles = {
  'config/': [
    '.env',
    '.env.keys',
    'jest.config.cjs',
    'turbo.json'
  ],
  'docs/': [
    'ACE_NPM_INTEGRATION_COMPLETE.md',
    'AGENT_SYNC_DOCUMENTATION.md',
    'api-documentation.md'
  ],
  'tests/': [
    'advanced.test.js',
    'math.test.js',
    'test-agent-compliance.js'
  ]
};

function checkCriticalFiles() {
  console.log('📋 Checking critical root files...');
  let missing = [];
  
  criticalRootFiles.forEach(file => {
    if (fs.existsSync(file)) {
      console.log(`  ✅ ${file}`);
    } else {
      console.log(`  ❌ ${file} - MISSING!`);
      missing.push(file);
    }
  });
  
  if (missing.length === 0) {
    console.log('✅ All critical root files present\n');
  } else {
    console.log(`❌ ${missing.length} critical files missing!\n`);
  }
  
  return missing.length === 0;
}

function checkDirectoryStructure() {
  console.log('📁 Checking expected directory structure...');
  
  expectedDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      console.log(`  ✅ ${dir}/`);
    } else {
      console.log(`  ❌ ${dir}/ - MISSING!`);
    }
  });
  console.log('');
}

function checkMovedFiles() {
  console.log('📦 Checking moved files location...');
  
  Object.keys(expectedMovedFiles).forEach(dir => {
    console.log(`  Checking ${dir}:`);
    expectedMovedFiles[dir].forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.existsSync(fullPath)) {
        console.log(`    ✅ ${file}`);
      } else {
        console.log(`    ❌ ${file} - NOT FOUND in ${dir}`);
      }
    });
  });
  console.log('');
}

function checkImportPaths() {
  console.log('🔗 Checking for potential import issues...');
  
  // Check package.json scripts for hardcoded paths
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    console.log('  Package.json scripts:');
    Object.keys(packageJson.scripts || {}).forEach(script => {
      console.log(`    ${script}: ${packageJson.scripts[script]}`);
    });
  } catch (err) {
    console.log('  ❌ Could not read package.json');
  }
  console.log('');
}

function checkGitStatus() {
  console.log('📊 Git status check...');
  
  try {
    const { execSync } = require('child_process');
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    const lines = status.trim().split('\n').filter(line => line.trim());
    
    if (lines.length > 0) {
      console.log(`  ⚠️  ${lines.length} files have changes:`);
      lines.slice(0, 10).forEach(line => {
        console.log(`    ${line}`);
      });
      if (lines.length > 10) {
        console.log(`    ... and ${lines.length - 10} more`);
      }
    } else {
      console.log('  ✅ No uncommitted changes');
    }
  } catch (err) {
    console.log('  ❌ Could not check git status');
  }
  console.log('');
}

// Run all checks
console.log('='.repeat(50));
const criticalOk = checkCriticalFiles();
checkDirectoryStructure();
checkMovedFiles();
checkImportPaths();
checkGitStatus();

console.log('='.repeat(50));
if (criticalOk) {
  console.log('✅ CRITICAL FILES VERIFICATION PASSED');
  console.log('📝 Review the output above for any issues');
} else {
  console.log('❌ CRITICAL FILES MISSING - DO NOT PROCEED');
}
console.log('='.repeat(50));