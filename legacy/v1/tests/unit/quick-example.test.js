/**
 * Quick test example for Claude Flow framework
 * Tests basic functionality to verify the test runner works
 */

describe('Quick Example Tests', () => {
  jest.setTimeout(10000);
  test('basic addition', () => {
    expect(2 + 2).toBe(4);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('string concatenation', () => {
    expect('hello' + ' ' + 'world').toBe('hello world');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('array operations', () => {
    const arr = [1, 2, 3];
    expect(arr.length).toBe(3);
    expect(arr.includes(2)).toBe(true);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('object properties', () => {
    const obj = { name: 'test', value: 42 };
    expect(obj.name).toBe('test');
    expect(obj.value).toBe(42);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('async operation', async () => { try {
    const result = await Promise.resolve('async result');
    expect(result).toBe('async result');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});