#!/usr/bin/env node

/**
 * Fix ES module compatibility issues in test files
 */

import { runTestMigrationFixer } from '../src/config/test-migration-fixer.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  console.log('🚀 Running test file ES module migration...\n');

  try {
    await runTestMigrationFixer(projectRoot);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();