/**
 * Web Portal WebSocket Integration Tests
 * Phase 2: Real-time event streaming validation
 */

const io = require('socket.io-client');
const redis = require('redis');

const PORTAL_URL = 'http://localhost:3456';
const REDIS_URL = 'redis://localhost:6379';

// Test suite
async function runTests() {
  const results = [];
  let passed = 0;
  let failed = 0;

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('WEB PORTAL WEBSOCKET INTEGRATION TESTS - PHASE 2');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Test 1: WebSocket connection established
  try {
    console.log('Test 1: WebSocket connection established...');

    const socket = io(PORTAL_URL, {
      reconnection: false,
      timeout: 5000
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Connection timeout'));
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        console.log('  ✅ PASS: WebSocket connected');
        console.log(`     Socket ID: ${socket.id}`);
        results.push({ test: 'WebSocket connection', status: 'PASS' });
        passed++;
        socket.close();
        resolve();
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    results.push({ test: 'WebSocket connection', status: 'FAIL', error: err.message });
    failed++;
  }

  console.log('');

  // Test 2: Receive initial swarms data on connection
  try {
    console.log('Test 2: Receive initial swarms data on connection...');

    const socket = io(PORTAL_URL, {
      reconnection: false,
      timeout: 5000
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('No initial data received within 5s'));
      }, 5000);

      socket.on('initial-swarms', (data) => {
        clearTimeout(timeout);

        if (!data || typeof data.count !== 'number') {
          socket.close();
          reject(new Error('Invalid initial swarms data format'));
          return;
        }

        console.log('  ✅ PASS: Initial swarms data received');
        console.log(`     Swarm count: ${data.count}`);
        console.log(`     Timestamp: ${data.timestamp}`);
        results.push({ test: 'Initial swarms data', status: 'PASS' });
        passed++;
        socket.close();
        resolve();
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      });
    });
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    results.push({ test: 'Initial swarms data', status: 'FAIL', error: err.message });
    failed++;
  }

  console.log('');

  // Test 3: Request swarms list via WebSocket
  try {
    console.log('Test 3: Request swarms list via WebSocket...');

    const socket = io(PORTAL_URL, {
      reconnection: false,
      timeout: 5000
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('No swarms list received within 5s'));
      }, 5000);

      socket.on('connect', () => {
        socket.emit('request-swarms');
      });

      socket.on('swarms-list', (data) => {
        clearTimeout(timeout);

        if (!data || typeof data.count !== 'number' || !Array.isArray(data.tasks)) {
          socket.close();
          reject(new Error('Invalid swarms list format'));
          return;
        }

        console.log('  ✅ PASS: Swarms list received');
        console.log(`     Task count: ${data.count}`);
        console.log(`     Tasks array length: ${data.tasks.length}`);
        results.push({ test: 'Request swarms list', status: 'PASS' });
        passed++;
        socket.close();
        resolve();
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      });
    });
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    results.push({ test: 'Request swarms list', status: 'FAIL', error: err.message });
    failed++;
  }

  console.log('');

  // Test 4: Redis pub/sub event forwarding
  try {
    console.log('Test 4: Redis pub/sub event forwarding...');

    const socket = io(PORTAL_URL, {
      reconnection: false,
      timeout: 10000
    });

    const publisher = redis.createClient({ url: REDIS_URL });
    await publisher.connect();

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        publisher.quit();
        reject(new Error('No swarm event received within 10s'));
      }, 10000);

      socket.on('connect', async () => {
        // Wait a bit for subscriptions to settle
        await new Promise(r => setTimeout(r, 500));

        // Publish test event to Redis
        const testEvent = {
          type: 'agent-spawned',
          agentId: 'test-agent-123',
          taskId: 'test-task-456',
          timestamp: Date.now()
        };

        await publisher.publish('swarm:test-task-456:events', JSON.stringify(testEvent));
      });

      socket.on('swarm-event', (data) => {
        clearTimeout(timeout);

        if (!data || !data.event) {
          socket.close();
          publisher.quit();
          reject(new Error('Invalid swarm event format'));
          return;
        }

        console.log('  ✅ PASS: Swarm event forwarded from Redis pub/sub');
        console.log(`     Event type: ${data.event.type}`);
        console.log(`     Agent ID: ${data.event.agentId}`);
        console.log(`     Task ID: ${data.event.taskId}`);
        results.push({ test: 'Redis pub/sub forwarding', status: 'PASS' });
        passed++;
        socket.close();
        publisher.quit();
        resolve();
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        socket.close();
        publisher.quit();
        reject(err);
      });
    });
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    results.push({ test: 'Redis pub/sub forwarding', status: 'FAIL', error: err.message });
    failed++;
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Return exit code
  return failed === 0 ? 0 : 1;
}

// Run tests
runTests()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
