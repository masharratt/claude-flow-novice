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

console.log('🔍 Verifying Claude Flow Novice installation...');

const checks = [
  {
    name: 'Main entry point',
    check: () => fs.existsSync(path.join(projectRoot, '.claude-flow-novice/dist/index.js'))
  },
  {
    name: 'Type declarations',
    check: () => fs.existsSync(path.join(projectRoot, '.claude-flow-novice/dist/index.d.ts'))
  },
  {
    name: 'CLI entry point',
    check: () => fs.existsSync(path.join(projectRoot, '.claude-flow-novice/dist/src/cli/main.js'))
  },
  {
    name: 'Agent configurations',
    check: () => fs.existsSync(path.join(projectRoot, '.claude-flow-novice/.claude/agents'))
  },
  {
    name: 'MCP server',
    check: () => fs.existsSync(path.join(projectRoot, '.claude-flow-novice/dist/mcp/mcp-server-sdk.js'))
  },
  {
    name: 'Configuration files',
    check: () => fs.existsSync(path.join(projectRoot, 'config'))
  },
  {
    name: 'CLI commands',
    check: () => fs.existsSync(path.join(projectRoot, '.claude/commands'))
  }
];

let allPassed = true;

checks.forEach(({ name, check }) => {
  try {
    const passed = check();
    if (passed) {
      console.log(`✅ ${name}`);
    } else {
      console.log(`❌ ${name} - Missing`);
      allPassed = false;
    }
  } catch (error) {
    console.log(`❌ ${name} - Error: ${error.message}`);
    allPassed = false;
  }
});

if (allPassed) {
  console.log('\n🎉 Installation verified successfully!');
  console.log('\n📚 Getting Started:');
  console.log('  npx claude-flow-novice --help');
  console.log('  npx claude-flow-novice status');
  console.log('\n📖 Documentation: https://github.com/masharratt/claude-flow-novice#readme');
} else {
  console.log('\n⚠️  Installation verification failed.');
  console.log('Some components may be missing. Please try reinstalling:');
  console.log('  npm uninstall claude-flow-novice');
  console.log('  npm install claude-flow-novice');
  console.log('\nIf issues persist, please report them at:');
  console.log('  https://github.com/masharratt/claude-flow-novice/issues');
  process.exit(1);
}