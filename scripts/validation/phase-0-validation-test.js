#!/usr/bin/env node

/**
 * Phase 0 Validation Swarm Test
 */

import { executeSwarm } from './src/cli/simple-commands/swarm-executor.js';

console.log('🔍 Phase 0 Validation Swarm Test');

const objective = "Phase 0: MCP-Less Foundation Validation - Validate Redis-backed swarm state persistence, CLI execution, interruption recovery, and agent coordination through Redis pub/sub messaging";
const flags = {
  executor: true,
  'output-format': 'json',
  'max-agents': '5',
  verbose: true,
  strategy: 'validation',
  mode: 'mesh',
  persistence: true
};

console.log('📋 Objective:', objective);
console.log('🚩 Flags:', flags);
console.log('');

try {
  const result = await executeSwarm(objective, flags);
  console.log('✅ Phase 0 validation completed!');
  console.log('📊 Result:', JSON.stringify(result, null, 2));

  // Store validation results in Redis
  const redis = await import('redis');
  const client = redis.createClient();
  await client.connect();

  await client.setEx('phase-0-validation:result', 3600, JSON.stringify({
    timestamp: new Date().toISOString(),
    objective,
    result,
    status: 'completed'
  }));

  await client.quit();
  console.log('📝 Validation results stored in Redis');

} catch (error) {
  console.error('❌ Phase 0 validation failed:', error.message);
  console.error('Stack:', error.stack);

  // Store error in Redis
  const redis = await import('redis');
  const client = redis.createClient();
  await client.connect();

  await client.setEx('phase-0-validation:error', 3600, JSON.stringify({
    timestamp: new Date().toISOString(),
    objective,
    error: error.message,
    stack: error.stack,
    status: 'failed'
  }));

  await client.quit();
  console.log('📝 Validation error stored in Redis');
}