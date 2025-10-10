#!/usr/bin/env node

/**
 * Direct test of swarm executor functionality
 */

import { executeSwarm } from './src/cli/simple-commands/swarm-executor.js';

console.log('🧪 Direct Swarm Executor Test');

const objective = "Create a simple REST API with user authentication";
const flags = {
  executor: true,
  'output-format': 'json',
  'max-agents': '3',
  verbose: true,
  strategy: 'development',
  mode: 'centralized'
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