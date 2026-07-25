#!/usr/bin/env node

/**
 * Simple test to check Task Mode Redis behavior
 */

const { detectMode } = require('./dist/mode-detector.js');
const { RedisCoordinator } = require('./dist/redis-client.js');

async function testTaskMode() {
  console.log('🔍 Testing Task Mode Redis Behavior');
  console.log('='.repeat(50));

  // Set up Task Mode environment
  process.env.CFN_MODE = 'task';
  // Deliberately NOT setting TASK_ID or AGENT_ID

  console.log('\n📍 1. Mode Detection:');
  const detection = await detectMode();
  console.log('Mode:', detection.mode);
  console.log('Can use Redis:', detection.canUseRedis);
  console.log('Redis available:', detection.redisAvailable);
  console.log('Reason:', detection.reason);

  console.log('\n📍 2. Redis Coordinator Initialization:');
  const coordinator = new RedisCoordinator();
  await coordinator.initialize();

  console.log('Can use Redis:', coordinator.canUseRedis);
  console.log('Mode:', coordinator.mode);
  console.log('Has client:', !!coordinator.client);

  console.log('\n📍 3. Testing Redis Operations:');

  const operations = [
    'ping', 'set', 'get', 'lpush', 'rpush', 'blpop',
    'hset', 'hget', 'hgetall', 'del', 'expire', 'exists',
    'zadd', 'zrevrange', 'zrange', 'zrem', 'sadd', 'smembers', 'publish'
  ];

  for (const op of operations) {
    try {
      let result;
      switch(op) {
        case 'ping':
          result = await coordinator.ping();
          break;
        case 'set':
          result = await coordinator.set('test-key', 'test-value');
          break;
        case 'get':
          result = await coordinator.get('test-key');
          break;
        case 'lpush':
          result = await coordinator.lpush('test-list', 'value');
          break;
        case 'rpush':
          result = await coordinator.rpush('test-list', 'value');
          break;
        case 'blpop':
          result = await coordinator.blpop('test-list', 1);
          break;
        case 'hset':
          result = await coordinator.hset('test-hash', 'field', 'value');
          break;
        case 'hget':
          result = await coordinator.hget('test-hash', 'field');
          break;
        case 'hgetall':
          result = await coordinator.hgetall('test-hash');
          break;
        case 'del':
          result = await coordinator.del('test-key');
          break;
        case 'expire':
          result = await coordinator.expire('test-key', 60);
          break;
        case 'exists':
          result = await coordinator.exists('test-key');
          break;
        case 'zadd':
          result = await coordinator.zadd('test-zset', '1', 'member');
          break;
        case 'zrevrange':
          result = await coordinator.zrevrange('test-zset', 0, -1);
          break;
        case 'zrange':
          result = await coordinator.zrange('test-zset', 0, -1);
          break;
        case 'zrem':
          result = await coordinator.zrem('test-zset', 'member');
          break;
        case 'sadd':
          result = await coordinator.sadd('test-set', 'member');
          break;
        case 'smembers':
          result = await coordinator.smembers('test-set');
          break;
        case 'publish':
          result = await coordinator.publish('test-channel', 'message');
          break;
      }
      console.log(`${op}: ${JSON.stringify(result)}`);
    } catch (error) {
      console.log(`${op}: ERROR - ${error.message}`);
    }
  }

  console.log('\n📍 4. Memory Usage:');
  const memUsage = process.memoryUsage();
  console.log('RSS:', Math.round(memUsage.rss / 1024 / 1024), 'MB');
  console.log('Heap Used:', Math.round(memUsage.heapUsed / 1024 / 1024), 'MB');

  console.log('\n📍 5. Cleanup:');
  await coordinator.disconnect();
  console.log('Disconnected successfully');

  console.log('\n✅ Test completed');
}

testTaskMode().catch(console.error);