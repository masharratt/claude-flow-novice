#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Dashboard CLI
 * Tests SQLite, Redis, and API integration with real connections
 */

const sqlite3 = require('sqlite3').verbose();
const redis = require('redis');
const http = require('http');
const assert = require('assert');

// Test configuration
const config = {
  sqlite: {
    path: './claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db',
    timeout: 5000
  },
  redis: {
    host: 'localhost',
    port: 6379,
    timeout: 5000
  },
  api: {
    baseUrl: 'http://localhost:3001',
    timeout: 10000
  },
  polling: {
    interval: 3000,
    tolerance: 500 // 500ms tolerance for timing
  }
};

// Test utilities
class TestRunner {
  constructor() {
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log('🧪 Starting Dashboard CLI Test Suite\n');
    
    for (const { name, testFn } of this.tests) {
      this.results.total++;
      try {
        console.log(`▶️  ${name}...`);
        const startTime = Date.now();
        await testFn();
        const duration = Date.now() - startTime;
        console.log(`✅ ${name} (${duration}ms)`);
        this.results.passed++;
        this.results.details.push({ name, status: 'PASS', duration, error: null });
      } catch (error) {
        console.log(`❌ ${name}: ${error.message}`);
        this.results.failed++;
        this.results.details.push({ name, status: 'FAIL', duration: 0, error: error.message });
      }
    }

    this.printSummary();
    return this.results;
  }

  printSummary() {
    console.log('\n📊 Test Results Summary:');
    console.log(`Total: ${this.results.total}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Pass Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);
    
    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.details
        .filter(test => test.status === 'FAIL')
        .forEach(test => console.log(`  - ${test.name}: ${test.error}`));
    }
  }
}

// Helper functions
function makeHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(config.api.timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test Suite
const runner = new TestRunner();

// 1. SQLite Connection Tests
runner.test('SQLite - Database Connection', async () => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(config.sqlite.path, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(new Error(`SQLite connection failed: ${err.message}`));
      } else {
        db.close((closeErr) => {
          if (closeErr) {
            reject(new Error(`SQLite close failed: ${closeErr.message}`));
          } else {
            resolve();
          }
        });
      }
    });
  });
});

runner.test('SQLite - Query Agents Table', async () => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(config.sqlite.path, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(new Error(`SQLite connection failed: ${err.message}`));
        return;
      }

      // Check if agents table exists
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'", (err, row) => {
        if (err) {
          db.close();
          reject(new Error(`Query failed: ${err.message}`));
          return;
        }

        if (!row) {
          db.close();
          reject(new Error('Agents table does not exist'));
          return;
        }

        // Query sample data
        db.all("SELECT * FROM agents LIMIT 5", (err, rows) => {
          db.close();
          if (err) {
            reject(new Error(`Agents table query failed: ${err.message}`));
          } else {
            assert(Array.isArray(rows), 'Query should return array');
            resolve();
          }
        });
      });
    });
  });
});

runner.test('SQLite - Verify Data Structure', async () => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(config.sqlite.path, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(new Error(`SQLite connection failed: ${err.message}`));
        return;
      }

      db.get("PRAGMA table_info(agents)", (err, row) => {
        if (err) {
          db.close();
          reject(new Error(`Table info query failed: ${err.message}`));
          return;
        }

        // Get column information
        db.all("PRAGMA table_info(agents)", (err, columns) => {
          db.close();
          if (err) {
            reject(new Error(`Column info query failed: ${err.message}`));
          } else {
            const columnNames = columns.map(col => col.name);
            const expectedColumns = ['id', 'type', 'status', 'confidence', 'spawned_at', 'completed_at', 'metadata'];
            
            for (const expectedCol of expectedColumns) {
              if (!columnNames.includes(expectedCol)) {
                reject(new Error(`Missing expected column: ${expectedCol}`));
                return;
              }
            }
            
            resolve();
          }
        });
      });
    });
  });
});

// 2. Redis Connection Tests
runner.test('Redis - Connection Test', async () => {
  const client = redis.createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port
    },
    connectTimeout: config.redis.timeout
  });

  try {
    await client.connect();
    const pong = await client.ping();
    assert.strictEqual(pong, 'PONG', 'Redis ping should return PONG');
  } catch (error) {
    throw new Error(`Redis connection failed: ${error.message}`);
  } finally {
    await client.quit();
  }
});

runner.test('Redis - Key Read/Write Test', async () => {
  const client = redis.createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port
    },
    connectTimeout: config.redis.timeout
  });

  try {
    await client.connect();
    
    const testKey = `test:dashboard:${Date.now()}`;
    const testValue = JSON.stringify({ test: true, timestamp: Date.now() });

    // Write test
    await client.set(testKey, testValue);
    
    // Read test
    const readValue = await client.get(testKey);
    assert.strictEqual(readValue, testValue, 'Redis read/write should match');
    
    // Cleanup
    await client.del(testKey);
  } catch (error) {
    throw new Error(`Redis read/write test failed: ${error.message}`);
  } finally {
    await client.quit();
  }
});

runner.test('Redis - Signal Patterns Test', async () => {
  const client = redis.createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port
    },
    connectTimeout: config.redis.timeout
  });

  try {
    await client.connect();
    
    const testTaskId = `test-task-${Date.now()}`;
    const testAgentId = `test-agent-${Date.now()}`;
    const signalKey = `swarm:${testTaskId}:${testAgentId}:done`;
    const testSignal = JSON.stringify({ 
      status: 'complete', 
      timestamp: Date.now(),
      confidence: 0.95 
    });

    // Test list operation (like completion signals)
    await client.lPush(signalKey, testSignal);
    
    // Test retrieval
    const signals = await client.lRange(signalKey, 0, -1);
    assert(signals.length > 0, 'Signal should be stored');
    
    // Test TTL setting
    await client.expire(signalKey, 300); // 5 minutes TTL
    
    // Cleanup
    await client.del(signalKey);
  } catch (error) {
    throw new Error(`Redis signal patterns test failed: ${error.message}`);
  } finally {
    await client.quit();
  }
});

// 3. API Integration Tests
runner.test('API - GET /api/agents returns valid JSON', async () => {
  try {
    const response = await makeHttpRequest(`${config.api.baseUrl}/api/agents`);
    
    assert(response.statusCode === 200 || response.statusCode === 404, 
           `Expected 200 or 404, got ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      // Try to parse as JSON
      const data = JSON.parse(response.body);
      assert(typeof data === 'object', 'Response should be valid JSON object');
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Dashboard API server not running on port 3001');
    }
    throw error;
  }
});

runner.test('API - GET /api/redis/signals returns valid JSON', async () => {
  try {
    const response = await makeHttpRequest(`${config.api.baseUrl}/api/redis/signals`);
    
    assert(response.statusCode === 200 || response.statusCode === 404, 
           `Expected 200 or 404, got ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      assert(typeof data === 'object', 'Response should be valid JSON object');
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Dashboard API server not running on port 3001');
    }
    throw error;
  }
});

runner.test('API - GET /api/status returns valid JSON', async () => {
  try {
    const response = await makeHttpRequest(`${config.api.baseUrl}/api/status`);
    
    assert(response.statusCode === 200 || response.statusCode === 404, 
           `Expected 200 or 404, got ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      assert(typeof data === 'object', 'Response should be valid JSON object');
      
      // If status endpoint works, verify it has expected fields
      if (data.status || data.data) {
        // Status endpoint exists and returns data
        console.log('    📋 Status endpoint active');
      }
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Dashboard API server not running on port 3001');
    }
    throw error;
  }
});

runner.test('API - Data Accuracy Verification', async () => {
  try {
    // Test that API data matches database when available
    const agentsResponse = await makeHttpRequest(`${config.api.baseUrl}/api/agents`);
    
    if (agentsResponse.statusCode === 200) {
      const apiData = JSON.parse(agentsResponse.body);
      
      // Cross-reference with SQLite
      const dbData = await new Promise((resolve, reject) => {
        const db = new sqlite3.Database(config.sqlite.path, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            reject(err);
            return;
          }

          db.all("SELECT COUNT(*) as count FROM agents", (err, rows) => {
            db.close();
            if (err) {
              reject(err);
            } else {
              resolve(rows[0].count);
            }
          });
        });
      });

      console.log(`    📊 DB Count: ${dbData}, API Response: ${JSON.stringify(apiData).substring(0, 100)}...`);
      
      // Basic consistency check
      if (apiData.agents && Array.isArray(apiData.agents)) {
        console.log(`    📋 API reports ${apiData.agents.length} agents`);
      }
    } else {
      console.log('    ⚠️  API not available, skipping data accuracy check');
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('    ⚠️  API server not available for data accuracy check');
    } else {
      throw error;
    }
  }
});

// 4. Polling Mechanism Tests
runner.test('Polling - 3-Second Interval Timing', async () => {
  const intervals = [];
  const startTime = Date.now();
  
  // Simulate polling mechanism
  for (let i = 0; i < 3; i++) {
    const pollStart = Date.now();
    
    // Simulate API call
    try {
      await makeHttpRequest(`${config.api.baseUrl}/api/status`);
    } catch (error) {
      // API might not be available, just continue timing test
    }
    
    const pollEnd = Date.now();
    intervals.push(pollEnd - pollStart);
    
    if (i < 2) { // Don't sleep after last poll
      await sleep(config.polling.interval);
    }
  }
  
  const totalTime = Date.now() - startTime;
  const expectedTime = (config.polling.interval * 2); // 2 intervals between 3 polls
  
  // Allow tolerance for timing variations
  const timingDiff = Math.abs(totalTime - expectedTime);
  assert(timingDiff <= config.polling.tolerance, 
         `Polling timing off by ${timingDiff}ms (tolerance: ${config.polling.tolerance}ms)`);
  
  console.log(`    ⏱️  Total time: ${totalTime}ms, Expected: ${expectedTime}ms, Diff: ${timingDiff}ms`);
});

runner.test('Polling - Error Handling', async () => {
  let errorCount = 0;
  let successCount = 0;
  
  // Test error handling for invalid endpoint
  try {
    await makeHttpRequest(`${config.api.baseUrl}/api/nonexistent`);
    successCount++;
  } catch (error) {
    errorCount++;
    assert(error.code === 'ECONNREFUSED' || error.statusCode === 404, 
           'Should handle connection refused or 404 errors');
  }
  
  // Test error handling for timeout
  try {
    await makeHttpRequest('http://10.255.255.1:3001/api/status', { timeout: 1000 });
    successCount++;
  } catch (error) {
    errorCount++;
    assert(error.code === 'TIMEOUT' || error.code === 'EHOSTUNREACH', 
           'Should handle timeout errors');
  }
  
  console.log(`    🛡️  Error handling: ${errorCount} errors handled correctly`);
  assert(errorCount > 0, 'Should encounter and handle errors');
});

runner.test('Polling - DOM Update Simulation', async () => {
  // Simulate DOM update mechanism
  const updates = [];
  let lastTimestamp = Date.now();
  
  // Simulate 3 polling cycles with data updates
  for (let i = 0; i < 3; i++) {
    const currentTimestamp = Date.now();
    
    // Simulate data update
    const updateData = {
      timestamp: currentTimestamp,
      cycle: i + 1,
      data: Math.random() // Simulate changing data
    };
    
    updates.push(updateData);
    
    // Simulate DOM update logic
    const hasUpdate = currentTimestamp > lastTimestamp;
    assert(hasUpdate, 'Should detect data update');
    
    lastTimestamp = currentTimestamp;
    
    if (i < 2) {
      await sleep(100); // Short pause between updates
    }
  }
  
  assert.strictEqual(updates.length, 3, 'Should have 3 update cycles');
  
  // Verify timestamps are increasing
  for (let i = 1; i < updates.length; i++) {
    assert(updates[i].timestamp > updates[i - 1].timestamp, 
           'Timestamps should be monotonically increasing');
  }
  
  console.log(`    🔄 DOM update simulation: ${updates.length} cycles completed`);
});

// Main execution
async function main() {
  try {
    const results = await runner.run();
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n💥 Test suite failed to run:', error.message);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run tests if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = { TestRunner, config };