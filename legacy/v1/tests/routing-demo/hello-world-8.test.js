/**
 * Hello World Test 8
 * Simple test demonstrating basic test structure
 */

describe('Hello World 8', () => {
  jest.setTimeout(10000);
  test('should print Hello World 8 and pass', () => {
    const message = 'Hello World 8';
    console.log(message);
    expect(message).toBe('Hello World 8');
  });

  jest.setTimeout(10000);
  test('should verify basic arithmetic', () => {
    expect(2 + 2).toBe(4);
  });
});
