#!/usr/bin/env node

/**
 * Test script for swarm functionality
 */

import { swarmCommand } from './src/cli/simple-commands/swarm.js';

// Parse command line arguments properly
const args = [];
const flags = {};

// Skip first two arguments (node and script name)
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const flagName = arg.substring(2);
    const nextArg = process.argv[i + 1];

    if (nextArg && !nextArg.startsWith('--')) {
      flags[flagName] = nextArg;
      i++; // Skip the next argument
    } else {
      flags[flagName] = true;
    }
  } else {
    args.push(arg);
  }
}

console.log('🧪 Testing Swarm Functionality');
console.log('Args:', args);
console.log('Flags:', flags);
console.log('');

// Execute the swarm command
try {
  await swarmCommand(args, flags);
} catch (error) {
  console.error('❌ Swarm execution failed:', error.message);
  console.error(error.stack);
}