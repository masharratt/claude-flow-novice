const { hello } = require('./hello');

describe('hello function', () => {
  jest.setTimeout(10000);
  test('should return greeting for default name', () => {
    expect(hello()).toBe('Hello, World!');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should return greeting for custom name', () => {
    expect(hello('Alice')).toBe('Hello, Alice!');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should handle empty string name', () => {
    expect(hello('')).toBe('Hello, !');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should handle numeric string name', () => {
    expect(hello('123')).toBe('Hello, 123!');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should handle special characters in name', () => {
    expect(hello('John Doe')).toBe('Hello, John Doe!');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});