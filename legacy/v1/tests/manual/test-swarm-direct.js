#!/usr/bin/env node

/**
 * Direct test of swarm executor functionality
 */

import { executeSwarm } from '../../src/cli/simple-commands/swarm-executor.js';

console.log('🧪 Direct Swarm Executor Test');

// Parse CLI arguments
const args = process.argv.slice(2);
const objective = args.find(arg => !arg.startsWith('--')) || "Create a simple REST API with user authentication";
const flags = {
  executor: args.includes('--executor'),
  'output-format': 'json',
  'max-agents': args.find(arg => arg.startsWith('--max-agents'))?.split('=')[1] || '3',
  verbose: true,
  strategy: args.find(arg => arg.startsWith('--strategy'))?.split('=')[1] || 'development',
  mode: args.find(arg => arg.startsWith('--mode'))?.split('=')[1] || 'mesh'
};

console.log('📋 Objective:', objective);
console.log('🚩 Flags:', flags);
console.log('');

try {
  const result = await executeSwarm(objective, flags);
  console.log('✅ Swarm execution completed!');
  console.log('📊 Result:', JSON.stringify(result, null, 2));
} catch (error) {
  console.error('❌ Swarm execution failed:', error.message);
  console.error('Stack:', error.stack);
}