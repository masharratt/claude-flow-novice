/**
 * Simple test runner for production validation
 */

const fs = require('fs');
const path = require('path');

// Import test file
const testFile = path.join(__dirname, 'tests/production-validation-advanced-features.cjs');

if (!fs.existsSync(testFile)) {
  console.error('Test file not found:', testFile);
  process.exit(1);
}

// Mock jest functions
global.jest = {
  fn: () => {
    const mockFn = (...args) => {
      mockFn.mock.calls.push(args);
      return mockFn.mock.returnValue;
    };
    mockFn.mock = {
      calls: [],
      returnValue: undefined
    };
    mockFn.mockReturnThis = () => {
      mockFn.mock.returnValue = mockFn;
      return mockFn;
    };
    return mockFn;
  }
};

// Mock describe and test functions
global.describe = (name, fn) => {
  console.log(`\n📋 Test Suite: ${name}`);
  try {
    fn();
  } catch (error) {
    console.error(`❌ Suite failed: ${error.message}`);
  }
};

global.test = (name, fn) => {
  console.log(`  🧪 ${name}`);
  try {
    fn();
    console.log(`    ✅ Passed`);
  } catch (error) {
    console.error(`    ❌ Failed: ${error.message}`);
  }
};

global.beforeAll = async (fn) => {
  console.log(`  🔧 Setup`);
  try {
    await fn();
    console.log(`    ✅ Setup complete`);
  } catch (error) {
    console.error(`    ❌ Setup failed: ${error.message}`);
  }
};

global.afterAll = async (fn) => {
  console.log(`  🧹 Cleanup`);
  try {
    await fn();
    console.log(`    ✅ Cleanup complete`);
  } catch (error) {
    console.error(`    ❌ Cleanup failed: ${error.message}`);
  }
};

global.expect = (actual) => ({
  toBeDefined: () => {
    if (actual === undefined) {
      throw new Error(`Expected ${actual} to be defined`);
    }
  },
  toBe: (expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${actual} to be ${expected}`);
    }
  },
  toBeGreaterThan: (expected) => {
    if (actual <= expected) {
      throw new Error(`Expected ${actual} to be greater than ${expected}`);
    }
  },
  toBeGreaterThanOrEqual: (expected) => {
    if (actual < expected) {
      throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
    }
  },
  toBeLessThan: (expected) => {
    if (actual >= expected) {
      throw new Error(`Expected ${actual} to be less than ${expected}`);
    }
  },
  toBeLessThanOrEqual: (expected) => {
    if (actual > expected) {
      throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
    }
  },
  toHaveBeenCalled: () => {
    if (!actual.mock || actual.mock.calls.length === 0) {
      throw new Error(`Expected function to have been called`);
    }
  },
  toHaveBeenCalledWith: (...args) => {
    if (!actual.mock) {
      throw new Error(`Expected function to have been called`);
    }
    const matchingCall = actual.mock.calls.find(call => 
      JSON.stringify(call) === JSON.stringify(args)
    );
    if (!matchingCall) {
      throw new Error(`Expected function to have been called with ${JSON.stringify(args)}`);
    }
  },
  toEqual: (expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
    }
  },
  toHaveLength: (expected) => {
    if (!actual || actual.length !== expected) {
      throw new Error(`Expected length ${expected}, got ${actual ? actual.length : 'undefined'}`);
    }
  },
  toContain: (expected) => {
    if (!actual || !actual.includes(expected)) {
      throw new Error(`Expected ${actual} to contain ${expected}`);
    }
  },
  toMatch: (pattern) => {
    if (!actual || !actual.match(pattern)) {
      throw new Error(`Expected ${actual} to match ${pattern}`);
    }
  },
  not: {
    toBe: (expected) => {
      if (actual === expected) {
        throw new Error(`Expected ${actual} not to be ${expected}`);
      }
    },
    toContain: (expected) => {
      if (actual && actual.includes(expected)) {
        throw new Error(`Expected ${actual} not to contain ${expected}`);
      }
    }
  }
});

// Run the test file
console.log('🚀 Starting Production Validation Tests\n');

try {
  require(testFile);
  console.log('\n✅ All tests completed');
} catch (error) {
  console.error('\n❌ Test execution failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}