const { hello } = require('./hello');

describe('hello function', () => {
  test('should return greeting for default name', () => {
    expect(hello()).toBe('Hello, World!');
  });

  test('should return greeting for custom name', () => {
    expect(hello('Alice')).toBe('Hello, Alice!');
  });

  test('should handle empty string name', () => {
    expect(hello('')).toBe('Hello, !');
  });

  test('should handle numeric string name', () => {
    expect(hello('123')).toBe('Hello, 123!');
  });

  test('should handle special characters in name', () => {
    expect(hello('John Doe')).toBe('Hello, John Doe!');
  });
});