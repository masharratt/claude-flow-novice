/**
 * Test Setup Configuration
 * 
 * Global test setup and teardown for the Redis Performance Enhancement system.
 */

const Redis = require('ioredis');

// Test configuration
const TEST_CONFIG = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    db: 15 // Use dedicated test database
  }
};

let testRedis;

// Global test setup
beforeAll(async () => {
  // Connect to test Redis instance
  testRedis = new Redis(TEST_CONFIG.redis);
  
  try {
    // Test Redis connection
    await testRedis.ping();
    console.log('Test Redis connection established');
  } catch (error) {
    console.error('Failed to connect to test Redis:', error);
    process.exit(1);
  }
});

// Global test teardown
afterAll(async () => {
  // Clean up test database
  if (testRedis) {
    try {
      await testRedis.flushdb();
      await testRedis.quit();
      console.log('Test Redis connection closed');
    } catch (error) {
      console.error('Error during test cleanup:', error);
    }
  }
});

// Test database cleanup before each test
beforeEach(async () => {
  if (testRedis) {
    try {
      await testRedis.flushdb();
    } catch (error) {
      console.error('Error during test cleanup:', error);
    }
  }
});

// Export test utilities
global.testUtils = {
  createTestMetrics: (overrides = {}) => ({
    responseTime: 100 + Math.random() * 400,
    confidence: 0.7 + Math.random() * 0.3,
    status: Math.random() > 0.1 ? 'success' : 'error',
    taskType: ['analysis', 'development', 'testing'][Math.floor(Math.random() * 3)],
    timestamp: Date.now(),
    ...overrides
  }),
  
  createTestAgentMetrics: (agentId, count = 10) => {
    const metrics = [];
    const now = Date.now();
    
    for (let i = 0; i < count; i++) {
      metrics.push({
        agentId,
        responseTime: 100 + Math.random() * 400,
        confidence: 0.7 + Math.random() * 0.3,
        status: Math.random() > 0.1 ? 'success' : 'error',
        taskType: ['analysis', 'development', 'testing'][Math.floor(Math.random() * 3)],
        timestamp: now - (count - i) * 60000, // 1 minute intervals
        method: 'POST',
        url: '/api/test',
        statusCode: Math.random() > 0.1 ? 200 : 500
      });
    }
    
    return metrics;
  },
  
  waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  getTestRedis: () => testRedis
};

// Set test timeout
jest.setTimeout(30000);