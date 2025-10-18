/**
 * Quick test example for Claude Flow framework
 * Tests basic functionality to verify the test runner works
 */

describe('Quick Example Tests', () => {
  test('basic addition', () => {
    expect(2 + 2).toBe(4);
  });

  test('string concatenation', () => {
    expect('hello' + ' ' + 'world').toBe('hello world');
  });

  test('array operations', () => {
    const arr = [1, 2, 3];
    expect(arr.length).toBe(3);
    expect(arr.includes(2)).toBe(true);
  });

  test('object properties', () => {
    const obj = { name: 'test', value: 42 };
    expect(obj.name).toBe('test');
    expect(obj.value).toBe(42);
  });

  test('async operation', async () => {
    const result = await Promise.resolve('async result');
    expect(result).toBe('async result');
  });
});