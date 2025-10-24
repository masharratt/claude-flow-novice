const { hello } = require('../src/hello');

describe('hello function', () => {
  jest.setTimeout(10000);
  test('should return greeting with default name', () => {
    expect(hello()).toBe('Hello, World!');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should return greeting with custom name', () => {
    expect(hello('Alice')).toBe('Hello, Alice!');
    expect(hello('Bob')).toBe('Hello, Bob!');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should handle empty string', () => {
    expect(hello('')).toBe('Hello, !');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should throw TypeError for non-string input', () => {
    expect(() => hello(123)).toThrow(TypeError);
    expect(() => hello(null)).toThrow(TypeError);
    expect(() => hello(undefined)).toThrow(TypeError);
    expect(() => hello({})).toThrow(TypeError);
    expect(() => hello([])).toThrow(TypeError);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should handle special characters', () => {
    expect(hello('!')).toBe('Hello, !');
    expect(hello('@#$')).toBe('Hello, @#$!');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should handle long strings', () => {
    const longName = 'A'.repeat(1000);
    expect(hello(longName)).toBe(`Hello, ${longName}!`);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});