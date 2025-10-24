/**
 * Tests for utils.js
 */

import { jest } from '@jest/globals';
import {
  parseFlags,
  formatBytes,
  truncateString,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  validateArgs,
  generateId,
  retry,
  sleep,
  chunk,
  isValidJson,
  isValidUrl,
  formatTimestamp,
} from '../utils.js';

// Mock console for testing output functions
let consoleLogSpy;
let consoleErrorSpy;

beforeEach(() => {
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

describe('Utils', () => {
  describe('parseFlags', () => {
    jest.setTimeout(10000);
  test('should parse boolean flags', () => {
      const result = parseFlags(['--verbose', '--force']);
      expect(result.flags).toEqual({ verbose: true, force: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(result.args).toEqual([]);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should parse value flags', () => {
      const result = parseFlags(['--port', '8080', '--name', 'test']);
      expect(result.flags).toEqual({ port: '8080', name: 'test' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(result.args).toEqual([]);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should parse mixed flags and arguments', () => {
      const result = parseFlags(['arg1', '--flag', 'value', 'arg2', '--bool']);
      expect(result.flags).toEqual({ flag: 'value', bool: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(result.args).toEqual(['arg1', 'arg2']);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle short flags', () => {
      const result = parseFlags(['-vf', '--port', '8080']);
      expect(result.flags).toEqual({ v: true, f: true, port: '8080' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(result.args).toEqual([]);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle empty input', () => {
      const result = parseFlags([]);
      expect(result.flags).toEqual({} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(result.args).toEqual([]);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('formatBytes', () => {
    jest.setTimeout(10000);
  test('should format bytes to human readable', () => {
      expect(formatBytes(0)).toBe('0.00 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1048576)).toBe('1.00 MB');
      expect(formatBytes(1073741824)).toBe('1.00 GB');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle large numbers', () => {
      expect(formatBytes(2048)).toBe('2.00 KB');
      expect(formatBytes(1536)).toBe('1.50 KB');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('truncateString', () => {
    jest.setTimeout(10000);
  test('should truncate long strings', () => {
      expect(truncateString('Hello World', 5)).toBe('Hello...');
      expect(truncateString('Short', 10)).toBe('Short');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle empty string', () => {
      expect(truncateString('', 5)).toBe('');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should use default length', () => {
      const longString = 'a'.repeat(150);
      const result = truncateString(longString);
      expect(result).toBe('a'.repeat(100) + '...');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('print functions', () => {
    jest.setTimeout(10000);
  test('printSuccess should log success message', () => {
      printSuccess('Test message');
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Test message');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('printError should log error message', () => {
      printError('Error message');
      expect(consoleLogSpy).toHaveBeenCalledWith('❌ Error message');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('printWarning should log warning message', () => {
      printWarning('Warning message');
      expect(consoleLogSpy).toHaveBeenCalledWith('⚠️  Warning message');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('printInfo should log info message', () => {
      printInfo('Info message');
      expect(consoleLogSpy).toHaveBeenCalledWith('ℹ️  Info message');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('validateArgs', () => {
    jest.setTimeout(10000);
  test('should return true for valid arguments', () => {
      const result = validateArgs(['arg1', 'arg2'], 2, 'command <arg1> <arg2>');
      expect(result).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return false and print error for insufficient arguments', () => {
      const result = validateArgs(['arg1'], 2, 'command <arg1> <arg2>');
      expect(result).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledWith('❌ Usage: command <arg1> <arg2>');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('generateId', () => {
    jest.setTimeout(10000);
  test('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(0);
      expect(typeof id1).toBe('string');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should generate ID with prefix', () => {
      const id = generateId('user');
      expect(id).toMatch(/^user-\d+-[a-z0-9]+$/);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('retry', () => {
    jest.setTimeout(10000);
  test('should retry on failure', async () => { try {
      let attempts = 0;
      const fn = jest.fn(async () => { try {
        attempts++;
        if (attempts < 3) throw new Error('Failed');
        return 'success';
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const result = await retry(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should fail after max retries', async () => { try {
      const fn = jest.fn(async () => { try {
        throw new Error('Always fails');
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await expect(retry(fn, 2, 10)).rejects.toThrow('Always fails');
      expect(fn).toHaveBeenCalledTimes(2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('sleep', () => {
    jest.setTimeout(10000);
  test('should delay execution', async () => { try {
      const start = Date.now();
      await sleep(50);
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(45); // Allow some margin
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('chunk', () => {
    jest.setTimeout(10000);
  test('should split array into chunks', () => {
      const array = [1, 2, 3, 4, 5, 6, 7];
      const result = chunk(array, 3);

      expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle empty array', () => {
      const result = chunk([], 3);
      expect(result).toEqual([]);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle chunk size larger than array', () => {
      const result = chunk([1, 2], 5);
      expect(result).toEqual([[1, 2]]);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('isValidJson', () => {
    jest.setTimeout(10000);
  test('should validate correct JSON', () => {
      expect(isValidJson('{"key":"value"}')).toBe(true);
      expect(isValidJson('[1,2,3]')).toBe(true);
      expect(isValidJson('"string"')).toBe(true);
      expect(isValidJson('123')).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should reject invalid JSON', () => {
      expect(isValidJson('{"key":}')).toBe(false);
      expect(isValidJson('invalid')).toBe(false);
      expect(isValidJson('')).toBe(false);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('isValidUrl', () => {
    jest.setTimeout(10000);
  test('should validate correct URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:8080')).toBe(true);
      expect(isValidUrl('ftp://files.example.com')).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should reject invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('formatTimestamp', () => {
    jest.setTimeout(10000);
  test('should format timestamp to readable string', () => {
      const timestamp = 1234567890000; // Fixed timestamp
      const result = formatTimestamp(timestamp);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle current timestamp', () => {
      const now = Date.now();
      const result = formatTimestamp(now);

      expect(typeof result).toBe('string');
      expect(result).toContain('2025'); // Should contain current year
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
