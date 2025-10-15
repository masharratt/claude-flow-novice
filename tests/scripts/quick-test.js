#!/usr/bin/env node

/**
 * Quick Test - Simple testing utility
 */

class QuickTest {
  constructor() {
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log('🚀 Running Quick Tests...\n');

    for (const test of this.tests) {
      this.results.total++;
      
      try {
        await test.testFn();
        console.log(`✅ ${test.name}`);
        this.results.passed++;
      } catch (error) {
        console.log(`❌ ${test.name}`);
        console.log(`   Error: ${error.message}`);
        this.results.failed++;
      }
    }

    this.printSummary();
    return this.results;
  }

  printSummary() {
    console.log('\n📊 Test Results:');
    console.log(`   Total: ${this.results.total}`);
    console.log(`   Passed: ${this.results.passed}`);
    console.log(`   Failed: ${this.results.failed}`);
    
    if (this.results.failed === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log(`❌ ${this.results.failed} test(s) failed`);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertThrows(fn, message) {
    try {
      fn();
      throw new Error(message || 'Expected function to throw');
    } catch (error) {
      // Expected behavior
    }
  }
}

// Example usage
if (require.main === module) {
  const qt = new QuickTest();

  // Sample tests
  qt.test('Basic addition', () => {
    qt.assertEqual(2 + 2, 4, 'Addition should work');
  });

  qt.test('String concatenation', () => {
    qt.assertEqual('Hello' + ' ' + 'World', 'Hello World');
  });

  qt.test('Array operations', () => {
    const arr = [1, 2, 3];
    qt.assertEqual(arr.length, 3);
    qt.assert(arr.includes(2), 'Array should contain 2');
  });

  qt.test('Error handling', () => {
    qt.assertThrows(() => {
      throw new Error('Test error');
    }, 'Should throw error');
  });

  qt.test('Async operation', async () => {
    const result = await Promise.resolve(42);
    qt.assertEqual(result, 42, 'Promise should resolve to 42');
  });

  qt.run().catch(console.error);
}

module.exports = QuickTest;