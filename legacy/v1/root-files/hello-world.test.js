const helloWorld = require('./hello-world');

describe('helloWorld function', () => {
  jest.setTimeout(10000);
  test('should return "Hello, World!" when no name is provided', () => {
    expect(helloWorld()).toBe("Hello, World!");
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should return personalized greeting when name is provided', () => {
    expect(helloWorld("Alice")).toBe("Hello, Alice!");
    expect(helloWorld("Bob")).toBe("Hello, Bob!");
    expect(helloWorld("")).toBe("Hello, !");
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should handle different types of input gracefully', () => {
    expect(helloWorld(123)).toBe("Hello, 123!");
    expect(helloWorld(null)).toBe("Hello, null!");
    expect(helloWorld(undefined)).toBe("Hello, World!"); // default parameter kicks in
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should be a pure function (no side effects)', () => {
    const testName = "Test";
    const result = helloWorld(testName);
    expect(result).toBe("Hello, Test!");
    expect(testName).toBe("Test"); // original value unchanged
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});