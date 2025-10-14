#!/usr/bin/env node

/**
 * Example usage of Quick Test utility
 */

const QuickTest = require('./quick-test');

const qt = new QuickTest();

// Test basic functionality
qt.test('Calculator addition', () => {
  function add(a, b) {
    return a + b;
  }
  qt.assertEqual(add(5, 3), 8);
  qt.assertEqual(add(-1, 1), 0);
});

qt.test('Calculator multiplication', () => {
  function multiply(a, b) {
    return a * b;
  }
  qt.assertEqual(multiply(4, 5), 20);
  qt.assertEqual(multiply(0, 10), 0);
});

qt.test('Array helper functions', () => {
  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }
  
  qt.assertEqual(sum([1, 2, 3]), 6);
  qt.assertEqual(sum([]), 0);
  qt.assert(sum([10, -5, 5]) === 10);
});

qt.test('String validation', () => {
  function isValidEmail(email) {
    return email.includes('@') && email.includes('.');
  }
  
  qt.assert(isValidEmail('test@example.com'));
  qt.assert(!isValidEmail('invalid-email'));
  qt.assert(!isValidEmail('test@invalid'));
});

qt.test('Async data fetching', async () => {
  function fetchData() {
    return new Promise(resolve => {
      setTimeout(() => resolve({ data: 'success' }), 10);
    });
  }
  
  const result = await fetchData();
  qt.assertEqual(result.data, 'success');
});

qt.test('Error handling', () => {
  function divide(a, b) {
    if (b === 0) {
      throw new Error('Division by zero');
    }
    return a / b;
  }
  
  qt.assertEqual(divide(10, 2), 5);
  qt.assertThrows(() => divide(10, 0), 'Should throw on division by zero');
});

// Run all tests
qt.run().then(results => {
  if (results.failed === 0) {
    console.log('\n🎯 All example tests completed successfully!');
  }
}).catch(console.error);