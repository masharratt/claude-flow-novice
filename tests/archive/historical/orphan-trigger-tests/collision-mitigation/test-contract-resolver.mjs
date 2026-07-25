#!/usr/bin/env node
/**
 * Test resolver for environment-contract.ts integration testing
 *
 * Usage:
 *   node test-contract-resolver.mjs <varName> <mode>
 *
 * Example:
 *   node test-contract-resolver.mjs redis_host cli
 *   node test-contract-resolver.mjs redis_host trigger
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { cwd } from 'process';

// Get project root
const projectRoot = cwd();

// Import the compiled JavaScript
const { getEnvValue } = await import(resolve(projectRoot, 'dist/lib/environment-contract.js'));

// Get arguments
const varName = process.argv[2];
const mode = process.argv[3];

if (!varName || !mode) {
  console.error('Usage: node test-contract-resolver.mjs <varName> <mode>');
  process.exit(1);
}

if (mode !== 'cli' && mode !== 'trigger') {
  console.error('Mode must be "cli" or "trigger"');
  process.exit(1);
}

try {
  // Resolve the environment value using production code
  const result = getEnvValue(varName, mode);
  console.log(result);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
