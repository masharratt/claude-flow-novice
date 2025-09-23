#!/usr/bin/env node

/**
 * Claude Flow Novice Binary
 * Entry point for the CLI
 */

import('../dist/cli/main.js').catch(error => {
  console.error('Failed to start Claude Flow Novice:', error);
  process.exit(1);
});