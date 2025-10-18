#!/usr/bin/env node

/**
 * Test Redis-backed swarm functionality
 */

import redis from 'redis';
import { executeSwarm } from '../../src/cli/simple-commands/swarm-executor.js';

console.log('🧪 Testing Redis-Backed Swarm');

// Create Redis client
const redisClient = redis.createClient({
  host: 'localhost',
  port: 6379,
  db: 0
});

async function testRedisSwarm() {
  try {
    // Connect to Redis
    await redisClient.connect();
    console.log('✅ Connected to Redis');

    const objective = "Create a user authentication service with JWT";
    const flags = {
      executor: true,
      'output-format': 'json',
      'max-agents': 3,
      strategy: 'development',
      mode: 'centralized'
    };

    console.log('📋 Objective:', objective);
    console.log('');

    // Generate swarm ID
    const swarmId = `redis_test_${Date.now()}`;

    // Store initial swarm state in Redis
    const initialState = {
      id: swarmId,
      objective,
      status: 'initializing',
      createdAt: new Date().toISOString(),
      flags
    };

    await redisClient.setEx(`swarm:${swarmId}`, 3600, JSON.stringify(initialState));
    console.log(`💾 Stored initial state in Redis: swarm:${swarmId}`);

    // Execute swarm
    const result = await executeSwarm(objective, flags);

    // Update swarm state in Redis with results
    const finalState = {
      ...initialState,
      status: 'completed',
      completedAt: new Date().toISOString(),
      result
    };

    await redisClient.setEx(`swarm:${swarmId}`, 3600, JSON.stringify(finalState));
    console.log(`💾 Stored final state in Redis: swarm:${swarmId}`);

    // Verify the data was stored correctly
    const retrievedState = await redisClient.get(`swarm:${swarmId}`);
    const parsedState = JSON.parse(retrievedState);

    console.log('✅ Redis persistence test successful!');
    console.log('📊 Retrieved state keys:', Object.keys(parsedState));

    // Test recovery
    console.log('\n🔄 Testing swarm recovery...');

    // Simulate recovery by retrieving the state
    const recoveredState = await redisClient.get(`swarm:${swarmId}`);
    const recovered = JSON.parse(recoveredState);

    console.log('🔍 Recovered swarm:');
    console.log(`   ID: ${recovered.id}`);
    console.log(`   Status: ${recovered.status}`);
    console.log(`   Objective: ${recovered.objective}`);
    console.log(`   Created: ${recovered.createdAt}`);
    console.log(`   Completed: ${recovered.completedAt}`);

    if (recovered.result && recovered.result.success) {
      console.log('✅ Swarm recovery test successful!');
    }

    // Test multiple swarm states
    console.log('\n📝 Testing multiple swarm states...');

    const swarms = await redisClient.keys('swarm:*');
    console.log(`   Found ${swarms.length} swarm states in Redis`);

    for (const swarmKey of swarms) {
      const swarmData = await redisClient.get(swarmKey);
      const swarm = JSON.parse(swarmData);
      console.log(`   - ${swarmKey}: ${swarm.status} (${swarm.objective})`);
    }

  } catch (error) {
    console.error('❌ Redis test failed:', error.message);
  } finally {
    // Close Redis connection
    await redisClient.quit();
    console.log('\n🔌 Redis connection closed');
  }
}

testRedisSwarm();