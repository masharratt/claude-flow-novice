#!/usr/bin/env node

/**
 * Installation Verification Script
 *
 * Verifies that the package has been installed correctly
 * and all necessary files are in place.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Detect CI environment
const isCI = process.env.CI === 'true' || process.env.CI === '1';

console.log('🔍 Verifying Claude Flow Novice installation...');
if (isCI) {
  console.log('ℹ️  CI environment detected - dist directory checks will be optional');
}

const checks = [
  {
    name: 'Main entry point',
    check: () => fs.existsSync(path.join(projectRoot, '.claude-flow-novice/dist/src/index.js')),
    optional: isCI
  },
  {
    name: 'Type declarations',
    check: () => fs.existsSync(path.join(projectRoot, '.claude-flow-novice/dist/src/index.d.ts')),
    optional: isCI
  },
  {
    name: 'CLI entry point',
    check: () => fs.existsSync(path.join(projectRoot, '.claude-flow-novice/dist/src/cli/index.js')),
    optional: isCI
  },
  {
    name: 'Agent configurations',
    check: () => fs.existsSync(path.join(projectRoot, '.claude-flow-novice/.claude/agents')),
    optional: false
  },
  {
    name: 'MCP server',
    check: () => fs.existsSync(path.join(projectRoot, '.claude-flow-novice/dist/src/mcp/mcp-server.js')),
    optional: isCI
  },
  {
    name: 'Configuration files',
    check: () => fs.existsSync(path.join(projectRoot, 'config')),
    optional: false
  },
  {
    name: 'CLI commands',
    check: () => fs.existsSync(path.join(projectRoot, '.claude/commands')),
    optional: false
  }
];

let allPassed = true;
let hasWarnings = false;

checks.forEach(({ name, check, optional }) => {
  try {
    const passed = check();
    if (passed) {
      console.log(`✅ ${name}`);
    } else {
      if (optional) {
        console.log(`⚠️  ${name} - Missing (optional in CI)`);
        hasWarnings = true;
      } else {
        console.log(`❌ ${name} - Missing`);
        allPassed = false;
      }
    }
  } catch (error) {
    if (optional) {
      console.log(`⚠️  ${name} - Error: ${error.message} (optional in CI)`);
      hasWarnings = true;
    } else {
      console.log(`❌ ${name} - Error: ${error.message}`);
      allPassed = false;
    }
  }
});

if (allPassed) {
  if (hasWarnings && isCI) {
    console.log('\n✅ Installation verified successfully (with CI warnings)!');
    console.log('ℹ️  Some optional components are missing - this is expected during CI builds.');
    console.log('   These will be built when the build script runs.');
  } else {
    console.log('\n🎉 Installation verified successfully!');
  }
  console.log('\n📚 Getting Started:');
  console.log('  npx claude-flow-novice --help');
  console.log('  npx claude-flow-novice status');
  console.log('\n📖 Documentation: https://github.com/masharratt/claude-flow-novice#readme');
} else {
  console.log('\n⚠️  Installation verification failed.');
  console.log('Some required components are missing. Please try reinstalling:');
  console.log('  npm uninstall claude-flow-novice');
  console.log('  npm install claude-flow-novice');
  console.log('\nIf issues persist, please report them at:');
  console.log('  https://github.com/masharratt/claude-flow-novice/issues');
  process.exit(1);
}