const { hello } = require('../src/hello');

describe('hello function', () => {
  test('should return greeting with default name', () => {
    expect(hello()).toBe('Hello, World!');
  });

  test('should return greeting with custom name', () => {
    expect(hello('Alice')).toBe('Hello, Alice!');
    expect(hello('Bob')).toBe('Hello, Bob!');
  });

  test('should handle empty string', () => {
    expect(hello('')).toBe('Hello, !');
  });

  test('should throw TypeError for non-string input', () => {
    expect(() => hello(123)).toThrow(TypeError);
    expect(() => hello(null)).toThrow(TypeError);
    expect(() => hello(undefined)).toThrow(TypeError);
    expect(() => hello({})).toThrow(TypeError);
    expect(() => hello([])).toThrow(TypeError);
  });

  test('should handle special characters', () => {
    expect(hello('!')).toBe('Hello, !');
    expect(hello('@#$')).toBe('Hello, @#$!');
  });

  test('should handle long strings', () => {
    const longName = 'A'.repeat(1000);
    expect(hello(longName)).toBe(`Hello, ${longName}!`);
  });
});