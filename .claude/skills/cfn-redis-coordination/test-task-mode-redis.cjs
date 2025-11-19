#!/usr/bin/env node

/**
 * Test script to investigate actual Task Mode Redis behavior
 *
 * This script simulates Task Mode environment and tests ALL Redis operations
 * to see what actually happens - connection attempts, memory usage, etc.
 */

const path = require('path');
const { spawn } = require('child_process');

// Set up Task Mode environment (NO TASK_ID or AGENT_ID)
const taskModeEnv = {
  ...process.env,
  CFN_MODE: 'task',  // Explicit Task Mode
  NODE_ENV: 'test',
  DEBUG: 'true'
  // Deliberately NOT setting TASK_ID or AGENT_ID
};

// Set up CLI Mode environment for comparison
const cliModeEnv = {
  ...process.env,
  CFN_MODE: 'cli',
  TASK_ID: 'test-task-123',
  AGENT_ID: 'test-agent-456',
  NODE_ENV: 'test',
  DEBUG: 'true'
};

console.log('🔍 Investigating Task Mode Redis Behavior\n');

console.log('='.repeat(60));
console.log('📋 TEST 1: Mode Detection in Task Mode');
console.log('='.repeat(60));

testModeDetection('Task Mode', taskModeEnv);

console.log('\n' + '='.repeat(60));
console.log('📋 TEST 2: Mode Detection in CLI Mode (for comparison)');
console.log('='.repeat(60));

testModeDetection('CLI Mode', cliModeEnv);

console.log('\n' + '='.repeat(60));
console.log('📋 TEST 3: All Redis Operations in Task Mode');
console.log('='.repeat(60));

testRedisOperations('Task Mode', taskModeEnv);

console.log('\n' + '='.repeat(60));
console.log('📋 TEST 4: Memory Usage Analysis');
console.log('='.repeat(60));

testMemoryUsage('Task Mode', taskModeEnv);

console.log('\n' + '='.repeat(60));
console.log('📋 TEST 5: Connection Attempt Detection');
console.log('='.repeat(60));

testConnectionAttempts('Task Mode', taskModeEnv);

console.log('\n' + '='.repeat(60));
console.log('📋 TEST 6: Redis Client Initialization Behavior');
console.log('='.repeat(60));

testRedisClientInit('Task Mode', taskModeEnv);

function testModeDetection(testName, env) {
  console.log(`\n🔧 Testing mode detection: ${testName}`);
  console.log(`Environment: CFN_MODE=${env.CFN_MODE}, TASK_ID=${env.TASK_ID}, AGENT_ID=${env.AGENT_ID}`);

  const testScript = `
    const { detectMode } = require('./src/mode-detector.js');

    detectMode().then(result => {
      console.log('✅ Mode detection result:');
      console.log('  Mode:', result.mode);
      console.log('  Can use Redis:', result.canUseRedis);
      console.log('  Redis available:', result.redisAvailable);
      console.log('  Reason:', result.reason);
      console.log('  Task ID present:', !!process.env.TASK_ID);
      console.log('  Agent ID present:', !!process.env.AGENT_ID);
    }).catch(error => {
      console.error('❌ Mode detection failed:', error.message);
    });
  `;

  runNodeScript(testScript, env);
}

function testRedisOperations(testName, env) {
  console.log(`\n🔧 Testing ALL Redis operations: ${testName}`);

  const testScript = `
    const { RedisCoordinator } = require('./dist/redis-client.js');

    async function testAllOperations() {
      console.log('📍 Initializing Redis coordinator...');
      const coordinator = new RedisCoordinator();

      try {
        await coordinator.initialize();
        console.log('✅ Initialization completed');
        console.log('Can use Redis:', coordinator.canUseRedis);
        console.log('Mode:', coordinator.mode);

        const modeDetection = coordinator.getModeDetection();
        console.log('Detection reason:', modeDetection?.reason);

        // Test ALL Redis operations
        console.log('\\n🧪 Testing all Redis operations:');

        const operations = [
          { name: 'lpush', fn: () => coordinator.lpush('test-list', 'value1') },
          { name: 'rpush', fn: () => coordinator.rpush('test-list', 'value2') },
          { name: 'blpop', fn: () => coordinator.blpop('test-list', 1) },
          { name: 'hset', fn: () => coordinator.hset('test-hash', 'field1', 'value1') },
          { name: 'hget', fn: () => coordinator.hget('test-hash', 'field1') },
          { name: 'hgetall', fn: () => coordinator.hgetall('test-hash') },
          { name: 'set', fn: () => coordinator.set('test-key', 'test-value') },
          { name: 'get', fn: () => coordinator.get('test-key') },
          { name: 'del', fn: () => coordinator.del('test-key') },
          { name: 'expire', fn: () => coordinator.expire('test-key', 60) },
          { name: 'ping', fn: () => coordinator.ping() },
          { name: 'exists', fn: () => coordinator.exists('test-key') },
          { name: 'zadd', fn: () => coordinator.zadd('test-zset', '1', 'member1') },
          { name: 'zrevrange', fn: () => coordinator.zrevrange('test-zset', 0, -1) },
          { name: 'zrange', fn: () => coordinator.zrange('test-zset', 0, -1) },
          { name: 'zrem', fn: () => coordinator.zrem('test-zset', 'member1') },
          { name: 'sadd', fn: () => coordinator.sadd('test-set', 'member1') },
          { name: 'smembers', fn: () => coordinator.smembers('test-set') },
          { name: 'publish', fn: () => coordinator.publish('test-channel', 'test-message') }
        ];

        for (const operation of operations) {
          try {
            const result = await operation.fn();
            console.log(\`  \${operation.name}: \${JSON.stringify(result)}\`);
          } catch (error) {
            console.log(\`  \${operation.name}: ERROR - \${error.message}\`);
          }
        }

        console.log('\\n🔍 Checking client state:');
        console.log('Client exists:', !!coordinator.client);

      } catch (error) {
        console.error('❌ Coordinator failed:', error.message);
        console.error('Stack:', error.stack);
      }
    }

    testAllOperations().catch(console.error);
  `;

  runNodeScript(testScript, env);
}

function testMemoryUsage(testName, env) {
  console.log(`\n🔧 Testing memory usage: ${testName}`);

  const testScript = `
    const { RedisCoordinator } = require('./dist/redis-client.js');

    async function testMemory() {
      console.log('📊 Initial memory usage:');
      console.log('  RSS:', Math.round(process.memoryUsage().rss / 1024 / 1024), 'MB');
      console.log('  Heap Used:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

      console.log('\\n📍 Creating multiple Redis coordinators...');
      const coordinators = [];

      for (let i = 0; i < 10; i++) {
        const coordinator = new RedisCoordinator();
        await coordinator.initialize();
        coordinators.push(coordinator);

        // Test some operations
        await coordinator.ping();
        await coordinator.set('test-key-' + i, 'value-' + i);
        await coordinator.get('test-key-' + i);
      }

      console.log('\\n📊 Memory usage after 10 coordinators:');
      console.log('  RSS:', Math.round(process.memoryUsage().rss / 1024 / 1024), 'MB');
      console.log('  Heap Used:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

      console.log('\\n🧹 Cleaning up coordinators...');
      for (const coordinator of coordinators) {
        await coordinator.disconnect();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('\\n📊 Memory usage after GC:');
        console.log('  RSS:', Math.round(process.memoryUsage().rss / 1024 / 1024), 'MB');
        console.log('  Heap Used:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
      }
    }

    testMemory().catch(console.error);
  `;

  runNodeScript(testScript, env);
}

function testConnectionAttempts(testName, env) {
  console.log(`\n🔧 Testing connection attempts: ${testName}`);

  const testScript = `
    const { detectMode } = require('./dist/mode-detector.js');

    // Monitor network connections by intercepting Redis module import
    const originalRequire = require;
    let redisImportAttempts = 0;
    let connectionAttempts = 0;

    require = function(id) {
      if (id === 'ioredis') {
        redisImportAttempts++;
        console.log('🔍 Redis module import attempt #' + redisImportAttempts);

        const Redis = originalRequire(id);

        // Wrap Redis constructor to track connection attempts
        const OriginalRedis = Redis;
        const WrappedRedis = function(options) {
          connectionAttempts++;
          console.log('🔌 Redis connection attempt #' + connectionAttempts, options ? JSON.stringify({
            host: options.host,
            port: options.port,
            connectTimeout: options.connectTimeout
          }) : 'no options');

          // Intercept event handlers
          const instance = new OriginalRedis(options);

          const originalOn = instance.on;
          instance.on = function(event, handler) {
            if (event === 'connect' || event === 'ready' || event === 'error') {
              console.log('📡 Redis event listener attached:', event);
            }
            return originalOn.call(this, event, handler);
          };

          return instance;
        };

        // Copy static properties
        Object.setPrototypeOf(WrappedRedis, OriginalRedis);
        WrappedRedis.prototype = OriginalRedis.prototype;
        Object.getOwnPropertyNames(OriginalRedis).forEach(name => {
          if (name !== 'prototype' && name !== 'length' && name !== 'name') {
            WrappedRedis[name] = OriginalRedis[name];
          }
        });

        return WrappedRedis;
      }
      return originalRequire.apply(this, arguments);
    };

    async function testConnections() {
      console.log('📍 Testing mode detection (may trigger Redis check)...');
      const detection = await detectMode();
      console.log('Detection result:', detection);

      console.log('\\n📊 Connection statistics:');
      console.log('Redis module imports:', redisImportAttempts);
      console.log('Redis connection attempts:', connectionAttempts);

      console.log('\\n📍 Testing Redis coordinator initialization...');
      const { RedisCoordinator } = originalRequire('./dist/redis-client.js');
      const coordinator = new RedisCoordinator();
      await coordinator.initialize();

      console.log('\\n📊 Final statistics:');
      console.log('Redis module imports:', redisImportAttempts);
      console.log('Redis connection attempts:', connectionAttempts);
      console.log('Coordinator has client:', !!coordinator.client);
      console.log('Can use Redis:', coordinator.canUseRedis);
    }

    testConnections().catch(console.error);
  `;

  runNodeScript(testScript, env);
}

function testRedisClientInit(testName, env) {
  console.log(`\n🔧 Testing Redis client initialization details: ${testName}`);

  const testScript = `
    const { CFNRedisClient } = require('./dist/redis/redis-client.js');

    async function testClientInit() {
      console.log('📍 Creating CFNRedisClient with gracefulFallback...');
      const client = new CFNRedisClient({
        host: 'localhost',
        port: 6379,
        gracefulFallback: true,
        connectTimeout: 1000,
        commandTimeout: 1000
      });

      console.log('Client created');
      console.log('Is available:', client.isAvailable());

      console.log('\\n📍 Attempting to connect...');
      try {
        await client.connect();
        console.log('✅ Connect completed without error');
        console.log('Is available after connect:', client.isAvailable());
      } catch (error) {
        console.log('❌ Connect failed:', error.message);
        console.log('Error type:', error.constructor.name);
      }

      console.log('\\n📍 Testing operations...');
      const operations = ['ping', 'get', 'set', 'lpush', 'hset'];

      for (const op of operations) {
        try {
          console.log(\`Testing \${op}...\`);
          let result;
          if (op === 'ping') {
            result = await client.ping();
          } else if (op === 'get') {
            result = await client.execute(c => c.get('test'), 'get');
          } else if (op === 'set') {
            result = await client.execute(c => c.set('test', 'value'), 'set');
          } else if (op === 'lpush') {
            result = await client.execute(c => c.lpush('list', 'value'), 'lpush');
          } else if (op === 'hset') {
            result = await client.execute(c => c.hset('hash', 'field', 'value'), 'hset');
          }
          console.log(\`  \${op}: \${JSON.stringify(result)}\`);
        } catch (error) {
          console.log(\`  \${op}: ERROR - \${error.message}\`);
        }
      }

      console.log('\\n📊 Client stats:', client.getStats());

      console.log('\\n📍 Disconnecting...');
      await client.disconnect();
      console.log('✅ Disconnect completed');
    }

    testClientInit().catch(console.error);
  `;

  runNodeScript(testScript, env);
}

function runNodeScript(script, env) {
  const child = spawn('node', ['-e', script], {
    cwd: '/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-redis-coordination',
    env: env,
    stdio: 'pipe',
    shell: true
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    const output = data.toString();
    stdout += output;
    process.stdout.write(output);
  });

  child.stderr.on('data', (data) => {
    const output = data.toString();
    stderr += output;
    process.stderr.write(output);
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`\n⚠️ Script exited with code ${code}`);
    }
  });

  return new Promise((resolve) => {
    child.on('close', resolve);
  });
}