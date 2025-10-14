# Quick Test

A simple, lightweight testing utility for quick validation of JavaScript code.

## Features

- ✅ Simple test syntax
- 🚀 Fast execution
- 📊 Clear test results
- 🔧 No dependencies
- ⚡ Supports async tests
- 🎯 Built-in assertions

## Usage

### Basic Example

```javascript
const QuickTest = require('./quick-test');

const qt = new QuickTest();

// Add tests
qt.test('Basic math', () => {
  qt.assertEqual(2 + 2, 4);
});

qt.test('String operations', () => {
  qt.assertEqual('Hello'.length, 5);
});

// Run tests
qt.run();
```

### Async Tests

```javascript
qt.test('Async operation', async () => {
  const result = await Promise.resolve('success');
  qt.assertEqual(result, 'success');
});
```

### Available Assertions

- `assert(condition, message)` - Check if condition is truthy
- `assertEqual(actual, expected, message)` - Check equality
- `assertThrows(fn, message)` - Check if function throws

## Running

```bash
# Make executable
chmod +x quick-test.js

# Run tests
./quick-test.js

# Or with npm
npm test
```

## Output

```
🚀 Running Quick Tests...

✅ Basic math
✅ String operations
✅ Async operation

📊 Test Results:
   Total: 3
   Passed: 3
   Failed: 0
🎉 All tests passed!
```

## License

MIT