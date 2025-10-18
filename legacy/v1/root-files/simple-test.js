const { hello } = require('./hello');

// Simple validation tests
console.log('Running validation tests...');

// Test 1: Default greeting
const result1 = hello();
if (result1 === 'Hello, World!') {
  console.log('✓ Test 1 passed: Default greeting');
} else {
  console.log('✗ Test 1 failed: Expected "Hello, World!", got:', result1);
}

// Test 2: Custom name
const result2 = hello('Alice');
if (result2 === 'Hello, Alice!') {
  console.log('✓ Test 2 passed: Custom name');
} else {
  console.log('✗ Test 2 failed: Expected "Hello, Alice!", got:', result2);
}

// Test 3: Empty string
const result3 = hello('');
if (result3 === 'Hello, !') {
  console.log('✓ Test 3 passed: Empty string');
} else {
  console.log('✗ Test 3 failed: Expected "Hello, !", got:', result3);
}

// Test 4: Numeric string
const result4 = hello('123');
if (result4 === 'Hello, 123!') {
  console.log('✓ Test 4 passed: Numeric string');
} else {
  console.log('✗ Test 4 failed: Expected "Hello, 123!", got:', result4);
}

// Test 5: Special characters
const result5 = hello('John Doe');
if (result5 === 'Hello, John Doe!') {
  console.log('✓ Test 5 passed: Special characters');
} else {
  console.log('✗ Test 5 failed: Expected "Hello, John Doe!", got:', result5);
}

console.log('Validation tests completed!');