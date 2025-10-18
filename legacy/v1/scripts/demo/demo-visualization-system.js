#!/usr/bin/env node

/**
 * Swarm Visualization System Demo
 *
 * This script demonstrates the complete real-time swarm visualization system
 * by starting the WebSocket server, publishing mock events, and showing
 * how the components work together.
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Swarm Visualization System Demo');
console.log('==========================================');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startDemo() {
  console.log('\n📊 Phase 1: Starting WebSocket Server');
  console.log('----------------------------------------');

  // Start WebSocket server
  const wsServer = spawn('npm', ['run', 'swarm:visualization'], {
    stdio: 'pipe',
    shell: true
  });

  wsServer.stdout.on('data', (data) => {
    console.log(`[WebSocket Server] ${data.toString().trim()}`);
  });

  wsServer.stderr.on('data', (data) => {
    console.error(`[WebSocket Server Error] ${data.toString().trim()}`);
  });

  // Wait for server to start
  await sleep(3000);

  console.log('\n🔴 Phase 2: Starting Redis Event Publisher');
  console.log('--------------------------------------------');

  // Start event publisher
  const eventPublisher = spawn('ts-node', ['src/scripts/publishSwarmEvents.ts'], {
    stdio: 'pipe',
    shell: true
  });

  eventPublisher.stdout.on('data', (data) => {
    console.log(`[Event Publisher] ${data.toString().trim()}`);
  });

  eventPublisher.stderr.on('data', (data) => {
    console.error(`[Event Publisher Error] ${data.toString().trim()}`);
  });

  // Wait for publisher to start
  await sleep(2000);

  console.log('\n🎯 Phase 3: System Status');
  console.log('-----------------------');

  // Check Redis keys
  const redisCheck = spawn('redis-cli', ['keys', 'swarm:*'], {
    stdio: 'pipe',
    shell: true
  });

  redisCheck.stdout.on('data', (data) => {
    const keys = data.toString().trim().split('\n').filter(k => k);
    console.log(`Redis keys found: ${keys.length}`);
    keys.forEach(key => console.log(`  - ${key}`));
  });

  await sleep(1000);

  console.log('\n🌐 Phase 4: Access Instructions');
  console.log('-------------------------------');
  console.log('The Swarm Visualization System is now running!');
  console.log('');
  console.log('To access the visualization:');
  console.log('1. Open your browser and navigate to your Next.js application');
  console.log('2. Navigate to the swarm visualization page');
  console.log('3. You should see real-time updates from the swarm');
  console.log('');
  console.log('WebSocket Server: ws://localhost:8080');
  console.log('Redis Server: localhost:6379');
  console.log('');

  console.log('🔍 Phase 5: Live Monitoring');
  console.log('---------------------------');

  // Monitor Redis activity
  const redisMonitor = spawn('redis-cli', ['monitor'], {
    stdio: 'pipe',
    shell: true
  });

  let monitorCount = 0;
  redisMonitor.stdout.on('data', (data) => {
    if (monitorCount < 10) {
      console.log(`[Redis Monitor] ${data.toString().trim()}`);
      monitorCount++;
    } else if (monitorCount === 10) {
      console.log('[Redis Monitor] ... (monitoring continues)');
      monitorCount++;
    }
  });

  // Let the system run for demonstration
  console.log('Running demonstration for 30 seconds...');
  console.log('Press Ctrl+C to stop the demo');

  await sleep(30000);

  console.log('\n🛑 Phase 6: Cleanup');
  console.log('-------------------');

  // Cleanup processes
  wsServer.kill('SIGTERM');
  eventPublisher.kill('SIGTERM');
  redisMonitor.kill('SIGTERM');

  console.log('✅ Demo completed successfully!');
  console.log('');
  console.log('To run the system again:');
  console.log('1. npm run swarm:visualization  # Start WebSocket server');
  console.log('2. ts-node src/scripts/publishSwarmEvents.ts  # Start event publisher');
  console.log('3. Open your browser to view the visualization');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Demo interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Demo terminated');
  process.exit(0);
});

// Start the demo
startDemo().catch(error => {
  console.error('❌ Demo failed:', error);
  process.exit(1);
});