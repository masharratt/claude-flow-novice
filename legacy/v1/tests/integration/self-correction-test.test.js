// Tests for self-correction-test.js
const { safeCode, processData } = require('./self-correction-test');

describe('safeCode', () => {
  test('should parse valid JSON string', () => {
    const result = safeCode('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  test('should return non-string input as-is', () => {
    const input = { key: 'value' };
    const result = safeCode(input);
    expect(result).toEqual(input);
  });

  test('should throw error for invalid JSON', () => {
    expect(() => safeCode('invalid json')).toThrow('Invalid input');
  });
});

describe('processData', () => {
  test('should parse valid JSON data', () => {
    const result = processData('{"name": "test"}');
    expect(result).toEqual({ name: 'test' });
  });

  test('should throw error for invalid JSON', () => {
    expect(() => processData('invalid')).toThrow('Failed to parse data');
  });

  test('should handle complex JSON objects', () => {
    const data = '{"users": [{"id": 1, "name": "Alice"}]}';
    const result = processData(data);
    expect(result).toEqual({ users: [{ id: 1, name: 'Alice' }] });
  });
});
