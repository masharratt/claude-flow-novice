#!/usr/bin/env node

/**
 * Test the Redis availability check specifically
 */

async function testRedisCheck() {
  console.log('🔍 Testing Redis Availability Check');
  console.log('='.repeat(50));

  // Monitor Redis module imports
  let importCount = 0;
  const Module = require('module');
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function(id) {
    if (id === 'ioredis') {
      importCount++;
      console.log(`📦 Redis module import #${importCount}`);
    }
    return originalRequire.apply(this, arguments);
  };

  // Test the checkRedisAvailability function directly
  console.log('\n📍 Testing checkRedisAvailability function:');

  // First, let's see what the mode detector does
  process.env.CFN_MODE = 'task';

  const { detectMode } = require('./dist/mode-detector.js');

  console.log('Calling detectMode (which calls checkRedisAvailability)...');
  const detection = await detectMode();

  console.log('\n📊 Results:');
  console.log('Redis module imports:', importCount);
  console.log('Redis available in detection:', detection.redisAvailable);
  console.log('Can use Redis:', detection.canUseRedis);
  console.log('Mode:', detection.mode);

  // Now let's test the CFNRedisClient connection behavior
  console.log('\n📍 Testing CFNRedisClient with gracefulFallback:');

  const { CFNRedisClient } = require('./dist/redis/redis-client.js');

  const client = new CFNRedisClient({
    host: 'localhost',
    port: 6379,
    gracefulFallback: true,
    connectTimeout: 1000
  });

  console.log('Client created, attempting connect...');
  const preConnectImports = importCount;

  try {
    await client.connect();
    console.log('✅ Connect completed successfully');
  } catch (error) {
    console.log('❌ Connect failed:', error.message);
    console.log('Error type:', error.constructor.name);
  }

  console.log('Redis module imports during connect:', importCount - preConnectImports);
  console.log('Client available after connect:', client.isAvailable());

  // Test operations
  console.log('\n📍 Testing operations on graceful fallback client:');
  const preOpImports = importCount;

  try {
    const pingResult = await client.ping();
    console.log('PING result:', pingResult);
  } catch (error) {
    console.log('PING failed:', error.message);
  }

  console.log('Redis module imports during operations:', importCount - preOpImports);
  console.log('Final stats:', client.getStats());

  await client.disconnect();
}

testRedisCheck().catch(console.error);