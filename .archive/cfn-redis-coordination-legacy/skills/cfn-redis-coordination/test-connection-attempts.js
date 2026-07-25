#!/usr/bin/env node

/**
 * Test to detect connection attempts during mode detection
 */

// Track network activity
let redisImportAttempts = 0;
let connectionAttempts = 0;

// Intercept require to track Redis module usage
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === 'ioredis') {
    redisImportAttempts++;
    console.log(`🔍 Redis module import attempt #${redisImportAttempts}`);
  }
  return originalRequire.apply(this, arguments);
};

async function testConnectionAttempts() {
  console.log('🔍 Testing Connection Attempts in Task Mode');
  console.log('='.repeat(50));

  // Test 1: Mode detection (this may trigger Redis availability check)
  console.log('\n📍 1. Testing mode detection (may trigger Redis check):');

  process.env.CFN_MODE = 'task';

  const { detectMode } = require('./dist/mode-detector.js');
  const detection = await detectMode();

  console.log('Mode detection result:', detection);
  console.log('Redis module imports during detection:', redisImportAttempts);

  // Test 2: Redis coordinator initialization
  console.log('\n📍 2. Testing Redis coordinator initialization:');

  const { RedisCoordinator } = require('./dist/redis-client.js');
  const coordinator = new RedisCoordinator();

  const preInitImports = redisImportAttempts;
  await coordinator.initialize();

  console.log('Redis module imports during init:', redisImportAttempts - preInitImports);
  console.log('Coordinator has client:', !!coordinator.client);
  console.log('Can use Redis:', coordinator.canUseRedis);

  // Test 3: Attempt some operations
  console.log('\n📍 3. Testing Redis operations:');

  const preOpImports = redisImportAttempts;
  await coordinator.ping();
  await coordinator.set('test', 'value');
  await coordinator.get('test');

  console.log('Redis module imports during operations:', redisImportAttempts - preOpImports);

  console.log('\n📊 SUMMARY:');
  console.log('Total Redis module imports:', redisImportAttempts);
  console.log('Connection attempts made:', connectionAttempts);
  console.log('Any network activity detected:', redisImportAttempts > 0);

  // Clean up
  await coordinator.disconnect();
}

testConnectionAttempts().catch(console.error);