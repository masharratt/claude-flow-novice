#!/usr/bin/env node

/**
 * Phase 4 CLI Entry Point
 * Command-line interface for Phase 4 feature flag deployment
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Handle ES module imports
async function main() {
  try {
    // Dynamic import to handle ES modules
    const { default: createCLI } = await import('../src/feature-flags/cli/Phase4CLI.js');

    const cli = createCLI();
    cli.run();
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('❌ Phase 4 CLI module not found. Please ensure the project is built:');
      console.error('   npm run build');
      process.exit(1);
    } else {
      console.error('❌ Failed to start Phase 4 CLI:', error.message);
      process.exit(1);
    }
  }
}

main();