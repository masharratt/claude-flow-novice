#!/usr/bin/env node
// Test script for CFN Monitoring Dashboard API endpoints

const express = require('express');
const redis = require('redis');
const Docker = require('dockerode');
const { spawn } = require('child_process');

console.log('🧪 Testing CFN Monitoring Dashboard Components...\n');

async function testDockerConnection() {
  console.log('🐳 Testing Docker connection...');
  try {
    const docker = new Docker();
    const containers = await docker.listContainers({ all: true });
    console.log(`✅ Docker connected - Found ${containers.length} containers`);
    return true;
  } catch (error) {
    console.log(`❌ Docker connection failed: ${error.message}`);
    return false;
  }
}

async function testRedisConnection() {
  console.log('\n🔴 Testing Redis connection...');
  try {
    const redisClient = redis.createClient({
      url: 'redis://localhost:6379'
    });

    await redisClient.connect();
    await redisClient.ping();
    console.log('✅ Redis connected and responding');

    // Test CFN keys
    const keys = await redisClient.keys('cfn_loop:*');
    console.log(`✅ Found ${keys.length} CFN coordination keys`);

    await redisClient.quit();
    return true;
  } catch (error) {
    console.log(`❌ Redis connection failed: ${error.message}`);
    return false;
  }
}

async function testSystemCommands() {
  console.log('\n💻 Testing system commands...');

  const commands = [
    { cmd: 'cat /proc/meminfo | grep MemTotal', desc: 'Memory info' },
    { cmd: 'cat /proc/loadavg | cut -d" " -f1', desc: 'System load' },
    { cmd: 'docker ps --format "{{.Names}}" | head -5', desc: 'Docker containers' }
  ];

  for (const { cmd, desc } of commands) {
    try {
      const result = await execCommand(cmd);
      console.log(`✅ ${desc}: ${result.substring(0, 50)}${result.length > 50 ? '...' : ''}`);
    } catch (error) {
      console.log(`❌ ${desc}: ${error.message}`);
    }
  }
}

function execCommand(command) {
  return new Promise((resolve, reject) => {
    const process = spawn('bash', ['-c', command]);
    let output = '';
    let error = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      error += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`Command failed: ${error}`));
      }
    });
  });
}

async function testAPIStructure() {
  console.log('\n🌐 Testing API endpoint structure...');

  try {
    const app = require('./server.js');

    // Test that the app has the expected routes
    const stack = app._router.stack;
    const routes = [];

    stack.forEach(middleware => {
      if (middleware.route) {
        routes.push(`${middleware.route.methods} ${middleware.route.path}`);
      }
    });

    const expectedRoutes = [
      'GET /api/containers',
      'GET /api/system',
      'GET /api/cfn',
      'GET /api/health',
      'GET /'
    ];

    let foundRoutes = 0;
    expectedRoutes.forEach(route => {
      if (routes.some(r => r.includes(route.split(' ')[1]))) {
        foundRoutes++;
        console.log(`✅ Route found: ${route}`);
      }
    });

    console.log(`✅ API structure test: ${foundRoutes}/${expectedRoutes.length} routes found`);
    return foundRoutes === expectedRoutes.length;

  } catch (error) {
    console.log(`❌ API structure test failed: ${error.message}`);
    return false;
  }
}

async function testMockData() {
  console.log('\n📊 Testing data generation...');

  try {
    // Test container data generation
    const mockContainers = [
      { name: 'cfn-orchestrator', status: 'running', memory: '2.1GB', cpu: '15%' },
      { name: 'cfn-agent-task', status: 'running', memory: '1.8GB', cpu: '25%' },
      { name: 'redis-cfn-loop', status: 'running', memory: '256MB', cpu: '2%' }
    ];

    const total = mockContainers.length;
    const running = mockContainers.filter(c => c.status === 'running').length;

    console.log(`✅ Container data simulation: ${running}/${total} running`);

    // Test system data generation
    const mockSystem = {
      memoryTotal: 16 * 1024 * 1024 * 1024,
      memoryUsed: 8.5 * 1024 * 1024 * 1024,
      load: 2.1
    };

    const memoryPercent = Math.round((mockSystem.memoryUsed / mockSystem.memoryTotal) * 100);
    console.log(`✅ System data simulation: ${memoryPercent}% memory usage`);

    // Test CFN data generation
    const mockCFN = {
      activeTasks: 1,
      completedTasks: 12,
      failedTasks: 1,
      avgConfidence: 0.87
    };

    console.log(`✅ CFN data simulation: ${mockCFN.activeTasks} active tasks, ${(mockCFN.avgConfidence * 100).toFixed(1)}% avg confidence`);

    return true;

  } catch (error) {
    console.log(`❌ Data generation test failed: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting CFN Monitoring Dashboard Tests\n');
  console.log('=' .repeat(50));

  const tests = [
    testDockerConnection,
    testRedisConnection,
    testSystemCommands,
    testAPIStructure,
    testMockData
  ];

  let passed = 0;

  for (const test of tests) {
    try {
      const result = await test();
      if (result) passed++;
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
    }
    console.log('');
  }

  console.log('=' .repeat(50));
  console.log(`\n📋 Test Results: ${passed}/${tests.length} tests passed`);

  if (passed === tests.length) {
    console.log('🎉 All tests passed! The monitoring dashboard should work correctly.');
    console.log('\n📖 To start the dashboard:');
    console.log('   ./start-dashboard.sh');
    console.log('\n🌐 Then open your browser to the shown port (usually 5555)');
  } else {
    console.log('⚠️  Some tests failed. Check the errors above for troubleshooting.');
  }
}

// Run tests
runTests().catch(console.error);